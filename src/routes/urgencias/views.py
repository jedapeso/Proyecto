from flask import render_template, request, send_file
from src import engine
from sqlalchemy import text
from sqlalchemy.exc import OperationalError
from datetime import datetime
import pandas as pd
import io
import logging
from zipfile import ZipFile

# Para gestión de trabajos en background
import threading
import uuid
import tempfile
import os
import time

# Diccionario en memoria para seguir jobs: {job_id: {'status':..., 'log': StringIO(), 'file': path, 'error': None}}
jobs = {}
jobs_lock = threading.Lock()

logging.basicConfig(level=logging.DEBUG)


def run_cir256_job(job_id, fecha_inicio, fecha_fin):
    """Ejecuta la lógica de CIR256 en un hilo separado, escribiendo logs en jobs[job_id]['log'] y guardando ZIP en jobs[job_id]['file']."""
    with jobs_lock:
        jobs[job_id]['status'] = 'running'
        jobs[job_id]['error'] = None

    try:
        with jobs_lock:
            jobs[job_id]['phase'] = 'starting'
            jobs[job_id]['phase_text'] = 'Iniciando la extracción y depuración de Datos'

        with engine.begin() as conn:
            logging.debug("⚙️ Ejecutando procedimiento SP_Cir256 (background)...")
            conn.execute(text("EXECUTE PROCEDURE SP_Cir256(:fini, :ffin)"), {
                'fini': fecha_inicio,
                'ffin': fecha_fin
            })

            # Tras ejecutar SP: pasar a fase de generación/anexos
            with jobs_lock:
                jobs[job_id]['phase'] = 'anexos'
                jobs[job_id]['phase_text'] = 'Generando Anexos Técnicos y Empaquetando'

            # Leer tablas generadas
            df_resumen = pd.read_sql("SELECT * FROM total;", conn)
            df_detalle = pd.read_sql("SELECT * FROM rep256final;", conn)

            excel_buffer = io.BytesIO()
            with pd.ExcelWriter(excel_buffer, engine='xlsxwriter') as writer:
                df_resumen.to_excel(writer, sheet_name='Resumen', index=False)
                df_detalle.to_excel(writer, sheet_name='Detalle', index=False)
            excel_buffer.seek(0)

            # TXT plano combinando anexos
            anexos = ['anexotec1', 'anexotec3', 'anexotec4', 'anexotec5', 'anexotec6']
            txt_total = ''
            for tabla in anexos:
                try:
                    df = pd.read_sql(f"SELECT * FROM {tabla};", conn)
                    if not df.empty:
                        df_clean = df.replace(['None', 'none'], '')
                        txt_total += df_clean.to_csv(
                            sep='|', index=False, header=False, lineterminator='\n'
                        )
                        logging.debug(f"✅ {tabla} añadido con {df.shape[0]} registros.")
                    else:
                        logging.debug(f"⚠️ {tabla} está vacía.")
                except Exception as ex:
                    logging.warning(f"❌ {tabla} omitido. Detalle: {ex}")

            if not txt_total.strip():
                logging.warning("⚠️ No hay datos en los anexos para generar el TXT")

            fecha_txt = datetime.strptime(fecha_fin, "%Y-%m-%d").strftime("%Y%m%d")
            nombre_txt = f"MCA195MOCA{fecha_txt}NI000890100275C01.txt"

            txt_buffer = io.BytesIO(txt_total.encode('utf-8-sig'))
            txt_buffer.seek(0)

            # Crear ZIP en archivo temporal
            tmp = tempfile.NamedTemporaryFile(prefix=f'cir256_{job_id}_', suffix='.zip', delete=False)
            try:
                with ZipFile(tmp, 'w') as zipf:
                    zipf.writestr(f'CIR256_{fecha_inicio}_a_{fecha_fin}.xlsx', excel_buffer.read())
                    zipf.writestr(nombre_txt, txt_buffer.read())
                tmp.flush()
                tmp.close()

                with jobs_lock:
                    jobs[job_id]['file'] = tmp.name
                    jobs[job_id]['download_name'] = f"CIR256_{fecha_inicio}_a_{fecha_fin}.zip"
                    jobs[job_id]['status'] = 'finished'
                    jobs[job_id]['phase'] = 'finished'
                    jobs[job_id]['phase_text'] = 'Archivo finalizado con éxito.'
                logging.info("✅ Job %s finalizado correctamente. ZIP: %s", job_id, tmp.name)
            except Exception as ex:
                logging.error("❌ Error al crear ZIP para job %s: %s", job_id, ex, exc_info=True)
                with jobs_lock:
                    jobs[job_id]['status'] = 'error'
                    jobs[job_id]['error'] = str(ex)
                    jobs[job_id]['phase'] = 'error'
                    jobs[job_id]['phase_text'] = 'Error al empaquetar el archivo'
    except Exception as e:
        logging.error("❌ Error en ejecución de SP_Cir256 para job %s: %s", job_id, e, exc_info=True)
        with jobs_lock:
            jobs[job_id]['status'] = 'error'
            jobs[job_id]['error'] = str(e)
            jobs[job_id]['phase'] = 'error'
            jobs[job_id]['phase_text'] = 'Error durante la extracción/generación de datos'
    finally:
        # Asegurar corrección final: si archivo existe en disco, marcar como finalizado
        try:
            with jobs_lock:
                file_path = jobs[job_id].get('file')
                if file_path and os.path.exists(file_path) and jobs[job_id].get('status') != 'finished':
                    logging.debug("🔁 Final auto-correction for job %s in finally block", job_id)
                    jobs[job_id]['status'] = 'finished'
                    jobs[job_id]['phase'] = 'finished'
                    jobs[job_id]['phase_text'] = 'Archivo finalizado con éxito.'
        except Exception:
            logging.exception("❌ Error during final auto-correction for job %s", job_id)

