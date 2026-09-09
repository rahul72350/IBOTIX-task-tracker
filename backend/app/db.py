import sys
import psycopg2
import psycopg2.extras
from psycopg2 import pool as pg_pool

from app.config import DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME

_pool = None


def get_pool():
    global _pool
    if _pool is None:
        _pool = pg_pool.SimpleConnectionPool(
            1, 10,
            host=DB_HOST, port=DB_PORT, user=DB_USER,
            password=DB_PASSWORD, dbname=DB_NAME,
            connect_timeout=8,
        )
    return _pool


def query(sql, params=None):
    """Run a query and return a list of dict rows (like pg's `rows` in JS)."""
    conn = None
    try:
        conn = get_pool().getconn()
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, params or [])
            if cur.description is None:
                conn.commit()
                return []
            rows = cur.fetchall()
            conn.commit()
            return [dict(r) for r in rows]
    except Exception:
        # conn can still be None here if getconn() itself is what failed
        # (pool exhausted, DB unreachable) — nothing to roll back or
        # return to the pool in that case, just let the real error surface.
        if conn is not None:
            conn.rollback()
        raise
    finally:
        if conn is not None:
            get_pool().putconn(conn)


def verify_connection():
    try:
        rows = query("select to_regclass('public.users') as users_table")
        if not rows or not rows[0]["users_table"]:
            print("\n[DB] Connected, but the \"users\" table is missing.", file=sys.stderr)
            print(f"[DB] Run the schema first: psql -U postgres -d {DB_NAME} -f backend/schema.sql\n", file=sys.stderr)
            return False
        print(f'[DB] Connected to PostgreSQL database "{DB_NAME}"')
        return True
    except Exception as err:
        print("\n[DB] Could not connect to PostgreSQL.", file=sys.stderr)
        print(f"[DB] {err}", file=sys.stderr)
        print("[DB] Check these values in backend/.env:", file=sys.stderr)
        print(f"     DB_HOST={DB_HOST}", file=sys.stderr)
        print(f"     DB_PORT={DB_PORT}", file=sys.stderr)
        print(f"     DB_USER={DB_USER}", file=sys.stderr)
        print(f"     DB_NAME={DB_NAME}", file=sys.stderr)
        print("     DB_PASSWORD=(hidden)\n", file=sys.stderr)
        return False
