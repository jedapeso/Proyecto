from flask import render_template, request, send_file
from src import engine
from sqlalchemy import text
from datetime import datetime
import pandas as pd
import io
import logging
from zipfile import ZipFile

logging.basicConfig(level=logging.DEBUG)

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
@urgencias_bp.route('/cir256', methods=['POST'])
def cir256():
    fecha_inicio = request.form.get('fecha_inicio')
    fecha_fin = request.form.get('fecha_fin')

    logging.debug(f"🔄 Iniciando ejecución de SP_Cir256: {fecha_inicio} a {fecha_fin}")

    try:
        with engine.begin() as conn:
            logging.debug("⚙️ Ejecutando procedimiento SP_Cir256...")
            conn.execute(text("EXECUTE PROCEDURE SP_Cir256(:fini, :ffin)"), {
                'fini': fecha_inicio,
                'ffin': fecha_fin
            })

            # Excel - Hoja única con rep256final
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
                return "⚠️ No hay datos en los anexos para generar el TXT", 204

            fecha_txt = datetime.strptime(fecha_fin, "%Y-%m-%d").strftime("%Y%m%d")
            nombre_txt = f"MCA195MOCA{fecha_txt}NI000890100275C01.txt"

            txt_buffer = io.BytesIO(txt_total.encode('utf-8-sig'))
            txt_buffer.seek(0)

            # Crear ZIP
            zip_buffer = io.BytesIO()
            with ZipFile(zip_buffer, 'w') as zipf:
                zipf.writestr(f'CIR256_{fecha_inicio}_a_{fecha_fin}.xlsx', excel_buffer.read())
                zipf.writestr(nombre_txt, txt_buffer.read())
            zip_buffer.seek(0)

            return send_file(
                zip_buffer,
                mimetype='application/zip',
                as_attachment=True,
                download_name=f'CIR256_{fecha_inicio}_a_{fecha_fin}.zip'
            )

    except Exception as e:
        logging.error("❌ Error al generar el Excel de CIR256:", exc_info=True)
        return f"❌ Error al generar CIR256: {e}", 500