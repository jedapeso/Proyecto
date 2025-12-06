// ========== VARIABLES GLOBALES ==========
let intervalo;


// ========== INICIALIZACIÓN ==========
console.log('=== DATOS DE ACCESO ===');
console.log('ID:', IDENTIFICACION);
console.log('Token:', TOKEN);
console.log('Token length:', TOKEN ? TOKEN.length : 0);
console.log('Acceso automático:', ACCESO_AUTOMATICO);


// Auto-login si tiene token válido
if (ACCESO_AUTOMATICO && TOKEN && TOKEN.length > 0) {
  console.log('✅ Iniciando acceso automático con token');
  validarAccesoConTokenConTimeout();
} else {
  console.log('⚠️ No hay token válido, requiere clave manual');
  document.getElementById('loader').style.display = 'none';
  document.getElementById('formulario-acceso').style.display = 'block';
}


// ========== VALIDAR ACCESO CON TOKEN (CON TIMEOUT) ==========
function validarAccesoConTokenConTimeout() {
  console.log('Validando token:', TOKEN);
  console.log('ID para validar:', IDENTIFICACION);


  const timeoutId = setTimeout(() => {
    console.error('⏱️ Timeout: La validación tardó demasiado');
    document.getElementById('loader').style.display = 'none';
    document.getElementById('formulario-acceso').style.display = 'block';
    mostrarError('Tiempo de espera agotado. Ingrese la clave manualmente.');
  }, 10000);


  fetch('/tableros/cirugia/paciente/validar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identificacion: IDENTIFICACION,
      token: TOKEN
    })
  })
    .then(response => {
      clearTimeout(timeoutId);
      console.log('Status HTTP:', response.status);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      console.log('Respuesta validación con token:', data);
      if (data.success) {
        mostrarDatosPaciente(data.paciente);
        document.getElementById('loader').style.display = 'none';
        document.getElementById('datos-paciente').style.display = 'block';
        intervalo = setInterval(() => actualizarEstadoConToken(), 5000);
      } else {
        console.error('❌ Token inválido o expirado:', data.error);
        document.getElementById('loader').style.display = 'none';
        document.getElementById('formulario-acceso').style.display = 'block';
        mostrarError(data.error || 'Acceso denegado');
      }
    })
    .catch(err => {
      clearTimeout(timeoutId);
      console.error('❌ Error al validar token:', err);
      document.getElementById('loader').style.display = 'none';
      document.getElementById('formulario-acceso').style.display = 'block';
      mostrarError('Error de conexión. Intente con la clave.');
    });
}


// ========== VALIDAR ACCESO CON CLAVE ==========
function validarAcceso() {
  const clave = document.getElementById('clave').value;


  console.log('Validando con clave manual');
  console.log('Clave ingresada:', clave);


  if (clave.length !== 4) {
    mostrarError('La clave debe tener 4 dígitos');
    return;
  }


  fetch('/tableros/cirugia/paciente/validar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identificacion: IDENTIFICACION,
      clave
    })
  })
    .then(r => r.json())
    .then(data => {
      console.log('Respuesta validación con clave:', data);
      if (data.success) {
        mostrarDatosPaciente(data.paciente);
        document.getElementById('formulario-acceso').style.display = 'none';
        document.getElementById('datos-paciente').style.display = 'block';
        intervalo = setInterval(() => actualizarEstadoConClave(), 5000);
      } else {
        mostrarError('Clave incorrecta');
      }
    })
    .catch(err => {
      console.error('Error:', err);
      mostrarError('Error de conexión');
    });
}


// ========== MOSTRAR DATOS DEL PACIENTE ==========
function mostrarDatosPaciente(paciente) {
  console.log('Mostrando datos del paciente:', paciente);


  document.getElementById('pacienteID').textContent = paciente.identificacion;
  document.getElementById('pacienteNombre').textContent = paciente.nombre;
  actualizarEstadoVisual(paciente.estado);
  mostrarMensajeRecuperacion(paciente.estado);
  document.getElementById('horaActualizacion').textContent =
    new Date().toLocaleTimeString('es-CO');
}


