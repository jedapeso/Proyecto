// Archivo - Dashboard Functions

let historiasAgregadas = [];
let consecutivoActual = 1;
let centrosCosto = []; // Guardar centros para exclusión
let modalHistoria = null;
let modalRecepcion = null;
let trasladosRecepcion = [];
let detalleRecepcion = [];

// Función para decodificar HTML entities (Ñ, á, é, etc)
function decodificarHTML(texto) {
  if (!texto) return '';
  const textarea = document.createElement('textarea');
  textarea.innerHTML = texto;
  return textarea.value;
}

// Sistema de notificaciones
function mostrarNotificacion(mensaje, tipo = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const iconos = {
    'success': '<i class="fas fa-check-circle"></i>',
    'error': '<i class="fas fa-times-circle"></i>',
    'warning': '<i class="fas fa-exclamation-triangle"></i>',
    'info': '<i class="fas fa-info-circle"></i>'
  };

  const colores = {
    'success': '#198754',
    'error': '#dc3545',
    'warning': '#ffc107',
    'info': '#0dcaf0'
  };

  const toastId = 'toast-' + Date.now();
  const toast = document.createElement('div');
  toast.id = toastId;
  toast.className = 'alert alert-dismissible fade show';
  toast.style.cssText = `
    background: white;
    border-left: 4px solid ${colores[tipo]};
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    margin-bottom: 10px;
    padding: 12px 40px 12px 16px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    gap: 12px;
    animation: slideIn 0.3s ease;
    position: relative;
    max-width: 450px;
  `;

  toast.innerHTML = `
    <span style="color: ${colores[tipo]}; font-size: 1.5rem; flex-shrink: 0;">${iconos[tipo]}</span>
    <span style="flex: 1; color: #333; font-size: 0.95rem; word-wrap: break-word; padding-right: 8px;">${mensaje}</span>
    <button type="button" class="btn-close" onclick="cerrarNotificacion('${toastId}')" style="position: absolute; right: 8px; top: 50%; transform: translateY(-50%);"></button>
  `;

  container.appendChild(toast);

  // Auto-cerrar después de 5 segundos
  setTimeout(() => {
    cerrarNotificacion(toastId);
  }, 5000);
}

function cerrarNotificacion(toastId) {
  const toast = document.getElementById(toastId);
  if (toast) {
    toast.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => {
      toast.remove();
    }, 300);
  }
}

// Inicialización
document.addEventListener('DOMContentLoaded', function() {
  // Establecer fecha actual
  const hoy = new Date().toISOString().split('T')[0];
  document.getElementById('fecha').value = hoy;
  
  // Botón agregar inicia deshabilitado (requiere origen y destino)
  const btnAdd = document.querySelector('.btn-add');
  btnAdd.disabled = true;
  btnAdd.style.opacity = '0.5';
  
  // Init modal
  modalHistoria = new bootstrap.Modal(document.getElementById('modalHistoria'));
  modalRecepcion = new bootstrap.Modal(document.getElementById('modalRecepcion'));
  window.modalConfirmacionRechazo = new bootstrap.Modal(document.getElementById('modalConfirmacionRechazo'));
  window.modalConfirmacionTraslado = new bootstrap.Modal(document.getElementById('modalConfirmacionTraslado'));
  window.modalConfirmacionGuardado = new bootstrap.Modal(document.getElementById('modalConfirmacionGuardado'));
  // Modal para exportar tras recepcionar
  const modalExportEl = document.getElementById('modalExportRecepcion');
  if (modalExportEl) {
    window.modalExportRecepcion = new bootstrap.Modal(modalExportEl);
  }

  // Evitar foco retenido en modal oculto (warning aria-hidden)
  const modalRecEl = document.getElementById('modalRecepcion');
  modalRecEl.addEventListener('hidden.bs.modal', () => {
    if (document.activeElement) {
      document.activeElement.blur();
    }
  });

  // Eventos recepción
  document.getElementById('btnBuscarRecepcion').addEventListener('click', buscarTrasladosRecepcion);
  const btnGuardarRecepcion = document.querySelector('#seccion-recepcion .btn-save');
  if (btnGuardarRecepcion) {
    btnGuardarRecepcion.addEventListener('click', guardarRecepcion);
  }
  
  // Evento de confirmación de guardado de traslado
  document.getElementById('btnConfirmarGuardado').addEventListener('click', ejecutarGuardadoTraslado);
  
  // Eventos de reportes
  document.getElementById('btnBuscarReportes').addEventListener('click', buscarReportes);
  
  // Cargar centros de costo
  cargarCentrosCosto();
});

// Navegación entre secciones
function mostrarTraslados() {
  document.getElementById('seccion-inicial').style.display = 'none';
  document.getElementById('seccion-traslado').style.display = 'block';
  document.getElementById('seccion-recepcion').style.display = 'none';
  document.getElementById('seccion-busqueda').style.display = 'none';
  document.getElementById('seccion-reportes').style.display = 'none';
  
  // Al cambiar de módulo, limpiar resultados de Reportes
  if (typeof limpiarReportes === 'function') {
    limpiarReportes();
  }
  
  // Resetear el formulario de traslado
  document.getElementById('form-traslado').reset();
  document.getElementById('consecutivo').value = '';
  document.getElementById('numRegistros').value = '0';
  document.getElementById('fecha').valueAsDate = new Date();
  
  // Resetear tabla de historias
  document.getElementById('tbody-historias').innerHTML = `
    <tr>
      <td colspan="11" style="text-align: center; padding: 2.5rem; color: #6c757d;">
        <i class="fas fa-info-circle" style="font-size: 2.5rem; opacity: 0.4; display: block; margin-bottom: 1rem;"></i>
        <strong style="display: block; margin-bottom: 0.5rem; font-size: 1rem;">Debe seleccionar los centros de costo para comenzar</strong>
        <span style="font-size: 0.9rem;">Escoja un <strong>Centro de Costo Origen</strong> y un <strong>Centro de Costo Destino</strong> para habilitar el botón "AGREGAR HISTORIA"</span>
      </td>
    </tr>
  `;
  
  // Limpiar arrays de detalles del traslado
  historiasAgregadas = [];
  detalleTraslado = [];
  
  // Resetear y deshabilitar botones
  const btnAdd = document.querySelector('.btn-add');
  const btnSave = document.querySelector('.btn-save');
  btnAdd.disabled = true;
  btnAdd.style.opacity = '0.5';
  btnSave.disabled = true;
  btnSave.style.opacity = '0.5';
  
  // Actualizar estado de los botones
  actualizarEstadoBotonAdd();
  
  // Recargar centros para reiniciar la exclusión
  cargarCentrosCosto();
}

function buscarExpediente() {
  document.getElementById('seccion-inicial').style.display = 'none';
  document.getElementById('seccion-traslado').style.display = 'none';
  document.getElementById('seccion-recepcion').style.display = 'none';
  document.getElementById('seccion-busqueda').style.display = 'block';
  document.getElementById('seccion-reportes').style.display = 'none';
  
  // Al cambiar de módulo, limpiar resultados de Reportes
  if (typeof limpiarReportes === 'function') {
    limpiarReportes();
  }
  
  // Limpiar búsqueda anterior
  document.getElementById('busq_historia').value = '';
  document.getElementById('busq_ingreso').value = '';
  document.getElementById('busq_cedula').value = '';
  
  const tbody = document.getElementById('tbody-busqueda');
  tbody.innerHTML = `
    <tr>
      <td colspan="13" style="text-align: center; padding: 3rem; color: #6c757d;">
        <i class="fas fa-search" style="font-size: 3rem; opacity: 0.3; display: block; margin-bottom: 1rem;"></i>
        Ingrese criterios de búsqueda y presione BUSCAR
      </td>
    </tr>
  `;
}

