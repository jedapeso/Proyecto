from flask import render_template, request, send_file, jsonify
from src import engine
from sqlalchemy import text
import pandas as pd
import logging
import io
import json
import uuid
from . import facturacion_bp
from src.extensions import redis_client as r
from src.routes.facturacion.tasks import ejecutar_reporte_cargos, cancelar_reporte_cargos


# ==========================================================
# 🧭 DASHBOARD PRINCIPAL
# ==========================================================
@facturacion_bp.route('/', methods=['GET'])
def dashboard():
    """
    Carga la lista de convenios para la vista principal.
    """
    try:
        with engine.connect() as conn:
            convenios = pd.read_sql("""
                SELECT DISTINCT empcod, empnom 
                FROM inemp 
                WHERE empact='S' 
                AND EMPTIP NOT IN ('PM','50','55','60','61','45') 
                ORDER BY empnom
            """, conn)
        convenios_lista = [f"{row['empnom']} | {row['empcod']}" for _, row in convenios.iterrows()]
        return render_template('facturacion/dashboard.html', convenios=convenios_lista)
    except Exception as e:
        logging.error(f"❌ Error al cargar dashboard: {e}", exc_info=True)
        return "Error al cargar convenios", 500


# ==========================================================
# 📘 REPORTE 1 - TARIFA CONVENIOS
# ==========================================================
@facturacion_bp.route('/generar-excel', methods=['POST'])
def generar_excel():
    """
    Genera Excel con múltiples hojas para un convenio.
    """
    seleccionado = request.form.get('convenio')
    if not seleccionado or ' | ' not in seleccionado:
        return "Convenio no proporcionado", 400
    nombre, codigo = seleccionado.split(' | ', 1)

    try:
        with engine.begin() as conn:
            conn.execute(text("EXECUTE PROCEDURE Sp_TarifaConveniod(:c)"), {'c': codigo})
            tablas = {
                "EXÁMENES": "EXAMENES1",
                "PROCEDIMIENTOS": "PROCEDIMIENTOS1",
                "MEDICAMENTOS": "MEDICAMENTOS1",
                "MEDICAMENTOS REGULADOS": "MEDICAMENTOSREG1",
                "INSUMOS": "INSUMOS1",
                "INSUMOS REGULADOS": "INSUMOSREG1",
                "ESTANCIAS": "ESTANCIAS1"
            }

            output = io.BytesIO()
            with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
                for hoja, tabla in tablas.items():
                    try:
                        df = pd.read_sql(f"SELECT * FROM {tabla}", conn)
                        if not df.empty:
                            df.to_excel(writer, sheet_name=hoja[:31], index=False)
                    except Exception:
                        continue

            output.seek(0)
            return send_file(
                output,
                mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                as_attachment=True,
                download_name=f'Facturacion_{nombre.strip()}.xlsx'
            )
    except Exception as e:
        logging.error(f"❌ Error al generar Excel: {e}", exc_info=True)
        return f"Error al generar Excel: {e}", 500


