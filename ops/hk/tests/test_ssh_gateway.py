from pathlib import Path
import shlex

import pytest

from ops.hk.ssh_gateway import permitted_command

SHA = 'a' * 40


def test_gateway_allows_only_fixed_upload_and_revision_publication(tmp_path):
    root = tmp_path / 'insong'
    root.mkdir()
    (root / 'incoming').mkdir()
    assert permitted_command('deploy ' + SHA, root) == ['sudo', '-n', '/usr/local/sbin/insong-deploy', SHA]
    command = permitted_command('scp -t ' + shlex.quote(str(root / 'incoming' / (SHA + '.tar.gz'))), root)
    assert command == ['/usr/bin/scp', '-t', str(root / 'incoming' / (SHA + '.tar.gz'))]


@pytest.mark.parametrize('command', ['', 'bash', 'cat /opt/insong/secrets/runtime.env',
                                    'deploy bad', 'deploy ' + SHA + '; id',
                                    'scp -t /root/authorized_keys', 'scp -r -t /tmp',
                                    'internal-sftp', 'deploy ' + SHA + ' extra'])
def test_gateway_rejects_interactive_shell_and_other_paths(tmp_path, command):
    root = tmp_path / 'insong'
    root.mkdir()
    (root / 'incoming').mkdir()
    with pytest.raises(ValueError):
        permitted_command(command, root)


def test_gateway_rejects_a_linked_incoming_directory(tmp_path):
    root = tmp_path / 'insong'
    root.mkdir()
    outside = tmp_path / 'outside'
    outside.mkdir()
    try:
        (root / 'incoming').symlink_to(outside, target_is_directory=True)
    except OSError:
        pytest.skip('directory links require account privileges')
    with pytest.raises(ValueError):
        permitted_command('scp -t ' + shlex.quote(str(root / 'incoming' / (SHA + '.tar.gz'))), root)
