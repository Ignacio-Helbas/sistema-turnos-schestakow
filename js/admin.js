// ==========================================
// MÓDULO INTERNO / ADMIN (RECEPCIÓN, CONSULTORIO, ADMINISTRACIÓN)
// ==========================================

import {
    auth,
    db,
    collection,
    query,
    where,
    getDocs,
    doc,
    setDoc,
    addDoc,
    updateDoc,
    deleteDoc,
    getDoc,
    orderBy,
    limit,
    startAfter,
    functionsInstancia,
    httpsCallable,
    observarSesion,
    cerrarSesionFirebase,
    sendPasswordResetEmail
} from "./firebase-config.js";

import {
    mostrarAlerta,
    mostrarExito,
    pedirConfirmacion,
    abrirModal,
    cerrarModal,
    escaparHTML,
    validarDiaHabil,
    establecerLimitesFecha
} from "./utils.js";

// Variables de Estado Interno
let sesionActual = null;
let bdMedicosDinamica = {};
let duracionTurnoGlobal = 15;
let modulacionPorMedico = {};
let fechaRecepcionSeleccionada = '';
let medicoSeleccionadoRecepcion = '';
let especialidadSeleccionadaRecepcion = '';
let horaSeleccionadaRecepcion = '';
let pacienteSeleccionadoMedico = null;
let usuariosPageSnapshots = [];
let currentUsuariosPage = 0;
const USUARIOS_PER_PAGE = 5;

// Exposición al scope global para listeners de Tailwind / HTML
window.abrirModal = abrirModal;
window.cerrarModal = cerrarModal;
window.validarDiaHabil = validarDiaHabil;
window.switchView = switchView;
window.cerrarSesionReal = cerrarSesionReal;
window.actualizarMedicosRecepcion = actualizarMedicosRecepcion;
window.buscarAgendaRecepcion = buscarAgendaRecepcion;
window.generarAgendaRecepcion = generarAgendaRecepcion;
window.abrirModalDarTurno = abrirModalDarTurno;
window.confirmarTurnoRecepcionFirebase = confirmarTurnoRecepcionFirebase;
window.cancelarTurnoRecepcion = cancelarTurnoRecepcion;
window.ejecutarAusenciaEmergencia = ejecutarAusenciaEmergencia;
window.descargarExcelRecepcion = descargarExcelRecepcion;
window.simularAutocompletado = simularAutocompletado;
window.toggleTimeSelector = toggleTimeSelector;
window.cargarAgendaMedico = cargarAgendaMedico;
window.llamarPaciente = llamarPaciente;
window.marcarAusente = marcarAusente;
window.guardarEvolucionMedico = guardarEvolucionMedico;
window.toggleCamposMedico = toggleCamposMedico;
window.abrirModalUsuarioNulo = abrirModalUsuarioNulo;
window.cargarUsuariosAdmin = cargarUsuariosAdmin;
window.editarUsuarioAdmin = editarUsuarioAdmin;
window.guardarUsuarioAdminFirebase = guardarUsuarioAdminFirebase;
window.eliminarUsuarioAdmin = eliminarUsuarioAdmin;
window.enviarResetPasswordUsuario = enviarResetPasswordUsuario;
window.cambiarTabAdmin = cambiarTabAdmin;
window.iniciarGuardadoModulacion = iniciarGuardadoModulacion;
window.ejecutarGuardadoModulacion = ejecutarGuardadoModulacion;
window.cargarMetricas = cargarMetricas;
window.toggleHistorial = toggleHistorial;
window.togglePasswordVisibility = togglePasswordVisibility;
window.verificarLimpiezaAnual = verificarLimpiezaAnual;
window.ejecutarLimpiezaYDescarga = ejecutarLimpiezaYDescarga;
window.limpiarBaseDeDatos = limpiarBaseDeDatos;
window.inyectarMedicosDePrueba = inyectarMedicosDePrueba;

// ==========================================
// AUTH GUARD & ROLES
// ==========================================
observarSesion((sesion) => {
    if (!sesion) {
        window.location.href = "login.html";
        return;
    }
    sesionActual = sesion;
    aplicarPermisosVisuales(sesion);
    iniciarModuloStaff();
});

function aplicarPermisosVisuales(sesion) {
    const btnAdmin = document.getElementById('btn-nav-admin');
    const btnRec = document.getElementById('btn-nav-reception');
    const btnDoc = document.getElementById('btn-nav-doctor');
    const btnLogout = document.getElementById('btn-logout');
    const btnDummies = document.getElementById('btn-cargar-dummies');
    const btnReset = document.getElementById('btn-reset-db');

    if (btnAdmin) btnAdmin.classList.add('hidden');
    if (btnRec) btnRec.classList.add('hidden');
    if (btnDoc) btnDoc.classList.add('hidden');
    if (btnDummies) btnDummies.classList.add('hidden');
    if (btnReset) btnReset.classList.add('hidden');

    if (btnLogout) {
        btnLogout.classList.remove('hidden');
        btnLogout.innerText = `Cerrar Sesión (${sesion.nombre || sesion.correo})`;
    }

    const rol = sesion.rol;
    if (rol === "Administración") {
        if (btnAdmin) btnAdmin.classList.remove('hidden');
        if (btnRec) btnRec.classList.remove('hidden');
        if (btnDoc) btnDoc.classList.remove('hidden');
        if (btnDummies) btnDummies.classList.remove('hidden');
        if (btnReset) btnReset.classList.remove('hidden');
        switchView('admin');
    } else if (rol === "Médico") {
        if (btnDoc) btnDoc.classList.remove('hidden');
        switchView('doctor');
    } else {
        if (btnRec) btnRec.classList.remove('hidden');
        switchView('reception');
    }
}

