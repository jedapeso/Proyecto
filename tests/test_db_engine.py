import pytest

from src import db_engine


def test_build_engine_disables_db2_pre_ping_for_informix(monkeypatch):
    captured = {}

    class FakeEngine:
        def __init__(self):
            self.pool = object()

    fake_engine = FakeEngine()

    def fake_create_engine(url, **kwargs):
        captured["url"] = url
        captured["kwargs"] = kwargs
        return fake_engine

    def fake_listens_for(target, event_name):
        captured["event_target"] = target
        captured["event_name"] = event_name

        def decorator(fn):
            captured["listener"] = fn
            return fn

        return decorator

    monkeypatch.setattr(db_engine, "create_engine", fake_create_engine)
    monkeypatch.setattr(db_engine.event, "listens_for", fake_listens_for)

    engine = db_engine.build_engine(False)

    assert engine is fake_engine
    assert captured["url"].startswith("ibm_db_sa://")
    assert captured["kwargs"]["pool_pre_ping"] is False
    assert captured["event_target"] is fake_engine.pool
    assert captured["event_name"] == "checkout"


def test_informix_ping_listener_uses_systables_and_invalidates(monkeypatch):
    captured = {}

    def fake_listens_for(target, event_name):
        def decorator(fn):
            captured["listener"] = fn
            return fn

        return decorator

    monkeypatch.setattr(db_engine.event, "listens_for", fake_listens_for)

    class MarkerEngine:
        def __init__(self):
            self.pool = object()

    marker_engine = MarkerEngine()
    db_engine.attach_informix_ping(marker_engine)

    class FailingCursor:
        def execute(self, sql):
            assert sql == db_engine.INFORMIX_PING_QUERY
            raise RuntimeError("stale connection")

        def close(self):
            return None

    class FailingConnection:
        def __init__(self):
            self.closed = False

        def cursor(self):
            return FailingCursor()

        def close(self):
            self.closed = True

    connection = FailingConnection()

    with pytest.raises(db_engine.exc.DisconnectionError):
        captured["listener"](connection, object(), object())

    assert connection.closed is True