# ==========================================================
# 💊 REPORTE 2 - MEDICAMENTOS / INSUMOS
# ==========================================================
@facturacion_bp.route('/generar-excel-medinsumos', methods=['POST'])
def generar_excel_medinsumos():
    """
    Genera Excel con dos hojas: Medicamentos e Insumos.
    """
    seleccionado = request.form.get('convenio')
    if not seleccionado or ' | ' not in seleccionado:
        return "Convenio no proporcionado", 400
    nombre, codigo = seleccionado.split(' | ', 1)

    try:
        with engine.begin() as conn:
            conn.execute(text("EXECUTE PROCEDURE Sp_TarifasMed_Insd(:convenio)"), {'convenio': codigo})
            medicamentos = pd.read_sql("SELECT * FROM MEDICAINVI1;", conn)
            insumos = pd.read_sql("SELECT * FROM INSUMINVI1;", conn)

            output = io.BytesIO()
            with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
                medicamentos.to_excel(writer, index=False, sheet_name='Medicamentos')
                insumos.to_excel(writer, index=False, sheet_name='Insumos')
            output.seek(0)

        return send_file(
            output,
            download_name=f"Medicamentos_Insumos_{nombre}.xlsx",
            as_attachment=True,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
    except Exception as e:
        logging.error(f"❌ Error en med_insumos: {e}", exc_info=True)
        return "Error al generar el reporte", 500


# ==========================================================
# ⚙️ REPORTE 3 - CARGOS PENDIENTES (TAREAS CELERY)
# ==========================================================
@facturacion_bp.route('/enviar_reporte_cargos', methods=['POST'])
def enviar_reporte_cargos():
    """
    Lanza el proceso completo en background usando Celery.
    """
    try:
        usuario_id = str(uuid.uuid4())
        anios = list(range(2006, 2025 + 1))

        # Limpieza previa en Redis
        for key in [f"duraciones:{usuario_id}", f"progreso:{usuario_id}", f"finalizado:{usuario_id}", f"logs:{usuario_id}"]:
            r.delete(key)

        # Estado inicial
        for a in anios:
            r.hset(f"progreso:{usuario_id}", a, "pendiente")

        # Lanzar proceso Celery
        ejecutar_reporte_cargos.delay(usuario_id, anios)

        logging.info(f"🚀 Reporte de cargos iniciado: {usuario_id}")

        return jsonify({
            "status": "started",
            "usuario_id": usuario_id,
            "anios": anios
        })
    except Exception as e:
        logging.error(f"❌ Error al iniciar reporte de cargos: {e}", exc_info=True)
        return jsonify({"status": "error", "msg": str(e)}), 500


# ==========================================================
# 🔍 CONSULTAR ESTADO Y LOGS
# ==========================================================
@facturacion_bp.route('/reporte_cargos_logs/<usuario_id>')
def reporte_cargos_logs(usuario_id):
    """
    Devuelve progreso, duración y logs desde Redis.
    """
    def safe_decode(v):
        return v.decode("utf-8", errors="ignore") if isinstance(v, bytes) else str(v)

    try:
        progreso = {safe_decode(k): safe_decode(v) for k, v in r.hgetall(f"progreso:{usuario_id}").items()}
        duraciones = {safe_decode(k): safe_decode(v) for k, v in r.hgetall(f"duraciones:{usuario_id}").items()}
        logs = [safe_decode(l) for l in r.lrange(f"logs:{usuario_id}", 0, -1)]
        finalizado_raw = r.get(f"finalizado:{usuario_id}")
        finalizado = safe_decode(finalizado_raw).lower() == "true" if finalizado_raw else False

        # 🔁 Si no hay logs ni progreso, devolver estado neutro
        return jsonify({
            "progreso": progreso,
            "duraciones": duraciones,
            "logs": logs,
            "finalizado": finalizado
        })
    except Exception as e:
        logging.error(f"❌ Error al obtener progreso: {e}", exc_info=True)
        return jsonify({"error": str(e)}), 500


# ==========================================================
# 🔓 LIBERAR LOCK MANUAL
# ==========================================================
@facturacion_bp.route("/liberar_lock_cargos", methods=["POST"])
def liberar_lock_manual():
    """
    Permite liberar manualmente el candado Redis si algo quedó colgado.
    """
    lock_key = "lock:reporte_cargos"
    if r.delete(lock_key):
        return {"status": "ok", "msg": "🔓 Lock liberado correctamente."}
    else:
        return {"status": "no_lock", "msg": "⚪ No había lock activo."}


# ==========================================================
# 🛑 CANCELAR PROCESO (TAREA CELERY)
# ==========================================================
@facturacion_bp.route("/cancelar-reporte-cargos", methods=["POST"])
def cancelar_reporte_cargos_route():
    """
    Marca el proceso como cancelado desde Celery y Redis.
    """
    try:
        cancelar_reporte_cargos.apply_async()
        return jsonify({
            "status": "cancelado",
            "mensaje": "🛑 Proceso cancelado correctamente."
        }), 200
    except Exception as e:
        logging.error(f"❌ Error al cancelar proceso: {e}", exc_info=True)
        return jsonify({"status": "error", "mensaje": str(e)}), 500