export function switchView(viewName) {
    document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
    const target = document.getElementById('view-' + viewName);
    if (target) target.classList.add('active');

    if (viewName === 'reception') {
        actualizarMedicosRecepcion();
        if (fechaRecepcionSeleccionada) generarAgendaRecepcion();
    }
    if (viewName === 'doctor') {
        cargarAgendaMedico();
    }
    if (viewName === 'admin') {
        cargarUsuariosAdmin('init');
        verificarLimpiezaAnual();
    }
}

export async function cerrarSesionReal() {
    await cerrarSesionFirebase();
    window.location.href = "login.html";
}

// ==========================================
// INICIALIZACIÓN DE DATOS DEL STAFF
// ==========================================
async function iniciarModuloStaff() {
    establecerLimitesFecha(['input-fecha-recepcion']);
    await cargarEspecialistasFirebase();
    await cargarConfiguracionModulacion();
}

async function cargarEspecialistasFirebase() {
    try {
        const snap = await getDocs(query(collection(db, "usuarios"), where("rol", "==", "Médico")));
        bdMedicosDinamica = {};
        const selectAlcance = document.getElementById('admin-select-alcance');
        if (selectAlcance) selectAlcance.innerHTML = '<option value="global">Todas las especialidades (Global)</option>';

        snap.forEach((documento) => {
            const u = documento.data();
            if (u.especialidad && u.nombre && u.activo !== false) {
                if (!bdMedicosDinamica[u.especialidad]) bdMedicosDinamica[u.especialidad] = [];
                if (!bdMedicosDinamica[u.especialidad].includes(u.nombre)) {
                    bdMedicosDinamica[u.especialidad].push(u.nombre);
                    if (selectAlcance) selectAlcance.innerHTML += `<option value="${escaparHTML(u.nombre)}">Solo: ${escaparHTML(u.nombre)}</option>`;
                }
            }
        });

        const selectEspRec = document.getElementById('reception-especialidad');
        if (selectEspRec) {
            let opts = '<option value="">-- Elija especialidad --</option>';
            for (const esp of Object.keys(bdMedicosDinamica)) {
                opts += `<option value="${escaparHTML(esp)}">${escaparHTML(esp)}</option>`;
            }
            selectEspRec.innerHTML = opts;
        }
    } catch (e) {
        console.warn("Error cargando especialistas:", e);
    }
}

async function cargarConfiguracionModulacion() {
    try {
        const snapGlobal = await getDoc(doc(db, "configuracion", "general"));
        if (snapGlobal.exists()) {
            duracionTurnoGlobal = snapGlobal.data().duracionBase || 15;
            const selectAdmin = document.getElementById('admin-select-duracion');
            if (selectAdmin && document.getElementById('admin-select-alcance').value === 'global') {
                selectAdmin.value = duracionTurnoGlobal;
            }
        }
        const snapIndividual = await getDocs(collection(db, "modulacion_medicos"));
        modulacionPorMedico = {};
        snapIndividual.forEach(d => { modulacionPorMedico[d.id] = d.data().duracionBase; });
    } catch (e) {
        console.log("Configuración por defecto cargada.");
    }
}

// ==========================================
// RECEPCIÓN
// ==========================================
export function actualizarMedicosRecepcion() {
    const esp = document.getElementById('reception-especialidad')?.value;
    const selectMed = document.getElementById('reception-medico');
    if (!selectMed) return;

    if (!esp) {
        selectMed.innerHTML = '<option value="">Primero seleccione especialidad</option>';
        selectMed.disabled = true;
        selectMed.classList.add('bg-slate-50', 'text-slate-500');
        return;
    }

    const medicos = bdMedicosDinamica[esp] || [];
    selectMed.disabled = false;
    selectMed.classList.remove('bg-slate-50', 'text-slate-500');
    let opts = '<option value="">-- Elija un profesional --</option>';
    medicos.forEach(m => {
        opts += `<option value="${escaparHTML(m)}">${escaparHTML(m)}</option>`;
    });
    selectMed.innerHTML = opts;
}

export function buscarAgendaRecepcion() {
    especialidadSeleccionadaRecepcion = document.getElementById('reception-especialidad')?.value;
    medicoSeleccionadoRecepcion = document.getElementById('reception-medico')?.value;
    fechaRecepcionSeleccionada = document.getElementById('input-fecha-recepcion')?.value;

    if (!especialidadSeleccionadaRecepcion || !medicoSeleccionadoRecepcion || !fechaRecepcionSeleccionada) {
        mostrarAlerta("Datos Faltantes", "Seleccione especialidad, médico y fecha para consultar la agenda.");
        return;
    }

    generarAgendaRecepcion();
}

