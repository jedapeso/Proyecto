# src/__init__.py
import os

from flask import Flask

from src.db_engine import build_engine
from src.extensions import make_celery

try:
    from flask_compress import Compress
except ImportError:  # pragma: no cover - dependencia opcional
    Compress = None


engine = None


def is_validation_mode():
    return os.getenv("APP_VALIDATION_MODE", "0").lower() in {"1", "true", "yes", "on"}


def create_app(config_overrides=None):
    global engine

    app = Flask(__name__)
    app.secret_key = os.getenv("SECRET_KEY", "clave_dev_segura")
    app.config["VALIDATION_MODE"] = is_validation_mode()

    app.config.update(
        CELERY_BROKER_URL=os.getenv("CELERY_BROKER_URL", "redis://redis:6379/0"),
        CELERY_RESULT_BACKEND=os.getenv("CELERY_RESULT_BACKEND", "redis://redis:6379/0"),
        CELERY_TASK_SERIALIZER="json",
        CELERY_ACCEPT_CONTENT=["json"],
        CELERY_RESULT_SERIALIZER="json",
        CELERY_TIMEZONE="America/Bogota",
        GZIP_MIMETYPES=[
            "text/html",
            "text/css",
            "application/javascript",
            "application/json",
            "image/svg+xml",
        ],
        COMPRESS_MIMETYPES=[
            "text/html",
            "text/css",
            "application/javascript",
            "application/json",
            "image/svg+xml",
        ],
        COMPRESS_LEVEL=int(os.getenv("COMPRESS_LEVEL", "6")),
    )

    if config_overrides:
        app.config.update(config_overrides)

    if Compress is not None:
        Compress(app)

    make_celery(app)
    engine = build_engine(app.config["VALIDATION_MODE"])

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

    from .routes.archivo import archivo_bp
    app.register_blueprint(archivo_bp)

    return app
