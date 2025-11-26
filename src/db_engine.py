"""
src/db_engine.py
----------------
Módulo centralizado para la creación del engine de conexión a Informix.
Optimizado para uso compartido entre Flask y Celery.

✅ Características:
- Lee credenciales desde variables de entorno (docker-compose o .env).
- Mantiene la conexión estable con pool_recycle.
- Implementa un "ping" manual compatible con Informix (sin sysibm.sysdummy1).
- Evita el uso de pool_pre_ping que causa errores en Informix.
"""

import os
from sqlalchemy import create_engine, event

# ==========================================================
#  Configuración de conexión Informix
# ==========================================================
INFORMIX_SERVER = os.getenv("INFORMIX_SERVER", "clinical_drda")
INFORMIX_USER = os.getenv("INFORMIX_USER", "informix")
INFORMIX_PASSWORD = os.getenv("INFORMIX_PASSWORD", "migracion")
INFORMIX_DATABASE = os.getenv("INFORMIX_DATABASE", "clinical")
INFORMIX_HOST = os.getenv("INFORMIX_HOST", "192.168.0.3")
INFORMIX_PORT = os.getenv("INFORMIX_PORT", "1526")

# ==========================================================
#  Cadena de conexión Informix
# ==========================================================
conn_str = (
    f"ibm_db_sa://{INFORMIX_USER}:{INFORMIX_PASSWORD}@{INFORMIX_HOST}:{INFORMIX_PORT}/{INFORMIX_DATABASE};"
    f"Server={INFORMIX_SERVER};DB_LOCALE=en_US.819;CLIENT_LOCALE=en_US.819;"
    f"TRANSLATIONDLL=NONE;IFX_USE_STRENC=true;IFX_AUTOCOMMIT=1"
)

# ==========================================================
#  Creación del Engine optimizado
# ==========================================================
engine = create_engine(
    conn_str,
    pool_recycle=1800,  # 🔄 evita desconexiones prolongadas
)

# ==========================================================
#  Ping manual compatible con Informix
# ==========================================================
@event.listens_for(engine, "engine_connect")
def test_connection(connection, branch):
    """
    Verifica la validez de la conexión usando una tabla del sistema Informix.
    Evita errores causados por la tabla sysibm.sysdummy1 (inexistente en Informix).
    """
    if branch:
        return
    try:
        connection.exec_driver_sql("SELECT FIRST 1 1 FROM systables")
    except Exception:
        connection.invalidate()
        raise


# ==========================================================
#  Función auxiliar (opcional)
# ==========================================================
def get_engine():
    """
    Devuelve el engine global configurado.
    Útil para importar sin causar referencias circulares.
    """
    return engine