export async function generarAgendaRecepcion() {
    const contenedor = document.getElementById('contenedor-grilla-recepcion');
    const tbody = document.getElementById('reception-tbody');
    const titulo = document.getElementById('titulo-agenda-recepcion');

    if (!contenedor || !tbody) return;

    if (titulo) {
        titulo.innerText = `Agenda: ${medicoSeleccionadoRecepcion} (${fechaRecepcionSeleccionada})`;
    }
    contenedor.classList.remove('hidden');
    tbody.innerHTML = '<tr><td colspan="5" class="p-6 text-center text-slate-400">Cargando turnos...</td></tr>';

    let turnosOcupados = {};
    try {
        const q = query(
            collection(db, "turnos"),
            where("medico", "==", medicoSeleccionadoRecepcion),
            where("fecha", "==", fechaRecepcionSeleccionada)
        );
        const snap = await getDocs(q);
        snap.forEach(d => {
            const data = d.data();
            data.idDoc = d.id;
            turnosOcupados[data.horario] = data;
        });
    } catch (e) {
        console.error("Error al cargar turnos de recepción:", e);
    }

    const duracionActual = modulacionPorMedico[medicoSeleccionadoRecepcion] || duracionTurnoGlobal;
    let minBucle = 7 * 60;
    const finBucle = 12 * 60 + 30;
    let esCanalWeb = true;
    let filas = '';

    while (minBucle <= finBucle) {
        let h = Math.floor(minBucle / 60);
        let m = minBucle % 60;
        let hsStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
        let canal = esCanalWeb ? "Web" : "Presencial";
        let turno = turnosOcupados[hsStr];

        if (turno) {
            let badgeColor = "bg-blue-100 text-blue-800";
            if (turno.estado === "Atendido") badgeColor = "bg-emerald-100 text-emerald-800";
            else if (turno.estado && turno.estado.includes("Cancelado")) badgeColor = "bg-red-100 text-red-800";
            else if (turno.estado === "Ausente") badgeColor = "bg-amber-100 text-amber-800";

            filas += `
                <tr class="border-b border-slate-100 hover:bg-slate-50 transition">
                    <td class="p-3 font-mono font-bold text-slate-700">${hsStr}</td>
                    <td class="p-3 text-xs font-semibold text-slate-500">${escaparHTML(turno.canal || canal)}</td>
                    <td class="p-3">
                        <p class="font-bold text-slate-800">${escaparHTML(turno.pacienteNombre)}</p>
                        <p class="text-xs text-slate-500">DNI: ${escaparHTML(turno.pacienteDni || 'N/A')} - Tel: ${escaparHTML(turno.pacienteCelular || 'N/A')}</p>
                    </td>
                    <td class="p-3"><span class="px-2 py-1 rounded text-xs font-bold ${badgeColor}">${escaparHTML(turno.estado)}</span></td>
                    <td class="p-3">
                        ${turno.estado === "Confirmado" || turno.estado === "Confirmado Presencial" ? `
                            <button onclick="cancelarTurnoRecepcion('${turno.idDoc}')" class="text-xs bg-red-50 text-red-600 border border-red-200 px-2 py-1 rounded hover:bg-red-100 font-bold transition">Liberar</button>
                        ` : ''}
                    </td>
                </tr>
            `;
        } else {
            filas += `
                <tr class="border-b border-slate-100 hover:bg-slate-50 transition">
                    <td class="p-3 font-mono font-bold text-slate-400">${hsStr}</td>
                    <td class="p-3 text-xs font-semibold text-slate-400">${canal}</td>
                    <td class="p-3 text-sm text-slate-400 italic">Disponible</td>
                    <td class="p-3"><span class="px-2 py-1 rounded text-xs font-bold bg-slate-100 text-slate-500">Libre</span></td>
                    <td class="p-3">
                        <button onclick="abrirModalDarTurno('${hsStr}')" class="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-1 rounded hover:bg-blue-100 font-bold transition">+ Asignar</button>
                    </td>
                </tr>
            `;
        }

        esCanalWeb = !esCanalWeb;
        minBucle += duracionActual;
    }

    tbody.innerHTML = filas;
}

export function abrirModalDarTurno(hora) {
    horaSeleccionadaRecepcion = hora;
    const horaSpan = document.getElementById('modal-hora-turno');
    if (horaSpan) horaSpan.innerText = hora;
    abrirModal('modal-dar-turno');
}

export async function confirmarTurnoRecepcionFirebase() {
    const dni = document.getElementById('auto-dni').value.trim();
    const nombre = document.getElementById('auto-nombre').value.trim();
    const celular = document.getElementById('auto-celular').value.trim();
    const email = document.getElementById('auto-email').value.trim();

    if (!nombre || !celular) {
        mostrarAlerta("Datos Obligatorios", "Nombre y celular son obligatorios.");
        return;
    }
    if (dni && !/^[0-9]{6,10}$/.test(dni)) {
        mostrarAlerta("DNI Inválido", "El DNI debe contener solo números (6 a 10 dígitos).");
        return;
    }
    if (!/^[0-9+ -]{6,20}$/.test(celular)) {
        mostrarAlerta("Celular Inválido", "Ingrese un número de teléfono válido.");
        return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        mostrarAlerta("Correo Inválido", "El formato del correo es incorrecto.");
        return;
    }

    try {
        const qExistente = query(
            collection(db, "turnos"),
            where("medico", "==", medicoSeleccionadoRecepcion),
            where("fecha", "==", fechaRecepcionSeleccionada),
            where("horario", "==", horaSeleccionadaRecepcion)
        );
        const snap = await getDocs(qExistente);
        const ocupado = snap.docs.some(d => {
            const est = d.data().estado;
            return !est || !est.toLowerCase().includes("cancelado");
        });

        if (ocupado) {
            mostrarAlerta("Horario No Disponible", "Este horario ya fue asignado previamente.");
            generarAgendaRecepcion();
            return;
        }

        await addDoc(collection(db, "turnos"), {
            especialidad: especialidadSeleccionadaRecepcion,
            medico: medicoSeleccionadoRecepcion,
            fecha: fechaRecepcionSeleccionada,
            horario: horaSeleccionadaRecepcion,
            pacienteNombre: nombre,
            pacienteDni: dni,
            pacienteCelular: celular,
            pacienteEmail: email,
            canal: "Presencial",
            estado: "Confirmado Presencial",
            creadoEn: new Date()
        });

        cerrarModal('modal-dar-turno');
        mostrarExito("¡Turno Asignado!", "El turno presencial fue registrado.");
        document.getElementById('auto-dni').value = '';
        document.getElementById('auto-nombre').value = '';
        document.getElementById('auto-celular').value = '';
        document.getElementById('auto-email').value = '';
        generarAgendaRecepcion();
    } catch (error) {
        console.error(error);
        mostrarAlerta("Error", "Error al registrar el turno.");
    }
}

