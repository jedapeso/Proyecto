// ========== VARIABLES PRINCIPALES ==========
let pacientes = [];
let pacientesTablero = [];

const btnInsertar = document.getElementById("insertarPacienteBtn");
const popup = document.getElementById("popupPacientes");
const btnCerrar = document.getElementById("cerrarModal");
const buscador = document.getElementById("buscadorPaciente");
const lista = document.getElementById("listaPacientes");
const contenedor = document.getElementById("contenedorPacientes");
const horaActualizacion = document.getElementById("hora-actualizacion");

// ========== ICONOS SVG ==========
const iconos = {
    eliminar: `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>`
};

// ========== AUXILIARES ==========
function estadoLetraADescripcion(letra) {
    switch (letra) {
        case "P": return "PREPARACION";
        case "Q": return "CIRUGIA";
        case "R": return "RECUPERACION";
        default: return "PREPARACION";
    }
}

function descripcionAEstadoLetra(descr) {
    switch (descr) {
        case "PREPARACION": return "P";
        case "CIRUGIA": return "Q";
        case "RECUPERACION": return "R";
        default: return "P";
    }
}

function getIconoEstado(estado) {
    switch(estado) {
        case "PREPARACION": return "🧘";
        case "CIRUGIA": return "⚕️";
        case "RECUPERACION": return "🛏️";
        default: return "📋";
    }
}

function actualizarHora() {
    const ahora = new Date();
    if (horaActualizacion) {
        horaActualizacion.textContent = ahora.toLocaleTimeString('es-CO');
    }
}

// ========== CARGA DESDE PACMCIR1 ==========
function cargarPacientesTablero() {
    fetch("/tableros/cirugia/pacientes")
        .then(r => r.json())
        .then(data => {
            if (data.success && Array.isArray(data.pacientes)) {
                pacientesTablero = data.pacientes.map(p => ({
                    identificacion: p.id,
                    nombre: p.nombre,
                    estado: estadoLetraADescripcion(p.estado || "P")
                }));
                renderTarjetas();
                actualizarHora();
            }
        })
        .catch(error => {
            console.error("Error:", error);
            pacientesTablero = [];
            renderTarjetas();
        });
}

// ========== INICIALIZACIÓN ==========
window.addEventListener("DOMContentLoaded", function() {
    cargarPacientesTablero();
    actualizarHora();
});

// ========== ABRIR/CERRAR MODAL ==========
if (btnInsertar) {
    btnInsertar.onclick = function() {
        popup.classList.remove("hidden");
        fetch("/tableros/cirugia/pacientes/disponibles")
            .then(r => r.json())
            .then(data => {
                if (data.success && Array.isArray(data.pacientes)) {
                    pacientes = data.pacientes.map(p => ({
                        identificacion: p.id,
                        nombre: p.nombre
                    }));
                    mostrarPacientes("");
                }
            })
            .catch(() => {
                pacientes = [];
                mostrarPacientes("");
            });
    };
}

if (btnCerrar) {
    btnCerrar.onclick = function() {
        popup.classList.add("hidden");
    };
}

if (popup) {
    popup.onclick = function(e) {
        if (e.target === popup) {
            popup.classList.add("hidden");
        }
    };
}

// ========== BÚSQUEDA ==========
if (buscador) {
    buscador.oninput = function() {
        mostrarPacientes(buscador.value);
    };
}

function mostrarPacientes(filtro) {
    if (!lista) return;
    
    lista.innerHTML = "";
    const filtrados = pacientes.filter(p =>
        p.nombre.toLowerCase().includes(filtro.toLowerCase()) ||
        p.identificacion.includes(filtro)
    );
    
    if (filtrados.length === 0) {
        lista.innerHTML = '<li class="px-4 py-8 text-center text-gray-500">No se encontraron pacientes</li>';
        return;
    }
    
    filtrados.forEach(p => {
        const li = document.createElement("li");
        li.className = "px-4 py-3 border-b border-gray-200 hover:bg-gray-50 cursor-pointer transition-colors";
        li.textContent = `${p.identificacion} - ${p.nombre}`;
        li.onclick = function() {
            insertarPaciente(p.identificacion, p.nombre);
            popup.classList.add("hidden");
        };
        lista.appendChild(li);
    });
}

// ========== INSERTAR ==========
function insertarPaciente(identificacion, nombre) {
    fetch("/tableros/cirugia/pacientes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identificacion, nombre })
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            cargarPacientesTablero();
        } else {
            alert(data.error || "Error al insertar paciente.");
        }
    })
    .catch(error => {
        console.error("Error:", error);
        alert("Error al insertar paciente.");
    });
}

