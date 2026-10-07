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
    try:
        fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    except FileExistsError:
        raise RuntimeError('another deployment holds the lock') from None
    try:
        os.write(fd, str(os.getpid()).encode())
        yield
    finally:
        os.close(fd)
        path.unlink()


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
                  'archive_sha256': manifest.archive_sha256}:
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


def deploy_release(bundle: Path, expected_sha: str, root: Path, *, runtime=None) -> ReleaseReceipt:
    root = _owned(root)
    runtime = runtime or Runtime(root)
    # Incoming belongs to the upload account. Snapshot it into root-owned state
    # before verification so that account cannot alter the checked archive.
    snapshot = None
    try:
        if bundle.is_symlink() or not bundle.is_file():
            raise ValueError('incoming must be a regular archive')
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
                runtime.load_image(release / 'backend-image.tar', manifest.image_tag, expected_sha)
                started = True
                runtime.start(slot, manifest.image_tag)
                if not runtime.ready(slot):
                    raise RuntimeError('candidate failed readiness checks')
                runtime.validate_proxy(config)
                runtime.reload_proxy(config)
                activated = True
                state = {'sha': expected_sha, 'slot': slot, 'port': port}
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
                raise
            if previous:
                try:
                    runtime.stop(previous['slot'])
                except RuntimeError:
                    # Current is committed and healthy; retain the old process
                    # for operator cleanup rather than report a failed publish.
                    print('warning: previous slot cleanup requires attention')
            prune_releases(root, expected_sha, previous['sha'] if previous else None)
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
