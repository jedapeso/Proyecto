from flask import Blueprint, render_template, jsonify, current_app

main_bp = Blueprint('main', __name__)

@main_bp.route('/')
def index():
    return render_template('index.html')


@main_bp.route('/healthz')
def healthz():
    return jsonify({
        "status": "ok",
        "validation_mode": bool(current_app.config.get("VALIDATION_MODE", False)),
    })
