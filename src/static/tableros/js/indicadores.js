function obtenerClaseColor(valor) {
  if (!valor) return "";
  const v = String(valor).trim().toUpperCase();
  switch (v) {
    case "ALTO": return "bg-red-400 text-white font-semibold";
    case "MUY ALTO": return "bg-red-400 text-white font-semibold";
    case "MODERADO": return "bg-yellow-200 text-yellow-800 font-semibold";
    case "BAJO": return "bg-green-200 text-green-800 font-semibold";
    default: return "";
  }
}

function formatearEstancia(valor) {
  if (!valor) return "0 días";
  const partes = valor.split(" ");
  if (partes.length === 1) return `${partes[0]} días`;
  const dias = partes[0];
  const horas = partes[1].split(":")[0];
  return `${dias} días y ${horas} horas`;
}

function actualizarIndicadoresUCI(data) {
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
  const maxRows = Math.max(lpp.length, caida.length);

  if (maxRows === 0) {
    tabla.innerHTML = `<tr>
      <td class="px-3 py-1 border">${data.promedio_apache ?? "--"}</td>
      <td colspan="4" class="px-2 py-1 text-center border">Sin información disponible</td>
    </tr>`;
    return;
  }

  for (let i = 0; i < maxRows; i++) {
    const row = document.createElement("tr");
    if (i === 0) {
      const apacheCell = document.createElement("td");
      apacheCell.rowSpan = maxRows;
      apacheCell.className =  "px-2 py-1 border text-2xl font-bold text-center"; 
      apacheCell.textContent = data.promedio_apache ?? "--";
      row.appendChild(apacheCell);
    }

    const lppItem = lpp[i] ?? {};
    const caidaItem = caida[i] ?? {};

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

async function fetchIndicadores(camcod) {
  if (window.modalOpen) return; // 🔴 Pausa si modal abierto
  try {
    const resp = await fetch("/tableros/uci/datos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ camcod })
    });
    const data = await resp.json();
    actualizarIndicadoresUCI(data?.indicadores ?? null);
  } catch (err) {
    console.error("❌ Error en fetchIndicadores:", err);
    actualizarIndicadoresUCI(null);
  }
}

let refreshIntervalIndicadores = null;
function startAutoRefreshIndicadores(camcod) {
  stopAutoRefreshIndicadores();
  if (!camcod) return;
  refreshIntervalIndicadores = setInterval(() => {
    if (!window.modalOpen) {
      fetchIndicadores(camcod);
    }
  }, 60000);
}
function stopAutoRefreshIndicadores() {
  if (refreshIntervalIndicadores) clearInterval(refreshIntervalIndicadores);
  refreshIntervalIndicadores = null;
}

document.addEventListener("DOMContentLoaded", () => {
  const selectCama = document.getElementById("cama");
  if (!selectCama) return;
  selectCama.addEventListener("change", () => {
    const camcod = selectCama.value;
    if (camcod) {
      fetchIndicadores(camcod);
      startAutoRefreshIndicadores(camcod);
    } else {
      stopAutoRefreshIndicadores();
      actualizarIndicadoresUCI(null);
    }
  });
});
