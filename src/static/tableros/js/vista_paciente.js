// ========== VARIABLES GLOBALES ==========
let intervalo;
let estadoAnterior = null;

// ========== INICIALIZACIÓN (AL CARGAR) ==========
document.addEventListener('DOMContentLoaded', () => {
    console.log('=== DATOS DE ACCESO ===');
    console.log('ID:', IDENTIFICACION);
    console.log('Token length:', TOKEN ? TOKEN.length : 0);
    console.log('Acceso automático:', ACCESO_AUTOMATICO);

    // Listener para tecla Enter en el input
    const inputClave = document.getElementById('clave');
    if (inputClave) {
        inputClave.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') validarAcceso();
        });
    }

    // Auto-login si tiene token válido
    if (ACCESO_AUTOMATICO && TOKEN && TOKEN.length > 0) {
        console.log('✅ Iniciando acceso automático con token');
        validarAccesoConTokenConTimeout();
    } else {
        console.log('⚠️ No hay token válido, requiere clave manual');
        if(document.getElementById('loader')) document.getElementById('loader').style.display = 'none';
        if(document.getElementById('formulario-acceso')) document.getElementById('formulario-acceso').style.display = 'block';
    }
});

// Listener global para preparar audio (interacción usuario)
['click', 'touchstart'].forEach(evt => {
    document.addEventListener(evt, () => {
        if (window.CONFIG_TABLERO) CONFIG_TABLERO.prepararAudio();
    }, { once: true });
});


// ========== FUNCIONES LÓGICAS (Ahora disponibles globalmente) ==========

function verificarLlamado(paciente) {
    const cardEstado = document.getElementById('estadoVisual');
    const zonaAlerta = document.getElementById('zonaAlerta');
    
    // Normalizar valor (true, 1, "1", "true")
    const estaLlamando = (paciente.llamado === true || paciente.llamado === 1 || paciente.llamado === '1' || paciente.llamado === 'true');

    if (estaLlamando) {
        // MOSTRAR ALERTA
        if (zonaAlerta) {
            zonaAlerta.style.display = 'flex';
            document.body.classList.add('alerta-activa');
        }

        // EFECTO TARJETA
        if (cardEstado && !cardEstado.classList.contains('llamando')) {
            cardEstado.classList.add('llamando');
            cardEstado.style.removeProperty('background-color'); // Dejar que CSS mande
        }

        // SONIDO (Solo si es nuevo el estado de llamado)
        if (estadoAnterior !== 'LLAMANDO') {
             if (window.CONFIG_TABLERO) CONFIG_TABLERO.reproducirSonido('sutil');
             estadoAnterior = 'LLAMANDO';
        }
        
    } else {
        // OCULTAR ALERTA (Forzar apagado)
        if (zonaAlerta) {
            zonaAlerta.style.display = 'none';
            document.body.classList.remove('alerta-activa');
        }
        
        // RESTAURAR TARJETA
        if (cardEstado && cardEstado.classList.contains('llamando')) {
            cardEstado.classList.remove('llamando');
            actualizarEstadoVisual(paciente.estado);
        }
        estadoAnterior = paciente.estado; 
    }
}

function validarAccesoConTokenConTimeout() {
    const loader = document.getElementById('loader');
    const form = document.getElementById('formulario-acceso');
    
    if(loader) loader.style.display = 'block';
    if(form) form.style.display = 'none';

    const timeoutId = setTimeout(() => {
        console.error('⏱️ Timeout validación');
        if(loader) loader.style.display = 'none';
        if(form) form.style.display = 'block';
        mostrarError('Tiempo agotado. Ingrese clave manualmente.');
    }, 10000);

    fetch('/tableros/cirugia/paciente/validar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identificacion: IDENTIFICACION, token: TOKEN })
    })
    .then(r => {
        clearTimeout(timeoutId);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
    })
    .then(data => {
        if (data.success) {
            iniciarVistaPaciente(data.paciente);
            intervalo = setInterval(() => actualizarEstadoConToken(), 5000);
        } else {
            throw new Error(data.error || 'Token inválido');
        }
    })
    .catch(err => {
        clearTimeout(timeoutId);
        console.error('Error token:', err);
        if(loader) loader.style.display = 'none';
        if(form) form.style.display = 'block';
        mostrarError('Enlace expirado o inválido.');
    });
}

