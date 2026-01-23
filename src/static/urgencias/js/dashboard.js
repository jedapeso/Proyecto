// urgencias/js/dashboard.js

document.addEventListener('DOMContentLoaded', function() {
    const opciones = ['oportunidad', 'endoscopia','cir256'];

    // Ocultar bloques al iniciar
    opciones.forEach(op => {
        const contenidoDiv = document.getElementById('contenido-' + op);
        if (contenidoDiv) {
            contenidoDiv.classList.add('d-none');
        }
    });

    const vacio = document.getElementById('contenido-vacio');
    if (vacio) {
        vacio.classList.remove('d-none');
    }

    opciones.forEach(op => {
        const btn = document.getElementById('opcion-' + op);
        if (btn) {
            btn.addEventListener('click', function (e) {
                e.preventDefault();

                // Ocultar todos los bloques
                opciones.forEach(c => {
                    const blockToHide = document.getElementById('contenido-' + c);
                    if (blockToHide) blockToHide.classList.add('d-none');
                });

                // Ocultar contenido vacío
                if (vacio) vacio.classList.add('d-none');

                // Mostrar el bloque seleccionado
                const blockToShow = document.getElementById('contenido-' + op);
                if (blockToShow) {
                    blockToShow.classList.remove('d-none');

                    // Limpiar inputs dentro del bloque seleccionado
                    const inputs = blockToShow.querySelectorAll('input[type="date"]');
                    inputs.forEach(input => {
                        input.value = '';
                    });

                    // Eliminar alertas anteriores
                    const oldAlert = blockToShow.querySelector('.alert');
                    if (oldAlert) oldAlert.remove();
                }
            });
        }
    });

    // Validación con alerta bonita
    opciones.forEach(op => {
        const form = document.querySelector(`#contenido-${op} form`);
        if (form) {
            form.addEventListener('submit', function(e) {
                // Elimina alertas viejas
                const oldAlert = form.querySelector('.alert');
                if (oldAlert) oldAlert.remove();

                const fechaInicio = form.querySelector('input[name="fecha_inicio"]').value;
                const fechaFin = form.querySelector('input[name="fecha_fin"]').value;

                if (fechaInicio && fechaFin) {
                    const fechaInicioDate = new Date(fechaInicio);
                    const fechaFinDate = new Date(fechaFin);

                    if (fechaFinDate < fechaInicioDate) {
                        e.preventDefault();

                        const alertDiv = document.createElement('div');
                        alertDiv.className = 'alert alert-warning mt-3';
                        alertDiv.role = 'alert';
                        alertDiv.innerHTML = '<strong>Atención:</strong> La fecha final no puede ser menor que la fecha inicial.';
                        form.appendChild(alertDiv);
                    }
                }
            });
        }
    });

    // --- Lógica asíncrona para CIR256 (evita múltiples clicks y muestra log) ---
    const cirForm = document.querySelector('#contenido-cir256 form');
    if (cirForm) {
        const submitBtn = document.getElementById('cir256-submit');
        const statusDiv = document.getElementById('cir256-status');
        let pollInterval = null;

        function setButtonState(disabled) {
            submitBtn.disabled = disabled;
        }

        async function pollStatus(jobId) {
            try {
                const resp = await fetch(`/urgencias/cir256/status/${jobId}`);
                if (!resp.ok) throw new Error('Error consultando estado');
                const data = await resp.json();
                // Mostrar solo el texto de fase (sin prefijo)
                const phaseText = data.phase_text || (data.phase ? data.phase : (data.status || ''));
                const statusTextDiv = document.getElementById('cir256-status-text');
                if (statusTextDiv) statusTextDiv.innerText = phaseText;

                // Mostrar u ocultar spinner según fase
                const spinner = document.getElementById('cir256-spinner');
                if (data.phase === 'starting' || data.phase === 'anexos') {
                    spinner.classList.remove('d-none');
                } else {
                    spinner.classList.add('d-none');
                }


                if ((data.status === 'finished' || data.phase === 'finished') && data.has_file) {
                    clearInterval(pollInterval);
                    setButtonState(false);
                    // Forzar descarga
                    window.location = `/urgencias/cir256/download/${jobId}`;
                } else if (data.status === 'error' || data.phase === 'error') {
                    clearInterval(pollInterval);
                    setButtonState(false);
                    alert('Ocurrió un error en la generación.');
                }
            } catch (e) {
                console.error(e);
                clearInterval(pollInterval);
                setButtonState(false);
                alert('Error comunicándose con el servidor.');
            }
        }

        submitBtn.addEventListener('click', async function(e) {
            e.preventDefault();
            // Validación rápida
            const fechaInicio = cirForm.querySelector('input[name="fecha_inicio"]').value;
            const fechaFin = cirForm.querySelector('input[name="fecha_fin"]').value;
            const oldAlert = cirForm.querySelector('.alert');
            if (oldAlert) oldAlert.remove();

            if (!fechaInicio || !fechaFin) {
                const alertDiv = document.createElement('div');
                alertDiv.className = 'alert alert-warning mt-3';
                alertDiv.role = 'alert';
                alertDiv.innerHTML = '<strong>Atención:</strong> Complete las fechas antes de generar.';
                cirForm.appendChild(alertDiv);
                return;
            }

            // Desactivar botón y mostrar fase inicial y spinner
            setButtonState(true);
            const statusTextDiv = document.getElementById('cir256-status-text');
            if (statusTextDiv) statusTextDiv.innerText = 'Iniciando la extracción y depuración de Datos';
            const spinner = document.getElementById('cir256-spinner');
            if (spinner) spinner.classList.remove('d-none');

            try {
                const resp = await fetch(`/urgencias/cir256/start`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fecha_inicio: fechaInicio, fecha_fin: fechaFin })
                });

                if (resp.status === 202) {
                    const data = await resp.json();
                    const jobId = data.job_id;
                    // Poll cada 1s
                    pollInterval = setInterval(() => pollStatus(jobId), 1000);
                } else {
                    const err = await resp.json().catch(()=>({error:'error'}));
                    alert('No se pudo iniciar el proceso: ' + (err.error || ''));
                    setButtonState(false);
                }
            } catch (e) {
                console.error(e);
                alert('Error iniciando el proceso');
                setButtonState(false);
            }
        });
    }
});