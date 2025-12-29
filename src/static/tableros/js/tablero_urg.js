/* src/static/tableros/js/tablero_urg.js */

import { fetchIndicadoresUrg, startAutoRefreshIndicadoresUrg, stopAutoRefreshIndicadoresUrg, actualizarIndicadoresUrg } from './indicadores_urg.js';

document.addEventListener('DOMContentLoaded', () => {

  function normalizeColor(value) {
    if (!value) return '#6c757d';
    const v = String(value).trim();
    if (v.startsWith('#')) return v;
    if (v.startsWith('rgb')) return v;
    if (/^\d{1,3},\s*\d{1,3},\s*\d{1,3}$/.test(v)) return `rgb(${v})`;
    return v;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  const botonesUbicacion = document.querySelectorAll('.ubicacion-btn');
  const contenedor = document.getElementById('contenedor-tarjetas');
  const prevBtn = document.getElementById('prevPage');
  const nextBtn = document.getElementById('nextPage');
  const pageIndicator = document.getElementById('pageIndicator');
  
  const modal = document.getElementById('resumenModal');
  const contenidoResumen = document.getElementById('contenidoResumen');
  const cerrarModalBtn = document.getElementById('cerrarModal');
  const modalLoading = document.getElementById('modal-loading');

  let refreshInterval = null;
  let pageInterval = null;
  let refreshTimeout = null;
  let pageTimeout = null;
  window.modalOpen = false;
  let currentAbortController = null;

  let updateTimeInterval = null;
  let updateTimeTimeout = null;

  let items = [];
  let currentPage = 1;
  const PERPAGE = 8;

  function stopIntervals() {
    if (refreshInterval) clearInterval(refreshInterval);
    if (pageInterval) clearInterval(pageInterval);
    if (refreshTimeout) clearTimeout(refreshTimeout);
    if (pageTimeout) clearTimeout(pageTimeout);
    refreshInterval = null;
    pageInterval = null;
    refreshTimeout = null;
    pageTimeout = null;
  }

  function startIntervals() {
    stopIntervals();
    const botonesActivos = document.querySelectorAll('.ubicacion-btn.activo');
    const ubicods = Array.from(botonesActivos).map(b => b.dataset.tipo);
    if (!window.modalOpen && ubicods.length > 0) {
      fetchDatos(ubicods);
      const ahora = new Date();
      const msHastaProximoMinuto = (60 - ahora.getSeconds()) * 1000 - ahora.getMilliseconds();
      refreshTimeout = setTimeout(() => {
        const botonesNow = document.querySelectorAll('.ubicacion-btn.activo');
        const selectedNow = Array.from(botonesNow).map(b => b.dataset.tipo);
        fetchDatos(selectedNow);
        refreshInterval = setInterval(() => {
          if (!window.modalOpen) {
            const botonesCurrent = document.querySelectorAll('.ubicacion-btn.activo');
            const selected = Array.from(botonesCurrent).map(b => b.dataset.tipo);
            fetchDatos(selected);
          }
        }, 60000);
      }, msHastaProximoMinuto);
    }
    resetPageTimer();
  }

  function actualizarUltimaHora() {
    const ahora = new Date();
    ahora.setSeconds(0, 0);
    const diasSemana = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
    const meses = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
    const diaSemana = diasSemana[ahora.getDay()];
    const dia = ahora.getDate();
    const mes = meses[ahora.getMonth()];
    let horas = ahora.getHours();
    const minutos = ahora.getMinutes().toString().padStart(2, "0");
    const ampm = horas >= 12 ? "pm" : "am";
    horas = horas % 12;
    horas = horas ? horas : 12;
    const horaFormateada = `${horas}:${minutos} ${ampm}`;
    const fechaFormateada = `${diaSemana}, ${dia} ${mes} ${horaFormateada}`;
    const span = document.getElementById("ultima-actualizacion");
    if (span) {
      const botonesActivos = document.querySelectorAll('.ubicacion-btn.activo');
      const haySeleccion = botonesActivos.length > 0;
      span.textContent = haySeleccion ? `Última actualización: ${fechaFormateada}` : "Última actualización: --";
    }
  }

  function startUpdateTimeTicker() {
    if (updateTimeInterval) clearInterval(updateTimeInterval);
    if (updateTimeTimeout) clearTimeout(updateTimeTimeout);
    actualizarUltimaHora();
    const ahora = new Date();
    const msHastaMinuto = (60 - ahora.getSeconds()) * 1000 - ahora.getMilliseconds();
    updateTimeTimeout = setTimeout(() => {
      actualizarUltimaHora();
      updateTimeInterval = setInterval(actualizarUltimaHora, 60000);
    }, msHastaMinuto);
  }

  function stopUpdateTimeTicker() {
    if (updateTimeInterval) clearInterval(updateTimeInterval);
    if (updateTimeTimeout) clearTimeout(updateTimeTimeout);
    updateTimeInterval = null;
    updateTimeTimeout = null;
  }

  function resetPageTimer() {
    if (pageInterval) clearInterval(pageInterval);
    if (pageTimeout) clearTimeout(pageTimeout);
    pageInterval = null;
    pageTimeout = null;
    const total = totalPages();
    if (total <= 1) return;
    pageTimeout = setTimeout(() => {
      if (!window.modalOpen && items.length > 0) {
        nextPage(false);
      }
      pageInterval = setInterval(() => {
        if (!window.modalOpen && items.length > 0) nextPage(false);
      }, 18000);
    }, 18000);
  }

  function buildCard(item) {
    const escide = item.escide ?? "";
    const esceda = item.esceda ?? "";
    const escpac = item.escpac ?? "";
    const eschab = item.eschab ?? "";
    const diaest = item.diaest ?? "";
    const diaesg = item.diaesg ?? "";
    
    const graceTexto = item.esgint || item.escgra || 'Sin Dato';
    const graceColor = normalizeColor(item.esgrgb || '#cccccc');
    const curbTexto = item.escint || item.esccur || '-';
    const curbColor = normalizeColor(item.escrgb || '#cccccc');
    const caidaTexto = item.esrint || item.escrie || '-';
    const caidaColor = normalizeColor(item.esrrgb || '#cccccc');
    const nihssTexto = item.esnint || item.escnih || '-';
    const nihssColor = normalizeColor(item.esnrgb || '#cccccc');
    
    const roomClasses = ["room-info"];
    if (Number(item.ordais) === 1) roomClasses.push("aislado");

    return `
    <div class="hos-card" data-escide="${escapeHtml(escide)}">
      <div class="card-header">
        <div class="patient-info">
          <div class="patient-id">
            ID: ${escapeHtml(escide)}
            ${esceda ? `&nbsp;&nbsp;<span class="patient-age">(${escapeHtml(esceda)} AÑOS)</span>` : ""}
          </div>
          <div class="patient-name">${escapeHtml(escpac)}</div>
          <div style="font-size:11px; color:#666;">Gral: ${diaesg}</div>
        </div>

        <div class="${roomClasses.join(" ")}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
            <circle cx="12" cy="10" r="3"></circle>
          </svg>
          ${escapeHtml(eschab)}
        </div>
      </div>

      <div class="risks-container">
        <div class="risk-item" style="border-left-color: ${graceColor}">
          <span class="risk-label">GRACE</span>
          <div class="risk-value">
            <span class="risk-text">${graceTexto}</span>
            <div class="risk-indicator" style="background:${graceColor};"></div>
          </div>
        </div>
        <div class="risk-item" style="border-left-color: ${curbColor}">
          <span class="risk-label">CURB-65</span>
          <div class="risk-value">
            <span class="risk-text">${curbTexto}</span>
            <div class="risk-indicator" style="background:${curbColor};"></div>
          </div>
        </div>
        <div class="risk-item" style="border-left-color: ${caidaColor}">
          <span class="risk-label">CAÍDA</span>
          <div class="risk-value">
            <span class="risk-text">${caidaTexto}</span>
            <div class="risk-indicator" style="background:${caidaColor};"></div>
          </div>
        </div>
        <div class="risk-item" style="border-left-color: ${nihssColor}">
          <span class="risk-label">NIHSS</span>
          <div class="risk-value">
            <span class="risk-text">${nihssTexto}</span>
            <div class="risk-indicator" style="background:${nihssColor};"></div>
          </div>
        </div>
      </div>

      <div class="stay-info"></div>
    </div>
    `;
  }

  function totalPages() {
    return Math.max(1, Math.ceil(items.length / PERPAGE));
  }

  function updatePager(page, total) {
    pageIndicator.textContent = total === 0 ? "Página 0 de 0" : `Página ${page} de ${total}`;
    prevBtn.disabled = total === 0 || page <= 1;
    nextBtn.disabled = total === 0 || page >= total;
  }

  function renderPage(animate = true) {
    const total = totalPages();
    if (!items.length) {
      contenedor.innerHTML = `<div class="hos-state hos-empty">Sin pacientes para la ubicación seleccionada.</div>`;
      updatePager(0, 0);
      return;
    }
    if (currentPage < 1) currentPage = 1;
    if (currentPage > total) currentPage = total;
    const start = (currentPage - 1) * PERPAGE;
    const end = start + PERPAGE;
    const slice = items.slice(start, end);
    const fragment = document.createDocumentFragment();
    const wrapper = document.createElement("div");
    wrapper.innerHTML = slice.map(buildCard).join("");
    Array.from(wrapper.children).forEach(child => fragment.appendChild(child));
    if (animate) {
      contenedor.classList.add("fade-out");
      setTimeout(() => {
        contenedor.innerHTML = "";
        contenedor.appendChild(fragment);
        contenedor.classList.remove("fade-out");
        contenedor.classList.add("fade-in");
        updatePager(currentPage, total);
      }, 200);
    } else {
      contenedor.innerHTML = "";
      contenedor.appendChild(fragment);
      updatePager(currentPage, total);
    }
  }

  function nextPage(manual = true) {
    if (currentPage < totalPages()) currentPage++;
    else currentPage = 1;
    renderPage(true);
    if (manual) resetPageTimer();
  }

  function prevPageFn(manual = true) {
    if (currentPage > 1) currentPage--;
    else currentPage = totalPages();
    renderPage(true);
    if (manual) resetPageTimer();
  }

  async function fetchDatos(ubicods) {
    contenedor.innerHTML = `<div class="hos-state hos-loading"><div class="loading-spinner"></div><div>Cargando pacientes...</div></div>`;
    updatePager(0, 0);
    try {
      const resp = await fetch("/tableros/urgencias/datos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ubicod: ubicods })
      });
      const data = await resp.json();
      const raw = Array.isArray(data?.pacientes_en_cama) ? data.pacientes_en_cama
                 : Array.isArray(data?.datos) ? data.datos : [];
      items = raw.map(obj => {
        const norm = {};
        for (let k in obj) norm[k.toLowerCase()] = obj[k];
        return norm;
      });
      currentPage = 1;
      renderPage(false);
      fetchIndicadoresUrg(ubicods);
      actualizarUltimaHora();
    } catch (err) {
      console.error("❌ Error en fetchDatos:", err);
      contenedor.innerHTML = `<div class="hos-state hos-error">Error al cargar pacientes</div>`;
      updatePager(0, 0);
    }
  }

  // Listener para botones de ubicación (toggle)
  botonesUbicacion.forEach(btn => {
    btn.addEventListener('click', () => {
      // Toggle estado activo
      btn.classList.toggle('activo');
      
      // Cambiar estilo
      if (btn.classList.contains('activo')) {
        btn.style.background = '#3b82f6';
        btn.style.borderColor = '#2563eb';
        btn.style.color = 'white';
      } else {
        btn.style.background = 'white';
        btn.style.borderColor = '#d1d5db';
        btn.style.color = '#6b7280';
      }
      
      // Obtener ubicaciones seleccionadas
      const botonesActivos = document.querySelectorAll('.ubicacion-btn.activo');
      const ubicods = Array.from(botonesActivos).map(b => b.dataset.tipo);
      
      items = [];
      currentPage = 1;
      
      if (ubicods.length === 0) {
        contenedor.innerHTML = `<div class="hos-state hos-empty">Seleccione una o más ubicaciones para consultar.</div>`;
        updatePager(0, 0);
        stopIntervals();
        stopUpdateTimeTicker();
        stopAutoRefreshIndicadoresUrg();
        actualizarIndicadoresUrg(null);
        actualizarUltimaHora();
        return;
      }
      
      fetchDatos(ubicods).then(() => {
        startIntervals();
        startUpdateTimeTicker();
        startAutoRefreshIndicadoresUrg(ubicods);
      });
    });
  });

  prevBtn.addEventListener("click", () => prevPageFn(true));
  nextBtn.addEventListener("click", () => nextPage(true));

  contenedor.addEventListener("click", async (e) => {
    const card = e.target.closest(".hos-card");
    if (!card) return;
    const escide = card.dataset.escide;
    window.modalOpen = true;
    stopIntervals();
    modal.classList.remove("hidden");
    contenidoResumen.innerHTML = "";
    const loadingDiv = document.getElementById("modal-loading");
    if (loadingDiv) loadingDiv.classList.remove("hidden");
    if (currentAbortController) currentAbortController.abort();
    currentAbortController = new AbortController();
    try {
      const resp = await fetch("/tableros/urgencias/riesgos-necesidades-detalle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ escide }),
        signal: currentAbortController.signal,
      });
      const data = await resp.json();
      if (loadingDiv) loadingDiv.classList.add("hidden");
      if (data.error) {
        contenidoResumen.innerHTML = `<div class="p-4 text-red-600 font-semibold">⚠️ ${data.error}</div>`;
      } else {
        contenidoResumen.innerHTML = `
          <div class="space-y-4">
            <div class="grid grid-cols-2 gap-4 bg-gray-50 p-4 rounded-lg shadow-sm">
              <p><span class="font-semibold">Identificación:</span> ${escapeHtml(data.escide)}</p>
              <p><span class="font-semibold">Nombre:</span> ${escapeHtml(data.nombre)}</p>
              <p><span class="font-semibold">Habitación:</span> ${escapeHtml(data.habitacion)}</p>
              <p><span class="font-semibold">Diagnóstico:</span> ${escapeHtml(data.diagnostico)}</p>
            </div>
            <div class="p-4 bg-white border rounded-lg shadow">
              <h3 class="text-lg font-semibold mb-2">📋 Riesgos y Necesidades del Paciente</h3>
              <p class="text-gray-700 whitespace-pre-line">${escapeHtml(data.resumen_ia || "Sin información disponible.")}</p>
            </div>
          </div>
        `;
      }
    } catch (err) {
      if (err.name === "AbortError") {
        console.log("Carga de resumen cancelada");
        return;
      }
      console.error("Error al generar resumen:", err);
      if (loadingDiv) loadingDiv.classList.add("hidden");
      contenidoResumen.innerHTML = `<div class="p-4 text-red-600 font-semibold">⚠️ Error al cargar análisis</div>`;
    }
  });

  cerrarModalBtn.addEventListener("click", () => {
    modal.classList.add("hidden");
    window.modalOpen = false;
    if (currentAbortController) {
      currentAbortController.abort();
      currentAbortController = null;
    }
    startIntervals();
  });

  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      modal.classList.add("hidden");
      window.modalOpen = false;
      if (currentAbortController) {
        currentAbortController.abort();
        currentAbortController = null;
      }
      startIntervals();
    }
  });

  contenedor.innerHTML = `<div class="hos-state hos-empty">Seleccione una ubicación para consultar.</div>`;
  updatePager(0, 0);
  startUpdateTimeTicker();
});
