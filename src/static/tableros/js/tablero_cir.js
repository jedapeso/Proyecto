// ========== VARIABLES GLOBALES ==========
let pacientes = [];
let pacientesDisponibles = [];
let identificacionEliminar = null;
let elementoArrastrado = null;
let llamadoActivo = null;

// ========== CARGAR PACIENTES (CON DETECCIÓN DE CAMBIO DE LLAMADO) ==========
function cargarPacientes() {
  fetch('/tableros/cirugia/pacientes')
    .then(r => r.json())
    .then(data => {
      if (data.success && Array.isArray(data.pacientes)) {
        // 🔥 Verificar si el llamado activo ya no existe
        if (llamadoActivo) {
          const pacienteConLlamado = data.pacientes.find(p => p.llamado === true);
          if (!pacienteConLlamado) {
            console.log('🔓 Llamado finalizado, desbloqueando toggles');
            llamadoActivo = null; // 🔥 Desbloquear
          }
        }
        
        pacientes = data.pacientes;
        renderizarTablero();
        actualizarEstadisticas();
        actualizarHora();
      }
    })
    .catch(err => console.error('Error al cargar pacientes:', err));
}


// ========== RENDERIZAR TABLERO ==========
function renderizarTablero() {
  const preparacion = document.getElementById('lista-preparacion');
  const quirofano = document.getElementById('lista-quirofano');
  const recuperacion = document.getElementById('lista-recuperacion');

  preparacion.innerHTML = '';
  quirofano.innerHTML = '';
  recuperacion.innerHTML = '';

  const porEstado = { P: [], Q: [], R: [] };
  pacientes.forEach(p => {
    if (porEstado[p.estado]) porEstado[p.estado].push(p);
  });

  renderColumna(preparacion, porEstado.P, 'P');
  renderColumna(quirofano, porEstado.Q, 'Q');
  renderColumna(recuperacion, porEstado.R, 'R');

  habilitarDropZones();
}

// ========== RENDERIZAR COLUMNA ==========
function renderColumna(contenedor, pacientes, estadoActual) {
  if (pacientes.length === 0) {
    contenedor.innerHTML = `
      <div class="columna-vacia">
        <i class="fas fa-inbox"></i>
        <p>Arrastra pacientes aquí</p>
      </div>
    `;
    return;
  }

  pacientes.forEach(p => {
    const tarjeta = crearTarjetaPaciente(p, estadoActual);
    contenedor.appendChild(tarjeta);
  });
}

// ========== CREAR TARJETA PACIENTE ==========
function crearTarjetaPaciente(paciente, estadoActual) {
  const tarjeta = document.createElement('div');
  tarjeta.className = 'paciente-tarjeta';
  tarjeta.dataset.id = paciente.id;
  tarjeta.dataset.estado = estadoActual;
  tarjeta.draggable = true;

  const esLlamadoActivo = paciente.llamado === true;
  const disabled = llamadoActivo && llamadoActivo !== paciente.id ? 'disabled' : '';

  tarjeta.innerHTML = `
    <div class="drag-handle">
      <i class="fas fa-grip-vertical"></i>
    </div>
    <div class="paciente-contenido">
      <div class="paciente-header">
        <div class="paciente-id">
          <i class="fas fa-id-card"></i>
          <span>${paciente.id}</span>
        </div>
        <div class="acciones-paciente">
          <div class="toggle-llamado-container">
            <i class="fas fa-bell toggle-bell-icon"></i>
            <label class="toggle-llamado ${disabled ? 'disabled' : ''}">
              <input type="checkbox" 
                     ${esLlamadoActivo ? 'checked' : ''} 
                     ${disabled}
                     onchange="toggleLlamado('${paciente.id}', this.checked)"
                     id="toggle-${paciente.id}">
              <span class="toggle-slider"></span>
            </label>
          </div>
          <button class="btn-icon eliminar" 
                  onclick="abrirModalEliminar('${paciente.id}', '${paciente.nombre}')" 
                  title="Eliminar paciente">
            <i class="fas fa-trash-alt"></i>
          </button>
        </div>
      </div>
      <div class="paciente-nombre">
        <i class="fas fa-user"></i>
        ${paciente.nombre}
      </div>
    </div>
  `;

  tarjeta.addEventListener('dragstart', handleDragStart);
  tarjeta.addEventListener('dragend', handleDragEnd);

  return tarjeta;
}

