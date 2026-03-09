// ============================================
// === CENSO HOSPITALARIO - DASHBOARD MODERNO ===
// ============================================

document.addEventListener("DOMContentLoaded", () => {
  /* === REFERENCIAS A ELEMENTOS DEL DOM === */
  const selectServicio = document.getElementById("servicio");
  const selectEmpresa = document.getElementById("empresa");
  const btnExcel = document.getElementById("btnDescargarExcel");
  const btnRefrescarManual = document.getElementById("btnRefrescarManual");
  const empresaSeleccionada = document.getElementById("empresaSeleccionada");
  
  const mainDashboard = document.getElementById("main-dashboard");
  const placeholderMessage = document.getElementById("mensaje-placeholder");
  
  const ultimaActualizacion = document.getElementById("ultima-actualizacion");
  const textoActualizacion = document.getElementById("texto-actualizacion");
  const iconoRefresh = document.getElementById("icono-refresh");
  
  // === INSTANCIAS DE ECHARTS ===
  let chartBarras     = null;
  let chartEstancia   = null;
  let chartAsegurador = null;
  let chartRangoEdad  = null;

  // === ESTADO GLOBAL ===
  let modalAbierto      = false;   // solo actualizar análisis si el modal está visible
  let analisisPendiente = false;   // marcar para actualizar cuando se abra el modal
  let debounceTimer     = null;    // evitar fetches por clicks rápidos

  // === MAPA DE SERVICIO A NOMBRE ===
  const nombresServicios = {
    H1: "Hospitalización Piso 1",
    H2: "Hospitalización Piso 2",
    H3: "Hospitalización Piso 3",
    UA: "UCI",
    TS: "General"
  };

  // Cache de todas las opciones de servicio (capturadas al iniciar)
  let opcionesServicioCompletas = [];

  function guardarOpcionesServicio() {
    opcionesServicioCompletas = [...selectServicio.options].map(o => ({
      value: o.value,
      text:  o.textContent
    }));
  }

  function abreviarLabels(labels) {
    return labels.map(label => {
      return label.replace("Hospitalización", "Hosp");
    });
  }

  const coloresPaleta = ["#3498db", "#2ecc71", "#e67e22", "#9b59b6"];

  // === INICIALIZAR ECHARTS ===
  function inicializarCharts() {
    const containerBarras     = document.getElementById("graficoBarras");
    const containerEstancia   = document.getElementById("graficoEstancia");
    const containerAsegurador = document.getElementById("graficoAsegurador");
    const containerRangoEdad  = document.getElementById("graficoRangoEdad");

    if (containerBarras     && !chartBarras)     chartBarras     = echarts.init(containerBarras);
    if (containerEstancia   && !chartEstancia)   chartEstancia   = echarts.init(containerEstancia);
    if (containerAsegurador && !chartAsegurador) chartAsegurador = echarts.init(containerAsegurador);
    if (containerRangoEdad  && !chartRangoEdad)  chartRangoEdad  = echarts.init(containerRangoEdad);

    // Un solo listener: solo redimensiona gráficos del modal si está abierto
    window.addEventListener("resize", () => {
      chartBarras?.resize();
      if (modalAbierto) {
        chartEstancia?.resize();
        chartAsegurador?.resize();
        chartRangoEdad?.resize();
      }
    });
  }

  /* === PESTAÑAS Y MODAL === */
  function inicializarPestanasModal() {
    const reportsModalEl      = document.getElementById("reportsModal");
    const reportsModal        = new bootstrap.Modal(reportsModalEl);
    const btnAnalisisAdicionales = document.getElementById("btnAnalisisAdicionales");
    const modalTabButtons     = document.querySelectorAll(".modal-tab-btn");
    const modalTabContents    = document.querySelectorAll(".modal-tab-content");
    const modalReportTitle    = document.getElementById("modalReportTitle");

    const tabTitles = {
      1: "<i class='fas fa-clock'></i> Promedio de Estancia por Servicio",
      2: "<i class='fas fa-shield'></i> Análisis de Asegurador",
      3: "<i class='fas fa-birthday-cake'></i> Distribución por Rango de Edad"
    };

    // Rastrear estado del modal con eventos nativos de Bootstrap
    reportsModalEl.addEventListener("shown.bs.modal", () => {
      modalAbierto = true;
      // Asegurar que Estancia (tab 1) esté activa
      document.querySelectorAll('.modal-tab-btn').forEach(b => b.classList.remove("active"));
      document.querySelectorAll('.modal-tab-content').forEach(c => c.classList.remove("active"));
      document.querySelectorAll('[data-modal-tab="1"]').forEach(el => el.classList.add("active"));
      
      // Siempre cargar los análisis adicionales cuando se abre el modal
      analisisPendiente = false;
      actualizarAnalisisAdicionales();
      
      // Redimensionar gráficos después de que el modal esté completamente visible
      setTimeout(() => {
        chartEstancia?.resize();
        chartAsegurador?.resize();
        chartRangoEdad?.resize();
      }, 300);
    });
    reportsModalEl.addEventListener("hidden.bs.modal", () => { modalAbierto = false; });

    // Botón Análisis Adicionales abre el modal con Estancia visible por defecto
    if (btnAnalisisAdicionales) {
      btnAnalisisAdicionales.addEventListener("click", () => {
        // Limpiar todas las pestañas activas
        modalTabButtons.forEach(b => b.classList.remove("active"));
        modalTabContents.forEach(c => c.classList.remove("active"));
        
        // Activar pestaña 1 (Estancia)
        document.querySelectorAll('[data-modal-tab="1"]').forEach(el => el.classList.add("active"));
        
        // Actualizar título
        if (modalReportTitle) modalReportTitle.innerHTML = "<i class='fas fa-clock'></i> Promedio de Estancia por Servicio";
        reportsModal.show();
      });
    }

    // Pestañas dentro del modal
    modalTabButtons.forEach(btn => {
      btn.addEventListener("click", () => {
        const tabId = parseInt(btn.dataset.modalTab);
        modalTabButtons.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        modalTabContents.forEach(c => c.classList.toggle("active", parseInt(c.dataset.modalTab) === tabId));
        if (modalReportTitle) modalReportTitle.innerHTML = tabTitles[tabId] || "";
        setTimeout(() => {
          chartEstancia?.resize();
          chartAsegurador?.resize();
          chartRangoEdad?.resize();
        }, 200);
      });
    });
  }

  /* === HELPERS EMPRESA === */
  function deshabilitarEmpresa() {
    selectEmpresa.value     = "";
    selectEmpresa.innerHTML = '<option value="">-- Seleccione servicio primero --</option>';
    selectEmpresa.disabled  = true;
    selectEmpresa.style.opacity = "0.5";
    selectEmpresa.style.cursor  = "not-allowed";
    if (empresaSeleccionada) empresaSeleccionada.textContent = "";
  }

  function habilitarEmpresa() {
    selectEmpresa.disabled      = false;
    selectEmpresa.style.opacity = "1";
    selectEmpresa.style.cursor  = "pointer";
  }

  /* === DEBOUNCE === */
  function withDebounce(fn, delay = 300) {
    return (...args) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => fn(...args), delay);
    };
  }

  /* === CARGAR EMPRESAS SEGÚN SERVICIO === */
  async function cargarEmpresas(servicio) {
    if (!servicio) { deshabilitarEmpresa(); return; }

    try {
      const response = await fetch("/hospitalizacion/empresas_por_servicio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serv: servicio }),
      });
      if (!response.ok) throw new Error("Error cargando empresas");

      const empresas = await response.json();
      selectEmpresa.innerHTML = '<option value="">Todas las empresas</option>';
      empresas.forEach((e) => {
        const option = document.createElement("option");
        option.value   = e.id;
        option.textContent = e.nombre;
        selectEmpresa.appendChild(option);
      });
      habilitarEmpresa();
      selectEmpresa.value = "";  // Resetear a "Todas"
      if (empresaSeleccionada) empresaSeleccionada.textContent = "";
    } catch (err) {
      console.error("Error cargando empresas:", err);
      deshabilitarEmpresa();
    }
  }

  /* === EVENTOS DE LOS SELECTS (con debounce) === */
  selectServicio.addEventListener("change", withDebounce(async () => {
    const servicio = selectServicio.value;

    if (!servicio) {
      deshabilitarEmpresa();
      limpiarDashboard();
      return;
    }

    placeholderMessage.style.display = "none";
    await cargarEmpresas(servicio);
    startAutomaticUpdates();
  }));

  selectEmpresa.addEventListener("change", withDebounce(async () => {
    if (selectEmpresa.disabled) return;

    const empresa = selectEmpresa.value;
    const nombre  = selectEmpresa.options[selectEmpresa.selectedIndex]?.text || "";
    if (empresaSeleccionada) {
      empresaSeleccionada.textContent = (empresa && !nombre.includes("Todas")) ? nombre : "";
    }

    // Solo actualizar dashboard con el nuevo filtro de empresa
    if (selectServicio.value) startAutomaticUpdates();
  }));

  /* === LIMPIAR DASHBOARD === */
  function limpiarDashboard() {
    mainDashboard.style.display      = "none";
    placeholderMessage.style.display = "block";
    chartBarras?.clear();
    chartEstancia?.clear();
    chartAsegurador?.clear();
    chartRangoEdad?.clear();
    ultimoHash = null;
    setLastUpdateEmpty();
    stopAutomaticUpdates();
  }

  /* === ACTUALIZAR KPIs DINÁMICOS === */
  function actualizarKPIs(data) {
    const ocupadas    = (data.ocupadas    || []).map(v => parseFloat(v) || 0);
    const disponibles = (data.disponibles || []).map(v => parseFloat(v) || 0);
    const totales     = (data.total       || []).map(v => parseFloat(v) || 0);
    const estancia    = (data.estancia    || []).map(v => parseFloat(v) || 0);
    const porcentajeGral = (data.porcentaje_gral || []).map(v => parseFloat(v) || 0);

    const totalOcupadas    = ocupadas.reduce((a, b) => a + b, 0);
    const totalDisponibles = disponibles.reduce((a, b) => a + b, 0);
    const totalCamas       = totales.reduce((a, b) => a + b, 0);
    
    // Sumar todos los porcentajes generales (POR_OCU_SER_TOT) de los servicios visibles
    const sumaPorcentajeGral = porcentajeGral.reduce((a, b) => a + b, 0).toFixed(2);

    const estanciaValida   = estancia.filter(e => e > 0);
    const estanciaPromedio = estanciaValida.length > 0
      ? (estanciaValida.reduce((a, b) => a + b, 0) / estanciaValida.length).toFixed(1)
      : 0;

    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    set("kpi-ocupadas",    totalOcupadas);
    set("kpi-disponibles", totalDisponibles);
    set("kpi-ocupacion",   sumaPorcentajeGral + "%");
    set("kpi-estancia",    estanciaPromedio + " días");    
    // Aplicar clase de color al KPI de estancia según el promedio
    const estanciaNumFloat = parseFloat(estanciaPromedio);
    const kpiEstanciaCard = document.getElementById("kpi-estancia-card");
    if (kpiEstanciaCard) {
      kpiEstanciaCard.classList.remove("estancia-low", "estancia-medium", "estancia-high");
      if (estanciaNumFloat > 10) {
        kpiEstanciaCard.classList.add("estancia-high");
      } else if (estanciaNumFloat >= 7) {
        kpiEstanciaCard.classList.add("estancia-medium");
      } else {
        kpiEstanciaCard.classList.add("estancia-low");
      }
    }
  }

  /* === GENERAR TABLA DETALLE DE SERVICIOS === */
  function generarTarjetasServicios(data) {
    const container = document.getElementById("servicios-detalle");
    if (!container) return;

    const { labels = [], ocupadas = [], disponibles = [], total = [], porcentaje = [], porcentaje_gral = [], estancia = [] } = data;

    container.innerHTML = labels.map((label, idx) => {
      const nombreServicio = nombresServicios[label] || label;
      const ocupadasVal      = ocupadas[idx]    || 0;
      const disponiblesVal   = disponibles[idx] || 0;
      const totalVal         = total[idx]       || 0;
      const porcentajeVal    = (porcentaje[idx] || 0).toFixed(2);
      const porcentajeGral   = (porcentaje_gral[idx] || 0).toFixed(2);
      const estanciaVal      = (estancia[idx]   || 0).toFixed(1);
      const porcentajeNum    = parseFloat(porcentajeVal);
      const estanciaNum      = parseFloat(estanciaVal);
      
      // Determinar clase de severidad según ocupación para la barra
      let ocupancyClass = "low";
      if (porcentajeNum >= 95) ocupancyClass = "high";
      else if (porcentajeNum >= 80) ocupancyClass = "medium";
      
      // Determinar clase de severidad según estancia
      let estanciaClass = "low";
      if (estanciaNum > 10) estanciaClass = "high";
      else if (estanciaNum >= 7) estanciaClass = "medium";

      return `
        <tr>
          <td>${nombreServicio}</td>
          <td class="text-center">${ocupadasVal}</td>
          <td class="text-center">${disponiblesVal}</td>
          <td class="text-center">${totalVal}</td>
          <td class="text-center">
            <div class="servicio-occupancy">
              <div class="servicio-occupancy-bar">
                <div class="servicio-occupancy-fill ${ocupancyClass}" style="width: ${Math.max(porcentajeNum, 3)}%">
                  ${porcentajeNum > 20 ? porcentajeVal + '%' : ''}
                </div>
              </div>
              ${porcentajeNum <= 20 ? `<span class="servicio-occupancy-label">${porcentajeVal}%</span>` : ''}
            </div>
          </td>
          <td class="text-center">${porcentajeGral}%</td>
          <td class="text-center"><span class="estancia-badge estancia-${estanciaClass}">${estanciaVal}</span></td>
        </tr>`;
    }).join("");
  }

  /* === GRÁFICO PIE DE ASEGURADOR === */
  function renderizarGraficoAsegurador(analisisData) {
    if (!analisisData.asegurador || !analisisData.asegurador.labels) {
      chartAsegurador?.setOption({
        series: [{ type: "pie", data: [{ value: 0, name: "Sin datos" }] }]
      });
      return;
    }

    const labels = analisisData.asegurador.labels;
    const valores = analisisData.asegurador.valores;
    const isSmallScreen = window.innerWidth < 768;
    
    const seriesData = labels.map((label, i) => ({
      value: valores[i],
      name: label
    }));

    const option = {
      tooltip: { trigger: "item", formatter: "{b}: {c} ({d}%)" },
      legend: {
        orient: isSmallScreen ? "vertical" : "horizontal",
        left: isSmallScreen ? "right" : "center",
        right: isSmallScreen ? "8px" : "auto",
        bottom: isSmallScreen ? "auto" : 10,
        top: isSmallScreen ? "15%" : "auto",
        textStyle: { fontSize: isSmallScreen ? 9 : 11, fontWeight: 500 },
        type: isSmallScreen ? "scroll" : "plain",
        maxHeight: isSmallScreen ? "250px" : "auto",
        pageIconColor: "#3498db",
        pageTextStyle: { color: "#666" },
        formatter: (name) => {
          const index = labels.indexOf(name);
          const maxLength = isSmallScreen ? 12 : 30;
          return `${index + 1}. ${name.substring(0, maxLength)}${name.length > maxLength ? '...' : ''}`;
        },
        itemWidth: 8,
        itemHeight: 8,
        itemGap: isSmallScreen ? 2 : 15,
        padding: isSmallScreen ? [2, 4] : [5, 10]
      },
      grid: { 
        top: 30, 
        bottom: 30, 
        left: 30, 
        right: isSmallScreen ? 100 : 30 
      },
      series: [{
        type: "pie",
        data: seriesData,
        center: ["45%", "35%"],
        radius: isSmallScreen ? ["15%", "48%"] : ["20%", "60%"],
        emphasis: { itemStyle: { shadowBlur: 10, shadowOffsetX: 0, shadowColor: "rgba(0, 0, 0, 0.5)" } },
        label: { show: false }
      }]
    };
    chartAsegurador?.setOption(option, true);
  }

  /* === GRÁFICO BAR DE RANGO DE EDAD === */
  function renderizarGraficoRangoEdad(analisisData) {
    if (!analisisData.rango_edad || !analisisData.rango_edad.labels) {
      chartRangoEdad?.setOption({ series: [{ type: "line", data: [] }] });
      return;
    }

    const labels = analisisData.rango_edad.labels;
    const valores = analisisData.rango_edad.valores;
    const totalPacientes = valores.reduce((a, b) => a + b, 0) || 1;
    const porcentajes = valores.map(v => parseFloat(((v / totalPacientes) * 100).toFixed(2)));

    const option = {
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "cross" },
        backgroundColor: "rgba(255,255,255,0.95)",
        borderColor: "#e0e0e0",
        borderWidth: 1,
        textStyle: { color: "#333", fontSize: 13 },
        formatter: (params) => {
          if (!params.length) return "";
          const i = params[0].dataIndex;
          let html = `<div style="font-weight:bold;margin-bottom:4px">${labels[i]}</div>`;
          params.forEach(param => {
            if (param.seriesType === "line") {
              html += `<div style="display:flex;align-items:center;gap:6px">
                <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#3498db"></span>
                <span>${valores[i]} pacientes</span>
              </div>`;
            } else if (param.seriesType === "bar") {
              html += `<div style="display:flex;align-items:center;gap:6px">
                <span style="display:inline-block;width:10px;height:10px;border-radius:3px;background:#e67e22"></span>
                <span>${porcentajes[i]}% del total</span>
              </div>`;
            }
          });
          return html;
        }
      },
      grid: { left: "8%", right: "8%", bottom: "18%", top: "12%", containLabel: true },
      xAxis: {
        type: "category",
        data: labels,
        axisLabel: {
          fontSize: 12,
          color: "#555",
          fontWeight: "500",
          interval: 0
        },
        axisLine: { lineStyle: { color: "#ddd" } },
        axisTick: { show: true, lineStyle: { color: "#ddd" } }
      },
      yAxis: [
        {
          type: "value",
          name: "Pacientes",
          nameTextStyle: { color: "#3498db", fontSize: 11, fontWeight: 600 },
          position: "left",
          axisLabel: { formatter: (v) => v, fontSize: 11, color: "#3498db" },
          splitLine: { lineStyle: { color: "#f0f0f0", type: "dashed" } },
          axisLine: { show: true, lineStyle: { color: "#3498db" } },
          axisTick: { show: false }
        },
        {
          type: "value",
          name: "Porcentaje (%)",
          nameTextStyle: { color: "#e67e22", fontSize: 11, fontWeight: 600 },
          position: "right",
          axisLabel: { formatter: (v) => v + "%", fontSize: 11, color: "#e67e22" },
          splitLine: { show: false },
          axisLine: { show: true, lineStyle: { color: "#e67e22" } },
          axisTick: { show: false }
        }
      ],
      series: [
        {
          type: "line",
          name: "Pacientes",
          data: valores,
          yAxisIndex: 0,
          smooth: 0.4,
          symbol: "circle",
          symbolSize: 8,
          itemStyle: { color: "#3498db", borderColor: "#fff", borderWidth: 2 },
          lineStyle: { color: "#3498db", width: 3 },
          areaStyle: { color: "rgba(52, 152, 219, 0.08)" },
          label: {
            show: true,
            position: "left",
            formatter: (params) => {
              return valores[params.dataIndex];
            },
            fontSize: 11,
            fontWeight: "bold",
            color: "#fff",
            backgroundColor: "#3498db",
            padding: [2, 6],
            borderRadius: 4,
            offset: [-35, 0]
          },
          z: 0,
          silent: true
        },
        {
          type: "bar",
          name: "Porcentaje",
          data: porcentajes,
          yAxisIndex: 1,
          itemStyle: { 
            color: "#e67e22",
            opacity: 0.8,
            borderRadius: [4, 4, 0, 0]
          },
          barWidth: "40%",
          label: {
            show: true,
            position: "top",
            formatter: (params) => {
              return porcentajes[params.dataIndex] + "%";
            },
            fontSize: 12,
            fontWeight: "700",
            color: "#e67e22",
            backgroundColor: "rgba(255, 255, 255, 0.8)",
            padding: [2, 6],
            borderRadius: 3,
            offset: [0, -30]
          },
          z: 10
        }
      ]
    };
    chartRangoEdad?.setOption(option, true);
  }

  /* === ANÁLISIS ADICIONALES (solo se ejecuta cuando el modal está abierto) === */
  async function actualizarAnalisisAdicionales() {
    const servicio = selectServicio.value;
    const empresa  = selectEmpresa.value;
    const placeholder = document.getElementById("modal-placeholder");
    
    if (!servicio) {
      // Mostrar placeholder si no hay servicio seleccionado
      if (placeholder) placeholder.classList.add("show");
      return;
    }

    try {
      const response = await fetch("/hospitalizacion/datos_analisis_adicionales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ servicio, empresa })
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const analisisData = await response.json();
      
      // Ocultar placeholder cuando hay datos
      if (placeholder) placeholder.classList.remove("show");
      
      renderizarGraficoAsegurador(analisisData);
      renderizarGraficoRangoEdad(analisisData);
      // Aumentar delay para asegurar que el DOM esté listo
      setTimeout(() => { 
        chartEstancia?.resize(); 
        chartAsegurador?.resize(); 
        chartRangoEdad?.resize(); 
      }, 200);
    } catch (err) {
      console.error("Error análisis adicionales:", err);
      // Mostrar placeholder en caso de error
      if (placeholder) placeholder.classList.add("show");
    }
  }

  /* === GRÁFICO COMBINADO DE DISPONIBILIDAD (BARRAS + LÍNEA) === */
  function renderizarGraficoDisponibilidad(data, labelsConvertidas, porcentaje) {
    const ocupadas = (data.ocupadas || []).map(v => Math.max(0, parseFloat(v) || 0));
    const disponibles = (data.disponibles || []).map(v => Math.max(0, parseFloat(v) || 0));
    const total = (data.total || []).map(v => Math.max(0, parseFloat(v) || 0));
    const porcentajeNumerico = (porcentaje || []).map(v => Math.max(0, Math.min(100, parseFloat(v) || 0)));

    // Calcular máximo de camas para escalar el eje izquierdo
    // De forma que 100% corresponda al máximo de camas visualmente
    const maxCamas = Math.max(...total, 1);

    // Colores planos que coinciden con las tarjetas KPI
    const colorOcupadas    = "#3498db";  // Azul   → tarjeta Camas Ocupadas
    const colorDisponibles = "#2ecc71";  // Verde  → tarjeta Camas Disponibles
    const colorTotal       = "#9b59b6";  // Morado → tarjeta Estancia / Total
    const colorLinea       = "#e67e22";  // Naranja → % Ocupación

    const option = {
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        backgroundColor: "rgba(255,255,255,0.95)",
        borderColor: "#e0e0e0",
        borderWidth: 1,
        textStyle: { color: "#333", fontSize: 13 },
        formatter: (params) => {
          let result = `<div style="font-weight:bold;margin-bottom:6px">${params[0].name}</div>`;
          params.forEach(p => {
            const dot = `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${p.color};margin-right:6px"></span>`;
            if (p.seriesType === "bar") {
              result += `<div style="display:flex;align-items:center">${dot}${p.seriesName}: <b style="margin-left:4px">${Math.round(p.value)}</b></div>`;
            } else {
              result += `<div style="display:flex;align-items:center"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${colorLinea};margin-right:6px"></span>${p.seriesName}: <b style="margin-left:4px">${p.value.toFixed(2)}%</b></div>`;
            }
          });
          return result;
        }
      },
      legend: {
        top: 5,
        left: "center",
        itemWidth: 12,
        itemHeight: 12,
        textStyle: { fontSize: 12, color: "#555" }
      },
      grid: { left: "3%", right: "3%", bottom: "5%", top: "60px", containLabel: true },
      xAxis: {
        type: "category",
        data: labelsConvertidas,
        axisLabel: { rotate: 0, fontSize: 12, color: "#555", fontWeight: "bold" },
        axisLine: { lineStyle: { color: "#ddd" } },
        axisTick: { show: false },
        splitArea: { show: true, areaStyle: { color: ["rgba(250,250,250,0.6)", "rgba(255,255,255,0)"] } }
      },
      yAxis: [
        {
          type: "value",
          name: "Camas",
          nameTextStyle: { padding: [0, 0, 0, 40], color: "#3498db", fontSize: 11 },
          axisLabel: { fontSize: 11, color: "#3498db", interval: 0 },
          splitLine: { lineStyle: { color: "#f0f0f0", type: "dashed" } },
          axisLine: { show: false },
          axisTick: { show: false },
          min: 0,
          max: 30,
          splitNumber: 6
        },
        {
          type: "value",
          name: "% Ocupación",
          nameTextStyle: { padding: [0, 0, 0, 0], color: colorLinea, fontSize: 11 },
          position: "right",
          axisLabel: { 
            fontSize: 11, 
            color: colorLinea,
            interval: 0,
            formatter: (value) => value.toFixed(0) + "%"
          },
          splitLine: { show: false },
          axisLine: { show: false },
          axisTick: { show: false },
          min: 0,
          max: 100,
          splitNumber: 10
        }
      ],
      series: [
        {
          name: "Ocupadas",
          type: "bar",
          data: ocupadas,
          itemStyle: {
            color: colorOcupadas,
            borderRadius: [6, 6, 0, 0]
          },
          label: { show: true, position: "top", color: "#333", fontSize: 11, fontWeight: "bold", formatter: "{c}" }
        },
        {
          name: "Disponibles",
          type: "bar",
          data: disponibles,
          itemStyle: {
            color: colorDisponibles,
            borderRadius: [6, 6, 0, 0]
          },
          label: { show: true, position: "top", color: "#333", fontSize: 11, fontWeight: "bold", formatter: "{c}" }
        },
        {
          name: "Total",
          type: "bar",
          data: total,
          itemStyle: {
            color: colorTotal,
            borderRadius: [6, 6, 0, 0]
          },
          label: { show: true, position: "top", color: "#333", fontSize: 11, fontWeight: "bold", formatter: "{c}" }
        },
        {
          name: "% Ocupación",
          type: "line",
          yAxisIndex: 1,
          data: porcentajeNumerico,
          itemStyle: { color: colorLinea },
          lineStyle: { width: 3, color: colorLinea },
          symbol: "circle",
          symbolSize: 9,
          barOffset: "-66%",
          label: {
            show: true,
            position: "top",
            formatter: "{c}%",
            color: colorLinea,
            fontSize: 11,
            fontWeight: "bold"
          }
        }
      ]
    };
    chartBarras?.setOption(option, true);
  }

  /* === GRÁFICO DE ESTANCIA MEJORADO === */
  function renderizarGraficoEstancia(data, labelsConvertidas) {
    const estancia = (data.estancia || []).map(e => parseFloat(e) || 0);
    const ocupadas = (data.ocupadas || []).map(v => parseFloat(v) || 0);
    
    // Validar que labelsConvertidas no esté vacío
    let labels = labelsConvertidas && labelsConvertidas.length > 0 ? labelsConvertidas : data.labels || [];
    
    // Usar conteo REAL del backend (pacientes individuales con DIAS_ESTANCIA > 10)
    // NO derivar del promedio: un servicio con promedio 8 puede tener 2 pacientes con 15 días
    const estanciaAlta = (data.estancia_alta || []).map(v => parseInt(v) || 0);

    const option = {
      tooltip: { 
        trigger: "axis", 
        axisPointer: { type: "cross" },
        formatter: (params) => {
          let result = params[0].name + "<br/>";
          params.forEach(p => {
            if (p.seriesType === 'line') {
              result += p.seriesName + ": " + p.value.toFixed(2) + " días<br/>";
            } else {
              result += p.seriesName + ": " + Math.round(p.value) + " pacientes<br/>";
            }
          });
          return result;
        }
      },
      legend: { top: 5, left: "center" },
      grid: { left: "3%", right: "3%", bottom: "5%", top: "60px", containLabel: true },
      xAxis: {
        type: "category",
        data: labels,
        axisLabel: { rotate: 0, fontSize: 12, interval: 0, showMaxLabel: true }
      },
      yAxis: [
        {
          type: "value",
          name: "Promedio de Días",
          nameTextStyle: { padding: [0, 0, 0, 40], color: "#9b59b6" },
          axisLabel: { 
            formatter: (value) => Math.round(value) + " días",
            fontSize: 11,
            color: "#9b59b6"
          },
          splitLine: { lineStyle: { color: "rgba(0,0,0,0.05)" } }
        },
        {
          type: "value",
          name: "Pacientes con Estancia Alta",
          nameTextStyle: { padding: [0, 0, 0, 0], color: "#e67e22" },
          position: "right",
          axisLabel: { 
            formatter: (value) => Math.round(value),
            fontSize: 11,
            color: "#e67e22"
          },
          splitLine: { show: false }
        }
      ],
      series: [
        {
          name: "Promedio Estancia",
          type: "line",
          data: estancia,
          smooth: true,
          yAxisIndex: 0,
          itemStyle: { color: "#9b59b6" },
          areaStyle: { color: "rgba(155, 89, 182, 0.3)" },
          symbol: "circle",
          symbolSize: 10,
          lineStyle: { width: 3 },
          label: {
            show: true,
            position: "top",
            formatter: "{c}",
            fontSize: 12,
            color: "#9b59b6",
            fontWeight: "bold"
          }
        },
        {
          name: "Pacientes con Estancia > 10 días",
          type: "bar",
          data: estanciaAlta,
          yAxisIndex: 1,
          barWidth: "25%",
          itemStyle: { color: "rgba(230, 126, 34, 0.6)" },
          label: {
            show: true,
            position: "top",
            formatter: "{c}",
            fontSize: 10,
            color: "#e67e22"
          }
        }
      ]
    };
    chartEstancia?.setOption(option, true);
  }

  /* === HASH Y ESTADO DE ACTUALIZACIÓN === */
  let ultimoHash      = null;
  let currentController = null;

  function generarHash(data) {
    return JSON.stringify({ l: data.labels, o: data.ocupadas, d: data.disponibles, t: data.total, p: data.porcentaje, e: data.estancia });
  }

  async function actualizarDashboard(force = false) {
    const servicio = selectServicio.value;
    const empresa = selectEmpresa.value;

    if (!servicio) return;

    if (currentController) {
      try {
        currentController.abort();
      } catch {}
    }

    currentController = new AbortController();
    const timeoutId = setTimeout(() => currentController.abort(), 30000); // Timeout de 30 segundos

    try {
      const response = await fetch("/hospitalizacion/datos_censo_grafico", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ servicio, empresa }),
        signal: currentController.signal
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      const data = await response.json();

      const hash = generarHash(data);
      if (!force && hash === ultimoHash) return;

      ultimoHash = hash;

      // Convertir labels a nombres legibles
      const labelsConvertidas = (data.labels || []).map(l => nombresServicios[l] || l);
      const labelsAbreviados = abreviarLabels(labelsConvertidas);
      const porcentajeNumeros = (data.porcentaje || []).map(Number);

      // Actualizar UI
      mainDashboard.style.display = "block";
      placeholderMessage.style.display = "none";

      actualizarKPIs(data);
      renderizarGraficoDisponibilidad(data, labelsAbreviados, porcentajeNumeros);
      generarTarjetasServicios(data);
      renderizarGraficoEstancia(data, labelsAbreviados);

      // Análisis adicionales solo si el modal está abierto; si no, marcar pendiente
      if (modalAbierto) {
        actualizarAnalisisAdicionales();
      } else {
        analisisPendiente = true;
      }

      setTimeout(() => { chartBarras?.resize(); chartEstancia?.resize(); }, 100);
      setLastUpdateToNow();
    } catch (error) {
      if (error.name !== "AbortError") console.error("Error actualizando dashboard:", error);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /* === ÚLTIMA ACTUALIZACIÓN === */
  function formatFecha12Horas(date = new Date()) {
    const diasSemana = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
    const meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    
    let horas = date.getHours();
    const minutos = date.getMinutes().toString().padStart(2, "0");
    const ampm = horas >= 12 ? "pm" : "am";
    horas = horas % 12 || 12;
    
    return `${diasSemana[date.getDay()]}, ${date.getDate()} ${meses[date.getMonth()]} ${horas}:${minutos} ${ampm}`;
  }

  function setLastUpdateEmpty() {
    if (textoActualizacion) textoActualizacion.textContent = "Última actualización: --";
  }

  function setLastUpdateToNow() {
    if (textoActualizacion) textoActualizacion.textContent = `Última actualización: ${formatFecha12Horas()}`;
  }

  function showRefreshIcon() {
    if (iconoRefresh) {
      iconoRefresh.classList.add("fa-spin");
      iconoRefresh.style.display = "inline-block";
    }
  }

  function hideRefreshIcon() {
    setTimeout(() => {
      if (iconoRefresh) {
        iconoRefresh.classList.remove("fa-spin");
        iconoRefresh.style.display = "none";
      }
    }, 300);
  }

  async function performUpdateWithIcon(force = false) {
    if (!selectServicio.value) {
      setLastUpdateEmpty();
      return;
    }

    showRefreshIcon();
    setLastUpdateToNow();

    try {
      await actualizarDashboard(force);
    } finally {
      hideRefreshIcon();
    }
  }

  /* === ACTUALIZACIÓN AUTOMÁTICA === */
  let minuteTimeoutId = null;
  let minuteIntervalId = null;

  function startAutomaticUpdates() {
    stopAutomaticUpdates();
    performUpdateWithIcon(false);

    const now = new Date();
    const msUntilNextMinute = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();

    minuteTimeoutId = setTimeout(() => {
      performUpdateWithIcon(false);
      minuteIntervalId = setInterval(() => {
        performUpdateWithIcon(false);
      }, 60000);
    }, msUntilNextMinute);
  }

  function stopAutomaticUpdates() {
    if (minuteTimeoutId) clearTimeout(minuteTimeoutId);
    if (minuteIntervalId) clearInterval(minuteIntervalId);
  }

  /* === DESCARGAR EXCEL === */
  if (btnExcel) {
    btnExcel.addEventListener("click", () => {
      const servicio = selectServicio.value;
      const empresa = selectEmpresa.value;

      if (!servicio) {
        alert("Debe seleccionar un servicio");
        return;
      }

      const formData = new FormData();
      formData.append("servicio", servicio);
      formData.append("empresa", empresa);

      fetch("/hospitalizacion/reporte_censo", {
        method: "POST",
        body: formData
      })
        .then(res => res.blob())
        .then(blob => {
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `Censo_${servicio}_${new Date().toISOString().split("T")[0]}.xlsx`;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          document.body.removeChild(a);
        })
        .catch(err => console.error("Error descargando Excel:", err));
    });
  }

  /* === BOTÓN REFRESCAR MANUAL === */
  if (btnRefrescarManual) {
    btnRefrescarManual.addEventListener("click", () => {
      performUpdateWithIcon(true);
    });
  }

  /* === INICIALIZACIÓN === */
  inicializarCharts();
  inicializarPestanasModal();
  guardarOpcionesServicio();
  deshabilitarEmpresa();   // empresa bloqueada hasta que se seleccione un servicio
  limpiarDashboard();
});
