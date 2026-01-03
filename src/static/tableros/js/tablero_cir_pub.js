// ========== VARIABLES ==========
let pacientesPublico = [];
let pacienteSeleccionado = null;
let modalLlamadoActivo = false;
let intervaloTemporizador = null;
let llamadoActual = null;
let intervaloSonido = null;
let notificacionActiva = null;

// 🎵 PREPARAR AUDIO con cualquier interacción
function prepararAudioInicial() {
    CONFIG_TABLERO.prepararAudio();
}

// Agregar múltiples listeners para preparar audio
document.addEventListener('click', prepararAudioInicial, { once: true });
document.addEventListener('touchstart', prepararAudioInicial, { once: true });
document.addEventListener('keydown', prepararAudioInicial, { once: true });
document.addEventListener('mousemove', prepararAudioInicial, { once: true });

// 🔔 SOLICITAR PERMISO DE NOTIFICACIONES AL CARGAR
window.addEventListener('DOMContentLoaded', () => {
    solicitarPermisoNotificaciones();
    cargarPacientesPublico();
   
    const inputClave = document.getElementById('inputClave');
    if (inputClave) {
        inputClave.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') validarClave();
        });
    }
    
    // Preparar audio inmediatamente
    CONFIG_TABLERO.prepararAudio();
});

// 🔔 Solicitar permiso para notificaciones
function solicitarPermisoNotificaciones() {
    if ('Notification' in window) {
        if (Notification.permission === 'default') {
            Notification.requestPermission().then(permission => {
                if (permission === 'granted') {
                    console.log('✅ Permisos de notificación concedidos');
                    ocultarAvisoPermisos();
                } else {
                    console.warn('⚠️ Permisos de notificación denegados');
                    mostrarAvisoPermisos();
                }
            });
        } else if (Notification.permission === 'granted') {
            console.log('✅ Permisos de notificación ya concedidos');
            ocultarAvisoPermisos();
        } else {
            console.warn('⚠️ Notificaciones bloqueadas por el usuario');
            mostrarAvisoPermisos();
        }
    } else {
        console.error('❌ Este navegador no soporta notificaciones');
    }
}

// 🔔 Verificar y mostrar/ocultar aviso
function verificarPermisosNotificaciones() {
    const aviso = document.getElementById('aviso-notificaciones');
    
    if ('Notification' in window) {
        if (Notification.permission === 'denied' || Notification.permission === 'default') {
            mostrarAvisoPermisos();
        } else {
            ocultarAvisoPermisos();
        }
    }
}

function mostrarAvisoPermisos() {
    const aviso = document.getElementById('aviso-notificaciones');
    if (aviso) aviso.style.display = 'flex';
}

function ocultarAvisoPermisos() {
    const aviso = document.getElementById('aviso-notificaciones');
    if (aviso) aviso.style.display = 'none';
}

// ========== CARGAR PACIENTES ==========
function cargarPacientesPublico() {
    fetch("/tableros/cirugia/pacientes")
        .then(r => r.json())
        .then(data => {
            if (data.success && Array.isArray(data.pacientes)) {
                pacientesPublico = data.pacientes.map(p => ({
                    identificacion: p.id,
                    nombre: p.nombre,
                    estado: CONFIG_TABLERO.estadoLetraADescripcion(p.estado),
                    estadoLetra: p.estado,
                    llamado: p.llamado || false
                }));
                
                verificarLlamadosActivos(pacientesPublico);
                renderizarPacientes();
                actualizarHora();
            }
        })
        .catch(err => console.error("Error al cargar pacientes:", err));
}

// ========== VERIFICAR LLAMADOS ==========
function verificarLlamadosActivos(pacientes) {
    const pacienteLlamado = pacientes.find(p => p.llamado === true);
    
    if (pacienteLlamado) {
        if (!modalLlamadoActivo && llamadoActual !== pacienteLlamado.identificacion) {
            console.log('🔔 Nuevo llamado detectado:', pacienteLlamado.identificacion);
            llamadoActual = pacienteLlamado.identificacion;
            mostrarAlertaLlamado(pacienteLlamado);
        }
    } else {
        if (modalLlamadoActivo) {
            console.log('✅ Llamado ya desactivado desde panel');
            cerrarAlertaLlamado();
        }
    }
}

