import json
from pathlib import Path

import pytest

from ops.hk.deploy_release import deploy_release
import ops.hk.deploy_release as deploy_module
from ops.hk.tests.test_release_bundle import make_bundle

OLD = 'b' * 40
NEW = 'a' * 40


class Runtime:
    def __init__(self, fail=None):
        self.fail = fail
        self.calls = []
    def load_image(self, *args):
        self.calls.append('load')
    def start(self, *args):
        self.calls.append('start')
        if self.fail == 'start':
            raise RuntimeError('qa-partly-started')
    def ready(self, *args):
        self.calls.append('ready')
        return self.fail != 'health'
    def validate_proxy(self, *args):
        self.calls.append('validate')
        if self.fail == 'validate':
            raise RuntimeError('qa-invalid-proxy')
    def reload_proxy(self, *args):
        self.calls.append('reload')
        if self.fail == 'reload':
            raise RuntimeError('qa-reload-failed')
    def stop(self, *args):
        self.calls.append('stop')


def owned_root(tmp_path):
    root = tmp_path / 'insong'
    root.mkdir()
    (root / '.insong-owned').write_text('insong-hk-layout-v1\n')
    for name in ('state', 'releases', 'shared'):
        (root / name).mkdir()
    (root / 'state/current.json').write_text(json.dumps({'sha': OLD, 'slot': 'blue', 'port': 18001}))
    return root


@pytest.mark.parametrize('failure', ['start', 'health', 'validate', 'reload'])
def test_failed_candidate_never_replaces_the_current_version(tmp_path, failure):
    root = owned_root(tmp_path)
    original = (root / 'state/current.json').read_bytes()
    bundle = tmp_path / 'release.tar.gz'
    make_bundle(bundle)
    runtime = Runtime(failure)
    with pytest.raises(RuntimeError):
        deploy_release(bundle, NEW, root, runtime=runtime)
    assert (root / 'state/current.json').read_bytes() == original
    assert runtime.calls[-1] == 'stop'
    if failure == 'health':
        assert 'reload' not in runtime.calls


def test_success_switches_after_readiness_and_keeps_previous_assets(tmp_path):
    root = owned_root(tmp_path)
    assets = root / 'shared/assets'
    assets.mkdir()
    (assets / 'previous.js').write_text('previous-open-tab')
    bundle = tmp_path / 'release.tar.gz'
    make_bundle(bundle)
    runtime = Runtime()
    result = deploy_release(bundle, NEW, root, runtime=runtime)
    state = json.loads((root / 'state/current.json').read_text())
    assert state['sha'] == NEW and state['slot'] == 'green'
    assert result.sha == NEW
    assert runtime.calls[:5] == ['load', 'start', 'ready', 'validate', 'reload']
    assert (assets / 'previous.js').read_text() == 'previous-open-tab'
    assert (assets / 'qa.js').read_bytes() == b'qa-versioned-code'
    assert json.loads((root / 'state/previous.json').read_text())['sha'] == OLD


def test_invalid_archive_and_existing_deploy_lock_have_no_runtime_side_effect(tmp_path):
    root = owned_root(tmp_path)
    bundle = tmp_path / 'release.tar.gz'
    make_bundle(bundle, wrong_hash=True)
    runtime = Runtime()
    with pytest.raises(ValueError):
        deploy_release(bundle, NEW, root, runtime=runtime)
    assert runtime.calls == []
    make_bundle(bundle)
    with deploy_module._lock(root / 'state/deploy.lock'):
        with pytest.raises(RuntimeError, match='deployment'):
            deploy_release(bundle, NEW, root, runtime=runtime)
    assert runtime.calls == []


def test_duplicate_current_release_does_not_restart_services(tmp_path):
    root = owned_root(tmp_path)
    (root / 'state/current.json').write_text(json.dumps({'sha': NEW, 'slot': 'green', 'port': 18002}))
    bundle = tmp_path / 'release.tar.gz'
    make_bundle(bundle)
    runtime = Runtime()
    assert deploy_release(bundle, NEW, root, runtime=runtime).sha == NEW
    assert runtime.calls == []


def test_verified_candidate_can_be_retried_after_failed_readiness(tmp_path):
    root = owned_root(tmp_path)
    bundle = tmp_path / 'release.tar.gz'
    make_bundle(bundle)
    with pytest.raises(RuntimeError):
        deploy_release(bundle, NEW, root, runtime=Runtime('health'))
    result = deploy_release(bundle, NEW, root, runtime=Runtime())
    assert result.sha == NEW
    assert json.loads((root / 'state/current.json').read_text())['sha'] == NEW


