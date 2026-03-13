import os
import sys
from pathlib import Path

import pytest


os.environ.setdefault("APP_VALIDATION_MODE", "1")
os.environ.setdefault("SECRET_KEY", "validation-secret")
PROJECT_ROOT = Path(__file__).resolve().parents[1]

if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


@pytest.fixture
def app():
    from src import create_app

    app = create_app({
        "TESTING": True,
        "WTF_CSRF_ENABLED": False,
    })
    return app


@pytest.fixture
def client(app):
    return app.test_client()
