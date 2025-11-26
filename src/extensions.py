# src/extensions.py
from celery import Celery
import redis
import os

# ==========================================================
#  INSTANCIA GLOBAL DE CELERY
# ==========================================================
celery = Celery(__name__)

def make_celery(app=None):
    """
    Configura Celery para usar el contexto de la app Flask.
    """
    if app:
        celery.conf.update(app.config)
        TaskBase = celery.Task

        class ContextTask(TaskBase):
            abstract = True
            def __call__(self, *args, **kwargs):
                with app.app_context():
                    return TaskBase.__call__(self, *args, **kwargs)

        celery.Task = ContextTask
    return celery


# ==========================================================
#  CLIENTE REDIS CENTRALIZADO
# ==========================================================
def get_redis_connection():
    """Crea una conexión Redis compartida para toda la app."""
    redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
    try:
        client = redis.Redis.from_url(redis_url, decode_responses=True)
        # Probar conexión
        client.ping()
        print("✅ Conectado a Redis correctamente.")
        return client
    except Exception as e:
        print(f"⚠️ No se pudo conectar a Redis: {e}")
        return None


# Instancia global
redis_client = get_redis_connection()
