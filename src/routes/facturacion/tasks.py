import io
import os
import time
import logging
import pandas as pd
from datetime import datetime
from sqlalchemy import text
from celery import chord
from celery.exceptions import Ignore
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email import encoders
from src.extensions import celery, redis_client as r
from src.db_engine import engine
from openpyxl import Workbook
import smtplib

# ==========================================================
# CONFIGURACIÓN SMTP
# ==========================================================
SMTP_USER = os.getenv("SMTP_USER", "incidencias@clinicadelcaribe.com")
SMTP_PASS = os.getenv("SMTP_PASS", "ih2e9v8jXjXN")
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.zoho.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", 465))

# ==========================================================
# KEYS / TIMEOUTS
# ==========================================================
LOCK_KEY = "lock:reporte_cargos"
LOCK_TIMEOUT = 7200            # 2 horas por seguridad (ajusta según tu necesidad)
CANCEL_KEY = "cancel:reporte_cargos"

# ==========================================================
# UTILIDADES REDIS SEGURAS
# ==========================================================
def safe_delete(*keys):
    for key in keys:
        try:
            tipo = r.type(key)
            if tipo and tipo != b"none":
                r.delete(key)
        except Exception as e:
            logging.warning(f"No se pudo borrar clave {key}: {e}")

def safe_push_log(usuario_id, msg):
    """Guarda logs con timestamp local en Redis list logs:{usuario_id}"""
    try:
        r.rpush(f"logs:{usuario_id}", f"[{datetime.now().strftime('%H:%M:%S')}] {msg}")
    except Exception as e:
        logging.warning(f"No se pudo registrar log: {e}")

def safe_hset(key, field, value):
    """Setea un campo en hash, asegurando tipo hash en Redis."""
    try:
        tipo = r.type(key)
        if tipo not in [b"none", b"hash"]:
            r.delete(key)
        r.hset(key, field, value)
    except Exception as e:
        logging.error(f"❌ Error en safe_hset({key}, {field}): {e}")

def es_cancelado():
    """Verifica si el reporte fue cancelado manualmente (bool)."""
    try:
        return bool(r.exists(CANCEL_KEY))
    except Exception:
        return False

# ==========================================================
# TAREA PARA MARCAR CANCELACIÓN
# ==========================================================
@celery.task(name="cancelar_reporte_cargos")
def cancelar_reporte_cargos():
    """Marca el proceso de reporte como cancelado en Redis."""
    try:
        r.set(CANCEL_KEY, "1", ex=600)  # 10 minutos por defecto
        logging.warning("🛑 Se marcó el proceso de reporte como CANCELADO.")
        return {"status": "cancelado", "mensaje": "El reporte fue cancelado correctamente."}
    except Exception as e:
        logging.error(f"❌ Error al marcar cancelación: {e}")
        return {"status": "error", "detalle": str(e)}