// ========== TOGGLE LLAMADO (SIMPLIFICADO - SIN TIMERS) ==========
function toggleLlamado(identificacion, activar) {
  console.log('🔔 Toggle llamado:', identificacion, activar);
  
  if (activar && llamadoActivo && llamadoActivo !== identificacion) {
    mostrarNotificacion('Ya hay un llamado activo. Espere a que finalice.', 'error');
    const checkbox = document.getElementById(`toggle-${identificacion}`);
    if (checkbox) checkbox.checked = false;
    return;
  }
  
  fetch('/tableros/cirugia/pacientes/llamar', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      identificacion: identificacion,
      llamado: activar,
      mensaje: 'Por favor acérquese a Cirugía'
    })
  })
  .then(r => r.json())
  .then(data => {
    if (data.success) {
      if (activar) {
        llamadoActivo = identificacion;
        mostrarNotificacion(`Llamado activado - ${CONFIG_TABLERO.DURACION_LLAMADO_SEG}s`, 'success');
        console.log(`✅ Llamado activado para ${identificacion}`);
      } else {
        llamadoActivo = null;
        mostrarNotificacion('Llamado desactivado', 'success');
        console.log('✅ Llamado desactivado');
      }
      
      cargarPacientes();
      
    } else {
      mostrarNotificacion('Error al actualizar llamado', 'error');
      const checkbox = document.getElementById(`toggle-${identificacion}`);
      if (checkbox) checkbox.checked = !activar;
    }
  })
  .catch(err => {
    console.error('Error:', err);
    mostrarNotificacion('Error de conexión', 'error');
    const checkbox = document.getElementById(`toggle-${identificacion}`);
    if (checkbox) checkbox.checked = !activar;
  });
}

// ========== DRAG & DROP ==========
function handleDragStart(e) {
  elementoArrastrado = this;
  this.classList.add('arrastrando');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/html', this.innerHTML);
}

function handleDragEnd(e) {
  this.classList.remove('arrastrando');
  document.querySelectorAll('.lista-pacientes').forEach(lista => {
    lista.classList.remove('drag-over');
  });
}

function habilitarDropZones() {
  const zonas = document.querySelectorAll('.lista-pacientes');
  zonas.forEach(zona => {
    zona.addEventListener('dragover', handleDragOver);
    zona.addEventListener('drop', handleDrop);
    zona.addEventListener('dragenter', handleDragEnter);
    zona.addEventListener('dragleave', handleDragLeave);
  });
}

function handleDragOver(e) {
  if (e.preventDefault) e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  return false;
}

function handleDragEnter(e) {
  this.classList.add('drag-over');
}

function handleDragLeave(e) {
  if (e.target === this) {
    this.classList.remove('drag-over');
  }
}

function handleDrop(e) {
  if (e.stopPropagation) e.stopPropagation();
  this.classList.remove('drag-over');

  if (elementoArrastrado) {
    const identificacion = elementoArrastrado.dataset.id;
    const estadoActual = elementoArrastrado.dataset.estado;

    let nuevoEstado;
    if (this.id === 'lista-preparacion') nuevoEstado = 'P';
    else if (this.id === 'lista-quirofano') nuevoEstado = 'Q';
    else if (this.id === 'lista-recuperacion') nuevoEstado = 'R';

    if (nuevoEstado && nuevoEstado !== estadoActual) {
      cambiarEstado(identificacion, nuevoEstado);
    }
  }

  return false;
}

// ========== ESTADÍSTICAS ==========
function actualizarEstadisticas() {
  let countP = 0, countQ = 0, countR = 0;

  pacientes.forEach(p => {
    if (p.estado === 'P') countP++;
    else if (p.estado === 'Q') countQ++;
    else if (p.estado === 'R') countR++;
  });

  actualizarContador('stat-preparacion', 'preparacion', 'P', countP);
  actualizarContador('stat-quirofano', 'quirofano', 'Q', countQ);
  actualizarContador('stat-recuperacion', 'recuperacion', 'R', countR);
  document.getElementById('stat-total').textContent = pacientes.length;
}