from . import urgencias_bp

@urgencias_bp.route('/', methods=['GET'])
def dashboard():
    return render_template('urgencias/dashboard.html')

# REPORTE DE OPORTUNIDAD
@urgencias_bp.route('/oportunidad', methods=['POST'])
def oportunidad():
    fecha_inicio = request.form.get('fecha_inicio')
    fecha_fin = request.form.get('fecha_fin')

    if not fecha_inicio or not fecha_fin:
        # Faltan fechas, no ejecutar SP
        return render_template('urgencias/dashboard.html')

    try:
        with engine.begin() as conn:
            conn.execute(
                text("EXECUTE PROCEDURE SP_Rec_Episodios_Urg(:fini, :ffin)"),
                {'fini': fecha_inicio, 'ffin': fecha_fin}
            )
            conn.execute(text("EXECUTE PROCEDURE SP_Oportunidad_Atencion_Urgencias()"))
            df = pd.read_sql("SELECT * FROM reportt1;", conn)

        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
            df.to_excel(writer, index=False)

        output.seek(0)
        return send_file(
            output,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            as_attachment=True,
            download_name=f'Oportunidad_{fecha_inicio}_a_{fecha_fin}.xlsx'
        )
    except Exception as e:
        return f"Error al generar reporte de oportunidad: {e}", 500

# REPORTE DE ENDOSCOPIA
@urgencias_bp.route('/endoscopia', methods=['POST'])
def endoscopia():
    fecha_inicio = request.form.get('fecha_inicio')
    fecha_fin = request.form.get('fecha_fin')

    if not fecha_inicio or not fecha_fin:
        return render_template('urgencias/dashboard.html')

    try:
        with engine.begin() as conn:
            conn.execute(
                text("EXECUTE PROCEDURE SP_Est_Endoscopiad(:fini, :ffin)"),
                {'fini': fecha_inicio, 'ffin': fecha_fin}
            )
            df = pd.read_sql("SELECT * FROM estendos;", conn)

        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
            df.to_excel(writer, index=False)

        output.seek(0)
        return send_file(
            output,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            as_attachment=True,
            download_name=f'Endoscopia_{fecha_inicio}_a_{fecha_fin}.xlsx'
        )
    except Exception as e:
        return f"Error al generar reporte de endoscopia: {e}", 500
    

#Resolucion 256
# Endpoint para iniciar job de CIR256 en background
@urgencias_bp.route('/cir256/start', methods=['POST'])
def cir256_start():
    data = request.get_json() or {}
    fecha_inicio = data.get('fecha_inicio')
    fecha_fin = data.get('fecha_fin')

    if not fecha_inicio or not fecha_fin:
        return { 'error': 'Faltan fechas' }, 400

    # Pre-check rápido: comprobar que systables es accesible
    try:
        with engine.begin() as conn:
            conn.execute(text("SELECT FIRST 1 tabid FROM systables"))
    except Exception as ex:
        logging.error("❌ No se puede leer 'systables' en pre-check de inicio de job: %s", ex, exc_info=True)
        return { 'error': 'No se puede leer el catálogo del sistema (systables). Contacte al DBA.' }, 500

    job_id = str(uuid.uuid4())
    with jobs_lock:
        jobs[job_id] = {
            'status': 'queued',
            'phase': 'queued',
            'phase_text': 'En cola para iniciar',
            'file': None,
            'download_name': None,
            'error': None
        }

    # Lanzar hilo que ejecuta el job
    thread = threading.Thread(target=run_cir256_job, args=(job_id, fecha_inicio, fecha_fin), daemon=True)
    thread.start()

    logging.info("➡️ Iniciado job CIR256 %s para %s - %s", job_id, fecha_inicio, fecha_fin)
    return { 'job_id': job_id }, 202


@urgencias_bp.route('/cir256/status/<job_id>', methods=['GET'])
def cir256_status(job_id):
    with jobs_lock:
        job = jobs.get(job_id)
        if not job:
            return { 'error': 'Job no encontrado' }, 404

        # Recalcular y autocorregir estado si el archivo existe en disco
        file_path = job.get('file')
        if file_path and os.path.exists(file_path) and job.get('status') != 'finished':
            logging.debug("🔁 Auto-correcting phase for job %s because file exists on disk", job_id)
            job['status'] = 'finished'
            job['phase'] = 'finished'
            job['phase_text'] = 'Archivo finalizado con éxito.'

        status = job.get('status')
        phase = job.get('phase')
        phase_text = job.get('phase_text')
        has_file = bool(job.get('file'))
        error = job.get('error')

    return {
        'status': status,
        'phase': phase,
        'phase_text': phase_text,
        'has_file': has_file,
        'error': error
    }


@urgencias_bp.route('/cir256/download/<job_id>', methods=['GET'])
def cir256_download(job_id):
    with jobs_lock:
        job = jobs.get(job_id)
        if not job:
            return "Job no encontrado", 404
        if job['status'] != 'finished' or not job.get('file'):
            return "El archivo no está listo", 400
        file_path = job['file']
        download_name = job.get('download_name') or os.path.basename(file_path)

    # Usar send_file del werkzeug para servir el ZIP con el nombre correcto
    return send_file(file_path, mimetype='application/zip', as_attachment=True, download_name=download_name)

# (Nota: el route sincrónico original se mantiene por compatibilidad, pero ahora existe la opción asíncrona)