function limpiarBusqueda() {
  document.getElementById('busq_historia').value = '';
  document.getElementById('busq_ingreso').value = '';
  document.getElementById('busq_cedula').value = '';
  
  const tbody = document.getElementById('tbody-busqueda');
  tbody.innerHTML = `
    <tr>
      <td colspan="13" style="text-align: center; padding: 3rem; color: #6c757d;">
        <i class="fas fa-search" style="font-size: 3rem; opacity: 0.3; display: block; margin-bottom: 1rem;"></i>
        Ingrese criterios de búsqueda y presione BUSCAR
      </td>
    </tr>
  `;
}

async function realizarBusquedaExpediente() {
  const historia = document.getElementById('busq_historia').value.trim();
  const ingreso = document.getElementById('busq_ingreso').value.trim();
  const cedula = document.getElementById('busq_cedula').value.trim();

  // Validar que al menos un criterio esté lleno
  if (!historia && !cedula) {
    mostrarNotificacion('Debe ingresar al menos Historia o Cédula para buscar', 'warning');
    return;
  }

  try {
    const response = await fetch('/archivo/busqueda/expediente', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ historia, ingreso, cedula })
    });

    const data = await response.json();

    if (!data.success) {
      mostrarNotificacion(data.error || 'Error en la búsqueda', 'error');
      return;
    }

    if (!data.resultados || data.resultados.length === 0) {
      const tbody = document.getElementById('tbody-busqueda');
      tbody.innerHTML = `
        <tr>
          <td colspan="13" style="text-align: center; padding: 3rem; color: #6c757d;">
            <i class="fas fa-inbox" style="font-size: 3rem; opacity: 0.3; display: block; margin-bottom: 1rem;"></i>
            No se encontraron resultados para los criterios especificados
          </td>
        </tr>
      `;
      mostrarNotificacion('No se encontraron resultados', 'info');
      return;
    }

    renderizarResultadosBusqueda(data.resultados);
    mostrarNotificacion(`Se encontraron ${data.resultados.length} resultado(s)`, 'success');

  } catch (error) {
    console.error('Error realizando búsqueda:', error);
    mostrarNotificacion('Error al realizar la búsqueda', 'error');
  }
}