function actualizarContador(elementoId, tipoCard, estadoLetra, cantidad) {
  const elemento = document.getElementById(elementoId);
  const card = document.querySelector(`.stat-card.${tipoCard}`);

  elemento.textContent = cantidad;
  card.classList.remove('capacidad-excedida', 'capacidad-advertencia', 'capacidad-ok');

  const tooltipPrevio = card.querySelector('.tooltip-capacidad');
  if (tooltipPrevio) tooltipPrevio.remove();

  const validacion = CONFIG_TABLERO.validarCapacidad(estadoLetra, cantidad);
  
  if (validacion.estado === 'excedida') {
    card.classList.add('capacidad-excedida');
  } else {
    card.classList.add('capacidad-ok');
  }

  const tooltip = document.createElement('div');
  tooltip.className = 'tooltip-capacidad';
  tooltip.innerHTML = validacion.mensaje;
  card.appendChild(tooltip);
}

// ========== CAMBIAR ESTADO ==========
function cambiarEstado(identificacion, nuevoEstado) {
  fetch('/tableros/cirugia/pacientes/estado', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identificacion, estado: nuevoEstado })
  })
  .then(r => r.json())
  .then(data => {
    if (data.success) {
      cargarPacientes();
      mostrarNotificacion('Estado actualizado correctamente', 'success');
    } else {
      mostrarNotificacion('Error al actualizar estado', 'error');
      cargarPacientes();
    }
  })
  .catch(err => {
    console.error('Error:', err);
    mostrarNotificacion('Error de conexión', 'error');
    cargarPacientes();
  });
}

// ========== MODALES ==========
function abrirModalInsertar() {
  document.getElementById('modalInsertar').style.display = 'flex';
  cargarPacientesDisponibles();
}

function cerrarModalInsertar() {
  document.getElementById('modalInsertar').style.display = 'none';
}

function cargarPacientesDisponibles() {
  const contenedor = document.getElementById('lista-pacientes-disponibles');
  contenedor.innerHTML = `<div class="loading"><i class="fas fa-spinner fa-spin"></i><p>Cargando pacientes...</p></div>`;

  fetch('/tableros/cirugia/pacientes/disponibles')
    .then(r => r.json())
    .then(data => {
      if (data.success && Array.isArray(data.pacientes)) {
        pacientesDisponibles = data.pacientes;
        renderizarPacientesDisponibles(data.pacientes);
      }
    })
    .catch(err => {
      console.error('Error:', err);
      contenedor.innerHTML = `<p style="text-align: center; color: #f44336;">Error al cargar pacientes</p>`;
    });
}

function renderizarPacientesDisponibles(pacientes) {
  const contenedor = document.getElementById('lista-pacientes-disponibles');

  if (pacientes.length === 0) {
    contenedor.innerHTML = `<p style="text-align: center; color: #999;">No hay pacientes disponibles</p>`;
    return;
  }

  contenedor.innerHTML = '';
  pacientes.forEach(p => {
    const item = document.createElement('div');
    item.className = 'paciente-disponible';
    item.onclick = () => insertarPaciente(p.id, p.nombre);
    item.innerHTML = `
      <div class="paciente-disponible-nombre">${p.nombre}</div>
      <div class="paciente-disponible-id">ID: ${p.id}</div>
    `;
    contenedor.appendChild(item);
  });
}

function insertarPaciente(identificacion, nombre) {
  fetch('/tableros/cirugia/pacientes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identificacion, nombre })
  })
  .then(r => r.json())
  .then(data => {
    if (data.success) {
      cerrarModalInsertar();
      cargarPacientes();
      mostrarNotificacion('Paciente agregado correctamente', 'success');
    } else {
      mostrarNotificacion(data.error || 'Error al agregar paciente', 'error');
    }
  })
  .catch(err => {
    console.error('Error:', err);
    mostrarNotificacion('Error de conexión', 'error');
  });
}

