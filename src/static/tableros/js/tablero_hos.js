// src/static/tableros/js/tablero_hos.js
document.addEventListener("DOMContentLoaded", () => {
  const selectUbic = document.getElementById("ubicacion");
  const contenedor = document.getElementById("contenedor-tarjetas");
  const prevBtn = document.getElementById("prevPage");
  const nextBtn = document.getElementById("nextPage");
  const pageIndicator = document.getElementById("pageIndicator");

  // Modal
  const modal = document.getElementById("resumenModal");
  const contenidoResumen = document.getElementById("contenidoResumen");
  const cerrarModalBtn = document.getElementById("cerrarModal");

  // Control de timers
  let refreshInterval = null;
  let pageInterval = null;
  let refreshTimeout = null;
  let pageTimeout = null;
  window.modalOpen = false;
  let currentAbortController = null;

  // ⏱ ticker de hora de actualización
  let updateTimeInterval = null;
  let updateTimeTimeout = null;

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
    if (!window.modalOpen && selectUbic.value) {
      fetchDatos(selectUbic.value); // carga inicial inmediata

      const ahora = new Date();
      const msHastaProximoMinuto = (60 - ahora.getSeconds()) * 1000 - ahora.getMilliseconds();

      // Primer fetch sincronizado con minuto exacto
      refreshTimeout = setTimeout(() => {
        if (!window.modalOpen && selectUbic.value) fetchDatos(selectUbic.value);

        refreshInterval = setInterval(() => {
          if (!window.modalOpen && selectUbic.value) fetchDatos(selectUbic.value);
        }, 60000);
      }, msHastaProximoMinuto);
    }
    resetPageTimer();
  }

  function actualizarUltimaHora() {
    const ahora = new Date();
    ahora.setSeconds(0, 0);

    const diasSemana = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
    const meses = ["Enero","Febrero","Marzo","Abril","Mayo","Junio",
      "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

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
      span.textContent = selectUbic.value
        ? `Última actualización: ${fechaFormateada}`
        : "Última actualización: --";
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
        if (!window.modalOpen && items.length > 0) {
          nextPage(false);
        }
      }, 18000);
    }, 18000);
  }

  function openModal(data) {
    if (!data || data.error) {
      contenidoResumen.innerHTML = `<div class="p-4 text-red-600 font-semibold">⚠️ ${data?.error || "Error al generar resumen"}</div>`;
    } else {
      const resumenHtml = markdownToHtml(data.resumen_ia || "Sin información disponible.");
      contenidoResumen.innerHTML = `
        <div class="space-y-4 fade-in-content">
          <div class="grid grid-cols-2 gap-4 bg-gradient-to-br from-blue-50 to-indigo-50 p-4 rounded-xl shadow-sm border border-blue-100">
            <p class="flex items-center gap-2"><span class="font-semibold text-blue-900">🆔 Identificación:</span> <span class="text-gray-700">${escapeHtml(data.escide)}</span></p>
            <p class="flex items-center gap-2"><span class="font-semibold text-blue-900">👤 Nombre:</span> <span class="text-gray-700">${escapeHtml(data.nombre)}</span></p>
            <p class="flex items-center gap-2"><span class="font-semibold text-blue-900">🏥 Habitación:</span> <span class="text-gray-700">${escapeHtml(data.habitacion)}</span></p>
            <p class="flex items-center gap-2"><span class="font-semibold text-blue-900">📋 Diagnóstico:</span> <span class="text-gray-700">${escapeHtml(data.diagnostico)}</span></p>
          </div>
          <div class="p-5 bg-white border-2 border-indigo-100 rounded-xl shadow-lg">
            <div class="flex items-center gap-3 mb-4 pb-3 border-b border-gray-200">
              <div class="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center shadow-md">
                <span class="text-white text-xl">🤖</span>
              </div>
              <h3 class="text-lg font-bold text-gray-800">Análisis Inteligente - Riesgos y Necesidades</h3>
            </div>
            <div class="ai-response-container bg-gradient-to-br from-gray-50 to-blue-50 p-4 rounded-lg">
              <div class="text-gray-700 leading-relaxed" id="ai-text-output"></div>
            </div>
          </div>
        </div>
      `;
      
      const outputElement = document.getElementById("ai-text-output");
      if (outputElement) {
        typeWriter(outputElement, resumenHtml);
      }
    }
    modal.classList.remove("hidden");
  }

  function closeModal() {
    modal.classList.add("hidden");
    window.modalOpen = false;
    if (currentAbortController) {
      currentAbortController.abort();
      currentAbortController = null;
    }
    startIntervals();
  }

  cerrarModalBtn.addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function markdownToHtml(text) {
    if (!text) return '';
    return text
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/__(.+?)__/g, '<strong>$1</strong>')
      .replace(/(?<!\*)\*(?!\*)(.+?)\*(?!\*)/g, '<em>$1</em>')
      .replace(/(?<!_)_(?!_)(.+?)_(?!_)/g, '<em>$1</em>')
      .replace(/^---$/gm, '<hr>')
      .replace(/^\*\*\*$/gm, '<hr>')
      .replace(/^[\*\-]\s+(.+)$/gm, '<li>$1</li>')
      .replace(/^###\s+(.+)$/gm, '<h3>$1</h3>')
      .replace(/^##\s+(.+)$/gm, '<h2>$1</h2>')
      .replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');
  }

  function typeWriter(element, htmlContent) {
    element.innerHTML = htmlContent;
    element.style.opacity = '0';
    setTimeout(() => {
      element.style.transition = 'opacity 0.8s ease-in';
      element.style.opacity = '1';
    }, 50);
  }

  function normalizeColor(value) {
    if (!value) return "#6c757d";
    const v = String(value).trim();
    if (v.startsWith("#")) return v;
    if (v.startsWith("rgb")) return v;
    if (/^\d{1,3}\s*,\s*\d{1,3}\s*,\d{1,3}$/.test(v)) return `rgb(${v})`;
    return v;
  }

  function buildCard(item) {
  const escide = item.escide ?? "";
  const esceda = item.esceda ?? "";
  const escpac = item.escpac ?? "";
  const eschab = item.eschab ?? "";
  const escgol = item.escgol ?? "";
  const esgrgb = item.esgrgb ?? "";
  const esbint = item.esbint ?? "";
  const esbrgb = item.esbrgb ?? "";
  const esrint = item.esrint ?? "";
  const esrrgb = item.esrrgb ?? "";
  const diaest = item.diaest ?? "";
  const diaesg = item.diaesg ?? "";

  function renderEstancia(label, valor, icono = "") {
    if (!valor) return "";
    return `
      <div class="text-sm text-gray-600 mt-1 flex items-center whitespace-nowrap">
        <span class="font-semibold">${label}:</span> 
        <span class="font-normal ml-1">${escapeHtml(valor)}</span> 
        ${icono}
      </div>
    `;
  }

  function getIconoEstancia(valor) {
    if (!valor) return "";
    const match = valor.match(/(\d+)\s*Dias\s*(\d+)?\s*Horas?/i);
    if (!match) return "";

    const dias = parseInt(match[1], 10);
    const horas = match[2] ? parseInt(match[2], 10) : 0;
    const totalDias = dias + horas / 24;

    let color = "";
    let animacion = "";
    if (totalDias < 6 && totalDias >= 0) {
      color = "bg-green-500";
    } else if (totalDias >= 6 && totalDias < 10) {
      color = "bg-yellow-400";
      animacion = "animate-pulse";
    } else if (totalDias >= 10 && totalDias < 15) {
      color = "bg-orange-400";
      animacion = "animate-pulse";
    } else if (totalDias >= 15) {
      color = "bg-red-500";
      animacion = "animate-pulse";
    }

    return color
      ? `<span class="ml-2 w-3 h-3 inline-block rounded-full ${color} ${animacion}" 
                title="Estancia ${totalDias.toFixed(1)} días"></span>`
      : "";
  }

  // Determinar clases para la habitación
  const roomClasses = ["room-info"];
  if (Number(item.ordais) === 1) {
    roomClasses.push("aislado");
  }

  return `
  <div class="hos-card" data-escide="${escapeHtml(escide)}">
    <div class="card-header">
      <div class="patient-info">
        <div class="patient-id">
          ID: ${escapeHtml(escide)}
          ${esceda ? `&nbsp;&nbsp;<span class="patient-age">(${escapeHtml(esceda)} AÑOS)</span>` : ""}
        </div>
        <div class="patient-name">${escapeHtml(escpac)}</div>
        ${renderEstancia("Gral", diaesg, getIconoEstancia(diaesg))}
      </div>

      <!-- Habitacion con clase dinámica -->
      <div class="${roomClasses.join(" ")}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
          <circle cx="12" cy="10" r="3"></circle>
        </svg>
        ${escapeHtml(eschab)}
      </div>
    </div>

    <div class="risks-container">
      <div class="risk-item risk-goldberg">
        <span class="risk-label">GOLDBERG</span>
        <div class="risk-value">
          <div class="risk-indicator" style="background:${normalizeColor(esgrgb)};"></div>
        </div>
      </div>
      <div class="risk-item risk-lpp">
        <span class="risk-label">LPP </span>
        <div class="risk-value">
          <span class="risk-text">${escapeHtml(esbint)}</span>
          <div class="risk-indicator" style="background:${normalizeColor(esbrgb)};"></div>
        </div>
      </div>
      <div class="risk-item risk-caida">
        <span class="risk-label">CAÍDA </span>
        <div class="risk-value">
          <span class="risk-text">${escapeHtml(esrint)}</span>
          <div class="risk-indicator" style="background:${normalizeColor(esrrgb)};"></div>
        </div>
      </div>
    </div>

    <div class="stay-info">
      <div class="stay-duration flex items-center">
        ${renderEstancia("Servicio", diaest, getIconoEstancia(diaest))}
      </div>
      <div class="flex justify-end">
        <div class="resumen-icon flex items-center gap-1 cursor-pointer" title="IA">
          <span class="text-lg">🤖</span>
          <span class="text-sm font-medium text-gray-700">IA</span>
        </div>
      </div>
    </div>
  </div>
  `;
}


  const PER_PAGE = 8;
  let items = [];
  let currentPage = 1;

  function totalPages() {
    return Math.max(1, Math.ceil(items.length / PER_PAGE));
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

    const start = (currentPage - 1) * PER_PAGE;
    const end = start + PER_PAGE;
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
        updatePager(currentPage, total);
        contenedor.classList.remove("fade-out");
        contenedor.classList.add("fade-in");
        setTimeout(() => contenedor.classList.remove("fade-in"), 500);
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

  let touchStartX = 0;
  contenedor.addEventListener("touchstart", (e) => {
    touchStartX = e.changedTouches[0].screenX;
  });
  contenedor.addEventListener("touchend", (e) => {
    const touchEndX = e.changedTouches[0].screenX;
    const diff = touchEndX - touchStartX;
    if (Math.abs(diff) > 50) {
      if (diff > 0) prevPageFn(true);
      else nextPage(true);
    }
  });

  async function fetchDatos(ubicod) {
    contenedor.innerHTML = `<div class="hos-state hos-loading"><div class="loading-spinner"></div><div>Cargando pacientes...</div></div>`;
    updatePager(0, 0);
    try {
      const resp = await fetch("/tableros/hospitalizacion/datos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ubicod })
      });
      const data = await resp.json();

      // Acepta ambos formatos (compatibilidad): pacientes_en_cama (backend) o datos (antes)
      const raw = Array.isArray(data?.pacientes_en_cama) ? data.pacientes_en_cama
                 : Array.isArray(data?.datos) ? data.datos
                 : [];

      // Normalizar claves a lowercase para que buildCard (que usa escide, escpac, etc.) funcione
      items = raw.map(obj => {
        const norm = {};
        for (const k in obj) {
          if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
          norm[k.toLowerCase()] = obj[k];
        }
        return norm;
      });

      currentPage = 1;
      renderPage(false);
      actualizarUltimaHora();
    } catch (err) {
      console.error("❌ Error en fetchDatos:", err);
      contenedor.innerHTML = `<div class="hos-state hos-error">Error al cargar pacientes</div>`;
      updatePager(0, 0);
    }
  }

  selectUbic.addEventListener("change", () => {
    const ubic = selectUbic.value;
    items = [];
    currentPage = 1;
    if (!ubic) {
      contenedor.innerHTML = `<div class="hos-state hos-empty">Seleccione una ubicación para consultar.</div>`;
      updatePager(0, 0);
      stopIntervals();
      stopUpdateTimeTicker();
      actualizarUltimaHora();
      return;
    }
    fetchDatos(ubic).then(() => {
      startIntervals();
      startUpdateTimeTicker();
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

    if (currentAbortController) {
      currentAbortController.abort();
    }
    currentAbortController = new AbortController();

    try {
      const resp = await fetch("/tableros/hospitalizacion/riesgos-necesidades-detalle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ escide }),
        signal: currentAbortController.signal,
      });
      const data = await resp.json();

      if (resp.ok) {
        if (loadingDiv) loadingDiv.classList.add("hidden");
        openModal(data);
      } else {
        if (loadingDiv) loadingDiv.classList.add("hidden");
        openModal({ error: data.error || "Error al generar resumen" });
      }
    } catch (err) {
      if (err.name === "AbortError") {
        console.log("✅ Request cancelada porque se cerró el modal");
        return;
      }
      console.error(err);
      const loadingDiv2 = document.getElementById("modal-loading");
      if (loadingDiv2) loadingDiv2.classList.add("hidden");
      openModal({ error: "Error al generar resumen" });
    }
  });

  contenedor.innerHTML = `<div class="hos-state hos-empty">Seleccione una ubicación para consultar.</div>`;
  updatePager(0, 0);

  // ⏱ iniciar ticker de hora aunque no haya datos
  startUpdateTimeTicker();
});

// bottom helpers: use DOM lookup to avoid scope issues when called externally
function mostrarPlaceholders() {
  const cont = document.getElementById("contenedor-tarjetas");
  if (!cont) return;
  cont.innerHTML = `
    <div class="cards-container grid-2x4 flex-1 mx-4">
      ${Array.from({ length: 8 }).map(() => `
        <div class="hos-card placeholder">
          <div class="skeleton h-4 w-1/3 mb-3"></div>
          <div class="skeleton h-6 w-2/3 mb-2"></div>
          <div class="skeleton h-4 w-1/2 mb-2"></div>
          <div class="skeleton h-4 w-full mb-2"></div>
          <div class="skeleton h-4 w-3/4"></div>
        </div>
      `).join("")}
    </div>
  `;
  const pageIndicator = document.getElementById("pageIndicator");
  if (pageIndicator) pageIndicator.textContent = "Página 0 de 0";
}

function ocultarPlaceholders() {
  const cont = document.getElementById("contenedor-tarjetas");
  if (!cont) return;
  cont.innerHTML = "";
}
