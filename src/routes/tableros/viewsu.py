from flask import render_template, request, jsonify
from src import engine
from sqlalchemy import text
from datetime import datetime
import time
import os
import hashlib
import traceback
from dotenv import load_dotenv
import google.generativeai as genai
from google.api_core import exceptions as google_exceptions
from src.extensions import redis_client
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
            # Usar SP para cargar ubicaciones y evitar duplicar lógica en el BP
            conn.execute(text("EXECUTE PROCEDURE SP_ubica_urgd()"))
            result = conn.execute(text("""
                SELECT DISTINCT UBICA, TIPO
                FROM UBICA1
                ORDER BY TIPO
            """)).mappings()
            servicios = [{'ubicod': row['tipo'], 'ubinom': row['ubica']} for row in result]
        return render_template('tableros/tablero_urg.html', servicios=servicios)
    except Exception as e:
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
                pass

            # B. Promedio Estancia
            try:
                promedio_estancia = conn.execute(text("SELECT PROM FROM PROMES1")).scalar() or "0"
            except Exception as e:
                pass

            # C. Escala GRACE
            try:
                escala_grace = [dict(row) for row in conn.execute(text("SELECT TRIM(ESCALAPOR) ESCALAPOR, NO_PACI FROM GRACE1")).mappings()]
            except Exception as e:
                pass

            # D. Riesgo CURB-65
            try:
                riesgo_curb65 = [dict(row) for row in conn.execute(text("SELECT TRIM(ESCALAPOR) ESCALAPOR, NO_PACI FROM CURB1")).mappings()]
            except Exception as e:
                pass

            # E. Riesgo CAÍDA
            try:
                riesgo_caida = [dict(row) for row in conn.execute(text("SELECT TRIM(ESCALAPOR) ESCALAPOR, NO_PACI FROM RIECA1")).mappings()]
            except Exception as e:
                pass

            # F. Riesgo NIHSS
            try:
                riesgo_nihss = [dict(row) for row in conn.execute(text("SELECT TRIM(ESCALAPOR) ESCALAPOR, NO_PACI FROM NIHSS1")).mappings()]
            except Exception as e:
                pass

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
        return jsonify({"error": f"Error servidor: {str(e)}"}), 500

# --------------------------------------------
# 🔹 Conversión a lenguaje natural (IA) con caché inteligente
def convertir_a_lenguaje_natural_urg(texto):
    """
    Versión IA para Urgencias con caché basado en contenido.
    Si los riesgos cambian, el hash cambia y se genera nuevo análisis.
    """
    if not texto or texto.strip().lower() in ["none", "null", ""]:
        return "Sin información disponible"

    if not api_key:
        return "La función de resumen IA no está disponible (API Key no configurada)."

# 🔹 Conversión a lenguaje natural (IA) con caché inteligente
def convertir_a_lenguaje_natural_urg(texto):
    """
    Versión IA para Urgencias con caché basado en contenido.
    Si los riesgos cambian, el hash cambia y se genera nuevo análisis.
    """
    if not texto or texto.strip().lower() in ["none", "null", ""]:
        return "Sin información disponible"

    if not api_key:
        return "La función de resumen IA no está disponible (API Key no configurada)."

    # Normalizar texto: quitar espacios extras, saltos de línea múltiples
    texto_normalizado = ' '.join(texto.strip().split())
    
    # Generar hash MD5 del contenido normalizado
    content_hash = hashlib.md5(texto_normalizado.encode('utf-8')).hexdigest()
    cache_key = f"ia_resumen_urg:{content_hash}"
    
    # Intentar obtener del caché (TTL: 24 horas)
    try:
        cached_response = redis_client.get(cache_key)
        if cached_response:
            # Redis puede devolver str o bytes dependiendo de la configuración
            if isinstance(cached_response, bytes):
                return cached_response.decode('utf-8')
            return cached_response
    except Exception as e:
        # Si Redis falla y ya excedimos cuota, devolver mensaje sin intentar API
        return "⚠️ El servicio de caché no está disponible. Por favor, contacte al administrador."

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
        resultado = response.text.strip() if response and response.text else "Sin información generada"
        
        # Guardar en caché por 8 horas (28800 segundos)
        try:
            redis_client.setex(cache_key, 28800, resultado)
        except Exception as e:
            pass
            
        return resultado
    except google_exceptions.ResourceExhausted:
        return "⚠️ Se ha excedido la cuota diaria de la API de Gemini (20 solicitudes/día en plan gratuito). Por favor, intente nuevamente mañana o actualice su plan en Google AI Studio."
    except Exception as e:
        traceback.print_exc()
        return f"Error al procesar la información con IA: {str(e)}"


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
                text("EXECUTE PROCEDURE SP_Riesgos_Necesidadesd(:ESCEPI)"),
                {"ESCEPI": escepi}
            )

            filas = conn.execute(text("SELECT LISTAS FROM RESUMEN1")).fetchall()
            # Reintentos con delays progresivos por si el SP tarda en poblar RESUMEN1
            if not filas:
                for intento in [0.25, 0.50, 0.75]:
                    time.sleep(intento)
                    filas = conn.execute(text("SELECT LISTAS FROM RESUMEN1")).fetchall()
                    if filas:
                        break

        if not filas:
            return jsonify({
                "escide": escide_db,
                "nombre": nombre,
                "habitacion": habitacion,
                "diagnostico": diagnostico,
                "resumen_ia": "No se ha diligenciado listas de chequeo de Riesgos y Necesidades para el paciente."
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
