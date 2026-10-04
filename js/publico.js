// ==========================================
// MÓDULO PÚBLICO: RESERVA Y GESTIÓN DE PACIENTES
// Operación segura y directa en Firestore (Plan Spark)
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
    deleteDoc,
    writeBatch,
    serverTimestamp
} from "./firebase.js";

import {
    mostrarAlerta,
    mostrarExito,
    pedirConfirmacion,
    abrirModal,
    cerrarModal,
    escaparHTML,
    validarDiaHabil,
    establecerLimitesFecha,
    enviarCorreoNotificacion,
    formatearFechaAR,
    formatearHoraAR,
    mostrarToast,
    EMAILJS_TEMPLATE_CONFIRMACION,
    EMAILJS_TEMPLATE_CANCELACION
} from "./ui.js";

let bdMedicosDinamica = {};
let duracionTurnoGlobal = 15;
let modulacionPorMedico = {};
let turnoEncontradoActivo = null;

// Exponer funciones necesarias para interacción del DOM
window.abrirModal = abrirModal;
window.cerrarModal = cerrarModal;
window.validarDiaHabil = validarDiaHabil;
window.actualizarMedicosPublico = actualizarMedicosPublico;
window.generarHorariosPublicos = generarHorariosPublicos;
window.seleccionarHorario = seleccionarHorario;
window.confirmarTurnoFirebase = confirmarTurnoFirebase;
window.buscarTurnosPaciente = buscarTurnosPaciente;
window.cancelarTurnoFirebase = cancelarTurnoFirebase;
window.abrirModalElegirHorarioCitacion = abrirModalElegirHorarioCitacion;
window.seleccionarSlotCitacion = seleccionarSlotCitacion;
window.confirmarHorarioCitacionPaciente = confirmarHorarioCitacionPaciente;

/**
 * Genera un identificador largo criptográficamente impredecible (>= 20 caracteres)
 * para acceso por token-bearer seguro de los pacientes sin requerir listado de colección.
 */
function generarIdLargoCripto(longitud = 20) {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
    const array = new Uint8Array(longitud);
    window.crypto.getRandomValues(array);
    let resultado = "";
    for (let i = 0; i < longitud; i++) {
        resultado += chars[array[i] % chars.length];
    }
    return resultado;
}

/**
 * Carga el catálogo público de profesionales desde medicos_publicos
 * Si la colección aún no tiene registros (primera ejecución), consulta usuarios como fallback.
 */
export async function cargarEspecialistasPublico() {
    try {
        let snap = await getDocs(query(collection(db, "medicos_publicos"), where("activo", "==", true)));
        
        // Fallback defensivo si la proyección pública aún no fue sincronizada
        if (snap.empty) {
            try {
                snap = await getDocs(query(collection(db, "usuarios"), where("rol", "==", "Médico")));
            } catch (errFallback) {
                // usuarios cerrado por reglas: comportamiento esperado en producción
            }
        }

        bdMedicosDinamica = {};

        snap.forEach((documento) => {
            const u = documento.data();
            const uid = u.medicoUid || documento.id;
            if (u.especialidad && u.nombre && u.activo !== false) {
                if (!bdMedicosDinamica[u.especialidad]) bdMedicosDinamica[u.especialidad] = [];
                const yaEsta = bdMedicosDinamica[u.especialidad].some(m => m.uid === uid);
                if (!yaEsta) {
                    bdMedicosDinamica[u.especialidad].push({ uid, nombre: u.nombre });
                }
            }
        });

        const categoriasBase = {
            "Especialidades Clínicas": ["Clínica Médica", "Cardiología", "Pediatría", "Neurología", "Endocrinología", "Gastroenterología", "Neumonología", "Nefrología", "Infectología", "Dermatología", "Geriatría", "Hematología", "Alergia e Inmunología"],
            "Especialidades Quirúrgicas": ["Cirugía General", "Cirugía Cardiovascular", "Cirugía Plástica y Reparadora", "Traumatología y Ortopedia", "Neurocirugía", "Urología", "Otorrinolaringología", "Oftalmología", "Ginecología y Obstetricia"],
            "Diagnóstico, Tratamiento y Guardia": ["Diagnóstico por Imágenes", "Anatomía Patológica", "Anestesiología", "Terapia Intensiva", "Medicina Física y Rehabilitación", "Medicina de Emergencias"]
        };

        const selectEspPublico = document.getElementById('select-especialidad');
        let opcionesHtml = '<option value="">-- Elija una especialidad --</option>';

        for (const [categoria, subespecialidades] of Object.entries(categoriasBase)) {
            opcionesHtml += `<optgroup label="${categoria}">`;
            subespecialidades.forEach(esp => {
                const medicosList = bdMedicosDinamica[esp] || [];
                const tieneMedicos = medicosList.length > 0;
                opcionesHtml += `<option value="${esp}">${esp} ${tieneMedicos ? `(${medicosList.length})` : '(Sin agenda)'}</option>`;
            });
            opcionesHtml += `</optgroup>`;
        }

        if (selectEspPublico) selectEspPublico.innerHTML = opcionesHtml;
    } catch (e) {
        console.warn("No se pudieron cargar especialistas públicos:", e);
    }
}

