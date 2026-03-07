# ... (importaciones iguales)
from flask import render_template, request, send_file
from src import engine
from sqlalchemy import text
from datetime import datetime
import pandas as pd
import io
from flask import request, jsonify
from dotenv import load_dotenv
import google.generativeai as genai
import os
import xml.etree.ElementTree as ET
import json
import traceback
import unicodedata
import re

##--------------------------------------------

# 🔹 Carga variables de .env
load_dotenv()

# 🔹 Obtiene la API_KEY
api_key = os.getenv("GOOGLE_API_KEY")

if not api_key:
    raise ValueError("⚠️ No se encontró GOOGLE_API_KEY en .env")

# 🔹 Configura Gemini
genai.configure(api_key=api_key)

model = genai.GenerativeModel("gemini-1.5-flash")

##--------------------------------------------

fecha_actual = datetime.now().strftime('%Y-%m-%d')

from . import hospitalizacion_bp

#----------------------------------------- Tablero Censo Hospitalario (vista HTML) ------------------------------------------------------
@hospitalizacion_bp.route('/', methods=['GET'])
def dashboard():
       return render_template(
        'hospitalizacion/dashboard.html',
    )

@hospitalizacion_bp.route('/censo', methods=['GET'])
def censo():
    with engine.connect() as conn:
        # Ejecutar SP de servicios
        conn.execute(text("EXECUTE PROCEDURE SP_UbicaCensod()"))
        servicios = conn.execute(text("SELECT UBICOD, UBINOM FROM UBICAH1")).fetchall()

    return render_template(
        'hospitalizacion/censo.html',
        servicios=servicios
        # empresas ya no se manda porque depende del servicio
    )


@hospitalizacion_bp.route('/empresas_por_servicio', methods=['POST'])
def get_empresas():
    data = request.get_json()
    serv = data.get("serv")

    if not serv:
        return jsonify({"error": "Falta el parámetro SERV"}), 400

    with engine.connect() as conn:
        # Ejecutar el SP dependiente del servicio
        conn.execute(text("EXECUTE PROCEDURE SP_ListadoEmpresasPAd(:serv)"), {"serv": serv})
        empresas = conn.execute(text("SELECT EMPNIT, NITRAZ FROM NIT1")).fetchall()

    return jsonify([
        {"id": e[0], "nombre": e[1]} for e in empresas
])


@hospitalizacion_bp.route('/servicios_por_empresa', methods=['POST'])
def servicios_por_empresa():
    """
    Dado un EMPNIT, ejecuta SP_Censod('TS', empresa) para poblar CENSO1
    con todos los pisos filtrados por esa empresa, y devuelve qué UBIs
    tienen pacientes (OCUPADAS > 0).
    Si empresa='0' o vacío devuelve todos los servicios.
    """
    data = request.get_json()
    empresa = (data.get("empresa") or "").strip()

    if not empresa or empresa == "0":
        # Sin filtro de empresa → todos los servicios disponibles
        with engine.connect() as conn:
            conn.execute(text("EXECUTE PROCEDURE SP_UbicaCensod()"))
            servicios = conn.execute(
                text("SELECT UBICOD, UBINOM FROM UBICAH1")
            ).fetchall()
        return jsonify([{"ubi": s[0], "nombre": s[1]} for s in servicios])

    try:
        with engine.connect() as conn:
            # Poblar CENSO1 para todos los servicios con esta empresa
            conn.execute(
                text("EXECUTE PROCEDURE SP_Censod(:servicio, :empresa)"),
                {"servicio": "TS", "empresa": empresa}
            )
            # Contar filas de pacientes por UBI (no usar OCUPADAS que refleja total de camas)
            rows = conn.execute(text("""
                SELECT UBI, COUNT(*) AS CNT
                FROM CENSO1
                WHERE UBI <> 'TS'
                  AND ASEGURADOR IS NOT NULL
                  AND TRIM(ASEGURADOR) <> ''
                GROUP BY UBI
                HAVING COUNT(*) > 0
                ORDER BY
                    CASE
                        WHEN UBI='H1' THEN 1
                        WHEN UBI='H2' THEN 2
                        WHEN UBI='H3' THEN 3
                        WHEN UBI='UA' THEN 4
                        ELSE 9
                    END
            """)).fetchall()

        nombres = {
            "H1": "Hospitalización Piso 1",
            "H2": "Hospitalización Piso 2",
            "H3": "Hospitalización Piso 3",
            "UA": "UCI"
        }
        servicios_activos = [
            {"ubi": r[0].strip(), "nombre": nombres.get(r[0].strip(), r[0].strip())}
            for r in rows
        ]

        # Si hay más de un servicio activo, agregar TS al inicio para ver todos
        if len(servicios_activos) > 1:
            servicios_activos.insert(0, {"ubi": "TS", "nombre": "Todos los servicios"})

        return jsonify(servicios_activos)

    except Exception as e:
        return jsonify({"error": str(e)}), 500