function abrirModalEliminar(identificacion, nombre) {
  identificacionEliminar = identificacion;
  document.getElementById('nombre-eliminar').textContent = nombre;
  document.getElementById('id-eliminar').textContent = `ID: ${identificacion}`;
  document.getElementById('modalEliminar').style.display = 'flex';
}

function cerrarModalEliminar() {
  document.getElementById('modalEliminar').style.display = 'none';
  identificacionEliminar = null;
}

function confirmarEliminar() {
  if (!identificacionEliminar) return;

  fetch('/tableros/cirugia/pacientes', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identificacion: identificacionEliminar })
  })
  .then(r => r.json())
  .then(data => {
    if (data.success) {
      cerrarModalEliminar();
      cargarPacientes();
      mostrarNotificacion('Paciente eliminado correctamente', 'success');
    } else {
      mostrarNotificacion('Error al eliminar paciente', 'error');
    }
  })
  .catch(err => {
    console.error('Error:', err);
    mostrarNotificacion('Error de conexión', 'error');
  });
}

// ========== BÚSQUEDA ==========
document.addEventListener('DOMContentLoaded', () => {
  const buscarInput = document.getElementById('buscar-paciente');
  if (buscarInput) {
    buscarInput.addEventListener('input', (e) => {
      const texto = e.target.value.toLowerCase();
      document.querySelectorAll('.paciente-tarjeta').forEach(tarjeta => {
        const nombre = tarjeta.querySelector('.paciente-nombre').textContent.toLowerCase();
        const id = tarjeta.dataset.id.toLowerCase();
        tarjeta.style.display = (nombre.includes(texto) || id.includes(texto)) ? 'block' : 'none';
      });
    });
  }

  // Toggle barra de estadísticas para ganar espacio en tabletas
  const toggleStatsBtn = document.getElementById('toggle-stats');
  const statsBar = document.querySelector('.stats-bar');
  if (toggleStatsBtn && statsBar) {
    toggleStatsBtn.addEventListener('click', () => {
      const hidden = statsBar.classList.toggle('stats-hidden');
      toggleStatsBtn.setAttribute('aria-pressed', hidden ? 'true' : 'false');
      const label = toggleStatsBtn.querySelector('.btn-label');
      if (label) label.textContent = hidden ? 'Mostrar barra' : 'Ocultar barra';
    });
  }

  const buscarModalInput = document.getElementById('buscar-paciente-modal');
  if (buscarModalInput) {
    buscarModalInput.addEventListener('input', (e) => {
      const texto = e.target.value.toLowerCase();
      document.querySelectorAll('.paciente-disponible').forEach(item => {
        const nombre = item.querySelector('.paciente-disponible-nombre').textContent.toLowerCase();
        const id = item.querySelector('.paciente-disponible-id').textContent.toLowerCase();
        item.style.display = (nombre.includes(texto) || id.includes(texto)) ? 'block' : 'none';
      });
    });
  }

  cargarPacientes();
  setInterval(cargarPacientes, CONFIG_TABLERO.INTERVALO_ACTUALIZACION);
});

// ========== NOTIFICACIONES ==========
function mostrarNotificacion(mensaje, tipo) {
  const notif = document.createElement('div');
  notif.style.cssText = `
    position: fixed; top: 20px; right: 20px; padding: 15px 20px;
    background: ${tipo === 'success' ? '#4CAF50' : '#f44336'};
    color: white; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);
    z-index: 10000; animation: slideInRight 0.3s; display: flex;
    align-items: center; gap: 10px;
  `;
  notif.innerHTML = `
    <i class="fas fa-${tipo === 'success' ? 'check-circle' : 'exclamation-circle'}"></i>
    ${mensaje}
  `;
  document.body.appendChild(notif);

  setTimeout(() => {
    notif.style.animation = 'slideOutRight 0.3s';
    setTimeout(() => notif.remove(), 300);
  }, 3000);
}

// ========== ACTUALIZAR HORA ==========
function actualizarHora() {
  const ahora = new Date();
  const hora = ahora.toLocaleTimeString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  const horaElement = document.getElementById('hora-actualizacion');
  if (horaElement) horaElement.textContent = hora;
}


