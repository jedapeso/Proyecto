// src/static/tableros/js/indicadores_hos.js
function obtenerClaseColor(valor) {
  if (!valor) return "";
  const v = String(valor).trim().toUpperCase();
  switch (v) {
    // Goldberg
    case "MENOR A 12": return "bg-green-200 text-green-800 font-semibold";
    case "MAYOR A 12": return "bg-red-400 text-white font-semibold";
    case "NO APLICA": return "bg-blue-400 text-white font-semibold";

    // LPP y Caída
    case "ALTO": return "bg-red-400 text-white font-semibold";
    case "MUY ALTO": return "bg-red-400 text-white font-semibold";
    case "MODERADO": return "bg-yellow-200 text-yellow-800 font-semibold";
    case "BAJO": return "bg-green-200 text-green-800 font-semibold";
    default: return "";
  }
}

function formatearEstancia(valor) {
  if (!valor) return "0 días";
  // Extrae números
  const partes = valor.match(/\d+/g);
  if (!partes) return valor;
  const dias = partes[0] || 0;
  const horas = partes[1] || 0;
  return `${dias} días ${horas} horas`;
}


function actualizarIndicadoresHos(data) {
  const totalEl = document.getElementById("total-pacientes");
  const promedioEl = document.getElementById("promedio-estancia");
  const tabla = document.getElementById("tabla-indicadores");

  if (!data) {
    totalEl.textContent = "0";
    promedioEl.textContent = "0";
    tabla.innerHTML = "";
    return;
  }

  totalEl.textContent = data.total_pacientes ?? "0";
  promedioEl.textContent = formatearEstancia(data.promedio_estancia ?? "0");
  tabla.innerHTML = "";

  const lpp = Array.isArray(data.riesgo_lpp) ? data.riesgo_lpp : [];
  const caida = Array.isArray(data.riesgo_caida) ? data.riesgo_caida : [];
  const goldberg = Array.isArray(data.escala_goldberg) ? data.escala_goldberg : [];

  const maxRows = Math.max(lpp.length, caida.length, goldberg.length);

        for (let i = 0; i < maxRows; i++) {
        const row = document.createElement("tr");

        // 🔹 Goldberg
        const goldbergItem = goldberg[i] ?? {};

        // Número de pacientes
        const tdGoldPac = document.createElement("td");
        tdGoldPac.className = "px-2 py-1 border";
        tdGoldPac.textContent = goldbergItem.total ?? "";
        row.appendChild(tdGoldPac);

        // Clasificación (MENOR A 12 / MAYOR A 12)
        const tdGoldClas = document.createElement("td");
        tdGoldClas.className = "px-2 py-1 border";
        if (goldbergItem.categoria) {
        tdGoldClas.className += " " + obtenerClaseColor(goldbergItem.categoria);
        tdGoldClas.textContent = goldbergItem.categoria;
        }
        row.appendChild(tdGoldClas);

        // 🔹 LPP
        const lppItem = lpp[i] ?? {};
        const tdLppPac = document.createElement("td");
        tdLppPac.className = "px-2 py-1 border";
        tdLppPac.textContent = lppItem.no_paci ?? "";
        row.appendChild(tdLppPac);

        const tdLppClas = document.createElement("td");
        tdLppClas.className = "px-2 py-1 border";
        if (lppItem.escalapor) {
            tdLppClas.className += " " + obtenerClaseColor(lppItem.escalapor);
            tdLppClas.textContent = lppItem.escalapor;
        }
        row.appendChild(tdLppClas);

        // 🔹 Caída
        const caidaItem = caida[i] ?? {};
        const tdCaiPac = document.createElement("td");
        tdCaiPac.className = "px-2 py-1 border";
        tdCaiPac.textContent = caidaItem.no_paci ?? "";
        row.appendChild(tdCaiPac);

        const tdCaiClas = document.createElement("td");
        tdCaiClas.className = "px-2 py-1 border";
        if (caidaItem.escalapor) {
            tdCaiClas.className += " " + obtenerClaseColor(caidaItem.escalapor);
            tdCaiClas.textContent = caidaItem.escalapor;
        }
        row.appendChild(tdCaiClas);

        tabla.appendChild(row);
        }

}

async function fetchIndicadoresHos(ubicod) {
  if (window.modalOpen) return; // Pausa si modal abierto
  try {
    const resp = await fetch("/tableros/hospitalizacion/datos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ubicod })
    });
    const data = await resp.json();
    // Si tu endpoint devuelve {datos, total} en lugar de 'indicadores', esta función
    // asume que también hay datos.indicadores; si no, mantén solo los que tu SP produzca.
    actualizarIndicadoresHos(data?.indicadores ?? null);
  } catch (err) {
    console.error("❌ Error en fetchIndicadoresHos:", err);
    actualizarIndicadoresHos(null);
  }
}

let refreshIntervalIndicadores = null;
function startAutoRefreshIndicadoresHos(ubicod) {
  stopAutoRefreshIndicadoresHos();
  if (!ubicod) return;
  refreshIntervalIndicadores = setInterval(() => {
    if (!window.modalOpen) {
      fetchIndicadoresHos(ubicod);
    }
  }, 60000);
}
function stopAutoRefreshIndicadoresHos() {
  if (refreshIntervalIndicadores) clearInterval(refreshIntervalIndicadores);
  refreshIntervalIndicadores = null;
}

document.addEventListener("DOMContentLoaded", () => {
  const selectUbic = document.getElementById("ubicacion");
  if (!selectUbic) return;
  selectUbic.addEventListener("change", () => {
    const ubic = selectUbic.value;
    if (ubic) {
      fetchIndicadoresHos(ubic);
      startAutoRefreshIndicadoresHos(ubic);
    } else {
      stopAutoRefreshIndicadoresHos();
      actualizarIndicadoresHos(null);
    }
  });
});
