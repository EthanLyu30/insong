"""Create an owned server layout without disclosing or replacing its secrets."""
import argparse
import json
import os
from pathlib import Path
import re
import secrets
import subprocess

MARKER = 'insong-hk-layout-v1'


def _regular(path):
    if path.is_symlink() or (path.exists() and path.is_file() and path.stat().st_nlink != 1):
        raise ValueError('linked runtime path is not allowed')


def _write_once(path, content, mode=0o600):
    _regular(path)
    if not path.exists():
        with path.open('x', encoding='utf-8', newline='\n') as stream:
            stream.write(content)
    path.chmod(mode)


def _openssl(command):
    result = subprocess.run(command, capture_output=True)
    if result.returncode:
        raise RuntimeError('Internal certificate generation failed; private values suppressed')


def prepare_layout(root: Path, *, openssl='openssl') -> dict:
    root = root.absolute()
    if root.resolve() != root:
        raise ValueError('linked runtime root is not allowed')
    marker = root / '.insong-owned'
    if root.exists() and any(root.iterdir()) and not marker.is_file():
        raise ValueError('runtime root is not owned by insong')
    _regular(marker)
    if marker.exists() and marker.read_text().strip() != MARKER:
        raise ValueError('runtime root is not owned by insong')
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    # Web workers can traverse the layout; private subdirectories stay 0700.
    root.chmod(0o755)
    _write_once(marker, MARKER + '\n')
    for name in ('secrets', 'tls', 'state', 'backups', 'incoming', 'releases', 'shared', 'acme'):
        directory = root / name
        _regular(directory)
        directory.mkdir(exist_ok=True, mode=0o700)
        directory.chmod(0o755 if name in ('releases', 'shared', 'acme') else 0o700)
    for name in ('ca.key', 'ca.crt', 'postgres.key', 'postgres.crt'):
        _regular(root / 'tls' / name)
    pki_files = [root / 'tls' / name for name in ('ca.key', 'ca.crt', 'postgres.key', 'postgres.crt')]
    if any(p.exists() for p in pki_files) and not all(p.exists() for p in pki_files):
        raise ValueError('incomplete internal PKI; preserve files for inspection')
    if not all(p.exists() for p in pki_files):
        ca_key, ca_cert, db_key, db_cert = pki_files
        config = root / 'tls' / 'certificate.cnf'
        _write_once(config, '[req]\ndistinguished_name=dn\nx509_extensions=ca\nprompt=no\n'
                    '[dn]\nCN=insong internal CA\n[ca]\nbasicConstraints=critical,CA:TRUE\n'
                    'keyUsage=critical,keyCertSign,cRLSign\nsubjectKeyIdentifier=hash\n')
        csr = root / 'tls' / 'postgres.csr'
        extensions = root / 'tls' / 'postgres.ext'
        _write_once(extensions, 'subjectAltName=DNS:postgres\nextendedKeyUsage=serverAuth\n'
                    'basicConstraints=critical,CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\n')
        _openssl([openssl, 'req', '-x509', '-newkey', 'rsa:3072', '-nodes', '-sha256',
                  '-days', '365', '-config', str(config), '-keyout', str(ca_key), '-out', str(ca_cert)])
        _openssl([openssl, 'req', '-new', '-newkey', 'rsa:2048', '-nodes', '-subj', '/CN=postgres',
                  '-keyout', str(db_key), '-out', str(csr)])
        _openssl([openssl, 'x509', '-req', '-in', str(csr), '-CA', str(ca_cert), '-CAkey', str(ca_key),
                  '-CAcreateserial', '-days', '180', '-sha256', '-extfile', str(extensions), '-out', str(db_cert)])
        for intermediate in (csr, config, extensions):
            _regular(intermediate)
            intermediate.unlink()
    (root / 'tls' / 'ca.key').chmod(0o600)
    (root / 'tls' / 'postgres.key').chmod(0o600)
    for name in ('ca.crt', 'postgres.crt'):
        (root / 'tls' / name).chmod(0o644)
    _write_once(root / 'secrets' / 'admin.password', secrets.token_hex(32) + '\n', 0o400)
    app_password_file = root / 'secrets' / 'app.password'
    _write_once(app_password_file, secrets.token_hex(32) + '\n', 0o400)
    app_password = app_password_file.read_text().strip()
    if not re.fullmatch('[a-f0-9]{64}', app_password):
        raise ValueError('invalid owned application password file')
    _write_once(root / 'secrets' / 'init.sql',
                f"CREATE ROLE insong_app LOGIN PASSWORD '{app_password}' NOSUPERUSER NOCREATEDB NOCREATEROLE;\n"
                'CREATE DATABASE insong OWNER insong_app;\n\\connect insong\n'
                'REVOKE CREATE ON SCHEMA public FROM PUBLIC;\n', 0o400)
    _write_once(root / 'secrets' / 'runtime.env',
                'APP_ENV=production\nDATABASE_SCHEMA=insong\nMIGRATION_READ_ONLY=0\n'
                f'DATABASE_URL=postgresql://insong_app:{app_password}@postgres:5432/insong?sslmode=verify-full\n'
                'DATABASE_SSLROOTCERT=/run/insong-ca/ca.crt\n'
                'CORS_ORIGINS=https://insong.me,https://insong.vercel.app\n')
    _write_once(root / 'tls' / 'pg_hba.conf',
                'local all all trust\nhostssl all all all scram-sha-256\nhostnossl all all all reject\n', 0o644)
    if os.name != 'nt' and os.geteuid() == 0:
        for path in (root / 'tls' / 'postgres.key', root / 'tls' / 'postgres.crt',
                     root / 'secrets' / 'admin.password', root / 'secrets' / 'init.sql'):
            os.chown(path, 999, 999)
    return {'layout_version': 1, 'root': str(root), 'database_host': 'postgres', 'database': 'insong'}


def render_nginx(root: Path, sha: str, port: int) -> str:
    if not re.fullmatch('[a-f0-9]{40}', sha) or port not in (18001, 18002):
        raise ValueError('invalid release or backend port')
    path = root.absolute().as_posix()
    if not re.fullmatch(r'[A-Za-z0-9_./:\-]+', path):
        raise ValueError('unsupported runtime root path')
    template = Path(__file__).with_name('nginx.conf.template').read_text(encoding='utf-8')
    return template.replace('__ROOT__', path).replace('__SHA__', sha).replace('__PORT__', str(port))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--root', type=Path, default=Path('/opt/insong'))
    args = parser.parse_args()
    print(json.dumps(prepare_layout(args.root)))