// ========== MOSTRAR ALERTA CON NOTIFICACIÓN Y SONIDO ==========
function mostrarAlertaLlamado(paciente) {
    const modal = document.getElementById('modal-llamado');
    
    const idOculto = CONFIG_TABLERO.ocultarIdentificacion(paciente.identificacion);
    const nombreOculto = CONFIG_TABLERO.ocultarNombre(paciente.nombre);
    
    document.getElementById('llamado-id').textContent = idOculto;
    document.getElementById('llamado-nombre').textContent = nombreOculto;
    
    // 🎯 Mensajes según el área
    let areaTexto = '';
    if (paciente.estadoLetra === 'P' || paciente.estadoLetra === 'Q') {
        areaTexto = 'Puerta Principal de Cirugía';
    } else if (paciente.estadoLetra === 'R') {
        areaTexto = 'Área de Recuperación';
    } else {
        areaTexto = 'Cirugía';
    }
    
    document.getElementById('area-llamado').textContent = areaTexto;
    
    modal.style.display = 'flex';
    modalLlamadoActivo = true;
    
    // 🔔 Mostrar notificación del navegador
    mostrarNotificacionNavegador(idOculto, nombreOculto, areaTexto);
    
    // 🔊 Reproducir sonido 4 veces con múltiples intentos
    reproducirSonidoRepetido();
    
    iniciarTemporizador(paciente.identificacion);
}

// 🔔 Mostrar notificación del navegador
function mostrarNotificacionNavegador(id, nombre, area) {
    if ('Notification' in window && Notification.permission === 'granted') {
        try {
            if (notificacionActiva) {
                notificacionActiva.close();
            }
            
            notificacionActiva = new Notification('🔔 Llamado de Paciente', {
                body: `${id}\n${nombre}\n\nDiríjase a: ${area}`,
                icon: '/static/tableros/img/hospital-icon.png',
                requireInteraction: true,
                tag: 'llamado-cirugia',
                vibrate: [200, 100, 200, 100, 200],
                silent: false
            });
            
            notificacionActiva.onclick = () => {
                window.focus();
                notificacionActiva.close();
                notificacionActiva = null;
            };
            
            notificacionActiva.onclose = () => {
                notificacionActiva = null;
            };
            
            console.log('🔔 Notificación mostrada');
            
        } catch (e) {
            console.error('❌ Error al mostrar notificación:', e);
        }
    }
}

// 🔊 Reproducir sonido 4 veces con reintentos agresivos
function reproducirSonidoRepetido() {
    let contadorSonido = 0;
    const maxIntentos = 4;
    
    // Función para reproducir con múltiples reintentos
    const reproducirConReintentos = () => {
        let intentosRealizados = 0;
        const maxReintentos = 3;
        
        const intentar = () => {
            const exito = CONFIG_TABLERO.reproducirSonido();
            
            if (!exito && intentosRealizados < maxReintentos) {
                intentosRealizados++;
                console.log(`🔄 Reintento ${intentosRealizados}/${maxReintentos}`);
                setTimeout(intentar, 100);
            }
        };
        
        intentar();
    };
    
    // Primera vez inmediata
    reproducirConReintentos();
    contadorSonido++;
    
    // Repetir cada 2 segundos
    intervaloSonido = setInterval(() => {
        if (contadorSonido < maxIntentos && modalLlamadoActivo) {
            reproducirConReintentos();
            contadorSonido++;
            console.log(`🔊 Reproducción ${contadorSonido}/${maxIntentos}`);
        } else {
            clearInterval(intervaloSonido);
            intervaloSonido = null;
        }
    }, 2000);
}
// ========== CARGAR PACIENTES ==========
function cargarPacientesPublico() {
    fetch("/tableros/cirugia/pacientes")
        .then(r => r.json())
        .then(data => {
            if (data.success && Array.isArray(data.pacientes)) {
                pacientesPublico = data.pacientes.map(p => ({
                    identificacion: p.id,
                    nombre: p.nombre,
                    estado: CONFIG_TABLERO.estadoLetraADescripcion(p.estado),
                    estadoLetra: p.estado,
                    llamado: p.llamado || false
                }));
                
                verificarLlamadosActivos(pacientesPublico);
                renderizarPacientes();
                actualizarHora();
            }
        })
        .catch(err => console.error("Error al cargar pacientes:", err));
}

