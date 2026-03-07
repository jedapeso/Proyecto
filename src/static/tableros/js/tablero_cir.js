// ========== VARIABLES GLOBALES ==========
let pacientes = [];
let pacientesDisponibles = [];
let identificacionEliminar = null;
let elementoArrastrado = null;
let llamadoActivo = null;
let dragInProgress = false;
let pendingRefresh = false;
let lastPacientesKey = '';

const DOM = {
  listas: {},
  stats: {},
  statsBar: null,
  toggleStatsBtn: null,
  buscarInput: null,
  buscarModalInput: null,
  horaActualizacion: null
};

const ESTADO_POR_LISTA = {
  'lista-preparacion': 'P',
  'lista-quirofano': 'Q',
  'lista-recuperacion': 'R'
};

// ========== CARGAR PACIENTES (CON DETECCIÓN DE CAMBIO DE LLAMADO) ==========
function cargarPacientes() {
  fetch('/tableros/cirugia/pacientes')
    .then(r => r.json())
    .then(data => {
      if (data.success && Array.isArray(data.pacientes)) {
        if (dragInProgress) {
          pendingRefresh = true;
          return;
        }
        // 🔥 Verificar si el llamado activo ya no existe
        if (llamadoActivo) {
          const pacienteConLlamado = data.pacientes.find(p => p.llamado === true);
          if (!pacienteConLlamado) {
            console.log('🔓 Llamado finalizado, desbloqueando toggles');
            llamadoActivo = null; // 🔥 Desbloquear
          }
        }
        if (!llamadoActivo) {
          const pacienteConLlamado = data.pacientes.find(p => p.llamado === true);
          if (pacienteConLlamado) llamadoActivo = pacienteConLlamado.id;
        }

        const nuevoKey = data.pacientes
          .map(p => `${p.id}:${p.estado}:${p.llamado ? 1 : 0}`)
          .join('|');

        if (nuevoKey === lastPacientesKey) {
          actualizarHora();
          return;
        }

        lastPacientesKey = nuevoKey;
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
  const preparacion = DOM.listas.P;
  const quirofano = DOM.listas.Q;
  const recuperacion = DOM.listas.R;

  const porEstado = { P: [], Q: [], R: [] };
  pacientes.forEach(p => {
    if (porEstado[p.estado]) porEstado[p.estado].push(p);
  });

  renderColumna(preparacion, porEstado.P, 'P');
  renderColumna(quirofano, porEstado.Q, 'Q');
  renderColumna(recuperacion, porEstado.R, 'R');
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

  const html = pacientes.map(p => crearTarjetaPaciente(p, estadoActual)).join('');
  contenedor.innerHTML = html;
}

// ========== CREAR TARJETA PACIENTE ==========
function crearTarjetaPaciente(paciente, estadoActual) {
  const esLlamadoActivo = paciente.llamado === true;
  const disabled = llamadoActivo && llamadoActivo !== paciente.id ? 'disabled' : '';

  return `
    <div class="paciente-tarjeta" data-id="${paciente.id}" data-estado="${estadoActual}" draggable="true">
      <div class="drag-handle">
        <i class="fas fa-grip-vertical"></i>
      </div>
      <div class="paciente-contenido">
        <div class="paciente-header">
          <div class="paciente-info">
            <div class="paciente-id">
              <i class="fas fa-id-card"></i>
              <span>${paciente.id}</span>
            </div>
            <div class="paciente-nombre">
              <i class="fas fa-user"></i>
              ${paciente.nombre}
            </div>
          </div>
          <div class="acciones-paciente">
            <div class="toggle-llamado-container">
              <i class="fas fa-bell toggle-bell-icon"></i>
              <label class="toggle-llamado ${disabled ? 'disabled' : ''}">
                <input type="checkbox"
                       ${esLlamadoActivo ? 'checked' : ''}
                       ${disabled}
                       data-action="toggle-llamado"
                       data-id="${paciente.id}"
                       id="toggle-${paciente.id}">
                <span class="toggle-slider"></span>
              </label>
            </div>
            <button class="btn-icon eliminar"
                    data-action="eliminar"
                    data-id="${paciente.id}"
                    data-nombre="${paciente.nombre}"
                    title="Eliminar paciente">
              <i class="fas fa-trash-alt"></i>
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
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
  const tarjeta = e.target.closest('.paciente-tarjeta');
  if (!tarjeta) return;
  elementoArrastrado = tarjeta;
  dragInProgress = true;
  tarjeta.classList.add('arrastrando');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', tarjeta.dataset.id);
}

function handleDragEnd(e) {
  const tarjeta = e.target.closest('.paciente-tarjeta');
  if (tarjeta) tarjeta.classList.remove('arrastrando');
  dragInProgress = false;
  Object.values(DOM.listas).forEach(lista => {
    lista.classList.remove('drag-over');
  });

  if (pendingRefresh) {
    pendingRefresh = false;
    cargarPacientes();
  }
}

function habilitarDropZones() {
  Object.values(DOM.listas).forEach(zona => {
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
  if (e.relatedTarget && this.contains(e.relatedTarget)) return;
  this.classList.add('drag-over');
}

function handleDragLeave(e) {
  if (e.relatedTarget && this.contains(e.relatedTarget)) return;
  this.classList.remove('drag-over');
}

function handleDrop(e) {
  if (e.stopPropagation) e.stopPropagation();
  this.classList.remove('drag-over');

  if (elementoArrastrado) {
    const identificacion = elementoArrastrado.dataset.id;
    const estadoActual = elementoArrastrado.dataset.estado;

    const nuevoEstado = ESTADO_POR_LISTA[this.id];

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
  const elemento = DOM.stats[elementoId];
  const card = DOM.stats[`${tipoCard}Card`];
  if (!elemento || !card) return;

  elemento.textContent = cantidad;
  card.classList.remove('capacidad-excedida', 'capacidad-advertencia', 'capacidad-ok');

  const validacion = CONFIG_TABLERO.validarCapacidad(estadoLetra, cantidad);
  
  if (validacion.estado === 'excedida') {
    card.classList.add('capacidad-excedida');
  } else {
    card.classList.add('capacidad-ok');
  }

  let tooltip = card.querySelector('.tooltip-capacidad');
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.className = 'tooltip-capacidad';
    card.appendChild(tooltip);
  }
  tooltip.textContent = validacion.mensaje;
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
  DOM.listas = {
    P: document.getElementById('lista-preparacion'),
    Q: document.getElementById('lista-quirofano'),
    R: document.getElementById('lista-recuperacion')
  };
  DOM.stats = {
    'stat-preparacion': document.getElementById('stat-preparacion'),
    'stat-quirofano': document.getElementById('stat-quirofano'),
    'stat-recuperacion': document.getElementById('stat-recuperacion'),
    'stat-total': document.getElementById('stat-total'),
    preparacionCard: document.querySelector('.stat-card.preparacion'),
    quirofanoCard: document.querySelector('.stat-card.quirofano'),
    recuperacionCard: document.querySelector('.stat-card.recuperacion')
  };
  DOM.statsBar = document.querySelector('.stats-bar');
  DOM.toggleStatsBtn = document.getElementById('toggle-stats');
  DOM.buscarInput = document.getElementById('buscar-paciente');
  DOM.buscarModalInput = document.getElementById('buscar-paciente-modal');
  DOM.horaActualizacion = document.getElementById('hora-actualizacion');

  habilitarDropZones();

  const debouncedBuscar = debounce((texto) => {
    document.querySelectorAll('.paciente-tarjeta').forEach(tarjeta => {
      const nombre = tarjeta.querySelector('.paciente-nombre').textContent.toLowerCase();
      const id = tarjeta.dataset.id.toLowerCase();
      tarjeta.classList.toggle('is-hidden', !(nombre.includes(texto) || id.includes(texto)));
    });
  }, 120);

  if (DOM.buscarInput) {
    DOM.buscarInput.addEventListener('input', (e) => {
      debouncedBuscar(e.target.value.toLowerCase());
    });
  }

  // Toggle barra de estadísticas para ganar espacio en tabletas
  if (DOM.toggleStatsBtn && DOM.statsBar) {
    DOM.toggleStatsBtn.addEventListener('click', () => {
      const hidden = DOM.statsBar.classList.toggle('stats-hidden');
      DOM.toggleStatsBtn.setAttribute('aria-pressed', hidden ? 'true' : 'false');
      const label = DOM.toggleStatsBtn.querySelector('.btn-label');
      if (label) label.textContent = hidden ? 'Mostrar barra' : 'Ocultar barra';
    });
  }

  if (DOM.buscarModalInput) {
    const debouncedModal = debounce((texto) => {
      document.querySelectorAll('.paciente-disponible').forEach(item => {
        const nombre = item.querySelector('.paciente-disponible-nombre').textContent.toLowerCase();
        const id = item.querySelector('.paciente-disponible-id').textContent.toLowerCase();
        item.classList.toggle('is-hidden', !(nombre.includes(texto) || id.includes(texto)));
      });
    }, 120);
    DOM.buscarModalInput.addEventListener('input', (e) => {
      debouncedModal(e.target.value.toLowerCase());
    });
  }

  document.addEventListener('dragstart', handleDragStart);
  document.addEventListener('dragend', handleDragEnd);

  document.addEventListener('change', (e) => {
    const target = e.target;
    if (!target || target.dataset.action !== 'toggle-llamado') return;
    toggleLlamado(target.dataset.id, target.checked);
  });

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="eliminar"]');
    if (!btn) return;
    abrirModalEliminar(btn.dataset.id, btn.dataset.nombre);
  });

  cargarPacientes();
  setInterval(() => {
    if (dragInProgress) {
      pendingRefresh = true;
      return;
    }
    cargarPacientes();
  }, CONFIG_TABLERO.INTERVALO_ACTUALIZACION);
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
  if (DOM.horaActualizacion) DOM.horaActualizacion.textContent = hora;
}

function debounce(fn, wait) {
  let t = null;
  return (...args) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}


