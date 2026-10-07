"""Package the checked commit and publish through the restricted SSH gateway."""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import re
import subprocess
import tarfile
import tempfile

try:
    from .release_bundle import verify_bundle, MAX_TOTAL, MAX_FILES
except ImportError:
    from release_bundle import verify_bundle, MAX_TOTAL, MAX_FILES


def can_deploy(context):
    return (context.get('repository') == 'EthanLyu30/insong'
            and context.get('ref') == 'refs/heads/main'
            and context.get('event') == 'push'
            and context.get('ci_complete') is True
            and context.get('enabled') is True
            and isinstance(context.get('sha'), str)
            and re.fullmatch('[a-f0-9]{40}', context['sha']) is not None
            and context.get('checkout_sha') == context['sha'])


def _files(root):
    if root.is_symlink() or not root.is_dir():
        raise ValueError('frontend must be a regular directory')
    result = []
    for file in sorted(root.rglob('*')):
        if file.is_symlink():
            raise ValueError('linked build output')
        if file.is_file():
            if any(p.startswith('.') for p in file.relative_to(root).parts):
                raise ValueError('hidden build output')
            result.append(file)
    if len(result) > MAX_FILES-2:
        raise ValueError('too many build files')
    return result


def _entry(file):
    with file.open('rb') as stream:
        return {'size': file.stat().st_size, 'sha256': hashlib.file_digest(stream, 'sha256').hexdigest()}


def tree_digest(root):
    document = {p.relative_to(root).as_posix(): _entry(p) for p in _files(root)}
    return hashlib.sha256(json.dumps(document, sort_keys=True, separators=(',', ':')).encode()).hexdigest()


def create_bundle(frontend, image, sha, output):
    if not re.fullmatch('[a-f0-9]{40}', sha):
        raise ValueError('invalid revision')
    if image.is_symlink() or not image.is_file():
        raise ValueError('image must be regular')
    files = {'frontend/'+p.relative_to(frontend).as_posix(): p for p in _files(frontend)}
    files['backend-image.tar'] = image
    entries = {name: _entry(file) for name, file in files.items()}
    if sum(e['size'] for e in entries.values()) > MAX_TOTAL-1024**2:
        raise ValueError('release too large')
    manifest = json.dumps({'version': 1, 'sha': sha, 'image_tag': 'insong-backend:'+sha,
                           'files': entries}, sort_keys=True).encode()
    with tarfile.open(output, 'w:gz', format=tarfile.USTAR_FORMAT, compresslevel=1) as archive:
        member = tarfile.TarInfo('manifest.json'); member.size = len(manifest)
        archive.addfile(member, io.BytesIO(manifest))
        for name, file in files.items():
            member = tarfile.TarInfo(name); member.size = entries[name]['size']; member.mode = 0o644
            with file.open('rb') as stream:
                archive.addfile(member, stream)
    verify_bundle(output, sha)


def publish(bundle, sha):
    host, user = os.environ['HK_HOST'], os.environ['HK_USER']
    if not re.fullmatch(r'[a-zA-Z0-9.-]+', host) or not re.fullmatch(r'[a-z_][a-z0-9_-]*', user):
        raise ValueError('invalid SSH destination')
    verify_bundle(bundle, sha)
    with tempfile.TemporaryDirectory(prefix='insong-publish-') as temporary:
        root = Path(temporary); root.chmod(0o700)
        key = root/'identity'; known = root/'known_hosts'
        for path, value in ((key, os.environ['HK_SSH_PRIVATE_KEY']), (known, os.environ['HK_SSH_KNOWN_HOSTS'])):
            with path.open('w', encoding='utf-8') as stream:
                stream.write(value.rstrip()+'\n')
            path.chmod(0o600)
        options = ['-i', str(key), '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes',
                   '-o', 'StrictHostKeyChecking=yes', '-o', 'UserKnownHostsFile='+str(known),
                   '-o', 'ConnectTimeout=20', '-o', 'ServerAliveInterval=30',
                   '-o', 'ServerAliveCountMax=6']
        subprocess.run(['scp', '-O', *options, str(bundle), f'{user}@{host}:/opt/insong/incoming/{sha}.tar.gz'], check=True)
        subprocess.run(['ssh', *options, f'{user}@{host}', 'deploy '+sha], check=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['digest', 'bundle', 'publish'])
    parser.add_argument('--frontend', type=Path, default=Path('frontend/dist'))
    parser.add_argument('--image', type=Path, default=Path('backend-image.tar'))
    parser.add_argument('--output', type=Path, default=Path('release.tar.gz'))
    args = parser.parse_args()
    if args.action == 'digest':
        print(tree_digest(args.frontend))
    else:
        sha = os.environ.get('GITHUB_SHA', '')
        checkout = subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip()
        context = {'repository': os.environ.get('GITHUB_REPOSITORY'), 'ref': os.environ.get('GITHUB_REF'),
                   'event': os.environ.get('GITHUB_EVENT_NAME'), 'sha': sha, 'checkout_sha': checkout,
                   'ci_complete': os.environ.get('HK_CI_COMPLETE') == 'true',
                   'enabled': os.environ.get('HK_DEPLOY_ENABLED') == 'true'}
        if not can_deploy(context):
            raise SystemExit('this event cannot publish')
        if args.action == 'bundle':
            create_bundle(args.frontend, args.image, sha, args.output)
        else:
            publish(args.output, sha)