function renderizarResultadosBusqueda(resultados) {
  const tbody = document.getElementById('tbody-busqueda');
  tbody.innerHTML = '';

  resultados.forEach((item, idx) => {
    // Detectar si es del sistema anterior
    const esSistemaAnterior = item.sistema_anterior === true;
    const claseFila = esSistemaAnterior ? 'fila-sistema-anterior' : '';
    const iconoAnterior = esSistemaAnterior ? '<i class="fas fa-archive" title="Sistema Anterior" style="color: #6c757d; margin-left: 0.5rem; font-size: 0.75rem;"></i>' : '';
    
    // Determinar badge de estado
    let estadoTexto, claseBadge, iconoEstado;
    
    if (esSistemaAnterior) {
      // Registros históricos
      estadoTexto = 'Histórico';
      claseBadge = 'historico';
      iconoEstado = '<i class="fas fa-archive"></i>';
    } else {
      // Registros del sistema actual
      const estado = item.estado || 'N';
      estadoTexto = estado === 'R' ? 'Rechazada' : estado === 'A' ? 'Aceptada' : 'Pendiente';
      claseBadge = estado === 'R' ? 'rechazada' : estado === 'A' ? 'aceptada' : 'pendiente';
      iconoEstado = estado === 'R' ? '<i class="fas fa-times-circle"></i>' : 
                   estado === 'A' ? '<i class="fas fa-check-circle"></i>' : 
                   '<i class="fas fa-clock"></i>';
    }

    const tr = document.createElement('tr');
    tr.className = claseFila;
    tr.innerHTML = `
      <td><strong>#${idx + 1}</strong></td>
      <td><strong style="color: #5B7FD5;">${item.consecutivo}${iconoAnterior}</strong></td>
      <td><strong>${item.historia}</strong></td>
      <td><span style="background: #e3f2fd; padding: 0.25rem 0.5rem; border-radius: 0.25rem; font-weight: 600;">${item.ingreso}</span></td>
      <td>${item.tipoId}</td>
      <td>${item.identificacion}</td>
      <td style="font-weight: 500;">${decodificarHTML(item.nombre)}</td>
      <td>${soloFecha(item.fecha_ingreso) || ''}</td>
      <td>${soloFecha(item.fecha_egreso) || ''}</td>
      <td>${soloFecha(item.fecha_traslado) || ''}</td>
      <td style="font-size: 0.85rem;">${item.origen}</td>
      <td style="font-size: 0.85rem;">${item.destino}</td>
      <td>
        <span class="estado-badge ${claseBadge}">
          ${iconoEstado} ${estadoTexto}
        </span>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function historial() {
  mostrarNotificacion('Función de historial de traslados - En desarrollo', 'info');
}

function reportes() {
  document.getElementById('seccion-inicial').style.display = 'none';
  document.getElementById('seccion-traslado').style.display = 'none';
  document.getElementById('seccion-recepcion').style.display = 'none';
  document.getElementById('seccion-busqueda').style.display = 'none';
  document.getElementById('seccion-reportes').style.display = 'block';
  
  // Prefijar rango de fechas (últimos 6 meses)
  const hoy = new Date();
  const seiseMesesAntes = new Date();
  seiseMesesAntes.setMonth(hoy.getMonth() - 6);
  
  document.getElementById('rep_fechaInicio').value = seiseMesesAntes.toISOString().split('T')[0];
  document.getElementById('rep_fechaFin').value = hoy.toISOString().split('T')[0];
  document.getElementById('rep_estado').value = '';
  document.getElementById('rep_consecutivo').value = '';
  
  // Limpiar cualquier resultado previo del listado
  if (typeof limpiarReportes === 'function') {
    limpiarReportes();
  }
}

function recepcionArchivos() {
  document.getElementById('seccion-inicial').style.display = 'none';
  document.getElementById('seccion-traslado').style.display = 'none';
  document.getElementById('seccion-recepcion').style.display = 'none';
  document.getElementById('seccion-busqueda').style.display = 'none';
  document.getElementById('seccion-reportes').style.display = 'none';
  
  // Al cambiar de módulo, limpiar resultados de Reportes
  if (typeof limpiarReportes === 'function') {
    limpiarReportes();
  }
  
  // Prefijar rango de fechas (últimos 6 meses)
  const hoy = new Date();
  const seiseMesesAntes = new Date();
  seiseMesesAntes.setMonth(hoy.getMonth() - 6);
  
  document.getElementById('rec_fechaInicio').value = seiseMesesAntes.toISOString().split('T')[0];
  document.getElementById('rec_fechaFin').value = hoy.toISOString().split('T')[0];

  trasladosRecepcion = [];
  detalleRecepcion = [];
  document.getElementById('tbody-traslados-recepcion').innerHTML = '';
  modalRecepcion.show();
}

// Cargar centros de costo desde el backend
async function cargarCentrosCosto() {
  try {
    const response = await fetch('/archivo/centros-costo');
    const data = await response.json();
    
    centrosCosto = data; // Guardar para usar en exclusión
    
    const selectOrigen = document.getElementById('centroOrigen');
    const selectDestino = document.getElementById('centroDestino');
    
    // Limpiar opciones previas (excepto el "Seleccione...")
    while (selectOrigen.options.length > 1) {
      selectOrigen.remove(1);
    }
    while (selectDestino.options.length > 1) {
      selectDestino.remove(1);
    }
    
    // Limpiar valores seleccionados
    selectOrigen.value = '';
    selectDestino.value = '';
    
    data.forEach(centro => {
      const option = new Option(centro.nombre, centro.codigo);
      selectOrigen.add(option.cloneNode(true));
      selectDestino.add(option.cloneNode(true));
    });
    
    // Remover listeners antiguos creando nuevos elementos (para evitar duplicados)
    const newOrigen = selectOrigen.cloneNode(true);
    const newDestino = selectDestino.cloneNode(true);
    selectOrigen.parentNode.replaceChild(newOrigen, selectOrigen);
    selectDestino.parentNode.replaceChild(newDestino, selectDestino);
    
    // Agregar event listeners al nuevo elemento
    document.getElementById('centroOrigen').addEventListener('change', () => { aplicarExclusion(); actualizarEstadoBotonAdd(); });
    document.getElementById('centroDestino').addEventListener('change', () => { aplicarExclusion(); actualizarEstadoBotonAdd(); });

    // Estado inicial del botón
    actualizarEstadoBotonAdd();
    
  } catch (error) {
    console.error('Error cargando centros de costo:', error);
    alert('Error al cargar centros de costo');
  }
}

// Buscar traslados por rango de fecha para recepción
async function buscarTrasladosRecepcion() {
  const fecha_inicio = document.getElementById('rec_fechaInicio').value;
  const fecha_fin = document.getElementById('rec_fechaFin').value;

  if (!fecha_inicio || !fecha_fin) {
    mostrarNotificacion('Debe seleccionar las dos fechas', 'warning');
    return;
  }

  // Validar que la fecha inicial no sea mayor que la fecha final
  if (new Date(fecha_inicio) > new Date(fecha_fin)) {
    mostrarNotificacion('La fecha inicial no puede ser mayor que la fecha final', 'warning');
    document.getElementById('rec_fechaInicio').focus();
    return;
  }

  try {
    const response = await fetch('/archivo/recepcion/buscar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fecha_inicio, fecha_fin })
    });

    const data = await response.json();
    if (!data.success) {
      mostrarNotificacion(data.error || 'No se encontraron traslados', 'error');
      return;
    }

    trasladosRecepcion = data.traslados || [];
    renderizarTrasladosRecepcion();
  } catch (error) {
    console.error('Error buscando traslados:', error);
    mostrarNotificacion('Error al buscar traslados', 'error');
  }
}

function renderizarTrasladosRecepcion() {
  const tbody = document.getElementById('tbody-traslados-recepcion');
  tbody.innerHTML = '';

  if (!trasladosRecepcion.length) {
    tbody.innerHTML = '<tr><td colspan="6">Sin resultados para el rango</td></tr>';
    return;
  }

  trasladosRecepcion.forEach(item => {
    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    
    // Determinar el badge del estado
    let estadoBadge = '';
    const estado = item.estado || 'N';
    
    if (estado === 'N') {
      estadoBadge = '<span class="estado-badge estado-pendiente"><i class="fas fa-circle-notch"></i> PENDIENTE</span>';
    } else if (estado === 'A') {
      estadoBadge = '<span class="estado-badge estado-aceptada"><i class="fas fa-check-circle"></i> ACEPTADA</span>';
    } else if (estado === 'R') {
      estadoBadge = '<span class="estado-badge estado-rechazada"><i class="fas fa-times-circle"></i> RECHAZADA</span>';
    }
    
    tr.innerHTML = `
      <td>${item.consecutivo}</td>
      <td>${item.fecha}</td>
      <td>${formatearCentro(item.origen)}</td>
      <td>${formatearCentro(item.destino)}</td>
      <td>${item.cantidad || 0}</td>
      <td>${estadoBadge}</td>
    `;
    
    // Agregar efecto hover
    tr.addEventListener('mouseenter', () => {
      tr.style.backgroundColor = '#e7f3ff';
    });
    tr.addEventListener('mouseleave', () => {
      tr.style.backgroundColor = '';
    });
    
    // Hacer click en la fila para cargar detalle
    tr.addEventListener('click', () => {
      cargarDetalleRecepcion(item.consecutivo, true);
    });
    
    tbody.appendChild(tr);
  });
}

// Función manejarSeleccionRecepcion eliminada - ahora click directo en fila
// Función aceptarTrasladoRecepcion eliminada - ahora click directo en fila

async function cargarDetalleRecepcion(consecutivo, desdeModal = false) {

  try {
    const response = await fetch(`/archivo/recepcion/detalle/${consecutivo}`);
    const data = await response.json();
    if (!data.success) {
      mostrarNotificacion(data.error || 'No se pudo cargar el traslado', 'error');
      return;
    }

    // Mostrar sección recepción
    document.getElementById('seccion-recepcion').style.display = 'block';
    document.getElementById('seccion-traslado').style.display = 'none';
    document.getElementById('seccion-inicial').style.display = 'none';

    // Encabezado
    const consecutivoInput = document.getElementById('rec_consecutivo');
    consecutivoInput.value = data.encabezado.consecutivo;
    // Guardar el estado del encabezado como data attribute para usarlo en renderizado
    consecutivoInput.dataset.estadoEncabezado = data.encabezado.estadoEncabezado || 'N';
    
    document.getElementById('rec_fecha').value = soloFecha(data.encabezado.fecha);
    document.getElementById('rec_centroOrigen').value = formatearCentro(data.encabezado.origen);
    document.getElementById('rec_centroDestino').value = formatearCentro(data.encabezado.destino);
    document.getElementById('rec_numRegistros').value = data.detalle.length;

    // Detectar si el traslado ya fue recepcionado: verificar estado del encabezado
    const observacionGeneral = data.encabezado.observacionGeneral || '';
    const estadoEncabezado = data.encabezado.estadoEncabezado || 'N';
    
    // El traslado está recepcionado si el estado del encabezado es 'A' (aceptado/recepcionado)
    const trasladoRecepcionado = estadoEncabezado === 'A';
    const rechazoGeneralGuardado = estadoEncabezado === 'R' && observacionGeneral;
    
    // Control del botón GUARDAR RECEPCIÓN
    const btnGuardarRecepcion = document.querySelector('#seccion-recepcion .btn-save');
    if (trasladoRecepcionado) {
      btnGuardarRecepcion.disabled = true;
      btnGuardarRecepcion.style.opacity = '0.5';
      btnGuardarRecepcion.style.cursor = 'not-allowed';
      btnGuardarRecepcion.innerHTML = '<i class="fas fa-lock"></i> RECEPCIÓN GUARDADA';
    } else {
      btnGuardarRecepcion.disabled = false;
      btnGuardarRecepcion.style.opacity = '1';
      btnGuardarRecepcion.style.cursor = 'pointer';
      btnGuardarRecepcion.innerHTML = '<i class="fas fa-save"></i> GUARDAR RECEPCIÓN';
    }
    
    if (observacionGeneral) {
      document.getElementById('contenedorObservacionGeneral').style.display = 'block';
      document.getElementById('observacionGeneral').value = observacionGeneral;
      
      // Si el rechazo general ya está guardado, deshabilitar edición
      if (rechazoGeneralGuardado) {
        document.getElementById('observacionGeneral').disabled = true;
        document.getElementById('observacionGeneral').style.backgroundColor = '#e9ecef';
        document.getElementById('observacionGeneral').style.cursor = 'not-allowed';
        document.getElementById('btnRechazarTodo').disabled = true;
        document.getElementById('btnRechazarTodo').style.opacity = '0.6';
        document.getElementById('btnRechazarTodo').style.cursor = 'not-allowed';
        document.getElementById('btnRechazarTodo').style.background = '#6c757d';
        document.getElementById('btnRechazarTodo').innerHTML = '<i class="fas fa-lock"></i> RECHAZO GUARDADO';
      } else {
        document.getElementById('observacionGeneral').disabled = false;
        document.getElementById('observacionGeneral').style.backgroundColor = '';
        document.getElementById('observacionGeneral').style.cursor = '';
        document.getElementById('btnRechazarTodo').disabled = false;
        document.getElementById('btnRechazarTodo').style.opacity = '1';
        document.getElementById('btnRechazarTodo').style.cursor = 'pointer';
        document.getElementById('btnRechazarTodo').style.background = '#dc3545';
        document.getElementById('btnRechazarTodo').innerHTML = '<i class="fas fa-undo"></i> REVERTIR RECHAZO';
      }
    } else {
      document.getElementById('contenedorObservacionGeneral').style.display = 'none';
      document.getElementById('observacionGeneral').value = '';
      document.getElementById('observacionGeneral').disabled = false;
      // Si el traslado ya fue recepcionado, deshabilitar el botón RECHAZAR TODO
      if (trasladoRecepcionado) {
        document.getElementById('btnRechazarTodo').disabled = true;
        document.getElementById('btnRechazarTodo').style.opacity = '0.6';
        document.getElementById('btnRechazarTodo').style.cursor = 'not-allowed';
        document.getElementById('btnRechazarTodo').style.background = '#6c757d';
        document.getElementById('btnRechazarTodo').innerHTML = '<i class="fas fa-lock"></i> RECEPCIONADO';
      } else {
        document.getElementById('btnRechazarTodo').disabled = false;
        document.getElementById('btnRechazarTodo').style.opacity = '1';
        document.getElementById('btnRechazarTodo').style.cursor = 'pointer';
        document.getElementById('btnRechazarTodo').style.background = '#6c757d';
        document.getElementById('btnRechazarTodo').innerHTML = '<i class="fas fa-times-circle"></i> RECHAZAR TODO';
      }
    }

    detalleRecepcion = data.detalle;
    renderizarDetalleRecepcion();
    if (desdeModal) {
      modalRecepcion.hide();
    }
  } catch (error) {
    console.error('Error cargando traslado:', error);
    mostrarNotificacion('Error al cargar el traslado seleccionado', 'error');
  }
}

function renderizarDetalleRecepcion() {
  const tbody = document.getElementById('tbody-recepcion');
  tbody.innerHTML = '';

  if (!detalleRecepcion.length) {
    tbody.innerHTML = '<tr><td colspan="12">Sin detalles para mostrar</td></tr>';
    return;
  }

  // Verificar si hay rechazo masivo activo
  const rechazoMasivoActivo = document.getElementById('contenedorObservacionGeneral').style.display !== 'none';
  
  // Verificar si el traslado ya fue recepcionado (estado del encabezado = 'A')
  const estadoEncabezado = document.getElementById('rec_consecutivo').dataset.estadoEncabezado || 'N';
  const trasladoRecepcionado = estadoEncabezado === 'A';

  detalleRecepcion.forEach((item, idx) => {
    const estado = item.estado || 'N';
    const estadoOriginal = item.estadoOriginal || 'N';
    const esRechazado = estado === 'R';
    const fueGuardadoComoRechazado = estadoOriginal === 'R';  // Ya guardado en BD como rechazado
    const estadoTexto = esRechazado ? 'Rechazada' : 'Aceptada';
    const claseBadge = esRechazado ? 'rechazada' : 'aceptada';
    const iconoEstado = esRechazado ? '<i class="fas fa-times-circle"></i>' : '<i class="fas fa-check-circle"></i>';
    const observacion = item.observacion || '';
    
    // Si el traslado está recepcionado, deshabilitar TODOS los controles
    const toggleDisabled = trasladoRecepcionado || fueGuardadoComoRechazado;
    const observacionDisabled = trasladoRecepcionado || (!esRechazado || fueGuardadoComoRechazado || rechazoMasivoActivo);
    const estiloDeshabilitado = trasladoRecepcionado ? 'opacity: 0.6; cursor: not-allowed;' : '';
    
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>#${idx + 1}</strong></td>
      <td><strong>${item.historia}</strong></td>
      <td>${item.tipoId}</td>
      <td>${item.identificacion}</td>
      <td style="font-weight: 500;">${item.nombre}</td>
      <td><span style="background: #e3f2fd; padding: 0.25rem 0.5rem; border-radius: 0.25rem; font-weight: 600;">${item.ingreso}</span></td>
      <td>${soloFecha(item.fecha_ingreso) || ''}</td>
      <td>${soloFecha(item.fecha_egreso) || ''}</td>
      <td>${soloFecha(item.fecha_traslado) || ''}</td>
      <td>
        <span class="estado-badge ${claseBadge}">
          ${iconoEstado} ${estadoTexto}
        </span>
      </td>
      <td>
        <label class="switch" style="${estiloDeshabilitado}">
          <input type="checkbox" 
                 id="rec-switch-${idx}" 
                 ${esRechazado ? '' : 'checked'} 
                 ${toggleDisabled ? 'disabled' : ''} 
                 onchange="toggleEstadoRecepcion(${idx}, this.checked)">
          <span class="slider"></span>
        </label>
      </td>
      <td>
        <input type="text" 
               class="form-control" 
               id="obs-${idx}" 
               value="${observacion}"
               placeholder="${rechazoMasivoActivo ? 'Usar observación general' : 'Observación (mín. 10 caracteres)'}"
               ${observacionDisabled ? 'disabled' : ''}
               oninput="actualizarObservacion(${idx}, this.value)"
               style="min-width: 200px; ${estiloDeshabilitado}">
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function toggleEstadoRecepcion(index, isChecked) {
  const item = detalleRecepcion[index];
  if (!item) return;
  const nuevoEstado = isChecked ? 'N' : 'R';
  detalleRecepcion[index] = { ...item, estado: nuevoEstado, observacion: nuevoEstado === 'N' ? '' : item.observacion };
  renderizarDetalleRecepcion();
}

function actualizarObservacion(index, valor) {
  const item = detalleRecepcion[index];
  if (!item) return;
  detalleRecepcion[index] = { ...item, observacion: valor };
}

function toggleRechazarTodo() {
  if (!detalleRecepcion.length) {
    mostrarNotificacion('No hay registros para procesar', 'warning');
    return;
  }

  const btn = document.getElementById('btnRechazarTodo');
  const contenedorObs = document.getElementById('contenedorObservacionGeneral');
  const todasRechazadas = detalleRecepcion.every(item => item.estado === 'R' && item.estadoOriginal !== 'R');
  
  if (todasRechazadas) {
    // Revertir: marcar todas como aceptadas (solo las que no estaban guardadas como rechazadas)
    detalleRecepcion = detalleRecepcion.map(item => {
      if (item.estadoOriginal !== 'R') {
        return { ...item, estado: 'N', observacion: '' };
      }
      return item;
    });
    btn.style.background = '#6c757d';
    btn.innerHTML = '<i class="fas fa-times-circle"></i> RECHAZAR TODO';
    contenedorObs.style.display = 'none';
    document.getElementById('observacionGeneral').value = '';
    mostrarNotificacion('Se revirtió el rechazo masivo', 'info');
  } else {
    // Rechazar todas (solo las que no están guardadas como rechazadas)
    const rechazables = detalleRecepcion.filter(item => item.estadoOriginal !== 'R');
    if (rechazables.length === 0) {
      mostrarNotificacion('Todas las historias ya están guardadas como rechazadas', 'warning');
      return;
    }
    
    detalleRecepcion = detalleRecepcion.map(item => {
      if (item.estadoOriginal !== 'R') {
        return { ...item, estado: 'R' };
      }
      return item;
    });
    btn.style.background = '#dc3545';
    btn.innerHTML = '<i class="fas fa-undo"></i> REVERTIR RECHAZO';
    contenedorObs.style.display = 'block';
    mostrarNotificacion(`Se marcaron ${rechazables.length} historias para rechazo. Ingrese la observación general.`, 'warning');
  }
  
  renderizarDetalleRecepcion();
}

async function guardarRecepcion() {
  if (!detalleRecepcion.length) {
    mostrarNotificacion('No hay registros para actualizar', 'warning');
    return;
  }

  const consecutivo = document.getElementById('rec_consecutivo').value;
  const contenedorObsGeneral = document.getElementById('contenedorObservacionGeneral');
  const rechazoMasivoActivo = contenedorObsGeneral.style.display !== 'none';
  const observacionGeneral = document.getElementById('observacionGeneral').value.trim();

  // Si hay rechazo masivo, validar observación general
  if (rechazoMasivoActivo) {
    if (!observacionGeneral || observacionGeneral.length < 10) {
      mostrarNotificacion('Debe ingresar una observación general de al menos 10 caracteres para el rechazo masivo', 'warning');
      document.getElementById('observacionGeneral').focus();
      return;
    }
  }

  // Incluir TODAS las historias (aceptadas y rechazadas) que no están ya guardadas
  const cambios = detalleRecepcion
    .filter(item => item.estadoOriginal === 'N')  // Solo las que están pendientes (no guardadas previamente)
    .map(item => ({ 
      historia: item.historia, 
      ingreso: item.ingreso, 
      estado: item.estado,  // Puede ser 'A' (aceptada) o 'R' (rechazada)
      observacion: item.observacion || ''
    }));

  if (!cambios.length) {
    mostrarNotificacion('No hay cambios para guardar. Todas las historias ya fueron recepcionadas.', 'warning');
    return;
  }

  // Solo validar observaciones individuales de las RECHAZADAS si NO es rechazo general
  if (!rechazoMasivoActivo) {
    const rechazadasSinObservacion = cambios.filter(c => c.estado === 'R' && (!c.observacion || c.observacion.trim().length < 10));
    if (rechazadasSinObservacion.length > 0) {
      mostrarNotificacion(`Debe ingresar una observación de al menos 10 caracteres para todos los documentos rechazados. Documentos sin observación válida: ${rechazadasSinObservacion.length}`, 'warning');
      return;
    }
  }

  // Mostrar modal de confirmación SIEMPRE
  document.getElementById('consecutivoConfirmacionGuardado').textContent = consecutivo;
  
  // Mostrar el modal de confirmación
  window.modalConfirmacionGuardado.show();
  
  // Configurar el botón de confirmación para ejecutar el guardado
  document.getElementById('btnConfirmarGuardadoRecepcion').onclick = async function() {
    window.modalConfirmacionGuardado.hide();
    await ejecutarGuardadoRecepcion(consecutivo, cambios, rechazoMasivoActivo, observacionGeneral);
  };
}

async function ejecutarGuardadoRecepcion(consecutivo, cambios, rechazoMasivoActivo, observacionGeneral) {
  try {
    const payload = {
      consecutivo,
      detalle: cambios,
      esRechazoGeneral: rechazoMasivoActivo,
      observacionGeneral: rechazoMasivoActivo ? observacionGeneral : ''
    };

    const response = await fetch('/archivo/recepcion/guardar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const texto = await response.text();
      mostrarNotificacion('Error al guardar recepción: ' + (texto || response.status), 'error');
      return;
    }

    const data = await response.json();
    if (!data.success) {
      mostrarNotificacion(data.error || 'No se pudo guardar recepción', 'error');
      return;
    }

    mostrarNotificacion('Recepción actualizada correctamente', 'success');
    
    // Limpiar y ocultar campo de observación general
    document.getElementById('contenedorObservacionGeneral').style.display = 'none';
    document.getElementById('observacionGeneral').value = '';
    document.getElementById('btnRechazarTodo').style.background = '#6c757d';
    document.getElementById('btnRechazarTodo').innerHTML = '<i class="fas fa-times-circle"></i> RECHAZAR TODO';
    
    // Refrescar detalle desde backend para reflejar estados definitivos
    await cargarDetalleRecepcion(consecutivo);

    // Ofrecer descarga inmediata del Excel
    if (window.modalExportRecepcion) {
      const btnDescargar = document.getElementById('btnDescargarExcelRecepcion');
      if (btnDescargar) {
        btnDescargar.onclick = () => {
          exportarReporteExcel(consecutivo);
          window.modalExportRecepcion.hide();
        };
      }
      window.modalExportRecepcion.show();
    }
  } catch (error) {
    console.error('Error guardando recepción:', error);
    mostrarNotificacion('Error al guardar la recepción', 'error');
  }
}

function formatearCentro(codigo) {
  if (!codigo) return '';
  const centro = centrosCosto.find(c => String(c.codigo) === String(codigo));
  return centro ? `${centro.codigo} - ${centro.nombre}` : codigo;
}

function soloFecha(valor) {
  if (!valor) return '';
  return String(valor).slice(0, 10);
}

// Aplicar lógica de exclusión entre origen y destino
function aplicarExclusion() {
  const selectOrigen = document.getElementById('centroOrigen');
  const selectDestino = document.getElementById('centroDestino');
  
  const origenSeleccionado = selectOrigen.value;
  const destinoSeleccionado = selectDestino.value;
  
  // Habilitar TODAS las opciones primero (incluyendo la opción vacía)
  for (let i = 0; i < selectOrigen.options.length; i++) {
    selectOrigen.options[i].disabled = false;
  }
  for (let i = 0; i < selectDestino.options.length; i++) {
    selectDestino.options[i].disabled = false;
  }
  
  // Solo deshabilitar si hay algo seleccionado
  // Deshabilitar origen seleccionado en destino
  if (origenSeleccionado && origenSeleccionado !== '') {
    for (let i = 0; i < selectDestino.options.length; i++) {
      if (selectDestino.options[i].value === origenSeleccionado) {
        selectDestino.options[i].disabled = true;
        // Si estaba seleccionado, deseleccionar
        if (selectDestino.value === origenSeleccionado) {
          selectDestino.value = '';
        }
      }
    }
  }
  
  // Deshabilitar destino seleccionado en origen
  if (destinoSeleccionado && destinoSeleccionado !== '') {
    for (let i = 0; i < selectOrigen.options.length; i++) {
      if (selectOrigen.options[i].value === destinoSeleccionado) {
        selectOrigen.options[i].disabled = true;
        // Si estaba seleccionado, deseleccionar
        if (selectOrigen.value === destinoSeleccionado) {
          selectOrigen.value = '';
        }
      }
    }
  }

  // Actualizar botón agregar según selección
  actualizarEstadoBotonAdd();
}

function actualizarEstadoBotonAdd() {
  const btnAdd = document.querySelector('.btn-add');
  const btnSave = document.querySelector('.btn-save');
  const origen = document.getElementById('centroOrigen').value;
  const destino = document.getElementById('centroDestino').value;
  const habilitarAdd = origen && destino;
  const habilitarSave = habilitarAdd && historiasAgregadas.length > 0;
  
  btnAdd.disabled = !habilitarAdd;
  btnSave.disabled = !habilitarSave;
  btnAdd.style.opacity = habilitarAdd ? '1' : '0.5';
  btnSave.style.opacity = habilitarSave ? '1' : '0.5';
}

function abrirModalHistoria() {
  document.getElementById('modal_historia').value = '';
  document.getElementById('modal_ingreso').value = '';
  document.getElementById('modal_tipoId').value = '';
  document.getElementById('modal_identificacion').value = '';
  document.getElementById('modal_nombre').value = '';
  document.getElementById('modal_fechaIngreso').value = '';
  document.getElementById('modal_fechaEgreso').value = '';
  document.getElementById('btnAceptarModal').disabled = true;
  modalHistoria.show();
}

async function buscarHistoriaModal() {
  const historia = document.getElementById('modal_historia').value.trim();
  const ingreso = document.getElementById('modal_ingreso').value.trim() || '1';
  
  if (!historia) {
    mostrarNotificacion('Debe ingresar una historia para buscar', 'warning');
    return;
  }
  
  try {
    const response = await fetch('/archivo/buscar-historia', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ historia, ingreso })
    });
    
    const data = await response.json();
    
    if (data.success) {
      document.getElementById('modal_tipoId').value = data.tipo_id || '';
      document.getElementById('modal_identificacion').value = data.identificacion || '';
      document.getElementById('modal_nombre').value = data.nombre || '';
      document.getElementById('modal_ingreso').value = data.ingreso || ingreso;
      document.getElementById('modal_fechaIngreso').value = data.fecha_ingreso || '';
      document.getElementById('modal_fechaEgreso').value = data.fecha_egreso || '';
      document.getElementById('btnAceptarModal').disabled = false;
      
      // Habilitar botón principal agregar
      const btnAdd = document.querySelector('.btn-add');
      btnAdd.disabled = false;
      btnAdd.style.opacity = '1';
    } else {
      mostrarNotificacion(data.error || 'Historia no encontrada', 'error');
      document.getElementById('btnAceptarModal').disabled = true;
    }
  } catch (error) {
    console.error('Error buscando historia:', error);
    mostrarNotificacion('Error al buscar la historia', 'error');
    document.getElementById('btnAceptarModal').disabled = true;
  }
}

function agregarHistoriaDesdeModal() {
  const historia = document.getElementById('modal_historia').value.trim();
  const tipoId = document.getElementById('modal_tipoId').value;
  const identificacion = document.getElementById('modal_identificacion').value;
  const nombre = document.getElementById('modal_nombre').value;
  const ingreso = document.getElementById('modal_ingreso').value || '1';
  const fechaIngreso = document.getElementById('modal_fechaIngreso').value;
  const fechaEgreso = document.getElementById('modal_fechaEgreso').value;
  const centroOrigen = document.getElementById('centroOrigen');
  const centroDestino = document.getElementById('centroDestino');
  
  if (!historia || !identificacion || !nombre) {
    mostrarNotificacion('Debe buscar y cargar una historia válida antes de agregar', 'warning');
    return;
  }
  if (!centroOrigen.value || !centroDestino.value) {
    mostrarNotificacion('Debe seleccionar centro de origen y destino', 'warning');
    return;
  }
  if (historiasAgregadas.find(h => h.historia === historia && h.ingreso === ingreso)) {
    mostrarNotificacion('Esta historia ya fue agregada al traslado', 'warning');
    return;
  }
  const historiaObj = {
    consecutivo: historiasAgregadas.length + 1,
    historia,
    tipoId,
    identificacion,
    nombre,
    ingreso,
    fechaIngreso,
    fechaEgreso,
    centroOrigen: centroOrigen.value,
    centroOrigenNombre: centroOrigen.options[centroOrigen.selectedIndex].text,
    centroDestino: centroDestino.value,
    centroDestinoNombre: centroDestino.options[centroDestino.selectedIndex].text
  };
  historiasAgregadas.push(historiaObj);
  actualizarTabla();
  actualizarEstadoBotonAdd();
  document.getElementById('numRegistros').value = historiasAgregadas.length;
  document.getElementById('btnAceptarModal').disabled = true;
  modalHistoria.hide();
}

// Compat: mantener nombre usado por botón principal
function agregarHistoria() {
  abrirModalHistoria();
}

// Actualizar tabla de historias
function actualizarTabla() {
  const tbody = document.getElementById('tbody-historias');
  tbody.innerHTML = '';
  
  historiasAgregadas.forEach((historia, index) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${historia.consecutivo}</td>
      <td>${historia.historia}</td>
      <td>${historia.tipoId}</td>
      <td>${historia.identificacion}</td>
      <td>${historia.nombre}</td>
      <td>${historia.ingreso}</td>
      <td>${historia.fechaIngreso}</td>
      <td>${historia.fechaEgreso}</td>
      <td>${historia.centroOrigenNombre}</td>
      <td>${historia.centroDestinoNombre}</td>
      <td>
        <button class="btn-delete" onclick="eliminarHistoria(${index})">
          <i class="fas fa-trash"></i>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Eliminar historia del grid
function eliminarHistoria(index) {
  if (confirm('¿Está seguro de eliminar esta historia del traslado?')) {
    historiasAgregadas.splice(index, 1);
    
    // Renumerar consecutivos
    historiasAgregadas.forEach((h, i) => {
      h.consecutivo = i + 1;
    });
    
    actualizarTabla();
    actualizarEstadoBotonAdd();
    document.getElementById('numRegistros').value = historiasAgregadas.length;
  }
}

// Guardar traslado completo
function guardarTraslado() {
  if (historiasAgregadas.length === 0) {
    mostrarNotificacion('Debe agregar al menos una historia para guardar el traslado', 'warning');
    return;
  }
  
  const fecha = document.getElementById('fecha').value;
  const centroOrigen = document.getElementById('centroOrigen').value;
  const centroDestino = document.getElementById('centroDestino').value;
  
  if (!fecha || !centroOrigen || !centroDestino) {
    mostrarNotificacion('Complete todos los campos del encabezado', 'warning');
    return;
  }
  
  // Mostrar modal de confirmación
  document.getElementById('cantidadHistorias').textContent = historiasAgregadas.length;
  window.modalConfirmacionTraslado.show();
}

// Ejecutar guardado después de confirmación
async function ejecutarGuardadoTraslado() {
  // Deshabilitar el botón de confirmación inmediatamente
  const btnConfirmar = document.getElementById('btnConfirmarGuardado');
  btnConfirmar.disabled = true;
  btnConfirmar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando...';
  
  const fecha = document.getElementById('fecha').value;
  const centroOrigen = document.getElementById('centroOrigen').value;
  const centroDestino = document.getElementById('centroDestino').value;
  
  const datosTraslado = {
    fecha,
    centroOrigen,
    centroDestino,
    numRegistros: historiasAgregadas.length,
    historias: historiasAgregadas
  };
  
  try {
    const response = await fetch('/archivo/guardar-traslado', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datosTraslado)
    });
    
    // Si hay error HTTP, capturar el mensaje de error
    if (!response.ok) {
      const data = await response.json();
      mostrarNotificacion(data.error || 'Error al guardar el traslado', 'error');
      
      // Rehabilitar botón de confirmación
      btnConfirmar.disabled = false;
      btnConfirmar.innerHTML = '<i class="fas fa-check"></i> Continuar';
      return;
    }
    
    const data = await response.json();
    
    // Cerrar modal de confirmación
    window.modalConfirmacionTraslado.hide();
    
    if (data.success) {
      mostrarNotificacion(`Traslado guardado exitosamente. Consecutivo: ${data.consecutivo} - Registros: ${data.registros}`, 'success');
      
      // Limpiar formulario
      historiasAgregadas = [];
      actualizarTabla();
      document.getElementById('form-traslado').reset();
      document.getElementById('fecha').value = new Date().toISOString().split('T')[0];
      document.getElementById('numRegistros').value = '0';
      
      // Resetear y habilitar los selectores de centro de costo
      const selectOrigen = document.getElementById('centroOrigen');
      const selectDestino = document.getElementById('centroDestino');
      selectOrigen.value = '';
      selectDestino.value = '';
      selectOrigen.disabled = false;
      selectDestino.disabled = false;
      
      // Habilitar todas las opciones en los selectores
      for (let i = 0; i < selectOrigen.options.length; i++) {
        selectOrigen.options[i].disabled = false;
      }
      for (let i = 0; i < selectDestino.options.length; i++) {
        selectDestino.options[i].disabled = false;
      }
      
      // Actualizar estado de botones
      actualizarEstadoBotonAdd();
    } else {
      mostrarNotificacion(data.error || 'Error desconocido al guardar', 'error');
    }
    
    // Rehabilitar botón de confirmación para futuras operaciones
    btnConfirmar.disabled = false;
    btnConfirmar.innerHTML = '<i class="fas fa-check"></i> Continuar';
    
  } catch (error) {
    console.error('Error guardando traslado:', error);
    mostrarNotificacion('Error al guardar el traslado: ' + error.message, 'error');
    
    // Cerrar modal y rehabilitar botón
    window.modalConfirmacionTraslado.hide();
    btnConfirmar.disabled = false;
    btnConfirmar.innerHTML = '<i class="fas fa-check"></i> Continuar';
  }
}

// Búsqueda de reportes de traslados recepcionados
async function buscarReportes() {
  const fecha_inicio = document.getElementById('rep_fechaInicio').value;
  const fecha_fin = document.getElementById('rep_fechaFin').value;
  const estado = document.getElementById('rep_estado').value;
  const consecutivo = document.getElementById('rep_consecutivo').value.trim();

  if (!fecha_inicio || !fecha_fin) {
    mostrarNotificacion('Debe seleccionar las dos fechas', 'warning');
    return;
  }

  if (new Date(fecha_inicio) > new Date(fecha_fin)) {
    mostrarNotificacion('La fecha inicial no puede ser mayor que la fecha final', 'warning');
    return;
  }

  try {
    const response = await fetch('/archivo/reportes/buscar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        fecha_inicio, 
        fecha_fin,
        estado: estado || null,
        consecutivo: consecutivo || null
      })
    });

    const data = await response.json();
    if (!data.success) {
      mostrarNotificacion(data.error || 'No se encontraron registros', 'warning');
      document.getElementById('tbody-reportes').innerHTML = `
        <tr>
          <td colspan="8" style="text-align: center; padding: 2rem; color: #6c757d;">
            <i class="fas fa-search" style="font-size: 2rem; opacity: 0.3; display: block; margin-bottom: 0.5rem;"></i>
            No se encontraron traslados que coincidan con los criterios
          </td>
        </tr>
      `;
      return;
    }

    renderizarReportes(data.traslados);
  } catch (error) {
    console.error('Error buscando reportes:', error);
    mostrarNotificacion('Error al buscar reportes', 'error');
  }
}

function renderizarReportes(traslados) {
  const tbody = document.getElementById('tbody-reportes');
  tbody.innerHTML = '';

  if (!traslados || !traslados.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 2rem; color: #6c757d;">
          <i class="fas fa-search" style="font-size: 2rem; opacity: 0.3; display: block; margin-bottom: 0.5rem;"></i>
          No se encontraron resultados
        </td>
      </tr>
    `;
    return;
  }

  traslados.forEach((item, index) => {
    const tr = document.createElement('tr');
    
    // Determinar el badge del estado
    let estadoBadge = '';
    const estado = item.estado || 'N';
    
    if (estado === 'A') {
      estadoBadge = '<span class="estado-badge estado-aceptada"><i class="fas fa-check-circle"></i> ACEPTADA</span>';
    } else if (estado === 'R') {
      estadoBadge = '<span class="estado-badge estado-rechazada"><i class="fas fa-times-circle"></i> RECHAZADA</span>';
    }
    
    // Botones de acciones
    let btnExportar = '';
    if (estado === 'A') {
      btnExportar = `<button class="btn btn-sm btn-outline-success" onclick="exportarReporteExcel('${item.consecutivo}')" title="Exportar a Excel"><i class="fas fa-file-excel"></i></button>`;
    }
    const btnVerDetalle = `<button class="btn btn-sm btn-outline-primary" onclick="verDetalleTraslado('${item.consecutivo}')" title="Ver Detalle"><i class="fas fa-eye"></i></button>`;
    
    tr.innerHTML = `
      <td>${index + 1}</td>
      <td><strong>${item.consecutivo}</strong></td>
      <td>${item.fecha || ''}</td>
      <td>${formatearCentro(item.origen)}</td>
      <td>${formatearCentro(item.destino)}</td>
      <td style="text-align: center; font-weight: 600;">${item.cantidad || 0}</td>
      <td style="text-align: center;">${estadoBadge}</td>
      <td style="text-align: center;">${btnVerDetalle} ${btnExportar}</td>
    `;
    
    tbody.appendChild(tr);
  });
}

async function exportarReporteExcel(consecutivo) {
  try {
    // Obtener el detalle del traslado
    const response = await fetch(`/archivo/detalle/${consecutivo}`);
    
    if (!response.ok) {
      mostrarNotificacion('Error al obtener el detalle del traslado', 'error');
      return;
    }
    
    const data = await response.json();
    
    if (!data.success) {
      mostrarNotificacion(data.error || 'No se encontró el traslado', 'error');
      return;
    }
    
    const traslado = data.traslado;
    const detalles = data.detalles || [];
    
    // Filtrar solo los ACEPTADOS
    const detallesAceptados = detalles.filter(d => d.estado === 'A');
    
    // Crear un nuevo workbook
    const wb = XLSX.utils.book_new();
    
    // Datos del encabezado comenzando en columna B (índice 1)
    const encabezadoData = [
      ['', 'Traslado No.', consecutivo],
      ['', 'Centro de Costo Origen', traslado.centroOrigen || ''],
      ['', 'Centro de Costo Destino', traslado.centroDestino || ''],
      ['', 'Estado del Traslado', traslado.estado === 'A' ? 'ACEPTADO' : 'RECHAZADO'],
      ['', 'Creado por', traslado.usuario || 'SISTEMA'],
      ['', 'Fecha creación', traslado.fechaCreacion || ''],
      ['', 'Fecha Traslado', traslado.fecha || ''],
      [] // Fila vacía
    ];
    
    // Headers del detalle
    const detalleHeaders = [
      '#',
      'Historia',
      'Ingreso',
      'Tipo ID',
      'Identificación',
      'Nombre',
      'Fecha Ingreso',
      'Fecha Egreso',
      'Estado'
    ];
    
    // Datos del detalle (con numeración reorganizada)
    const detalleData = detallesAceptados.map((item, index) => [
      index + 1, // Numeración solo para aceptados
      item.historia || '',
      item.ingreso || '',
      item.tipoId || '',
      item.identificacion || '',
      item.nombre || '',
      item.fechaIngreso || '',
      item.fechaEgreso || '',
      'ACEPTADO'
    ]);
    
    // Combinar todo
    const wsData = [
      ...encabezadoData,
      detalleHeaders,
      ...detalleData
    ];
    
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    
    // Calcular el ancho máximo de cada columna basado en el contenido
    const colWidths = detalleHeaders.map((header, colIndex) => {
      let maxWidth = header.length;
      
      // Verificar el ancho de todos los datos en esa columna
      detalleData.forEach(row => {
        const cellValue = String(row[colIndex] || '');
        maxWidth = Math.max(maxWidth, cellValue.length);
      });
      
      // Agregar un pequeño margen (1.5 caracteres)
      return { wch: maxWidth + 1.5 };
    });
    
    // Columna A pequeña para el #
    colWidths[0] = { wch: 4 };
    
    // Configurar anchos de columna
    ws['!cols'] = [
      { wch: 5 },   // Columna A (pequeña para #)
      ...colWidths
    ];
    
    // Aplicar estilos
    const range = XLSX.utils.decode_range(ws['!ref']);
    
    // Hacer negrita las etiquetas del encabezado (columna B, filas 1-7)
    for (let row = 0; row < 7; row++) {
      const cellAddress = XLSX.utils.encode_cell({ r: row, c: 1 });
      if (ws[cellAddress]) {
        ws[cellAddress].s = {
          font: { bold: true }
        };
      }
    }
    
    // Hacer negrita y centrar los headers de la tabla con fondo gris (fila 8)
    for (let col = 0; col < detalleHeaders.length; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: 8, c: col });
      if (ws[cellAddress]) {
        ws[cellAddress].s = {
          font: { bold: true },
          fill: { fgColor: { rgb: "D3D3D3" } },
          alignment: { horizontal: 'center', vertical: 'center' },
          border: {
            top: { style: 'thin', color: { rgb: '000000' } },
            bottom: { style: 'thin', color: { rgb: '000000' } },
            left: { style: 'thin', color: { rgb: '000000' } },
            right: { style: 'thin', color: { rgb: '000000' } }
          }
        };
      }
    }
    
    // Centrar todos los datos del detalle (desde fila 9 en adelante)
    for (let row = 9; row < 9 + detallesAceptados.length; row++) {
      for (let col = 0; col < detalleHeaders.length; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
        if (ws[cellAddress]) {
          ws[cellAddress].s = {
            alignment: { horizontal: 'center', vertical: 'center' },
            border: {
              top: { style: 'thin', color: { rgb: '000000' } },
              bottom: { style: 'thin', color: { rgb: '000000' } },
              left: { style: 'thin', color: { rgb: '000000' } },
              right: { style: 'thin', color: { rgb: '000000' } }
            }
          };
        }
      }
    }
    
    XLSX.utils.book_append_sheet(wb, ws, 'Reporte');
    
    // Descargar el archivo
    const fileName = `Reporte_${consecutivo}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, fileName);
    
    mostrarNotificacion(`Reporte exportado: ${fileName}`, 'success');
  } catch (error) {
    console.error('Error exportando a Excel:', error);
    mostrarNotificacion('Error al exportar el reporte', 'error');
  }
}

function limpiarReportes() {
  document.getElementById('rep_consecutivo').value = '';
  document.getElementById('rep_estado').value = '';
  document.getElementById('tbody-reportes').innerHTML = `
    <tr>
      <td colspan="8" style="text-align: center; padding: 3rem; color: #6c757d;">
        <i class="fas fa-chart-bar" style="font-size: 3rem; opacity: 0.3; display: block; margin-bottom: 1rem;"></i>
        Ingrese criterios de búsqueda y presione BUSCAR
      </td>
    </tr>
  `;
}

// Ver detalle del traslado en modal
async function verDetalleTraslado(consecutivo) {
  try {
    const response = await fetch(`/archivo/detalle/${consecutivo}`);
    
    if (!response.ok) {
      mostrarNotificacion('Error al obtener el detalle del traslado', 'error');
      return;
    }
    
    const data = await response.json();
    
    if (!data.success) {
      mostrarNotificacion(data.error || 'No se encontró el traslado', 'error');
      return;
    }
    
    const traslado = data.traslado;
    const detalles = data.detalles || [];
    
    // Llenar datos del encabezado
    document.getElementById('det_consecutivo').textContent = consecutivo;
    document.getElementById('det_fecha').textContent = traslado.fecha || '';
    document.getElementById('det_origen').textContent = traslado.centroOrigen || '';
    document.getElementById('det_destino').textContent = traslado.centroDestino || '';
    
    // Estado badge
    let estadoBadge = '';
    if (traslado.estado === 'A') {
      estadoBadge = '<span class="estado-badge estado-aceptada"><i class="fas fa-check-circle"></i> ACEPTADA</span>';
    } else if (traslado.estado === 'R') {
      estadoBadge = '<span class="estado-badge estado-rechazada"><i class="fas fa-times-circle"></i> RECHAZADA</span>';
    }
    document.getElementById('det_estado').innerHTML = estadoBadge;
    
    // Renderizar tabla de detalles
    const tbody = document.getElementById('tbody-detalle-modal');
    tbody.innerHTML = '';
    
    if (!detalles || detalles.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="9" style="text-align: center; padding: 2rem; color: #6c757d;">
            No hay expedientes en este traslado
          </td>
        </tr>
      `;
    } else {
      detalles.forEach((item, index) => {
        const estadoDetalle = item.estado || 'N';
        let estadoBadgeDetalle = '';
        
        if (estadoDetalle === 'A') {
          estadoBadgeDetalle = '<span class="estado-badge estado-aceptada"><i class="fas fa-check-circle"></i> ACEPTADA</span>';
        } else if (estadoDetalle === 'R') {
          estadoBadgeDetalle = '<span class="estado-badge estado-rechazada"><i class="fas fa-times-circle"></i> RECHAZADA</span>';
        } else {
          estadoBadgeDetalle = '<span class="estado-badge estado-pendiente"><i class="fas fa-clock"></i> PENDIENTE</span>';
        }
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td style="text-align: center;">${index + 1}</td>
          <td style="text-align: center;"><strong>${item.historia || ''}</strong></td>
          <td style="text-align: center;">${item.ingreso || ''}</td>
          <td style="text-align: center;">${item.tipoId || ''}</td>
          <td style="text-align: center;">${item.identificacion || ''}</td>
          <td>${item.nombre || ''}</td>
          <td style="text-align: center;">${item.fechaIngreso || ''}</td>
          <td style="text-align: center;">${item.fechaEgreso || ''}</td>
          <td style="text-align: center;">${estadoBadgeDetalle}</td>
        `;
        tbody.appendChild(tr);
      });
    }
    
    // Mostrar el modal
    const modalDetalleTraslado = new bootstrap.Modal(document.getElementById('modalDetalleTraslado'));
    modalDetalleTraslado.show();
    
  } catch (error) {
    console.error('Error obteniendo detalle del traslado:', error);
    mostrarNotificacion('Error al obtener el detalle', 'error');
  }
}