@hospitalizacion_bp.route('/reporte_censo', methods=['POST'])
def reporte_censo():
    servicio = request.form.get('servicio')
    empresa = request.form.get('empresa')

    if not servicio:
        return "Debe seleccionar servicio", 400

    with engine.connect() as conn:
        if empresa:
            conn.execute(
                text("EXECUTE PROCEDURE SP_Censod(:servicio, :empresa)"),
                {'servicio': servicio, 'empresa': empresa}
            )
        else:
            conn.execute(
                text("EXECUTE PROCEDURE SP_Censod(:servicio)"),
                {'servicio': servicio}
            )

        # Datos del censo detallado
        df_censo = pd.read_sql("""
            SELECT SERVICIO,
                    HABITACION,
                    HISTORIA,
                    IDENTIFICACION,
                    DIAS_ESTANCIA,
                    NOMBRE_COMPLETO,
                    SEXO,GENERO,
                    ASEGURADOR,
                    EDAD,
                    CIE10,
                    DIAGNOSTICO
            FROM 
            CENSO1 
            WHERE UBI <> 'TS' ORDER BY SERVICIO,HABITACION
        """, conn)

        # Resumen desde tabla CENSO1 
        df_estancia = pd.read_sql("""
           SELECT UNIQUE 
                         CASE WHEN UBI = 'H1' THEN 1
                         WHEN UBI = 'H2' THEN 2
                         WHEN UBI = 'H3' THEN 3
                         WHEN UBI = 'UA' THEN 4
                         WHEN UBI = 'TS' THEN 5
                        ELSE 6 END AS NO,
                        SERVICIO, 
                        OCUPADAS, 
                        DISPONIBLES, 
                        FUERA_SERVICIO,
                        NO_HAB_SERV, 
                        POR_OCU_SER, 
                        POR_OCU_SER_TOT, 
                        PROM_ESTANCIA
            FROM CENSO1
            ORDER BY NO;
        """, conn)

    # Normalizar nombres de columnas
    df_censo.columns = df_censo.columns.str.upper()
    df_estancia.columns = df_estancia.columns.str.upper()

    # ---- IMPORTANTE: forzar numéricos en los nombres ORIGINALES (antes de renombrar) ----
    if "PROM_ESTANCIA" in df_estancia.columns: df_estancia["PROM_ESTANCIA"] = pd.to_numeric(df_estancia["PROM_ESTANCIA"], errors="coerce")
    if "POR_OCU_SER" in df_estancia.columns: df_estancia["POR_OCU_SER"] = pd.to_numeric(df_estancia["POR_OCU_SER"], errors="coerce")
    if "POR_OCU_SER_TOT" in df_estancia.columns: df_estancia["POR_OCU_SER_TOT"] = pd.to_numeric(df_estancia["POR_OCU_SER_TOT"], errors="coerce")

    # Renombrar columnas para Excel
    if not df_estancia.empty:
        df_estancia.rename(columns={
            "SERVICIO": "Ubicación",
            "OCUPADAS": "Camas Ocupadas",
            "DISPONIBLES": "Camas Disponibles",
            "FUERA_SERVICIO": "Camas Fuera de Servicio",
            "NO_HAB_SERV": "Nr Camas por Servicio",
            "POR_OCU_SER": "% Ocupación Servicio",
            "PROM_ESTANCIA": "Promedio Estancia"
        }, inplace=True)

        # Forzar Promedio Estancia a numérico
        df_estancia["Promedio Estancia"] = pd.to_numeric(df_estancia["Promedio Estancia"], errors="coerce")

    # Crear Excel
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='xlsxwriter') as writer:
        # Hoja 1: Censo hospitalario
        df_censo.to_excel(writer, index=False, sheet_name='Censo Hospitalario', startrow=0)
        workbook = writer.book
        ws_detalle = writer.sheets['Censo Hospitalario']

        # Formatos
        formato_gris = workbook.add_format({'bg_color': '#f2f2f2'})
        formato_negrita = workbook.add_format({'bold': True})
        formato_porcentaje = workbook.add_format({'num_format': '0.00'})
        formato_verde = workbook.add_format({'bg_color': "#2ecc71"})
        formato_dorado = workbook.add_format({'bg_color': "#FFFF00"})
        formato_violeta = workbook.add_format({'bg_color': "#e67e22"})
        formato_rojo = workbook.add_format({'bg_color': "#ff0000"})

        # Alternar color por servicio en hoja de detalle
        last_service = None
        gray_toggle = False
        for row_idx, row in df_censo.iterrows():
            current_service = row['SERVICIO']
            if current_service != last_service:
                gray_toggle = not gray_toggle
                last_service = current_service
            if gray_toggle:
                ws_detalle.set_row(row_idx + 1, None, formato_gris)

        # Ajustar ancho de columnas en detalle
        for col_idx, col_name in enumerate(df_censo.columns):
            max_len = max(df_censo[col_name].astype(str).map(len).max(), len(col_name))
            ws_detalle.set_column(col_idx, col_idx, max_len + 2)

        # Hoja 2: Resumen DATO1
        if not df_estancia.empty:
            df_estancia.to_excel(writer, index=False, sheet_name='Resumen DATO1')
            ws_resumen = writer.sheets['Resumen DATO1']

            # Cabeceras en negrita
            for col_idx, header in enumerate(df_estancia.columns):
                ws_resumen.write(0, col_idx, header, formato_negrita)

            # Formato porcentaje en columnas
            for col_idx, header in enumerate(df_estancia.columns):
                if header in ["% Ocupación Servicio", "% Ocupación General"]:
                    ws_resumen.set_column(col_idx, col_idx, 18, formato_porcentaje)

            # Colorear columna Promedio Estancia
            col_prom = df_estancia.columns.get_loc("Promedio Estancia")
            for row_idx, row in df_estancia.iterrows():
                prom = row["Promedio Estancia"]
                if pd.notnull(prom):
                    if 1 <= prom <= 5: formato = formato_verde
                    elif 6 <= prom <= 9: formato = formato_dorado
                    elif 10 <= prom <= 14: formato = formato_violeta
                    elif prom >= 15: formato = formato_rojo
                    else: formato = None

                    if formato:
                        ws_resumen.write(row_idx + 1, col_prom, prom, formato)

            # Ajustar ancho de columnas en resumen
            for col_idx, col_name in enumerate(df_estancia.columns):
                max_len = max(df_estancia[col_name].astype(str).map(len).max(), len(col_name))
                ws_resumen.set_column(col_idx, col_idx, max_len + 2)

        # Colorear columna Dias Estancia solo si df_censo no está vacío
        if not df_censo.empty and "DIAS_ESTANCIA" in df_censo.columns:
            col_prom = df_censo.columns.get_loc("DIAS_ESTANCIA")
            for row_idx, row in df_censo.iterrows():
                prom = row["DIAS_ESTANCIA"]
                if pd.notnull(prom):
                    if 1 <= prom <= 5: formato = formato_verde
                    elif 6 <= prom <= 9: formato = formato_dorado
                    elif 10 <= prom <= 14: formato = formato_violeta
                    elif prom >= 15: formato = formato_rojo
                    else: formato = None

                    if formato:
                        ws_detalle.write(row_idx + 1, col_prom, prom, formato)

    output.seek(0)
    nombre_archivo = f"CENSO_HOSP_{servicio}_{empresa or 'TODAS'}_{fecha_actual}.xlsx"

    return send_file(
        output,
        as_attachment=True,
        download_name=nombre_archivo,
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )

