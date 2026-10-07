"""Stage a verified image and frontend before updating the live pointer."""
from contextlib import contextmanager
from dataclasses import dataclass
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import time
import urllib.request

try:
    from .bootstrap import MARKER, render_nginx
    from .release_bundle import verify_bundle, extract_verified, MAX_TOTAL
except ImportError:
    from bootstrap import MARKER, render_nginx
    from release_bundle import verify_bundle, extract_verified, MAX_TOTAL


@dataclass(frozen=True)
class ReleaseReceipt:
    sha: str
    slot: str
    port: int


def _atomic(path, value):
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as stream:
        temporary = Path(stream.name)
        stream.write(value)
        stream.flush()
        os.fsync(stream.fileno())
    try:
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


@contextmanager
def _lock(path):
    fd = os.open(path, os.O_CREAT | os.O_RDWR | getattr(os,'O_NOFOLLOW',0), 0o600)
    try:
        if os.fstat(fd).st_nlink != 1: raise ValueError('linked deployment lock')
        if os.name == 'nt':
            import msvcrt
            if os.fstat(fd).st_size == 0: os.write(fd,b'0')
            os.lseek(fd,0,os.SEEK_SET)
            try: msvcrt.locking(fd,msvcrt.LK_NBLCK,1)
            except OSError: raise RuntimeError('another deployment holds the lock') from None
        else:
            import fcntl
            try: fcntl.flock(fd,fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError: raise RuntimeError('another deployment holds the lock') from None
        yield
    finally:
        os.close(fd)


def _owned(root):
    root = root.absolute()
    if root.resolve() != root or (root / '.insong-owned').is_symlink():
        raise ValueError('linked runtime root')
    if (root / '.insong-owned').read_text().strip() != MARKER:
        raise ValueError('unowned runtime root')
    for directory in ('state', 'releases', 'shared'):
        if (root / directory).is_symlink() or not (root / directory).is_dir():
            raise ValueError('unowned runtime directory')
    return root


def _current(root):
    path = root / 'state/current.json'
    if not path.exists():
        return None
    if path.is_symlink():
        raise ValueError('linked current pointer')
    state = json.loads(path.read_text())
    if (not re.fullmatch('[a-f0-9]{40}', state.get('sha', ''))
            or state.get('slot') not in ('blue', 'green')
            or state.get('port') != (18001 if state['slot'] == 'blue' else 18002)):
        raise ValueError('invalid current pointer')
    return state


def _share(source, destination):
    if not source.exists():
        return
    if source.is_symlink() or destination.is_symlink():
        raise ValueError('linked static directory')
    destination.mkdir(parents=True, exist_ok=True, mode=0o755)
    for file in source.rglob('*'):
        if file.is_symlink():
            raise ValueError('linked static resource')
        if not file.is_file():
            continue
        target = destination / file.relative_to(source)
        if target.exists():
            if target.is_symlink() or hashlib.sha256(target.read_bytes()).digest() != hashlib.sha256(file.read_bytes()).digest():
                raise ValueError('existing fingerprint resource differs')
        else:
            target.parent.mkdir(parents=True, exist_ok=True, mode=0o755)
            with target.open('xb') as stream:
                stream.write(file.read_bytes())
            target.chmod(0o644)


def _reuse_verified(release, manifest):
    if release.is_symlink() or not (release / 'manifest.json').is_file():
        raise ValueError('existing candidate is not owned')
    stored = json.loads((release / 'manifest.json').read_text())
    if stored != {'sha': manifest.sha, 'image_tag': manifest.image_tag, 'files': manifest.files,
                  'archive_sha256': manifest.archive_sha256, 'generation':manifest.generation}:
        raise ValueError('existing candidate differs')
    found = set()
    for file in release.rglob('*'):
        if file.is_symlink():
            raise ValueError('linked candidate')
        if file.is_file() and file.name != 'manifest.json':
            name = file.relative_to(release).as_posix()
            found.add(name)
            if name not in manifest.files or file.stat().st_nlink != 1:
                raise ValueError('unexpected candidate file')
            with file.open('rb') as stream:
                digest = hashlib.file_digest(stream, 'sha256').hexdigest()
            if {'size': file.stat().st_size, 'sha256': digest} != manifest.files[name]:
                raise ValueError('candidate content differs')
    if found != set(manifest.files):
        raise ValueError('candidate is incomplete')


def prune_releases(root, current, previous):
    """Remove only marked releases, never linked or unknown directories."""
    parent = _owned(root) / 'releases'
    candidates = []
    for directory in parent.iterdir():
        if not re.fullmatch('[a-f0-9]{40}', directory.name) or not directory.is_dir():
            continue
        if directory.is_symlink() or directory.resolve().parent != parent:
            continue
        marker = directory / 'manifest.json'
        if marker.is_symlink() or not marker.is_file():
            continue
        try:
            if json.loads(marker.read_text()).get('sha') != directory.name:
                continue
        except (ValueError, OSError):
            continue
        if any(p.is_symlink() for p in directory.rglob('*')):
            continue
        candidates.append(directory)
    keep = {current, previous}
    extra = sorted((p for p in candidates if p.name not in keep),
                   key=lambda p: p.stat().st_mtime_ns, reverse=True)
    keep.update(p.name for p in extra[:max(0, 3-len(keep-{None}))])
    for directory in candidates:
        if directory.name not in keep:
            shutil.rmtree(directory)
    return keep-{None}


def prune_incoming(root, keep):
    incoming=_owned(root)/'incoming'
    if not incoming.exists(): return
    if incoming.is_symlink() or incoming.resolve().parent != root:
        raise ValueError('linked incoming directory')
    files=[p for p in incoming.iterdir() if re.fullmatch('[a-f0-9]{40}\\.tar\\.gz',p.name)
           and p.is_file() and not p.is_symlink() and p.stat().st_nlink==1]
    keep=set(keep)
    extra=sorted((p for p in files if p.name[:-7] not in keep),key=lambda p:p.stat().st_mtime_ns,reverse=True)
    keep.update(p.name[:-7] for p in extra[:max(0,3-len(keep))])
    for file in files:
        if file.name[:-7] not in keep: file.unlink()


def _budget(root, additional=0):
    if shutil.disk_usage(root).free < 5*1024**3+additional:
        raise RuntimeError('insufficient free space; database reserve protected')


def deploy_release(bundle: Path, expected_sha: str, root: Path, *, runtime=None) -> ReleaseReceipt:
    root = _owned(root)
    runtime = runtime or Runtime(root)
    # Incoming belongs to the upload account. Snapshot it into root-owned state
    # before verification so that account cannot alter the checked archive.
    snapshot = None
    try:
        if bundle.is_symlink() or not bundle.is_file():
            raise ValueError('incoming must be a regular archive')
        _budget(root,bundle.stat().st_size)
        with tempfile.NamedTemporaryFile(dir=root / 'state', suffix='.tar.gz', delete=False) as stream:
            snapshot = Path(stream.name)
            with bundle.open('rb') as incoming:
                size = 0
                while chunk := incoming.read(1024 * 1024):
                    size += len(chunk)
                    if size > MAX_TOTAL:
                        raise ValueError('incoming release is too large')
                    stream.write(chunk)
        manifest = verify_bundle(snapshot, expected_sha)
        with _lock(root / 'state/deploy.lock'):
            previous = _current(root)
            if previous and previous['sha'] == expected_sha:
                return ReleaseReceipt(expected_sha, previous['slot'], previous['port'])
            if previous and previous.get('generation',0)>0 and manifest.generation<=previous['generation']:
                raise ValueError('older publication generation is not allowed')
            _budget(root,sum(entry['size'] for entry in manifest.files.values())*2)
            slot = 'green' if previous and previous['slot'] == 'blue' else 'blue'
            port = 18002 if slot == 'green' else 18001
            release = root / 'releases' / expected_sha
            if release.exists():
                _reuse_verified(release, manifest)
            else:
                extract_verified(snapshot, manifest, release)
            _share(release / 'frontend/assets', root / 'shared/assets')
            _share(release / 'frontend/fonts/chunks', root / 'shared/font-chunks')
            config = root / 'state' / ('candidate-' + expected_sha + '.conf')
            _atomic(config, render_nginx(root, expected_sha, port).encode())
            started = False
            activated = False
            try:
                if hasattr(runtime,'prepare_slot') and not runtime.prepare_slot(slot):
                    raise RuntimeError('previous requests have not drained')
                runtime.load_image(release / 'backend-image.tar', manifest.image_tag, expected_sha)
                started = True
                runtime.start(slot, manifest.image_tag)
                if not runtime.ready(slot):
                    raise RuntimeError('candidate failed readiness checks')
                runtime.validate_proxy(config)
                runtime.reload_proxy(config)
                activated = True
                state = {'sha': expected_sha, 'slot': slot, 'port': port,'generation':manifest.generation}
                if previous:
                    _atomic(root / 'state/previous.json', json.dumps(previous).encode())
                _atomic(root / 'state/current.json', json.dumps(state).encode())
            except Exception:
                try:
                    if activated and hasattr(runtime, 'restore_proxy'):
                        runtime.restore_proxy()
                finally:
                    if started:
                        runtime.stop(slot)
                    keep=prune_releases(root,previous['sha'] if previous else None,None)
                    prune_incoming(root,keep)
                    if hasattr(runtime,'prune_images'): runtime.prune_images(keep)
                raise
            if previous:
                try:
                    if not hasattr(runtime,'retire_slot') or runtime.retire_slot(previous['slot']):
                        runtime.stop(previous['slot'])
                    else:
                        print('warning: old requests still draining; previous backend retained')
                except RuntimeError:
                    # Current is committed and healthy; retain the old process
                    # for operator cleanup rather than report a failed publish.
                    print('warning: previous slot cleanup requires attention')
            keep=prune_releases(root, expected_sha, previous['sha'] if previous else None)
            prune_incoming(root,keep)
            if hasattr(runtime,'prune_images'): runtime.prune_images(keep)
            return ReleaseReceipt(expected_sha, slot, port)
    finally:
        if snapshot is not None:
            snapshot.unlink(missing_ok=True)


class Runtime:
    def __init__(self, root):
        self.root = root
        self.compose = ['docker', 'compose', '-f', str(root / 'ops/compose.yaml')]
        self.image = None
        self.previous_proxy = None
        self.previous_workers=[]
        self.master_pidfile=Path('/run/nginx.pid')
    def _run(self, args, *, env=None):
        result = subprocess.run(args, env=env, capture_output=True)
        if result.returncode:
            raise RuntimeError('runtime command failed; private output suppressed')
        return result.stdout
    def load_image(self, archive, tag, sha):
        self._run(['docker', 'load', '-i', str(archive)])
        actual = self._run(['docker', 'image', 'inspect', '--format', '{{index .Config.Labels "org.opencontainers.image.revision"}}', tag]).decode().strip()
        if actual != sha:
            raise ValueError('loaded image revision does not match')
        self.image = tag
    def start(self, slot, tag):
        self._run(self.compose + ['up', '-d', slot], env=dict(os.environ, APP_IMAGE=tag))
    def ready(self, slot):
        port = 18001 if slot == 'blue' else 18002
        base = 'http://127.0.0.1:' + str(port)
        client = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        deadline = time.monotonic() + 150
        while time.monotonic() < deadline:
            try:
                with client.open(base + '/api/health', timeout=5) as response:
                    assert response.status == 200
                data = json.dumps({'query': '演唱会结束后，还舍不得回家', 'mode': 'semantic'}).encode()
                request = urllib.request.Request(base + '/api/stories/search', data=data,
                                                headers={'Content-Type': 'application/json', 'Origin': 'https://insong.me'})
                with client.open(request, timeout=30) as response:
                    if json.load(response).get('mode') == 'semantic':
                        return True
            except Exception:
                pass
            time.sleep(2)
        return False
    def validate_proxy(self, config):
        full = self.root / 'state/nginx-validation.conf'
        _atomic(full, ('events {}\nhttp {\ninclude /etc/nginx/mime.types;\n' + config.read_text() + '\n}\n').encode())
        self._run(['nginx', '-t', '-c', str(full)])
    def reload_proxy(self, config):
        target = Path('/etc/nginx/conf.d/insong.conf')
        if target.exists() and not target.read_text().startswith('# insong-managed-v1\n'):
            raise ValueError('existing proxy is not owned by insong')
        self.previous_proxy = target.read_bytes() if target.exists() else None
        self.previous_workers=self._workers()
        _atomic(target, b'# insong-managed-v1\n' + config.read_bytes())
        try:
            self._run(['nginx', '-t'])
            self._run(['systemctl', 'reload', 'nginx'])
        except Exception:
            self.restore_proxy()
            raise
    def restore_proxy(self):
        target = Path('/etc/nginx/conf.d/insong.conf')
        if self.previous_proxy is None:
            if target.exists() and target.read_text().startswith('# insong-managed-v1\n'):
                target.unlink()
        else:
            _atomic(target, self.previous_proxy)
        self._run(['nginx', '-t'])
        self._run(['systemctl', 'reload', 'nginx'])
    def stop(self, slot):
        self._run(self.compose + ['stop', slot], env=dict(os.environ, APP_IMAGE=self.image or 'insong-backend:bootstrap'))

    def _workers(self):
        try:
            master=int(self.master_pidfile.read_text())
            children=Path(f'/proc/{master}/task/{master}/children').read_text().split()
            return [{'pid':int(pid),'start':self._start(pid)} for pid in children if self._start(pid)]
        except (OSError,ValueError): return []
    def _start(self,pid):
        try: return Path(f'/proc/{pid}/stat').read_text().rsplit(')',1)[1].split()[19]
        except (OSError,IndexError): return None
    def _drained(self,workers):
        deadline=time.monotonic()+60
        while time.monotonic()<deadline:
            if all(self._start(w['pid'])!=w['start'] for w in workers): return True
            time.sleep(.2)
        return False
    def prepare_slot(self,slot):
        marker=self.root/'state'/('retired-'+slot+'.json')
        if not marker.exists(): return True
        if marker.is_symlink(): raise ValueError('linked drain marker')
        if not self._drained(json.loads(marker.read_text())): return False
        marker.unlink()
        return True
    def retire_slot(self,slot):
        marker=self.root/'state'/('retired-'+slot+'.json')
        _atomic(marker,json.dumps(self.previous_workers).encode())
        return self._drained(self.previous_workers)
    def prune_images(self,keep):
        running=self._run(['docker','ps','--filter','label=com.docker.compose.project=insong-hk',
                           '--format','{{.Image}}']).decode().splitlines()
        tags=self._run(['docker','image','ls','insong-backend','--format','{{.Repository}}:{{.Tag}}']).decode().splitlines()
        for tag in tags:
            if not re.fullmatch('insong-backend:[a-f0-9]{40}',tag) or tag in running or tag.split(':')[1] in keep:
                continue
            # Exact repository + matching revision label proves task ownership.
            revision=self._run(['docker','image','inspect','--format',
                               '{{index .Config.Labels "org.opencontainers.image.revision"}}',tag]).decode().strip()
            if revision==tag.split(':')[1]:
                subprocess.run(['docker','image','rm',tag],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('sha')
    args = parser.parse_args()
    if not re.fullmatch('[a-f0-9]{40}', args.sha):
        parser.error('invalid revision')
    root = Path('/opt/insong')
    receipt = deploy_release(root / 'incoming' / (args.sha + '.tar.gz'), args.sha, root)
    print(json.dumps({'sha': receipt.sha, 'slot': receipt.slot, 'port': receipt.port}))
