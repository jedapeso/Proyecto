# src/__init__.py
import os
from flask import Flask
from sqlalchemy import create_engine
from src.extensions import celery, redis_client, make_celery  # ✅ Importar make_celery

engine = None

def create_app():
    global engine
    app = Flask(__name__)
    app.secret_key = os.getenv("SECRET_KEY", "clave_dev_segura")

    # ==========================================================
    # Configuración de Celery / Redis
    # ==========================================================
    app.config.update(
        CELERY_BROKER_URL=os.getenv("CELERY_BROKER_URL", "redis://redis:6379/0"),
        CELERY_RESULT_BACKEND=os.getenv("CELERY_RESULT_BACKEND", "redis://redis:6379/0"),
        CELERY_TASK_SERIALIZER="json",
        CELERY_ACCEPT_CONTENT=["json"],
        CELERY_RESULT_SERIALIZER="json",
        CELERY_TIMEZONE="America/Bogota"
    )

    # Vincular Celery con Flask
    make_celery(app)

    # ==========================================================
    # Configuración de base de datos Informix
    # ==========================================================
    HOST = os.getenv('INFORMIX_HOST', '192.168.0.3')
    PORT = os.getenv('INFORMIX_PORT', '1526')
    DATABASE = os.getenv('INFORMIX_DATABASE', 'clinical')
    USER = os.getenv('INFORMIX_USER', 'informix')
    PASSWORD = os.getenv('INFORMIX_PASSWORD', 'migracion')
    SERVER = os.getenv('INFORMIX_SERVER', 'clinical_drda')

    conn_str = (
        f"ibm_db_sa://{USER}:{PASSWORD}@{HOST}:{PORT}/{DATABASE};"
        f"Server={SERVER};"
    )
    engine = create_engine(conn_str)

    # ==========================================================
    # Registrar blueprints
    # ==========================================================
    from .routes.main import main_bp
    app.register_blueprint(main_bp)

    from .routes.urgencias import urgencias_bp
    app.register_blueprint(urgencias_bp)

    from .routes.cirugia import cirugia_bp
    app.register_blueprint(cirugia_bp)

    from .routes.facturacion import facturacion_bp
    app.register_blueprint(facturacion_bp, url_prefix="/facturacion")

    from .routes.hospitalizacion import hospitalizacion_bp
    app.register_blueprint(hospitalizacion_bp)

    from .routes.tableros import tableros_bp
    app.register_blueprint(tableros_bp)

    print("✅ Aplicación Flask creada correctamente con Celery.")
    return app
