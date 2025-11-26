// hospitalizacion/js/grestancia.js
document.addEventListener('DOMContentLoaded', function () {
    const selectServicio = document.getElementById('servicio');
    const selectEmpresa = document.getElementById('empresa');
    const canvas = document.getElementById('graficoCenso');
    const interpretacionDiv = document.getElementById('interpretacionGrafica');
    const formularioCenso = document.getElementById('formulario-censo');
    const botonesGrafico = document.getElementById('botones-grafico');
    const btnRegresar = document.getElementById('btnRegresar');
    const excelServicio = document.getElementById('excelServicio');
    const excelEmpresa = document.getElementById('excelEmpresa');

    if (!selectServicio || !selectEmpresa || !canvas || !interpretacionDiv) return;

    let chart = null;

    const nombresServicios = {
        "H1": "Hospitalización Piso 1",
        "H2": "Hospitalización Piso 2",
        "H3": "Hospitalización Piso 3",
        "UA": "UCI"
    };

    async function actualizarGrafico() {
        const servicio = selectServicio.value;
        const empresa = selectEmpresa.value;
        if (!servicio) return;

        try {
            const response = await fetch('/hospitalizacion/datos_censo_grafico', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ servicio, empresa })
            });
            const data = await response.json();

            const porcentaje = data.porcentaje.map(Number);
            const porcentajet = data.porcentajet.map(Number);
            const labelsConvertidas = data.labels.map(l => nombresServicios[l] || l);

            const ctx = canvas.getContext('2d');

            if (chart) {
                chart.data.labels = labelsConvertidas;
                chart.data.datasets[0].data = data.ocupadas;
                chart.data.datasets[1].data = data.disponibles;
                chart.data.datasets[2].data = data.total;
                chart.data.datasets[3].data = porcentaje;
                chart.data.datasets[4].data = porcentajet;
                chart.update();
            } else {
                chart = new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: labelsConvertidas,
                        datasets: [
                            { label: 'Ocupadas', data: data.ocupadas, backgroundColor: '#3498db' },
                            { label: 'Disponibles', data: data.disponibles, backgroundColor: '#2ecc71' },
                            { label: 'Total', data: data.total, backgroundColor: '#9b59b6' },
                            { label: '% Ocupación', data: porcentaje, backgroundColor: '#e67e22' },
                            { label: '% Ocupación Total', data: porcentajet, backgroundColor: '#c91e27ff' }
                        ]
                    },
                    options: {
                        responsive: true,
                        layout: { padding: { top: 10 } },
                        plugins: {
                            title: { display: true, text: 'Censo de Camas por Ubicación' },
                            legend: { labels: { padding: 10 } },
                            tooltip: {
                                callbacks: {
                                    label: function (context) {
                                        const label = context.dataset.label || '';
                                        const value = context.raw;
                                        return label.includes('%') ? `${label}: ${value.toFixed(2)}%` : `${label}: ${value}`;
                                    }
                                }
                            },
                            datalabels: {
                                anchor: 'end',
                                align: 'top',
                                offset: 4,
                                font: { weight: 'bold' },
                                formatter: function (value, context) {
                                    return context.dataset.label.includes('%') ? value.toFixed(2) + '%' : value;
                                }
                            }
                        },
                        scales: { y: { beginAtZero: true, suggestedMax: 110 } }
                    },
                    plugins: [ChartDataLabels]
                });
            }

            // Ocultar formulario y mostrar botones
            formularioCenso?.classList.add('d-none');
            botonesGrafico?.classList.remove('d-none');

            // Actualizar inputs ocultos para Excel
            excelServicio?.setAttribute('value', servicio);
            excelEmpresa?.setAttribute('value', empresa);

            // Mostrar interpretación
            interpretarGrafica(data.labels, data.ocupadas, data.disponibles, data.total, porcentaje, porcentajet);

        } catch (error) {
            console.error("Error al generar gráfico:", error);
        }
    }

    function interpretarGrafica(labels, ocupadas, disponibles, total, porcentaje, porcentajet) {
        let html = '<strong>Interpretación:</strong><br><ul>';
        labels.forEach((servicio, i) => {
            const nombre = nombresServicios[servicio] || servicio;
            html += `<li>En <strong>${nombre}</strong>: ${ocupadas[i]} habitaciones ocupadas y ${disponibles[i]} disponibles.
                     Esto representa un <strong>${porcentaje[i].toFixed(2)}%</strong> de ocupación del servicio y un <strong>${porcentajet[i].toFixed(2)}%</strong> de la ocupación general.</li>`;
        });
        html += '</ul>';
        interpretacionDiv.innerHTML = html;
    }

    // Eventos
    selectServicio.addEventListener('change', actualizarGrafico);
    selectEmpresa.addEventListener('change', actualizarGrafico);

    btnRegresar?.addEventListener('click', () => {
        formularioCenso?.classList.remove('d-none');
        botonesGrafico?.classList.add('d-none');
        interpretacionDiv.innerHTML = '';
        if (chart) {
            chart.destroy();
            chart = null;
        }
    });

    // Si ya hay selección al cargar la página
    if (selectServicio.value) actualizarGrafico();
});
