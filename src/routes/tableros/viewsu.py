from flask import render_template, request, jsonify
from src import engine
from sqlalchemy import text
from datetime import datetime
import os
import traceback
from dotenv import load_dotenv
import google.generativeai as genai
from . import tableros_bp

# Cargar variables
load_dotenv()
api_key = os.getenv("GOOGLE_API_KEY")

if api_key:
    genai.configure(api_key=api_key)
    model = genai.GenerativeModel("gemini-2.5-flash")
else:
    model = None

@tableros_bp.route('/urgencias', methods=['GET'])
def tablero_urg():
    try:
        with engine.begin() as conn:
            # Consultar directamente con CASE statement
            result = conn.execute(text("""
                SELECT DISTINCT 
                    CASE WHEN HABCOD IN ('CON1','CON2','CON3','CECO') THEN 'CONSULTORIOS' 
                         WHEN HABCOD IN ('C1O1','C2O1','C301','C4O1','C5O1','C6O1') THEN 'OBSERVACION 1' 
                         WHEN HABCOD IN ('C1O2','C2O2','C302','C4O2','C5O2','C6O2') THEN 'OBSERVACION 2'
                         WHEN HABCOD IN ('REAN','PEQC','REA1','SER1','SER2') THEN 'SALAS' END AS UBICA,
                    CASE WHEN HABCOD IN ('CON1','CON2','CON3','CECO') THEN 1
                         WHEN HABCOD IN ('C1O1','C2O1','C301','C4O1','C5O1','C6O1') THEN 2
                         WHEN HABCOD IN ('C1O2','C2O2','C302','C4O2','C5O2','C6O2') THEN 3
                         WHEN HABCOD IN ('REAN','PEQC','REA1','SER1','SER2') THEN 4 END AS TIPO
                FROM INHAB 
                WHERE HABACT = 'S' AND HABUBI = 'UR'
                ORDER BY TIPO
            """))
            servicios = [{'ubicod': row[1], 'ubinom': row[0]} for row in result]
        return render_template('tableros/tablero_urg.html', servicios=servicios)
    except Exception as e:
        print(f"Error carga servicios: {e}")
        traceback.print_exc()
        return render_template('tableros/tablero_urg.html', servicios=[])

@tableros_bp.route('/urgencias/datos', methods=['POST'])
def obtener_datos_urg():
    try:
        data = request.json
        ubicod = data.get('ubicod')  # Puede ser INT o lista [1,2,4]
        if not ubicod:
            return jsonify({"error": "Falta parámetro ubicod"}), 400

        # Convertir a cadena delimitada por comas
        if isinstance(ubicod, list):
            tipos_str = ','.join(str(u) for u in ubicod if u)
        else:
            tipos_str = str(ubicod)
        
        if not tipos_str:
            return jsonify({"error": "Sin ubicaciones seleccionadas"}), 400

        with engine.begin() as conn:
            # 1. Ejecutar SP con cadena delimitada - Usar f-string para Informix
            sql_sp = f"EXECUTE PROCEDURE SP_Escalas_urgd('{tipos_str}')"
            conn.execute(text(sql_sp))

            # 2. Consultar Pacientes
            # Usamos mappings() para asegurar diccionarios, no tuplas
            q_pacientes = text("""
                SELECT ESCHIS,ESCNUM,ESCIDE,ESCEDA,ESCPAC,ESCHAB,ESCDIA,ESCEPI,
                       ESCGRA,ESGINT,ESGRGB,
                       ESCCUR,ESCINT,ESCRGB,
                       ESCRIE,ESRINT,ESRRGB,
                       ESCNIH,ESNINT,ESNRGB,
                       DIAEST,DIAESG,ORDAIS
                FROM ESCALAS1
                ORDER BY ESCHAB
            """)
            pacientes = [dict(row) for row in conn.execute(q_pacientes).mappings()]

                        # 3. Consultar Indicadores (Bloque Robustecido)
            # Inicializamos variables por defecto
            total_pacientes = 0
            promedio_estancia = "0"
            escala_grace = []
            riesgo_curb65 = []
            riesgo_caida = []
            riesgo_nihss = []

            # A. Total Pacientes
            try:
                total_pacientes = conn.execute(text("SELECT TOTAL_PACIENTES FROM TOTPAC1")).scalar() or 0
            except Exception as e:
                print(f"⚠️ Error Totales: {e}")

            # B. Promedio Estancia
            try:
                promedio_estancia = conn.execute(text("SELECT PROM FROM PROMES1")).scalar() or "0"
            except Exception as e:
                print(f"⚠️ Error Promedio: {e}")

            # C. Escala GRACE
            try:
                escala_grace = [dict(row) for row in conn.execute(text("SELECT TRIM(ESCALAPOR) ESCALAPOR, NO_PACI FROM GRACE1")).mappings()]
            except Exception as e:
                print(f"⚠️ Error GRACE1: {e}")

            # D. Riesgo CURB-65
            try:
                riesgo_curb65 = [dict(row) for row in conn.execute(text("SELECT TRIM(ESCALAPOR) ESCALAPOR, NO_PACI FROM CURB1")).mappings()]
            except Exception as e:
                print(f"⚠️ Error CURB1: {e}")

            # E. Riesgo CAÍDA
            try:
                riesgo_caida = [dict(row) for row in conn.execute(text("SELECT TRIM(ESCALAPOR) ESCALAPOR, NO_PACI FROM RIECA1")).mappings()]
            except Exception as e:
                print(f"⚠️ Error RIECA1: {e}")

            # F. Riesgo NIHSS
            try:
                riesgo_nihss = [dict(row) for row in conn.execute(text("SELECT TRIM(ESCALAPOR) ESCALAPOR, NO_PACI FROM NIHSS1")).mappings()]
            except Exception as e:
                print(f"⚠️ Error NIHSS1: {e}")

            # Retorno JSON
            return jsonify({
                "pacientes_en_cama": pacientes,
                "indicadores": {
                    "total_pacientes": total_pacientes,
                    "escala_grace": escala_grace,
                    "riesgo_curb65": riesgo_curb65,
                    "riesgo_caida": riesgo_caida,
                    "riesgo_nihss": riesgo_nihss,
                    "promedio_estancia": str(promedio_estancia)
                }
            })

    except Exception as e:
        traceback.print_exc() # Esto imprimirá el error real en la consola de Docker
        return jsonify({"error": f"Error servidor: {str(e)}"}), 500

