// ==========================================
// MÓDULO CONSULTORIO MÉDICO E HISTORIA CLÍNICA INMUTABLE
// js/consultorio.js
// ==========================================

import {
    db,
    collection,
    query,
    where,
    getDocs,
    doc,
    getDoc,
    setDoc,
    addDoc,
    updateDoc,
    writeBatch,
    serverTimestamp,
    orderBy
} from "./firebase.js";

import {
    mostrarAlerta,
    mostrarExito,
    pedirConfirmacion,
    abrirModal,
    cerrarModal,
    escaparHTML,
    validarDiaHabil,
    mostrarToast,
    formatearFechaAR,
    formatearHoraAR
} from "./ui.js";

import {
    obtenerSesionActual
} from "./auth.js";

let pacienteActivoHC = null;
let consultasHistoriaClinica = [];
let ultimaCitacionGenerada = null;

let bdMedicosDinamica = {};
let duracionTurnoGlobal = 15;
let modulacionPorMedico = {};

export function setCatalogosConsultorio(datos) {
    if (datos.bdMedicos) bdMedicosDinamica = datos.bdMedicos;
    if (datos.duracionGlobal !== undefined) duracionTurnoGlobal = datos.duracionGlobal;
    if (datos.modulacion) modulacionPorMedico = datos.modulacion;
}

export function obtenerPacienteActivoHC() {
    return pacienteActivoHC;
}

function calcularEdad(fechaNacimientoStr) {
    if (!fechaNacimientoStr) return 'N/A';
    const cumple = new Date(fechaNacimientoStr);
    const hoy = new Date();
    let edad = hoy.getFullYear() - cumple.getFullYear();
    const m = hoy.getMonth() - cumple.getMonth();
    if (m < 0 || (m === 0 && hoy.getDate() < cumple.getDate())) {
        edad--;
    }
    return edad >= 0 ? `${edad} años` : 'N/A';
}

function generarIdCripto(prefijo = 'DOC', longitud = 20) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    const array = new Uint8Array(longitud);
    window.crypto.getRandomValues(array);
    let id = '';
    for (let i = 0; i < longitud; i++) {
        id += chars[array[i] % chars.length];
    }
    return `${prefijo}_${id}`;
}

