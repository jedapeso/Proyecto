// hospitalizacion/js/dashboard.js
document.addEventListener('DOMContentLoaded', function() {
    const opciones = ['censo'];

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
});