####################--------------------------------------------------------------##########################
  # grafico de Censo - DINAMICO CON FILTROS
@hospitalizacion_bp.route('/datos_censo_grafico', methods=['POST'])
def datos_censo_grafico():
    data = request.json
    servicio = data.get('servicio')
    empresa = data.get('empresa', '')

    if not servicio:
        return jsonify({'error': 'Debe seleccionar una ubicación'}), 400

    try:
        with engine.connect() as conn:
            # Ejecutar SP con los parámetros del filtro
            if empresa:
                conn.execute(
                    text("EXECUTE PROCEDURE SP_Censod(:servicio, :empresa)"),
                    {'servicio': servicio, 'empresa': empresa}
                )
            else:
                conn.execute(
                    text("EXECUTE PROCEDURE SP_Censod(:servicio, :empresa)"),
                    {'servicio': servicio, 'empresa': '0'}
                )

            # WHERE dinámico según servicio
            if servicio == 'TS':
                where_clause = "WHERE C1.UBI <> 'TS'"
            else:
                where_clause = f"WHERE C1.UBI = '{servicio}'"

            # Query única: resumen por UBI + conteo estancia alta
            query_unica = f"""
                SELECT UNIQUE
                    CASE
                        WHEN C1.UBI = 'H1' THEN 1
                        WHEN C1.UBI = 'H2' THEN 2
                        WHEN C1.UBI = 'H3' THEN 3
                        WHEN C1.UBI = 'UA' THEN 4
                        ELSE 6
                    END AS ORDEN_UBI,
                    C1.UBI,
                    C1.OCUPADAS,
                    C1.DISPONIBLES,
                    C1.NO_HAB_SERV,
                    C1.POR_OCU_SER,
                    C1.POR_OCU_SER_TOT,
                    C1.PROM_ESTANCIA,
                    (
                        SELECT COUNT(*)
                        FROM CENSO1 C2
                        WHERE C2.UBI = C1.UBI
                          AND C2.DIAS_ESTANCIA > 10
                          AND C2.ASEGURADOR IS NOT NULL
                          AND TRIM(C2.ASEGURADOR) <> ''
                    ) AS CNT_ALTA
                FROM CENSO1 C1
                {where_clause}
                ORDER BY ORDEN_UBI
            """

            df_dato1 = pd.read_sql(query_unica, conn)
            
            # Calcular ocupación total de la clínica (sin filtros)
            query_total_clinica = """
                SELECT UNIQUE
                    SUM(C1.OCUPADAS) AS TOTAL_OCUPADAS,
                    SUM(C1.NO_HAB_SERV) AS TOTAL_CAMAS
                FROM CENSO1 C1
                WHERE C1.UBI <> 'TS'
            """
            df_total_clinica = pd.read_sql(query_total_clinica, conn)
            total_ocupadas_clinica = pd.to_numeric(df_total_clinica['total_ocupadas'].iloc[0], errors='coerce') or 0
            total_camas_clinica = pd.to_numeric(df_total_clinica['total_camas'].iloc[0], errors='coerce') or 1
            ocupacion_clinica_total = (total_ocupadas_clinica / total_camas_clinica * 100) if total_camas_clinica > 0 else 0

        # Normalizar columnas y tipos
        df_dato1.columns = df_dato1.columns.str.lower()
        df_dato1 = df_dato1.fillna(0)

        for col in ['ocupadas', 'disponibles', 'no_hab_serv']:
            df_dato1[col] = pd.to_numeric(df_dato1[col], errors='coerce').fillna(0).astype(int)

        for col in ['por_ocu_ser', 'por_ocu_ser_tot', 'prom_estancia']:
            df_dato1[col] = pd.to_numeric(df_dato1[col], errors='coerce').fillna(0)

        df_dato1['cnt_alta'] = pd.to_numeric(df_dato1['cnt_alta'], errors='coerce').fillna(0).astype(int)
        df_dato1['ubi'] = df_dato1['ubi'].str.strip()

        datos = {
            'labels':        df_dato1['ubi'].tolist(),
            'ocupadas':      df_dato1['ocupadas'].tolist(),
            'disponibles':   df_dato1['disponibles'].tolist(),
            'porcentaje':    df_dato1['por_ocu_ser'].tolist(),
            'porcentaje_gral': df_dato1['por_ocu_ser_tot'].tolist(),
            'total':         df_dato1['no_hab_serv'].tolist(),
            'estancia':      df_dato1['prom_estancia'].tolist(),
            'estancia_alta': df_dato1['cnt_alta'].tolist(),
            'ocupacion_clinica_total': round(ocupacion_clinica_total, 2),
        }
        
        return jsonify(datos)
    
    except Exception as e:
        return jsonify({'error': f'Error al obtener datos: {str(e)}'}), 500

