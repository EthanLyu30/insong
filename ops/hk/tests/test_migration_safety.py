from pathlib import Path
import pytest

from ops.hk.migrate_database import migrate, validate_source


def test_only_the_existing_supabase_project_is_a_source():
    url = 'postgresql://postgres.bmlalpyrbclyjginwjbb:opaque@aws-0-ap-south-1.pooler.supabase.com:5432/postgres'
    assert validate_source(url)['PGHOST'] == 'aws-0-ap-south-1.pooler.supabase.com'
    for invalid in (url.replace('bmlalpyrbclyjginwjbb','other'), url.replace('/postgres','/other'),
                    url.replace('pooler.supabase.com','evil.example'), url+'?sslmode=disable'):
        with pytest.raises(ValueError):
            validate_source(invalid)


class Driver:
    def __init__(self, *, empty=True, restore_ok=True, match=True):
        self.empty=empty; self.restore_ok=restore_ok; self.match=match; self.calls=[]
    def ensure_empty(self):
        self.calls.append('empty')
        if not self.empty: raise ValueError('target not empty')
    def fingerprint(self, source=False):
        return {'digest':'same' if source or self.match else 'different'}
    def dump(self, path):
        self.calls.append('dump'); path.write_bytes(b'opaque-private-backup')
    def restore(self, path):
        self.calls.append('restore')
        if not self.restore_ok: raise RuntimeError('restore failed')
    def validate_relationships(self):
        self.calls.append('relationships')


@pytest.mark.parametrize('condition', ['nonempty','restore','digest','unfrozen'])
def test_failed_migration_never_produces_a_verified_receipt(tmp_path, condition):
    driver=Driver(empty=condition!='nonempty', restore_ok=condition!='restore', match=condition!='digest')
    with pytest.raises((ValueError, RuntimeError)):
        migrate(tmp_path/'backup.dump', driver=driver, frozen=condition!='unfrozen')
    assert not (tmp_path/'backup.dump.verified').exists()
    if condition in ('nonempty','unfrozen'): assert 'dump' not in driver.calls


def test_verified_migration_keeps_opaque_backup_and_receipt(tmp_path):
    backup=tmp_path/'backup.dump'
    receipt=migrate(backup, driver=Driver(), frozen=True)
    assert receipt['verified'] is True
    assert backup.read_bytes()==b'opaque-private-backup'
    assert (tmp_path/'backup.dump.verified').exists()