# ==========================================================
# SUBTAREA CELERY - PROCESAR POR AÑO (Informix)
# ==========================================================
@celery.task(bind=True, name="procesar_anio")
def procesar_anio(self, usuario_id, anio):
    inicio = time.time()
    progreso_key = f"progreso:{usuario_id}"
    duraciones_key = f"duraciones:{usuario_id}"
    raw_conn = None
    cursor = None

    try:
        safe_hset(progreso_key, anio, "iniciado")
        safe_push_log(usuario_id, f"🟡 Iniciando procesamiento del año {anio}...")

        # Cancelación pre-ejecución
        if es_cancelado():
            safe_push_log(usuario_id, f"🛑 Cancelado antes de procesar el año {anio}.")
            safe_hset(progreso_key, anio, "cancelado")
            raise Ignore()

        # Conexión nativa a la BD (Informix)
        raw_conn = engine.raw_connection()
        cursor = raw_conn.cursor()

        # Ejecutar el procedimiento almacenado que genera DATOFINAL1
        cursor.execute(f"EXECUTE PROCEDURE sp_pendfacacd({anio});")

        # Checkpoints para detectar cancelación en ejecuciones largas
        # (mantén o ajusta según la duración real de tu SP)
        for _ in range(10):
            if es_cancelado():
                safe_push_log(usuario_id, f"🛑 Cancelado durante ejecución del año {anio}.")
                safe_hset(progreso_key, anio, "cancelado")
                raise Ignore()
            time.sleep(0.5)

        # Leer la tabla temporal DATOFINAL1 generada por el SP
        cursor.execute("SELECT * FROM DATOFINAL1;")
        columnas = [desc[0] for desc in cursor.description] if cursor.description else []
        datos = cursor.fetchall() if cursor.description else []

        # cerrar cursor y commit (manejo seguro)
        try:
            cursor.close()
        except Exception:
            pass
        try:
            raw_conn.commit()
        except Exception:
            pass

        if not datos:
            safe_push_log(usuario_id, f"⚠️ No se encontraron registros para {anio}.")
            safe_hset(progreso_key, anio, "sin_registros")
            return None

        df = pd.DataFrame(datos, columns=columnas)
        df["ANIO"] = anio

        duracion = round(time.time() - inicio, 2)
        safe_hset(duraciones_key, anio, duracion)
        safe_hset(progreso_key, anio, "finalizado")
        safe_push_log(usuario_id, f"✅ Año {anio} finalizado en {duracion:.2f} s.")

        return df.to_dict(orient="records")

    except Ignore:
        # terminar silenciosamente la subtarea si se solicitó cancelación
        raise

    except Exception as e:
        duracion = round(time.time() - inicio, 2)
        safe_hset(duraciones_key, anio, duracion)
        safe_hset(progreso_key, anio, "error")
        safe_push_log(usuario_id, f"❌ Error procesando año {anio}: {e}")
        logging.exception(e)
        return None

    finally:
        try:
            if cursor:
                cursor.close()
        except Exception:
            pass
        try:
            if raw_conn:
                raw_conn.close()
        except Exception:
            pass

# ==========================================================
# COMBINAR Y ENVIAR (callback del chord)
# ==========================================================
@celery.task(bind=True, name="combinar_y_enviar")
def combinar_y_enviar(self, resultados, usuario_id):
    """
    Callback del chord: concatena resultados, genera Excel y envía correo.
    - También garantiza la liberación del lock en el finally.
    """
    progreso_key = f"progreso:{usuario_id}"
    duraciones_key = f"duraciones:{usuario_id}"

    try:
        if es_cancelado():
            safe_push_log(usuario_id, "🛑 Cancelación detectada antes del envío.")
            safe_hset(progreso_key, "estado_global", "cancelado")
            r.set(f"finalizado:{usuario_id}", "true", ex=3600)
            return

        safe_push_log(usuario_id, "📊 Combinando resultados...")

        # Recuperar inicio_real (registrado en ejecutar_reporte_cargos) para medir tiempo real
        inicio_real = None
        try:
            raw_inicio = r.get(f"inicio_real:{usuario_id}")
            if raw_inicio:
                inicio_real = float(raw_inicio)
        except Exception:
            inicio_real = None
        if not inicio_real:
            inicio_real = time.time()

        resultados_validos = [pd.DataFrame(r) for r in resultados if r is not None and len(r) > 0]
        if not resultados_validos:
            safe_push_log(usuario_id, "⚠️ No se encontraron datos válidos.")
            # marcar finalizado para que frontend deje de esperar
            r.set(f"finalizado:{usuario_id}", "true", ex=3600)
            return

        df_final = pd.concat(resultados_validos, ignore_index=True)
        safe_push_log(usuario_id, f"🔢 Total de filas: {len(df_final)}")

        # Generar Excel en memoria
        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
            df_final.to_excel(writer, index=False, sheet_name="CargosPendientes")
        output.seek(0)
        safe_push_log(usuario_id, "✅ Excel generado en memoria.")

        # Preparar correo
        remitente = SMTP_USER
        destinatario = "ast_sistemas@clinicadelcaribe.com"
        asunto = f"Reporte Cargos Pendientes - {datetime.now():%Y-%m-%d %H:%M}"

        msg = MIMEMultipart()
        msg["From"] = remitente
        msg["To"] = destinatario
        msg["Subject"] = asunto
        msg.attach(MIMEText("Adjunto el reporte de cargos pendientes.", "plain"))

        part = MIMEBase("application", "vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        part.set_payload(output.getvalue())
        encoders.encode_base64(part)
        part.add_header("Content-Disposition", "attachment", filename=f"CargosPendientes_{datetime.now():%Y%m%d}.xlsx")
        msg.attach(part)

        safe_push_log(usuario_id, "📧 Enviando correo...")
        with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT) as server:
            server.login(remitente, SMTP_PASS)
            server.sendmail(remitente, destinatario, msg.as_string())

        # Duración total real (desde inicio_real hasta ahora)
        fin_real = time.time()
        duracion_total_real = round(fin_real - inicio_real, 2)

        safe_push_log(usuario_id, f"✅ Reporte enviado correctamente.")
        safe_push_log(usuario_id, f"⏱️ Duración total real: {duracion_total_real:.2f} s.")

        # Marcar finalizado para el frontend
        r.set(f"finalizado:{usuario_id}", "true", ex=3600)

    except Exception as e:
        safe_push_log(usuario_id, f"❌ Error combinando o enviando: {e}")
        safe_hset(progreso_key, "estado_global", "error")
        logging.exception(e)

    finally:
        # Siempre intentar liberar lock y limpiar marca de cancelación
        try:
            liberar_lock_task.apply_async()
        except Exception as e:
            logging.error(f"❌ No se pudo lanzar liberar_lock_task: {e}")
        try:
            r.delete(CANCEL_KEY)
        except Exception:
            pass