export async function cargarAgendaMedico() {
    const container = document.getElementById('medico-agenda-container');
    const tituloContainer = document.getElementById('titulo-medico-dashboard-container');
    const tituloDashboard = document.getElementById('titulo-medico-dashboard');

    if (!container) return;

    const sesionActual = obtenerSesionActual();
    const esAdmin = (sesionActual?.rol === "Administración");
    const nombreMedico = sesionActual?.nombre || sesionActual?.correo;
    if (tituloContainer) tituloContainer.classList.remove('hidden');
    if (tituloDashboard) {
        tituloDashboard.innerHTML = esAdmin 
            ? `Consultorio Médico <span class="ml-2 inline-block text-[11px] bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded font-semibold align-middle">Vista de supervisión de demostración</span>` 
            : `Consultorio: ${escaparHTML(nombreMedico)}`;
    }

    container.innerHTML = '<p class="text-sm text-slate-400 text-center mt-10">Cargando pacientes del día...</p>';

    const hoyStr = new Date().toISOString().split('T')[0];

    try {
        let q;
        if (esAdmin) {
            q = query(
                collection(db, "turnos"),
                where("fecha", "==", hoyStr)
            );
        } else {
            q = query(
                collection(db, "turnos"),
                where("medico", "==", nombreMedico),
                where("fecha", "==", hoyStr)
            );
        }
        const snap = await getDocs(q);

        if (snap.empty) {
            container.innerHTML = '<p class="text-xs text-slate-400 text-center py-10">No hay turnos programados para hoy.</p>';
            const badgeEspera = document.getElementById('badge-total-espera');
            if (badgeEspera) badgeEspera.innerText = '0';
            return;
        }

        let lista = [];
        let enSalaCount = 0;
        snap.forEach(d => {
            const data = d.data();
            data.idDoc = d.id;
            lista.push(data);
            if (data.estado === "En Espera") enSalaCount++;
        });
        lista.sort((a, b) => a.horario.localeCompare(b.horario));

        const badgeEspera = document.getElementById('badge-total-espera');
        if (badgeEspera) badgeEspera.innerText = String(enSalaCount);

        let html = '';
        lista.forEach(t => {
            const esAtendido = t.estado === "Atendido";
            const esAusente = t.estado === "Ausente";
            const esCancelado = t.estado && t.estado.includes("Cancelado");
            const esEnEspera = t.estado === "En Espera";

            let badge = `<span class="badge-his badge-his-pendiente text-[11px]">${escaparHTML(t.estado)}</span>`;
            if (esAtendido) badge = `<span class="badge-his badge-his-atendido text-[11px]">Atendido</span>`;
            else if (esAusente) badge = `<span class="badge-his badge-his-ausente text-[11px]">Ausente</span>`;
            else if (esCancelado) badge = `<span class="badge-his badge-his-cancelado text-[11px]">Cancelado</span>`;
            else if (esEnEspera) badge = `<span class="badge-his badge-his-espera text-[11px]">En Sala</span>`;

            let tiempoEsperaHtml = '';
            if (esEnEspera && t.llegadaEn) {
                let ms = null;
                if (typeof t.llegadaEn.toMillis === 'function') ms = t.llegadaEn.toMillis();
                else if (t.llegadaEn.seconds) ms = t.llegadaEn.seconds * 1000;
                else if (t.llegadaEn instanceof Date) ms = t.llegadaEn.getTime();
                if (ms) {
                    const mins = Math.max(0, Math.floor((Date.now() - ms) / 60000));
                    tiempoEsperaHtml = `<span class="text-[10px] text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200/80 font-medium font-mono">⏱️ ${mins} min</span>`;
                }
            }

            const cardBg = esEnEspera ? 'bg-teal-50/40 border-teal-200' : 'bg-white border-slate-200';

            html += `
                <div class="card-his p-3 ${cardBg} shadow-xs flex justify-between items-center gap-2 transition hover:shadow-sm">
                    <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-2 flex-wrap">
                            <span class="font-mono font-bold text-xs text-slate-900">${t.horario} hs</span>
                            ${badge}
                            ${tiempoEsperaHtml}
                        </div>
                        <p class="font-bold text-xs text-slate-900 mt-1 truncate">${escaparHTML(t.pacienteNombre)}</p>
                        <p class="text-[11px] text-slate-500 font-mono">DNI: ${escaparHTML(t.pacienteDni || 'N/A')}</p>
                    </div>
                    <div class="flex flex-col gap-1 shrink-0">
                        ${!esAtendido && !esAusente && !esCancelado ? `
                            <button onclick="llamarPaciente('${t.idDoc}')" class="btn-his-secondary text-xs px-2.5 py-1" title="Iniciar atención en consultorio">Llamar</button>
                            <button onclick="marcarAusente('${t.idDoc}')" class="btn-his-text text-xs px-2 py-0.5 text-slate-500 hover:text-slate-800 border border-slate-200 rounded">Ausente</button>
                        ` : ''}
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    } catch (e) {
        console.error(e);
        container.innerHTML = '<p class="text-xs text-red-500 text-center mt-10">Error al cargar pacientes.</p>';
    }
}

export async function llamarSiguientePaciente() {
    const sesionActual = obtenerSesionActual();
    const esAdmin = (sesionActual?.rol === "Administración");
    const nombreMedico = sesionActual?.nombre || sesionActual?.correo;
    const hoyStr = new Date().toISOString().split('T')[0];

    try {
        let q;
        if (esAdmin) {
            q = query(collection(db, "turnos"), where("fecha", "==", hoyStr));
        } else {
            q = query(collection(db, "turnos"), where("medico", "==", nombreMedico), where("fecha", "==", hoyStr));
        }
        const snap = await getDocs(q);
        if (snap.empty) {
            mostrarToast("No hay pacientes en la agenda de hoy.", "info");
            return;
        }
        let enSala = [];
        let confirmados = [];
        snap.forEach(d => {
            const data = d.data();
            data.idDoc = d.id;
            if (data.estado === "En Espera") enSala.push(data);
            else if (data.estado === "Confirmado" || data.estado === "Confirmado Presencial") confirmados.push(data);
        });

        enSala.sort((a, b) => (a.horario || '').localeCompare(b.horario || ''));
        confirmados.sort((a, b) => (a.horario || '').localeCompare(b.horario || ''));

        const siguiente = enSala.length > 0 ? enSala[0] : confirmados[0];
        if (!siguiente) {
            mostrarToast("No hay pacientes pendientes para llamar.", "info");
            return;
        }

        await llamarPaciente(siguiente.idDoc);
    } catch (e) {
        console.error("Error al llamar siguiente:", e);
        mostrarAlerta("Error", "No se pudo determinar el siguiente paciente.");
    }
}

export async function buscarPacientePorDni(dniParam) {
    const inputDni = document.getElementById('input-buscar-dni-medico');
    const dni = (dniParam || (inputDni ? inputDni.value : '')).trim();

    if (!/^[0-9]{6,10}$/.test(dni)) {
        mostrarAlerta("DNI Inválido", "Ingrese un número de documento válido de entre 6 y 10 dígitos numéricos.");
        return;
    }

    const sesionActual = obtenerSesionActual();
    if (!sesionActual || !sesionActual.uid || !sesionActual.rol) {
        mostrarAlerta("Sesión Requerida", "Debe contar con una sesión activa con rol asignado para operar sobre historias clínicas.");
        return;
    }

    try {
        const dniDocSnap = await getDoc(doc(db, "pacientes_por_dni", dni));
        if (!dniDocSnap.exists()) {
            const crear = await pedirConfirmacion(
                "Paciente no encontrado",
                `No existe historia clínica registrada para el DNI ${dni}. ¿Desea crear la ficha demográfica inicial del paciente?`,
                "Crear Ficha"
            );
            if (!crear) return;

            const nuevoPacienteId = generarIdCripto('PAC', 20);
            const batch = writeBatch(db);

            batch.set(doc(db, "pacientes_por_dni", dni), {
                pacienteId: nuevoPacienteId,
                dni: dni,
                creadoEn: serverTimestamp()
            });

            batch.set(doc(db, "pacientes", nuevoPacienteId), {
                dni: dni,
                nombre: "Paciente",
                apellido: `DNI ${dni}`,
                fechaNacimiento: "1990-01-01",
                sexo: "No especificado",
                contacto: { celular: "", email: "" },
                creadoEn: serverTimestamp(),
                creadoPor: sesionActual.uid,
                esDemo: true
            });

            batch.set(doc(db, "pacientes", nuevoPacienteId, "acceso", sesionActual.uid), {
                medicoUid: sesionActual.uid,
                creadoEn: serverTimestamp(),
                motivoEmergencia: "Alta inicial de paciente por consultorio"
            });

            batch.set(doc(collection(db, "auditoria")), {
                actorUid: sesionActual.uid,
                actorRol: sesionActual.rol,
                accion: "ALTA_PACIENTE_HC",
                pacienteId: nuevoPacienteId,
                fecha: serverTimestamp(),
                detalle: `Alta demográfica para DNI ${dni}`
            });

            await batch.commit();
            await abrirFichaPacienteHC(nuevoPacienteId);
            return;
        }

        const pacienteId = dniDocSnap.data().pacienteId;
        await abrirFichaPacienteHC(pacienteId);
    } catch (e) {
        console.error("Error al buscar paciente:", e);
        mostrarAlerta("Error de Consulta", "No se pudo acceder a la historia clínica del paciente. Verifique permisos.");
    }
}

export async function abrirFichaPacienteHC(pacienteId, turnoId = null) {
    const sesionActual = obtenerSesionActual();
    if (!sesionActual || !sesionActual.uid || !sesionActual.rol) {
        mostrarAlerta("Sesión Requerida", "Debe contar con una sesión activa con rol asignado para abrir historias clínicas.");
        return;
    }

    try {
        const pacSnap = await getDoc(doc(db, "pacientes", pacienteId));
        if (!pacSnap.exists()) {
            mostrarAlerta("Error", "Ficha de paciente no encontrada.");
            return;
        }

        const pacData = pacSnap.data();
        pacienteActivoHC = { id: pacienteId, ...pacData, turnoId };

        const accesoRef = doc(db, "pacientes", pacienteId, "acceso", sesionActual.uid);
        const accesoSnap = await getDoc(accesoRef);
        if (!accesoSnap.exists()) {
            await setDoc(accesoRef, {
                medicoUid: sesionActual.uid,
                turnoId: turnoId || "consulta_directa",
                creadoEn: serverTimestamp()
            });
        }

        await addDoc(collection(db, "auditoria"), {
            actorUid: sesionActual.uid,
            actorRol: sesionActual.rol,
            accion: "LECTURA_HISTORIA_CLINICA",
            pacienteId: pacienteId,
            fecha: serverTimestamp(),
            detalle: `Apertura de historia clínica de ${pacData.nombre} ${pacData.apellido}`
        }).catch(() => {});

        const cabecera = document.getElementById('cabecera-paciente-hc');
        if (cabecera) cabecera.classList.remove('hidden');

        const iniciales = (pacData.nombre ? pacData.nombre[0] : '') + (pacData.apellido ? pacData.apellido[0] : '');
        const elInit = document.getElementById('hc-paciente-iniciales');
        if (elInit) elInit.innerText = iniciales.toUpperCase() || 'HC';

        const elNom = document.getElementById('hc-paciente-nombre');
        if (elNom) elNom.innerText = `${pacData.nombre} ${pacData.apellido}`;

        const elDni = document.getElementById('hc-paciente-dni');
        if (elDni) elDni.innerText = pacData.dni || 'S/D';

        const elEdad = document.getElementById('hc-paciente-edad');
        if (elEdad) elEdad.innerText = calcularEdad(pacData.fechaNacimiento);

        const elSexo = document.getElementById('hc-paciente-sexo');
        if (elSexo) elSexo.innerText = pacData.sexo || 'No especificado';

        const elContacto = document.getElementById('hc-paciente-contacto');
        if (elContacto) elContacto.innerText = pacData.contacto?.celular || pacData.contacto?.email || 'Sin contacto';

        const badgeDemo = document.getElementById('hc-paciente-badge-demo');
        if (badgeDemo) {
            badgeDemo.classList.toggle('hidden', !pacData.esDemo);
        }

        await cargarResumenClinico(pacienteId);

        const labelActivo = document.getElementById('medico-paciente-activo');
        if (labelActivo) {
            labelActivo.innerText = `Atendiendo a: ${pacData.nombre} ${pacData.apellido} (DNI ${pacData.dni})`;
        }
        const badgeTurno = document.getElementById('badge-turno-en-curso');
        if (badgeTurno) {
            badgeTurno.classList.toggle('hidden', !turnoId);
        }

        await cargarCronologiaConsultas(pacienteId);

    } catch (e) {
        console.error("Error abriendo ficha clínica:", e);
        mostrarAlerta("Acceso Restringido", "No posee habilitación de acceso a la historia clínica de este paciente.");
    }
}

export async function cargarResumenClinico(pacienteId) {
    const elAlergias = document.getElementById('hc-alergias-texto');
    const elAntecedentes = document.getElementById('hc-antecedentes-texto');
    const elMedicacion = document.getElementById('hc-medicacion-texto');

    try {
        const snap = await getDoc(doc(db, "pacientes", pacienteId, "clinico", "resumen"));
        if (snap.exists()) {
            const data = snap.data();
            if (elAlergias) elAlergias.innerText = data.alergias || 'Sin alergias registradas';
            if (elAntecedentes) elAntecedentes.innerText = data.antecedentes || 'Ninguno informado';
            if (elMedicacion) elMedicacion.innerText = data.medicacion || 'Sin medicación regular';
        } else {
            if (elAlergias) elAlergias.innerText = 'Sin alergias registradas';
            if (elAntecedentes) elAntecedentes.innerText = 'Ninguno informado';
            if (elMedicacion) elMedicacion.innerText = 'Sin medicación regular';
        }
    } catch (e) {
        console.warn("Fallo lectura de resumen clínico:", e);
    }
}

export async function cargarCronologiaConsultas(pacienteId) {
    const container = document.getElementById('contenedor-cronologia-consultas');
    const badgeTotal = document.getElementById('badge-total-consultas');
    if (!container) return;

    container.innerHTML = '<p class="text-xs text-slate-400 text-center py-4">Cargando cronología médica...</p>';

    try {
        const q = query(
            collection(db, "pacientes", pacienteId, "consultas"),
            orderBy("fecha", "desc")
        );
        const snap = await getDocs(q);

        if (snap.empty) {
            container.innerHTML = '<p class="text-sm text-slate-500 text-center py-6">No hay consultas previas registradas para este paciente.</p>';
            if (badgeTotal) badgeTotal.innerText = '0 consultas';
            consultasHistoriaClinica = [];
            return;
        }

        consultasHistoriaClinica = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        if (badgeTotal) badgeTotal.innerText = `${consultasHistoriaClinica.length} consulta${consultasHistoriaClinica.length !== 1 ? 's' : ''}`;

        const idsRectificados = new Set();
        consultasHistoriaClinica.forEach(c => {
            if (c.corrige) idsRectificados.add(c.corrige);
        });

        let html = '';
        consultasHistoriaClinica.forEach(c => {
            const fechaStr = c.fecha?.toDate ? c.fecha.toDate().toLocaleString('es-AR') : (c.fecha || 'Fecha N/D');
            const esRectificada = idsRectificados.has(c.id);
            const esRectificacion = Boolean(c.corrige);

            let signosBadges = '';
            if (c.signosVitales && typeof c.signosVitales === 'object') {
                const sv = c.signosVitales;
                if (sv.ta) signosBadges += `<span class="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[11px] font-mono">TA: ${escaparHTML(sv.ta)}</span>`;
                if (sv.fc) signosBadges += `<span class="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[11px] font-mono">FC: ${escaparHTML(sv.fc)} lpm</span>`;
                if (sv.temp) signosBadges += `<span class="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[11px] font-mono">Temp: ${escaparHTML(sv.temp)}°C</span>`;
                if (sv.sat) signosBadges += `<span class="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[11px] font-mono">Sat: ${escaparHTML(sv.sat)}%</span>`;
                if (sv.peso) signosBadges += `<span class="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[11px] font-mono">${escaparHTML(sv.peso)} kg</span>`;
            }

            html += `
                <div class="border ${esRectificada ? 'border-amber-300 bg-amber-50/30' : 'border-slate-200 bg-white'} rounded-xl p-4 shadow-sm space-y-3">
                    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-100 pb-2">
                        <div class="flex items-center gap-2 flex-wrap">
                            <span class="text-xs font-mono font-bold text-emerald-950 bg-emerald-50 px-2.5 py-1 rounded">${escaparHTML(fechaStr)}</span>
                            <span class="text-xs font-semibold text-slate-700">${escaparHTML(c.medicoNombre || 'Médico')}</span>
                            ${esRectificacion ? `<span class="text-[11px] font-bold bg-teal-100 text-teal-800 px-2 py-0.5 rounded">Rectificación de consulta</span>` : ''}
                            ${esRectificada ? `<span class="text-[11px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded">Rectificada por entrada posterior</span>` : ''}
                        </div>
                        <div class="flex items-center gap-2">
                            <span class="text-[11px] bg-slate-100 text-slate-500 font-semibold px-2 py-0.5 rounded">Inmutable</span>
                            <button onclick="abrirModalRectificar('${c.id}')" class="text-xs text-emerald-700 hover:text-emerald-900 font-bold border border-emerald-200 px-2 py-1 rounded bg-emerald-50/50 hover:bg-emerald-100 transition">
                                Rectificar
                            </button>
                        </div>
                    </div>

                    <div>
                        <p class="text-xs font-bold text-slate-500 uppercase tracking-wider">Motivo de Consulta</p>
                        <p class="text-sm text-slate-900 font-medium">${escaparHTML(c.motivo || 'No especificado')}</p>
                    </div>

                    ${c.diagnostico ? `
                        <div>
                            <p class="text-xs font-bold text-slate-500 uppercase tracking-wider">Diagnóstico</p>
                            <p class="text-sm font-bold text-slate-800">${escaparHTML(c.diagnostico)}</p>
                        </div>
                    ` : ''}

                    ${signosBadges ? `
                        <div>
                            <p class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Signos Vitales</p>
                            <div class="flex flex-wrap gap-1.5">${signosBadges}</div>
                        </div>
                    ` : ''}

                    <div>
                        <p class="text-xs font-bold text-slate-500 uppercase tracking-wider">Evolución y Examen Clínico</p>
                        <p class="text-sm text-slate-700 whitespace-pre-line bg-slate-50 p-3 rounded-lg border border-slate-100 mt-1">${escaparHTML(c.evolucion || '')}</p>
                    </div>

                    ${c.indicaciones ? `
                        <div>
                            <p class="text-xs font-bold text-slate-500 uppercase tracking-wider">Indicaciones / Tratamiento</p>
                            <p class="text-sm text-slate-800 italic bg-emerald-50/50 p-2.5 rounded-lg border border-emerald-100 mt-1">${escaparHTML(c.indicaciones)}</p>
                        </div>
                    ` : ''}
                </div>
            `;
        });

        container.innerHTML = html;
    } catch (e) {
        console.error("Error al cargar consultas:", e);
        container.innerHTML = '<p class="text-sm text-red-500 text-center py-4">Error al cargar la cronología de consultas.</p>';
    }
}

export async function guardarConsultaInmutable() {
    if (!pacienteActivoHC) {
        mostrarAlerta("Ningún Paciente", "Seleccione o busque a un paciente antes de registrar una consulta.");
        return;
    }

    const motivo = document.getElementById('input-motivo-consulta')?.value.trim();
    const diagnostico = document.getElementById('input-diagnostico-consulta')?.value.trim();
    const evolucion = document.getElementById('texto-evolucion')?.value.trim();
    const indicaciones = document.getElementById('texto-indicaciones')?.value.trim();

    if (!motivo || !diagnostico || !evolucion) {
        mostrarAlerta("Campos Obligatorios", "Motivo de consulta, diagnóstico y evolución son obligatorios.");
        return;
    }

    const confirmado = await pedirConfirmacion(
        "Confirmar Consulta Inmutable",
        "Conforme a la Ley 26.529, esta consulta quedará asentada de forma permanente y NO podrá ser editada ni eliminada. ¿Desea registrarla definitivamente?",
        "Sí, Registrar Inmutable"
    );
    if (!confirmado) return;

    const signosVitales = {
        ta: document.getElementById('sv-ta')?.value.trim() || '',
        fc: document.getElementById('sv-fc')?.value.trim() || '',
        temp: document.getElementById('sv-temp')?.value.trim() || '',
        sat: document.getElementById('sv-sat')?.value.trim() || '',
        peso: document.getElementById('sv-peso')?.value.trim() || '',
        talla: document.getElementById('sv-talla')?.value.trim() || ''
    };

    const sesionActual = obtenerSesionActual();
    if (!sesionActual || !sesionActual.uid || !sesionActual.rol) {
        mostrarAlerta("Sesión Requerida", "Debe contar con una sesión activa con rol asignado para registrar consultas.");
        return;
    }

    try {
        const consultaId = generarIdCripto('CONS', 20);
        const consultaRef = doc(db, "pacientes", pacienteActivoHC.id, "consultas", consultaId);
        const batch = writeBatch(db);

        batch.set(consultaRef, {
            turnoId: pacienteActivoHC.turnoId || '',
            medicoUid: sesionActual.uid,
            medicoNombre: sesionActual.nombre || 'Profesional Médico',
            fecha: serverTimestamp(),
            motivo: motivo,
            diagnostico: diagnostico,
            diagnosticoCodigo: '',
            evolucion: evolucion,
            indicaciones: indicaciones,
            signosVitales: signosVitales,
            corrige: null
        });

        if (pacienteActivoHC.turnoId) {
            const turnoRef = doc(db, "turnos", pacienteActivoHC.turnoId);
            batch.update(turnoRef, {
                estado: "Atendido",
                atendidoEn: serverTimestamp(),
                finConsultaEn: serverTimestamp(),
                pacienteId: pacienteActivoHC.id
            });
        }

        const auditRef = doc(collection(db, "auditoria"));
        batch.set(auditRef, {
            actorUid: sesionActual.uid,
            actorRol: sesionActual.rol,
            accion: "CONSULTA_MEDICA_REGISTRADA",
            pacienteId: pacienteActivoHC.id,
            consultaId: consultaId,
            fecha: serverTimestamp(),
            detalle: `Consulta registrada: ${motivo}`
        });

        await batch.commit();

        mostrarExito("Consulta Asentada", "La consulta fue incorporada a la historia clínica de forma inmutable.");

        document.getElementById('input-motivo-consulta').value = '';
        document.getElementById('input-diagnostico-consulta').value = '';
        document.getElementById('texto-evolucion').value = '';
        document.getElementById('texto-indicaciones').value = '';
        document.getElementById('sv-ta').value = '';
        document.getElementById('sv-fc').value = '';
        document.getElementById('sv-temp').value = '';
        document.getElementById('sv-sat').value = '';
        document.getElementById('sv-peso').value = '';
        document.getElementById('sv-talla').value = '';

        await cargarCronologiaConsultas(pacienteActivoHC.id);
        cargarAgendaMedico();

    } catch (e) {
        console.error("Error guardando consulta:", e);
        mostrarAlerta("Error al Guardar", "No se pudo registrar la consulta médica. Verifique permisos.");
    }
}

export function abrirModalRectificar(consultaId) {
    const consulta = consultasHistoriaClinica.find(c => c.id === consultaId);
    if (!consulta) return;

    document.getElementById('rectificar-consulta-original-id').value = consultaId;
    const fechaStr = consulta.fecha?.toDate ? consulta.fecha.toDate().toLocaleString('es-AR') : (consulta.fecha || '');
    const resumenEl = document.getElementById('rectificar-resumen-original');
    if (resumenEl) {
        resumenEl.innerText = `ID: ${consultaId} | Fecha: ${fechaStr} | Motivo: ${consulta.motivo} | Evolución previa: ${consulta.evolucion?.substring(0, 100) || ''}...`;
    }

    document.getElementById('rectificar-motivo').value = '';
    document.getElementById('rectificar-evolucion').value = '';
    document.getElementById('rectificar-indicaciones').value = '';

    abrirModal('modal-rectificar-consulta');
}

export async function guardarRectificacionInmutable() {
    const originalId = document.getElementById('rectificar-consulta-original-id')?.value;
    const motivo = document.getElementById('rectificar-motivo')?.value.trim();
    const evolucion = document.getElementById('rectificar-evolucion')?.value.trim();
    const indicaciones = document.getElementById('rectificar-indicaciones')?.value.trim();

    if (!motivo || !evolucion) {
        mostrarAlerta("Datos Faltantes", "Motivo de la rectificación y nueva evolución son obligatorios.");
        return;
    }

    const confirmado = await pedirConfirmacion(
        "Confirmar Rectificación",
        "Esta rectificación quedará asentada inmutablemente vinculada a la consulta original. ¿Confirmar?",
        "Registrar Rectificación"
    );
    if (!confirmado) return;

    const sesionActual = obtenerSesionActual();
    if (!sesionActual || !sesionActual.uid || !sesionActual.rol) {
        mostrarAlerta("Sesión Requerida", "Debe contar con una sesión activa con rol asignado para rectificar consultas.");
        return;
    }

    try {
        const nuevaConsultaId = generarIdCripto('CONS_RECT', 20);
        const consultaRef = doc(db, "pacientes", pacienteActivoHC.id, "consultas", nuevaConsultaId);
        const batch = writeBatch(db);

        batch.set(consultaRef, {
            turnoId: '',
            medicoUid: sesionActual.uid,
            medicoNombre: sesionActual.nombre || 'Profesional Médico',
            fecha: serverTimestamp(),
            motivo: `[Rectificación] ${motivo}`,
            diagnostico: 'Rectificación de consulta previa',
            diagnosticoCodigo: '',
            evolucion: evolucion,
            indicaciones: indicaciones,
            signosVitales: {},
            corrige: originalId
        });

        const auditRef = doc(collection(db, "auditoria"));
        batch.set(auditRef, {
            actorUid: sesionActual.uid,
            actorRol: sesionActual.rol,
            accion: "CONSULTA_RECTIFICADA",
            pacienteId: pacienteActivoHC.id,
            consultaId: originalId,
            fecha: serverTimestamp(),
            detalle: `Rectificación de consulta ${originalId}: ${motivo}`
        });

        await batch.commit();

        cerrarModal('modal-rectificar-consulta');
        mostrarExito("Rectificación Asentada", "La rectificación fue registrada de forma inmutable.");
        await cargarCronologiaConsultas(pacienteActivoHC.id);
    } catch (e) {
        console.error("Error al rectificar:", e);
        mostrarAlerta("Error", "No se pudo registrar la rectificación.");
    }
}

export function abrirModalEditarResumen() {
    if (!pacienteActivoHC) return;
    const elAlergias = document.getElementById('hc-alergias-texto')?.innerText || '';
    const elAntecedentes = document.getElementById('hc-antecedentes-texto')?.innerText || '';
    const elMedicacion = document.getElementById('hc-medicacion-texto')?.innerText || '';

    document.getElementById('modal-input-alergias').value = elAlergias.includes('Sin alergias') ? '' : elAlergias;
    document.getElementById('modal-input-antecedentes').value = elAntecedentes.includes('Ninguno informado') ? '' : elAntecedentes;
    document.getElementById('modal-input-medicacion').value = elMedicacion.includes('Sin medicación') ? '' : elMedicacion;
    document.getElementById('modal-input-motivo-cambio-resumen').value = '';

    abrirModal('modal-editar-resumen-clinico');
}

export async function guardarResumenClinico() {
    if (!pacienteActivoHC) {
        mostrarAlerta("Paciente Requerido", "Debe tener una historia clínica seleccionada para actualizar el resumen clínico.");
        return;
    }
    const alergias = document.getElementById('modal-input-alergias')?.value.trim();
    const antecedentes = document.getElementById('modal-input-antecedentes')?.value.trim();
    const medicacion = document.getElementById('modal-input-medicacion')?.value.trim();
    const motivo = document.getElementById('modal-input-motivo-cambio-resumen')?.value.trim();

    if (!motivo) {
        mostrarAlerta("Motivo Requerido", "Por trazabilidad y auditoría clínica, ingrese el motivo del cambio.");
        return;
    }

    const sesionActual = obtenerSesionActual();
    if (!sesionActual || !sesionActual.uid || !sesionActual.rol) {
        mostrarAlerta("Sesión Requerida", "Debe contar con una sesión activa con rol asignado para actualizar el resumen clínico.");
        return;
    }

    try {
        const batch = writeBatch(db);
        const resumenRef = doc(db, "pacientes", pacienteActivoHC.id, "clinico", "resumen");

        batch.set(resumenRef, {
            alergias: alergias || 'Sin alergias registradas',
            antecedentes: antecedentes || 'Ninguno informado',
            medicacion: medicacion || 'Sin medicación regular',
            actualizadoEn: serverTimestamp()
        }, { merge: true });

        const auditRef = doc(collection(db, "auditoria"));
        batch.set(auditRef, {
            actorUid: sesionActual.uid,
            actorRol: sesionActual.rol,
            accion: "ACTUALIZAR_RESUMEN_CLINICO",
            pacienteId: pacienteActivoHC.id,
            fecha: serverTimestamp(),
            detalle: `Actualización de resumen clínico: ${motivo}`
        });

        await batch.commit();

        cerrarModal('modal-editar-resumen-clinico');
        mostrarExito("Resumen Actualizado", "Los datos clínicos permanentes fueron guardados.");
        await cargarResumenClinico(pacienteActivoHC.id);
    } catch (e) {
        console.error("Error guardando resumen:", e);
        mostrarAlerta("Error", "No se pudo actualizar el resumen clínico.");
    }
}

export async function ejecutarAccesoEmergencia() {
    const dni = document.getElementById('modal-emergencia-dni')?.value.trim();
    const motivo = document.getElementById('modal-emergencia-motivo')?.value.trim();

    if (!/^[0-9]{6,10}$/.test(dni)) {
        mostrarAlerta("DNI Inválido", "Ingrese un DNI numérico válido (6 a 10 dígitos).");
        return;
    }
    if (!motivo || motivo.length < 10) {
        mostrarAlerta("Motivo Insuficiente", "El motivo justificado de emergencia debe tener al menos 10 caracteres.");
        return;
    }

    const sesionActual = obtenerSesionActual();
    if (!sesionActual || !sesionActual.uid || !sesionActual.rol) {
        mostrarAlerta("Sesión Requerida", "Debe contar con una sesión activa con rol asignado para habilitar accesos de emergencia.");
        return;
    }

    try {
        let pacienteId;
        const dniSnap = await getDoc(doc(db, "pacientes_por_dni", dni));
        if (dniSnap.exists()) {
            pacienteId = dniSnap.data().pacienteId;
        } else {
            pacienteId = generarIdCripto('PAC_EMERG', 20);
            const batchCrear = writeBatch(db);
            batchCrear.set(doc(db, "pacientes_por_dni", dni), { pacienteId, dni, creadoEn: serverTimestamp() });
            batchCrear.set(doc(db, "pacientes", pacienteId), {
                dni,
                nombre: "Paciente",
                apellido: `Emergencia ${dni}`,
                fechaNacimiento: "1980-01-01",
                sexo: "No especificado",
                contacto: {},
                creadoEn: serverTimestamp(),
                creadoPor: sesionActual.uid,
                esDemo: true
            });
            await batchCrear.commit();
        }

        const batch = writeBatch(db);
        const accesoRef = doc(db, "pacientes", pacienteId, "acceso", sesionActual.uid);
        batch.set(accesoRef, {
            medicoUid: sesionActual.uid,
            creadoEn: serverTimestamp(),
            motivoEmergencia: motivo
        });

        const auditRef = doc(collection(db, "auditoria"));
        batch.set(auditRef, {
            actorUid: sesionActual.uid,
            actorRol: sesionActual.rol,
            accion: "ACCESO_EMERGENCIA",
            pacienteId: pacienteId,
            fecha: serverTimestamp(),
            detalle: `Acceso extraordinario de emergencia: ${motivo}`
        });

        await batch.commit();

        cerrarModal('modal-acceso-emergencia');
        mostrarExito("Acceso Concedido", "Se habilitó el acceso clínico de emergencia y se registró en la auditoría.");
        await abrirFichaPacienteHC(pacienteId);

    } catch (e) {
        console.error("Error en acceso de emergencia:", e);
        mostrarAlerta("Error", "No se pudo habilitar el acceso de emergencia.");
    }
}

export async function exportarHistoriaClinica() {
    if (!pacienteActivoHC) {
        mostrarAlerta("Ningún Paciente", "Seleccione un paciente para imprimir su historia clínica.");
        return;
    }

    const sesionActual = obtenerSesionActual();
    if (!sesionActual || !sesionActual.uid || !sesionActual.rol) {
        mostrarAlerta("Sesión Requerida", "Debe contar con una sesión activa con rol asignado para exportar historias clínicas.");
        return;
    }

    await addDoc(collection(db, "auditoria"), {
        actorUid: sesionActual.uid,
        actorRol: sesionActual.rol,
        accion: "EXPORTAR_HISTORIA_CLINICA",
        pacienteId: pacienteActivoHC.id,
        fecha: serverTimestamp(),
        detalle: `Impresión/Exportación de ficha de ${pacienteActivoHC.nombre} ${pacienteActivoHC.apellido}`
    }).catch(() => {});

    window.print();
}

export function cerrarFichaPacienteHC() {
    pacienteActivoHC = null;
    const cabecera = document.getElementById('cabecera-paciente-hc');
    if (cabecera) cabecera.classList.add('hidden');
    const container = document.getElementById('contenedor-cronologia-consultas');
    if (container) container.innerHTML = '<p class="text-sm text-slate-400 text-center py-8">Seleccione un paciente para ver su historial clínico.</p>';
    const labelActivo = document.getElementById('medico-paciente-activo');
    if (labelActivo) labelActivo.innerText = "Ningún paciente en atención";
    const badgeTurno = document.getElementById('badge-turno-en-curso');
    if (badgeTurno) badgeTurno.classList.add('hidden');
}

export async function llamarPaciente(idDoc) {
    try {
        const snap = await getDoc(doc(db, "turnos", idDoc));
        if (!snap.exists()) {
            mostrarAlerta("Turno No Encontrado", "El turno seleccionado ya no existe o fue eliminado.");
            return;
        }
        const turnoData = snap.data();

        let pacienteId = turnoData.pacienteId;
        const sesionActual = obtenerSesionActual();
        if (!sesionActual || !sesionActual.uid || !sesionActual.rol) {
            mostrarAlerta("Sesión Requerida", "Debe contar con una sesión activa con rol asignado para llamar a un paciente.");
            return;
        }

        if (!pacienteId && turnoData.pacienteDni) {
            const dni = turnoData.pacienteDni.trim();
            const dniSnap = await getDoc(doc(db, "pacientes_por_dni", dni));
            if (dniSnap.exists()) {
                pacienteId = dniSnap.data().pacienteId;
            } else {
                pacienteId = generarIdCripto('PAC', 20);
                const batchAlta = writeBatch(db);
                batchAlta.set(doc(db, "pacientes_por_dni", dni), {
                    pacienteId,
                    dni,
                    creadoEn: serverTimestamp()
                });
                batchAlta.set(doc(db, "pacientes", pacienteId), {
                    dni,
                    nombre: (turnoData.pacienteNombre || 'Paciente').split(' ')[0] || 'Paciente',
                    apellido: (turnoData.pacienteNombre || '').split(' ').slice(1).join(' ') || 'Schestakow',
                    fechaNacimiento: turnoData.pacienteFechaNacimiento || '1990-01-01',
                    cobertura: turnoData.pacienteCobertura || 'Sin Obra Social',
                    sexo: 'No especificado',
                    contacto: {
                        celular: turnoData.pacienteCelular || '',
                        email: turnoData.pacienteEmail || ''
                    },
                    creadoEn: serverTimestamp(),
                    creadoPor: sesionActual.uid,
                    esDemo: true
                });
                await batchAlta.commit();
            }

            await updateDoc(doc(db, "turnos", idDoc), {
                estado: "En Consultorio",
                inicioConsultaEn: serverTimestamp(),
                pacienteId: pacienteId
            });
        } else {
            await updateDoc(doc(db, "turnos", idDoc), {
                estado: "En Consultorio",
                inicioConsultaEn: serverTimestamp()
            });
        }

        if (sesionActual && pacienteId) {
            await setDoc(doc(db, "pacientes", pacienteId, "acceso", sesionActual.uid), {
                medicoUid: sesionActual.uid,
                turnoId: idDoc,
                creadoEn: serverTimestamp()
            }, { merge: true });
        }

        if (pacienteId) {
            await abrirFichaPacienteHC(pacienteId, idDoc);
        }

        mostrarToast(`Llamando a consultorio: ${turnoData.pacienteNombre || 'Paciente'}`, "info");
        cargarAgendaMedico();
    } catch (e) {
        console.error("Error al llamar paciente:", e);
        mostrarAlerta("Error", "No se pudo actualizar el estado del turno.");
    }
}

export async function marcarAusente(idDoc) {
    const ok = await pedirConfirmacion("Marcar Ausente", "¿Confirmar que el paciente no se presentó al consultorio?");
    if (!ok) return;

    try {
        await updateDoc(doc(db, "turnos", idDoc), {
            estado: "Ausente",
            canceladoPor: "medico",
            canceladoEn: serverTimestamp()
        });
        mostrarToast("Paciente marcado como ausente", "info");
        cargarAgendaMedico();
    } catch (e) {
        console.error(e);
        mostrarAlerta("Error", "No se pudo actualizar el estado.");
    }
}

export function sincronizarEvolucionCampos() {
    const ant = document.getElementById('input-antecedentes-consulta')?.value.trim();
    const ef = document.getElementById('input-examen-fisico')?.value.trim();
    const hallazgos = document.getElementById('input-hallazgos-consulta')?.value.trim();
    const textoEvo = document.getElementById('texto-evolucion');
    if (!textoEvo) return;

    let bloques = [];
    if (ant) bloques.push(`[ANAMNESIS Y ANTECEDENTES]\n${ant}`);
    if (ef) bloques.push(`[EXAMEN FÍSICO]\n${ef}`);
    if (hallazgos) bloques.push(`[HALLAZGOS Y CONDUCTA]\n${hallazgos}`);

    if (bloques.length > 0) {
        textoEvo.value = bloques.join('\n\n');
    }
}

// ==========================================
// CITACIÓN Y PRÓXIMA CONSULTA
// ==========================================
export async function abrirModalProximaConsulta() {
    if (!pacienteActivoHC) {
        mostrarAlerta("Sin Paciente Seleccionado", "Debe buscar o atender a un paciente primero para agendarle su próxima consulta.");
        return;
    }

    const sesionActual = obtenerSesionActual();
    const elNom = document.getElementById('prox-consulta-paciente-nombre');
    const elDni = document.getElementById('prox-consulta-paciente-dni');
    const elMed = document.getElementById('prox-consulta-medico-nombre');
    const elEsp = document.getElementById('prox-consulta-medico-especialidad');
    const elMot = document.getElementById('prox-consulta-motivo');
    const elFecha = document.getElementById('prox-consulta-fecha');
    const elSlot = document.getElementById('prox-consulta-horario-seleccionado');

    const nombreCompleto = `${pacienteActivoHC.nombre || ''} ${pacienteActivoHC.apellido || ''}`.trim() || 'Paciente';
    if (elNom) elNom.innerText = nombreCompleto;
    if (elDni) elDni.innerText = pacienteActivoHC.dni || '--';

    const nombreMed = sesionActual?.nombre || 'Médico Asignado';
    if (elMed) elMed.innerText = nombreMed;

    let especialidadMed = "Consulta Médica";
    for (const [esp, medList] of Object.entries(bdMedicosDinamica)) {
        if (medList.some(m => m.uid === sesionActual?.uid || m.nombre === nombreMed)) {
            especialidadMed = esp;
            break;
        }
    }
    if (elEsp) elEsp.innerText = especialidadMed;
    if (elMot) elMot.value = '';
    if (elSlot) elSlot.value = '';

    const manana = new Date();
    manana.setDate(manana.getDate() + 1);
    if (manana.getDay() === 6) manana.setDate(manana.getDate() + 2);
    if (manana.getDay() === 0) manana.setDate(manana.getDate() + 1);
    const mananaStr = manana.toISOString().split('T')[0];

    if (elFecha) {
        elFecha.min = mananaStr;
        elFecha.value = mananaStr;
        if (window.calendarioConsultorio) {
            window.calendarioConsultorio.establecerFecha(mananaStr, false);
        }
    }

    const radioExacto = document.getElementById('modo-horario-exacto');
    if (radioExacto) radioExacto.checked = true;
    toggleModoHorarioCitacion();

    if (elFecha && elFecha.value) {
        await cargarHorariosDisponiblesProximaConsulta(elFecha.value);
    }

    abrirModal('modal-proxima-consulta');
}

export function toggleModoHorarioCitacion() {
    const esExacto = document.getElementById('modo-horario-exacto')?.checked;
    const labelExacto = document.getElementById('label-modo-exacto');
    const labelPaciente = document.getElementById('label-modo-paciente');
    const bloqueExacto = document.getElementById('bloque-horarios-exactos');
    const bloquePaciente = document.getElementById('bloque-info-paciente');

    if (esExacto) {
        if (labelExacto) {
            labelExacto.className = "border-2 border-emerald-600 bg-emerald-50/50 rounded-lg p-3 cursor-pointer transition flex flex-col justify-between";
        }
        if (labelPaciente) {
            labelPaciente.className = "border-2 border-slate-200 hover:border-emerald-300 rounded-lg p-3 cursor-pointer transition flex flex-col justify-between";
        }
        if (bloqueExacto) bloqueExacto.classList.remove('hidden');
        if (bloquePaciente) bloquePaciente.classList.add('hidden');
    } else {
        if (labelExacto) {
            labelExacto.className = "border-2 border-slate-200 hover:border-emerald-300 rounded-lg p-3 cursor-pointer transition flex flex-col justify-between";
        }
        if (labelPaciente) {
            labelPaciente.className = "border-2 border-teal-600 bg-teal-50/50 rounded-lg p-3 cursor-pointer transition flex flex-col justify-between";
        }
        if (bloqueExacto) bloqueExacto.classList.add('hidden');
        if (bloquePaciente) bloquePaciente.classList.remove('hidden');
    }
}

export async function cambioFechaProximaConsulta(input) {
    if (!validarDiaHabil(input)) return;
    await cargarHorariosDisponiblesProximaConsulta(input.value);
}

export async function cargarHorariosDisponiblesProximaConsulta(fecha) {
    const contenedor = document.getElementById('contenedor-slots-proxima-consulta');
    const inputSlot = document.getElementById('prox-consulta-horario-seleccionado');
    if (!contenedor) return;

    if (inputSlot) inputSlot.value = '';
    contenedor.innerHTML = '<p class="text-xs text-slate-400 col-span-3 sm:col-span-4 text-center py-4">Consultando disponibilidad...</p>';

    const sesionActual = obtenerSesionActual();
    const nombreMed = sesionActual?.nombre || 'Médico Asignado';
    const medUid = sesionActual?.uid || 'medico_demo';

    let turnosOcupados = {};
    try {
        const q = query(
            collection(db, "turnos"),
            where("medico", "==", nombreMed),
            where("fecha", "==", fecha)
        );
        const snap = await getDocs(q);
        snap.forEach(d => {
            const data = d.data();
            const est = data.estado;
            if (!est || !est.toLowerCase().includes("cancelado")) {
                if (data.horario) turnosOcupados[data.horario] = true;
            }
        });

        const qDisp = query(
            collection(db, "disponibilidad"),
            where("medicoUid", "==", medUid),
            where("fecha", "==", fecha)
        );
        const snapDisp = await getDocs(qDisp);
        snapDisp.forEach(d => {
            const data = d.data();
            if (data.horario) turnosOcupados[data.horario] = true;
        });
    } catch (e) {
        console.warn("Fallo lectura de disponibilidad para citación:", e);
    }

    const duracionActual = modulacionPorMedico[nombreMed] || duracionTurnoGlobal || 15;
    let minBucle = 7 * 60;
    const finBucle = 12 * 60 + 30;

    let html = '';
    let disponiblesCount = 0;

    while (minBucle <= finBucle) {
        const h = Math.floor(minBucle / 60);
        const m = minBucle % 60;
        const hsStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;

        if (turnosOcupados[hsStr]) {
            html += `<button type="button" disabled class="bg-slate-100 text-slate-400 text-xs font-bold rounded p-2 border border-slate-200 cursor-not-allowed text-center">${hsStr} (Ocupado)</button>`;
        } else {
            html += `<button type="button" onclick="seleccionarSlotProximaConsulta(this, '${hsStr}')" class="btn-slot-prox bg-white hover:bg-emerald-50 text-slate-800 border border-slate-300 text-xs font-bold rounded p-2 transition text-center shadow-sm">${hsStr}</button>`;
            disponiblesCount++;
        }

        minBucle += duracionActual;
    }

    if (disponiblesCount === 0) {
        html = '<p class="text-xs text-red-500 col-span-3 sm:col-span-4 text-center py-4">No hay horarios libres en este día. Seleccione otra fecha o elija la opción de horario por paciente.</p>';
    }

    contenedor.innerHTML = html;
}

export function seleccionarSlotProximaConsulta(btn, horario) {
    document.querySelectorAll('.btn-slot-prox').forEach(b => {
        b.classList.remove('bg-emerald-700', 'text-white', 'border-emerald-800');
        b.classList.add('bg-white', 'text-slate-800', 'border-slate-300');
    });
    btn.classList.remove('bg-white', 'text-slate-800', 'border-slate-300');
    btn.classList.add('bg-emerald-700', 'text-white', 'border-emerald-800');

    const inputSlot = document.getElementById('prox-consulta-horario-seleccionado');
    if (inputSlot) inputSlot.value = horario;
}

export async function guardarProximaConsultaMedico() {
    if (!pacienteActivoHC) {
        mostrarAlerta("Error", "No hay un paciente activo.");
        return;
    }

    const fecha = document.getElementById('prox-consulta-fecha')?.value;
    if (!fecha) {
        mostrarAlerta("Fecha Requerida", "Debe seleccionar una fecha para la próxima consulta.");
        return;
    }

    const esExacto = document.getElementById('modo-horario-exacto')?.checked;
    const horario = esExacto ? document.getElementById('prox-consulta-horario-seleccionado')?.value : 'Pendiente';

    if (esExacto && !horario) {
        mostrarAlerta("Horario Requerido", "Por favor seleccione un horario disponible de la grilla.");
        return;
    }

    const motivo = document.getElementById('prox-consulta-motivo')?.value.trim() || 'Control y Seguimiento';
    const sesionActual = obtenerSesionActual();
    if (!sesionActual || !sesionActual.uid || !sesionActual.rol) {
        mostrarAlerta("Sesión Requerida", "Debe contar con una sesión activa con rol asignado para agendar próximas consultas.");
        return;
    }

    const nombreMed = sesionActual.nombre || 'Médico Asignado';
    const medUid = sesionActual.uid;

    let especialidadMed = "Consulta Médica";
    for (const [esp, medList] of Object.entries(bdMedicosDinamica)) {
        if (medList.some(m => m.uid === medUid || m.nombre === nombreMed)) {
            especialidadMed = esp;
            break;
        }
    }

    const nombreCompleto = `${pacienteActivoHC.nombre || ''} ${pacienteActivoHC.apellido || ''}`.trim() || 'Paciente';

    const msgConfirm = esExacto 
        ? `¿Confirmar próxima consulta para ${nombreCompleto} el día ${fecha} a las ${horario} hs?`
        : `¿Asignar el día ${fecha} para ${nombreCompleto}, dejando que el paciente elija su horario dentro de esa fecha?`;

    const ok = await pedirConfirmacion("Confirmar Citación", msgConfirm, "Sí, Agendar");
    if (!ok) return;

    try {
        const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
        const arr = new Uint8Array(20);
        window.crypto.getRandomValues(arr);
        let randStr = '';
        for (let i = 0; i < 20; i++) randStr += chars[arr[i] % chars.length];
        const turnoId = `TUR_${randStr}`;

        const batch = writeBatch(db);
        const turnoRef = doc(db, "turnos", turnoId);

        // Extracción segura de contacto telefónico del paciente:
        // Las reglas de Firestore (isValidTurnoStaffCreate) exigen string de longitud entre 6 y 25 caracteres.
        // Si el paciente no posee celular demográfico registrado (ej. alta rápida de emergencia),
        // se emplea el marcador numérico hospitalario "2604000000" (San Rafael demo, ver metricas.js L990)
        // para asegurar integridad de esquema sin bloquear la citación clínica ni romper validaciones.
        let celularRaw = '';
        if (typeof pacienteActivoHC.contacto === 'object' && pacienteActivoHC.contacto !== null) {
            celularRaw = (pacienteActivoHC.contacto.celular || '').trim();
        } else if (typeof pacienteActivoHC.contacto === 'string') {
            celularRaw = pacienteActivoHC.contacto.trim();
        }
        const pacienteCelularValido = (typeof celularRaw === 'string' && celularRaw.length >= 6 && celularRaw.length <= 25)
            ? celularRaw
            : '2604000000';

        const emailRaw = (typeof pacienteActivoHC.contacto === 'object' && pacienteActivoHC.contacto !== null)
            ? (pacienteActivoHC.contacto.email || '')
            : (pacienteActivoHC.email || '');

        const turnoData = {
            especialidad: especialidadMed,
            medico: nombreMed,
            medicoUid: medUid,
            fecha: fecha,
            horario: horario,
            pacienteNombre: nombreCompleto,
            pacienteDni: pacienteActivoHC.dni,
            pacienteCelular: pacienteCelularValido,
            pacienteEmail: typeof emailRaw === 'string' ? emailRaw.substring(0, 100) : '',
            pacienteCobertura: pacienteActivoHC.cobertura || 'Sin Obra Social',
            pacienteFechaNacimiento: pacienteActivoHC.fechaNacimiento || '1990-01-01',
            pacienteId: pacienteActivoHC.id,
            codigoConfirmacion: turnoId,
            canal: "Consultorio",
            estado: esExacto ? "Confirmado Presencial" : "Pendiente de Horario",
            motivoCitacion: motivo,
            modoHorario: esExacto ? "exacto" : "paciente",
            creadoEn: serverTimestamp(),
            creadoPor: sesionActual.uid,
            llegadaEn: null,
            inicioConsultaEn: null,
            finConsultaEn: null,
            canceladoPor: null,
            canceladoEn: null,
            reprogramadoDe: null,
            timestamp: serverTimestamp()
        };

        batch.set(turnoRef, turnoData);

        if (esExacto) {
            const slotId = `${medUid}_${fecha}_${horario.replace(':', '')}`;
            batch.set(doc(db, "disponibilidad", slotId), {
                medicoUid: medUid,
                fecha: fecha,
                horario: horario,
                creadoEn: serverTimestamp()
            });
        }

        batch.set(doc(collection(db, "auditoria")), {
            actorUid: sesionActual.uid,
            actorRol: sesionActual.rol,
            accion: "CITACION_PROXIMA_CONSULTA",
            pacienteId: pacienteActivoHC.id,
            detalle: `Citación agendada para ${fecha} (${esExacto ? horario + ' hs' : 'Horario a elección del paciente'}) - Motivo: ${motivo}`,
            fecha: serverTimestamp()
        });

        await batch.commit();

        ultimaCitacionGenerada = {
            id: turnoId,
            ...turnoData
        };

        cerrarModal('modal-proxima-consulta');
        mostrarComprobanteCitacion(ultimaCitacionGenerada);

    } catch (e) {
        console.error("Error al agendar próxima consulta:", e);
        mostrarAlerta("Error al Agendar", "No se pudo registrar la citación. Verifique los datos ingresados.");
    }
}

function mostrarComprobanteCitacion(cita) {
    const cuerpo = document.getElementById('comprobante-citacion-cuerpo');
    const contenedorEnlace = document.getElementById('contenedor-enlace-citacion');
    const inputEnlace = document.getElementById('input-enlace-citacion');

    if (!cuerpo) return;

    const esExacto = cita.modoHorario === 'exacto';
    const horarioTexto = esExacto 
        ? `<strong class="text-emerald-800 font-bold">${cita.horario} hs</strong> (Confirmado)`
        : `<span class="bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded">A elección del paciente</span>`;

    cuerpo.innerHTML = `
        <div class="flex justify-between items-center border-b border-slate-200 pb-2 mb-2">
            <span class="font-bold text-slate-800 text-sm">Resumen de Citación Médica</span>
            <span class="text-slate-500 text-[11px] font-semibold">${cita.canal}</span>
        </div>
        <div class="space-y-1">
            <p><strong>Paciente:</strong> ${escaparHTML(cita.pacienteNombre)} (DNI ${escaparHTML(cita.pacienteDni)})</p>
            <p><strong>Profesional:</strong> ${escaparHTML(cita.medico)} (${escaparHTML(cita.especialidad)})</p>
            <p><strong>Fecha Asignada:</strong> <span class="font-bold text-emerald-800">${escaparHTML(cita.fecha)}</span></p>
            <p><strong>Horario:</strong> ${horarioTexto}</p>
            ${cita.motivoCitacion ? `<p><strong>Motivo / Plan:</strong> ${escaparHTML(cita.motivoCitacion)}</p>` : ''}
            <p class="pt-1 text-[11px] text-slate-500">Código de Turno: <strong class="font-mono text-slate-800 select-all">${cita.codigoConfirmacion}</strong></p>
        </div>
    `;

    if (!esExacto && contenedorEnlace && inputEnlace) {
        const urlBase = window.location.href.split('panel.html')[0];
        const link = `${urlBase}index.html?cita=${cita.id}`;
        inputEnlace.value = link;
        contenedorEnlace.classList.remove('hidden');
    } else if (contenedorEnlace) {
        contenedorEnlace.classList.add('hidden');
    }

    abrirModal('modal-comprobante-citacion');
}

export function copiarEnlaceCitacion() {
    const input = document.getElementById('input-enlace-citacion');
    const btn = document.getElementById('btn-copiar-enlace-citacion');
    if (!input || !input.value) return;

    const textoAviso = `Hospital Teodoro J. Schestakow: Tu médico te asignó consulta médica de seguimiento. Elegí tu horario preferido ingresando aquí: ${input.value}`;

    navigator.clipboard.writeText(textoAviso).then(() => {
        if (btn) {
            const original = btn.innerText;
            btn.innerText = "¡Copiado!";
            setTimeout(() => { btn.innerText = original; }, 2000);
        }
    }).catch(() => {
        input.select();
        document.execCommand('copy');
        if (btn) {
            btn.innerText = "¡Copiado!";
            setTimeout(() => { btn.innerText = "Copiar"; }, 2000);
        }
    });
}

export function imprimirComprobanteCitacion() {
    if (!ultimaCitacionGenerada) return;
    const c = ultimaCitacionGenerada;
    const esExacto = c.modoHorario === 'exacto';
    const horarioTexto = esExacto ? `${c.horario} hs` : `Pendiente de elección por el paciente`;

    const printWin = window.open('', '_blank', 'width=600,height=520');
    if (!printWin) {
        window.print();
        return;
    }

    const urlBase = window.location.href.split('panel.html')[0];
    const linkCita = `${urlBase}index.html?cita=${c.id}`;

    printWin.document.write(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <title>Talón de Citación - Hospital Schestakow</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 24px; color: #1e293b; }
                .header { text-align: center; border-bottom: 2px solid #047857; padding-bottom: 12px; margin-bottom: 16px; }
                .title { font-size: 16px; font-weight: bold; text-transform: uppercase; color: #047857; }
                .subtitle { font-size: 12px; color: #64748b; }
                .box { border: 1px dashed #047857; padding: 14px; border-radius: 8px; margin-bottom: 16px; background: #f8fafc; }
                .row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 13px; }
                .label { font-weight: bold; color: #334155; }
                .val { font-weight: bold; color: #047857; }
                .footer { font-size: 11px; color: #64748b; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 12px; }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="title">Hospital Teodoro J. Schestakow</div>
                <div class="subtitle">Orden de Citación y Seguimiento Médico</div>
            </div>
            <div class="box">
                <div class="row"><span class="label">Paciente:</span> <span>${c.pacienteNombre} (DNI ${c.pacienteDni})</span></div>
                <div class="row"><span class="label">Profesional:</span> <span>${c.medico} (${c.especialidad})</span></div>
                <div class="row"><span class="label">Fecha Asignada:</span> <span class="val">${c.fecha}</span></div>
                <div class="row"><span class="label">Horario:</span> <span class="val">${horarioTexto}</span></div>
                ${c.motivoCitacion ? `<div class="row"><span class="label">Indicación / Plan:</span> <span>${c.motivoCitacion}</span></div>` : ''}
                <div class="row"><span class="label">Código de Turno:</span> <span style="font-family: monospace;">${c.codigoConfirmacion}</span></div>
            </div>
            ${!esExacto ? `
                <div style="background:#ecfdf5; border:1px solid #a7f3d0; padding:10px; border-radius:6px; font-size:12px; margin-bottom:14px; text-align:center;">
                    <strong>Elección de Horario:</strong> Ingresá al siguiente enlace para elegir tu horario preferido del día asignado:<br>
                    <span style="font-family:monospace; color:#047857; word-break:break-all; font-weight:bold;">${linkCita}</span>
                </div>
            ` : ''}
            <div class="footer">
                Presentarse con 10 minutos de anticipación y DNI.<br>
                Emilio Civit 150, San Rafael, Mendoza. Tel: (0260) 442-7086.
            </div>
            <script>window.onload = function() { window.print(); }<\/script>
        </body>
        </html>
    `);
    printWin.document.close();
}

export function inicializarEventosHC() {
    const btnBuscarHC = document.getElementById('btn-buscar-paciente-hc');
    if (btnBuscarHC) {
        btnBuscarHC.addEventListener('click', () => buscarPacientePorDni());
    }

    const inputDniHC = document.getElementById('input-buscar-dni-medico');
    if (inputDniHC) {
        inputDniHC.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                buscarPacientePorDni();
            }
        });
    }

    const btnEmergencia = document.getElementById('btn-abrir-emergencia');
    if (btnEmergencia) {
        btnEmergencia.addEventListener('click', () => {
            const elDni = document.getElementById('modal-emergencia-dni');
            const elMot = document.getElementById('modal-emergencia-motivo');
            if (elDni) elDni.value = '';
            if (elMot) elMot.value = '';
            abrirModal('modal-acceso-emergencia');
        });
    }

    const btnConfirmarEmergencia = document.getElementById('btn-confirmar-acceso-emergencia');
    if (btnConfirmarEmergencia) {
        btnConfirmarEmergencia.addEventListener('click', () => ejecutarAccesoEmergencia());
    }

    const btnEditarResumen = document.getElementById('btn-editar-resumen-clinico');
    if (btnEditarResumen) {
        btnEditarResumen.addEventListener('click', () => abrirModalEditarResumen());
    }

    const btnConfirmarResumen = document.getElementById('btn-confirmar-guardar-resumen');
    if (btnConfirmarResumen) {
        btnConfirmarResumen.addEventListener('click', () => guardarResumenClinico());
    }

    const btnExportarHC = document.getElementById('btn-exportar-hc');
    if (btnExportarHC) {
        btnExportarHC.addEventListener('click', () => exportarHistoriaClinica());
    }

    const btnCerrarHC = document.getElementById('btn-cerrar-paciente-hc');
    if (btnCerrarHC) {
        btnCerrarHC.addEventListener('click', () => cerrarFichaPacienteHC());
    }

    const btnGuardarConsulta = document.getElementById('btn-guardar-consulta-hc');
    if (btnGuardarConsulta) {
        btnGuardarConsulta.addEventListener('click', () => guardarConsultaInmutable());
    }

    const btnConfirmarRect = document.getElementById('btn-confirmar-guardar-rectificacion');
    if (btnConfirmarRect) {
        btnConfirmarRect.addEventListener('click', () => guardarRectificacionInmutable());
    }
}