####################--------------------------------------------------------------##########################
# Endpoint para análisis adicionales (asegurador, edad, diagnósticos)
@hospitalizacion_bp.route('/datos_analisis_adicionales', methods=['POST'])
def datos_analisis_adicionales():
    data = request.json
    servicio = data.get('servicio')
    empresa = data.get('empresa', '')

    if not servicio:
        return jsonify({'error': 'Debe seleccionar una ubicación'}), 400

    try:
        with engine.connect() as conn:
            # CENSO1 es una tabla temporal de sesión: cada request abre una conexión nueva
            # por lo tanto SIEMPRE hay que ejecutar el SP en la misma conexión que hace la query.
            conn.execute(
                text("EXECUTE PROCEDURE SP_Censod(:servicio, :empresa)"),
                {'servicio': servicio, 'empresa': empresa if empresa else '0'}
            )

            # WHERE dinámico
            if servicio == 'TS':
                where_clause = "WHERE UBI <> 'TS'"
            else:
                where_clause = f"WHERE UBI = '{servicio}'"

            query_analisis = f"""
                SELECT ASEGURADOR, EDAD, DIAGNOSTICO, CIE10
                FROM CENSO1
                {where_clause}
                AND ASEGURADOR IS NOT NULL
                AND TRIM(ASEGURADOR) <> ''
            """

            df_censo = pd.read_sql(query_analisis, conn)
        
        df_censo.columns = df_censo.columns.str.upper()

        if df_censo.empty:
            # Si no hay pacientes con asegurador, retornar datos vacíos
            resultado = {
                'asegurador': {'labels': [], 'valores': []},
                'rango_edad': {
                    'labels': ["0-17 años", "18-39 años", "40-59 años", "60+ años"],
                    'valores': [0, 0, 0, 0]
                }
            }
            return jsonify(resultado)
        
        df_censo = df_censo.fillna({'DIAGNOSTICO': 'SIN DIAGNÓSTICO'})
        
        # Convertir EDAD a numérico
        df_censo['EDAD'] = pd.to_numeric(df_censo['EDAD'], errors='coerce').fillna(0).astype(int)
        
        # 1. ANÁLISIS POR ASEGURADOR
        asegurador_counts = df_censo['ASEGURADOR'].value_counts().to_dict()
        top_aseguradores = dict(sorted(asegurador_counts.items(), key=lambda x: x[1], reverse=True)[:10])
        
        # 2. ANÁLISIS POR RANGO DE EDAD
        def categorizar_edad(edad):
            if edad < 18:
                return "0-17 años"
            elif edad < 40:
                return "18-39 años"
            elif edad < 60:
                return "40-59 años"
            else:
                return "60+ años"
        
        df_censo['RANGO_EDAD'] = df_censo['EDAD'].apply(categorizar_edad)
        rango_counts = df_censo['RANGO_EDAD'].value_counts().to_dict()
        rango_ordered = {
            "0-17 años": rango_counts.get("0-17 años", 0),
            "18-39 años": rango_counts.get("18-39 años", 0),
            "40-59 años": rango_counts.get("40-59 años", 0),
            "60+ años": rango_counts.get("60+ años", 0)
        }
        
        # 3. DIAGNÓSTICOS MÁS FRECUENTES
        diagnosticos_counts = df_censo['DIAGNOSTICO'].value_counts().head(10).to_dict()
        
        # 4. ANÁLISIS CRUZADO: ASEGURADOR x RANGO EDAD
        crosstab = pd.crosstab(df_censo['ASEGURADOR'], df_censo['RANGO_EDAD'])
        # Tomar top 5 aseguradores
        top_5_aseg = df_censo['ASEGURADOR'].value_counts().head(5).index.tolist()
        crosstab_filtered = crosstab.loc[top_5_aseg]
        
        # Convertir a formato para gráfico
        crosstab_data = {}
        for aseg in crosstab_filtered.index:
            crosstab_data[aseg] = {
                "0-17 años": int(crosstab_filtered.loc[aseg, "0-17 años"]) if "0-17 años" in crosstab_filtered.columns else 0,
                "18-39 años": int(crosstab_filtered.loc[aseg, "18-39 años"]) if "18-39 años" in crosstab_filtered.columns else 0,
                "40-59 años": int(crosstab_filtered.loc[aseg, "40-59 años"]) if "40-59 años" in crosstab_filtered.columns else 0,
                "60+ años": int(crosstab_filtered.loc[aseg, "60+ años"]) if "60+ años" in crosstab_filtered.columns else 0,
            }
        
        resultado = {
            'asegurador': {
                'labels': list(top_aseguradores.keys()),
                'valores': list(top_aseguradores.values())
            },
            'rango_edad': {
                'labels': list(rango_ordered.keys()),
                'valores': list(rango_ordered.values())
            },
            'diagnosticos': {
                'labels': list(diagnosticos_counts.keys()),
                'valores': list(diagnosticos_counts.values())
            },
            'cruzado': {
                'aseguradores': list(crosstab_data.keys()),
                'rangos': ["0-17 años", "18-39 años", "40-59 años", "60+ años"],
                'datos': crosstab_data
            }
        }
        
        return jsonify(resultado)
    
    except Exception as e:
        return jsonify({'error': f'Error al obtener análisis: {str(e)}'}), 500

