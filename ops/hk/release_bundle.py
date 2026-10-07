"""Validate release archives before they can change a running version."""
from dataclasses import dataclass
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import tarfile

MAX_TOTAL = 2 * 1024**3
MAX_FILES = 20_000


@dataclass(frozen=True)
class Manifest:
    sha: str
    image_tag: str
    files: dict
    archive_sha256: str
    generation: int = 0


def _name(name):
    if (not isinstance(name, str) or '\\' in name or any(ord(c) < 32 for c in name)
            or name.startswith('/') or any(p in ('', '.', '..') for p in name.split('/'))):
        raise ValueError('unsafe release path')
    if name not in ('manifest.json', 'backend-image.tar') and not name.startswith('frontend/'):
        raise ValueError('unexpected release path')
    if any(part.startswith('.') for part in PurePosixPath(name).parts):
        raise ValueError('hidden release path')
    return name


def _object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('duplicate manifest key')
        result[key] = value
    return result


def _digest(stream):
    digest = hashlib.sha256()
    total = 0
    while chunk := stream.read(1024 * 1024):
        total += len(chunk)
        if total > MAX_TOTAL:
            raise ValueError('release archive exceeds size budget')
        digest.update(chunk)
    return digest.hexdigest(), total


def verify_bundle(path: Path, expected_sha: str) -> Manifest:
    if not re.fullmatch('[a-f0-9]{40}', expected_sha):
        raise ValueError('invalid release SHA')
    if path.is_symlink() or not path.is_file():
        raise ValueError('release must be a regular archive')
    try:
        with path.open('rb') as source:
            outer, _ = _digest(source)
            source.seek(0)
            observed = {}
            document = None
            total = 0
            with tarfile.open(fileobj=source, mode='r:gz') as archive:
                for member in archive:
                    name = _name(member.name)
                    if name in observed or not member.isfile() or member.pax_headers:
                        raise ValueError('duplicate, linked or special release entry')
                    if member.size < 0:
                        raise ValueError('invalid release size')
                    total += member.size
                    if total > MAX_TOTAL or len(observed) >= MAX_FILES:
                        raise ValueError('release exceeds size budget')
                    stream = archive.extractfile(member)
                    if name == 'manifest.json':
                        if member.size > 1024**2:
                            raise ValueError('oversized manifest')
                        data = stream.read()
                        document = json.loads(data, object_pairs_hook=_object)
                        digest, length = hashlib.sha256(data).hexdigest(), len(data)
                    else:
                        digest, length = _digest(stream)
                    if length != member.size:
                        raise ValueError('incomplete release entry')
                    observed[name] = {'size': length, 'sha256': digest}
            if not isinstance(document, dict) or document.get('version') != 1:
                raise ValueError('invalid release manifest')
            if document.get('sha') != expected_sha or document.get('image_tag') != 'insong-backend:' + expected_sha:
                raise ValueError('release revision does not match')
            generation = document.get('generation', 0)
            if type(generation) is not int or generation < 0:
                raise ValueError('invalid publication generation')
            expected = document.get('files')
            if not isinstance(expected, dict) or not expected:
                raise ValueError('missing release files')
            for name, entry in expected.items():
                _name(name)
                if (name == 'manifest.json' or not isinstance(entry, dict)
                        or type(entry.get('size')) is not int or entry['size'] < 0
                        or not re.fullmatch('[a-f0-9]{64}', str(entry.get('sha256', '')))):
                    raise ValueError('invalid release file description')
            actual = {n: v for n, v in observed.items() if n != 'manifest.json'}
            if actual != expected or 'backend-image.tar' not in actual or 'frontend/index.html' not in actual:
                raise ValueError('release content does not match manifest')
            source.seek(0)
            if _digest(source)[0] != outer:
                raise ValueError('release changed during verification')
            return Manifest(expected_sha, document['image_tag'], expected, outer, generation)
    except (tarfile.TarError, EOFError, OSError, json.JSONDecodeError, UnicodeError) as error:
        raise ValueError('release archive is invalid') from error


def extract_verified(path: Path, manifest: Manifest, target: Path):
    checked = verify_bundle(path, manifest.sha)
    if checked != manifest:
        raise ValueError('release changed since verification')
    if target.exists() or target.is_symlink() or target.parent.resolve() != target.parent.absolute():
        raise ValueError('extraction target must be new and owned')
    target.mkdir(mode=0o755)
    # The deployer snapshots incoming data into a root-owned directory first.
    # Revalidate every entry while writing only exclusive regular files.
    with tarfile.open(path, 'r:gz') as archive:
        for member in archive:
            name = _name(member.name)
            if not member.isfile() or member.pax_headers:
                raise ValueError('unsafe extraction entry')
            if name == 'manifest.json':
                continue
            if name not in checked.files:
                raise ValueError('unverified extraction entry')
            destination = target.joinpath(*PurePosixPath(name).parts)
            destination.parent.mkdir(parents=True, exist_ok=True, mode=0o755)
            if destination.parent.resolve() != destination.parent.absolute():
                raise ValueError('linked extraction directory')
            stream = archive.extractfile(member)
            digest = hashlib.sha256()
            length = 0
            flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, 'O_NOFOLLOW', 0)
            with os.fdopen(os.open(destination, flags, 0o644), 'wb') as output:
                while chunk := stream.read(1024 * 1024):
                    length += len(chunk)
                    if length > checked.files[name]['size']:
                        raise ValueError('extraction entry grew')
                    digest.update(chunk)
                    output.write(chunk)
            if {'size': length, 'sha256': digest.hexdigest()} != checked.files[name]:
                raise ValueError('extraction content changed')
    (target / 'manifest.json').write_text(json.dumps({'sha': checked.sha, 'image_tag': checked.image_tag,
                                                    'files': checked.files, 'archive_sha256': checked.archive_sha256,
                                                    'generation': checked.generation}), encoding='utf-8')