export async function cargarConfiguracionModulacionPublico() {
    try {
        const snapGlobal = await getDoc(doc(db, "configuracion", "general"));
        if (snapGlobal.exists()) {
            duracionTurnoGlobal = snapGlobal.data().duracionBase || 15;
        }
        const snapIndividual = await getDocs(collection(db, "modulacion_medicos"));
        modulacionPorMedico = {};
        snapIndividual.forEach(d => {
            modulacionPorMedico[d.id] = d.data().duracionBase;
        });
    } catch (e) {
        console.log("Configuración por defecto cargada.");
    }
}

export function actualizarMedicosPublico() {
    const esp = document.getElementById('select-especialidad').value;
    const selectMed = document.getElementById('select-medico');
    const containerHorarios = document.getElementById('horarios-publicos');

    if (!selectMed) return;

    if (!esp) {
        selectMed.innerHTML = '<option value="">Primero seleccione especialidad</option>';
        selectMed.disabled = true;
        selectMed.classList.add('bg-slate-50', 'text-slate-500');
        if (containerHorarios) containerHorarios.innerHTML = '<p class="text-sm text-slate-500 col-span-2 sm:col-span-3 text-center">Seleccione Especialidad y Profesional.</p>';
        return;
    }

    const medicos = bdMedicosDinamica[esp] || [];
    if (medicos.length === 0) {
        selectMed.innerHTML = '<option value="">No hay profesionales disponibles</option>';
        selectMed.disabled = true;
        selectMed.classList.add('bg-slate-50', 'text-slate-500');
        if (containerHorarios) containerHorarios.innerHTML = '<p class="text-sm text-slate-500 col-span-2 sm:col-span-3 text-center">No hay profesionales disponibles en esta área.</p>';
        return;
    }

    selectMed.disabled = false;
    selectMed.classList.remove('bg-slate-50', 'text-slate-500');
    let opts = '<option value="">-- Elija un médico --</option>';
    medicos.forEach(m => {
        opts += `<option value="${escaparHTML(m.nombre)}" data-uid="${escaparHTML(m.uid)}">${escaparHTML(m.nombre)}</option>`;
    });
    selectMed.innerHTML = opts;
    generarHorariosPublicos();
}