// ========== VERIFICAR LLAMADOS ==========
function verificarLlamadosActivos(pacientes) {
    const pacienteLlamado = pacientes.find(p => p.llamado === true);
    
    if (pacienteLlamado) {
        if (!modalLlamadoActivo && llamadoActual !== pacienteLlamado.identificacion) {
            console.log('🔔 Nuevo llamado detectado:', pacienteLlamado.identificacion);
            llamadoActual = pacienteLlamado.identificacion;
            mostrarAlertaLlamado(pacienteLlamado);
        }
    } else {
        if (modalLlamadoActivo) {
            console.log('✅ Llamado ya desactivado desde panel');
            cerrarAlertaLlamado();
        }
    }
}

// ========== MOSTRAR ALERTA CON NOTIFICACIÓN DEL NAVEGADOR ==========
function mostrarAlertaLlamado(paciente) {
    const modal = document.getElementById('modal-llamado');
    
    const idOculto = CONFIG_TABLERO.ocultarIdentificacion(paciente.identificacion);
    const nombreOculto = CONFIG_TABLERO.ocultarNombre(paciente.nombre);
    
    document.getElementById('llamado-id').textContent = idOculto;
    document.getElementById('llamado-nombre').textContent = nombreOculto;
    
    // 🎯 Mensajes según el área
    let areaTexto = '';
    if (paciente.estadoLetra === 'P' || paciente.estadoLetra === 'Q') {
        areaTexto = 'Puerta Principal de Cirugía';
    } else if (paciente.estadoLetra === 'R') {
        areaTexto = 'Área de Recuperación';
    } else {
        areaTexto = 'Cirugía';
    }
    
    document.getElementById('area-llamado').textContent = areaTexto;
    
    modal.style.display = 'flex';
    modalLlamadoActivo = true;
    
    // 🔔 Mostrar notificación del navegador
    mostrarNotificacionNavegador(idOculto, nombreOculto, areaTexto);
    
    // 🔊 Reproducir sonido del sistema (Web Audio como respaldo)
    reproducirSonidoRepetido();
    
    iniciarTemporizador(paciente.identificacion);
}

// 🔔 Mostrar notificación del navegador
function mostrarNotificacionNavegador(id, nombre, area) {
    if ('Notification' in window && Notification.permission === 'granted') {
        try {
            // Cerrar notificación anterior si existe
            if (notificacionActiva) {
                notificacionActiva.close();
            }
            
            // Crear nueva notificación
            notificacionActiva = new Notification('🔔 Llamado de Paciente', {
                body: `${id}\n${nombre}\n\nDiríjase a: ${area}`,
                icon: '/static/tableros/img/hospital-icon.png', // Opcional: agregar icono
                badge: '/static/tableros/img/badge-icon.png', // Opcional: badge pequeño
                requireInteraction: true, // No desaparece automáticamente
                tag: 'llamado-cirugia', // Reemplaza notificaciones anteriores
                vibrate: [200, 100, 200], // Vibración en móviles
                silent: false, // Reproducir sonido del sistema
                timestamp: Date.now()
            });
            
            // Al hacer clic en la notificación, enfocar la ventana
            notificacionActiva.onclick = () => {
                window.focus();
                notificacionActiva.close();
                notificacionActiva = null;
            };
            
            // Al cerrar la notificación
            notificacionActiva.onclose = () => {
                notificacionActiva = null;
            };
            
            console.log('🔔 Notificación mostrada');
            
        } catch (e) {
            console.error('❌ Error al mostrar notificación:', e);
        }
    } else {
        console.warn('⚠️ No hay permisos para notificaciones o no están soportadas');
    }
}