####################--------------------------------------------------------------##########################
# ----------------------------------------- Tablero UCI (vista HTML) ------------------------------------------------------
# 🔹 Ruta GET que abre el tablero UCI
@hospitalizacion_bp.route('/uci', methods=['GET'])
def tablero_uci():
    try:
        with engine.connect() as conn:
            result = conn.execute(text("SELECT camcod, camdes FROM ucicam ORDER BY camdes"))
            camas = result.fetchall()
        return render_template('hospitalizacion/tablero_uci.html', camas=camas)
    except Exception as e:
        return f"Error cargando las camas: {str(e)}", 500
    
# 🔹 Endpoint que recibe el camcod y ejecuta el SP con SQLAlchemy
@hospitalizacion_bp.route('/uci/datos', methods=['POST'])
def obtener_datos_uci():
    try:
        data = request.json
        camcod = data.get("camcod")

        if not camcod:
            return jsonify({"error": "Falta parámetro camcod"}), 400

        with engine.begin() as conn:
            # 1. Execute SP to populate temporary tables
            conn.execute(text("EXECUTE PROCEDURE SP_Escalas_Ucid(:camcod)"), {"camcod": camcod})

            # 2. Query patient card data from ESCALAS1
            result_pacientes = conn.execute(text("SELECT ESCHIS,ESCNUM,ESCIDE,ESCPAC,ESCHAB,ESCDIA,ESCEPI,ESCAPA,ESAINT,"
                                                 "ESARGB,ESCBRA,ESBINT,ESBRGB,ESCRIE,ESRINT,ESRRGB,DIAEST FROM ESCALAS1 ORDER BY ESCHAB"))
            pacientes = result_pacientes.mappings().all()

            # 3. Query indicator data from temporary tables
            total_pacientes = conn.execute(text("SELECT TOTAL_PACIENTES FROM TOTPAC1")).scalar()
            promedio_apache = conn.execute(text("SELECT PROMEDIO_APACHE FROM PROAPA1")).scalar()
            riesgo_lpp = conn.execute(text("SELECT NO_PACI,TRIM(ESCALAPOR) ESCALAPOR FROM ESCUPP1")).mappings().all()
            riesgo_caida = conn.execute(text("SELECT NO_PACI,TRIM(ESCALAPOR) ESCALAPOR FROM RIECA1")).mappings().all()
            promedio_estancia = conn.execute(text("SELECT PROM FROM PROMES1")).scalar()

            # 4. Combine all data into a single JSON object
            response_data = {
                "pacientes_en_cama": [dict(row) for row in pacientes],
                "indicadores": {
                    "total_pacientes": total_pacientes,
                    "promedio_apache": promedio_apache,
                    "riesgo_lpp": [dict(row) for row in riesgo_lpp],
                    "riesgo_caida": [dict(row) for row in riesgo_caida],
                    "promedio_estancia": str(promedio_estancia) if promedio_estancia is not None else "0"
                }
            }
        return jsonify(response_data)

    except Exception as e:
        return jsonify({"error": f"Error al ejecutar SP_Escalas_Ucid: {str(e)}"}), 500
    