export async function generarHorariosPublicos() {
    const selectMed = document.getElementById('select-medico');
    const med = selectMed?.value;
    const fec = document.getElementById('input-fecha-paciente')?.value;
    const container = document.getElementById('horarios-publicos');

    if (!container) return;

    if (!med || !fec) {
        container.innerHTML = '<p class="text-sm text-slate-500 col-span-2 sm:col-span-3 text-center">Seleccione Profesional y Fecha.</p>';
        return;
    }

    const selectedOption = selectMed.options[selectMed.selectedIndex];
    const medicoUid = selectedOption ? selectedOption.getAttribute('data-uid') : '';

    container.innerHTML = '<p class="text-sm text-slate-400 col-span-2 sm:col-span-3 text-center">Consultando disponibilidad en vivo...</p>';

    let turnosOcupados = {};
    try {
        // Consultar la colección pública y anónima de slots ocupados
        if (medicoUid) {
            const qDisp = query(
                collection(db, "disponibilidad"),
                where("medicoUid", "==", medicoUid),
                where("fecha", "==", fec)
            );
            const snapDisp = await getDocs(qDisp);
            snapDisp.forEach(d => {
                const data = d.data();
                if (data.horario) turnosOcupados[data.horario] = true;
            });
        }
    } catch (e) {
        console.warn("Fallo lectura de disponibilidad:", e);
    }

    const duracionActual = modulacionPorMedico[med] || duracionTurnoGlobal;
    const hoy = new Date();
    const hoyStr = hoy.toISOString().split('T')[0];
    const esHoy = (fec === hoyStr);
    const minActuales = hoy.getHours() * 60 + hoy.getMinutes();

    let html = '';
    let minBucle = 7 * 60;
    const finBucle = 12 * 60 + 30;
    let esCanalWeb = true;
    let delay = 0;

    while (minBucle <= finBucle) {
        let h = Math.floor(minBucle / 60);
        let m = minBucle % 60;
        let hsStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;

        if (esCanalWeb) {
            if (turnosOcupados[hsStr]) {
                html += `<button type="button" class="bg-slate-100 text-slate-400 font-bold rounded p-2 border cursor-not-allowed animate-fade-in-up-fast" style="animation-delay: ${delay}ms" disabled>${hsStr} (Ocupado)</button>`;
            } else if (esHoy && (minBucle - minActuales) < 60) {
                html += `<button type="button" class="bg-red-50 text-red-400 font-bold rounded p-2 border border-red-200 cursor-not-allowed animate-fade-in-up-fast" style="animation-delay: ${delay}ms" disabled>${hsStr} (Cerrado)</button>`;
            } else {
                html += `<button type="button" onclick="seleccionarHorario(this)" class="btn-horario bg-white border border-blue-800 text-blue-900 font-bold rounded p-2 hover:bg-blue-50 shadow-sm transition animate-fade-in-up-fast" style="animation-delay: ${delay}ms">${hsStr}</button>`;
            }
            delay += 10;
        }
        esCanalWeb = !esCanalWeb;
        minBucle += duracionActual;
    }
    container.innerHTML = html || '<div class="col-span-2 sm:col-span-4 py-4 text-center text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded">No hay turnos disponibles para esta fecha. Por favor seleccione otro día hábil.</div>';
}

export function seleccionarHorario(btnClickeado) {
    document.querySelectorAll('.btn-horario').forEach(btn => {
        btn.classList.remove('bg-blue-800', 'text-white');
        btn.classList.add('bg-white', 'text-blue-900');
    });
    btnClickeado.classList.remove('bg-white', 'text-blue-900');
    btnClickeado.classList.add('bg-blue-800', 'text-white');
}

