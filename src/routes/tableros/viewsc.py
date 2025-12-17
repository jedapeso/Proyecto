from flask import render_template, request, jsonify
from src import engine
from sqlalchemy import text
from datetime import datetime
import pandas as pd
from dotenv import load_dotenv
import google.generativeai as genai
import os
import qrcode
import io
import base64
import traceback
import secrets
import time
from . import tableros_bp


# Cargar variables de entorno
load_dotenv()


api_key = os.getenv("GOOGLE_API_KEY")
if not api_key:
    raise ValueError("⚠️ No se encontró GOOGLE_API_KEY en .env")


genai.configure(api_key=api_key)
model = genai.GenerativeModel("gemini-2.5-flash")


fecha_actual = datetime.now().strftime('%Y-%m-%d')


# Diccionario temporal para almacenar tokens (en producción usar Redis)
tokens_validos = {}


# ========== RUTAS PRINCIPALES ==========


@tableros_bp.route('/cirugia', methods=['GET'])
def tablero_cir():
    """Renderiza el tablero de Cirugía"""
    return render_template('tableros/tablero_cir.html')


@tableros_bp.route('/cirugia/publico', methods=['GET'])
def tablero_cirugia_publico():
    """Renderiza el tablero público para acompañantes"""
    return render_template('tableros/tablero_cir_pub.html')


# ========== API PACIENTES ==========


