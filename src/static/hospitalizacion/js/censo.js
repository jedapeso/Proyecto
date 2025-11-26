// hospitalizacion/js/censo.js
document.addEventListener("DOMContentLoaded", () => {
  /* =======================================================
     === Referencias a elementos del DOM ===
  ======================================================= */
  const toggleBtn = document.getElementById("toggleBtn");
  const topbar = document.getElementById("topbar");
  const selectServicio = document.getElementById("servicio");
  const selectEmpresa = document.getElementById("empresa");
  const canvas = document.getElementById("graficoCenso"); // contenedor DIV para ECharts
  const interpretacionDiv = document.getElementById("interpretacionGrafica");
  const botonesGrafico = document.getElementById("botones-grafico");
  const btnRegresar = document.getElementById("btnRegresar");
  const excelServicio = document.getElementById("excelServicio");
  const excelEmpresa = document.getElementById("excelEmpresa");
  const empresaSeleccionada = document.getElementById("empresaSeleccionada");
  const btnExcel = document.getElementById("btnDescargarExcel");
  const mensajePlaceholder = document.getElementById("mensaje-placeholder");

  const ultimaActualizacionContainer = document.getElementById("ultima-actualizacion");
  const textoActualizacion = document.getElementById("texto-actualizacion");
  const iconoRefresh = document.getElementById("icono-refresh");

  if (!selectServicio || !selectEmpresa || !canvas || !interpretacionDiv) return;

  /* =======================================================
     === Inicialización ECharts ===
  ======================================================= */
  let chart = echarts.init(canvas);


  const nombresServicios = {
    H1: "Hospitalización Piso 1",
    H2: "Hospitalización Piso 2",
    H3: "Hospitalización Piso 3",
    UA: "UCI",
    TS: "General"
  };

  function ajustarCanvas() {
    if (chart) chart.resize();
  }
  window.addEventListener("resize", ajustarCanvas);

  /* =======================================================
     === Botón flotante de refresco ===
  ======================================================= */
  const btnRefrescar = document.createElement("button");
  btnRefrescar.id = "btnRefrescar";
  btnRefrescar.innerHTML = "⟳"; // símbolo simple de refresco
  btnRefrescar.title = "Refrescar gráfico";
  btnRefrescar.style.cssText = `
    position: fixed; top: 120px; right: 10px;
    width: 50px; height: 50px;
    border-radius: 50%; border: none;
    background-color: #3498db; color: #fff;
    font-size: 24px; cursor: pointer;
    box-shadow: 0 4px 12px rgba(0,0,0,0.4);
    opacity: 0; transform: scale(0.5);
    transition: opacity 0.4s ease, transform 0.25s ease;
    z-index: 1000;
  `;
  document.body.appendChild(btnRefrescar);

  function mostrarBoton() {
    btnRefrescar.style.opacity = "1";
    btnRefrescar.style.transform = "scale(1)";
  }
  function ocultarBoton() {
    btnRefrescar.style.opacity = "0";
    btnRefrescar.style.transform = "scale(0.5)";
  }
  function actualizarBotonRefresco() {
    if (!topbar) return;
    topbar.style.transform === "translateY(-100%)"
      ? mostrarBoton()
      : ocultarBoton();
  }
  btnRefrescar.addEventListener("click", async () => {
    await performUpdateWithIcon(true);
  });

  /* =======================================================
     === Toggle topbar ===
  ======================================================= */
  if (toggleBtn && topbar) {
    toggleBtn.addEventListener("click", () => {
      if (topbar.style.transform === "translateY(-100%)") {
        topbar.style.transform = "translateY(0)";
        toggleBtn.classList.remove("open");
      } else {
        topbar.style.transform = "translateY(-100%)";
        toggleBtn.classList.add("open");
      }
      actualizarBotonRefresco();
    });
  }
  actualizarBotonRefresco();

  /* =======================================================
     === Cargar empresas según servicio ===
  ======================================================= */
  async function cargarEmpresas(servicio) {
    if (!servicio) {
      selectEmpresa.innerHTML = '<option value="">Seleccione una empresa</option>';
      selectEmpresa.disabled = true;
      return;
    }
    try {
      const response = await fetch("/hospitalizacion/empresas_por_servicio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serv: servicio }),
      });
      if (!response.ok) throw new Error("Error al obtener empresas");

      const empresas = await response.json();
      selectEmpresa.innerHTML = '<option value="">Seleccione una empresa</option>';
      empresas.forEach((e) => {
        const option = document.createElement("option");
        option.value = e.id;
        option.textContent = `${e.id} - ${e.nombre}`;
        selectEmpresa.appendChild(option);
      });
      selectEmpresa.disabled = false;
    } catch (err) {
      console.error("Error cargando empresas:", err);
      selectEmpresa.innerHTML = '<option value="">Error al cargar</option>';
      selectEmpresa.disabled = true;
    }
  }

  /* =======================================================
     === Eventos selects Servicio / Empresa ===
  ======================================================= */
  selectEmpresa.disabled = true;

  selectServicio.addEventListener("change", () => {
    const servicio = selectServicio.value;
    empresaSeleccionada.textContent = "";
    selectEmpresa.innerHTML = '<option value="">Seleccione una empresa</option>';
    selectEmpresa.disabled = true;

    if (!servicio) {
      chart.clear();
      interpretacionDiv.innerHTML = "";
      botonesGrafico?.classList.add("d-none");
      mensajePlaceholder.style.display = "block";
      ultimoHash = null;
      stopMinuteTickerAndClear();
      return;
    }
    mensajePlaceholder.style.display = "none";
    cargarEmpresas(servicio);
    startMinuteTickerAndImmediateUpdate();
  });

  selectEmpresa.addEventListener("change", () => {
    if (!selectServicio.value) {
      alert("Debe escoger primero un servicio válido.");
      selectEmpresa.value = "";
      empresaSeleccionada.textContent = "";
      return;
    }
    const nombre = selectEmpresa.options[selectEmpresa.selectedIndex].text;
    empresaSeleccionada.textContent = nombre.includes("Seleccione") ? "" : nombre;
    startMinuteTickerAndImmediateUpdate();
  });

  /* =======================================================
     === Renderizar gráfico (ECharts con bloques alternados) ===
  ======================================================= */
  function renderizarGrafico(data, labelsConvertidas, porcentaje, porcentajet) {
  const option = {
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    // Ajuste 1: Mover la leyenda arriba (top: 5) y centrarla horizontalmente.
    legend: { top: 5, left: "center" },

    // Ajuste 2: Aumentar el margen superior del grid (top: "70px") para evitar colision con la leyenda y el titulo del eje Y.
    grid: { left: "3%", right: "3%", bottom: "5%", top: "60px", containLabel: true },

    xAxis: {
      type: "category",
      data: labelsConvertidas,
      axisLabel: { rotate: 0 ,fontSize: 14},
      splitArea: {
        show: true,
        areaStyle: { color: ["#f9f9f9", "#ffffff"] } // Bloques alternados
       
      }
    },

    // Ajuste 3: Asegurar que el titulo del eje Y este bien separado.
    yAxis: {
      type: "value",
      name: "Camas / %",
      nameTextStyle: {
        padding: [0, 0, 0, 40] // Desplaza el titulo un poco hacia la izquierda
      }
    },

    series: [
      {
        name: "Camas Ocupadas",
        type: "bar",
        data: data.ocupadas || [],
        itemStyle: { color: "#3498db" },
        label: {
          show: true,
          position: "top",
          color: "#000",
          fontSize: 14
        }
      },
      {
        name: "Camas Disponibles",
        type: "bar",
        data: data.disponibles || [],
        itemStyle: { color: "#2ecc71" },
        label: {
          show: true,
          position: "top",
          color: "#000",
          fontSize: 14
        }
      },
      {
        name: "Total Camas",
        type: "bar",
        data: data.total || [],
        itemStyle: { color: "#9b59b6" },
        label: {
          show: true,
          position: "top",
          color: "#000",
          fontSize: 14
        }
      },
      {
        name: "% Ocupacion Servicio",
        type: "line",
        yAxisIndex: 0,
        data: porcentaje,
        itemStyle: { color: "#e67e22" },
        symbol: "circle",
        symbolSize: 10,
        label: {
          show: true,
          position: "top",
          formatter: "{c}%",
          color: "#e67e22",
          fontSize: 14,
          fontWeight: "bold"
        }
      }
    ]
  };
  chart.setOption(option, true);
}
  /* =======================================================
     === Helpers de actualización de gráfico ===
  ======================================================= */
  let ultimoHash = null;
  let currentController = null;

  function generarHashDeDatos(data) {
    return JSON.stringify({
      labels: data.labels || [],
      ocupadas: data.ocupadas || [],
      disponibles: data.disponibles || [],
      total: data.total || [],
      porcentaje: data.porcentaje || [],
      estancia: data.estancia || [],
    });
  }

  async function actualizarGrafico(force = false) {
    const servicio = selectServicio.value;
    const empresa = selectEmpresa.value;
    if (!servicio) return;

    if (currentController) {
      try { currentController.abort(); } catch {}
      currentController = null;
    }
    currentController = new AbortController();
    const { signal } = currentController;

    try {
      const response = await fetch("/hospitalizacion/datos_censo_grafico", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ servicio, empresa }),
        signal,
      });
      if (signal.aborted) return;
      if (!response.ok) return console.error("Respuesta no OK:", response.status);

      const data = await response.json();
      const porcentaje = (data.porcentaje || []).map(Number);
      const porcentajet = (data.porcentajet || []).map(Number);
      const labelsConvertidas = (data.labels || []).map(
        (l) => nombresServicios[l] || l
      );

      const hashActual = generarHashDeDatos({
        labels: data.labels,
        ocupadas: data.ocupadas,
        disponibles: data.disponibles,
        total: data.total,
        porcentaje,
        porcentajet,
        estancia: data.estancia,
      });

      if (force || hashActual !== ultimoHash) {
        renderizarGrafico(data, labelsConvertidas, porcentaje, porcentajet);
        botonesGrafico?.classList.remove("d-none");

        if (excelServicio) excelServicio.value = servicio;
        if (excelEmpresa) excelEmpresa.value = empresa;

        interpretarGrafica(
          data.labels,
          data.ocupadas,
          data.disponibles,
          data.total,
          porcentaje,
          porcentajet,
          data.estancia
        );
        ultimoHash = hashActual;
      }
    } catch (error) {
      if (error.name !== "AbortError")
        console.error("Error gráfico:", error);
    } finally {
      if (currentController && currentController.signal === signal)
        currentController = null;
    }
  }

  /* =======================================================
     === Interpretación textual ===
  ======================================================= */
  function interpretarGrafica(labels, ocupadas, disponibles, total, porcentaje, porcentajet, prom_estancia) {
    let html = "";
    labels.forEach((servicio, i) => {
      const nombre = nombresServicios[servicio] || servicio;
      let color = "#c0bebeff";
      if (prom_estancia[i] >= 1 && prom_estancia[i] <= 5) color = "#2ecc71";
      else if (prom_estancia[i] >= 6 && prom_estancia[i] <= 9) color = "#f7f333ff";
      else if (prom_estancia[i] >= 10 && prom_estancia[i] <= 14) color = "#e67e22";
      else if (prom_estancia[i] >= 15) color = "#e43939ff";

      html += `
      <div class="mb-3 p-2 border rounded shadow-sm bg-light" style="font-size:14px;">
        <p class="mb-1"><strong>${nombre}:</strong></p>
        <p class="mb-1">Camas ocupadas: <strong>${ocupadas[i]}</strong>, Disponibles: <strong>${disponibles[i]}</strong>, Total: <strong>${total[i]}</strong></p>
        <p class="mb-1">Ocupación del Servicio: <strong>${porcentaje[i].toFixed(2)}%</strong></p>
        <p class="mb-0">Estancia Promedio: <strong>${prom_estancia[i]}</strong> días 
          <span style="display:inline-block; width:18px; height:18px; border-radius:50%; background:${color}; margin-left:6px;"></span>
        </p>
      </div>
    `;
    });
    interpretacionDiv.innerHTML = html;
  }

  /* =======================================================
     === Excel ===
  ======================================================= */
  if (btnExcel) {
    btnExcel.addEventListener("click", () => {
      const servicio = selectServicio.value;
      const empresa = selectEmpresa.value;
      if (!servicio) {
        alert("Debe seleccionar un servicio antes de descargar el Excel.");
        return;
      }
      const formData = new FormData();
      formData.append("servicio", servicio);
      formData.append("empresa", empresa);

      fetch("/hospitalizacion/reporte_censo", { method: "POST", body: formData })
        .then((res) => res.blob())
        .then((blob) => {
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement("a");
          const safeEmpresa = empresa?.trim() ? empresa.replace(/\s+/g, "_") : "TODAS";
          a.href = url;
          a.download = `CENSO_HOSP_${servicio}_${safeEmpresa}.xlsx`;
          document.body.appendChild(a);
          a.click(); a.remove();
          window.URL.revokeObjectURL(url);
        })
        .catch((err) => {
          console.error("Error Excel:", err);
          alert("Ocurrió un error al generar el Excel.");
        });
    });
  }

  /* =======================================================
     === Botón Regresar ===
  ======================================================= */
  btnRegresar?.addEventListener("click", () => {
    botonesGrafico?.classList.add("d-none");
    interpretacionDiv.innerHTML = "";
    chart.clear();
    mensajePlaceholder.style.display = "block";
  });

  /* =======================================================
     === Última actualización automática ===
  ======================================================= */
  let minuteTimeoutId = null, minuteIntervalId = null;

  function formatFecha12Horas(date = new Date()) {
    const diasSemana = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
    const meses = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
    let horas = date.getHours(); 
    const minutos = date.getMinutes().toString().padStart(2,"0");
    const ampm = horas >= 12 ? "pm" : "am"; 
    horas = horas % 12; horas = horas || 12;
    return `${diasSemana[date.getDay()]}, ${date.getDate()} ${meses[date.getMonth()]} ${horas}:${minutos} ${ampm}`;
  }

  function setLastUpdateEmpty() {
    if (textoActualizacion) textoActualizacion.textContent = "Última actualización: --";
  }
  function setLastUpdateToNowTruncated() {
    if (textoActualizacion) textoActualizacion.textContent = `Última actualización: ${formatFecha12Horas(new Date())}`;
  }
  function showRefreshIcon() {
    iconoRefresh?.classList.add("fa-spin");
    iconoRefresh.style.display = "inline-block";
  }
  function hideRefreshIcon() {
    setTimeout(() => {
      iconoRefresh?.classList.remove("fa-spin");
      iconoRefresh.style.display = "none";
    }, 300);
  }

  async function performUpdateWithIcon(force = false) {
    if (!selectServicio.value) {
      setLastUpdateEmpty(); return;
    }
    showRefreshIcon(); setLastUpdateToNowTruncated();
    try { await actualizarGrafico(force); } finally { hideRefreshIcon(); }
  }

  function clearMinuteTimers() {
    if (minuteTimeoutId) clearTimeout(minuteTimeoutId);
    if (minuteIntervalId) clearInterval(minuteIntervalId);
  }
  function stopMinuteTickerAndClear() {
    clearMinuteTimers(); setLastUpdateEmpty();
  }
  function startMinuteTickerAndImmediateUpdate() {
    clearMinuteTimers();
    if (!selectServicio.value) { setLastUpdateEmpty(); return; }
    performUpdateWithIcon(false);
    const now = new Date();
    const msUntilNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
    minuteTimeoutId = setTimeout(() => {
      performUpdateWithIcon(false);
      minuteIntervalId = setInterval(() => {
        if (!selectServicio.value) { stopMinuteTickerAndClear(); return; }
        performUpdateWithIcon(false);
      }, 60000);
    }, msUntilNextMinute);
  }

  const autoActualizar = () => {
    if (selectServicio.value) {
      mensajePlaceholder.style.display = "none";
      if (!minuteIntervalId && !minuteTimeoutId) startMinuteTickerAndImmediateUpdate();
    } else {
      mensajePlaceholder.style.display = "block";
      stopMinuteTickerAndClear();
    }
  };
  autoActualizar();
  selectServicio.addEventListener("change", autoActualizar);
  selectEmpresa.addEventListener("change", autoActualizar);
});