export async function confirmarTurnoFirebase() {
    const esp = document.getElementById('select-especialidad').value;
    const selectMed = document.getElementById('select-medico');
    const med = selectMed ? selectMed.value : '';
    const fec = document.getElementById('input-fecha-paciente').value;
    const btn = document.querySelector('.btn-horario.bg-blue-800');
    const hor = btn ? btn.innerText.replace(' (Ocupado)', '').replace(' (Cerrado)', '').trim() : '';
    const nom = document.getElementById('paciente-nombre').value.trim();
    const dni = document.getElementById('paciente-dni').value.trim();
    const cel = document.getElementById('paciente-celular').value.trim();
    const email = document.getElementById('paciente-email').value.trim();

    const chkConsentimiento = document.getElementById('consentimiento-datos');
    if (chkConsentimiento && !chkConsentimiento.checked) {
        mostrarAlerta("Consentimiento Requerido", "Debe aceptar el tratamiento de datos de acuerdo a la Ley 25.326 para continuar.");
        return;
    }

    const coberturaEl = document.getElementById('paciente-cobertura');
    const cobertura = coberturaEl ? coberturaEl.value : 'Sin Cobertura (Pública)';
    const nacEl = document.getElementById('paciente-fecha-nacimiento');
    const fechaNacimiento = nacEl ? nacEl.value : '';

    if (!esp || !med || !fec || !hor) {
        mostrarAlerta("Datos Incompletos", "Seleccione Especialidad, Profesional, Fecha y Horario.");
        return;
    }
    if (!nom || !dni || !cel) {
        mostrarAlerta("Faltan Datos del Paciente", "Nombre, DNI y Celular son campos obligatorios.");
        return;
    }
    if (!/^[0-9]{6,10}$/.test(dni)) {
        mostrarAlerta("DNI Inválido", "El DNI debe tener entre 6 y 10 dígitos numéricos sin puntos.");
        return;
    }
    if (!/^[0-9+ -]{6,20}$/.test(cel)) {
        mostrarAlerta("Celular Inválido", "El celular ingresado no tiene un formato válido.");
        return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        mostrarAlerta("Correo Inválido", "El formato del correo electrónico es incorrecto.");
        return;
    }

    const selectedOption = selectMed.options[selectMed.selectedIndex];
    const medicoUid = selectedOption ? (selectedOption.getAttribute('data-uid') || 'medico_demo') : 'medico_demo';

    try {
        const slotId = `${medicoUid}_${fec}_${hor.replace(':', '')}`;
        const slotRef = doc(db, "disponibilidad", slotId);

        // Verificación previa del slot determinista
        const slotSnap = await getDoc(slotRef);
        if (slotSnap.exists()) {
            mostrarAlerta("Horario No Disponible", "El horario seleccionado ya fue reservado. Por favor elija otro.");
            generarHorariosPublicos();
            return;
        }

        // Generar identificador de documento impredecible (20 caracteres criptográficos)
        const turnoId = generarIdLargoCripto(20);
        const turnoRef = doc(db, "turnos", turnoId);

        // Escritura atómica en lote: Slot determinista + Turno detallado
        const batch = writeBatch(db);

        batch.set(slotRef, {
            medicoUid: medicoUid,
            fecha: fec,
            horario: hor,
            creadoEn: serverTimestamp()
        });

        batch.set(turnoRef, {
            especialidad: esp,
            medico: med,
            medicoUid: medicoUid,
            fecha: fec,
            horario: hor,
            pacienteNombre: nom,
            pacienteDni: dni,
            pacienteCelular: cel,
            pacienteEmail: email || "",
            pacienteCobertura: cobertura,
            pacienteFechaNacimiento: fechaNacimiento,
            codigoConfirmacion: turnoId,
            canal: "Web",
            estado: "Confirmado",
            creadoEn: serverTimestamp(),
            creadoPor: null,
            llegadaEn: null,
            inicioConsultaEn: null,
            finConsultaEn: null,
            canceladoPor: null,
            canceladoEn: null,
            reprogramadoDe: null
        });

        await batch.commit();

        enviarCorreoNotificacion(EMAILJS_TEMPLATE_CONFIRMACION, {
            nombre_paciente: nom, medico: med, especialidad: esp, fecha: fec, hora: hor,
            email_destino: email, codigo_confirmacion: turnoId
        });

        mostrarExito("¡Turno Confirmado!", `Tu código secreto de consulta y cancelación es: ${turnoId}. Guardalo para gestionar tu turno.`);

        document.getElementById('paciente-nombre').value = '';
        document.getElementById('paciente-dni').value = '';
        document.getElementById('paciente-celular').value = '';
        document.getElementById('paciente-email').value = '';
        if (document.getElementById('paciente-cobertura')) document.getElementById('paciente-cobertura').value = 'Sin Cobertura (Pública)';
        if (document.getElementById('paciente-fecha-nacimiento')) document.getElementById('paciente-fecha-nacimiento').value = '';
        if (chkConsentimiento) chkConsentimiento.checked = false;
        document.getElementById('input-fecha-paciente').value = '';
        document.getElementById('select-especialidad').value = '';
        document.getElementById('horarios-publicos').innerHTML = '<p class="text-xs text-slate-500 col-span-2 sm:col-span-4 text-center py-3">Seleccione Profesional y Fecha para ver horarios.</p>';
        document.getElementById('select-medico').innerHTML = '<option>Primero seleccione especialidad</option>';
        document.getElementById('select-medico').disabled = true;

    } catch (error) {
        console.error("Error al confirmar turno:", error);
        mostrarAlerta("Error al Registrar", "Hubo un error al registrar el turno. Intente nuevamente.");
    }
}

