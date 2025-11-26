// Datos de ejemplo de pacientes (puedes cargar estos datos por AJAX si lo prefieres)
const pacientes = [
    { identificacion: "101", nombre: "Juan Pérez" },
    { identificacion: "102", nombre: "Ana Torres" },
    { identificacion: "103", nombre: "Carlos Ruiz" },
];

const btn = document.getElementById("insertarPacienteBtn");
const popup = document.getElementById("popupPacientes");
const closeBtn = document.querySelector(".close");
const buscador = document.getElementById("buscadorPaciente");
const lista = document.getElementById("listaPacientes");
const tablaBody = document.querySelector("#tablaCirugia tbody");

let pacientesTablero = [];

// Abrir popup
btn.onclick = function() {
    popup.style.display = "block";
    mostrarPacientes("");
};

// Cerrar popup
closeBtn.onclick = function() {
    popup.style.display = "none";
};

// Buscar pacientes en la lista
buscador.oninput = function() {
    mostrarPacientes(buscador.value);
};

function mostrarPacientes(filtro) {
    lista.innerHTML = "";
    const filtrados = pacientes.filter(p =>
        p.nombre.toLowerCase().includes(filtro.toLowerCase())
        || p.identificacion.includes(filtro)
    );
    filtrados.forEach(p => {
        const li = document.createElement("li");
        li.textContent = `${p.identificacion} - ${p.nombre}`;
        li.onclick = function() {
            agregarPacienteATabla(p);
            popup.style.display = "none";
        };
        lista.appendChild(li);
    });
}

// Agregar paciente a la tabla principal
function agregarPacienteATabla(paciente) {
    if (!pacientesTablero.find(p => p.identificacion === paciente.identificacion)) {
        pacientesTablero.push({...paciente, estado: "PREPARACION"});
        renderTabla();
    }
}

// Renderizar la tabla con los pacientes actuales
function renderTabla() {
    tablaBody.innerHTML = "";
    pacientesTablero.forEach((p, idx) => {
        const fila = document.createElement("tr");
        fila.innerHTML = `
            <td>${p.identificacion}</td>
            <td>${p.nombre}</td>
            <td>
                <select onchange="cambiarEstado(${idx}, this)">
                    <option value="PREPARACION" ${p.estado === "PREPARACION" ? "selected" : ""}>PREPARACION</option>
                    <option value="CIRUGIA" ${p.estado === "CIRUGIA" ? "selected" : ""}>CIRUGIA</option>
                    <option value="RECUPERACION" ${p.estado === "RECUPERACION" ? "selected" : ""}>RECUPERACION</option>
                </select>
            </td>
            <td>
                <button onclick="eliminarPaciente(${idx})">Eliminar</button>
            </td>
        `;
        tablaBody.appendChild(fila);
    });
}

// Cambiar estado del paciente
window.cambiarEstado = function(idx, select) {
    pacientesTablero[idx].estado = select.value;
    renderTabla();
}

// Eliminar paciente de la tabla
window.eliminarPaciente = function(idx) {
    pacientesTablero.splice(idx, 1);
    renderTabla();
}