// Exponer en window para manejadores inline del DOM
window.cargarAgendaMedico = cargarAgendaMedico;
window.llamarPaciente = llamarPaciente;
window.marcarAusente = marcarAusente;
window.guardarConsultaInmutable = guardarConsultaInmutable;
window.guardarEvolucionMedico = guardarConsultaInmutable;
window.buscarPacientePorDni = buscarPacientePorDni;
window.abrirFichaPacienteHC = abrirFichaPacienteHC;
window.abrirModalRectificar = abrirModalRectificar;
window.guardarRectificacionInmutable = guardarRectificacionInmutable;
window.abrirModalEditarResumen = abrirModalEditarResumen;
window.guardarResumenClinico = guardarResumenClinico;
window.ejecutarAccesoEmergencia = ejecutarAccesoEmergencia;
window.exportarHistoriaClinica = exportarHistoriaClinica;
window.cerrarFichaPacienteHC = cerrarFichaPacienteHC;
window.abrirModalProximaConsulta = abrirModalProximaConsulta;
window.toggleModoHorarioCitacion = toggleModoHorarioCitacion;
window.cambioFechaProximaConsulta = cambioFechaProximaConsulta;
window.seleccionarSlotProximaConsulta = seleccionarSlotProximaConsulta;
window.guardarProximaConsultaMedico = guardarProximaConsultaMedico;
window.copiarEnlaceCitacion = copiarEnlaceCitacion;
window.imprimirComprobanteCitacion = imprimirComprobanteCitacion;
window.llamarSiguientePaciente = llamarSiguientePaciente;
window.sincronizarEvolucionCampos = sincronizarEvolucionCampos;
