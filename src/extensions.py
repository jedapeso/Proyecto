# src/extensions.py
import os
import time

from celery import Celery
import redis


def is_validation_mode():
    return os.getenv("APP_VALIDATION_MODE", "0").lower() in {"1", "true", "yes", "on"}


class NullRedis:
    """Implementacion minima para validacion local sin Redis real."""

    def __init__(self):
        self._store = {}
        self._types = {}
        self._expires_at = {}

    def _purge_if_expired(self, key):
        expires_at = self._expires_at.get(key)
        if expires_at is not None and expires_at <= time.time():
            self._store.pop(key, None)
            self._types.pop(key, None)
            self._expires_at.pop(key, None)

    def ping(self):
        return True

    def delete(self, *keys):
        deleted = 0
        for key in keys:
            self._purge_if_expired(key)
            if key in self._store:
                self._store.pop(key, None)
                self._types.pop(key, None)
                self._expires_at.pop(key, None)
                deleted += 1
        return deleted

    def hset(self, key, field, value):
        self._purge_if_expired(key)
        bucket = self._store.setdefault(key, {})
        self._types[key] = "hash"
        bucket[str(field)] = value
        return 1

    def hgetall(self, key):
        self._purge_if_expired(key)
        return dict(self._store.get(key, {}))

    def lrange(self, key, start, end):
        self._purge_if_expired(key)
        values = list(self._store.get(key, []))
        if end == -1:
            return values[start:]
        return values[start:end + 1]

    def rpush(self, key, value):
        self._purge_if_expired(key)
        bucket = self._store.setdefault(key, [])
        self._types[key] = "list"
        bucket.append(value)
        return len(bucket)

    def get(self, key):
        self._purge_if_expired(key)
        return self._store.get(key)

    def set(self, key, value, **kwargs):
        ex = kwargs.get("ex")
        self._store[key] = value
        self._types[key] = "string"
        if ex is not None:
            self._expires_at[key] = time.time() + int(ex)
        else:
            self._expires_at.pop(key, None)
        return True

    def setex(self, key, time_seconds, value):
        return self.set(key, value, ex=time_seconds)

    def exists(self, key):
        self._purge_if_expired(key)
        return int(key in self._store)

    def type(self, key):
        self._purge_if_expired(key)
        return self._types.get(key, "none")


celery = Celery(__name__)


def make_celery(app=None):
    """Configura Celery para usar el contexto de la app Flask."""
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


def get_redis_connection():
    """Crea una conexion Redis compartida para toda la app."""
    if is_validation_mode():
        return NullRedis()

    redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
    try:
        client = redis.Redis.from_url(redis_url, decode_responses=True)
        client.ping()
        print("Redis conectado correctamente.")
        return client
    except Exception as exc:
        print(f"No se pudo conectar a Redis: {exc}")
        return None


redis_client = get_redis_connection()