// 🔊 Reproducir sonido como respaldo (Web Audio API)
function reproducirSonidoRepetido() {
    let contadorSonido = 0;
    
    // Primera vez inmediata
    CONFIG_TABLERO.reproducirSonido();
    contadorSonido++;
    
    // Repetir 3 veces más cada 2 segundos
    intervaloSonido = setInterval(() => {
        if (contadorSonido < 4 && modalLlamadoActivo) {
            CONFIG_TABLERO.reproducirSonido();
            contadorSonido++;
            console.log(`🔊 Sonido respaldo ${contadorSonido}/4`);
        } else {
            clearInterval(intervaloSonido);
            intervaloSonido = null;
        }
    }, 2000);
}

// ========== TEMPORIZADOR ==========
function iniciarTemporizador(identificacion) {
    let segundosRestantes = CONFIG_TABLERO.DURACION_LLAMADO_SEG;
    const segundosElement = document.getElementById('segundos-restantes');
    const progressFill = document.getElementById('progress-fill');
    
    if (intervaloTemporizador) clearInterval(intervaloTemporizador);
    
    progressFill.style.width = '100%';
    segundosElement.textContent = segundosRestantes;
    
    console.log(`⏱️ Iniciando temporizador de ${segundosRestantes}s para ${identificacion}`);
    
    intervaloTemporizador = setInterval(() => {
        segundosRestantes--;
        segundosElement.textContent = segundosRestantes;
        
        const porcentaje = (segundosRestantes / CONFIG_TABLERO.DURACION_LLAMADO_SEG) * 100;
        progressFill.style.width = porcentaje + '%';
        
        console.log(`⏱️ ${segundosRestantes}s restantes`);
        
        if (segundosRestantes <= 0) {
            clearInterval(intervaloTemporizador);
            console.log('⏰ Tiempo agotado, desactivando llamado...');
            desactivarLlamadoDesdePublico(identificacion);
        }
    }, 1000);
}

// ========== DESACTIVAR LLAMADO ==========
function desactivarLlamadoDesdePublico(identificacion) {
    console.log('📤 Enviando desactivación al servidor para:', identificacion);
    
    fetch('/tableros/cirugia/pacientes/llamar', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            identificacion: identificacion,
            llamado: false,
            mensaje: ''
        })
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            console.log('✅ Llamado desactivado correctamente');
            cerrarAlertaLlamado();
        } else {
            console.error('❌ Error al desactivar llamado:', data.error);
            cerrarAlertaLlamado();
        }
    })
    .catch(err => {
        console.error('❌ Error de conexión al desactivar:', err);
        cerrarAlertaLlamado();
    });
}

// ========== CERRAR ALERTA ==========
function cerrarAlertaLlamado() {
    console.log('🛑 Cerrando modal de llamado');
    
    const modal = document.getElementById('modal-llamado');
    modal.style.display = 'none';
    modalLlamadoActivo = false;
    llamadoActual = null;
    
    // 🔥 Cerrar notificación del navegador
    if (notificacionActiva) {
        notificacionActiva.close();
        notificacionActiva = null;
    }
    
    // 🔥 Detener temporizador y sonido
    if (intervaloTemporizador) {
        clearInterval(intervaloTemporizador);
        intervaloTemporizador = null;
    }
    
    if (intervaloSonido) {
        clearInterval(intervaloSonido);
        intervaloSonido = null;
    }
    
    document.getElementById('progress-fill').style.width = '100%';
    document.getElementById('segundos-restantes').textContent = CONFIG_TABLERO.DURACION_LLAMADO_SEG;
}

// ========== RENDERIZAR PACIENTES ==========
function renderizarPacientes() {
    const preparacion = document.getElementById("pacientes-preparacion");
    const quirofano = document.getElementById("pacientes-quirofano");
    const recuperacion = document.getElementById("pacientes-recuperacion");

    preparacion.innerHTML = "";
    quirofano.innerHTML = "";
    recuperacion.innerHTML = "";

    const porEstado = { PREPARACION: [], QUIROFANO: [], RECUPERACION: [] };
    pacientesPublico.forEach(p => porEstado[p.estado].push(p));

    renderColumna(preparacion, porEstado.PREPARACION);
    renderColumna(quirofano, porEstado.QUIROFANO);
    renderColumna(recuperacion, porEstado.RECUPERACION);
}

