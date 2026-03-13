"""
src/db_engine.py
----------------
Modulo centralizado para la creacion del engine de conexion.
En validacion usa SQLite en memoria para no depender de Informix.
"""

import os

from sqlalchemy import create_engine, event, exc


INFORMIX_PING_QUERY = "SELECT FIRST 1 1 FROM systables"


def is_validation_mode():
    return os.getenv("APP_VALIDATION_MODE", "0").lower() in {"1", "true", "yes", "on"}


def build_engine(is_validation=None):
    if is_validation is None:
        is_validation = is_validation_mode()

    if is_validation:
        return create_engine("sqlite+pysqlite:///:memory:")

    informix_server = os.getenv("INFORMIX_SERVER", "informix_dr")
    informix_user = os.getenv("INFORMIX_USER", "informix")
    informix_password = os.getenv("INFORMIX_PASSWORD", "migracion")
    informix_database = os.getenv("INFORMIX_DATABASE", "clinical")
    informix_host = os.getenv("INFORMIX_HOST", "192.168.0.3")
    informix_port = os.getenv("INFORMIX_PORT", "9089")

    conn_str = (
        f"ibm_db_sa://{informix_user}:{informix_password}@{informix_host}:{informix_port}/{informix_database};"
        f"Server={informix_server};DB_LOCALE=en_US.819;CLIENT_LOCALE=en_US.819;"
        f"TRANSLATIONDLL=NONE;IFX_USE_STRENC=true;IFX_AUTOCOMMIT=1"
    )

    engine = create_engine(
        conn_str,
        pool_size=int(os.getenv("INFORMIX_POOL_SIZE", "5")),
        max_overflow=int(os.getenv("INFORMIX_MAX_OVERFLOW", "5")),
        # SQLAlchemy's default pre-ping for ibm_db_sa hits sysibm.sysdummy1,
        # which is valid for DB2 but not for Informix.
        pool_pre_ping=False,
        pool_recycle=int(os.getenv("INFORMIX_POOL_RECYCLE", "1800")),
        pool_timeout=int(os.getenv("INFORMIX_POOL_TIMEOUT", "30")),
    )
    attach_informix_ping(engine)
    return engine


def attach_informix_ping(engine):
    @event.listens_for(engine.pool, "checkout")
    def test_connection(dbapi_connection, connection_record, connection_proxy):
        cursor = None
        try:
            cursor = dbapi_connection.cursor()
            cursor.execute(INFORMIX_PING_QUERY)
            cursor.fetchone()
        except Exception as err:
            try:
                dbapi_connection.close()
            except Exception:
                pass
            raise exc.DisconnectionError() from err
        finally:
            if cursor is not None:
                try:
                    cursor.close()
                except Exception:
                    pass


engine = build_engine()


def get_engine():
    return engine
