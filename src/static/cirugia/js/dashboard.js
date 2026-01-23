document.addEventListener('DOMContentLoaded', function () {
    const opciones = ['estadisticas', 'programacion'];
    const formEst = document.getElementById('form-estadisticas');
    const usuarioIdInput = document.getElementById('usuario_id');
    const progressPanel = document.getElementById('progress-panel');
    const progressLogs = document.getElementById('progress-logs');
    let polling = null;

    // Ocultar todos los bloques al inicio
    opciones.forEach(op => {
        const div = document.getElementById('contenido-' + op);
        if (div) div.classList.add('d-none');
    });

    const vacio = document.getElementById('contenido-vacio');
    if (vacio) vacio.classList.remove('d-none');

    opciones.forEach(op => {
        const btn = document.getElementById('opcion-' + op);
        if (btn) {
            btn.addEventListener('click', function (e) {
                e.preventDefault();

                // Oculta todos los bloques
                opciones.forEach(c => {
                    const block = document.getElementById('contenido-' + c);
                    if (block) block.classList.add('d-none');
                });

                // Oculta contenido vacío
                if (vacio) vacio.classList.add('d-none');

                // Muestra el seleccionado
                const blockToShow = document.getElementById('contenido-' + op);
                if (blockToShow) {
                    blockToShow.classList.remove('d-none');

                    // Limpia inputs
                    const inputs = blockToShow.querySelectorAll('input[type="date"]');
                    inputs.forEach(input => input.value = '');

                    // Elimina alertas anteriores
                    const oldAlert = blockToShow.querySelector('.alert');
                    if (oldAlert) oldAlert.remove();

                    // Si es estadísticas, limpiar panel de progreso
                    if (op === 'estadisticas') {
                        if (progressPanel) {
                            progressPanel.classList.add('d-none');
                            // Restaurar spinner y textos
                            const spinnerEl = document.getElementById('progress-spinner');
                            if (spinnerEl) spinnerEl.style.display = '';
                            const progressTitle = document.getElementById('progress-title');
                            if (progressTitle) progressTitle.textContent = 'Generando reporte…';
                            const progressSubtitle = document.getElementById('progress-subtitle');
                            if (progressSubtitle) progressSubtitle.textContent = 'Iniciando...';
                        }
                    }
                }
            });
        }
    });

    // Validación de fechas
    opciones.forEach(op => {
        const form = document.querySelector(`#contenido-${op} form`);
        if (form) {
            form.addEventListener('submit', function (e) {
                const oldAlert = form.querySelector('.alert');
                if (oldAlert) oldAlert.remove();

                const fechaInicio = form.querySelector('input[name="fecha_inicio"]').value;
                const fechaFin = form.querySelector('input[name="fecha_fin"]').value;

                if (fechaInicio && fechaFin) {
                    const ini = new Date(fechaInicio);
                    const fin = new Date(fechaFin);

                    if (fin < ini) {
                        e.preventDefault();
                        const alerta = document.createElement('div');
                        alerta.className = 'alert alert-warning mt-3';
                        alerta.role = 'alert';
                        alerta.innerHTML = '<strong>Atención:</strong> La fecha final no puede ser menor que la inicial.';
                        form.appendChild(alerta);
                    }
                }
            });
        }
    });

    const btnDescargar = document.getElementById('btn-descargar');
    const fechaError = document.getElementById('fecha-error');

    // helper para togglear el botón visualmente
    function setBotonDisabled(state) {
        if (!btnDescargar) return;
        btnDescargar.disabled = !!state;
        if (state) {
            btnDescargar.classList.add('disabled');
            btnDescargar.style.pointerEvents = 'none';
            btnDescargar.style.opacity = '0.65';
        } else {
            btnDescargar.classList.remove('disabled');
            btnDescargar.style.pointerEvents = '';
            btnDescargar.style.opacity = '';
        }
    }

    // Función de validación inmediata de fechas
    function validarFechas() {
        if (!formEst) return false;
        const inicio = formEst.querySelector('input[name="fecha_inicio"]').value;
        const fin = formEst.querySelector('input[name="fecha_fin"]').value;
        if (!inicio || !fin) {
            setBotonDisabled(true);
            if (fechaError) { fechaError.classList.add('d-none'); fechaError.innerHTML = ''; }
            return false;
        }
        const dInicio = new Date(inicio);
        const dFin = new Date(fin);
        if (isNaN(dInicio.getTime()) || isNaN(dFin.getTime())) {
            setBotonDisabled(true);
            if (fechaError) { fechaError.classList.remove('d-none'); fechaError.innerHTML = '<div class="alert alert-danger p-2 mb-0 small">Formato de fecha inválido</div>'; }
            return false;
        }
        if (dInicio > dFin) {
            setBotonDisabled(true);
            if (fechaError) { fechaError.classList.remove('d-none'); fechaError.innerHTML = '<div class="alert alert-danger p-2 mb-0 small">La fecha inicio no puede ser mayor que la fecha fin</div>'; }
            // resaltar inputs
            const inputInicio = formEst.querySelector('input[name="fecha_inicio"]');
            const inputFin = formEst.querySelector('input[name="fecha_fin"]');
            if (inputInicio) inputInicio.classList.add('is-invalid');
            if (inputFin) inputFin.classList.add('is-invalid');
            return false;
        }
        // válido
        setBotonDisabled(false);
        if (fechaError) { fechaError.classList.add('d-none'); fechaError.innerHTML = ''; }
        // remover estilos de invalid
        const inputInicio = formEst.querySelector('input[name="fecha_inicio"]');
        const inputFin = formEst.querySelector('input[name="fecha_fin"]');
        if (inputInicio) inputInicio.classList.remove('is-invalid');
        if (inputFin) inputFin.classList.remove('is-invalid');
        return true;
    }

    // Agregar listeners inmediatos a los inputs de fecha
    if (formEst) {
        const inputInicio = formEst.querySelector('input[name="fecha_inicio"]');
        const inputFin = formEst.querySelector('input[name="fecha_fin"]');
        if (inputInicio) inputInicio.addEventListener('input', validarFechas);
        if (inputFin) inputFin.addEventListener('input', validarFechas);
        // validar al cargar
        validarFechas();
    }

    // Interceptar envío para mostrar progreso y descargar cuando termine
    if (formEst && usuarioIdInput) {
        formEst.addEventListener('submit', function (e) {
            e.preventDefault();

            // Evitar envío si la validación falla
            if (btnDescargar && btnDescargar.disabled) return;

            // Generar usuario_id único para esta sesión
            const usuarioId = `u_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            usuarioIdInput.value = usuarioId;

            // Mostrar panel de progreso
            if (progressPanel) progressPanel.classList.remove('d-none');
            
            const progressTitle = document.getElementById('progress-title');
            const progressSubtitle = document.getElementById('progress-subtitle');
            if (progressTitle) progressTitle.textContent = 'Generando reporte…';
            if (progressSubtitle) progressSubtitle.textContent = 'Iniciando...';

            // Iniciar polling de logs (sin mostrarlos)
            if (polling) {
                clearInterval(polling);
                polling = null;
            }
            let descargaExitosa = false;
            polling = setInterval(async () => {
                try {
                    const res = await fetch(`/cirugia/estadisticas_logs/${usuarioId}`);
                    if (!res.ok) return;
                    const data = await res.json();
                    if (data.finalizado && !descargaExitosa) {
                        clearInterval(polling);
                        polling = null;
                        // Ocultar spinner y actualizar header a estado de éxito
                        const spinnerEl = document.getElementById('progress-spinner');
                        if (spinnerEl) spinnerEl.style.display = 'none';
                        if (progressTitle) {
                            progressTitle.textContent = '✅ Reporte completado';
                        }
                        if (progressSubtitle) {
                            progressSubtitle.textContent = 'El archivo se descargará automáticamente';
                        }
                    }
                } catch (err) {
                    // Ignorar errores transitorios de polling
                }
            }, 1000);

            // Enviar el formulario con fetch y descargar el Excel cuando termine
            const formData = new FormData(formEst);
            fetch(formEst.action, {
                method: 'POST',
                body: formData
            })
            .then(resp => {
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                return resp.blob();
            })
                        .then(blob => {
                                const url = window.URL.createObjectURL(blob);
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = `Estadisticas_Cirugia_${new Date().toISOString().slice(0,10)}.xlsx`;
                                document.body.appendChild(a);
                                a.click();
                                a.remove();
                                window.URL.revokeObjectURL(url);
                                // show success toast if available
                                const toastEl = document.getElementById('download-success-toast');
                                if (toastEl && typeof bootstrap !== 'undefined' && bootstrap.Toast) {
                                    const toast = new bootstrap.Toast(toastEl);
                                    toast.show();
                                }
                                // Marcar descarga exitosa para evitar mostrar error
                                descargaExitosa = true;
                                // Panel se mantiene visible hasta que el usuario genere de nuevo
                        })
            .catch(err => {
                // Solo mostrar error si no hubo descarga exitosa
                if (!descargaExitosa) {
                    const spinnerEl = document.getElementById('progress-spinner');
                    if (spinnerEl) spinnerEl.style.display = 'none';
                    if (progressTitle) progressTitle.textContent = '❌ Error en la generación';
                    if (progressSubtitle) progressSubtitle.textContent = escapeHtml(err.message);
                }
            });
        });
    }

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
});