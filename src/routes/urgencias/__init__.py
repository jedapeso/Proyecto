from flask import Blueprint

urgencias_bp = Blueprint('urgencias', __name__, url_prefix='/urgencias')

from . import views
