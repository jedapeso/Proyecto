document.addEventListener('DOMContentLoaded', function () {
    const opciones = ['estadisticas', 'programacion'];  // ✅ Cambiado 'programacion' por 'turnos'

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
                }
            });
        }
    });

    // Validación profesional
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
});