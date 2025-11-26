from flask import Blueprint

# Crear el Blueprint del módulo de facturación
facturacion_bp = Blueprint('facturacion', __name__, url_prefix='/facturacion')

# Importar vistas
from . import views

# Importar tareas de Celery (para que se registren correctamente)
try:
    from . import tasks
    print("✅ [Facturación] Tareas de Celery registradas correctamente.")
except Exception as e:
    print(f"⚠️ [Facturación] No se pudieron registrar las tareas de Celery: {e}")

