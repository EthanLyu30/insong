import hashlib
from io import BytesIO
import json
from pathlib import Path
import tarfile

import pytest

from ops.hk.release_bundle import verify_bundle, extract_verified

SHA = 'a' * 40


def make_bundle(path, *, extra=None, wrong_hash=False, sha=SHA, generation=0):
    files = {'backend-image.tar': b'qa-image', 'frontend/index.html': b'qa-home',
             'frontend/assets/qa.js': b'qa-versioned-code'}
    manifest = {'version': 1, 'sha': sha, 'generation': generation, 'image_tag': 'insong-backend:' + sha,
                'files': {n: {'size': len(v), 'sha256': hashlib.sha256(v).hexdigest()}
                          for n, v in files.items()}}
    if wrong_hash:
        manifest['files']['frontend/index.html']['sha256'] = '0' * 64
    with tarfile.open(path, 'w:gz') as archive:
        for name, content in [('manifest.json', json.dumps(manifest).encode()), *files.items()]:
            info = tarfile.TarInfo(name)
            info.size = len(content)
            archive.addfile(info, BytesIO(content))
        if extra is not None:
            info, content = extra
            archive.addfile(info, BytesIO(content) if content is not None else None)


def test_valid_release_is_verified_before_extraction(tmp_path):
    bundle = tmp_path / 'release.tar.gz'
    make_bundle(bundle)
    manifest = verify_bundle(bundle, SHA)
    assert manifest.sha == SHA
    target = tmp_path / 'new-release'
    extract_verified(bundle, manifest, target)
    assert (target / 'frontend/index.html').read_bytes() == b'qa-home'
    assert (target / 'backend-image.tar').read_bytes() == b'qa-image'


@pytest.mark.parametrize('name', ['../outside', '/root/authorized_keys', 'frontend/../../outside',
                                'frontend\\..\\outside', 'frontend//duplicate', '.env'])
def test_unsafe_names_never_write_outside_or_mutate_the_current_release(tmp_path, name):
    bundle = tmp_path / 'attack.tar.gz'
    info = tarfile.TarInfo(name)
    info.size = 3
    make_bundle(bundle, extra=(info, b'bad'))
    current = tmp_path / 'current'
    current.mkdir()
    (current / 'healthy').write_text('keep')
    with pytest.raises(ValueError):
        verify_bundle(bundle, SHA)
    assert (current / 'healthy').read_text() == 'keep'
    assert not (tmp_path / 'outside').exists()


@pytest.mark.parametrize('kind', [tarfile.SYMTYPE, tarfile.LNKTYPE, tarfile.DIRTYPE])
def test_archive_links_and_special_entries_are_rejected(tmp_path, kind):
    bundle = tmp_path / 'attack.tar.gz'
    info = tarfile.TarInfo('frontend/linked')
    info.type = kind
    info.linkname = '/root/authorized_keys'
    make_bundle(bundle, extra=(info, None))
    with pytest.raises(ValueError):
        verify_bundle(bundle, SHA)


def test_duplicate_entry_is_rejected(tmp_path):
    bundle = tmp_path / 'duplicate.tar.gz'
    info = tarfile.TarInfo('frontend/index.html')
    info.size = 3
    make_bundle(bundle, extra=(info, b'bad'))
    with pytest.raises(ValueError):
        verify_bundle(bundle, SHA)


def test_hash_mismatch_and_wrong_revision_are_rejected(tmp_path):
    bundle = tmp_path / 'bad-hash.tar.gz'
    make_bundle(bundle, wrong_hash=True)
    with pytest.raises(ValueError):
        verify_bundle(bundle, SHA)
    make_bundle(bundle)
    with pytest.raises(ValueError):
        verify_bundle(bundle, 'b' * 40)


def test_existing_extraction_target_and_changed_archive_are_rejected(tmp_path):
    bundle = tmp_path / 'release.tar.gz'
    make_bundle(bundle)
    manifest = verify_bundle(bundle, SHA)
    target = tmp_path / 'user-owned'
    target.mkdir()
    (target / 'keep').write_text('original')
    with pytest.raises(ValueError):
        extract_verified(bundle, manifest, target)
    assert (target / 'keep').read_text() == 'original'
    make_bundle(bundle, wrong_hash=True)
    with pytest.raises(ValueError):
        extract_verified(bundle, manifest, tmp_path / 'new')
    assert not (tmp_path / 'new').exists()
