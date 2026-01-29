document.addEventListener('DOMContentLoaded', function () {
    const opciones = ['convenios', 'medinsumos', 'cargos'];

    // ======== Ocultar bloques al cargar ========
    opciones.forEach(op => {
        const div = document.getElementById('contenido-' + op);
        if (div) div.classList.add('d-none');
    });
    const vacio = document.getElementById('contenido-vacio');
    if (vacio) vacio.classList.remove('d-none');

    // ======== Navegación lateral ========
    opciones.forEach(op => {
        const btn = document.getElementById('opcion-' + op);
        if (btn) {
            btn.addEventListener('click', e => {
                e.preventDefault();
                opciones.forEach(c => {
                    const div = document.getElementById('contenido-' + c);
                    if (div) div.classList.add('d-none');
                });
                if (vacio) vacio.classList.add('d-none');
                const div = document.getElementById('contenido-' + op);
                if (div) div.classList.remove('d-none');
            });
        }
    });

    // ======== Variables globales ========
    const form = document.getElementById("form-cargos");
    const progressContainer = document.getElementById("progress-container");
    const globalBox = document.getElementById("global-status");
    const globalMessages = document.getElementById("global-messages");
    const btnCancelar = document.getElementById("btnCancelarProceso");

    // Estructuras para evitar duplicados en mensajes globales y quitar timestamp
    const globalMessageSet = new Set();
    const globalMessageList = [];

    let pollingInterval = null;
    const resumen = {};
    let cuerpoTabla = null;

    if (!form) return;

    // ======== Funciones auxiliares ========
    function crearEstructuraTablaResumen() {
        progressContainer.innerHTML = `
            <h5 class="mb-2"><i class="fas fa-list me-2"></i>Resumen de Progreso</h5>
            <table id="tabla-resumen" class="table table-sm table-bordered align-middle">
                <thead class="table-light">
                    <tr>
                        <th style="width:20%">Año</th>
                        <th style="width:60%">Estado</th>
                        <th style="width:20%">Tiempo Ejecución</th>
                    </tr>
                </thead>
                <tbody></tbody>
            </table>
        `;
        cuerpoTabla = document.querySelector("#tabla-resumen tbody");
    }

    function actualizarTabla() {
        if (!cuerpoTabla) return;
        cuerpoTabla.innerHTML = "";
        // Mostrar años en orden descendente (2026 → 2006)
        Object.keys(resumen).sort((a, b) => Number(b) - Number(a)).forEach(año => {
            const { icono, color, estado, tiempo } = resumen[año];
            const row = document.createElement("tr");
            row.innerHTML = `
                <td>${año}</td>
                <td><i class="fas ${icono} ${color} me-2"></i>${estado}</td>
                <td class="text-end">${tiempo}</td>
            `;
            cuerpoTabla.appendChild(row);
        });
    }

    function mostrarResumenFinal() {
        const total = Object.keys(resumen).length;
        const finalizados = Object.values(resumen).filter(r => r.estado === "Finalizado").length;
        const sinReg = Object.values(resumen).filter(r => r.estado === "Sin registros").length;
        const cancelados = Object.values(resumen).filter(r => r.estado === "Cancelado").length;
        const fallidos = Object.values(resumen).filter(r => r.estado === "Error").length;

        const resumenHTML = `
            <div class="alert alert-info mt-3">
                <i class="fas fa-chart-pie me-2"></i>
                <strong>Resumen final:</strong> 
                ${finalizados} finalizados, ${sinReg} sin registros, ${cancelados} cancelados, ${fallidos} con error, de un total de ${total} años.
            </div>
        `;
        progressContainer.insertAdjacentHTML("beforeend", resumenHTML);
    }

    function mostrarAlerta(mensaje, tipo = "info") {
        const alerta = document.createElement("div");
        alerta.className = `alert alert-${tipo} mt-3`;
        alerta.innerHTML = mensaje;
        progressContainer.prepend(alerta);
        setTimeout(() => alerta.remove(), 6000);
    }

    function detenerPolling() {
        if (pollingInterval) {
            clearInterval(pollingInterval);
            pollingInterval = null;
        }
    }

    function marcarCancelados() {
        detenerPolling();
        Object.keys(resumen).forEach(año => {
            if (resumen[año].estado === "Procesando...") {
                resumen[año] = { icono: "fa-ban", color: "text-danger", estado: "Cancelado", tiempo: "-" };
            }
        });
        actualizarTabla();
        if (globalBox && globalMessages) {
            globalBox.style.display = "block";
            globalMessages.innerHTML += "🛑 Proceso cancelado por el usuario.<br>";
        }
    }

    // ======== Envío del formulario ========
    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const submitBtn = form.querySelector('button[type="submit"]');
        if (!submitBtn) return;

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa fa-spinner fa-spin me-2"></i> Procesando...';

        crearEstructuraTablaResumen();
        Object.keys(resumen).forEach(k => delete resumen[k]);

        try {
            const response = await fetch(form.action, { method: "POST", headers: { "X-Requested-With": "XMLHttpRequest" } });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();

            if (data.status !== "started") {
                mostrarAlerta("⚠️ No se pudo iniciar el proceso.", "warning");
                submitBtn.disabled = false;
                submitBtn.innerHTML = "Enviar Reporte";
                return;
            }

            const usuario_id = data.usuario_id;
            const añosIniciales = data.anios || [];

            // Inicializar la tabla con los años inmediatamente
            añosIniciales.forEach(año => {
                resumen[año] = { icono: "fa-spinner fa-spin", color: "text-primary", estado: "Procesando...", tiempo: "-" };
            });
            actualizarTabla();

            // ======== Polling de logs ========
            pollingInterval = setInterval(async () => {
                try {
                    const logRes = await fetch(`/facturacion/reporte_cargos_logs/${usuario_id}`);
                    const logData = await logRes.json();

                    if (Array.isArray(logData.logs)) {
                        logData.logs.forEach(linea => {
                            const inicio = linea.match(/Iniciando procesamiento del año (\d{4})/);
                            const fin = linea.match(/Año (\d{4}) finalizado en ([\d.,]+) s/);
                            const sinReg = linea.match(/No se encontraron registros para (\d{4})/);
                            const cancel = linea.match(/Cancelado durante ejecución del año (\d{4})/);

                            if (inicio) {
                                const año = inicio[1];
                                resumen[año] = { icono: "fa-spinner fa-spin", color: "text-primary", estado: "Procesando...", tiempo: "-" };
                            }
                            if (fin) {
                                const año = fin[1];
                                const dur = fin[2];
                                resumen[año] = { icono: "fa-check-circle", color: "text-success", estado: "Finalizado", tiempo: `${dur} s` };
                            }
                            if (sinReg) {
                                const año = sinReg[1];
                                resumen[año] = { icono: "fa-minus-circle", color: "text-secondary", estado: "Sin registros", tiempo: "-" };
                            }
                            if (cancel) {
                                const año = cancel[1];
                                resumen[año] = { icono: "fa-ban", color: "text-danger", estado: "Cancelado", tiempo: "-" };
                            }

                            // Mensajes globales: limpiar timestamp y deduplicar
                            if (
                                linea.includes("📊 Combinando resultados") ||
                                linea.includes("📧 Enviando correo") ||
                                linea.includes("✅ Reporte enviado correctamente") ||
                                linea.includes("⏱️ Duración total") ||
                                linea.includes("✅ Proceso finalizado correctamente") ||
                                linea.includes("🛑 Cancelación detectada")
                            ) {
                                if (globalBox && globalMessages) {
                                    // Quitar timestamp al inicio [HH:MM:SS]
                                    const cleanLine = linea.replace(/^\[\d{2}:\d{2}:\d{2}\]\s*/, '');
                                    // Si es el mensaje de duración en segundos, convertir a minutos y formatear
                                    const durMatch = cleanLine.match(/⏱️\s*Duraci[oó]n total real:\s*([\d.,]+)\s*s\.?/i);
                                    let displayLine = cleanLine;
                                    if (durMatch) {
                                        const sec = parseFloat(durMatch[1].replace(',', '.')) || 0;
                                        const min = Math.round((sec / 60) * 100) / 100;
                                        displayLine = `⏱️ Duración total real: ${min.toFixed(2)} minutos (${sec.toFixed(2)} s)`;
                                    }
                                    if (!globalMessageSet.has(displayLine)) {
                                        globalMessageSet.add(displayLine);
                                        globalMessageList.push(displayLine);
                                    }
                                    globalBox.style.display = "block";
                                    globalMessages.innerHTML = globalMessageList.join("<br>") + "<br>";
                                }
                            }
                        });
                        actualizarTabla();
                    }

                    if (logData.finalizado) {
                        detenerPolling();
                        mostrarResumenFinal();
                        submitBtn.disabled = false;
                        submitBtn.innerHTML = "Enviar Reporte";
                    }

                } catch (err) {
                    console.error("Error al obtener logs:", err);
                    detenerPolling();
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = "Enviar Reporte";
                }
            }, 1500);

        } catch (err) {
            console.error("Error al enviar el reporte:", err);
            mostrarAlerta("❌ Error al ejecutar el proceso: " + err.message, "danger");
            submitBtn.disabled = false;
            submitBtn.innerHTML = "Enviar Reporte";
        }
    });

    // ======== Cancelar proceso ========
    if (btnCancelar) {
        btnCancelar.addEventListener("click", async () => {
            btnCancelar.disabled = true;
            btnCancelar.innerHTML = '<i class="fa fa-spinner fa-spin me-1"></i> Cancelando...';
            try {
                const resp = await fetch("/facturacion/cancelar-reporte-cargos", { method: "POST" });
                const data = await resp.json();
                if (data.status === "cancelado") {
                    mostrarAlerta("🛑 " + data.mensaje, "danger");
                    marcarCancelados();
                } else {
                    mostrarAlerta("⚠️ " + (data.mensaje || "No se pudo cancelar el proceso."), "warning");
                }
            } catch (err) {
                mostrarAlerta("❌ Error al cancelar el proceso.", "danger");
                console.error(err);
            }
            btnCancelar.innerHTML = '<i class="fa fa-ban me-1"></i> Cancelar proceso';
            btnCancelar.disabled = false;
        });
    }
});