#---------------------------------------------------------

def convertir_a_lenguaje_natural(texto):
    """
    Convierte un texto técnico de riesgos/necesidades a un resumen entendible en lenguaje natural.
    """
    if not texto or texto.strip().lower() in ["none", "null", ""]:
        return "Sin información disponible"
    
    if not api_key:
        return "La función de resumen IA no está disponible (API Key no configurada)."

    prompt = f"""
    Eres un asistente médico especializado en cuidados intensivos.
    Tu tarea es analizar un texto sobre un paciente y generar un resumen estructurado con la siguiente información:
    1.Riesgos: Identifica y enumera todos los riesgos a los que se enfrenta el paciente (por ejemplo, riesgo de caída, riesgo de lesión por presión, riesgo de infección, etc.).
    2.Necesidades: Describe las necesidades específicas del paciente basadas en los datos proporcionados (por ejemplo, necesidades de movilidad, nutricionales, de higiene, emocionales, etc.).
    3.Plan de Cuidado: Crea un resumen conciso y claro de un plan de cuidado del paciente, incluyendo acciones concretas para abordar los riesgos y satisfacer las necesidades identificadas. El plan debe ser fácil de entender para el personal de enfermería.
    Asegúrate de que tu respuesta sea clara y concisa, utilizando un lenguaje profesional pero accesible.
    --- TEXTO ---
    {texto}
    """

    try:
        response = model.generate_content(prompt)
        return response.text.strip() if response and response.text else "Sin información generada"
    except Exception as e:
        return "Error al procesar la información"