def test_oversized_incoming_does_not_leave_a_private_snapshot(tmp_path, monkeypatch):
    root = owned_root(tmp_path)
    bundle = tmp_path / 'oversized'
    bundle.write_bytes(b'x' * 16)
    original = set((root / 'state').iterdir())
    monkeypatch.setattr(deploy_module, 'MAX_TOTAL', 4)
    with pytest.raises(ValueError):
        deploy_release(bundle, NEW, root, runtime=Runtime())
    assert set((root / 'state').iterdir()) == original


def test_retention_keeps_current_previous_and_one_owned_version(tmp_path):
    from ops.hk.deploy_release import prune_releases
    root = owned_root(tmp_path)
    versions = [OLD, NEW, 'c'*40, 'd'*40]
    for sha in versions:
        directory = root / 'releases' / sha
        directory.mkdir()
        (directory / 'manifest.json').write_text(json.dumps({'sha': sha}))
    foreign = root / 'releases' / 'user-files'; foreign.mkdir()
    prune_releases(root, NEW, OLD)
    assert (root / 'releases' / NEW).exists()
    assert (root / 'releases' / OLD).exists()
    assert len([p for p in (root / 'releases').iterdir() if p.name in versions]) == 3
    assert foreign.exists()


def test_failure_to_stop_old_slot_does_not_report_a_failed_live_release(tmp_path):
    root = owned_root(tmp_path)
    bundle = tmp_path / 'release.tar.gz'; make_bundle(bundle)
    runtime = Runtime()
    def stop(slot):
        raise RuntimeError('stop-failed')
    runtime.stop = stop
    assert deploy_release(bundle, NEW, root, runtime=runtime).sha == NEW


def test_old_workflow_rerun_cannot_replace_a_newer_live_version(tmp_path):
    root=owned_root(tmp_path)
    (root/'state/current.json').write_text(json.dumps({'sha':OLD,'slot':'blue','port':18001,'generation':20}))
    bundle=tmp_path/'old.tar.gz';make_bundle(bundle,generation=19)
    runtime=Runtime()
    with pytest.raises(ValueError,match='older'):
        deploy_release(bundle,NEW,root,runtime=runtime)
    assert runtime.calls==[]
    assert json.loads((root/'state/current.json').read_text())['sha']==OLD


def test_active_old_workers_keep_the_old_backend_and_prevent_slot_reuse(tmp_path):
    root=owned_root(tmp_path)
    bundle=tmp_path/'release.tar.gz';make_bundle(bundle,generation=1)
    runtime=Runtime()
    runtime.prepare_slot=lambda slot: True
    runtime.retire_slot=lambda slot: False
    deploy_release(bundle,NEW,root,runtime=runtime)
    assert 'stop' not in runtime.calls
    second=tmp_path/'next.tar.gz';make_bundle(second,sha='c'*40,generation=2)
    runtime=Runtime();runtime.prepare_slot=lambda slot: False
    with pytest.raises(RuntimeError,match='drain'):
        deploy_release(second,'c'*40,root,runtime=runtime)
    assert 'start' not in runtime.calls


def test_exited_lock_holder_does_not_block_the_next_deployment(tmp_path):
    import subprocess,sys
    path=tmp_path/'deploy.lock'
    child=subprocess.Popen([sys._base_executable,'-c',
        'import sys,time;from pathlib import Path;from ops.hk.deploy_release import _lock;'
        '\nwith _lock(Path(sys.argv[1])): print("held",flush=True);time.sleep(60)',str(path)],stdout=subprocess.PIPE,text=True)
    try:
        assert child.stdout.readline().strip()=='held'
        child.terminate();child.wait(timeout=5)
        with deploy_module._lock(path): pass
    finally:
        if child.poll() is None: child.kill();child.wait()


def test_incoming_retention_preserves_unknown_files_and_limits_owned_packages(tmp_path):
    from ops.hk.deploy_release import prune_incoming
    root=owned_root(tmp_path);incoming=root/'incoming';incoming.mkdir()
    for letter in 'abcd': (incoming/(letter*40+'.tar.gz')).write_bytes(b'owned')
    (incoming/'user-backup.dump').write_bytes(b'preserve')
    prune_incoming(root,{'a'*40,'b'*40,'c'*40})
    assert len(list(incoming.glob('*.tar.gz')))==3
    assert (incoming/'user-backup.dump').read_bytes()==b'preserve'


def test_low_free_space_rejects_before_loading_an_image(tmp_path,monkeypatch):
    from collections import namedtuple
    root=owned_root(tmp_path);bundle=tmp_path/'release.tar.gz';make_bundle(bundle)
    disk=namedtuple('usage','total used free')
    monkeypatch.setattr(deploy_module.shutil,'disk_usage',lambda path: disk(100,90,10))
    runtime=Runtime()
    with pytest.raises(RuntimeError,match='space'):
        deploy_release(bundle,NEW,root,runtime=runtime)
    assert runtime.calls==[]
