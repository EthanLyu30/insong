"""The small SQL differences shared by SQLite and PostgreSQL routes."""
from sqlalchemy import Integer, cast, exists, func, select, text
from sqlalchemy.dialects.postgresql import JSONB, insert as postgres_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from .models import Base


def conflict_insert(db, table):
    dialect = db.get_bind().dialect.name
    if dialect == 'postgresql':
        return postgres_insert(table)
    if dialect == 'sqlite':
        return sqlite_insert(table)
    raise ValueError('Unsupported database dialect')


def json_array_contains(column, value, dialect_name):
    if dialect_name == 'postgresql':
        items = func.jsonb_array_elements_text(cast(column, JSONB)).table_valued('value').render_derived()
    elif dialect_name == 'sqlite':
        items = func.json_each(column).table_valued('value')
    else:
        raise ValueError('Unsupported database dialect')
    return exists(select(1).select_from(items).where(items.c.value == value))


def synchronize_sequences(connection):
    """Explicit seed IDs must not collide with future serial IDs or rewind them."""
    if connection.dialect.name != 'postgresql':
        return
    for table in Base.metadata.sorted_tables:
        keys = list(table.primary_key.columns)
        if len(keys) != 1 or not isinstance(keys[0].type, Integer):
            continue
        key = keys[0]
        sequence = connection.scalar(text('SELECT pg_get_serial_sequence(:table_name, :column_name)'),
                                     {'table_name': table.name, 'column_name': key.name})
        if sequence is None:
            continue
        # Serialize writes while reading max(id) and the sequence position.
        quoted_table = connection.dialect.identifier_preparer.quote(table.name)
        connection.exec_driver_sql(f'LOCK TABLE {quoted_table} IN SHARE ROW EXCLUSIVE MODE')
        maximum = connection.scalar(select(func.max(key))) or 0
        last = connection.scalar(text('SELECT last_value FROM pg_sequences '
            'WHERE schemaname = current_schema() AND sequencename = :name'),
            {'name': sequence.rsplit('.', 1)[-1]}) or 0
        value = max(maximum, last)
        if value:
            connection.execute(text('SELECT setval(CAST(:sequence AS regclass), :value, true)'),
                               {'sequence': sequence, 'value': value})
