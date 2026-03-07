from flask import Blueprint

# Crear el Blueprint del módulo de facturación
facturacion_bp = Blueprint('facturacion', __name__, url_prefix='/facturacion')

# Importar vistas
from . import views

# Importar tareas de Celery (para que se registren correctamente)
try:
    from . import tasks
except Exception as e:
    pass

