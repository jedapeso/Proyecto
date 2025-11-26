// ========== VARIABLES PRINCIPALES ==========
let pacientes = [];         // Lista para buscar y mostrar en el popup
let pacientesTablero = [];  // Lista de pacientes en el tablero principal BD

const btn = document.getElementById("insertarPacienteBtn");
const popup = document.getElementById("popupPacientes");
const closeBtn = document.querySelector(".close");
const buscador = document.getElementById("buscadorPaciente");
const lista = document.getElementById("listaPacientes");
const tablaBody = document.querySelector("#tablaCirugia tbody");

// ========== AUXILIARES: ESTADO LETRA/DESCRIPCIÓN ==========
function estadoLetraADescripcion(letra) {
    switch (letra) {
        case "P": return "PREPARACION";
        case "Q": return "CIRUGIA";
        case "R": return "RECUPERACION";
        default: return "";
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

// ========== CARGA TABLA PRINCIPAL AL INICIAR / REFRESCAR ==========
function cargarPacientesTablero() {
    fetch("/tableros/cirugia/pacientes")
        .then(r => r.json())
        .then(data => {
            if (data.success && Array.isArray(data.pacientes)) {
                pacientesTablero = data.pacientes.map(p => ({
                    identificacion: p.id,
                    nombre: p.nombre,
                    estado: estadoLetraADescripcion(p.estado)
                }));
                renderTabla();
            }
        });
}
window.addEventListener("DOMContentLoaded", cargarPacientesTablero);

// ========== ABRIR POPUP DE INSERTAR, NO TOCA LA GRILLA ==========
btn.onclick = function() {
    popup.style.display = "block";
    // Solo trae los pacientes y permite buscarlos
    fetch("/tableros/cirugia/pacientes/disponibles")
        .then(r => r.json())
        .then(data => {
            if (data.success && Array.isArray(data.pacientes)) {
                // Puedes filtrar aquí si quieres excluir los que ya están en el tablero
                pacientes = data.pacientes.map(p => ({
                    identificacion: p.id,
                    nombre: p.nombre
                }));
                mostrarPacientes("");
            } else {
                pacientes = [];
                mostrarPacientes("");
            }
        })
        .catch(() => {
            pacientes = [];
            mostrarPacientes("");
        });
};

// ========== CERRAR POPUP ==========
closeBtn.onclick = function() {
    popup.style.display = "none";
};

// ========== BUSCAR PACIENTES EN EL POPUP ==========
buscador.oninput = function() {
    mostrarPacientes(buscador.value);
};

function mostrarPacientes(filtro) {
    lista.innerHTML = "";
    const filtrados = pacientes.filter(p =>
        p.nombre.toLowerCase().includes(filtro.toLowerCase()) ||
        p.identificacion.includes(filtro)
    );
    filtrados.forEach(p => {
        const li = document.createElement("li");
        li.textContent = `${p.identificacion} - ${p.nombre}`;
        li.onclick = function() {
            insertarPaciente(p.identificacion, p.nombre);
            popup.style.display = "none";
        };
        lista.appendChild(li);
    });
}

// ========== INSERTAR PACIENTE EN LA BD Y ACTUALIZAR TABLA ==========
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
    });
}

// ========== CAMBIAR ESTADO ==========
function cambiarEstadoPaciente(identificacion, estadoLetra) {
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
    });
}

// ========== ELIMINAR PACIENTE ==========
function eliminarPaciente(identificacion) {
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
    });
}

// ========== RENDERIZAR LA TABLA PRINCIPAL ==========
function renderTabla() {
    tablaBody.innerHTML = "";
    if (pacientesTablero.length === 0) {
        const fila = document.createElement("tr");
        fila.innerHTML = `<td colspan="4" style="text-align: center;">No hay pacientes en el tablero</td>`;
        tablaBody.appendChild(fila);
        return;
    }
    pacientesTablero.forEach(p => {
        const estadoLetra = descripcionAEstadoLetra(p.estado);
        const fila = document.createElement("tr");
        fila.innerHTML = `
            <td>${p.identificacion}</td>
            <td>${p.nombre}</td>
            <td>
                <select onchange="cambiarEstadoPaciente('${p.identificacion}', this.value)">
                    <option value="P" ${estadoLetra === "P" ? "selected" : ""}>PREPARACION</option>
                    <option value="Q" ${estadoLetra === "Q" ? "selected" : ""}>CIRUGIA</option>
                    <option value="R" ${estadoLetra === "R" ? "selected" : ""}>RECUPERACION</option>
                </select>
            </td>
            <td>
                <button onclick="eliminarPaciente('${p.identificacion}')">Eliminar</button>
            </td>
        `;
        tablaBody.appendChild(fila);
    });
}