// ========== MOSTRAR/OCULTAR MENSAJE DE RECUPERACIÓN ==========
function mostrarMensajeRecuperacion(estado) {
  const mensajeRecuperacion = document.getElementById('mensajeRecuperacion');
  
  if (estado === 'R') {
    mensajeRecuperacion.style.display = 'block';
    console.log('✅ Mostrando mensaje de recuperación');
  } else {
    mensajeRecuperacion.style.display = 'none';
    console.log('ℹ️ Ocultando mensaje de recuperación');
  }
}


// ========== ACTUALIZAR VISUAL DEL ESTADO ==========
// ========== ACTUALIZAR VISUAL DEL ESTADO ==========
function actualizarEstadoVisual(estado) {
  console.log('Actualizando estado visual:', estado);

  const nombres = {
    P: { es: 'Preparación',  en: 'Preparation' },
    Q: { es: 'Quirófano',    en: 'Operating Room' },
    R: { es: 'Recuperación', en: 'Recovery' }
  };

  // ICONOS DE FONT AWESOME (como en el tablero público)
  const iconos = {
    P: 'fas fa-user-clock',      // Preparación
    Q: 'fas fa-procedures',      // Quirófano
    R: 'fas fa-bed'              // Recuperación
  };

  const colores = {
    P: '#00B4D8',
    Q: '#90A4AE',
    R: '#2E9B3E'
  };

  const info = nombres[estado];

  // Actualizar CLASE del icono (no src)
  const icono = document.getElementById('iconoEstado');
  icono.className = iconos[estado] || 'fas fa-question-circle';
  
  console.log('✅ Icono asignado:', iconos[estado]);

  document.getElementById('nombreEstadoES').textContent = info ? info.es : 'DESCONOCIDO';
  document.getElementById('nombreEstadoEN').textContent = info ? info.en : '';
  document.getElementById('estadoVisual').style.backgroundColor = colores[estado] || '#999';
}

// ========== ACTUALIZAR ESTADO CON TOKEN ==========
function actualizarEstadoConToken() {
  fetch('/tableros/cirugia/paciente/validar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identificacion: IDENTIFICACION,
      token: TOKEN
    })
  })
    .then(r => r.json())
    .then(data => {
      if (data.success) {
        actualizarEstadoVisual(data.paciente.estado);
        mostrarMensajeRecuperacion(data.paciente.estado);
        document.getElementById('horaActualizacion').textContent =
          new Date().toLocaleTimeString('es-CO');
      }
    })
    .catch(err => console.error('Error al actualizar:', err));
}


// ========== ACTUALIZAR ESTADO CON CLAVE ==========
function actualizarEstadoConClave() {
  const clave = document.getElementById('clave').value;


  fetch('/tableros/cirugia/paciente/validar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identificacion: IDENTIFICACION,
      clave
    })
  })
    .then(r => r.json())
    .then(data => {
      if (data.success) {
        actualizarEstadoVisual(data.paciente.estado);
        mostrarMensajeRecuperacion(data.paciente.estado);
        document.getElementById('horaActualizacion').textContent =
          new Date().toLocaleTimeString('es-CO');
      }
    })
    .catch(err => console.error('Error al actualizar:', err));
}


// ========== MOSTRAR ERROR ==========
function mostrarError(mensaje) {
  const errorElement = document.getElementById('error-mensaje');
  if (errorElement) {
    errorElement.textContent = mensaje;
    errorElement.style.animation = 'vp-shake 0.5s';
    setTimeout(() => {
      errorElement.textContent = '';
      errorElement.style.animation = '';
    }, 3000);
  }
}


// ========== EVENT LISTENERS ==========
document.addEventListener('DOMContentLoaded', () => {
  const inputClave = document.getElementById('clave');
  if (inputClave) {
    inputClave.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        validarAcceso();
      }
    });
  }
});