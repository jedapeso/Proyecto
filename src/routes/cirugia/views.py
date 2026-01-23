from flask import render_template, request, send_file, jsonify
from src import engine
from sqlalchemy import text
import pandas as pd
import io
import uuid
from datetime import datetime

from . import cirugia_bp

@cirugia_bp.route('/', methods=['GET'])
def dashboard():
    return render_template('cirugia/dashboard.html')

@cirugia_bp.route('/estadisticas', methods=['POST'])
def estadisticas():
    from flask import send_file
    import pandas as pd
    import io
    import xml.etree.ElementTree as ET

    fecha_inicio = request.form.get('fecha_inicio')
    fecha_fin = request.form.get('fecha_fin')
    usuario_id = request.form.get('usuario_id') or str(uuid.uuid4())

    if not fecha_inicio or not fecha_fin:
        return render_template('cirugia/dashboard.html')

    # Validación: fecha_inicio no puede ser mayor que fecha_fin
    try:
        fi = datetime.strptime(fecha_inicio, '%Y-%m-%d')
        ff = datetime.strptime(fecha_fin, '%Y-%m-%d')
        if fi > ff:
            return render_template('cirugia/dashboard.html', error_estadisticas='La fecha inicio no puede ser mayor que la fecha fin')
    except ValueError:
        return render_template('cirugia/dashboard.html', error_estadisticas='Formato de fecha inválido')

    try:
        # Progreso en Redis
        try:
            from src.extensions import redis_client as r
            logs_key = f"logs:cirugia:{usuario_id}"
            r.delete(logs_key)
            r.rpush(logs_key, "🚀 Iniciando generación de estadísticas...")
        except Exception:
            r = None
            logs_key = None
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
                'TIEMPO PROMEDIO PROCE': "PROCED1",
                'CIRUGIAS TOTALES': "NOPROCED",
                'AMBULATORIA Y HOSPITALIZADA': "TIPAC1",
                'PROFILAXIS ANTIBIOTICA': "PROFIX1",
            }

            output = io.BytesIO()
            with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
                for nombre_hoja, tabla in tablas.items():
                    try:
                        df = pd.read_sql(f"SELECT * FROM {tabla}", conn)
                        if not df.empty:
                            # Procesamiento especial para PROFIX1
                            if tabla == "PROFIX1":
                                df = procesar_xml_profix(df)
                            
                            # Escribir el DataFrame
                            df.to_excel(writer, sheet_name=nombre_hoja[:31], index=False)
                            
                            # Ajustar ancho de columnas automáticamente
                            ajustar_columnas(writer, nombre_hoja[:31], df)
                            
                    except Exception as e:
                        print(f"⚠️ Error con tabla {tabla}: {e}")
                        continue

        if r and logs_key:
            r.rpush(logs_key, "Reporte generado correctamente")
        output.seek(0)
        return send_file(
            output,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            as_attachment=True,
            download_name=f'Estadisticas_Cirugia_{fecha_inicio}_a_{fecha_fin}.xlsx'
        )

    except Exception as e:
        try:
            if r and logs_key:
                r.rpush(logs_key, f"❌ Error: {e}")
        except Exception:
            pass
        return f"❌ Error al generar reporte de Estadísticas de Cirugía: {e}", 500