// ========== RENDERIZAR COLUMNA (LIMPIO) ==========
function renderColumna(contenedor, pacientes) {
    if (pacientes.length === 0) {
        contenedor.innerHTML = '<div class="sin-pacientes"><i class="fas fa-inbox"></i><p>No hay pacientes en esta área</p></div>';
        return;
    }

    pacientes.forEach(p => {
        const idOculto = CONFIG_TABLERO.ocultarIdentificacion(p.identificacion);
        const nombreOculto = CONFIG_TABLERO.ocultarNombre(p.nombre);
       
        const card = document.createElement("div");
        card.className = "paciente-card";
        
        // Guardamos los datos REALES en el elemento HTML como atributos data-
        // Esto evita cualquier problema con comillas o caracteres raros
        card.dataset.id = p.identificacion;
        card.dataset.nombre = p.nombre;
        card.dataset.json = JSON.stringify(p); // Respaldo completo
        
        card.innerHTML = `
            <div class="paciente-info">
                <div class="paciente-id">
                    <i class="fa-regular fa-id-card"></i>
                    <span>${idOculto}</span>
                </div>
                <div class="paciente-nombre">
                    <i class="fa-regular fa-user"></i>
                    <span>${nombreOculto}</span>
                </div>
            </div>
            <button class="btn-qr">
                <i class="fas fa-qrcode"></i>
            </button>
        `;
        
        contenedor.appendChild(card);
    });
}

// ========== VARIABLES DE TIMEOUT ==========
let timeoutClaveInterval = null;
let timeoutQRInterval = null;
let tiempoRestanteClave = 20;
let tiempoRestanteQR = 20;

// ========== SELECCIONAR PACIENTE ==========
function seleccionarPaciente(paciente) {
    pacienteSeleccionado = paciente;
    document.getElementById('modalClave').style.display = 'flex';
    document.getElementById('inputClave').value = '';
    document.getElementById('errorClave').textContent = '';
   
    setTimeout(() => document.getElementById('inputClave').focus(), 100);
    
    // Iniciar contador de 20 segundos para cerrar modal automáticamente
    iniciarTimeoutClave();
}

// ========== INICIAR TIMEOUT PARA MODAL DE CLAVE ==========
function iniciarTimeoutClave() {
    // Limpiar cualquier timeout anterior
    if (timeoutClaveInterval) {
        clearInterval(timeoutClaveInterval);
    }
    
    tiempoRestanteClave = 20;
    document.getElementById('tiempoRestanteClave').textContent = '20';
    document.getElementById('progressBarClave').style.width = '100%';
    
    timeoutClaveInterval = setInterval(() => {
        tiempoRestanteClave--;
        document.getElementById('tiempoRestanteClave').textContent = tiempoRestanteClave;
        
        // Actualizar barra de progreso (de 100% a 0%)
        const porcentaje = (tiempoRestanteClave / 20) * 100;
        document.getElementById('progressBarClave').style.width = porcentaje + '%';
        
        // Cuando llega a 0, cerrar modal
        if (tiempoRestanteClave <= 0) {
            clearInterval(timeoutClaveInterval);
            cerrarModalClave();
        }
    }, 1000);
}

// ========== VALIDAR CLAVE ==========
function validarClave() {
    const clave = document.getElementById('inputClave').value;
   
    if (!pacienteSeleccionado) {
        mostrarError('Error: No hay paciente seleccionado');
        return;
    }
   
    const identificacionStr = String(pacienteSeleccionado.identificacion);
    const claveCorrecta = identificacionStr.slice(-4);
   
    if (clave.length !== 4) {
        mostrarError('Debe ingresar 4 dígitos');
        return;
    }
   
    if (clave !== claveCorrecta) {
        mostrarError('Clave incorrecta. Intente nuevamente.');
        document.getElementById('inputClave').value = '';
        document.getElementById('inputClave').focus();
        return;
    }
    
    // Limpiar timeout al validar exitosamente
    if (timeoutClaveInterval) {
        clearInterval(timeoutClaveInterval);
    }
   
    generarQRPersonalizado();
}