# ==========================================================
# TAREA PARA LIBERAR EL LOCK
# ==========================================================
@celery.task(name="liberar_lock_task")
def liberar_lock_task():
    """Libera el candado global cuando el proceso termina o falla."""
    try:
        if r.exists(LOCK_KEY):
            r.delete(LOCK_KEY)
            logging.info("🔓 Lock global liberado correctamente.")
        else:
            logging.info("ℹ️ Lock global ya había expirado.")
    except Exception as e:
        logging.error(f"❌ Error liberando lock: {e}")

# ==========================================================
# TAREA PRINCIPAL (ORQUESTADOR)
# ==========================================================
@celery.task(bind=True, name="ejecutar_reporte_cargos")
def ejecutar_reporte_cargos(self, usuario_id, anios):
    progreso_key = f"progreso:{usuario_id}"
    duraciones_key = f"duraciones:{usuario_id}"
    finalizado_key = f"finalizado:{usuario_id}"
    log_key = f"logs:{usuario_id}"

    # Evitar procesos simultáneos
    if r.exists(LOCK_KEY):
        msg = "⚙️ El reporte ya está en ejecución. Espere a que finalice."
        safe_push_log(usuario_id, msg)
        return {"status": "bloqueado", "mensaje": msg}

    # Intentar establecer el candado con TTL
    try:
        acquired = r.set(LOCK_KEY, "locked", nx=True, ex=LOCK_TIMEOUT)
        if not acquired:
            msg = "⚙️ Otro proceso ya está en ejecución. Intente más tarde."
            safe_push_log(usuario_id, msg)
            return {"status": "bloqueado", "mensaje": msg}
    except Exception as e:
        logging.error(f"❌ Error estableciendo lock: {e}")
        return {"status": "error", "detalle": str(e)}

    try:
        # Limpieza inicial (incluye limpiar marca de cancelación para empezar limpio)
        safe_delete(log_key, progreso_key, duraciones_key, finalizado_key, CANCEL_KEY)
        for anio in anios:
            safe_hset(progreso_key, anio, "pendiente")

        safe_push_log(usuario_id, "🚀 Iniciando reporte de cargos pendientes...")
        # Registrar inicio real (para medir tiempo total incluso en cola)
        try:
            r.set(f"inicio_real:{usuario_id}", time.time(), ex=86400)
        except Exception:
            pass

        # Crear subtareas por año y lanzar chord
        subtareas = [procesar_anio.s(usuario_id, anio) for anio in anios]
        flujo = chord(subtareas)(combinar_y_enviar.s(usuario_id))

        # Retornar inmediatamente; combinar_y_enviar y liberar_lock_task gestionan el cierre
        return {"status": "started", "anios": anios}

    except Exception as e:
        # En caso de fallo crítico, intentar liberar lock
        try:
            liberar_lock_task.apply_async()
        except Exception:
            pass
        logging.exception(e)
        return {"status": "error", "detalle": str(e)}
