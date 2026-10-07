import os
from pathlib import Path
import socket
import ssl
import threading

import pytest

from ops.hk.bootstrap import prepare_layout, render_nginx


OPENSSL = 'C:/Program Files/Git/usr/bin/openssl.exe' if os.name == 'nt' else 'openssl'


def test_foreign_directory_is_never_repurposed(tmp_path):
    root = tmp_path / 'foreign'
    root.mkdir()
    original = root / 'user-owned.txt'
    original.write_text('preserve this', encoding='utf-8')
    with pytest.raises(ValueError, match='owned'):
        prepare_layout(root, openssl=OPENSSL)
    assert original.read_text() == 'preserve this'
    assert list(root.iterdir()) == [original]


def test_repeating_bootstrap_preserves_keys_and_secrets_and_public_result_has_no_password(tmp_path):
    root = tmp_path / 'insong'
    info = prepare_layout(root, openssl=OPENSSL)
    private_files = [root / 'secrets/admin.password', root / 'secrets/runtime.env',
                     root / 'tls/ca.key', root / 'tls/postgres.key']
    previous = {p: p.read_bytes() for p in private_files}
    again = prepare_layout(root, openssl=OPENSSL)
    assert info == again
    assert previous == {p: p.read_bytes() for p in private_files}
    assert previous[root / 'secrets/admin.password'].strip().decode() not in str(info)
    assert 'DATABASE_URL' not in str(info)


def test_generated_database_certificate_verifies_postgres_and_rejects_another_name(tmp_path):
    root = tmp_path / 'insong'
    prepare_layout(root, openssl=OPENSSL)
    server = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    server.load_cert_chain(root / 'tls/postgres.crt', root / 'tls/postgres.key')
    client = ssl.create_default_context(cafile=str(root / 'tls/ca.crt'))
    assert client.check_hostname
    assert client.verify_mode == ssl.CERT_REQUIRED
    for hostname, valid in [('postgres', True), ('incorrect.example', False)]:
        listener = socket.socket()
        listener.bind(('127.0.0.1', 0))
        listener.listen(1)
        address = listener.getsockname()
        def serve():
            try:
                raw, _ = listener.accept()
                try:
                    with server.wrap_socket(raw, server_side=True) as encrypted:
                        encrypted.sendall(b'verified')
                except (ssl.SSLError, ConnectionResetError):
                    raw.close()
            finally:
                listener.close()
        worker = threading.Thread(target=serve, daemon=True)
        worker.start()
        with socket.create_connection(address, timeout=5) as raw:
            if valid:
                with client.wrap_socket(raw, server_hostname=hostname) as encrypted:
                    assert encrypted.recv(8) == b'verified'
            else:
                with pytest.raises(ssl.SSLCertVerificationError):
                    client.wrap_socket(raw, server_hostname=hostname)
        worker.join(timeout=5)
        assert not worker.is_alive()


def test_linked_secret_directory_cannot_write_outside_the_owned_root(tmp_path):
    root = tmp_path / 'insong'
    prepare_layout(root, openssl=OPENSSL)
    secret_dir = root / 'secrets'
    outside = tmp_path / 'outside'
    secret_dir.rename(outside)
    try:
        secret_dir.symlink_to(outside, target_is_directory=True)
    except OSError:
        pytest.skip('OS account cannot create a directory symlink; exercised in Linux checks')
    with pytest.raises(ValueError, match='link'):
        prepare_layout(root, openssl=OPENSSL)


@pytest.mark.parametrize('sha,port', [('bad-sha', 18001), ('a'*40, 22), ('b'*40, 5432)])
def test_nginx_cannot_route_to_an_unvalidated_revision_or_admin_port(tmp_path, sha, port):
    with pytest.raises(ValueError):
        render_nginx(tmp_path, sha, port)
