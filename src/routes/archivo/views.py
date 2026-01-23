from flask import render_template, request, jsonify
from . import archivo_bp
from src import engine
from sqlalchemy import text




@archivo_bp.route('/', methods=['GET'])
def dashboard():
    """Dashboard principal del módulo de Archivo"""
    return render_template('archivo/dashboard.html')


@archivo_bp.route('/centros-costo', methods=['GET'])
def obtener_centros_costo():
    """Obtiene los centros de costo para traslados desde SP_UbicaTransd"""
    try:
        with engine.connect() as conn:
            # Ejecutar el SP
            conn.execute(text("EXECUTE PROCEDURE SP_UbicaTransd()"))
            
            # Consultar la tabla temporal UBICA1 (campos: CCOCOD, CCONOM)
            result = conn.execute(text("SELECT CCOCOD, CCONOM FROM UBICA1 ORDER BY CCONOM"))
            centros = result.fetchall()
            
            # Formatear respuesta
            data = [
                {
                    'codigo': row[0],
                    'nombre': row[1]  # Solo el nombre del centro
                }
                for row in centros
            ]
            
            print(f"DEBUG - Centros cargados: {data}")
            return jsonify(data)
            
    except Exception as e:
        print(f"Error obteniendo centros de costo: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@archivo_bp.route('/buscar-historia', methods=['POST'])
def buscar_historia():
    """Busca una historia clínica y verifica si ya está trasladada"""
    try:
        data = request.get_json()
        historia = data.get('historia')
        ingreso = data.get('ingreso', 1)  # Por defecto ingreso 1 si no se especifica
        
        if not historia:
            return jsonify({'success': False, 'error': 'Historia requerida'}), 400
        
        with engine.connect() as conn:
            # Ejecutar SP de consulta
            conn.execute(
                text("EXECUTE PROCEDURE SP_TR_CondetHis(:historia, :ingreso)"),
                {'historia': int(historia), 'ingreso': int(ingreso)}
            )
            
            # Consultar resultado de la tabla temporal CONSUL1
            result = conn.execute(text("SELECT * FROM CONSUL1"))
            row = result.fetchone()
            
            if not row:
                return jsonify({'success': False, 'error': 'Historia no encontrada'})
            
            # Obtener nombres de columnas
            columns = result.keys()
            row_dict = dict(zip(columns, row)) if row else {}
            
            # Verificar si es un error (historia ya trasladada)
            if 'ERR' in columns or 'err' in [col.lower() for col in columns]:
                return jsonify({
                    'success': False,
                    'error': row[0],  # Mensaje de error
                    'ya_trasladada': True
                })
            
            # Historia encontrada correctamente - retornar datos del paciente
            # Nombres de columnas esperados: PACTID, PACIDE, NOMBRE, EPIINAFEN, EPIINAFAL
            return jsonify({
                'success': True,
                'tipo_id': row[0] if len(row) > 0 else '',          # PACTID
                'identificacion': row[1] if len(row) > 1 else '',    # PACIDE
                'nombre': row[2] if len(row) > 2 else '',            # NOMBRE
                'fecha_ingreso': str(row[3]) if len(row) > 3 and row[3] else '',  # EPIINAFEN
                'fecha_egreso': str(row[4]) if len(row) > 4 and row[4] else '',   # EPIINAFAL
                'ingreso': ingreso,
                'historia': historia
            })
            
    except Exception as e:
        print(f"Error buscando historia: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500

@archivo_bp.route('/guardar-traslado', methods=['POST'])
def guardar_traslado():
    """Guarda el traslado de historias en las tablas TRAENC y TRADET, usando control de consecutivo seguro"""
    try:
        data = request.get_json()
        origen = data.get('centroOrigen')
        destino = data.get('centroDestino')
        fecha = data.get('fecha')
        historias = data.get('historias', [])
        usuario = 'SISTEMA'  # O usa el usuario real de sesión

        # Validaciones
        if not origen or not destino:
            return jsonify({'success': False, 'error': 'Centro de origen y destino son requeridos'}), 400
        if not historias or len(historias) == 0:
            return jsonify({'success': False, 'error': 'Debe agregar al menos una historia'}), 400

        with engine.begin() as conn:
            # 1. Bloquea y lee el último consecutivo
            result = conn.execute(text("SELECT ultimo FROM TRAS_SEQ_LOCK FOR UPDATE"))
            row = result.fetchone()
            if not row:
                return jsonify({'success': False, 'error': 'No se encontró consecutivo inicial en TRAS_SEQ_LOCK'}), 500
            actual = row[0]
            prefix = actual[:2]
            number = int(actual[2:]) + 1
            nuevo_consecutivo = f"{prefix}{str(number).zfill(6)}"

            # 2. Inserta encabezado
            conn.execute(text("""
                INSERT INTO TRAENC (TRAENCCOD, TRAENCORI, TRAENCDES, TRAENCFEC, TRAENCUSR, TRAENCCON, TRAENCIND, TRAENCCST, TRAENCEST, TRAENCOBS)
                VALUES (:consec, :origen, :destino, TODAY, :usuario, CURRENT, NULL, NULL, 'N', NULL)
            """), {
                'consec': nuevo_consecutivo,
                'origen': origen,
                'destino': destino,
                'usuario': usuario
            })

            # 3. Inserta detalles
            linea = 1
            for historia in historias:
                conn.execute(text("""
                    INSERT INTO TRADET (TRADETCOD, TRADETCON, TRADETHIS, TRADETNUM, TRADETTIP, TRADETIDE, TRADETNOM, TRADETFIN, TRADETFEG, TRADETFTR, TRADESEST, TRADETOBS)
                    VALUES (:consec, :linea, :historia, :ingreso, :tipoid, :id, :nombre, :fec_ing, :fec_egr, CURRENT, 'N', NULL)
                """), {
                    'consec': nuevo_consecutivo,
                    'linea': linea,
                    'historia': int(historia.get('historia', 0)),
                    'ingreso': int(historia.get('ingreso', 1)),
                    'tipoid': historia.get('tipoId', ''),
                    'id': historia.get('identificacion', ''),
                    'nombre': historia.get('nombre', ''),
                    'fec_ing': historia.get('fechaIngreso') if historia.get('fechaIngreso') else None,
                    'fec_egr': historia.get('fechaEgreso') if historia.get('fechaEgreso') else None
                })
                linea += 1

            # 4. Actualiza la tabla de control SOLO si todo fue bien
            conn.execute(text("UPDATE TRAS_SEQ_LOCK SET ultimo = :nuevo"), {'nuevo': nuevo_consecutivo})

            # Commit automático al salir del with
            return jsonify({
                'success': True,
                'message': f'Traslado guardado exitosamente',
                'consecutivo': nuevo_consecutivo,
                'registros': len(historias)
            })

    except Exception as e:
        error_msg = str(e)
        print(f"Error en guardar_traslado: {error_msg}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': error_msg}), 500


@archivo_bp.route('/recepcion/buscar', methods=['POST'])
def buscar_traslados_recepcion():
    """Lista encabezados de traslados en un rango de fechas"""
    try:
        data = request.get_json()
        fecha_inicio = data.get('fecha_inicio')
        fecha_fin = data.get('fecha_fin')

        if not fecha_inicio or not fecha_fin:
            return jsonify({'success': False, 'error': 'Fechas requeridas'}), 400

        with engine.connect() as conn:
            result = conn.execute(text(
                """
                SELECT e.TRAENCCOD, e.TRAENCORI, e.TRAENCDES, e.TRAENCFEC,
                       (SELECT COUNT(*) FROM TRADET d WHERE d.TRADETCOD = e.TRAENCCOD) AS CANT,
                       e.TRAENCEST
                FROM TRAENC e
                WHERE e.TRAENCFEC BETWEEN :fecha_inicio AND :fecha_fin
                  AND e.TRAENCEST = 'N'
                ORDER BY e.TRAENCFEC DESC, e.TRAENCCOD DESC
                """
            ), {'fecha_inicio': fecha_inicio, 'fecha_fin': fecha_fin})

            traslados = [
                {
                    'consecutivo': row[0],
                    'origen': row[1],
                    'destino': row[2],
                    'fecha': str(row[3]) if row[3] else '',
                    'cantidad': row[4],
                    'estado': row[5] if row[5] else 'N'
                }
                for row in result.fetchall()
            ]

            return jsonify({'success': True, 'traslados': traslados})

    except Exception as e:
        print(f"Error buscando traslados recepción: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@archivo_bp.route('/recepcion/detalle/<consecutivo>', methods=['GET'])
def detalle_recepcion(consecutivo):
    """Retorna detalle de un traslado para recepción y permite mostrar encabezado"""
    try:
        with engine.connect() as conn:
            result = conn.execute(text(
                """
                  SELECT e.TRAENCCOD, e.TRAENCORI, e.TRAENCDES, e.TRAENCFEC, e.TRAENCOBS, e.TRAENCEST,
                      d.TRADETCON, d.TRADETHIS, d.TRADETNUM, d.TRADETTIP, d.TRADETIDE, d.TRADETNOM,
                      d.TRADETFIN, d.TRADETFEG, d.TRADETFTR, d.TRADESEST, d.TRADETOBS
                  FROM TRAENC e
                  INNER JOIN TRADET d ON d.TRADETCOD = e.TRAENCCOD
                  WHERE e.TRAENCCOD = :consecutivo
                  ORDER BY d.TRADETCON
                """
            ), {'consecutivo': consecutivo})

            rows = result.fetchall()
            if not rows:
                return jsonify({'success': False, 'error': 'Traslado no encontrado'}), 404

            encabezado = {
                'consecutivo': rows[0][0],
                'origen': rows[0][1],
                'destino': rows[0][2],
                'fecha': str(rows[0][3]) if rows[0][3] else '',
                'observacionGeneral': rows[0][4] if rows[0][4] else '',
                'estadoEncabezado': rows[0][5] if rows[0][5] else 'N'
            }

            detalle = []
            for row in rows:
                detalle.append({
                    'consecutivo': row[0],
                    'linea': row[6],
                    'historia': row[7],
                    'ingreso': row[8],
                    'tipoId': row[9],
                    'identificacion': row[10],
                    'nombre': row[11],
                    'fecha_ingreso': str(row[12]) if row[12] else '',
                    'fecha_egreso': str(row[13]) if row[13] else '',
                    'fecha_traslado': str(row[14]) if row[14] else '',
                    'estado': row[15] if row[15] else 'N',
                    'estadoOriginal': row[15] if row[15] else 'N',  # Guardar estado original de la BD
                    'observacion': row[16] if len(row) > 16 and row[16] else ''  # Observación de la BD
                })

            return jsonify({'success': True, 'encabezado': encabezado, 'detalle': detalle})

    except Exception as e:
        print(f"Error obteniendo detalle recepción: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@archivo_bp.route('/recepcion/rechazar', methods=['POST'])
def rechazar_historia():
    """Ejecuta SP de rechazo sobre un detalle de traslado"""
    try:
        data = request.get_json()
        consecutivo = data.get('consecutivo')
        historia = data.get('historia')
        ingreso = data.get('ingreso')

        if not consecutivo or not historia:
            return jsonify({'success': False, 'error': 'Parámetros incompletos'}), 400

        with engine.connect() as conn:
            conn.execute(
                text("EXECUTE PROCEDURE SP_TR_rechaza_det(:consecutivo, :historia, :ingreso)"),
                {
                    'consecutivo': consecutivo,
                    'historia': int(historia),
                    'ingreso': int(ingreso) if ingreso else 1
                }
            )
            conn.commit()
            return jsonify({'success': True})

    except Exception as e:
        print(f"Error rechazando historia: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@archivo_bp.route('/recepcion/guardar', methods=['POST'])
def guardar_recepcion():
    """Guarda la recepción procesando tanto aceptadas como rechazadas"""
    try:
        data = request.get_json()
        consecutivo = data.get('consecutivo')
        detalle = data.get('detalle', [])
        observacion_general = data.get('observacionGeneral', '').strip()
        es_rechazo_general = data.get('esRechazoGeneral', False)

        if not consecutivo:
            return jsonify({'success': False, 'error': 'Consecutivo requerido'}), 400

        if not detalle:
            return jsonify({'success': False, 'error': 'No hay cambios para aplicar'}), 400

        # Intentar castear consecutivo a int si es numérico
        try:
            consecutivo_cast = int(consecutivo)
        except Exception:
            consecutivo_cast = consecutivo

        # Procesar recepción
        with engine.begin() as conn:
            # Si es rechazo general, validar y guardar en TRAENC
            if es_rechazo_general:
                if not observacion_general or len(observacion_general) < 10:
                    return jsonify({'success': False, 'error': 'Observación general inválida. Mínimo 10 caracteres requeridos.'}), 400
                
                # Actualizar observación general en TRAENC
                conn.execute(
                    text("""
                        UPDATE TRAENC 
                        SET TRAENCOBS = :observacion
                        WHERE TRAENCCOD = :consecutivo
                    """),
                    {
                        'observacion': observacion_general,
                        'consecutivo': consecutivo_cast
                    }
                )
            
            # Procesar cada item (tanto aceptadas como rechazadas)
            for item in detalle:
                estado = item.get('estado', 'A')  # 'A' o 'R'
                observacion = item.get('observacion', '').strip()
                historia = int(item.get('historia', 0))
                ingreso = int(item.get('ingreso', 1))
                
                print(f"DEBUG - Procesando historia {historia}, ingreso {ingreso}, estado {estado}")
                
                if estado == 'R':
                    # Es un rechazo
                    # Solo validar observación individual si NO es rechazo general
                    if not es_rechazo_general:
                        if not observacion or len(observacion) < 10:
                            return jsonify({'success': False, 'error': f'Observación inválida para historia {historia}. Mínimo 10 caracteres requeridos.'}), 400
                    
                    # Ejecutar SP de rechazo (actualiza estado a 'R')
                    print(f"DEBUG - Ejecutando SP_TR_rechaza_det para historia {historia}")
                    conn.execute(
                        text("EXECUTE PROCEDURE SP_TR_rechaza_det(:consecutivo, :historia, :ingreso)"),
                        {
                            'consecutivo': consecutivo_cast,
                            'historia': historia,
                            'ingreso': ingreso
                        }
                    )
                    
                    # Actualizar observación individual en TRADET solo si NO es rechazo general
                    if not es_rechazo_general and observacion:
                        print(f"DEBUG - Actualizando observación para historia {historia}")
                        conn.execute(
                            text("""
                                UPDATE TRADET 
                                SET TRADETOBS = :observacion
                                WHERE TRADETCOD = :consecutivo 
                                  AND TRADETHIS = :historia 
                                  AND TRADETNUM = :ingreso
                            """),
                            {
                                'observacion': observacion,
                                'consecutivo': consecutivo_cast,
                                'historia': historia,
                                'ingreso': ingreso
                            }
                        )
                else:
                    # Es una aceptación (estado 'A')
                    # Actualizar estado directamente en TRADET
                    print(f"DEBUG - Actualizando estado a 'A' para historia {historia}")
                    result = conn.execute(
                        text("""
                            UPDATE TRADET 
                            SET TRADESEST = 'A'
                            WHERE TRADETCOD = :consecutivo 
                              AND TRADETHIS = :historia 
                              AND TRADETNUM = :ingreso
                        """),
                        {
                            'consecutivo': consecutivo_cast,
                            'historia': historia,
                            'ingreso': ingreso
                        }
                    )
                    print(f"DEBUG - Filas afectadas por UPDATE aceptada: {result.rowcount}")

            # Determinar estado del encabezado basado en los estados de detalle
            # Si TODOS los detalles son rechazados ('R'), entonces TRAENCEST = 'R'
            # Si hay al menos UNO aceptado ('A'), entonces TRAENCEST = 'A'
            estado_encabezado = 'R' if all(item.get('estado') == 'R' for item in detalle) else 'A'
            
            print(f"DEBUG - Estado del encabezado calculado: {estado_encabezado}")
            
            conn.execute(text("""
                UPDATE TRAENC 
                SET TRAENCEST = :estado
                WHERE TRAENCCOD = :consecutivo
            """), {'estado': estado_encabezado, 'consecutivo': consecutivo_cast})

        return jsonify({'success': True})

    except Exception as e:
        print(f"Error guardando recepción: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@archivo_bp.route('/reportes/buscar', methods=['POST'])
def buscar_reportes():
    """Busca traslados recepcionados (aceptados o rechazados)"""
    try:
        data = request.get_json()
        fecha_inicio = data.get('fecha_inicio')
        fecha_fin = data.get('fecha_fin')
        estado = data.get('estado')  # 'A' o 'R' o None (para ambos)
        consecutivo = data.get('consecutivo')  # Búsqueda opcional por consecutivo

        if not fecha_inicio or not fecha_fin:
            return jsonify({'success': False, 'error': 'Fechas requeridas'}), 400

        with engine.connect() as conn:
            # Construir la consulta base
            query = """
                SELECT e.TRAENCCOD, e.TRAENCORI, e.TRAENCDES, e.TRAENCFEC,
                       (SELECT COUNT(*) FROM TRADET d WHERE d.TRADETCOD = e.TRAENCCOD) AS CANT,
                       e.TRAENCEST
                FROM TRAENC e
                WHERE e.TRAENCFEC BETWEEN :fecha_inicio AND :fecha_fin
                  AND e.TRAENCEST IN ('A', 'R')
            """
            
            params = {'fecha_inicio': fecha_inicio, 'fecha_fin': fecha_fin}
            
            # Agregar filtro de estado si se proporciona
            if estado and estado in ('A', 'R'):
                query += " AND e.TRAENCEST = :estado"
                params['estado'] = estado
            
            # Agregar filtro de consecutivo si se proporciona
            if consecutivo:
                query += " AND e.TRAENCCOD LIKE :consecutivo"
                params['consecutivo'] = f"%{consecutivo}%"
            
            query += " ORDER BY e.TRAENCFEC DESC, e.TRAENCCOD DESC"
            
            result = conn.execute(text(query), params)

            traslados = [
                {
                    'consecutivo': row[0],
                    'origen': row[1],
                    'destino': row[2],
                    'fecha': str(row[3]) if row[3] else '',
                    'cantidad': row[4],
                    'estado': row[5] if row[5] else 'N'
                }
                for row in result.fetchall()
            ]

            # Si no hay resultados, devolver lista vacía (no error)
            return jsonify({'success': True, 'traslados': traslados})

    except Exception as e:
        print(f"Error buscando reportes: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@archivo_bp.route('/detalle/<consecutivo>', methods=['GET'])
def obtener_detalle_traslado(consecutivo):
    """Obtiene el detalle completo de un traslado para exportación"""
    try:
        with engine.connect() as conn:
            result = conn.execute(text(
                """
                  SELECT e.TRAENCCOD, e.TRAENCORI, e.TRAENCDES, e.TRAENCFEC, e.TRAENCEST,
                      d.TRADETHIS, d.TRADETNUM, d.TRADETTIP, d.TRADETIDE, d.TRADETNOM,
                      d.TRADETFIN, d.TRADETFEG, d.TRADESEST
                  FROM TRAENC e
                  INNER JOIN TRADET d ON d.TRADETCOD = e.TRAENCCOD
                  WHERE e.TRAENCCOD = :consecutivo
                  ORDER BY d.TRADETHIS, d.TRADETNUM
                """
            ), {'consecutivo': consecutivo})

            rows = result.fetchall()
            if not rows:
                return jsonify({'success': False, 'error': 'Traslado no encontrado'}), 404

            # Obtener nombres de centros de costo
            conn.execute(text("EXECUTE PROCEDURE SP_UbicaTransd()"))
            centros = conn.execute(text("""
                SELECT CCOCOD, CCONOM 
                FROM UBICA1 
                WHERE CCOCOD IN (:origen, :destino)
            """), {'origen': rows[0][1], 'destino': rows[0][2]}).fetchall()
            
            centros_dict = {str(c[0]): c[1] for c in centros}
            
            codigo_origen = str(rows[0][1]) if rows[0][1] else ''
            codigo_destino = str(rows[0][2]) if rows[0][2] else ''
            
            encabezado = {
                'consecutivo': rows[0][0],
                'centroOrigen': f"{codigo_origen} - {centros_dict.get(codigo_origen, codigo_origen)}",
                'centroDestino': f"{codigo_destino} - {centros_dict.get(codigo_destino, codigo_destino)}",
                'fecha': str(rows[0][3]) if rows[0][3] else '',
                'estado': rows[0][4] if rows[0][4] else 'N',
                'usuario': 'SISTEMA',
                'fechaCreacion': str(rows[0][3]) if rows[0][3] else ''
            }

            detalles = []
            for row in rows:
                detalles.append({
                    'historia': row[5],
                    'ingreso': row[6],
                    'tipoId': row[7],
                    'identificacion': row[8],
                    'nombre': row[9],
                    'fechaIngreso': str(row[10]) if row[10] else '',
                    'fechaEgreso': str(row[11]) if row[11] else '',
                    'estado': row[12] if row[12] else 'N'
                })

            return jsonify({
                'success': True,
                'traslado': encabezado,
                'detalles': detalles
            })

    except Exception as e:
        print(f"Error obteniendo detalle de traslado: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@archivo_bp.route('/busqueda/expediente', methods=['POST'])
def buscar_expediente():
    """Busca expedientes usando procedimientos almacenados (incluye sistema anterior)"""
    try:
        data = request.get_json()
        historia = data.get('historia', '').strip()
        ingreso = data.get('ingreso', '').strip()
        cedula = data.get('cedula', '').strip()

        if not historia and not cedula:
            return jsonify({'success': False, 'error': 'Debe proporcionar Historia o Cédula'}), 400

        with engine.connect() as conn:
            # Determinar qué SP ejecutar según los parámetros
            if historia and ingreso:
                # SP 1: Búsqueda por historia + ingreso específico
                conn.execute(
                    text("EXECUTE PROCEDURE SP_TR_BuscaExpHiIng(:historia, :ingreso)"),
                    {'historia': int(historia), 'ingreso': int(ingreso)}
                )
            elif historia:
                # SP 2: Búsqueda solo por historia (todos los ingresos)
                conn.execute(
                    text("EXECUTE PROCEDURE SP_TR_BuscaExpHi(:historia)"),
                    {'historia': int(historia)}
                )
            elif cedula:
                # SP 3: Búsqueda por cédula
                conn.execute(
                    text("EXECUTE PROCEDURE SP_TR_BuscaExpCed(:cedula)"),
                    {'cedula': cedula}
                )
            else:
                return jsonify({'success': False, 'error': 'Criterios de búsqueda incompletos'}), 400

            # Consultar resultados de la tabla temporal BUSEXP1
            result = conn.execute(text("SELECT * FROM BUSEXP1"))
            rows = result.fetchall()

            if not rows:
                return jsonify({'success': True, 'resultados': []})

            resultados = []
            for row in rows:
                # Detectar si es del sistema anterior (fecha_egreso = '1900-01-01')
                fecha_egreso_str = str(row[7]) if row[7] else ''
                es_sistema_anterior = fecha_egreso_str.startswith('1900-01-01')
                
                # Función auxiliar para asegurar encoding UTF-8
                def safe_str(value):
                    if value is None:
                        return ''
                    s = str(value)
                    # Si ya es unicode, retorna como está
                    if isinstance(s, str):
                        return s
                    # Si es bytes, decodifica a UTF-8
                    if isinstance(s, bytes):
                        return s.decode('utf-8', errors='replace')
                    return s
                
                resultados.append({
                    'consecutivo': safe_str(row[0]),
                    'historia': safe_str(row[1]),
                    'ingreso': safe_str(row[2]),
                    'tipoId': safe_str(row[3]),
                    'identificacion': safe_str(row[4]),
                    'nombre': safe_str(row[5]),  # Decodificar correctamente
                    'fecha_ingreso': str(row[6]) if row[6] else '',
                    'fecha_egreso': fecha_egreso_str if not es_sistema_anterior else '',  # Ocultar fecha dummy
                    'fecha_traslado': str(row[8]) if row[8] else '',
                    'estado': safe_str(row[9]),
                    'origen': safe_str(row[10]),
                    'destino': safe_str(row[11]),
                    'sistema_anterior': es_sistema_anterior  # Indicador para el frontend
                })

            return jsonify({'success': True, 'resultados': resultados})

    except Exception as e:
        print(f"Error en búsqueda de expediente: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500