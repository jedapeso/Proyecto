from flask import Blueprint

cirugia_bp = Blueprint('cirugia', __name__, url_prefix='/cirugia')

from . import views