// ========== GENERAR QR Y ENLACE TEMPORAL ==========
function generarQRPersonalizado() {
    fetch(`/tableros/cirugia/generar-qr/${pacienteSeleccionado.identificacion}`)
        .then(r => r.json())
        .then(data => {
            if (data.success) {
                document.getElementById('modalClave').style.display = 'none';
                document.getElementById('imagenQR').src = data.qr_image;
                document.getElementById('nombrePacienteQR').textContent = pacienteSeleccionado.nombre;
                
                // Usar la URL con token que retorna el backend (misma que el QR)
                document.getElementById('enlaceAcceso').href = data.url;
                
                document.getElementById('modalQR').style.display = 'flex';
                
                // Iniciar timeout para modal QR
                iniciarTimeoutQR();
            } else {
                mostrarError('Error al generar código QR: ' + (data.error || 'Desconocido'));
            }
        })
        .catch(err => {
            console.error('Error al generar QR:', err);
            mostrarError('Error de conexión al generar QR');
        });
}

// ========== INICIAR TIMEOUT PARA MODAL QR ==========
function iniciarTimeoutQR() {
    // Limpiar cualquier timeout anterior
    if (timeoutQRInterval) {
        clearInterval(timeoutQRInterval);
    }
    
    tiempoRestanteQR = 20;
    document.getElementById('tiempoRestanteQR').textContent = '20';
    document.getElementById('progressBarQR').style.width = '100%';
    
    timeoutQRInterval = setInterval(() => {
        tiempoRestanteQR--;
        document.getElementById('tiempoRestanteQR').textContent = tiempoRestanteQR;
        
        // Actualizar barra de progreso (de 100% a 0%)
        const porcentaje = (tiempoRestanteQR / 20) * 100;
        document.getElementById('progressBarQR').style.width = porcentaje + '%';
        
        // Cuando llega a 0, cerrar modal
        if (tiempoRestanteQR <= 0) {
            clearInterval(timeoutQRInterval);
            cerrarModalQR();
        }
    }, 1000);
}



// ========== MOSTRAR ERROR ==========
function mostrarError(mensaje) {
    const errorElement = document.getElementById('errorClave');
    errorElement.textContent = mensaje;
    errorElement.style.animation = 'shake 0.5s';
    setTimeout(() => errorElement.style.animation = '', 500);
}

// ========== CERRAR MODALES ==========
function cerrarModalClave() {
    // Limpiar timeout
    if (timeoutClaveInterval) {
        clearInterval(timeoutClaveInterval);
    }
    
    document.getElementById('modalClave').style.display = 'none';
    pacienteSeleccionado = null;
}

function cerrarModalQR() {
    // Limpiar timeout
    if (timeoutQRInterval) {
        clearInterval(timeoutQRInterval);
    }
    
    document.getElementById('modalQR').style.display = 'none';
    pacienteSeleccionado = null;
}

// ========== ACTUALIZAR HORA ==========
function actualizarHora() {
    const ahora = new Date();
    const hora = ahora.toLocaleTimeString('es-CO', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    document.getElementById('hora-actualizacion').textContent = hora;
}

// ========== INTERVALOS ==========
setInterval(cargarPacientesPublico, CONFIG_TABLERO.INTERVALO_ACTUALIZACION);
// ========== DELEGACIÓN DE EVENTOS (SOLUCIÓN FINAL) ==========
document.addEventListener('click', function(e) {
    // 1. Buscar si el clic fue dentro de una tarjeta de paciente
    const tarjeta = e.target.closest('.paciente-card');
    
    if (tarjeta) {
        // Recuperar los datos que guardamos en el dataset
        const id = tarjeta.dataset.id;
        const nombre = tarjeta.dataset.nombre;
        
        if (id && nombre) {
            console.log("✅ Clic detectado en:", nombre);
            
            // Llamar a tu función original para seleccionar
            // Reconstruimos el objeto paciente mínimo necesario
            seleccionarPaciente({ 
                identificacion: id, 
                nombre: nombre 
            });
        }
    }
});