/**
 * Consulta un turno mediante get directo por su ID de documento impredecible,
 * evitando enumeraciones o queries públicas de listado en Firestore.
 */
export async function buscarTurnosPaciente() {
    const dni = document.getElementById('input-buscar-dni').value.trim();
    const codigo = document.getElementById('input-buscar-codigo').value.trim();
    const res = document.getElementById('resultado-turnos-paciente');

    if (!dni || !codigo) {
        mostrarAlerta("Dato Faltante", "Ingresá tu DNI y el código de confirmación del turno.");
        return;
    }

    try {
        res.innerHTML = '<div class="py-4 text-center text-xs text-slate-500 flex items-center justify-center gap-2"><span class="inline-block w-4 h-4 border-2 border-slate-300 border-t-[#002845] rounded-full animate-spin"></span> Buscando turno registrado...</div>';
        res.classList.remove('hidden');

        const snap = await getDoc(doc(db, "turnos", codigo));

        if (!snap.exists()) {
            res.innerHTML = '<div class="empty-state-his bg-slate-50 border border-slate-200 rounded p-4 text-center"><p class="text-xs text-slate-600">No encontramos ningún turno con ese identificador.</p></div>';
            return;
        }

        const t = snap.data();
        if (t.pacienteDni !== dni) {
            res.innerHTML = '<div class="p-3 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded text-center">El DNI ingresado no coincide con el turno registrado.</div>';
            return;
        }

        turnoEncontradoActivo = { id: snap.id, ...t };

        const cancelado = t.estado && t.estado.includes("Cancelado");
        let badge = '';
        let btnHtml = '';
        const esPendienteHorario = (t.estado === "Pendiente de Horario");

        if (cancelado) {
            badge = `<span class="badge-his badge-his-cancelado">${escaparHTML(t.estado)}</span>`;
        } else if (esPendienteHorario) {
            badge = `<span class="badge-his badge-his-espera">Horario a Elección</span>`;
            btnHtml = `
                <div class="flex gap-2">
                    <button onclick="abrirModalElegirHorarioCitacion('${snap.id}')" class="btn-his-success text-xs px-3 py-1.5 shadow-xs">Elegir Horario</button>
                    <button id="btn-cancelar-turno-paciente" class="btn-his-danger text-xs px-3 py-1.5">Cancelar</button>
                </div>
            `;
        } else if (t.estado === "Atendido" || t.estado === "Ausente") {
            badge = `<span class="badge-his ${t.estado === 'Atendido' ? 'badge-his-atendido' : 'badge-his-ausente'}">${escaparHTML(t.estado)}</span>`;
        } else {
            badge = `<span class="badge-his badge-his-pendiente">${escaparHTML(t.estado)}</span>`;
            btnHtml = `<button id="btn-cancelar-turno-paciente" class="btn-his-danger text-xs px-3 py-1.5">Cancelar</button>`;
        }

        const horarioTexto = esPendienteHorario ? 'Horario a confirmar por el paciente' : `${escaparHTML(t.horario)} hs`;

        res.innerHTML = `
            <div class="bg-slate-50 border border-slate-200 p-3.5 rounded-lg flex flex-col sm:flex-row justify-between items-start sm:items-center mb-2 gap-2 shadow-xs">
                <div class="w-full">
                    <p class="font-bold text-sm text-[#002845]">${escaparHTML(t.especialidad)} - ${escaparHTML(t.medico)}</p>
                    <p class="text-xs text-slate-600 mt-1">${escaparHTML(formatearFechaAR(t.fecha))} - ${horarioTexto} ${badge}</p>
                    ${t.motivoCitacion ? `<p class="text-xs text-slate-500 italic mt-0.5">Indicación: ${escaparHTML(t.motivoCitacion)}</p>` : ''}
                </div>
                ${btnHtml}
            </div>
        `;

        const btnCancelar = document.getElementById('btn-cancelar-turno-paciente');
        if (btnCancelar) {
            btnCancelar.addEventListener('click', () => {
                cancelarTurnoFirebase(snap.id);
            });
        }
    } catch (error) {
        console.error(error);
        res.innerHTML = '<div class="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded text-center">Error al buscar el turno. Intente nuevamente.</div>';
    }
}

