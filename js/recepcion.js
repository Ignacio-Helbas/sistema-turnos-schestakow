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
    escaparHTML,
    mostrarToast,
    formatearFechaAR,
    formatearHoraAR
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
            let badgeColor = "badge-his badge-his-pendiente";
            if (turno.estado === "Atendido") badgeColor = "badge-his badge-his-atendido";
            else if (turno.estado === "En Espera") badgeColor = "badge-his badge-his-espera";
            else if (turno.estado && turno.estado.includes("Cancelado")) badgeColor = "badge-his badge-his-cancelado";
            else if (turno.estado === "Ausente") badgeColor = "badge-his badge-his-ausente";

            const pacNomEsc = escaparHTML(turno.pacienteNombre || 'Paciente');
            const pacDniEsc = escaparHTML(turno.pacienteDni || '');
            const codEsc = escaparHTML(turno.codigoConfirmacion || '');

            filas += `
                <tr class="border-b border-slate-100 hover:bg-slate-50/80 transition" data-estado="${escaparHTML(turno.estado || '')}">
                    <td class="p-3 font-mono font-bold text-slate-900">${hsStr} hs</td>
                    <td class="p-3 text-xs font-semibold text-slate-500">${escaparHTML(turno.canal || canal)}</td>
                    <td class="p-3">
                        <p class="font-bold text-slate-900 text-sm">${pacNomEsc}</p>
                        <p class="text-xs text-slate-500 font-mono">DNI: ${pacDniEsc || 'N/A'} &bull; Tel: ${escaparHTML(turno.pacienteCelular || 'N/A')}</p>
                    </td>
                    <td class="p-3"><span class="${badgeColor}">${escaparHTML(turno.estado)}</span></td>
                    <td class="p-3">
                        ${turno.estado === "Confirmado" || turno.estado === "Confirmado Presencial" ? `
                            <div class="flex items-center gap-1.5 flex-wrap">
                                <button onclick="registrarLlegadaRecepcion('${turno.idDoc}')" class="btn-his-secondary text-xs px-2.5 py-1" title="Registrar llegada a sala">Marcar llegada</button>
                                <button onclick="reprogramarTurnoRecepcion('${turno.idDoc}', '${pacNomEsc}', '${hsStr}')" class="btn-his-text text-xs px-2 py-1 text-slate-700 hover:text-slate-900 border border-slate-200 rounded" title="Liberar horario para reasignar">Reprogramar</button>
                                <button onclick="imprimirComprobanteTurnoRecepcion('${turno.idDoc}', '${pacNomEsc}', '${pacDniEsc}', '${hsStr}', '${codEsc}')" class="btn-his-text text-xs px-2 py-1 text-slate-700 hover:text-slate-900 border border-slate-200 rounded" title="Imprimir comprobante institucional">Comprobante</button>
                                <button onclick="cancelarTurnoRecepcion('${turno.idDoc}')" class="btn-his-danger text-xs px-2 py-1" title="Cancelar turno">Liberar</button>
                            </div>
                        ` : (turno.estado === "En Espera" ? `
                            <div class="flex items-center gap-1.5 flex-wrap">
                                <span class="badge-his badge-his-espera text-[11px]">En Sala</span>
                                <button onclick="imprimirComprobanteTurnoRecepcion('${turno.idDoc}', '${pacNomEsc}', '${pacDniEsc}', '${hsStr}', '${codEsc}')" class="btn-his-text text-xs px-2 py-1 text-slate-700 hover:text-slate-900 border border-slate-200 rounded" title="Imprimir comprobante institucional">Comprobante</button>
                                <button onclick="cancelarTurnoRecepcion('${turno.idDoc}')" class="btn-his-danger text-xs px-2 py-1">Liberar</button>
                            </div>
                        ` : (turno.estado === "Atendido" ? `
                            <div class="flex items-center gap-1.5">
                                <span class="badge-his badge-his-atendido text-[11px]">Atendido</span>
                                <button onclick="imprimirComprobanteTurnoRecepcion('${turno.idDoc}', '${pacNomEsc}', '${pacDniEsc}', '${hsStr}', '${codEsc}')" class="btn-his-text text-xs px-2 py-1 text-slate-700 hover:text-slate-900 border border-slate-200 rounded" title="Imprimir comprobante">Comprobante</button>
                            </div>
                        ` : ''))}
                    </td>
                </tr>
            `;
        } else {
            filas += `
                <tr class="border-b border-slate-100 hover:bg-slate-50/50 transition" data-estado="Libre">
                    <td class="p-3 font-mono font-bold text-slate-400">${hsStr} hs</td>
                    <td class="p-3 text-xs font-semibold text-slate-400">${canal}</td>
                    <td class="p-3 text-xs text-slate-400 italic">Horario disponible para asignación presencial o web</td>
                    <td class="p-3"><span class="badge-his bg-slate-100 text-slate-500 border-slate-200">Libre</span></td>
                    <td class="p-3">
                        <button onclick="abrirModalDarTurno('${hsStr}')" class="btn-his-primary text-xs px-2.5 py-1 shadow-xs">+ Asignar</button>
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
        mostrarToast("Llegada registrada: paciente ingresado en sala de espera", "success");
        generarAgendaRecepcion();
    } catch (e) {
        console.error("Error al registrar llegada:", e);
        mostrarAlerta("Error", "No se pudo registrar la llegada del paciente.");
    }
}

export async function reprogramarTurnoRecepcion(idDoc, pacienteNombre, horaActual) {
    const confirmar = await pedirConfirmacion(
        "Reprogramar Turno",
        `¿Desea liberar el turno de las ${horaActual} hs de ${pacienteNombre} para asignarle un nuevo horario o fecha en recepción?`,
        "Liberar y Reasignar"
    );
    if (!confirmar) return;

    try {
        const sesion = obtenerSesionActual();
        await updateDoc(doc(db, "turnos", idDoc), {
            estado: "Cancelado - Reprogramación",
            canceladoEn: serverTimestamp(),
            canceladoPor: sesion ? sesion.uid : "recepcion"
        });
        mostrarToast("Turno liberado para su reprogramación", "info");
        generarAgendaRecepcion();
    } catch (e) {
        console.error("Error al reprogramar turno:", e);
        mostrarAlerta("Error", "No se pudo liberar el turno para reprogramación.");
    }
}

export function imprimirComprobanteTurnoRecepcion(idDoc, pacNom, pacDni, hsStr, cod) {
    const elPac = document.getElementById('comp-rec-paciente');
    const elDni = document.getElementById('comp-rec-dni');
    const elCod = document.getElementById('comp-rec-codigo');
    const elEsp = document.getElementById('comp-rec-especialidad');
    const elMed = document.getElementById('comp-rec-medico');
    const elFec = document.getElementById('comp-rec-fecha');
    const elHor = document.getElementById('comp-rec-hora');

    if (elPac) elPac.innerText = pacNom || 'Paciente';
    if (elDni) elDni.innerText = pacDni || '--';
    if (elCod) elCod.innerText = cod ? String(cod).substring(0, 12).toUpperCase() : 'SCH-OK';
    if (elEsp) elEsp.innerText = especialidadSeleccionadaRecepcion || '--';
    if (elMed) elMed.innerText = medicoSeleccionadoRecepcion || '--';
    if (elFec) elFec.innerText = formatearFechaAR(fechaRecepcionSeleccionada) || '--';
    if (elHor) elHor.innerText = formatearHoraAR(hsStr) || '--';

    abrirModal('modal-comprobante-recepcion');
}

export function filtrarAgendaRecepcionPorDni(textoFiltro) {
    const tbody = document.getElementById('reception-tbody');
    if (!tbody) return;
    const inputEl = document.getElementById('reception-filtro-texto');
    const term = (textoFiltro !== undefined ? textoFiltro : (inputEl ? inputEl.value : '')).trim().toLowerCase();
    const rows = tbody.querySelectorAll('tr');
    rows.forEach(tr => {
        if (!term) {
            tr.style.display = '';
            return;
        }
        const text = tr.innerText.toLowerCase();
        tr.style.display = text.includes(term) ? '' : 'none';
    });
}

export function filtrarAgendaPorEstado(estadoFiltro) {
    const tbody = document.getElementById('reception-tbody');
    if (!tbody) return;
    const rows = tbody.querySelectorAll('tr');
    rows.forEach(tr => {
        if (!estadoFiltro || estadoFiltro === 'todos') {
            tr.style.display = '';
            return;
        }
        const text = tr.innerText.toLowerCase();
        if (estadoFiltro === 'en_sala') {
            tr.style.display = text.includes('en sala') || text.includes('en espera') ? '' : 'none';
        } else if (estadoFiltro === 'pendientes') {
            tr.style.display = text.includes('confirmado') ? '' : 'none';
        } else if (estadoFiltro === 'atendidos') {
            tr.style.display = text.includes('atendido') ? '' : 'none';
        }
    });
}

export function abrirModalDarTurno(hora) {
    horaSeleccionadaRecepcion = hora;
    const horaSpan = document.getElementById('modal-hora-turno');
    if (horaSpan) horaSpan.innerText = hora;
    abrirModal('modal-dar-turno');
}

export async function confirmarTurnoRecepcionFirebase() {
    const nombre = document.getElementById('auto-nombre').value.trim();
    const fechaNacimiento = document.getElementById('auto-fecha-nacimiento')?.value || '';
    const dni = document.getElementById('auto-dni').value.trim();
    const coberturaSel = document.getElementById('auto-cobertura')?.value || 'No (Sin Obra Social)';
    const coberturaOtra = document.getElementById('auto-cobertura-otra')?.value.trim() || '';
    const cobertura = (coberturaSel === 'Otra Cobertura' && coberturaOtra) ? coberturaOtra : coberturaSel;
    const celular = document.getElementById('auto-celular').value.trim();
    const email = document.getElementById('auto-email')?.value.trim() || '';

    if (!nombre || !celular) {
        mostrarAlerta("Datos Obligatorios", "Nombre completo y celular son obligatorios.");
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
            pacienteFechaNacimiento: fechaNacimiento,
            pacienteCobertura: cobertura,
            pacienteCelular: celular,
            pacienteEmail: email,
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
        document.getElementById('auto-nombre').value = '';
        if (document.getElementById('auto-fecha-nacimiento')) document.getElementById('auto-fecha-nacimiento').value = '';
        document.getElementById('auto-dni').value = '';
        if (document.getElementById('auto-cobertura')) document.getElementById('auto-cobertura').value = 'No (Sin Obra Social)';
        if (document.getElementById('auto-cobertura-otra')) {
            document.getElementById('auto-cobertura-otra').value = '';
            document.getElementById('div-auto-cobertura-otra')?.classList.add('hidden');
        }
        document.getElementById('auto-celular').value = '';
        if (document.getElementById('auto-email')) document.getElementById('auto-email').value = '';
        const msgEl = document.getElementById('auto-msg');
        if (msgEl) msgEl.classList.add('hidden');
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
        mostrarToast("Turno cancelado y horario liberado", "info");
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
        mostrarToast(`Agenda suspendida: ${turnosCancelados} turnos cancelados por emergencia`, "warning");
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

export function toggleOtraObraSocial(valor) {
    const divOtra = document.getElementById('div-auto-cobertura-otra');
    if (!divOtra) return;
    if (valor === 'Otra Cobertura') {
        divOtra.classList.remove('hidden');
    } else {
        divOtra.classList.add('hidden');
    }
}

export async function simularAutocompletado(dni) {
    if (!dni || dni.length < 6) return;
    try {
        const snap = await getDocs(query(collection(db, "turnos"), where("pacienteDni", "==", dni), limit(1)));
        if (!snap.empty) {
            const d = snap.docs[0].data();
            const nomEl = document.getElementById('auto-nombre');
            const fecEl = document.getElementById('auto-fecha-nacimiento');
            const cobEl = document.getElementById('auto-cobertura');
            const celEl = document.getElementById('auto-celular');
            const mailEl = document.getElementById('auto-email');
            const msgEl = document.getElementById('auto-msg');
            if (nomEl && !nomEl.value) nomEl.value = d.pacienteNombre || '';
            if (fecEl && !fecEl.value) fecEl.value = d.pacienteFechaNacimiento || '';
            if (cobEl && d.pacienteCobertura) {
                const opciones = Array.from(cobEl.options).map(o => o.value);
                if (opciones.includes(d.pacienteCobertura)) {
                    cobEl.value = d.pacienteCobertura;
                } else {
                    cobEl.value = 'Otra Cobertura';
                    const otraInp = document.getElementById('auto-cobertura-otra');
                    if (otraInp) {
                        otraInp.value = d.pacienteCobertura;
                        document.getElementById('div-auto-cobertura-otra')?.classList.remove('hidden');
                    }
                }
            }
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
window.toggleOtraObraSocial = toggleOtraObraSocial;
window.reprogramarTurnoRecepcion = reprogramarTurnoRecepcion;
window.imprimirComprobanteTurnoRecepcion = imprimirComprobanteTurnoRecepcion;
window.filtrarAgendaRecepcionPorDni = filtrarAgendaRecepcionPorDni;
window.filtrarAgendaPorEstado = filtrarAgendaPorEstado;
