from flask import Blueprint

archivo_bp = Blueprint('archivo', __name__, url_prefix='/archivo')

from . import views