export async function abrirModalElegirHorarioCitacion(citaId) {
    if (!citaId) return;
    try {
        const snap = await getDoc(doc(db, "turnos", citaId));
        if (!snap.exists()) {
            mostrarAlerta("Citación no encontrada", "El enlace o código ingresado no corresponde a ninguna citación válida.");
            return;
        }

        const t = snap.data();
        if (t.estado !== "Pendiente de Horario") {
            if (t.estado === "Confirmado" || t.estado === "Confirmado Presencial") {
                mostrarAlerta("Turno ya Confirmado", `Esta citación ya cuenta con horario asignado: ${formatearFechaAR(t.fecha)} a las ${t.horario} hs.`);
            } else {
                mostrarAlerta("Estado del Turno", `Esta citación se encuentra en estado: ${t.estado}.`);
            }
            return;
        }

        const elNom = document.getElementById('cita-paciente-nombre');
        const elMed = document.getElementById('cita-medico-nombre');
        const elEsp = document.getElementById('cita-especialidad');
        const elFec = document.getElementById('cita-fecha');
        const elMot = document.getElementById('cita-motivo-texto');
        const elId = document.getElementById('cita-turno-id');
        const elHor = document.getElementById('cita-horario-seleccionado');

        if (elNom) elNom.innerText = t.pacienteNombre || 'Paciente';
        if (elMed) elMed.innerText = t.medico || 'Médico Asignado';
        if (elEsp) elEsp.innerText = t.especialidad || 'Consulta';
        if (elFec) elFec.innerText = formatearFechaAR(t.fecha) || '--';
        if (elMot) elMot.innerText = t.motivoCitacion ? `Indicación de su médico: ${t.motivoCitacion}` : '';
        if (elId) elId.value = citaId;
        if (elHor) elHor.value = '';

        const btnConfirmar = document.getElementById('btn-confirmar-horario-citacion');
        if (btnConfirmar) btnConfirmar.disabled = true;

        abrirModal('modal-elegir-horario-citacion');

        await cargarHorariosCitacion(t.medicoUid, t.medico, t.fecha);
    } catch (e) {
        console.error("Error al cargar citación:", e);
        mostrarAlerta("Error", "No se pudo cargar la información de la citación.");
    }
}