@tableros_bp.route('/cirugia/pacientes', methods=['GET'])
def obtener_pacientes_cirugia():
    """API para obtener lista de pacientes que están en el tablero (PACMCIR1) con info de llamado"""
    try:
        with engine.begin() as conn:
            result = conn.execute(text("""
                SELECT ciride as id, cirnom as nombre, cirest as estado, 
                       llamado, msm_llamado
                FROM PACMCIR1
                ORDER BY cirnom ASC
            """))
            
            pacientes = []
            for row in result.mappings().all():
                # Verificar si llamado es 't', 'T' o '1' (diferentes formas de representar true en Informix)
                llamado_activo = row.get('llamado') in ('t', 'T', '1', 1, True)
                
                pacientes.append({
                    'id': row.get('id'),
                    'nombre': row.get('nombre'),
                    'estado': row.get('estado'),
                    'llamado': llamado_activo,
                    'mensaje_llamado': row.get('msm_llamado') if row.get('msm_llamado') else 'Por favor acérquese a Cirugía'
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


@tableros_bp.route('/cirugia/pacientes/disponibles', methods=['GET'])
def obtener_pacientes_disponibles():
    """API para obtener lista de pacientes disponibles para agregar (PACCIR1)"""
    try:
        with engine.begin() as conn:
            conn.execute(text("EXECUTE PROCEDURE SP_pacientesTabCird()"))
            
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
            result = conn.execute(text("""
                SELECT 1 FROM PACMCIR1 WHERE ciride = :identificacion
            """), {"identificacion": identificacion})


            if result.first():
                return jsonify({"success": False, "error": "El paciente ya está en el tablero"}), 409


            conn.execute(text("""
                INSERT INTO PACMCIR1 (ciride, cirnom, llamado, msm_llamado)
                VALUES (:identificacion, :nombre, 'f', 'Por favor acérquese a Cirugía')
            """), {
                "identificacion": identificacion,
                "nombre": nombre
            })


        return jsonify({"success": True, "mensaje": "Paciente insertado correctamente"})


    except Exception as e:
        print("❌ Error en insertar_paciente_cirugia:")
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


@tableros_bp.route('/cirugia/pacientes/estado', methods=['PUT'])
def actualizar_estado_paciente():
    """Actualizar estado del paciente (P, Q, R)"""
    try:
        data = request.get_json()
        identificacion = data.get("identificacion")
        nuevo_estado = data.get("estado")


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


@tableros_bp.route('/cirugia/pacientes', methods=['DELETE'])
def eliminar_paciente_cirugia():
    """Eliminar paciente del tablero"""
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


# ========== SISTEMA DE LLAMADOS ==========


@tableros_bp.route('/cirugia/pacientes/llamar', methods=['PUT'])
def llamar_paciente():
    """Activar o desactivar llamado visual para un paciente"""
    try:
        data = request.get_json()
        identificacion = data.get("identificacion")
        llamado = data.get("llamado", True)
        mensaje = data.get("mensaje", "Por favor acérquese a Cirugía")
        
        if not identificacion:
            return jsonify({"success": False, "error": "Identificación requerida"}), 400
        
        # Convertir booleano a 't' o 'f' para Informix
        llamado_valor = 't' if llamado else 'f'
        
        with engine.begin() as conn:
            conn.execute(text("""
                UPDATE PACMCIR1 
                SET llamado = :llamado, msm_llamado = :mensaje
                WHERE ciride = :identificacion
            """), {
                "llamado": llamado_valor,
                "mensaje": mensaje,
                "identificacion": identificacion
            })
        
        return jsonify({
            "success": True, 
            "mensaje": "Llamado activado" if llamado else "Llamado desactivado"
        })
    
    except Exception as e:
        print("❌ Error al actualizar llamado:")
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


@tableros_bp.route('/cirugia/pacientes/llamar/desactivar-todos', methods=['PUT'])
def desactivar_todos_llamados():
    """Desactivar todos los llamados activos"""
    try:
        with engine.begin() as conn:
            result = conn.execute(text("""
                UPDATE PACMCIR1 
                SET llamado = 'f'
                WHERE llamado = 't'
            """))
        
        return jsonify({
            "success": True, 
            "mensaje": "Todos los llamados desactivados"
        })
    
    except Exception as e:
        print("❌ Error al desactivar llamados:")
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


@tableros_bp.route('/cirugia/pacientes/llamados-activos', methods=['GET'])
def obtener_llamados_activos():
    """Obtener lista de pacientes con llamado activo"""
    try:
        with engine.begin() as conn:
            result = conn.execute(text("""
                SELECT ciride as id, cirnom as nombre, cirest as estado, msm_llamado
                FROM PACMCIR1 
                WHERE llamado = 't'
                ORDER BY cirnom ASC
            """))
            
            llamados = []
            for row in result.mappings().all():
                # Ocultar datos sensibles
                nombre_oculto = ocultar_nombre(row.get('nombre'))
                id_oculto = ocultar_id(str(row.get('id')))
                
                llamados.append({
                    'id': id_oculto,
                    'id_completo': row.get('id'),
                    'nombre': nombre_oculto,
                    'nombre_completo': row.get('nombre'),
                    'estado': row.get('estado'),
                    'mensaje': row.get('msm_llamado') if row.get('msm_llamado') else 'Por favor acérquese a Cirugía'
                })
        
        return jsonify({"success": True, "llamados": llamados})
    
    except Exception as e:
        print("❌ Error al obtener llamados activos:")
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


# ========== FUNCIONES AUXILIARES ==========


def ocultar_nombre(nombre):
    """Ocultar partes del nombre con asteriscos"""
    if not nombre:
        return "***"
    
    partes = str(nombre).strip().split()
    return ' '.join([p[:3] + '***' if len(p) > 3 else p + '***' for p in partes])


def ocultar_id(identificacion):
    """Ocultar parte del ID"""
    if not identificacion:
        return "****"
    
    identificacion_str = str(identificacion).strip()
    if len(identificacion_str) > 4:
        return identificacion_str[:-4] + '****'
    return '****'


# ========== SISTEMA QR CON TOKENS ==========


@tableros_bp.route('/cirugia/generar-qr/<identificacion>', methods=['GET'])
def generar_qr_paciente(identificacion):
    """Genera un QR con token de acceso automático"""
    try:
        # Generar token único y seguro
        token = secrets.token_urlsafe(32)
        
        # Guardar token con timestamp (válido por 24 horas)
        tokens_validos[token] = {
            'identificacion': identificacion,
            'timestamp': time.time(),
            'expira_en': 86400  # 24 horas en segundos
        }
        
        # URL de acceso con token
        url_acceso = f"{request.host_url}tableros/cirugia/paciente/{identificacion}?token={token}"
        
        # Generar QR
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_L,
            box_size=10,
            border=4,
        )
        qr.add_data(url_acceso)
        qr.make(fit=True)
        
        img = qr.make_image(fill_color="black", back_color="white")
        
        # Convertir a base64
        buffer = io.BytesIO()
        img.save(buffer, format='PNG')
        img_str = base64.b64encode(buffer.getvalue()).decode()
        
        # Obtener últimos 4 dígitos
        clave = identificacion[-4:]
        
        return jsonify({
            "success": True,
            "qr_image": f"data:image/png;base64,{img_str}",
            "url": url_acceso,
            "clave": clave,
            "identificacion": identificacion,
            "token": token
        })
    
    except Exception as e:
        print(f"❌ Error al generar QR: {e}")
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


@tableros_bp.route('/cirugia/paciente/<identificacion>', methods=['GET'])
def vista_paciente_personalizada(identificacion):
    """Muestra la vista personalizada con validación automática si hay token"""
    token = request.args.get('token')
    tiene_token_valido = False
    
    # Validar token si existe
    if token and token in tokens_validos:
        datos_token = tokens_validos[token]
        
        # Verificar que no haya expirado
        tiempo_transcurrido = time.time() - datos_token['timestamp']
        
        if tiempo_transcurrido < datos_token['expira_en']:
            # Verificar que la identificación coincida
            if datos_token['identificacion'] == identificacion:
                tiene_token_valido = True
        else:
            # Token expirado, eliminar
            del tokens_validos[token]
    
    return render_template(
        'tableros/vista_paciente.html', 
        identificacion=identificacion,
        token=token if tiene_token_valido else None,
        acceso_automatico=tiene_token_valido
    )


@tableros_bp.route('/cirugia/paciente/validar', methods=['POST'])
def validar_acceso_paciente():
    """Valida acceso por clave O por token"""
    try:
        data = request.get_json()
        identificacion = data.get("identificacion")
        clave = data.get("clave")
        token = data.get("token")
        
        # Opción 1: Validar por token
        if token and token in tokens_validos:
            datos_token = tokens_validos[token]
            tiempo_transcurrido = time.time() - datos_token['timestamp']
            
            if tiempo_transcurrido < datos_token['expira_en']:
                if datos_token['identificacion'] == identificacion:
                    # Token válido, obtener datos
                    with engine.begin() as conn:
                        # [CORRECCIÓN] Agregamos 'llamado' a la consulta SQL
                        result = conn.execute(text("""
                            SELECT ciride as id, cirnom as nombre, cirest as estado, llamado
                            FROM PACMCIR1
                            WHERE ciride = :identificacion
                        """), {"identificacion": identificacion})
                        
                        paciente = result.mappings().first()
                        
                        if not paciente:
                            return jsonify({"success": False, "error": "Paciente no encontrado"}), 404
                        
                        return jsonify({
                            "success": True,
                            "paciente": {
                                "identificacion": paciente['id'],
                                "nombre": paciente['nombre'],
                                "estado": paciente['estado'],
                                # [CORRECCIÓN] Agregamos 'llamado' al JSON
                                "llamado": bool(paciente['llamado']) if paciente['llamado'] else False
                            }
                        })
            else:
                # Token expirado
                del tokens_validos[token]
                return jsonify({"success": False, "error": "Token expirado"}), 401
        
        # Opción 2: Validar por clave
        if clave:
            if clave != identificacion[-4:]:
                return jsonify({"success": False, "error": "Clave incorrecta"}), 401
            
            with engine.begin() as conn:
                # [CORRECCIÓN] Agregamos 'llamado' a la consulta SQL
                result = conn.execute(text("""
                    SELECT ciride as id, cirnom as nombre, cirest as estado, llamado
                    FROM PACMCIR1
                    WHERE ciride = :identificacion
                """), {"identificacion": identificacion})
                
                paciente = result.mappings().first()
                
                if not paciente:
                    return jsonify({"success": False, "error": "Paciente no encontrado"}), 404
                
                return jsonify({
                    "success": True,
                    "paciente": {
                        "identificacion": paciente['id'],
                        "nombre": paciente['nombre'],
                        "estado": paciente['estado'],
                        # [CORRECCIÓN] Agregamos 'llamado' al JSON
                        "llamado": bool(paciente['llamado']) if paciente['llamado'] else False
                    }
                })
        
        return jsonify({"success": False, "error": "Falta clave o token"}), 400
    
    except Exception as e:
        print(f"❌ Error al validar acceso: {e}")
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500


@tableros_bp.route('/cirugia/limpiar-tokens', methods=['POST'])
def limpiar_tokens_expirados():
    """Limpia tokens expirados (opcional, llamar periódicamente)"""
    try:
        tiempo_actual = time.time()
        tokens_eliminar = []
        
        for token, datos in tokens_validos.items():
            tiempo_transcurrido = tiempo_actual - datos['timestamp']
            if tiempo_transcurrido >= datos['expira_en']:
                tokens_eliminar.append(token)
        
        for token in tokens_eliminar:
            del tokens_validos[token]
        
        return jsonify({
            "success": True,
            "tokens_eliminados": len(tokens_eliminar),
            "tokens_activos": len(tokens_validos)
        })
    
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500

