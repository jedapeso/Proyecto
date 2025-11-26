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


#lista de pacientes
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

#insertar paciente al tablero cirugía
@tableros_bp.route('/cirugia/pacientes', methods=['POST'])
def insertar_paciente_cirugia():
    """API para insertar paciente al tablero cirugía (solo si no existe)"""
    try:
        data = request.get_json()
        identificacion = data.get("identificacion")
        nombre = data.get("nombre")

        if not identificacion or not nombre:
            return jsonify({"success": False, "error": "Faltan datos obligatorios"}), 400

        with engine.begin() as conn:
            # Verifica si el paciente ya existe
            result = conn.execute(text("""
                SELECT 1 FROM PACCIR1 WHERE CIRIDE = :identificacion
            """), {"identificacion": identificacion})

            if result.first():
                return jsonify({"success": False, "error": "El paciente ya está en el tablero"}), 409

            # Inserta el paciente con estado 'P' por defecto
            conn.execute(text("""
                EXECUTE PROCEDURE SP_insertarPaciente(:identificacion, :nombre)
            """), {
                "identificacion": identificacion,
                "nombre": nombre
            })

        return jsonify({"success": True, "mensaje": "Paciente insertado correctamente"})

    except Exception as e:
        print("❌ Error en insertar_paciente_cirugia:")
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500
    

    
#Actualizar estado (completa el endpoint PUT)
@tableros_bp.route('/cirugia/pacientes/estado', methods=['PUT'])
def actualizar_estado_paciente():
    try:
        data = request.get_json()
        identificacion = data.get("identificacion")
        nuevo_estado = data.get("estado")  # 'P', 'Q', 'R'

        if not identificacion or not nuevo_estado:
            return jsonify({"success": False, "error": "Faltan datos obligatorios"}), 400

        with engine.begin() as conn:
            conn.execute(text("""
                EXECUTE PROCEDURE SP_actualizarEstadoPaciente(:identificacion, :estado)
            """), {
                "identificacion": identificacion,
                "estado": nuevo_estado
            })

        return jsonify({"success": True, "mensaje": "Estado actualizado correctamente"})

    except Exception as e:
        print("❌ Error en actualizar_estado_paciente:")
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500



#Eliminar paciente (completa el endpoint DELETE)
@tableros_bp.route('/cirugia/pacientes', methods=['DELETE'])
def eliminar_paciente_cirugia():
    try:
        data = request.get_json()
        identificacion = data.get("identificacion")

        if not identificacion:
            return jsonify({"success": False, "error": "Faltan datos obligatorios"}), 400

        with engine.begin() as conn:
            conn.execute(text("""
                EXECUTE PROCEDURE SP_eliminarPaciente(:identificacion)
            """), {
                "identificacion": identificacion
            })

        return jsonify({"success": True, "mensaje": "Paciente eliminado correctamente"})

    except Exception as e:
        print("❌ Error en eliminar_paciente_cirugia:")
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500

    
# Lista completa de pacientes (usado sólo en el modal, NO la grilla principal)
@tableros_bp.route('/cirugia/pacientes/disponibles', methods=['GET'])
def obtener_pacientes_disponibles():
    """API para obtener lista completa de pacientes disponibles para agregar al tablero"""
    try:
        with engine.begin() as conn:
            result = conn.execute(text("""
                SELECT identificacion as id, nombre
                FROM PACIENTES
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
        print("❌ Error en obtener_pacientes_disponibles:")
        traceback.print_exc()
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

