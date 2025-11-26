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

model = genai.GenerativeModel("gemini-2.5-flash")

##--------------------------------------------

fecha_actual = datetime.now().strftime('%Y-%m-%d')
from flask import render_template
from . import tableros_bp

@tableros_bp.route('/')
def dashboard():
    """
    Vista principal de tableros: galería de indicadores
    """
    return render_template('tableros/dashboard.html')


####################--------------------------------------------------------------##########################
# ----------------------------------------- Tablero UCI (vista HTML) ------------------------------------------------------
# 🔹 Ruta GET que abre el tablero UCI
@tableros_bp.route('/uci', methods=['GET'])
def tablero_uci():
    try:
        with engine.connect() as conn:
            result = conn.execute(text("SELECT camcod, camdes FROM ucicam ORDER BY camdes"))
            camas = result.fetchall()
        return render_template('tableros/tablero_uci.html', camas=camas)
    except Exception as e:
        return f"Error cargando las camas: {str(e)}", 500
    
# 🔹 Endpoint que recibe el camcod y ejecuta el SP con SQLAlchemy
@tableros_bp.route('/uci/datos', methods=['POST'])
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
                                                 "ESARGB,ESCBRA,ESBINT,ESBRGB,ESCRIE,ESRINT,ESRRGB,DIAEST,DIAESG FROM ESCALAS1 ORDER BY ESCHAB"))
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
        import traceback
        print("❌ Error en obtener_datos_uci:")
        traceback.print_exc()
        return jsonify({"error": f"Error al ejecutar SP_Escalas_Ucid: {str(e)}"}), 500
    
#---------------------------------------------------------

# app.py (o el archivo que contiene la función)
import os

def convertir_a_lenguaje_natural(texto):
    """
    Convierte un texto técnico (riesgos/necesidades) en un resumen en lenguaje natural,
    cargando dinámicamente el prompt desde un archivo .txt (tablero_uci_v1.txt).
    """

    if not texto or texto.strip().lower() in ["none", "null", ""]:
        return "Sin información disponible"

    if not api_key:
        return "La función de resumen IA no está disponible (API Key no configurada)."

    # ✅ Ruta absoluta al archivo del prompt
    ruta_prompt = os.path.join("config", "prompts", "tablero_uci_v1.txt")

    try:
        with open(ruta_prompt, "r", encoding="utf-8") as f:
            prompt_base = f.read()
    except FileNotFoundError:
        return f"No se encontró el archivo del prompt en: {ruta_prompt}"

    # ✅ Inserta el texto clínico donde esté el marcador {texto}
    prompt = prompt_base.replace("{texto}", texto.strip())

    try:
        # 🔹 Llamada al modelo (puede ser Gemini, GPT u otro)
        response = model.generate_content(prompt)
        return response.text.strip() if response and response.text else "Sin información generada"
    except Exception as e:
        import traceback
        print(f"⚠️ Error al invocar el modelo: {e}")
        traceback.print_exc()
        return "Error al procesar la información (verifique el log del servidor para más detalles)."

@tableros_bp.route('/uci/riesgos-necesidades-detalle', methods=['POST'])
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
        traceback.print_exc()
        return jsonify({"error": f"Error al obtener riesgos: {str(e)}"}), 500