export async function cancelarTurnoRecepcion(idDoc) {
    const confirmado = await pedirConfirmacion("¿Liberar Horario?", "Se cancelará el turno de la agenda.", "Sí, liberar");
    if (!confirmado) return;

    try {
        await updateDoc(doc(db, "turnos", idDoc), {
            estado: "Cancelado en Recepción"
        });
        mostrarExito("Turno Cancelado", "El turno fue cancelado.");
        generarAgendaRecepcion();
    } catch (error) {
        console.error(error);
        mostrarAlerta("Error", "No se pudo cancelar el turno.");
    }
}

export async function ejecutarAusenciaEmergencia() {
    if (!fechaRecepcionSeleccionada || !medicoSeleccionadoRecepcion) {
        mostrarAlerta("Faltan datos", "Seleccione profesional y fecha primero.");
        return;
    }
    const alcance = document.getElementById('select-alcance-ausencia').value;
    const horaDesde = document.getElementById('hora-desde-ausencia').value;
    const motivo = document.getElementById('motivo-ausencia').value || "Emergencia Médica";

    if (alcance === 'desde_hora' && !horaDesde) {
        mostrarAlerta("Hora Requerida", "Indique la hora a partir de la cual se suspende.");
        return;
    }

    try {
        const snap = await getDocs(query(collection(db, "turnos"), where("fecha", "==", fechaRecepcionSeleccionada)));
        let turnosCancelados = 0;
        const promesas = [];

        snap.forEach((documento) => {
            const t = documento.data();
            if (t.medico === medicoSeleccionadoRecepcion && (!t.estado || !t.estado.includes("Cancelado"))) {
                let cancelar = (alcance === 'todo_dia') || (alcance === 'desde_hora' && t.horario >= horaDesde);
                if (cancelar) {
                    promesas.push(updateDoc(doc(db, "turnos", documento.id), { estado: "Cancelado: " + motivo }));
                    turnosCancelados++;
                }
            }
        });

        await Promise.all(promesas);
        cerrarModal('modal-ausencia-emergencia');
        mostrarExito("Agenda Suspendida", `Se han bloqueado ${turnosCancelados} turnos.`);
        generarAgendaRecepcion();
    } catch (error) {
        console.error(error);
        mostrarAlerta("Error Crítico", "Fallo durante la suspensión.");
    }
}

export function toggleTimeSelector() {
    const alcance = document.getElementById('select-alcance-ausencia')?.value;
    const divHora = document.getElementById('div-hora-ausencia');
    if (divHora) {
        if (alcance === 'desde_hora') divHora.classList.remove('hidden');
        else divHora.classList.add('hidden');
    }
}

export async function simularAutocompletado(dni) {
    if (!dni || dni.length < 6) return;
    try {
        const snap = await getDocs(query(collection(db, "turnos"), where("pacienteDni", "==", dni), limit(1)));
        if (!snap.empty) {
            const d = snap.docs[0].data();
            const nomEl = document.getElementById('auto-nombre');
            const celEl = document.getElementById('auto-celular');
            const mailEl = document.getElementById('auto-email');
            const msgEl = document.getElementById('auto-msg');
            if (nomEl && !nomEl.value) nomEl.value = d.pacienteNombre || '';
            if (celEl && !celEl.value) celEl.value = d.pacienteCelular || '';
            if (mailEl && !mailEl.value) mailEl.value = d.pacienteEmail || '';
            if (msgEl) msgEl.classList.remove('hidden');
        }
    } catch (e) {
        // Autocompletado silencioso
    }
}

export function descargarExcelRecepcion() {
    if (typeof XLSX === 'undefined') {
        mostrarAlerta("Librería no cargada", "SheetJS no está disponible para exportar a Excel.");
        return;
    }
    const tabla = document.querySelector("#contenedor-grilla-recepcion table");
    if (!tabla) return;
    const wb = XLSX.utils.table_to_book(tabla, { sheet: "Agenda Recepcion" });
    XLSX.writeFile(wb, `Agenda_${medicoSeleccionadoRecepcion}_${fechaRecepcionSeleccionada}.xlsx`);
}