async function cargarHorariosCitacion(medicoUid, medicoNombre, fecha) {
    const container = document.getElementById('horarios-citacion-container');
    if (!container) return;

    container.innerHTML = '<p class="text-xs text-slate-400 col-span-3 text-center py-4">Consultando disponibilidad en vivo...</p>';

    let turnosOcupados = {};
    try {
        if (medicoUid) {
            const qDisp = query(
                collection(db, "disponibilidad"),
                where("medicoUid", "==", medicoUid),
                where("fecha", "==", fecha)
            );
            const snapDisp = await getDocs(qDisp);
            snapDisp.forEach(d => {
                const data = d.data();
                if (data.horario) turnosOcupados[data.horario] = true;
            });
        }
    } catch (e) {
        console.warn("Fallo lectura de disponibilidad:", e);
    }

    const duracionActual = modulacionPorMedico[medicoNombre] || duracionTurnoGlobal || 15;
    const hoy = new Date();
    const hoyStr = hoy.toISOString().split('T')[0];
    const esHoy = (fecha === hoyStr);
    const minActuales = hoy.getHours() * 60 + hoy.getMinutes();

    let html = '';
    let minBucle = 7 * 60;
    const finBucle = 12 * 60 + 30;
    let disponiblesCount = 0;

    while (minBucle <= finBucle) {
        let h = Math.floor(minBucle / 60);
        let m = minBucle % 60;
        let hsStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;

        if (turnosOcupados[hsStr]) {
            html += `<button type="button" class="bg-slate-100 text-slate-400 font-bold rounded p-2 text-xs border cursor-not-allowed" disabled>${hsStr} (Ocupado)</button>`;
        } else if (esHoy && (minBucle - minActuales) < 60) {
            html += `<button type="button" class="bg-red-50 text-red-400 font-bold rounded p-2 text-xs border border-red-200 cursor-not-allowed" disabled>${hsStr} (Cerrado)</button>`;
        } else {
            disponiblesCount++;
            html += `<button type="button" onclick="seleccionarSlotCitacion(this, '${hsStr}')" class="btn-slot-citacion bg-white border border-emerald-600 text-emerald-900 font-bold rounded p-2 text-xs hover:bg-emerald-50 shadow-sm transition">${hsStr}</button>`;
        }
        minBucle += duracionActual;
    }

    if (disponiblesCount === 0) {
        html = '<p class="text-xs text-red-500 col-span-3 text-center py-4">No quedan horarios disponibles para este día.</p>';
    }

    container.innerHTML = html;
}

export function seleccionarSlotCitacion(btn, horario) {
    document.querySelectorAll('.btn-slot-citacion').forEach(b => {
        b.classList.remove('bg-emerald-700', 'text-white', 'border-emerald-800');
        b.classList.add('bg-white', 'text-emerald-900', 'border-emerald-600');
    });
    btn.classList.remove('bg-white', 'text-emerald-900', 'border-emerald-600');
    btn.classList.add('bg-emerald-700', 'text-white', 'border-emerald-800');

    const inputHorario = document.getElementById('cita-horario-seleccionado');
    if (inputHorario) inputHorario.value = horario;

    const btnConfirmar = document.getElementById('btn-confirmar-horario-citacion');
    if (btnConfirmar) btnConfirmar.disabled = false;
}