# --------------------------------------------
# 🔹 Conversión a lenguaje natural (IA)
def convertir_a_lenguaje_natural_urg(texto):
    """
    Versión IA para Urgencias — usa su propio prompt si existe
    """
    if not texto or texto.strip().lower() in ["none", "null", ""]:
        return "Sin información disponible"

    if not api_key:
        return "La función de resumen IA no está disponible (API Key no configurada)."

    ruta_prompt = os.path.join("config", "prompts", "tablero_urg_v1.txt")

    try:
        with open(ruta_prompt, "r", encoding="utf-8") as f:
            prompt_base = f.read()
    except FileNotFoundError:
        # Si no existe, usar el mismo de Hospitalización
        ruta_prompt = os.path.join("config", "prompts", "tablero_hos_v1.txt")
        try:
            with open(ruta_prompt, "r", encoding="utf-8") as f:
                prompt_base = f.read()
        except FileNotFoundError:
            # Último recurso: UCI
            ruta_prompt = os.path.join("config", "prompts", "tablero_uci_v1.txt")
            with open(ruta_prompt, "r", encoding="utf-8") as f:
                prompt_base = f.read()

    prompt = prompt_base.replace("{texto}", texto.strip())

    try:
        response = model.generate_content(prompt)
        return response.text.strip() if response and response.text else "Sin información generada"
    except Exception as e:
        traceback.print_exc()
        return "Error al procesar la información (verifique el log del servidor)."


# --------------------------------------------
# 🔹 Endpoint: riesgos y necesidades
@tableros_bp.route('/urgencias/riesgos-necesidades-detalle', methods=['POST'])
def obtener_riesgos_necesidades_urg():
    """
    Devuelve el resumen de riesgos y necesidades del paciente (Urgencias)
    """
    try:
        data = request.get_json(force=True, silent=True) or {}
        escide = data.get("escide")

        if not escide:
            return jsonify({"error": "Falta parámetro escide"}), 400

        with engine.begin() as conn:
            paciente = conn.execute(
                text("""
                    SELECT ESCIDE, ESCPAC, ESCHAB, ESCDIA, ESCEPI
                    FROM ESCALAS1 
                    WHERE ESCIDE = :escide
                """),
                {"escide": escide}
            ).fetchone()

            if not paciente:
                return jsonify({"resumen": "No se encontraron datos del paciente."})

            escide_db, nombre, habitacion, diagnostico, escepi = paciente

            # ⚙️ Ejecuta SP de riesgos/necesidades
            conn.execute(
                text("EXECUTE PROCEDURE SP_Riesgos_Necesidadesurgd(:ESCEPI)"),
                {"ESCEPI": escepi}
            )

            filas = conn.execute(text("SELECT LISTAS FROM RESUMENURG1")).fetchall()

        if not filas:
            return jsonify({
                "escide": escide_db,
                "nombre": nombre,
                "habitacion": habitacion,
                "diagnostico": diagnostico,
                "resumen_ia": "No se encontraron riesgos o necesidades."
            })

        riesgos_texto = " ".join(f[0] for f in filas if f[0])
        resumen_ia = convertir_a_lenguaje_natural_urg(riesgos_texto)

        return jsonify({
            "escide": escide_db,
            "nombre": nombre,
            "habitacion": habitacion,
            "diagnostico": diagnostico,
            "resumen_ia": resumen_ia
        })

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": f"Error al obtener riesgos: {str(e)}"}), 500