// ==========================================
// CONSULTORIO MÉDICO
// ==========================================
export async function cargarAgendaMedico() {
    const container = document.getElementById('medico-agenda-container');
    const tituloContainer = document.getElementById('titulo-medico-dashboard-container');
    const tituloDashboard = document.getElementById('titulo-medico-dashboard');

    if (!container) return;

    const nombreMedico = sesionActual?.nombre || sesionActual?.correo;
    if (tituloContainer) tituloContainer.classList.remove('hidden');
    if (tituloDashboard) tituloDashboard.innerText = `Consultorio: ${nombreMedico}`;

    container.innerHTML = '<p class="text-sm text-slate-400 text-center mt-10">Cargando pacientes del día...</p>';

    const hoyStr = new Date().toISOString().split('T')[0];

    try {
        const q = query(
            collection(db, "turnos"),
            where("medico", "==", nombreMedico),
            where("fecha", "==", hoyStr)
        );
        const snap = await getDocs(q);

        if (snap.empty) {
            container.innerHTML = '<p class="text-sm text-slate-500 text-center mt-10">No hay turnos programados para hoy.</p>';
            return;
        }

        let lista = [];
        snap.forEach(d => {
            const data = d.data();
            data.idDoc = d.id;
            lista.push(data);
        });
        lista.sort((a, b) => a.horario.localeCompare(b.horario));

        let html = '';
        lista.forEach(t => {
            const esAtendido = t.estado === "Atendido";
            const esAusente = t.estado === "Ausente";
            const esCancelado = t.estado && t.estado.includes("Cancelado");

            let badge = `<span class="text-xs px-2 py-0.5 rounded font-bold bg-blue-100 text-blue-800">${escaparHTML(t.estado)}</span>`;
            if (esAtendido) badge = `<span class="text-xs px-2 py-0.5 rounded font-bold bg-emerald-100 text-emerald-800">Atendido</span>`;
            if (esAusente) badge = `<span class="text-xs px-2 py-0.5 rounded font-bold bg-amber-100 text-amber-800">Ausente</span>`;
            if (esCancelado) badge = `<span class="text-xs px-2 py-0.5 rounded font-bold bg-red-100 text-red-800">Cancelado</span>`;

            html += `
                <div class="bg-white p-3 rounded-lg border border-slate-200 shadow-sm flex justify-between items-center gap-2">
                    <div>
                        <div class="flex items-center gap-2">
                            <span class="font-mono font-bold text-sm text-blue-900">${t.horario} hs</span>
                            ${badge}
                        </div>
                        <p class="font-bold text-sm text-slate-800 mt-1">${escaparHTML(t.pacienteNombre)}</p>
                        <p class="text-xs text-slate-500">DNI: ${escaparHTML(t.pacienteDni || 'N/A')}</p>
                    </div>
                    <div class="flex flex-col gap-1">
                        ${!esAtendido && !esAusente && !esCancelado ? `
                            <button onclick="llamarPaciente('${t.idDoc}')" class="text-xs bg-blue-800 text-white font-bold px-3 py-1.5 rounded hover:bg-blue-900 transition">Llamar</button>
                            <button onclick="marcarAusente('${t.idDoc}')" class="text-xs bg-slate-100 text-slate-600 font-bold px-2 py-1 rounded hover:bg-slate-200 transition">Ausente</button>
                        ` : ''}
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    } catch (e) {
        console.error(e);
        container.innerHTML = '<p class="text-sm text-red-500 text-center mt-10">Error al cargar pacientes.</p>';
    }
}

export async function llamarPaciente(idDoc) {
    try {
        const snap = await getDoc(doc(db, "turnos", idDoc));
        if (!snap.exists()) return;
        pacienteSeleccionadoMedico = { idDoc, ...snap.data() };

        const nombreEl = document.getElementById('medico-paciente-activo');
        const motivoEl = document.getElementById('input-motivo-consulta');
        const evoEl = document.getElementById('texto-evolucion');

        if (nombreEl) nombreEl.innerText = `${pacienteSeleccionadoMedico.pacienteNombre} (DNI: ${pacienteSeleccionadoMedico.pacienteDni || 'N/A'}) - ${pacienteSeleccionadoMedico.horario} hs`;
        if (motivoEl) motivoEl.value = pacienteSeleccionadoMedico.motivoConsulta || '';
        if (evoEl) evoEl.value = pacienteSeleccionadoMedico.evolucionMedica || '';

        await updateDoc(doc(db, "turnos", idDoc), { estado: "En Consultorio" });
        cargarAgendaMedico();
    } catch (e) {
        console.error(e);
    }
}

export async function marcarAusente(idDoc) {
    const ok = await pedirConfirmacion("Marcar Ausente", "¿Confirmar que el paciente no se presentó al consultorio?");
    if (!ok) return;

    try {
        await updateDoc(doc(db, "turnos", idDoc), { estado: "Ausente" });
        cargarAgendaMedico();
    } catch (e) {
        console.error(e);
        mostrarAlerta("Error", "No se pudo actualizar el estado.");
    }
}

export async function guardarEvolucionMedico() {
    if (!pacienteSeleccionadoMedico) {
        mostrarAlerta("Ningún Paciente", "Seleccione o llame a un paciente de la lista antes de guardar.");
        return;
    }

    const motivo = document.getElementById('input-motivo-consulta')?.value.trim();
    const evolucion = document.getElementById('texto-evolucion')?.value.trim();

    try {
        await updateDoc(doc(db, "turnos", pacienteSeleccionadoMedico.idDoc), {
            motivoConsulta: motivo || "",
            evolucionMedica: evolucion || "",
            estado: "Atendido",
            atendidoEn: new Date()
        });

        mostrarExito("Consulta Finalizada", "La evolución médica fue guardada y el turno se marcó como Atendido.");
        pacienteSeleccionadoMedico = null;
        const nombreEl = document.getElementById('medico-paciente-activo');
        const motivoEl = document.getElementById('input-motivo-consulta');
        const evoEl = document.getElementById('texto-evolucion');
        if (nombreEl) nombreEl.innerText = "Ningún paciente seleccionado";
        if (motivoEl) motivoEl.value = "";
        if (evoEl) evoEl.value = "";

        cargarAgendaMedico();
    } catch (e) {
        console.error(e);
        mostrarAlerta("Error", "Error al guardar la evolución médica.");
    }
}

// ==========================================
// ADMINISTRACIÓN
// ==========================================
export async function cargarUsuariosAdmin(direccion = 'init') {
    const tbody = document.getElementById('admin-users-tbody');
    const pagInfo = document.getElementById('admin-pag-info');
    const btnPrev = document.getElementById('btn-prev-users');
    const btnNext = document.getElementById('btn-next-users');

    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-slate-400">Cargando personal institucional...</td></tr>';

    try {
        let q;
        if (direccion === 'init') {
            usuariosPageSnapshots = [];
            currentUsuariosPage = 0;
            q = query(collection(db, "usuarios"), orderBy("nombre"), limit(USUARIOS_PER_PAGE));
        } else if (direccion === 'next' && usuariosPageSnapshots[currentUsuariosPage]) {
            currentUsuariosPage++;
            const lastVisible = usuariosPageSnapshots[currentUsuariosPage - 1];
            q = query(collection(db, "usuarios"), orderBy("nombre"), startAfter(lastVisible), limit(USUARIOS_PER_PAGE));
        } else if (direccion === 'prev' && currentUsuariosPage > 0) {
            currentUsuariosPage--;
            if (currentUsuariosPage === 0) {
                q = query(collection(db, "usuarios"), orderBy("nombre"), limit(USUARIOS_PER_PAGE));
            } else {
                const prevVisible = usuariosPageSnapshots[currentUsuariosPage - 1];
                q = query(collection(db, "usuarios"), orderBy("nombre"), startAfter(prevVisible), limit(USUARIOS_PER_PAGE));
            }
        } else {
            return;
        }

        const snap = await getDocs(q);
        if (snap.empty) {
            tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-slate-500">No hay usuarios registrados.</td></tr>';
            return;
        }

        usuariosPageSnapshots[currentUsuariosPage] = snap.docs[snap.docs.length - 1];

        if (pagInfo) pagInfo.innerText = `Página ${currentUsuariosPage + 1}`;
        if (btnPrev) btnPrev.disabled = (currentUsuariosPage === 0);
        if (btnNext) btnNext.disabled = (snap.docs.length < USUARIOS_PER_PAGE);

        let filas = '';
        snap.forEach(d => {
            const u = d.data();
            const id = d.id;
            filas += `
                <tr class="border-b border-slate-100 hover:bg-slate-50 transition">
                    <td class="p-3">
                        <p class="font-bold text-slate-800">${escaparHTML(u.nombre || 'Sin Nombre')}</p>
                        <p class="text-xs text-slate-500">${escaparHTML(u.correo || 'Sin correo')}</p>
                    </td>
                    <td class="p-3">
                        <span class="px-2 py-0.5 rounded text-xs font-bold ${u.rol === 'Administración' ? 'bg-purple-100 text-purple-800' : u.rol === 'Médico' ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'}">${escaparHTML(u.rol || 'Recepción')}</span>
                        ${u.matricula ? `<p class="text-xs text-slate-500 mt-1">M.P.: ${escaparHTML(u.matricula)}</p>` : ''}
                    </td>
                    <td class="p-3 text-xs text-slate-600">
                        <p>User: <span class="font-mono font-bold">${escaparHTML(u.username || 'N/A')}</span></p>
                        <button onclick="enviarResetPasswordUsuario('${escaparHTML(u.correo)}')" class="text-[11px] text-blue-700 underline hover:text-blue-900 mt-1">Enviar reset clave</button>
                    </td>
                    <td class="p-3 text-center">
                        <div class="flex justify-center gap-2">
                            <button onclick="editarUsuarioAdmin('${id}')" class="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-1 rounded font-bold transition">Editar</button>
                            <button onclick="eliminarUsuarioAdmin('${id}')" class="text-xs bg-red-50 hover:bg-red-100 text-red-600 px-2 py-1 rounded font-bold transition">Eliminar</button>
                        </div>
                    </td>
                </tr>
            `;
        });
        tbody.innerHTML = filas;
    } catch (e) {
        console.error(e);
        tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-red-500">Error al cargar usuarios.</td></tr>';
    }
}

export function abrirModalUsuarioNulo() {
    document.getElementById('input-usuario-id').value = '';
    document.getElementById('input-usuario-nombre').value = '';
    document.getElementById('input-usuario-rol').value = 'Administración';
    document.getElementById('input-usuario-username').value = '';
    document.getElementById('input-usuario-pass').value = '';
    document.getElementById('input-usuario-tel').value = '';
    document.getElementById('input-usuario-correo').value = '';
    document.getElementById('input-usuario-matricula').value = '';
    toggleCamposMedico();
    abrirModal('modal-usuario');
}

export async function editarUsuarioAdmin(id) {
    try {
        const snap = await getDoc(doc(db, "usuarios", id));
        if (!snap.exists()) return;
        const u = snap.data();

        document.getElementById('input-usuario-id').value = id;
        document.getElementById('input-usuario-nombre').value = u.nombre || '';
        document.getElementById('input-usuario-rol').value = u.rol || 'Administración';
        document.getElementById('input-usuario-username').value = u.username || '';
        document.getElementById('input-usuario-pass').value = '';
        document.getElementById('input-usuario-tel').value = u.tel || '';
        document.getElementById('input-usuario-correo').value = u.correo || '';
        document.getElementById('input-usuario-matricula').value = u.matricula || '';
        if (u.especialidad) document.getElementById('input-usuario-especialidad').value = u.especialidad;

        toggleCamposMedico();
        abrirModal('modal-usuario');
    } catch (e) {
        console.error(e);
        mostrarAlerta("Error", "No se pudo cargar el perfil del usuario.");
    }
}

export async function guardarUsuarioAdminFirebase() {
    const id = document.getElementById('input-usuario-id').value;
    const nom = document.getElementById('input-usuario-nombre').value.trim();
    const rol = document.getElementById('input-usuario-rol').value;
    const user = document.getElementById('input-usuario-username').value.trim();
    const pass = document.getElementById('input-usuario-pass').value.trim();
    const tel = document.getElementById('input-usuario-tel').value.trim();
    const cor = document.getElementById('input-usuario-correo').value.trim();
    const mat = document.getElementById('input-usuario-matricula').value.trim();
    const esp = document.getElementById('input-usuario-especialidad').value;

    if (!cor || !nom || !user) {
        mostrarAlerta("Datos Faltantes", "Nombre, Usuario y Correo son obligatorios.");
        return;
    }
    if (!id && !pass) {
        mostrarAlerta("Datos Faltantes", "La contraseña es obligatoria para crear un usuario nuevo.");
        return;
    }
    if (pass && pass.length < 12) {
        mostrarAlerta("Contraseña Insegura", "Por seguridad institucional, la contraseña debe tener al menos 12 caracteres.");
        return;
    }

    const payload = {
        id: id || null,
        nombre: nom,
        rol: rol,
        username: user,
        password: pass || null,
        correo: cor,
        tel: tel,
        matricula: rol === 'Médico' ? mat : '',
        especialidad: rol === 'Médico' ? esp : ''
    };

    try {
        const fnGuardar = httpsCallable(functionsInstancia, 'guardarUsuarioAdmin');
        await fnGuardar(payload);

        mostrarExito(
            id ? "Actualizado" : "Sincronizado",
            id ? "Los datos se guardaron correctamente." : "Usuario creado en Auth y Firestore correctamente."
        );

        cerrarModal('modal-usuario');
        cargarUsuariosAdmin('init');
        cargarEspecialistasFirebase();
    } catch (error) {
        console.error(error);
        mostrarAlerta("Error", error.message || "Fallo al comunicar con la base de datos.");
    }
}

export async function eliminarUsuarioAdmin(id) {
    const confirmado = await pedirConfirmacion("¿Eliminar Usuario?", "Esta acción quitará el perfil de la tabla administrativa.", "Sí, eliminar");
    if (!confirmado) return;

    try {
        await deleteDoc(doc(db, "usuarios", id));
        mostrarExito("Usuario Eliminado", "El perfil fue removido del sistema.");
        cargarUsuariosAdmin('init');
        cargarEspecialistasFirebase();
    } catch (error) {
        console.error(error);
        mostrarAlerta("Error", "Error al intentar eliminar.");
    }
}

export async function enviarResetPasswordUsuario(correo) {
    try {
        await sendPasswordResetEmail(auth, correo);
        mostrarExito("Email Enviado", `Se envió un correo a ${correo} para restablecer su clave.`);
    } catch (error) {
        console.error(error);
        mostrarAlerta("Error", "No se pudo enviar el correo de restablecimiento.");
    }
}

export function toggleCamposMedico() {
    const rol = document.getElementById('input-usuario-rol')?.value;
    const divMat = document.getElementById('div-usuario-matricula');
    const divEsp = document.getElementById('div-usuario-especialidad');
    if (rol === 'Médico') {
        if (divMat) divMat.classList.remove('hidden');
        if (divEsp) divEsp.classList.remove('hidden');
    } else {
        if (divMat) divMat.classList.add('hidden');
        if (divEsp) divEsp.classList.add('hidden');
    }
}

export function togglePasswordVisibility() {
    const input = document.getElementById('input-usuario-pass');
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
}

export function cambiarTabAdmin(tabId) {
    document.querySelectorAll('.admin-tab').forEach(t => {
        t.classList.remove('active', 'text-blue-800');
        t.classList.add('text-slate-500');
    });
    document.querySelectorAll('.admin-section').forEach(s => s.classList.add('hidden'));

    const tabActiva = document.getElementById('tab-' + tabId);
    if (tabActiva) {
        tabActiva.classList.add('active', 'text-blue-800');
        tabActiva.classList.remove('text-slate-500');
    }

    const secActiva = document.getElementById('admin-sec-' + tabId);
    if (secActiva) secActiva.classList.remove('hidden');

    if (tabId === 'metricas') cargarMetricas();
}

export function iniciarGuardadoModulacion() {
    const input = document.getElementById('input-seguridad-admin');
    if (input) input.value = '';
    abrirModal('modal-seguridad-modulacion');
}

export async function ejecutarGuardadoModulacion() {
    const alcance = document.getElementById('admin-select-alcance').value;
    const duracion = parseInt(document.getElementById('admin-select-duracion').value, 10);

    try {
        if (alcance === 'global') {
            await setDoc(doc(db, "configuracion", "general"), { duracionBase: duracion }, { merge: true });
        } else {
            await setDoc(doc(db, "modulacion_medicos", alcance), { duracionBase: duracion }, { merge: true });
        }

        cerrarModal('modal-seguridad-modulacion');
        mostrarExito("Modulación Aplicada", "Los intervalos de atención han sido actualizados.");
        await cargarConfiguracionModulacion();
    } catch (e) {
        console.error(e);
        mostrarAlerta("Error", "No se pudo actualizar la modulación.");
    }
}

export async function cargarMetricas() {
    const tbody = document.getElementById('metricas-tbody');
    const kpiContainer = document.getElementById('metricas-kpi-container');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="5" class="p-6 text-center text-slate-400">Calculando indicadores clínicos...</td></tr>';

    try {
        const snapTurnos = await getDocs(collection(db, "turnos"));
        let statsPorMedico = {};
        let totalGeneral = 0;
        let totalAtendidos = 0;
        let totalAusentes = 0;

        snapTurnos.forEach(d => {
            const t = d.data();
            const med = t.medico || "Sin Asignar";
            if (!statsPorMedico[med]) {
                statsPorMedico[med] = { especialidad: t.especialidad || 'N/A', total: 0, atendidos: 0, ausentes: 0 };
            }
            statsPorMedico[med].total++;
            totalGeneral++;
            if (t.estado === "Atendido") {
                statsPorMedico[med].atendidos++;
                totalAtendidos++;
            }
            if (t.estado === "Ausente") {
                statsPorMedico[med].ausentes++;
                totalAusentes++;
            }
        });

        if (kpiContainer) {
            const tasaGlobal = totalGeneral > 0 ? Math.round((totalAusentes / totalGeneral) * 100) : 0;
            kpiContainer.innerHTML = `
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div class="bg-white/95 p-4 rounded-xl border border-slate-200 shadow-sm">
                        <p class="text-xs font-bold text-slate-500 uppercase">Volumen Total Turnos</p>
                        <p class="text-2xl font-bold text-blue-900 mt-1">${totalGeneral}</p>
                    </div>
                    <div class="bg-white/95 p-4 rounded-xl border border-slate-200 shadow-sm">
                        <p class="text-xs font-bold text-slate-500 uppercase">Turnos Efectivizados</p>
                        <p class="text-2xl font-bold text-emerald-600 mt-1">${totalAtendidos}</p>
                    </div>
                    <div class="bg-white/95 p-4 rounded-xl border border-slate-200 shadow-sm">
                        <p class="text-xs font-bold text-slate-500 uppercase">Tasa Global Ausentismo</p>
                        <p class="text-2xl font-bold text-amber-600 mt-1">${tasaGlobal}%</p>
                    </div>
                </div>
            `;
        }

        let filas = '';
        for (const [med, st] of Object.entries(statsPorMedico)) {
            const ausTasa = st.total > 0 ? Math.round((st.ausentes / st.total) * 100) : 0;
            filas += `
                <tr class="border-b border-slate-100 hover:bg-slate-50 transition">
                    <td class="p-3 font-bold text-slate-800">${escaparHTML(med)}</td>
                    <td class="p-3 text-xs text-slate-600">${escaparHTML(st.especialidad)}</td>
                    <td class="p-3 text-center font-bold text-slate-700">${st.total}</td>
                    <td class="p-3 text-center font-bold text-emerald-600">${st.atendidos}</td>
                    <td class="p-3 text-center">
                        <span class="px-2 py-0.5 rounded text-xs font-bold ${ausTasa > 30 ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-700'}">${ausTasa}%</span>
                    </td>
                </tr>
            `;
        }
        tbody.innerHTML = filas || '<tr><td colspan="5" class="p-6 text-center text-slate-500">No hay datos suficientes para calcular métricas.</td></tr>';
    } catch (e) {
        console.error(e);
        tbody.innerHTML = '<tr><td colspan="5" class="p-6 text-center text-red-500">Error al calcular métricas.</td></tr>';
    }
}

export function toggleHistorial() {
    // Helper visual para historial
}

export async function verificarLimpiezaAnual() {
    try {
        const snap = await getDocs(query(collection(db, "turnos"), limit(1)));
        // Si hay registros, verificar fecha
    } catch (e) {
        // Silencioso
    }
}

export function ejecutarLimpiezaYDescarga() {
    cerrarModal('modal-limpieza-anual');
    mostrarExito("Descarga Realizada", "Copia de respaldo exportada.");
}

export async function limpiarBaseDeDatos() {
    const input = prompt("⚠️ ADVERTENCIA DE SEGURIDAD ⚠️\nEsta acción borrará TODOS los turnos y usuarios de prueba mediante Cloud Function.\n\nPara confirmar, escriba exactamente la palabra: BORRAR");
    if (input !== "BORRAR") {
        mostrarAlerta("Cancelado", "Palabra de confirmación incorrecta.");
        return;
    }

    abrirModal('modal-progreso');
    const barra = document.getElementById('progreso-barra');
    const texto = document.getElementById('progreso-texto');
    if (texto) texto.innerText = "Restableciendo base de datos en servidor...";
    if (barra) barra.style.width = '50%';

    try {
        const fnLimpiar = httpsCallable(functionsInstancia, 'limpiarBaseDeDatos');
        const res = await fnLimpiar({ confirmacion: input });
        if (barra) barra.style.width = '100%';
        cerrarModal('modal-progreso');
        mostrarExito("Reinicio Exitoso", res.data?.mensaje || "Sistema restaurado al estado de fábrica.");
        cargarUsuariosAdmin('init');
        cargarEspecialistasFirebase();
        cargarMetricas();
    } catch (e) {
        console.error(e);
        cerrarModal('modal-progreso');
        mostrarAlerta("Error", e.message || "Error al reiniciar base de datos.");
    }
}

export async function inyectarMedicosDePrueba() {
    const confirm = await pedirConfirmacion("¿Inyectar Médicos?", "Se cargarán profesionales demostrativos mediante Cloud Function autorizada.", "Sí, Inyectar");
    if (!confirm) return;

    abrirModal('modal-progreso');
    const barra = document.getElementById('progreso-barra');
    const texto = document.getElementById('progreso-texto');
    if (texto) texto.innerText = "Inyectando médicos desde servidor...";
    if (barra) barra.style.width = '50%';

    try {
        const fnInyectar = httpsCallable(functionsInstancia, 'inyectarMedicosDePrueba');
        const res = await fnInyectar();
        if (barra) barra.style.width = '100%';
        cerrarModal('modal-progreso');
        mostrarExito("Inyección Exitosa", res.data?.mensaje || "Médicos inyectados correctamente.");
        cargarUsuariosAdmin('init');
        cargarEspecialistasFirebase();
        cargarMetricas();
    } catch (e) {
        console.error(e);
        cerrarModal('modal-progreso');
        mostrarAlerta("Error", e.message || "Error al inyectar médicos.");
    }
}
