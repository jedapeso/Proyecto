(() => {
  class CensoDashboard {
    constructor(root = document) {
      this.root = root;
      this.cacheTTL = 300000;
      this.urls = {
        companies: "/hospitalizacion/empresas_por_servicio",
        chart: "/hospitalizacion/datos_censo_grafico",
        analysis: "/hospitalizacion/datos_analisis_adicionales",
        excel: "/hospitalizacion/reporte_censo",
      };
      this.libs = {
        echarts: "https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js",
        bootstrap: "https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js",
      };
      this.names = {
        H1: "Hospitalizacion Piso 1",
        H2: "Hospitalizacion Piso 2",
        H3: "Hospitalizacion Piso 3",
        UA: "UCI",
        TS: "General",
      };
      this.modalTitles = {
        "1": "<i class='fas fa-clock'></i> Promedio de Estancia por Servicio",
        "2": "<i class='fas fa-shield'></i> Analisis de Asegurador",
        "3": "<i class='fas fa-birthday-cake'></i> Distribucion por Rango de Edad",
      };
      this.el = {
        service: root.getElementById("servicio"),
        company: root.getElementById("empresa"),
        excel: root.getElementById("btnDescargarExcel"),
        refresh: root.getElementById("btnRefrescarManual"),
        analysis: root.getElementById("btnAnalisisAdicionales"),
        main: root.getElementById("main-dashboard"),
        placeholder: root.getElementById("mensaje-placeholder"),
        body: root.getElementById("servicios-detalle"),
        wrapper: root.querySelector(".servicios-tabla-wrapper"),
        update: root.getElementById("texto-actualizacion"),
        icon: root.getElementById("icono-refresh"),
        stayCard: root.getElementById("kpi-estancia-card"),
        modal: root.getElementById("reportsModal"),
        modalTitle: root.getElementById("modalReportTitle"),
        modalPlaceholder: root.getElementById("modal-placeholder"),
        barras: root.getElementById("graficoBarras"),
        estancia: root.getElementById("graficoEstancia"),
        asegurador: root.getElementById("graficoAsegurador"),
        rangoEdad: root.getElementById("graficoRangoEdad"),
      };
      this.state = {
        chartInstances: new Map(),
        filters: { servicio: "", empresa: "" },
        cache: new Map(),
        companies: new Map(),
        hashes: { graph: null, analysis: null },
        modalOpen: false,
        modalEventsAttached: false,
        modalInstance: null,
        autoTimeout: null,
        autoInterval: null,
        controller: null,
        chartObserver: null,
        chartObserverTriggered: false,
        pendingGraph: null,
        pendingAnalysis: null,
        virtualRows: [],
        isVirtual: false,
        rowHeight: 52,
        overscan: 8,
        resizeFrame: 0,
        scrollFrame: 0,
      };
      this.bound = {
        click: this.onClick.bind(this),
        change: this.onChange.bind(this),
        resize: this.debounce(() => this.resizeCharts(), 150),
        filter: this.debounce((field) => this.onFilterChange(field), 250),
        scroll: () => {
          if (this.state.scrollFrame) return;
          this.state.scrollFrame = requestAnimationFrame(() => {
            this.state.scrollFrame = 0;
            this.renderVirtualRows();
          });
        },
        shown: async () => {
          this.state.modalOpen = true;
          this.setModalTab("1");
          await this.ensureECharts(true);
          const payload = this.state.cache.get(this.getKey())?.payload;
          if (payload?.grafico) this.renderStayChart(payload.grafico);
          if (payload?.analisis) this.renderAnalysis(payload.analisis);
          await this.loadData({ includeAnalysis: true });
          this.resizeCharts(true);
        },
        hidden: () => {
          this.state.modalOpen = false;
        },
      };
    }

    init() {
      if (!this.el.service || !this.el.company) return;
      this.disableCompany();
      this.clearDashboard();
      this.root.addEventListener("click", this.bound.click);
      this.root.addEventListener("change", this.bound.change);
      window.addEventListener("resize", this.bound.resize);
      this.el.wrapper?.addEventListener("scroll", this.bound.scroll, { passive: true });
      this.initChartObserver();
    }

    getFilters() {
      return { servicio: this.el.service.value || "", empresa: this.el.company.value || "" };
    }

    getKey(filters = this.getFilters()) {
      return `${filters.servicio}|${filters.empresa || "0"}`;
    }

    onClick(event) {
      const target = event.target.closest("button, .modal-tab-btn");
      if (!target) return;
      if (target.id === "btnAnalisisAdicionales") return void this.openModal();
      if (target.id === "btnDescargarExcel") return void this.downloadExcel();
      if (target.id === "btnRefrescarManual") return void this.loadData({ force: true, includeAnalysis: this.state.modalOpen });
      if (target.matches(".modal-tab-btn")) this.setModalTab(target.dataset.modalTab || "1");
    }

    onChange(event) {
      if (event.target === this.el.service) return void this.bound.filter("servicio");
      if (event.target === this.el.company) return void this.bound.filter("empresa");
    }

    async onFilterChange(field) {
      if (field === "servicio") {
        const servicio = this.el.service.value;
        if (!servicio) {
          this.disableCompany();
          this.clearDashboard();
          return;
        }
        await this.loadCompanies(servicio);
      }
      if (!this.el.service.value) return;
      this.state.filters = this.getFilters();
      this.startAutoRefresh();
    }

    async loadCompanies(servicio) {
      const cached = this.state.companies.get(servicio);
      if (cached) return void this.renderCompanies(cached);
      try {
        const companies = await this.fetchJsonWithRetry(this.urls.companies, { serv: servicio }, { retries: 2, timeout: 15000 });
        this.state.companies.set(servicio, companies);
        this.renderCompanies(companies);
      } catch (error) {
        console.error("Error cargando empresas:", error);
        this.disableCompany();
      }
    }

    renderCompanies(companies) {
      const fragment = document.createDocumentFragment();
      const first = document.createElement("option");
      first.value = "";
      first.textContent = "Todas las empresas";
      fragment.appendChild(first);
      companies.forEach((company) => {
        const option = document.createElement("option");
        option.value = company.id;
        option.textContent = company.nombre;
        fragment.appendChild(option);
      });
      this.el.company.replaceChildren(fragment);
      this.el.company.value = "";
      this.el.company.disabled = false;
      this.el.company.style.opacity = "1";
      this.el.company.style.cursor = "pointer";
    }

    disableCompany() {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "-- Seleccione servicio primero --";
      this.el.company.replaceChildren(option);
      this.el.company.value = "";
      this.el.company.disabled = true;
      this.el.company.style.opacity = "0.5";
      this.el.company.style.cursor = "not-allowed";
    }

    startAutoRefresh() {
      this.stopAutoRefresh();
      this.loadData({ includeAnalysis: this.state.modalOpen });
      const now = new Date();
      const wait = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
      this.state.autoTimeout = setTimeout(() => {
        this.loadData({ includeAnalysis: this.state.modalOpen });
        this.state.autoInterval = setInterval(() => this.loadData({ includeAnalysis: this.state.modalOpen }), 60000);
      }, wait);
    }

    stopAutoRefresh() {
      if (this.state.autoTimeout) clearTimeout(this.state.autoTimeout);
      if (this.state.autoInterval) clearInterval(this.state.autoInterval);
      this.state.autoTimeout = null;
      this.state.autoInterval = null;
    }

    async loadData({ force = false, includeAnalysis = false } = {}) {
      const filters = this.getFilters();
      if (!filters.servicio) return null;
      const key = this.getKey(filters);
      const entry = this.state.cache.get(key);
      const fresh = entry && Date.now() - entry.updatedAt < this.cacheTTL;
      if (!force && entry?.payload?.grafico) {
        this.updateUI(entry.payload, { includeAnalysis });
        if (!fresh || (includeAnalysis && !entry.payload.analisis)) this.revalidate(key, filters, includeAnalysis);
        return entry.payload;
      }
      return this.revalidate(key, filters, includeAnalysis, force);
    }

    async revalidate(key, filters, includeAnalysis, force = false) {
      const entry = this.state.cache.get(key) || {};
      if (entry.promise) return entry.promise;
      if (this.state.controller) this.state.controller.abort();
      this.showRefresh();
      const controller = new AbortController();
      this.state.controller = controller;
      const promise = this.fetchDashboardData(filters, includeAnalysis, controller.signal)
        .then((payload) => {
          const merged = {
            grafico: payload.grafico || entry.payload?.grafico || null,
            analisis: payload.analisis || entry.payload?.analisis || null,
          };
          this.state.cache.set(key, { payload: merged, updatedAt: Date.now(), promise: null });
          this.updateUI(merged, { includeAnalysis, force });
          return merged;
        })
        .catch((error) => {
          if (error.name !== "AbortError") console.error("Error actualizando dashboard:", error);
          return entry.payload || null;
        })
        .finally(() => {
          this.hideRefresh();
          const current = this.state.cache.get(key);
          if (current) {
            current.promise = null;
            this.state.cache.set(key, current);
          }
          if (this.state.controller === controller) this.state.controller = null;
        });
      this.state.cache.set(key, { payload: entry.payload || null, updatedAt: entry.updatedAt || 0, promise });
      return promise;
    }

    async fetchDashboardData(filters, includeAnalysis, signal) {
      const payload = { servicio: filters.servicio, empresa: filters.empresa };
      const requests = [
        this.fetchJsonWithRetry(this.urls.chart, payload, { retries: 2, signal, timeout: 30000 }),
        includeAnalysis ? this.fetchJsonWithRetry(this.urls.analysis, payload, { retries: 2, signal, timeout: 30000 }) : Promise.resolve(null),
      ];
      const [grafico, analisis] = await Promise.all(requests);
      return { grafico, analisis };
    }

    async fetchJsonWithRetry(url, payload, { retries = 2, signal, timeout = 20000 } = {}) {
      for (let attempt = 0; attempt <= retries; attempt += 1) {
        try {
          return await this.fetchJson(url, payload, signal, timeout);
        } catch (error) {
          if (error.name === "AbortError" || attempt === retries) throw error;
          await this.delay(300 * (2 ** attempt));
        }
      }
      throw new Error("No se pudo completar la solicitud");
    }

    async fetchJson(url, payload, outerSignal, timeout) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);
      const abort = () => controller.abort();
      outerSignal?.addEventListener("abort", abort, { once: true });
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      } finally {
        clearTimeout(timeoutId);
        outerSignal?.removeEventListener("abort", abort);
      }
    }

    updateUI(payload, { includeAnalysis = false, force = false } = {}) {
      if (!payload?.grafico) return;
      this.el.main.style.display = "block";
      this.el.placeholder.style.display = "none";
      const graphHash = JSON.stringify(payload.grafico);
      const analysisHash = payload.analisis ? JSON.stringify(payload.analisis) : null;
      if (force || graphHash !== this.state.hashes.graph) {
        this.updateKPIs(payload.grafico);
        this.renderTable(payload.grafico);
        this.renderMainChart(payload.grafico);
        if (this.state.modalOpen) this.renderStayChart(payload.grafico);
        else this.state.pendingGraph = payload.grafico;
        this.state.hashes.graph = graphHash;
      }
      if (includeAnalysis && payload.analisis && (force || analysisHash !== this.state.hashes.analysis)) {
        this.renderAnalysis(payload.analisis);
        this.state.hashes.analysis = analysisHash;
      }
      this.setLastUpdate();
    }

    updateKPIs(data) {
      const ocupadas = (data.ocupadas || []).map(Number).reduce((a, b) => a + (b || 0), 0);
      const disponibles = (data.disponibles || []).map(Number).reduce((a, b) => a + (b || 0), 0);
      const porcentajes = (data.porcentaje_gral || []).map(Number);
      const estancia = (data.estancia || []).map(Number).filter((value) => value > 0);
      const promedio = estancia.length ? (estancia.reduce((a, b) => a + b, 0) / estancia.length).toFixed(1) : "0.0";
      this.setText("kpi-ocupadas", ocupadas);
      this.setText("kpi-disponibles", disponibles);
      this.setText("kpi-ocupacion", `${porcentajes.reduce((a, b) => a + (b || 0), 0).toFixed(2)}%`);
      this.setText("kpi-estancia", `${promedio} dias`);
      this.el.stayCard?.classList.remove("estancia-low", "estancia-medium", "estancia-high");
      this.el.stayCard?.classList.add(Number(promedio) > 10 ? "estancia-high" : Number(promedio) >= 7 ? "estancia-medium" : "estancia-low");
    }

    renderTable(data) {
      const rows = (data.labels || []).map((label, index) => ({
        servicio: this.names[label] || label,
        ocupadas: Number(data.ocupadas?.[index]) || 0,
        disponibles: Number(data.disponibles?.[index]) || 0,
        total: Number(data.total?.[index]) || 0,
        porcentaje: Number(data.porcentaje?.[index]) || 0,
        porcentajeGeneral: Number(data.porcentaje_gral?.[index]) || 0,
        estancia: Number(data.estancia?.[index]) || 0,
      }));
      this.state.virtualRows = rows;
      this.state.isVirtual = rows.length > 100;
      this.el.wrapper?.classList.toggle("is-virtualized", this.state.isVirtual);
      if (!this.state.isVirtual) {
        const fragment = document.createDocumentFragment();
        rows.forEach((row) => fragment.appendChild(this.makeRow(row)));
        this.el.body.replaceChildren(fragment);
        return;
      }
      if (this.el.wrapper) this.el.wrapper.scrollTop = 0;
      this.renderVirtualRows();
    }

    renderVirtualRows() {
      if (!this.state.isVirtual || !this.el.wrapper || !this.el.body) return;
      const rows = this.state.virtualRows;
      const visible = Math.ceil((this.el.wrapper.clientHeight || 500) / this.state.rowHeight) + this.state.overscan * 2;
      const start = Math.max(0, Math.floor(this.el.wrapper.scrollTop / this.state.rowHeight) - this.state.overscan);
      const end = Math.min(rows.length, start + visible);
      const fragment = document.createDocumentFragment();
      const top = start * this.state.rowHeight;
      const bottom = Math.max(0, (rows.length - end) * this.state.rowHeight);
      if (top) fragment.appendChild(this.makeSpacer(top));
      rows.slice(start, end).forEach((row) => fragment.appendChild(this.makeRow(row)));
      if (bottom) fragment.appendChild(this.makeSpacer(bottom));
      this.el.body.replaceChildren(fragment);
    }

    makeSpacer(height) {
      const tr = document.createElement("tr");
      tr.className = "table-spacer";
      const td = document.createElement("td");
      td.colSpan = 7;
      td.style.height = `${height}px`;
      tr.appendChild(td);
      return tr;
    }

    makeRow(row) {
      const tr = document.createElement("tr");
      const add = (value, className = "") => {
        const td = document.createElement("td");
        if (className) td.className = className;
        td.textContent = String(value);
        tr.appendChild(td);
      };
      add(row.servicio);
      add(row.ocupadas, "text-center");
      add(row.disponibles, "text-center");
      add(row.total, "text-center");
      tr.appendChild(this.makeOccupancy(row.porcentaje));
      add(`${row.porcentajeGeneral.toFixed(2)}%`, "text-center");
      tr.appendChild(this.makeStay(row.estancia));
      return tr;
    }

    makeOccupancy(value) {
      const td = document.createElement("td");
      td.className = "text-center";
      const wrap = document.createElement("div");
      wrap.className = "servicio-occupancy";
      const bar = document.createElement("div");
      bar.className = "servicio-occupancy-bar";
      const fill = document.createElement("div");
      fill.className = `servicio-occupancy-fill ${value >= 95 ? "high" : value >= 80 ? "medium" : "low"}`;
      fill.style.width = `${Math.max(value, 3)}%`;
      if (value > 20) fill.textContent = `${value.toFixed(2)}%`;
      bar.appendChild(fill);
      wrap.appendChild(bar);
      if (value <= 20) {
        const label = document.createElement("span");
        label.className = "servicio-occupancy-label";
        label.textContent = `${value.toFixed(2)}%`;
        wrap.appendChild(label);
      }
      td.appendChild(wrap);
      return td;
    }

    makeStay(value) {
      const td = document.createElement("td");
      td.className = "text-center";
      const badge = document.createElement("span");
      badge.className = `estancia-badge ${value > 10 ? "estancia-high" : value >= 7 ? "estancia-medium" : "estancia-low"}`;
      badge.textContent = value.toFixed(1);
      td.appendChild(badge);
      return td;
    }

    initChartObserver() {
      if (!("IntersectionObserver" in window) || !this.el.barras) return;
      this.state.chartObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting || this.state.chartObserverTriggered) return;
          this.state.chartObserverTriggered = true;
          this.ensureECharts(false).then(() => this.state.pendingGraph && this.renderMainChart(this.state.pendingGraph));
        });
      });
      this.state.chartObserver.observe(this.el.barras);
    }

    async openModal() {
      if (!this.el.service.value) return void alert("Debe seleccionar un servicio");
      await this.ensureBootstrap();
      if (!this.state.modalEventsAttached) {
        this.el.modal.addEventListener("shown.bs.modal", this.bound.shown);
        this.el.modal.addEventListener("hidden.bs.modal", this.bound.hidden);
        this.state.modalEventsAttached = true;
      }
      this.state.modalInstance = window.bootstrap.Modal.getOrCreateInstance(this.el.modal);
      this.setModalTab("1");
      this.state.modalInstance.show();
    }

    setModalTab(tab) {
      this.root.querySelectorAll(".modal-tab-btn").forEach((button) => button.classList.toggle("active", button.dataset.modalTab === tab));
      this.root.querySelectorAll(".modal-tab-content").forEach((content) => content.classList.toggle("active", content.dataset.modalTab === tab));
      if (this.el.modalTitle) this.el.modalTitle.innerHTML = this.modalTitles[tab] || this.modalTitles["1"];
      this.resizeCharts(true);
    }

    renderMainChart(data) {
      if (!window.echarts) {
        this.state.pendingGraph = data;
        if (!this.state.chartObserverTriggered && !this.state.modalOpen) return;
        return void this.ensureECharts(false).then(() => this.renderMainChart(data));
      }
      const chart = this.getChart("barras", this.el.barras);
      if (!chart) return;
      this.state.pendingGraph = null;
      const labels = (data.labels || []).map((label) => (this.names[label] || label).replace("Hospitalizacion", "Hosp"));
      const colors = {
        ocupadas: "#3498db",
        disponibles: "#2ecc71",
        total: "#9b59b6",
        ocupacion: "#e67e22",
        text: "#08337b",
      };
      chart.setOption({
        tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
        legend: { top: 8, left: "center", textStyle: { color: "#3d4852" } },
        grid: { left: "5%", right: "6%", top: 90, bottom: 28, containLabel: true },
        xAxis: {
          type: "category",
          data: labels,
          axisTick: { alignWithLabel: true },
          axisLine: { lineStyle: { color: "#9fb3c8" } },
          axisLabel: {
            color: colors.text,
            fontWeight: 700,
            margin: 10,
          },
        },
        yAxis: [
          {
            type: "value",
            name: "Camas",
            nameTextStyle: { color: colors.text, fontWeight: 700 },
            axisLabel: { color: "#5b6775" },
            splitLine: { lineStyle: { color: "rgba(131, 150, 173, 0.25)" } },
          },
          {
            type: "value",
            name: "% Ocupacion",
            position: "right",
            min: 0,
            max: 100,
            nameTextStyle: { color: colors.ocupacion, fontWeight: 700 },
            axisLabel: { color: colors.ocupacion },
            splitLine: { show: false },
          },
        ],
        series: [
          {
            name: "Ocupadas",
            type: "bar",
            data: (data.ocupadas || []).map(Number),
            itemStyle: { color: colors.ocupadas, borderRadius: [6, 6, 0, 0] },
            label: { show: true, position: "top", distance: 8, color: colors.ocupadas, fontWeight: 700 },
          },
          {
            name: "Disponibles",
            type: "bar",
            data: (data.disponibles || []).map(Number),
            itemStyle: { color: colors.disponibles, borderRadius: [6, 6, 0, 0] },
            label: {
              show: true,
              position: "top",
              distance: 10,
              color: colors.disponibles,
              fontWeight: 700,
              backgroundColor: "rgba(255,255,255,0.95)",
              padding: [2, 6],
              borderRadius: 10,
            },
          },
          {
            name: "Total",
            type: "bar",
            data: (data.total || []).map(Number),
            itemStyle: { color: colors.total, borderRadius: [6, 6, 0, 0] },
            label: { show: true, position: "top", distance: 8, color: colors.total, fontWeight: 700 },
          },
          {
            name: "% Ocupacion",
            type: "line",
            yAxisIndex: 1,
            z: 5,
            data: (data.porcentaje || []).map((value) => Math.max(0, Math.min(100, Number(value) || 0))),
            itemStyle: { color: colors.ocupacion },
            lineStyle: { color: colors.ocupacion, width: 3 },
            symbolSize: 7,
            label: {
              show: true,
              position: "top",
              distance: 10,
              color: colors.ocupacion,
              fontWeight: 700,
              backgroundColor: "rgba(255,255,255,0.96)",
              borderColor: "rgba(230,126,34,0.25)",
              borderWidth: 1,
              padding: [3, 6],
              borderRadius: 10,
              formatter: ({ value }) => `${Number(value).toFixed(1)}%`,
            },
            labelLayout: { moveOverlap: "shiftY" },
          },
        ],
      }, true);
      this.resizeCharts(false);
    }

    renderStayChart(data) {
      if (!window.echarts || !data) return;
      const chart = this.getChart("estancia", this.el.estancia);
      if (!chart) return;
      const labels = (data.labels || []).map((label) => (this.names[label] || label).replace("Hospitalizacion", "Hosp"));
      chart.setOption({
        tooltip: { trigger: "axis", axisPointer: { type: "cross" } },
        legend: { top: 8, left: "center" },
        grid: { left: "4%", right: "4%", top: 60, bottom: 20, containLabel: true },
        xAxis: { type: "category", data: labels, axisLabel: { interval: 0 } },
        yAxis: [{ type: "value", name: "Promedio de dias" }, { type: "value", name: "Pacientes > 10", position: "right", splitLine: { show: false } }],
        series: [
          { name: "Promedio Estancia", type: "line", data: (data.estancia || []).map(Number), smooth: true, itemStyle: { color: "#9b59b6" }, areaStyle: { color: "rgba(155,89,182,.18)" }, label: { show: true, position: "top" } },
          { name: "Pacientes con estancia alta", type: "bar", yAxisIndex: 1, data: (data.estancia_alta || []).map(Number), itemStyle: { color: "rgba(230,126,34,.65)" }, label: { show: true, position: "top" } },
        ],
      }, true);
    }

    renderAnalysis(data) {
      this.state.pendingAnalysis = data;
      if (!this.state.modalOpen || !window.echarts) return;
      this.el.modalPlaceholder?.classList.remove("show");
      this.renderStayChart(this.state.pendingGraph || this.state.cache.get(this.getKey())?.payload?.grafico);
      const asegurador = this.getChart("asegurador", this.el.asegurador);
      const rango = this.getChart("rangoEdad", this.el.rangoEdad);
      if (asegurador) {
        const labels = data.asegurador?.labels || [];
        const valores = data.asegurador?.valores || [];
        asegurador.setOption({
          tooltip: {
            trigger: "item",
            backgroundColor: "rgba(0, 0, 0, 0.75)",
            borderColor: "rgba(255, 255, 255, 0.2)",
            textStyle: { color: "#fff", fontSize: 11 },
            formatter: (params) => `${params.name}: ${params.value} (${params.percent}%)`,
          },
          grid: { left: 0, right: 0, top: 0, bottom: 0, containLabel: false },
          legend: {
            type: "plain",
            orient: "horizontal",
            bottom: 5,
            left: 0,
            right: 0,
            width: "100%",
            itemWidth: 16,
            itemHeight: 12,
            itemGap: 16,
            data: labels,
            textStyle: {
              fontSize: 9,
              overflow: "truncate",
              width: 140,
              ellipsis: "...",
              padding: [0, 0, 0, 4],
            },
            icon: "circle",
            pageIconColor: "#999",
            pageTextStyle: { color: "#999" },
          },
          series: [{
            type: "pie",
            radius: ["22%", "55%"],
            center: ["50%", "40%"],
            label: { show: false },
            labelLine: { show: false },
            emphasis: {
              itemStyle: { borderColor: "#fff", borderWidth: 2 },
              label: { show: false },
            },
            data: labels.length ? labels.map((label, index) => ({ name: label, value: Number(valores[index]) || 0 })) : [{ name: "Sin datos", value: 0 }],
          }],
        }, true);
      }
      if (rango) {
        const labels = data.rango_edad?.labels || [];
        const valores = (data.rango_edad?.valores || []).map(Number);
        const total = valores.reduce((a, b) => a + (b || 0), 0) || 1;
        const porcentajes = valores.map((v) => Number(((v / total) * 100).toFixed(2)));
        const maxVal = Math.max(...valores, 1);
        const maxPct = Math.max(...porcentajes, 1);
        rango.setOption({
          tooltip: {
            trigger: "axis",
            axisPointer: { type: "shadow" },
            formatter: (params) => params.map((p) =>
              `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${p.color};margin-right:6px;"></span>${p.seriesName}: <b>${p.value}${p.seriesIndex === 1 ? "%" : ""}</b>`
            ).join("<br/>"),
          },
          legend: {
            top: 4,
            right: 8,
            itemWidth: 12,
            itemHeight: 12,
            textStyle: { fontSize: 11 },
          },
          grid: { left: "6%", right: "7%", top: 52, bottom: 28, containLabel: true },
          xAxis: {
            type: "category",
            data: labels,
            axisTick: { alignWithLabel: true },
            axisLabel: { interval: 0, fontSize: 11, fontWeight: 600, color: "#08337b" },
          },
          yAxis: [
            {
              type: "value",
              name: "Pacientes",
              nameTextStyle: { color: "#3498db", fontWeight: 700, fontSize: 11 },
              max: 100,
              axisLabel: { color: "#3498db", fontSize: 10 },
              splitLine: { lineStyle: { color: "rgba(131,150,173,0.2)" } },
            },
            {
              type: "value",
              name: "Porcentaje",
              position: "right",
              max: 100,
              nameTextStyle: { color: "#e67e22", fontWeight: 700, fontSize: 11 },
              axisLabel: { color: "#e67e22", fontSize: 10, formatter: "{value}%" },
              splitLine: { show: false },
            },
          ],
          series: [
            {
              name: "Pacientes",
              type: "bar",
              yAxisIndex: 0,
              data: valores,
              barMaxWidth: 52,
              itemStyle: { color: "#3498db", borderRadius: [4, 4, 0, 0] },
              label: {
                show: true,
                position: "insideTop",
                distance: 6,
                color: "#fff",
                fontWeight: 700,
                fontSize: 12,
              },
            },
            {
              name: "Porcentaje",
              type: "line",
              yAxisIndex: 1,
              data: porcentajes,
              smooth: 0.3,
              z: 5,
              symbolSize: 8,
              itemStyle: { color: "#e67e22" },
              lineStyle: { color: "#e67e22", width: 2.5 },
              label: {
                show: true,
                position: "top",
                distance: 8,
                color: "#c0392b",
                fontWeight: 700,
                fontSize: 11,
                backgroundColor: "rgba(255,255,255,0.92)",
                borderColor: "rgba(230,126,34,0.4)",
                borderWidth: 1,
                padding: [2, 5],
                borderRadius: 4,
                formatter: ({ value }) => `${value}%`,
              },
            },
          ],
        }, true);
      }
      this.state.pendingAnalysis = null;
      this.resizeCharts(true);
    }

    getChart(key, element) {
      if (!window.echarts || !element) return null;
      if (!this.state.chartInstances.has(key)) this.state.chartInstances.set(key, window.echarts.init(element));
      return this.state.chartInstances.get(key);
    }

    resizeCharts(modalOnly = false) {
      if (this.state.resizeFrame) cancelAnimationFrame(this.state.resizeFrame);
      this.state.resizeFrame = requestAnimationFrame(() => {
        this.state.resizeFrame = 0;
        this.state.chartInstances.forEach((chart, key) => {
          if (modalOnly && key === "barras") return;
          chart.resize();
        });
      });
    }

    async ensureBootstrap() {
      if (window.bootstrap?.Modal) return;
      await this.loadScript(this.libs.bootstrap, "bootstrap");
    }

    async ensureECharts(modalOnly) {
      if (window.echarts) return;
      await this.loadScript(this.libs.echarts, "echarts");
      if (!modalOnly && this.state.pendingGraph) this.renderMainChart(this.state.pendingGraph);
      if (this.state.modalOpen) {
        const payload = this.state.cache.get(this.getKey())?.payload;
        if (payload?.grafico) this.renderStayChart(payload.grafico);
        if (payload?.analisis) this.renderAnalysis(payload.analisis);
      }
    }

    loadScript(src, key) {
      const stateKey = `${key}Promise`;
      if (this.state[stateKey]) return this.state[stateKey];
      this.state[stateKey] = new Promise((resolve, reject) => {
        const existing = this.root.querySelector(`script[data-dynamic-script="${key}"]`);
        if (existing) {
          existing.addEventListener("load", resolve, { once: true });
          existing.addEventListener("error", reject, { once: true });
          return;
        }
        const script = document.createElement("script");
        script.src = src;
        script.async = true;
        script.dataset.dynamicScript = key;
        script.addEventListener("load", resolve, { once: true });
        script.addEventListener("error", () => reject(new Error(`No se pudo cargar ${key}`)), { once: true });
        document.body.appendChild(script);
      });
      return this.state[stateKey];
    }

    async downloadExcel() {
      const filters = this.getFilters();
      if (!filters.servicio) return void alert("Debe seleccionar un servicio");
      const form = new FormData();
      form.append("servicio", filters.servicio);
      form.append("empresa", filters.empresa);
      try {
        const response = await fetch(this.urls.excel, { method: "POST", body: form });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `Censo_${filters.servicio}_${new Date().toISOString().slice(0, 10)}.xlsx`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      } catch (error) {
        console.error("Error descargando Excel:", error);
      }
    }

    clearDashboard() {
      this.stopAutoRefresh();
      this.el.main.style.display = "none";
      this.el.placeholder.style.display = "block";
      this.el.body?.replaceChildren();
      this.state.hashes.graph = null;
      this.state.hashes.analysis = null;
      this.state.pendingGraph = null;
      this.state.pendingAnalysis = null;
      this.setText("kpi-ocupadas", 0);
      this.setText("kpi-disponibles", 0);
      this.setText("kpi-ocupacion", "0%");
      this.setText("kpi-estancia", "0 dias");
      if (this.el.update) this.el.update.textContent = "Ultima actualizacion: --";
      this.state.chartInstances.forEach((chart) => chart.clear());
    }

    setText(id, value) {
      const element = this.root.getElementById(id);
      if (element) element.textContent = String(value);
    }

    setLastUpdate() {
      if (!this.el.update) return;
      const date = new Date();
      const weekdays = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"];
      const months = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
      let hours = date.getHours();
      const minutes = String(date.getMinutes()).padStart(2, "0");
      const suffix = hours >= 12 ? "pm" : "am";
      hours = hours % 12 || 12;
      this.el.update.textContent = `Ultima actualizacion: ${weekdays[date.getDay()]}, ${date.getDate()} ${months[date.getMonth()]} ${hours}:${minutes} ${suffix}`;
    }

    showRefresh() {
      if (!this.el.icon) return;
      this.el.icon.classList.add("fa-spin");
      this.el.icon.style.display = "inline-block";
    }

    hideRefresh() {
      if (!this.el.icon) return;
      setTimeout(() => {
        this.el.icon.classList.remove("fa-spin");
        this.el.icon.style.display = "none";
      }, 250);
    }

    delay(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    debounce(callback, delay) {
      let timer = null;
      return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => callback(...args), delay);
      };
    }

    dispose() {
      this.stopAutoRefresh();
      this.state.controller?.abort();
      this.state.chartObserver?.disconnect();
      this.el.wrapper?.removeEventListener("scroll", this.bound.scroll);
      if (this.state.modalEventsAttached) {
        this.el.modal.removeEventListener("shown.bs.modal", this.bound.shown);
        this.el.modal.removeEventListener("hidden.bs.modal", this.bound.hidden);
      }
      this.root.removeEventListener("click", this.bound.click);
      this.root.removeEventListener("change", this.bound.change);
      window.removeEventListener("resize", this.bound.resize);
      this.state.chartInstances.forEach((chart) => chart.dispose());
      this.state.chartInstances.clear();
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    const dashboard = new CensoDashboard(document);
    dashboard.init();
    window.addEventListener("beforeunload", () => dashboard.dispose(), { once: true });
  });
})();
