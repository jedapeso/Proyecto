document.addEventListener("DOMContentLoaded", () => {
  const selectCama = document.getElementById("cama");
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
  window.modalOpen = false; // 🔴 bandera global

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
    if (!window.modalOpen) {
      // refresco cada 30s
      refreshTimeout = setTimeout(() => {
        if (!window.modalOpen && selectCama.value) fetchDatos(selectCama.value);
        refreshInterval = setInterval(() => {
          if (!window.modalOpen && selectCama.value) fetchDatos(selectCama.value);
        }, 60000);
      }, 60000);

      // paginación cada 10s
      resetPageTimer();
    }
    }

  function actualizarUltimaHora() {
      const ahora = new Date();
      const opciones = { hour: '2-digit', minute: '2-digit', second: '2-digit' };
      const horaFormateada = ahora.toLocaleTimeString('es-CO', opciones);
      const span = document.getElementById("ultima-actualizacion");
      if (span) {
          span.textContent = "Última actualización: " + horaFormateada;
      }
  }

  function resetPageTimer() {
    if (pageInterval) clearInterval(pageInterval);
    if (pageTimeout) clearTimeout(pageTimeout);
    pageInterval = null;
    pageTimeout = null;

    pageTimeout = setTimeout(() => {
      if (!window.modalOpen && items.length > 0) {
        nextPage(false); // ⏩ automático
      }
      pageInterval = setInterval(() => {
        if (!window.modalOpen && items.length > 0) {
          nextPage(false); // ⏩ automático
        }
      }, 18000);
    }, 18000);
  }

  function openModal(data) {
    if (!data || data.error) {
      contenidoResumen.innerHTML = `<div class="p-4 text-red-600 font-semibold">⚠️ ${data?.error || "Error al generar resumen"}</div>`;
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
    modal.classList.remove("hidden");
  }

  function closeModal() {
    modal.classList.add("hidden");
    window.modalOpen = false;
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
  const escpac = item.escpac ?? "";
  const eschab = item.eschab ?? "";
  const esaint = item.esaint ?? "";
  const esargb = item.esargb ?? "";
  const esbint = item.esbint ?? "";
  const esbrgb = item.esbrgb ?? "";
  const esrint = item.esrint ?? "";
  const esrrgb = item.esrrgb ?? "";
  const diaest = item.diaest ?? "";

  // --- NUEVO: círculo rojo que palpite si estancia >= 3 días ---
  let iconoEstancia = "";
if (diaest) {
  const match = diaest.match(/(\d+)\s*Dias\s*(\d+)?\s*Horas?/i);
  if (match) {
    const dias = parseInt(match[1], 10);
    const horas = match[2] ? parseInt(match[2], 10) : 0;
    const totalDias = dias + horas / 24; // convierte horas a fracción de día

    let color = "";
    let animacion = "";

    if (totalDias < 4.5 && totalDias >= 0) {
      color = "bg-green-500"; // verde
      animacion = ""; // sin parpadeo
    } else if (totalDias >= 4.5 && totalDias < 6) {
      color = "bg-yellow-400"; // amarillo
      animacion = "animate-pulse"; // parpadea
    } else if (totalDias >= 6) {
      color = "bg-red-500"; // rojo
      animacion = "animate-pulse"; // parpadea
    }

    if (color) {
      iconoEstancia = `
        <span class="ml-2 w-3 h-3 inline-block rounded-full ${color} ${animacion}" 
              title="Estancia ${totalDias.toFixed(1)} días"></span>
      `;
    }
  }
}
  return `
    <div class="uci-card" data-escide="${escapeHtml(escide)}">
      <div class="card-header">
        <div class="patient-info">
          <div class="patient-id">ID: ${escapeHtml(escide)}</div>
          <div class="patient-name">${escapeHtml(escpac)}</div>
        </div>
        <div class="room-info">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
            <circle cx="12" cy="10" r="3"></circle>
          </svg>
          ${escapeHtml(eschab)}
        </div>
      </div>

      <div class="risks-container">
        <div class="risk-item risk-apa">
          <span class="risk-label">APA </span>
          <div class="risk-value">
            <span class="risk-text">${escapeHtml(esaint)}</span>
            <div class="risk-indicator" style="background:${normalizeColor(esargb)};"></div>
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
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="mr-1">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          <span>${escapeHtml(diaest)}</span>
          ${iconoEstancia}
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


  // ---- Paginación ----
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
      contenedor.innerHTML = `<div class="uci-state uci-empty">Sin pacientes para la cama/ubicación seleccionada.</div>`;
      updatePager(0, 0);
      return;
    }

    if (currentPage < 1) currentPage = 1;
    if (currentPage > total) currentPage = total;

    const start = (currentPage - 1) * PER_PAGE;
    const end = start + PER_PAGE;
    const slice = items.slice(start, end);

    if (animate) {
      contenedor.classList.add("fade-out");
      setTimeout(() => {
        contenedor.innerHTML = slice.map(buildCard).join("");
        updatePager(currentPage, total);
        contenedor.classList.remove("fade-out");
        contenedor.classList.add("fade-in");
        setTimeout(() => contenedor.classList.remove("fade-in"), 500);
      }, 300);
    } else {
      contenedor.innerHTML = slice.map(buildCard).join("");
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

  // ---- Swipe en tablets/móviles ----
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

  // ---- Fetch datos de pacientes ----
  async function fetchDatos(camcod) {
  contenedor.innerHTML = `<div class="uci-state uci-loading"><div class="loading-spinner"></div><div>Cargando pacientes...</div></div>`;
  updatePager(0, 0);
  try {
    const resp = await fetch("/hospitalizacion/uci/datos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ camcod })
    });
    const data = await resp.json();
    items = Array.isArray(data?.pacientes_en_cama) ? data.pacientes_en_cama : [];
    currentPage = 1;
    renderPage(false);

    // ✅ Actualizar hora aquí, SOLO cuando hubo fetch real
    actualizarUltimaHora();

  } catch (err) {
    console.error("❌ Error en fetchDatos:", err);
    contenedor.innerHTML = `<div class="uci-state uci-error">Error al cargar pacientes</div>`;
    updatePager(0, 0);
  }
}

  // ---- Eventos ----
  selectCama.addEventListener("change", () => {
    const camcod = selectCama.value;
    items = [];
    currentPage = 1;
    if (!camcod) {
      contenedor.innerHTML = `<div class="uci-state uci-empty">Seleccione una cama/ubicación para consultar.</div>`;
      updatePager(0, 0);
      stopIntervals();
      return;
    }
    fetchDatos(camcod).then(() => startIntervals());
  });

  prevBtn.addEventListener("click", () => prevPageFn(true));
  nextBtn.addEventListener("click", () => nextPage(true));

  // ---- Click en tarjeta ----
  contenedor.addEventListener("click", async (e) => {
    const card = e.target.closest(".uci-card");
    if (!card) return;
    const escide = card.dataset.escide;

    window.modalOpen = true; // 🔴 global
    stopIntervals();

    modal.classList.remove("hidden");
    contenidoResumen.innerHTML = "";
    const loadingDiv = document.getElementById("modal-loading");
    loadingDiv.classList.remove("hidden");

    try {
      const resp = await fetch("/hospitalizacion/uci/riesgos-necesidades-detalle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ escide })
      });
      const data = await resp.json();

      loadingDiv.classList.add("hidden");
      openModal(data);
    } catch (err) {
      console.error(err);
      loadingDiv.classList.add("hidden");
      openModal({ error: "Error al generar resumen" });
    }
  });

  // ---- Estado inicial ----
  contenedor.innerHTML = `<div class="uci-state uci-empty">Seleccione una cama/ubicación para consultar.</div>`;
  updatePager(0, 0);
});