function validarAcceso() {
    const input = document.getElementById('clave');
    const clave = input ? input.value : '';
    
    if (clave.length !== 4) return mostrarError('La clave debe tener 4 dígitos');

    // Preparar audio explícitamente al hacer clic
    if (window.CONFIG_TABLERO) CONFIG_TABLERO.prepararAudio();

    fetch('/tableros/cirugia/paciente/validar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identificacion: IDENTIFICACION, clave })
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            iniciarVistaPaciente(data.paciente);
            intervalo = setInterval(() => actualizarEstadoConClave(), 5000);
        } else {
            mostrarError('Clave incorrecta');
        }
    })
    .catch(() => mostrarError('Error de conexión'));
}

// Función auxiliar para iniciar la vista tras login exitoso
function iniciarVistaPaciente(paciente) {
    mostrarDatosPaciente(paciente);
    verificarLlamado(paciente);
    document.getElementById('formulario-acceso').style.display = 'none';
    document.getElementById('loader').style.display = 'none';
    document.getElementById('datos-paciente').style.display = 'block';
}

function mostrarDatosPaciente(paciente) {
    document.getElementById('pacienteID').textContent = paciente.identificacion;
    document.getElementById('pacienteNombre').textContent = paciente.nombre;
    
    actualizarEstadoVisual(paciente.estado);
    mostrarMensajeRecuperacion(paciente.estado);
    
    document.getElementById('horaActualizacion').textContent = new Date().toLocaleTimeString('es-CO');
}

function actualizarEstadoVisual(estado) {
    const nombres = {
        P: { es: 'Preparación', en: 'Preparation' },
        Q: { es: 'Quirófano', en: 'Operating Room' },
        R: { es: 'Recuperación', en: 'Recovery' }
    };
    const iconos = { P: 'fas fa-user-clock', Q: 'fas fa-procedures', R: 'fas fa-bed' };
    const colores = { P: '#00B4D8', Q: '#90A4AE', R: '#2E9B3E' };

    const info = nombres[estado];
    const iconoEl = document.getElementById('iconoEstado');
    
    // Texto
    document.getElementById('nombreEstadoES').textContent = info ? info.es : 'DESCONOCIDO';
    document.getElementById('nombreEstadoEN').textContent = info ? info.en : '';
    
    // Icono
    if(iconoEl) iconoEl.className = `${iconos[estado] || 'fas fa-question-circle'} vp-icono-estado`;

    // Color de fondo (solo si no están llamando)
    const cardEstado = document.getElementById('estadoVisual');
    if (cardEstado && !cardEstado.classList.contains('llamando')) {
        cardEstado.style.backgroundColor = colores[estado] || '#999';
    }
}

function mostrarMensajeRecuperacion(estado) {
    const msg = document.getElementById('mensajeRecuperacion');
    if(msg) msg.style.display = (estado === 'R') ? 'block' : 'none';
}

function mostrarError(mensaje) {
    const el = document.getElementById('error-mensaje');
    if (el) {
        el.textContent = mensaje;
        el.style.animation = 'vp-shake 0.5s';
        setTimeout(() => { el.textContent = ''; el.style.animation = ''; }, 3000);
    }
}

// Funciones de actualización periódica
function actualizarEstadoConToken() {
    fetch('/tableros/cirugia/paciente/validar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identificacion: IDENTIFICACION, token: TOKEN })
    })
    .then(r => r.json())
    .then(d => { if(d.success) procesarActualizacion(d.paciente); });
}

function actualizarEstadoConClave() {
    const clave = document.getElementById('clave').value;
    fetch('/tableros/cirugia/paciente/validar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identificacion: IDENTIFICACION, clave })
    })
    .then(r => r.json())
    .then(d => { if(d.success) procesarActualizacion(d.paciente); });
}

function procesarActualizacion(paciente) {
    actualizarEstadoVisual(paciente.estado);
    mostrarMensajeRecuperacion(paciente.estado);
    verificarLlamado(paciente);
    document.getElementById('horaActualizacion').textContent = new Date().toLocaleTimeString('es-CO');
}
