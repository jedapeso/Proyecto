from flask import render_template, request, jsonify
from src import engine
from sqlalchemy import text
from datetime import datetime
import pandas as pd
import io
from dotenv import load_dotenv
import google.generativeai as genai
import os
import traceback
import unicodedata
import re
from . import tableros_bp


# --------------------------------------------
# 🔹 Cargar variables de entorno
load_dotenv()

api_key = os.getenv("GOOGLE_API_KEY")
if not api_key:
    raise ValueError("⚠️ No se encontró GOOGLE_API_KEY en .env")

# 🔹 Configura el modelo Gemini
genai.configure(api_key=api_key)
model = genai.GenerativeModel("gemini-2.5-flash")

# --------------------------------------------
fecha_actual = datetime.now().strftime('%Y-%m-%d')


# --------------------------------------------
# 🔹 Vista principal del tablero de URGENCIAS
@tableros_bp.route('/urgencias', methods=['GET'])
def tablero_urg():
    """Renderiza el tablero de Urgencias"""
    try:
        with engine.connect() as conn:
            # Ajusta según los códigos de ubicación de urgencias en tu BD
            result = conn.execute(text("""
                SELECT ubicod, ubinom 
                FROM INUBI 
                WHERE UBICOD IN ('U1', 'U2', 'U3', 'UR')
                ORDER BY 1
            """))
            servicios = result.fetchall()
        return render_template('tableros/tablero_urg.html', servicios=servicios)
    except Exception as e:
        return f"Error cargando los servicios: {str(e)}", 500


# --------------------------------------------
# 🔹 Endpoint: datos del tablero de URGENCIAS
@tableros_bp.route('/urgencias/datos', methods=['POST'])
def obtener_datos_urg():
    """Obtiene datos de pacientes e indicadores de urgencias"""
    try:
        data = request.json
        ubicod = data.get('ubicod')

        if not ubicod:
            return jsonify({"error": "Falta parámetro ubicod"}), 400

        with engine.begin() as conn:
            # ⚙️ Ejecuta el SP con el parámetro correcto
            # Ajusta el nombre del SP según tu base de datos
            conn.execute(text("EXECUTE PROCEDURE SP_Escalas_urgd(:ubicod)"), {"ubicod": ubicod})

            # 🔹 Datos de pacientes
            result_pacientes = conn.execute(text("""
                SELECT ESCHIS, ESCNUM, ESCIDE, ESCEDA, ESCPAC, ESCHAB, ESCDIA, ESCEPI, ESCGOL,
                       ESGRGB, ESCBRA, ESBINT, ESBRGB, ESCRIE, ESRINT, ESRRGB, DIAEST, DIAESG, ORDAIS
                FROM ESCALAS1
                ORDER BY ESCHAB
            """))
            pacientes = result_pacientes.mappings().all()

            # 🔹 Indicadores
            total_pacientes = conn.execute(text("SELECT TOTAL_PACIENTES FROM TOTPACURG1")).scalar()
            escala_goldberg = conn.execute(text("SELECT CATEGORIA, TOTAL FROM GOLDURG1")).mappings().all()
            riesgo_lpp = conn.execute(text("SELECT NO_PACI, TRIM(ESCALAPOR) ESCALAPOR FROM ESCUPPURG1")).mappings().all()
            riesgo_caida = conn.execute(text("SELECT NO_PACI, TRIM(ESCALAPOR) ESCALAPOR FROM RIECAURG1")).mappings().all()
            promedio_estancia = conn.execute(text("SELECT PROM FROM PROMESURG1")).scalar()

            # 🔹 Armar respuesta JSON
            response_data = {
                "pacientes_en_cama": [dict(row) for row in pacientes],
                "indicadores": {
                    "total_pacientes": total_pacientes,
                    "escala_goldberg": [dict(row) for row in escala_goldberg],
                    "riesgo_lpp": [dict(row) for row in riesgo_lpp],
                    "riesgo_caida": [dict(row) for row in riesgo_caida],
                    "promedio_estancia": str(promedio_estancia) if promedio_estancia else "0",
                }
            }
        return jsonify(response_data)

    except Exception as e:
        print("❌ Error en obtener_datos_urg:")
        traceback.print_exc()
        return jsonify({"error": f"Error al ejecutar SP_Escalas_urgd: {str(e)}"}), 500


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
                    FROM ESCALASURG1 
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