export async function confirmarHorarioCitacionPaciente() {
    const citaId = document.getElementById('cita-turno-id')?.value;
    const horario = document.getElementById('cita-horario-seleccionado')?.value;

    if (!citaId || !horario) {
        mostrarAlerta("Horario Requerido", "Por favor seleccione un horario para su cita.");
        return;
    }

    const ok = await pedirConfirmacion("Confirmar Horario", `¿Desea confirmar su turno para las ${horario} hs?`, "Sí, Confirmar");
    if (!ok) return;

    const btnConfirmar = document.getElementById('btn-confirmar-horario-citacion');
    if (btnConfirmar) {
        btnConfirmar.disabled = true;
        btnConfirmar.innerText = "Guardando...";
    }

    try {
        const snap = await getDoc(doc(db, "turnos", citaId));
        if (!snap.exists()) {
            mostrarAlerta("Error", "No se encontró el turno.");
            return;
        }

        const t = snap.data();
        if (t.estado !== "Pendiente de Horario") {
            mostrarAlerta("Atención", "Este turno ya no se encuentra pendiente de horario.");
            cerrarModal('modal-elegir-horario-citacion');
            return;
        }

        const slotId = `${t.medicoUid}_${t.fecha}_${horario.replace(':', '')}`;
        const batch = writeBatch(db);

        // 1. Reservar slot en disponibilidad
        batch.set(doc(db, "disponibilidad", slotId), {
            medicoUid: t.medicoUid,
            fecha: t.fecha,
            horario: horario,
            creadoEn: serverTimestamp()
        });

        // 2. Actualizar turno
        const turnoRef = doc(db, "turnos", citaId);
        batch.update(turnoRef, {
            horario: horario,
            estado: "Confirmado",
            confirmadoEn: serverTimestamp()
        });

        await batch.commit();

        cerrarModal('modal-elegir-horario-citacion');
        mostrarExito("¡Turno Confirmado!", `Tu consulta con ${t.medico} quedó confirmada para el día ${formatearFechaAR(t.fecha)} a las ${horario} hs.`);

        if (t.pacienteEmail) {
            enviarCorreoNotificacion(EMAILJS_TEMPLATE_CONFIRMACION, {
                nombre_paciente: t.pacienteNombre,
                medico: t.medico,
                especialidad: t.especialidad,
                fecha: t.fecha,
                hora: horario,
                codigo_turno: citaId,
                email_destino: t.pacienteEmail
            });
        }

        const inputCodigo = document.getElementById('consulta-codigo-turno');
        if (inputCodigo && inputCodigo.value === citaId) {
            buscarTurnosPaciente();
        }
    } catch (e) {
        console.error("Error al confirmar horario de citación:", e);
        mostrarAlerta("Error al Confirmar", "No se pudo confirmar el horario seleccionado. Es posible que otro paciente lo haya ocupado recién.");
    } finally {
        if (btnConfirmar) {
            btnConfirmar.disabled = false;
            btnConfirmar.innerText = "Confirmar Horario";
        }
    }
}

export async function cancelarTurnoFirebase(id) {
    const confirmado = await pedirConfirmacion("¿Cancelar este turno?", "Se cancelará la reserva y se enviará un correo notificando la cancelación.", "Sí, cancelar turno");
    if (!confirmado) return;

    try {
        const batch = writeBatch(db);
        const turnoRef = doc(db, "turnos", id);

        batch.update(turnoRef, {
            estado: "Cancelado por Paciente",
            canceladoEn: serverTimestamp(),
            canceladoPor: "paciente"
        });

        if (turnoEncontradoActivo && turnoEncontradoActivo.medicoUid && turnoEncontradoActivo.fecha && turnoEncontradoActivo.horario) {
            const slotId = `${turnoEncontradoActivo.medicoUid}_${turnoEncontradoActivo.fecha}_${turnoEncontradoActivo.horario.replace(':', '')}`;
            batch.delete(doc(db, "disponibilidad", slotId));
        }

        await batch.commit();

        if (turnoEncontradoActivo) {
            enviarCorreoNotificacion(EMAILJS_TEMPLATE_CANCELACION, {
                nombre_paciente: turnoEncontradoActivo.pacienteNombre,
                medico: turnoEncontradoActivo.medico,
                especialidad: turnoEncontradoActivo.especialidad,
                fecha: turnoEncontradoActivo.fecha,
                hora: turnoEncontradoActivo.horario,
                email_destino: turnoEncontradoActivo.pacienteEmail
            });
        }

        mostrarExito("Turno Cancelado", "Tu turno ha sido cancelado exitosamente.");
        cerrarModal('modal-cancelar-paciente');
        generarHorariosPublicos();
    } catch (error) {
        console.error(error);
        mostrarAlerta("Error", "No se pudo cancelar el turno.");
    }
}

// Inicialización automática al cargar el DOM
document.addEventListener("DOMContentLoaded", async () => {
    establecerLimitesFecha(['input-fecha-paciente']);
    await cargarEspecialistasPublico();
    await cargarConfiguracionModulacionPublico();

    // Detección automática de parámetro ?cita=ID en la URL
    const urlParams = new URLSearchParams(window.location.search);
    const citaIdParam = urlParams.get('cita');
    if (citaIdParam) {
        await abrirModalElegirHorarioCitacion(citaIdParam);
    }
});