@hospitalizacion_bp.route('/uci/riesgos-necesidades-detalle', methods=['POST'])
def obtener_riesgos_necesidades():
    try:
        data = request.get_json(force=True, silent=True) or {}
        escide = data.get("escide")

        if not escide:
            return jsonify({"error": "Falta parámetro escide"}), 400

        with engine.begin() as conn:
            # Datos del paciente
            paciente = conn.execute(
                text("""
                    SELECT ESCIDE, ESCPAC, ESCHAB, ESCDIA, ESCEPI  FROM ESCALAS1 WHERE ESCIDE = :escide"""),
                {"escide": escide}
            ).fetchone()

            if not paciente:
                return jsonify({"resumen": "No se encontraron datos del paciente."})
                return jsonify({"error": "No se encontraron datos del paciente."}), 404

            escide_db, nombre, habitacion, diagnostico, escepi = paciente

            # Ejecutar SP que regenera la tabla RESUMEN1 (temporal)
            conn.execute(
                text("EXECUTE PROCEDURE SP_Riesgos_Necesidadesd(:ESCEPI)"),
                {"ESCEPI": escepi}
            )

            # Consultar tabla temporal
            filas = conn.execute(text("SELECT LISTAS FROM RESUMEN1")).fetchall()

        if not filas:
            return jsonify({"resumen": "No hay riesgos disponibles"})
            # Si no hay riesgos, aún devolvemos los datos del paciente con un resumen vacío.
            return jsonify({
                "escide": escide_db,
                "nombre": nombre,
                "habitacion": habitacion,
                "diagnostico": diagnostico,
                "resumen_ia": "No se encontraron riesgos o necesidades para este paciente."
            })

        # Unir los registros
        riesgos_texto = " ".join(f[0] for f in filas if f[0])

        # Opcional: enviar a IA para resumen natural
        resumen_ia = convertir_a_lenguaje_natural(riesgos_texto)

        return jsonify({
            "escide": escide_db,
            "nombre": nombre,
            "habitacion": habitacion,
            "diagnostico": diagnostico,
            "resumen_ia": resumen_ia
        })

    except Exception as e:
        return jsonify({"error": f"Error al obtener riesgos: {str(e)}"}), 500
