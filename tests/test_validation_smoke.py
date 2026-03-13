from pathlib import Path
import re

import pandas as pd


class FakeResult:
    def __init__(self, rows=None, scalar_value=None):
        self._rows = rows or []
        self._scalar_value = scalar_value

    def fetchall(self):
        return self._rows

    def fetchone(self):
        return self._rows[0] if self._rows else None

    def scalar(self):
        return self._scalar_value

    def mappings(self):
        return self

    def all(self):
        return self._rows


class FakeConnection:
    def execute(self, statement, params=None):
        sql = str(statement)

        if "SELECT UBICOD, UBINOM FROM UBICAH1" in sql:
            return FakeResult(rows=[("H1", "Hospitalizacion Piso 1"), ("UA", "UCI")])

        if "SELECT EMPNIT, NITRAZ FROM NIT1" in sql:
            return FakeResult(rows=[("9001", "EPS Norte"), ("9002", "EPS Sur")])

        if "SELECT UBI, COUNT(*) AS CNT" in sql:
            return FakeResult(rows=[("H1", 5), ("UA", 2)])

        return FakeResult()

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


class FakeEngine:
    def connect(self):
        return FakeConnection()

    def begin(self):
        return FakeConnection()


def fake_hospitalizacion_read_sql(query, conn, params=None):
    sql = str(query)

    if "FROM CENSO1 C1" in sql and "CNT_ALTA" in sql:
        return pd.DataFrame({
            "ORDEN_UBI": [1, 4],
            "UBI": ["H1", "UA"],
            "OCUPADAS": [10, 3],
            "DISPONIBLES": [5, 1],
            "NO_HAB_SERV": [15, 4],
            "POR_OCU_SER": [66.67, 75.0],
            "POR_OCU_SER_TOT": [55.5, 12.5],
            "PROM_ESTANCIA": [4.2, 8.5],
            "CNT_ALTA": [1, 2],
        })

    if "TOTAL_OCUPADAS" in sql and "TOTAL_CAMAS" in sql:
        return pd.DataFrame({
            "TOTAL_OCUPADAS": [13],
            "TOTAL_CAMAS": [19],
        })

    if "SELECT ASEGURADOR, EDAD, DIAGNOSTICO, CIE10" in sql:
        return pd.DataFrame({
            "ASEGURADOR": ["EPS Norte", "EPS Norte", "EPS Sur"],
            "EDAD": [25, 72, 14],
            "DIAGNOSTICO": ["Dx1", "Dx2", "Dx3"],
            "CIE10": ["A00", "B00", "C00"],
        })

    if "SELECT SERVICIO," in sql and "FROM" in sql and "CENSO1" in sql:
        return pd.DataFrame({
            "SERVICIO": ["Hospitalizacion Piso 1", "UCI"],
            "HABITACION": ["101", "U1"],
            "HISTORIA": ["H001", "H002"],
            "IDENTIFICACION": ["123", "456"],
            "DIAS_ESTANCIA": [4, 8],
            "NOMBRE_COMPLETO": ["Paciente Uno", "Paciente Dos"],
            "SEXO": ["F", "M"],
            "GENERO": ["F", "M"],
            "ASEGURADOR": ["EPS Norte", "EPS Sur"],
            "EDAD": [34, 67],
            "CIE10": ["A00", "B00"],
            "DIAGNOSTICO": ["Dx1", "Dx2"],
        })

    if "SELECT UNIQUE" in sql and "PROM_ESTANCIA" in sql and "FROM CENSO1" in sql:
        return pd.DataFrame({
            "NO": [1, 4],
            "SERVICIO": ["Hospitalizacion Piso 1", "UCI"],
            "OCUPADAS": [10, 3],
            "DISPONIBLES": [5, 1],
            "FUERA_SERVICIO": [0, 0],
            "NO_HAB_SERV": [15, 4],
            "POR_OCU_SER": [66.67, 75.0],
            "POR_OCU_SER_TOT": [55.5, 12.5],
            "PROM_ESTANCIA": [4.2, 8.5],
        })

    raise AssertionError(f"Consulta no cubierta en fake_hospitalizacion_read_sql: {sql}")


