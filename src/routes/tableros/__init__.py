from flask import Blueprint

tableros_bp = Blueprint('tableros', __name__, url_prefix='/tableros')

from . import views
from . import viewsh
from . import viewsc
