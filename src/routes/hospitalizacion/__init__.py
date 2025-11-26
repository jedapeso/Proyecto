from flask import Blueprint

hospitalizacion_bp = Blueprint('hospitalizacion', __name__, url_prefix='/hospitalizacion')

from . import views