@cirugia_bp.route('/estadisticas_logs/<usuario_id>', methods=['GET'])
def estadisticas_logs(usuario_id):
    """Retorna los logs de progreso para el usuario dado."""
    try:
        from src.extensions import redis_client as r
        logs_key = f"logs:cirugia:{usuario_id}"
        raw_logs = r.lrange(logs_key, 0, -1)
        logs = [l.decode('utf-8', errors='ignore') if isinstance(l, bytes) else str(l) for l in raw_logs]
        finalizado = any(('Reporte generado' in m) or ('🏁' in m) for m in logs)
        return jsonify({
            'usuario_id': usuario_id,
            'logs': logs,
            'finalizado': finalizado
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


def ajustar_columnas(writer, sheet_name, df):
    """
    Ajusta automáticamente el ancho de las columnas según el contenido
    """
    worksheet = writer.sheets[sheet_name]
    
    for idx, col in enumerate(df.columns):
        # Calcular el ancho máximo entre el nombre de la columna y los datos
        max_len = len(str(col))  # Longitud del encabezado
        
        # Revisar el contenido de la columna
        if len(df[col]) > 0:
            try:
                # Obtener la longitud máxima del contenido
                max_len = max(
                    df[col].astype(str).map(len).max(),  # Máximo en los datos
                    max_len  # Comparar con el encabezado
                )
            except:
                pass
        
        # Establecer un ancho máximo y mínimo razonable
        adjusted_width = min(max(max_len + 2, 10), 50)  # Entre 10 y 50 caracteres
        
        worksheet.set_column(idx, idx, adjusted_width)


def procesar_xml_profix(df):
    """
    Extrae el valor (SI/NO/NA) del item 'Administración de profilaxis antibiotica'
    de la columna VARCLIDES que contiene el XML y omite filas sin valor válido
    """
    import xml.etree.ElementTree as ET
    import pandas as pd
    
    # Verificar que existe la columna VARCLIDES (case-insensitive)
    varclides_col = None
    for col in df.columns:
        if col.upper() == 'VARCLIDES':
            varclides_col = col
            break
    
    if varclides_col is None:
        print(f"⚠️ No se encontró la columna VARCLIDES")
        return df
    
    def extraer_profilaxis_antibiotica(xml_string):
        """
        Busca el Row con ITEM='Administración de profilaxis antibiotica'
        y extrae su valor (SI/NO/NA)
        """
        if pd.isna(xml_string) or not xml_string or str(xml_string).strip() == '':
            return None
        
        try:
            xml_str = str(xml_string).strip()
            root = ET.fromstring(xml_str)
            
            # Recorrer todos los Row del XML
            for row in root.findall('.//Row'):
                item_cell = row.find('./'
                '/Cell[@ColumnCode="ITEM"]')
                
                if item_cell is not None:
                    item_value = item_cell.find('Value')
                    
                    if item_value is not None and 'profilaxis antibiotica' in item_value.text.lower():
                        for cell in row.findall('.//Cell'):
                            column_code = cell.get('ColumnCode')
                            if column_code in ['SI', 'NO', 'NA']:
                                value_elem = cell.find('Value')
                                if value_elem is not None:
                                    valor = value_elem.text
                                    if valor == 'S':
                                        return 'SI'
                                    elif valor == 'N':
                                        return 'NO'
                                    elif valor == 'NA':
                                        return 'NA'
                                    else:
                                        return valor
            return None
        except Exception as e:
            print(f"⚠️ Error parseando XML: {e}")
            return None
    
    # Crear copia y extraer valores
    df_result = df.copy()
    df_result['Profilaxis_Antibiotica'] = df_result[varclides_col].apply(extraer_profilaxis_antibiotica)
    
    # Filtrar filas sin valor válido
    df_result = df_result[df_result['Profilaxis_Antibiotica'].notna()]
    
    # Eliminar columna VARCLIDES
    if varclides_col in df_result.columns:
        df_result = df_result.drop(columns=[varclides_col])
    
    print(f"✅ Procesados {len(df_result)} registros con profilaxis antibiótica")
    
    return df_result


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

    # Validación: fecha_inicio no puede ser mayor que fecha_fin
    try:
        fi = datetime.strptime(fecha_inicio, '%Y-%m-%d')
        ff = datetime.strptime(fecha_fin, '%Y-%m-%d')
        if fi > ff:
            return render_template('cirugia/dashboard.html', error_programacion='La fecha inicio no puede ser mayor que la fecha fin')
    except ValueError:
        return render_template('cirugia/dashboard.html', error_programacion='Formato de fecha inválido')

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