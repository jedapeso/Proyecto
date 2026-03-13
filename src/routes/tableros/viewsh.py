from flask import render_template, request, jsonify
from src import engine
from sqlalchemy import text
from datetime import datetime
import pandas as pd
import io
from dotenv import load_dotenv
from google import genai
import os
import traceback
import unicodedata
import re
from . import tableros_bp

# --------------------------------------------
# 🔹 Cargar variables de entorno
load_dotenv()

api_key = os.getenv("GOOGLE_API_KEY")
gemini_model_name = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
_gemini_client = None

# --------------------------------------------
fecha_actual = datetime.now().strftime('%Y-%m-%d')


def get_gemini_client():
    global _gemini_client

    if _gemini_client is not None:
        return _gemini_client

    if not api_key:
        return None

    try:
        _gemini_client = genai.Client(api_key=api_key)
    except Exception:
        _gemini_client = None

    return _gemini_client

# --------------------------------------------
# 🔹 Vista principal del tablero de HOSPITALIZACIÓN
@tableros_bp.route('/hospitalizacion', methods=['GET'])
def tablero_hos():
    try:
        with engine.connect() as conn:
            result = conn.execute(text("SELECT ubicod,ubinom FROM INUBI WHERE UBICOD IN ('H1', 'H2', 'H3','UA') ORDER BY 1"))
            servicios = result.fetchall()
        return render_template('tableros/tablero_hos.html', servicios=servicios)
    except Exception as e:
        return f"Error cargando los servicios: {str(e)}", 500

# --------------------------------------------
# 🔹 Endpoint: datos del tablero de HOSPITALIZACIÓN
@tableros_bp.route('/hospitalizacion/datos', methods=['POST'])
def obtener_datos_hos():
    try:
        data = request.json
        ubicod = data.get('ubicod') 

        if not ubicod:
            return jsonify({"error": "Falta parámetro ubicod"}), 400

        with engine.begin() as conn:
            # ⚙️ Ejecuta el SP con el parámetro correcto
            conn.execute(text("EXECUTE PROCEDURE SP_Escalas_hosd(:ubicod)"), {"ubicod": ubicod})

            # 🔹 Datos de pacientes
            result_pacientes = conn.execute(text("""
                SELECT ESCHIS, ESCNUM, ESCIDE, ESCEDA, ESCPAC, ESCHAB, ESCDIA, ESCEPI, ESCGOL,
                       ESGRGB, ESCBRA, ESBINT, ESBRGB, ESCRIE, ESRINT, ESRRGB, DIAEST, DIAESG, ORDAIS
                FROM ESCALAS1 ORDER BY ESCHAB
            """))
            pacientes = result_pacientes.mappings().all()

            # 🔹 Indicadores
            total_pacientes = conn.execute(text("SELECT TOTAL_PACIENTES FROM TOTPAC1")).scalar()
            escala_goldberg = conn.execute(text("SELECT CATEGORIA,TOTAL FROM GOLD1")).mappings().all()
            riesgo_lpp = conn.execute(text("SELECT NO_PACI,TRIM(ESCALAPOR) ESCALAPOR FROM ESCUPP1")).mappings().all()
            riesgo_caida = conn.execute(text("SELECT NO_PACI,TRIM(ESCALAPOR) ESCALAPOR FROM RIECA1")).mappings().all()
            promedio_estancia = conn.execute(text("SELECT PROM FROM PROMES1")).scalar()

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
        return jsonify({"error": f"Error al ejecutar SP_Escalas_hosd: {str(e)}"}), 500

# --------------------------------------------
# 🔹 Conversión a lenguaje natural (IA)
def convertir_a_lenguaje_natural_hos(texto):
    """
    Versión IA para Hospitalización — usa su propio prompt si existe,
    pero mantiene la misma lógica que UCI.
    """
    if not texto or texto.strip().lower() in ["none", "null", ""]:
        return "Sin información disponible"

    client = get_gemini_client()
    if client is None:
        return "La función de resumen IA no está disponible (API Key no configurada)."

    ruta_prompt = os.path.join("config", "prompts", "tablero_hos_v1.txt")

    try:
        with open(ruta_prompt, "r", encoding="utf-8") as f:
            prompt_base = f.read()
    except FileNotFoundError:
        # Si no existe, usar el mismo de UCI
        ruta_prompt = os.path.join("config", "prompts", "tablero_uci_v1.txt")
        with open(ruta_prompt, "r", encoding="utf-8") as f:
            prompt_base = f.read()

    prompt = prompt_base.replace("{texto}", texto.strip())

    try:
        response = client.models.generate_content(
            model=gemini_model_name,
            contents=prompt,
        )
        return response.text.strip() if response and response.text else "Sin información generada"
    except Exception as e:
        return "Error al procesar la información (verifique el log del servidor)."


# --------------------------------------------
# 🔹 Endpoint: riesgos y necesidades
@tableros_bp.route('/hospitalizacion/riesgos-necesidades-detalle', methods=['POST'])
def obtener_riesgos_necesidades_hos():
    """
    Devuelve el resumen de riesgos y necesidades del paciente (Hospitalización)
    con el mismo SP que UCI por ahora.
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
                    FROM ESCALAS1 WHERE ESCIDE = :escide
                """),
                {"escide": escide}
            ).fetchone()

            if not paciente:
                return jsonify({"resumen": "No se encontraron datos del paciente."})

            escide_db, nombre, habitacion, diagnostico, escepi = paciente

            # ⚙️ Ejecuta SP de riesgos/necessidades
            conn.execute(
                text("EXECUTE PROCEDURE SP_Riesgos_Necesidadesd(:ESCEPI)"),
                {"ESCEPI": escepi}
            )

            filas = conn.execute(text("SELECT LISTAS FROM RESUMEN1")).fetchall()

        if not filas:
            return jsonify({
                "escide": escide_db,
                "nombre": nombre,
                "habitacion": habitacion,
                "diagnostico": diagnostico,
                "resumen_ia": "No se encontraron riesgos o necesidades."
            })

        riesgos_texto = " ".join(f[0] for f in filas if f[0])
        resumen_ia = convertir_a_lenguaje_natural_hos(riesgos_texto)

        return jsonify({
            "escide": escide_db,
            "nombre": nombre,
            "habitacion": habitacion,
            "diagnostico": diagnostico,
            "resumen_ia": resumen_ia
        })

    except Exception as e:
        return jsonify({"error": f"Error al obtener riesgos: {str(e)}"}), 500
