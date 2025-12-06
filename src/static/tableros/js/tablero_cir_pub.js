// ========== VARIABLES ==========
let pacientesPublico = [];
let pacienteSeleccionado = null;

// ========== CARGAR PACIENTES ==========
function cargarPacientesPublico() {
    fetch("/tableros/cirugia/pacientes")
        .then(r => r.json())
        .then(data => {
            if (data.success && Array.isArray(data.pacientes)) {
                pacientesPublico = data.pacientes.map(p => ({
                    identificacion: p.id,
                    nombre: p.nombre,
                    estado: estadoLetraADescripcion(p.estado)
                }));
                renderizarPacientes();
                actualizarHora();
            }
        })
        .catch(err => console.error("Error al cargar pacientes:", err));
}

// ========== CONVERTIR LETRA A DESCRIPCIÓN ==========
function estadoLetraADescripcion(letra) {
    switch (letra) {
        case "P": return "PREPARACION";
        case "Q": return "QUIROFANO";
        case "R": return "RECUPERACION";
        default: return "PREPARACION";
    }
}

// ========== RENDERIZAR PACIENTES EN COLUMNAS ==========
function renderizarPacientes() {
    const preparacion = document.getElementById("pacientes-preparacion");
    const quirofano = document.getElementById("pacientes-quirofano");
    const recuperacion = document.getElementById("pacientes-recuperacion");

    preparacion.innerHTML = "";
    quirofano.innerHTML = "";
    recuperacion.innerHTML = "";

    const porEstado = {
        PREPARACION: [],
        QUIROFANO: [],
        RECUPERACION: []
    };

    pacientesPublico.forEach(p => {
        porEstado[p.estado].push(p);
    });

    renderColumna(preparacion, porEstado.PREPARACION);
    renderColumna(quirofano, porEstado.QUIROFANO);
    renderColumna(recuperacion, porEstado.RECUPERACION);
}

function renderColumna(contenedor, pacientes) {
    if (pacientes.length === 0) {
        contenedor.innerHTML = '<div class="sin-pacientes"><i class="fas fa-inbox"></i><p>No hay pacientes en esta área</p></div>';
        return;
    }

    pacientes.forEach(p => {
        // Ocultar últimos 4 dígitos
        const idOculto = p.identificacion.slice(0, -4) + '****';
        
        // Mostrar solo los primeros 3 caracteres de cada palabra
        const nombreOculto = p.nombre
            .split(' ')
            .filter(palabra => palabra.length > 0)
            .map(palabra => palabra.substring(0, 3) + '***')
            .join(' ');
       
        const card = document.createElement("div");
        card.className = "paciente-card";
        card.onclick = () => seleccionarPaciente(p);
        
        // Estructura moderna como el panel
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
            <button class="btn-qr" onclick="event.stopPropagation(); seleccionarPaciente(${JSON.stringify(p).replace(/"/g, '&quot;')})">
                <i class="fas fa-qrcode"></i>
            </button>
        `;
        contenedor.appendChild(card);
    });
}

// ========== SELECCIONAR PACIENTE Y PEDIR CLAVE ==========
function seleccionarPaciente(paciente) {
    console.log('Paciente seleccionado:', paciente);
    pacienteSeleccionado = paciente;
    document.getElementById('modalClave').style.display = 'flex';
    document.getElementById('inputClave').value = '';
    document.getElementById('errorClave').textContent = '';
   
    setTimeout(() => {
        document.getElementById('inputClave').focus();
    }, 100);
}

// ========== VALIDAR CLAVE ==========
function validarClave() {
    const clave = document.getElementById('inputClave').value;
   
    console.log('Clave ingresada:', clave);
    console.log('Paciente seleccionado:', pacienteSeleccionado);
   
    if (!pacienteSeleccionado) {
        mostrarError('Error: No hay paciente seleccionado');
        return;
    }
   
    const identificacionStr = String(pacienteSeleccionado.identificacion);
    const claveCorrecta = identificacionStr.slice(-4);
   
    console.log('Clave correcta esperada:', claveCorrecta);
    console.log('Identificación completa:', identificacionStr);
   
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
   
    console.log('Clave correcta! Generando QR...');
    generarQRPersonalizado();
}

// ========== GENERAR QR PERSONALIZADO ==========
function generarQRPersonalizado() {
    console.log('Generando QR para:', pacienteSeleccionado.identificacion);
   
    fetch(`/tableros/cirugia/generar-qr/${pacienteSeleccionado.identificacion}`)
        .then(r => r.json())
        .then(data => {
            console.log('Respuesta del servidor:', data);
            console.log('URL del QR:', data.url);
           
            if (data.success) {
                document.getElementById('modalClave').style.display = 'none';
                document.getElementById('imagenQR').src = data.qr_image;
                document.getElementById('nombrePacienteQR').textContent = pacienteSeleccionado.nombre;
               
                // Agregar URL visible para debug/test
                const modalQR = document.getElementById('modalQR');
                const modalContent = modalQR.querySelector('.modal-qr');
               
                // Remover debug anterior si existe
                const existingDebug = modalContent.querySelector('.url-debug');
                if (existingDebug) {
                    existingDebug.remove();
                }
               
                // Agregar nueva sección de debug
                const urlDebug = document.createElement('div');
                urlDebug.className = 'url-debug';
                urlDebug.style.cssText = 'margin-top: 15px; padding: 12px; background: #f0f0f0; border-radius: 8px; word-break: break-all; font-size: 13px; text-align: left;';
                urlDebug.innerHTML = `
                    <p style="margin-bottom: 8px; font-weight: bold; color: #333;">🔗 URL de prueba:</p>
                    <a href="${data.url}" target="_blank" style="color: #0288D1; text-decoration: underline;">${data.url}</a>
                    <p style="margin-top: 8px; font-size: 11px; color: #666;">Haz clic para probar en esta pestaña</p>
                `;
                modalContent.appendChild(urlDebug);
               
                document.getElementById('modalQR').style.display = 'flex';
            } else {
                mostrarError('Error al generar código QR: ' + (data.error || 'Desconocido'));
            }
        })
        .catch(err => {
            console.error('Error al generar QR:', err);
            mostrarError('Error de conexión al generar QR');
        });
}

// ========== MOSTRAR ERROR ==========
function mostrarError(mensaje) {
    const errorElement = document.getElementById('errorClave');
    errorElement.textContent = mensaje;
    errorElement.style.animation = 'shake 0.5s';
   
    setTimeout(() => {
        errorElement.style.animation = '';
    }, 500);
}

// ========== CERRAR MODALES ==========
function cerrarModalClave() {
    document.getElementById('modalClave').style.display = 'none';
    pacienteSeleccionado = null;
}

function cerrarModalQR() {
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

// ========== INICIALIZAR Y AUTO-REFRESCAR ==========
window.addEventListener("DOMContentLoaded", () => {
    cargarPacientesPublico();
   
    const inputClave = document.getElementById('inputClave');
    if (inputClave) {
        inputClave.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                validarClave();
            }
        });
    }
});

setInterval(cargarPacientesPublico, 5000);