def fake_facturacion_read_sql(query, conn, params=None):
    sql = str(query)

    if "FROM inemp" in sql:
        return pd.DataFrame({
            "empcod": ["001", "002"],
            "empnom": ["EPS Norte", "EPS Sur"],
        })

    raise AssertionError(f"Consulta no cubierta en fake_facturacion_read_sql: {sql}")


def test_healthz_reports_validation_mode(client):
    response = client.get("/healthz")

    assert response.status_code == 200
    assert response.get_json() == {"status": "ok", "validation_mode": True}


def test_core_dashboards_render(client):
    assert client.get("/").status_code == 200
    assert client.get("/urgencias/").status_code == 200
    assert client.get("/cirugia/").status_code == 200
    assert client.get("/hospitalizacion/").status_code == 200


def test_censo_endpoints_with_fake_engine(client, monkeypatch):
    from src.routes.hospitalizacion import views as hospitalizacion_views

    monkeypatch.setattr(hospitalizacion_views, "engine", FakeEngine())
    monkeypatch.setattr(hospitalizacion_views.pd, "read_sql", fake_hospitalizacion_read_sql)

    page = client.get("/hospitalizacion/censo")
    assert page.status_code == 200
    assert b"Servicio" in page.data

    empresas = client.post("/hospitalizacion/empresas_por_servicio", json={"serv": "H1"})
    assert empresas.status_code == 200
    assert len(empresas.get_json()) == 2

    servicios = client.post("/hospitalizacion/servicios_por_empresa", json={"empresa": "9001"})
    assert servicios.status_code == 200
    assert servicios.get_json()[0]["ubi"] == "TS"

    grafico = client.post("/hospitalizacion/datos_censo_grafico", json={"servicio": "TS", "empresa": ""})
    assert grafico.status_code == 200
    payload = grafico.get_json()
    assert payload["labels"] == ["H1", "UA"]
    assert payload["estancia_alta"] == [1, 2]

    analisis = client.post("/hospitalizacion/datos_analisis_adicionales", json={"servicio": "TS", "empresa": ""})
    assert analisis.status_code == 200
    analisis_payload = analisis.get_json()
    assert "asegurador" in analisis_payload
    assert "rango_edad" in analisis_payload

    excel = client.post("/hospitalizacion/reporte_censo", data={"servicio": "TS", "empresa": ""})
    assert excel.status_code == 200
    assert excel.mimetype == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def test_facturacion_dashboard_with_fake_engine(client, monkeypatch):
    from src.routes.facturacion import views as facturacion_views

    monkeypatch.setattr(facturacion_views, "engine", FakeEngine())
    monkeypatch.setattr(facturacion_views.pd, "read_sql", fake_facturacion_read_sql)

    response = client.get("/facturacion/")

    assert response.status_code == 200
    assert b"EPS Norte" in response.data


def test_static_assets_referenced_by_templates_exist():
    project_root = Path(__file__).resolve().parents[1]
    templates_dir = project_root / "src" / "templates"
    static_dir = project_root / "src" / "static"
    pattern = re.compile(r"filename='([^']+)'|filename=\"([^\"]+)\"")

    missing = []
    for template_path in templates_dir.rglob("*.html"):
        content = template_path.read_text(encoding="utf-8")
        for match in pattern.finditer(content):
            rel_path = match.group(1) or match.group(2)
            if rel_path.startswith("http"):
                continue
            asset_path = static_dir.joinpath(*rel_path.split("/"))
            if not asset_path.exists():
                missing.append((str(template_path.relative_to(project_root)), rel_path))

    assert not missing, f"Assets faltantes en templates: {missing}"
