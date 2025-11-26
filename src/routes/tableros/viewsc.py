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

# Cargar variables de entorno
load_dotenv()

api_key = os.getenv("GOOGLE_API_KEY")
if not api_key:
    raise ValueError("⚠️ No se encontró GOOGLE_API_KEY en .env")

genai.configure(api_key=api_key)
model = genai.GenerativeModel("gemini-2.5-flash")

fecha_actual = datetime.now().strftime('%Y-%m-%d')

@tableros_bp.route('/cirugia', methods=['GET'])
def tablero_cir():
    """Renderiza el tablero de Cirugía"""
    return render_template('tableros/tablero_cir.html')



@tableros_bp.route('/cirugia/pacientes', methods=['GET'])
def obtener_pacientes_cirugia():
    """API para obtener lista de pacientes de cirugía (identificacion y nombre) en orden alfabético"""
    try:
        with engine.begin() as conn:
            conn.execute(text("EXECUTE PROCEDURE SP_pacientesTabCird()"))
            
            # Query con alias explícitos
            result = conn.execute(text("""
                SELECT identificacion as id, nombre
                FROM PACCIR1
                ORDER BY nombre ASC
            """))
            
            pacientes = []
            for row in result.mappings().all():
                pacientes.append({
                    'id': row.get('id') or row.get('identificacion'),
                    'nombre': row.get('nombre')
                })
        
        return jsonify({
            "success": True,
            "total": len(pacientes),
            "pacientes": pacientes
        })
    
    except Exception as e:
        print("❌ Error en obtener_pacientes_cirugia:")
        traceback.print_exc()
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500
