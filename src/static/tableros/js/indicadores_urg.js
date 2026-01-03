// src/static/tableros/js/indicadores_urg.js

function obtenerClaseColor(valor) {
  if (!valor) return "";
  const v = String(valor).trim().toUpperCase();
  switch (v) {
    case "BAJO":
    case "MENOR":
    case "LEVE":
      return "bg-green-200 text-green-800 font-semibold";
    case "MODERADO":
    case "MEDIO":
      return "bg-yellow-200 text-yellow-800 font-semibold";
    case "INTERMEDIO":
    case "MODERADO A SEVERO":
      return "bg-orange-200 text-orange-800 font-semibold";
    case "ALTO":
    case "MUY ALTO":
    case "SEVERO":
    case "MAYOR":
      return "bg-red-400 text-white font-semibold";
    default:
      return "";
  }
}

function formatearEstancia(valor) {
  if (!valor) return "0 días";
  const partes = String(valor).match(/\d+/g);
  if (!partes) return valor;
  const dias = partes[0] || 0;
  const horas = partes[1] || 0;
  return `${dias} días ${horas} horas`;
}

function actualizarIndicadoresUrg(data) {
  const totalEl = document.getElementById("total-pacientes");
  const promedioEl = document.getElementById("promedio-estancia");
  const tabla = document.getElementById("tabla-indicadores");

  if (!data) {
    if (totalEl) totalEl.textContent = "0";
    if (promedioEl) promedioEl.textContent = "0";
    if (tabla) tabla.innerHTML = "";
    return;
  }

  const info = data.indicadores ? data.indicadores : data;

  if (totalEl) totalEl.textContent = info.total_pacientes ?? "0";
  if (promedioEl) promedioEl.textContent = formatearEstancia(info.promedio_estancia ?? "0");
  if (!tabla) return;
  tabla.innerHTML = "";

  const grace = Array.isArray(info.escala_grace) ? info.escala_grace : [];
  const curb = Array.isArray(info.riesgo_curb65) ? info.riesgo_curb65 : [];
  const caida = Array.isArray(info.riesgo_caida) ? info.riesgo_caida : [];
  const nihss = Array.isArray(info.riesgo_nihss) ? info.riesgo_nihss : [];

  const maxRows = Math.max(grace.length, curb.length, caida.length, nihss.length);

  for (let i = 0; i < maxRows; i++) {
    const row = document.createElement("tr");

    // GRACE
    const g = grace[i] ?? {};
    const tdGNum = document.createElement("td");
    tdGNum.className = "px-2 py-1 border";
    tdGNum.textContent = g.NO_PACI ?? g.no_paci ?? "";
    row.appendChild(tdGNum);

    const tdGCat = document.createElement("td");
    tdGCat.className = "px-2 py-1 border";
    const gEscalapor = g.ESCALAPOR ?? g.escalapor ?? "";
    if (gEscalapor) {
      tdGCat.className += " " + obtenerClaseColor(gEscalapor);
      tdGCat.textContent = gEscalapor;
    }
    row.appendChild(tdGCat);

    // CURB-65
    const c = curb[i] ?? {};
    const tdCNum = document.createElement("td");
    tdCNum.className = "px-2 py-1 border";
    tdCNum.textContent = c.NO_PACI ?? c.no_paci ?? "";
    row.appendChild(tdCNum);

    const tdCCat = document.createElement("td");
    tdCCat.className = "px-2 py-1 border";
    const cEscalapor = c.ESCALAPOR ?? c.escalapor ?? "";
    if (cEscalapor) {
      tdCCat.className += " " + obtenerClaseColor(cEscalapor);
      tdCCat.textContent = cEscalapor;
    }
    row.appendChild(tdCCat);

    // CAÍDA
    const r = caida[i] ?? {};
    const tdRNum = document.createElement("td");
    tdRNum.className = "px-2 py-1 border";
    tdRNum.textContent = r.NO_PACI ?? r.no_paci ?? "";
    row.appendChild(tdRNum);

    const tdRCat = document.createElement("td");
    tdRCat.className = "px-2 py-1 border";
    const rEscalapor = r.ESCALAPOR ?? r.escalapor ?? "";
    if (rEscalapor) {
      tdRCat.className += " " + obtenerClaseColor(rEscalapor);
      tdRCat.textContent = rEscalapor;
    }
    row.appendChild(tdRCat);

    // NIHSS
    const n = nihss[i] ?? {};
    const tdNNum = document.createElement("td");
    tdNNum.className = "px-2 py-1 border";
    tdNNum.textContent = n.NO_PACI ?? n.no_paci ?? "";
    row.appendChild(tdNNum);

    const tdNCat = document.createElement("td");
    tdNCat.className = "px-2 py-1 border";
    const nEscalapor = n.ESCALAPOR ?? n.escalapor ?? "";
    if (nEscalapor) {
      tdNCat.className += " " + obtenerClaseColor(nEscalapor);
      tdNCat.textContent = nEscalapor;
    }
    row.appendChild(tdNCat);

    tabla.appendChild(row);
  }
}

async function fetchIndicadoresUrg(ubicods) {
  if (window.modalOpen) return;
  try {
    const resp = await fetch('/tableros/urgencias/datos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ubicod: ubicods })
    });
    const data = await resp.json();
    actualizarIndicadoresUrg(data?.indicadores ?? data);
  } catch (err) {
    console.error('❌ Error en fetchIndicadoresUrg:', err);
    actualizarIndicadoresUrg(null);
  }
}

let refreshIntervalIndicadores = null;
function startAutoRefreshIndicadoresUrg(ubicods) {
  stopAutoRefreshIndicadoresUrg();
  if (!ubicods || (Array.isArray(ubicods) && ubicods.length === 0)) return;
  refreshIntervalIndicadores = setInterval(() => {
    if (!window.modalOpen) {
      const botonesActivos = document.querySelectorAll('.ubicacion-btn.activo');
      const ubicodsActuales = Array.from(botonesActivos).map(b => b.dataset.tipo);
      if (ubicodsActuales.length > 0) {
        fetchIndicadoresUrg(ubicodsActuales);
      }
    }
  }, 5000);
}
function stopAutoRefreshIndicadoresUrg() {
  if (refreshIntervalIndicadores) clearInterval(refreshIntervalIndicadores);
  refreshIntervalIndicadores = null;
}

export { fetchIndicadoresUrg, startAutoRefreshIndicadoresUrg, stopAutoRefreshIndicadoresUrg, actualizarIndicadoresUrg };
