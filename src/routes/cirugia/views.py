from flask import render_template, request, send_file
from src import engine
from sqlalchemy import text
import pandas as pd
import io

from . import cirugia_bp

@cirugia_bp.route('/', methods=['GET'])
def dashboard():
    return render_template('cirugia/dashboard.html')

@cirugia_bp.route('/estadisticas', methods=['POST'])
def estadisticas():
    from flask import send_file
    import pandas as pd
    import io

    fecha_inicio = request.form.get('fecha_inicio')
    fecha_fin = request.form.get('fecha_fin')

    if not fecha_inicio or not fecha_fin:
        return render_template('cirugia/dashboard.html')

    try:
        with engine.begin() as conn:
            # Ejecutar SP que llena las tablas temporales
            conn.execute(
                text("EXECUTE PROCEDURE SP_RecCirugias_Estadisticasd(:fini, :ffin)"),
                {'fini': fecha_inicio, 'ffin': fecha_fin}
            )

            # Diccionario con nombre de hoja y tabla
            tablas = {
                'POR TIPO ANESTESIA': "CIRTIPANE",
                'POR EDAD': "CIREDAD",
                'POR EMPRESA': "CIREMPR",
                'POR RESPONSABLE': "CIRRESP",
                'POR ESPECIALIDAD': "CIRESPC",
                'POR MEDICO': "CIRMEDIC",
                'POR DURACION': "CIRDURA",
                'DETALLADO': "CIRDETA",
                '10 MAS COMUNES': "CIRMASCO",
                'POR TIEMPO ESPERA': "CIRPROG",
                'POR TIPO': "CIRTIPO",
                'RESUMEN': "RESUMEN",
                'POR REINTERVENCION': "REINTER",
                'POR COMPLICACION': "CIRCOMPLICA",
                'OPORTUNIDAD ATENCION': "CIRDATFIN",
            }

            output = io.BytesIO()
            with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
                for nombre_hoja, tabla in tablas.items():
                    try:
                        df = pd.read_sql(f"SELECT * FROM {tabla}", conn)
                        if not df.empty:
                            df.to_excel(writer, sheet_name=nombre_hoja[:31], index=False)
                    except Exception as e:
                        print(f"⚠️ Error con tabla {tabla}: {e}")
                        continue  # omite tablas con error

        output.seek(0)
        return send_file(
            output,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            as_attachment=True,
            download_name=f'Estadisticas_Cirugia_{fecha_inicio}_a_{fecha_fin}.xlsx'
        )

    except Exception as e:
        return f"❌ Error al generar reporte de Estadísticas de Cirugía: {e}", 500

#PROGRAMACION DE TURNOS
@cirugia_bp.route('/programacion-turnos-excel', methods=['POST'])
def programacion_turnos_excel():
    from flask import send_file
    import io
    import pandas as pd

    fecha_inicio = request.form.get('fecha_inicio')
    fecha_fin = request.form.get('fecha_fin')

    if not fecha_inicio or not fecha_fin:
        return render_template('cirugia/dashboard.html')

    try:
        with engine.begin() as conn:
            conn.execute(text("EXECUTE PROCEDURE Sp_Programacion_Turnos_Cxd(:fini, :ffin)"), {
                'fini': fecha_inicio,
                'ffin': fecha_fin
            })

            df = pd.read_sql("SELECT * FROM REPTURNO1 ORDER BY 2", conn)
            df.columns = [
                'Fecha', 'Quirófano', 'Hora Inicial', 'Hora Final', 'Tipo Id', 'ID',
                'Id Único', 'Nombre', 'Edad', 'Teléfono', 'H/A', 'Responsable',
                'Procedimiento', 'Cirujano', 'Anestesiólogo', 'Observaciones'
            ]

        output = io.BytesIO()
        with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
            workbook = writer.book
            worksheet = workbook.add_worksheet('Programación Turnos')
            writer.sheets['Programación Turnos'] = worksheet

            # Formatos
            titulo_format = workbook.add_format({'bold': True, 'align': 'center', 'valign': 'vcenter', 'font_size': 12})
            quir_format = workbook.add_format({'bold': True, 'bg_color': '#BDD7EE', 'border': 1, 'align': 'center'})
            header_format = workbook.add_format({'bold': True, 'bg_color': '#D9E1F2', 'border': 1, 'align': 'center'})
            center_wrap_format = workbook.add_format({'border': 1, 'align': 'center', 'valign': 'vcenter', 'text_wrap': True})
            gray_format = workbook.add_format({'bg_color': '#F2F2F2', 'border': 1, 'align': 'center', 'valign': 'vcenter', 'text_wrap': True})

            # Anchos de columnas
            col_widths = [11, 10, 10, 7, 10, 10, 20, 20, 6, 12, 5, 25, 30, 20, 20, 25]
            for col_num, width in enumerate(col_widths):
                worksheet.set_column(col_num, col_num, width)

            row = 6  # Comienza después de márgenes
            pagebreaks = []

            for quir, grupo in df.groupby("Quirófano"):
                if row > 6:
                    pagebreaks.append(row)

                worksheet.merge_range(row, 0, row, len(df.columns) - 1, "PROGRAMACIÓN TURNOS CIRUGÍA", titulo_format)
                row += 1

                quir_name = f"QUIRÓFANO {int(quir):03}"
                worksheet.merge_range(row, 0, row, len(df.columns) - 1, quir_name, quir_format)
                row += 1

                for col_num, col_name in enumerate(df.columns):
                    worksheet.write(row, col_num, col_name, header_format)
                header_row = row
                row += 1

                for i, (_, fila) in enumerate(grupo.iterrows()):
                    fmt = gray_format if i % 2 else center_wrap_format
                    for col_num, valor in enumerate(fila):
                        worksheet.write(row, col_num, valor, fmt)
                    row += 1

                row += 2  # espacio entre quirófanos

            if pagebreaks:
                worksheet.set_h_pagebreaks(pagebreaks)

        output.seek(0)
        return send_file(
            output,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            as_attachment=True,
            download_name=f'Programacion_Turnos_{fecha_inicio}_a_{fecha_fin}.xlsx'
        )

    except Exception as e:
        return f"❌ Error al generar Excel: {e}", 500