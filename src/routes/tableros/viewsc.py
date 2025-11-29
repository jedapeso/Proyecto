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


# Lista de pacientes EN EL TABLERO (desde PACMCIR1 - la grilla)
@tableros_bp.route('/cirugia/pacientes', methods=['GET'])
def obtener_pacientes_cirugia():
    """API para obtener lista de pacientes que están en el tablero (PACMCIR1)"""
    try:
        with engine.begin() as conn:
            result = conn.execute(text("""
                SELECT ciride as id, cirnom as nombre, cirest as estado
                FROM PACMCIR1
                ORDER BY cirnom ASC
            """))
            
            pacientes = []
            for row in result.mappings().all():
                pacientes.append({
                    'id': row.get('id'),
                    'nombre': row.get('nombre'),
                    'estado': row.get('estado')
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


# Lista de pacientes DISPONIBLES para insertar (desde PACCIR1 - el modal)
@tableros_bp.route('/cirugia/pacientes/disponibles', methods=['GET'])
def obtener_pacientes_disponibles():
    """API para obtener lista de pacientes disponibles para agregar (PACCIR1)"""
    try:
        with engine.begin() as conn:
            # Ejecutar el stored procedure que llena PACCIR1
            conn.execute(text("EXECUTE PROCEDURE SP_pacientesTabCird()"))
            
            # Consultar PACCIR1 (pacientes disponibles)
            result = conn.execute(text("""
                SELECT identificacion as id, nombre
                FROM PACCIR1
                ORDER BY nombre ASC
            """))
            
            pacientes = []
            for row in result.mappings().all():
                pacientes.append({
                    'id': row.get('id'),
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


# Insertar paciente al tablero (desde PACCIR1 hacia PACMCIR1)
@tableros_bp.route('/cirugia/pacientes', methods=['POST'])
def insertar_paciente_cirugia():
    """API para insertar paciente de PACCIR1 a PACMCIR1"""
    try:
        data = request.get_json()
        identificacion = data.get("identificacion")
        nombre = data.get("nombre")

        if not identificacion or not nombre:
            return jsonify({"success": False, "error": "Faltan datos obligatorios"}), 400

        with engine.begin() as conn:
            # Verifica si el paciente ya existe en PACMCIR1
            result = conn.execute(text("""
                SELECT 1 FROM PACMCIR1 WHERE ciride = :identificacion
            """), {"identificacion": identificacion})

            if result.first():
                return jsonify({"success": False, "error": "El paciente ya está en el tablero"}), 409

            # Inserta el paciente en PACMCIR1 (estado 'P' lo pone la BD automáticamente)
            conn.execute(text("""
                INSERT INTO PACMCIR1 (ciride, cirnom)
                VALUES (:identificacion, :nombre)
            """), {
                "identificacion": identificacion,
                "nombre": nombre
            })

        return jsonify({"success": True, "mensaje": "Paciente insertado correctamente"})

    except Exception as e:
        print("❌ Error en insertar_paciente_cirugia:")
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


# Actualizar estado en PACMCIR1
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
                UPDATE PACMCIR1
                SET cirest = :estado
                WHERE ciride = :identificacion
            """), {
                "estado": nuevo_estado,
                "identificacion": identificacion
            })

        return jsonify({"success": True, "mensaje": "Estado actualizado correctamente"})

    except Exception as e:
        print("❌ Error en actualizar_estado_paciente:")
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


# Eliminar paciente de PACMCIR1
@tableros_bp.route('/cirugia/pacientes', methods=['DELETE'])
def eliminar_paciente_cirugia():
    try:
        data = request.get_json()
        identificacion = data.get("identificacion")

        if not identificacion:
            return jsonify({"success": False, "error": "Faltan datos obligatorios"}), 400

        with engine.begin() as conn:
            conn.execute(text("""
                DELETE FROM PACMCIR1
                WHERE ciride = :identificacion
            """), {
                "identificacion": identificacion
            })

        return jsonify({"success": True, "mensaje": "Paciente eliminado correctamente"})

    except Exception as e:
        print("❌ Error en eliminar_paciente_cirugia:")
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500
