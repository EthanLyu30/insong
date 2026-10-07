"""Move only the private application schema, retaining opaque verified backups."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import urllib.parse
import urllib.request


SOURCE_HOST = 'aws-0-ap-south-1.pooler.supabase.com'
SOURCE_USER = 'postgres.bmlalpyrbclyjginwjbb'


def validate_source(value):
    try:
        url = urllib.parse.urlsplit(value)
        query = urllib.parse.parse_qs(url.query)
        if (url.scheme not in ('postgresql','postgres') or url.hostname != SOURCE_HOST
                or url.port != 5432 or urllib.parse.unquote(url.username or '') != SOURCE_USER
                or url.path != '/postgres' or not url.password or url.fragment
                or set(query)-{'sslmode'} or query.get('sslmode',['verify-full']) != ['verify-full']):
            raise ValueError()
        return {'PGHOST':SOURCE_HOST, 'PGPORT':'5432', 'PGUSER':SOURCE_USER,
                'PGDATABASE':'postgres', 'PGPASSWORD':urllib.parse.unquote(url.password),
                'PGSSLMODE':'verify-full', 'PGSSLROOTCERT':'/run/source-ca.crt'}
    except Exception:
        raise ValueError('source connection does not match the existing project') from None


def migrate(backup, *, driver, frozen):
    if not frozen:
        raise ValueError('source writes are not frozen')
    if backup.exists() or backup.is_symlink() or backup.parent.resolve() != backup.parent.absolute():
        raise ValueError('backup must be new in an owned directory')
    driver.ensure_empty()
    source = driver.fingerprint(source=True)
    driver.dump(backup)
    backup.chmod(0o600)
    driver.restore(backup)
    driver.validate_relationships()
    if source != driver.fingerprint() or source != driver.fingerprint(source=True):
        raise ValueError('restored data differs or source changed')
    with backup.open('rb') as stream:
        digest = hashlib.file_digest(stream, 'sha256').hexdigest()
    receipt = {'verified':True, 'backup_sha256':digest, 'tables':len(source)}
    marker = Path(str(backup)+'.verified')
    with marker.open('x') as stream:
        json.dump(receipt, stream)
    marker.chmod(0o600)
    return receipt


class Postgres:
    def __init__(self, source_file, destination, root=Path('/opt/insong')):
        if not re.fullmatch(r'insong(?:_migration_[a-z0-9]+|_qa_[a-z0-9]+)?', destination):
            raise ValueError('unexpected destination database')
        if source_file.is_symlink() or source_file.stat().st_mode & 0o077:
            raise ValueError('source secret must be private')
        self.source = validate_source(source_file.read_text().strip())
        self.destination=destination; self.root=root
    def _run(self, args, *, source=False, data=None, output=None):
        if source:
            env = dict(os.environ, **self.source)
            command = ['docker','run','--rm','-i','--network','insong-hk_insong',
                       '-v',str(self.root/'tls/source-ca.crt')+':/run/source-ca.crt:ro']
            for key in self.source:
                command += ['-e',key]
            command += ['postgres:17-bookworm']+args
        else:
            env=None
            command=['docker','exec','-i','insong-hk-postgres-1']+args
        result=subprocess.run(command,input=data,env=env,stdout=output if output else subprocess.PIPE,
                              stderr=subprocess.PIPE)
        if result.returncode:
            raise RuntimeError('database operation failed; private diagnostics suppressed')
        return result.stdout
    def sql(self, query, source=False):
        args=['psql','-X','-A','-t','-v','ON_ERROR_STOP=1']
        if not source: args += ['-U','postgres','-d',self.destination]
        return self._run(args,source=source,data=query.encode()).decode().strip()
    def ensure_empty(self):
        count=self.sql("SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_%' AND c.relkind IN ('r','S','v','m');")
        if count!='0': raise ValueError('destination database is not empty')
        version=int(self.sql('SHOW server_version_num;',True))
        if version >=180000: raise ValueError('source requires a newer dump client')
    def fingerprint(self, source=False):
        tables=self.sql("SELECT tablename FROM pg_tables WHERE schemaname='insong' ORDER BY tablename;",source).splitlines()
        if not tables or not {'users','sessions','photos','memory_cards'}.issubset(tables):
            raise ValueError('source application tables are missing')
        result={}
        for table in tables:
            if not re.fullmatch('[a-z_]+',table): raise ValueError('unexpected table')
            # Server hashes complete row JSON, including bytea and session hashes;
            # only aggregate digests reach this process, no private rows/logs.
            query=f'''SELECT count(*)::text || ':' || coalesce(md5(string_agg(h,'' ORDER BY h)),'empty') FROM (SELECT md5(to_jsonb(t)::text) h FROM insong."{table}" t) q;'''
            result[table]=self.sql(query,source)
        sequences=self.sql("SELECT sequencename FROM pg_sequences WHERE schemaname='insong' ORDER BY sequencename;",source).splitlines()
        for sequence in sequences:
            if not re.fullmatch('[a-z_]+',sequence): raise ValueError('unexpected sequence')
            result['sequence:'+sequence]=self.sql(f'SELECT last_value::text || \':\' || is_called::text FROM insong."{sequence}";',source)
        return result
    def dump(self, path):
        with path.open('xb') as stream:
            self._run(['pg_dump','--schema=insong','--format=custom','--no-owner','--no-acl',
                       '--serializable-deferrable'],source=True,output=stream)
    def restore(self, path):
        with path.open('rb') as stream:
            result=subprocess.run(['docker','exec','-i','insong-hk-postgres-1','pg_restore',
                                   '-U','postgres','-d',self.destination,'--no-owner','--no-acl',
                                   '--role=insong_app','--exit-on-error','--single-transaction'],
                                  stdin=stream,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        if result.returncode: raise RuntimeError('restore failed; private diagnostics suppressed')
    def validate_relationships(self):
        invalid=self.sql("SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='insong' AND c.contype='f' AND NOT c.convalidated;")
        if invalid!='0': raise ValueError('foreign key validation failed')


def source_is_frozen(base='https://insong-backend.onrender.com'):
    client=urllib.request.build_opener(urllib.request.ProxyHandler({}))
    request=urllib.request.Request(base+'/api/migration-freeze-check',data=b'{}',
                                   headers={'Content-Type':'application/json','Origin':'https://insong.me'})
    try:
        client.open(request,timeout=60)
    except urllib.error.HTTPError as error:
        return error.code==503 and error.headers.get('Retry-After')=='60'
    return False


if __name__ == '__main__':
    import argparse
    parser=argparse.ArgumentParser()
    parser.add_argument('--destination',required=True)
    parser.add_argument('--backup',type=Path,required=True)
    args=parser.parse_args()
    root=Path('/opt/insong')
    if args.backup.parent != root/'backups': parser.error('backup must use the private backup directory')
    driver=Postgres(root/'secrets/source-database.url',args.destination,root)
    print(json.dumps(migrate(args.backup,driver=driver,frozen=source_is_frozen())))