// ========== CAMBIAR ESTADO ==========
function cambiarEstadoPaciente(identificacion, nuevoEstado) {
    const estadoLetra = descripcionAEstadoLetra(nuevoEstado);
    
    fetch("/tableros/cirugia/pacientes/estado", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identificacion, estado: estadoLetra })
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            cargarPacientesTablero();
        } else {
            alert(data.error || "Error al cambiar estado.");
        }
    })
    .catch(error => {
        console.error("Error:", error);
        alert("Error al cambiar estado.");
    });
}

// ========== ELIMINAR ==========
function eliminarPaciente(identificacion) {
    if (!confirm("¿Está seguro de eliminar este paciente del tablero?")) {
        return;
    }
    
    fetch("/tableros/cirugia/pacientes", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identificacion })
    })
    .then(r => r.json())
    .then(data => {
        if (data.success) {
            cargarPacientesTablero();
        } else {
            alert(data.error || "Error al eliminar paciente.");
        }
    })
    .catch(error => {
        console.error("Error:", error);
        alert("Error al eliminar paciente.");
    });
}

// ========== RENDERIZAR TARJETAS ULTRA COMPACTAS ==========
function renderTarjetas() {
    if (!contenedor) return;
    
    contenedor.innerHTML = "";
    
    if (pacientesTablero.length === 0) {
        contenedor.innerHTML = `
            <div class="col-span-2 bg-white rounded-lg shadow p-12 text-center text-gray-500">
                <p class="text-lg font-medium">No hay pacientes en el tablero</p>
                <p class="text-sm mt-2">Haz clic en "Insertar Paciente" para agregar uno</p>
            </div>
        `;
        return;
    }
    
    pacientesTablero.forEach(p => {
        const card = document.createElement("div");
        card.className = "bg-white rounded-lg shadow hover:shadow-md transition-shadow py-2 px-3";
        
        card.innerHTML = `
            <div class="flex items-center justify-between gap-3">
                <!-- DATOS DEL PACIENTE -->
                <div class="seccion-paciente flex-1 min-w-0">
                    <div class="mb-0.5">
                        <span class="text-xs font-semibold text-gray-400 uppercase tracking-wide">Paciente</span>
                    </div>
                    <h3 class="text-sm font-bold text-gray-800 truncate leading-tight">${p.nombre}</h3>
                    <p class="text-xs text-gray-500 mt-0.5">ID: ${p.identificacion}</p>
                </div>
                
                <!-- ESTADOS -->
                <div class="seccion-estados flex-shrink-0">
                    <div class="mb-0.5 text-center">
                        <span class="text-xs font-semibold text-gray-400 uppercase tracking-wide">Estados</span>
                    </div>
                    <div class="flex gap-2">
                        <div class="estado-item" onclick="cambiarEstadoPaciente('${p.identificacion}', 'PREPARACION')">
                            <div class="estado-circulo preparacion ${p.estado === 'PREPARACION' ? 'activo' : ''}">
                                ${getIconoEstado('PREPARACION')}
                            </div>
                            <span class="text-xs text-gray-500 font-medium">Prep.</span>
                        </div>
                        
                        <div class="estado-item" onclick="cambiarEstadoPaciente('${p.identificacion}', 'CIRUGIA')">
                            <div class="estado-circulo cirugia ${p.estado === 'CIRUGIA' ? 'activo' : ''}">
                                ${getIconoEstado('CIRUGIA')}
                            </div>
                            <span class="text-xs text-gray-500 font-medium">Cirugía</span>
                        </div>
                        
                        <div class="estado-item" onclick="cambiarEstadoPaciente('${p.identificacion}', 'RECUPERACION')">
                            <div class="estado-circulo recuperacion ${p.estado === 'RECUPERACION' ? 'activo' : ''}">
                                ${getIconoEstado('RECUPERACION')}
                            </div>
                            <span class="text-xs text-gray-500 font-medium">Recup.</span>
                        </div>
                    </div>
                </div>
                
                <!-- ACCIONES -->
                <div class="seccion-acciones flex-shrink-0">
                    <div class="mb-0.5 text-center">
                        <span class="text-xs font-semibold text-gray-400 uppercase tracking-wide">Acciones</span>
                    </div>
                    <div class="flex gap-2">
                        <div class="accion-item" onclick="eliminarPaciente('${p.identificacion}')">
                            <div class="accion-circulo eliminar">
                                ${iconos.eliminar}
                            </div>
                            <span class="text-xs text-gray-500 font-medium">Eliminar</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        contenedor.appendChild(card);
    });
}
