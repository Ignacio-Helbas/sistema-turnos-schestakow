// ==========================================
// MÓDULO RECEPCIÓN
// js/recepcion.js
// ==========================================

import {
    db,
    collection,
    query,
    where,
    getDocs,
    doc,
    getDoc,
    updateDoc,
    deleteDoc,
    writeBatch,
    serverTimestamp,
    limit
} from "./firebase.js";

import {
    mostrarAlerta,
    mostrarExito,
    pedirConfirmacion,
    abrirModal,
    cerrarModal,
    escaparHTML
} from "./ui.js";

import {
    obtenerSesionActual
} from "./auth.js";

// Estado de Recepción
let bdMedicosDinamica = {};
let duracionTurnoGlobal = 15;
let modulacionPorMedico = {};

let fechaRecepcionSeleccionada = '';
let medicoSeleccionadoRecepcion = '';
let medicoUidSeleccionadoRecepcion = '';
let especialidadSeleccionadaRecepcion = '';
let horaSeleccionadaRecepcion = '';

export function setCatalogosRecepcion(datos) {
    if (datos.bdMedicos) bdMedicosDinamica = datos.bdMedicos;
    if (datos.duracionGlobal !== undefined) duracionTurnoGlobal = datos.duracionGlobal;
    if (datos.modulacion) modulacionPorMedico = datos.modulacion;
}

export function obtenerEstadoRecepcion() {
    return {
        fechaRecepcionSeleccionada,
        medicoSeleccionadoRecepcion,
        medicoUidSeleccionadoRecepcion,
        especialidadSeleccionadaRecepcion,
        horaSeleccionadaRecepcion
    };
}

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
        opts += `<option value="${escaparHTML(m.nombre)}" data-uid="${escaparHTML(m.uid)}">${escaparHTML(m.nombre)}</option>`;
    });
    selectMed.innerHTML = opts;
}

export function buscarAgendaRecepcion() {
    especialidadSeleccionadaRecepcion = document.getElementById('reception-especialidad')?.value;
    const selectMed = document.getElementById('reception-medico');
    medicoSeleccionadoRecepcion = selectMed?.value;
    const selectedOption = selectMed ? selectMed.options[selectMed.selectedIndex] : null;
    medicoUidSeleccionadoRecepcion = selectedOption ? (selectedOption.getAttribute('data-uid') || '') : '';
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
            else if (turno.estado === "En Espera") badgeColor = "bg-teal-100 text-teal-800";
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
                            <button onclick="registrarLlegadaRecepcion('${turno.idDoc}')" class="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-1 rounded hover:bg-emerald-100 font-bold transition mr-1">Registrar llegada</button>
                            <button onclick="cancelarTurnoRecepcion('${turno.idDoc}')" class="text-xs bg-red-50 text-red-600 border border-red-200 px-2 py-1 rounded hover:bg-red-100 font-bold transition">Liberar</button>
                        ` : (turno.estado === "En Espera" ? `
                            <span class="text-[11px] font-bold text-teal-700 bg-teal-50 px-2 py-1 rounded border border-teal-200 inline-block mr-1">En Sala</span>
                            <button onclick="cancelarTurnoRecepcion('${turno.idDoc}')" class="text-xs bg-red-50 text-red-600 border border-red-200 px-2 py-1 rounded hover:bg-red-100 font-bold transition">Liberar</button>
                        ` : '')}
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

export async function registrarLlegadaRecepcion(idDoc) {
    try {
        await updateDoc(doc(db, "turnos", idDoc), {
            estado: "En Espera",
            llegadaEn: serverTimestamp()
        });
        mostrarExito("Llegada Registrada", "El paciente fue ingresado en la Sala de Espera.");
        generarAgendaRecepcion();
    } catch (e) {
        console.error("Error al registrar llegada:", e);
        mostrarAlerta("Error", "No se pudo registrar la llegada del paciente.");
    }
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

        const medUid = medicoUidSeleccionadoRecepcion || 'medico_demo';
        const slotId = `${medUid}_${fechaRecepcionSeleccionada}_${horaSeleccionadaRecepcion.replace(':', '')}`;
        const slotRef = doc(db, "disponibilidad", slotId);
        const turnoRef = doc(collection(db, "turnos"));

        const sesionActual = obtenerSesionActual();
        const batch = writeBatch(db);
        batch.set(slotRef, {
            medicoUid: medUid,
            fecha: fechaRecepcionSeleccionada,
            horario: horaSeleccionadaRecepcion,
            creadoEn: serverTimestamp()
        });

        batch.set(turnoRef, {
            especialidad: especialidadSeleccionadaRecepcion,
            medico: medicoSeleccionadoRecepcion,
            medicoUid: medUid,
            fecha: fechaRecepcionSeleccionada,
            horario: horaSeleccionadaRecepcion,
            pacienteNombre: nombre,
            pacienteDni: dni,
            pacienteCelular: celular,
            pacienteEmail: email || "",
            canal: "Presencial",
            estado: "Confirmado Presencial",
            codigoConfirmacion: turnoRef.id,
            creadoEn: serverTimestamp(),
            creadoPor: sesionActual?.uid || null,
            llegadaEn: null,
            inicioConsultaEn: null,
            finConsultaEn: null,
            canceladoPor: null,
            canceladoEn: null,
            reprogramadoDe: null,
            timestamp: serverTimestamp()
        });

        await batch.commit();

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
        const snapT = await getDoc(doc(db, "turnos", idDoc));
        const batch = writeBatch(db);
        batch.update(doc(db, "turnos", idDoc), {
            estado: "Cancelado en Recepción",
            canceladoEn: serverTimestamp(),
            canceladoPor: "recepcion"
        });
        if (snapT.exists()) {
            const dataT = snapT.data();
            const slotId = `${dataT.medicoUid || medicoUidSeleccionadoRecepcion}_${dataT.fecha}_${dataT.horario.replace(':', '')}`;
            batch.delete(doc(db, "disponibilidad", slotId));
        }
        await batch.commit();
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
                    promesas.push(updateDoc(doc(db, "turnos", documento.id), {
                        estado: "Cancelado: " + motivo,
                        canceladoEn: serverTimestamp(),
                        canceladoPor: "recepcion"
                    }));
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
        // Silencioso
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

// Exponer en window para manejadores inline del DOM
window.actualizarMedicosRecepcion = actualizarMedicosRecepcion;
window.buscarAgendaRecepcion = buscarAgendaRecepcion;
window.generarAgendaRecepcion = generarAgendaRecepcion;
window.abrirModalDarTurno = abrirModalDarTurno;
window.confirmarTurnoRecepcionFirebase = confirmarTurnoRecepcionFirebase;
window.cancelarTurnoRecepcion = cancelarTurnoRecepcion;
window.registrarLlegadaRecepcion = registrarLlegadaRecepcion;
window.ejecutarAusenciaEmergencia = ejecutarAusenciaEmergencia;
window.descargarExcelRecepcion = descargarExcelRecepcion;
window.simularAutocompletado = simularAutocompletado;
window.toggleTimeSelector = toggleTimeSelector;
