// ==========================================
// MÓDULO PÚBLICO: RESERVA Y GESTIÓN DE PACIENTES
// ==========================================

import {
    db,
    collection,
    query,
    where,
    getDocs,
    doc,
    getDoc,
    functionsInstancia,
    httpsCallable,
    asegurarSesionAnonima
} from "./firebase-config.js";

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
    EMAILJS_TEMPLATE_CONFIRMACION,
    EMAILJS_TEMPLATE_CANCELACION
} from "./utils.js";

let bdMedicosDinamica = {};
let duracionTurnoGlobal = 15;
let modulacionPorMedico = {};
let turnoEncontradoActivo = null;
let codigoBusquedaActivo = '';

// Exponer a window para interacción directa desde los atributos HTML
window.abrirModal = abrirModal;
window.cerrarModal = cerrarModal;
window.validarDiaHabil = validarDiaHabil;
window.actualizarMedicosPublico = actualizarMedicosPublico;
window.generarHorariosPublicos = generarHorariosPublicos;
window.seleccionarHorario = seleccionarHorario;
window.confirmarTurnoFirebase = confirmarTurnoFirebase;
window.buscarTurnosPaciente = buscarTurnosPaciente;
window.cancelarTurnoFirebase = cancelarTurnoFirebase;

export async function cargarEspecialistasPublico() {
    try {
        const snap = await getDocs(query(collection(db, "usuarios"), where("rol", "==", "Médico")));
        bdMedicosDinamica = {};

        snap.forEach((documento) => {
            const u = documento.data();
            if (u.especialidad && u.nombre && u.activo !== false) {
                if (!bdMedicosDinamica[u.especialidad]) bdMedicosDinamica[u.especialidad] = [];
                if (!bdMedicosDinamica[u.especialidad].includes(u.nombre)) {
                    bdMedicosDinamica[u.especialidad].push(u.nombre);
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
                const tieneMedicos = bdMedicosDinamica[esp] && bdMedicosDinamica[esp].length > 0;
                opcionesHtml += `<option value="${esp}">${esp} ${tieneMedicos ? `(${bdMedicosDinamica[esp].length})` : '(Sin agenda)'}</option>`;
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
        opts += `<option value="${escaparHTML(m)}">${escaparHTML(m)}</option>`;
    });
    selectMed.innerHTML = opts;
    generarHorariosPublicos();
}

export async function generarHorariosPublicos() {
    const med = document.getElementById('select-medico').value;
    const fec = document.getElementById('input-fecha-paciente').value;
    const container = document.getElementById('horarios-publicos');

    if (!container) return;

    if (!med || !fec) {
        container.innerHTML = '<p class="text-sm text-slate-500 col-span-2 sm:col-span-3 text-center">Seleccione Profesional y Fecha.</p>';
        return;
    }

    container.innerHTML = '<p class="text-sm text-slate-400 col-span-2 sm:col-span-3 text-center">Consultando disponibilidad en vivo...</p>';

    let turnosOcupados = {};
    try {
        const q = query(
            collection(db, "turnos"),
            where("medico", "==", med),
            where("fecha", "==", fec)
        );
        const snap = await getDocs(q);
        snap.forEach(d => {
            const data = d.data();
            if (!data.estado || !data.estado.toLowerCase().includes("cancelado")) {
                turnosOcupados[data.horario] = true;
            }
        });
    } catch (e) {
        console.warn("Fallo lectura de turnos en vivo:", e);
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
    container.innerHTML = html || '<p class="text-sm text-slate-500 col-span-2 sm:col-span-3 text-center">No hay turnos web disponibles.</p>';
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
    const med = document.getElementById('select-medico').value;
    const fec = document.getElementById('input-fecha-paciente').value;
    const btn = document.querySelector('.btn-horario.bg-blue-800');
    const hor = btn ? btn.innerText.replace(' (Ocupado)', '').replace(' (Cerrado)', '').trim() : '';
    const nom = document.getElementById('paciente-nombre').value.trim();
    const dni = document.getElementById('paciente-dni').value.trim();
    const cel = document.getElementById('paciente-celular').value.trim();
    const email = document.getElementById('paciente-email').value.trim();

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

    try {
        await asegurarSesionAnonima();
        const llamarCrearTurno = httpsCallable(functionsInstancia, 'crearTurnoPublico');
        const respuesta = await llamarCrearTurno({
            especialidad: esp, medico: med, fecha: fec, horario: hor,
            pacienteNombre: nom, pacienteDni: dni, pacienteCelular: cel, pacienteEmail: email
        });
        const codigo = respuesta.data.codigo;

        enviarCorreoNotificacion(EMAILJS_TEMPLATE_CONFIRMACION, {
            nombre_paciente: nom, medico: med, especialidad: esp, fecha: fec, hora: hor,
            email_destino: email, codigo_confirmacion: codigo
        });

        mostrarExito("¡Turno Confirmado!", `Tu código de confirmación es ${codigo}. Guardalo: lo vas a necesitar para cancelar o consultar este turno. También te lo enviamos por email.`);

        document.getElementById('paciente-nombre').value = '';
        document.getElementById('paciente-dni').value = '';
        document.getElementById('paciente-celular').value = '';
        document.getElementById('paciente-email').value = '';
        document.getElementById('input-fecha-paciente').value = '';
        document.getElementById('select-especialidad').value = '';
        document.getElementById('horarios-publicos').innerHTML = '<p class="text-sm text-slate-500 col-span-2 sm:col-span-3 text-center mt-2">Seleccione una fecha.</p>';
        document.getElementById('select-medico').innerHTML = '<option>Primero seleccione especialidad</option>';
        document.getElementById('select-medico').disabled = true;

    } catch (error) {
        console.error("Error al confirmar turno:", error);
        mostrarAlerta("Error al Registrar", error.message || "Hubo un error al registrar el turno. Intente nuevamente.");
    }
}

export async function buscarTurnosPaciente() {
    const dni = document.getElementById('input-buscar-dni').value.trim();
    const codigo = document.getElementById('input-buscar-codigo').value.trim().toUpperCase();
    const res = document.getElementById('resultado-turnos-paciente');

    if (!dni || !codigo) {
        mostrarAlerta("Dato Faltante", "Ingresá tu DNI y el código de confirmación.");
        return;
    }

    try {
        const llamarBuscarTurno = httpsCallable(functionsInstancia, 'buscarTurnoPorCodigo');
        const respuesta = await llamarBuscarTurno({ dni, codigo });
        const t = respuesta.data.turno;

        turnoEncontradoActivo = t;
        codigoBusquedaActivo = codigo;

        const cancelado = t.estado && t.estado.includes("Cancelado");
        const badge = cancelado ? `<span class="text-xs bg-red-100 text-red-800 px-2 py-1 rounded font-bold">${escaparHTML(t.estado)}</span>` : '';
        const btn = cancelado || t.estado === "Atendido" || t.estado === "Ausente" ? '' : `<button onclick="cancelarTurnoFirebase('${t.id}')" class="text-xs bg-white text-red-700 px-3 py-2 rounded font-bold border hover:bg-red-50 transition">Cancelar</button>`;
        res.innerHTML = `<div class="bg-slate-50 border p-3 rounded-lg flex flex-col sm:flex-row justify-between items-start sm:items-center mb-2 gap-2"><div class="w-full"><p class="font-bold text-sm text-blue-900">${escaparHTML(t.especialidad)} - ${escaparHTML(t.medico)}</p><p class="text-xs text-slate-600 mt-1">${escaparHTML(t.fecha)} - ${escaparHTML(t.horario)} hs ${badge}</p></div>${btn}</div>`;
        res.classList.remove('hidden');
    } catch (error) {
        console.error(error);
        res.innerHTML = `<p class="text-sm text-red-600 font-semibold text-center mt-4">${error.message || 'No encontramos ningún turno con esos datos.'}</p>`;
        res.classList.remove('hidden');
    }
}

export async function cancelarTurnoFirebase(id) {
    const confirmado = await pedirConfirmacion("¿Cancelar este turno?", "Se cancelará la reserva y se enviará un correo notificando la cancelación.", "Sí, cancelar turno");
    if (!confirmado) return;

    try {
        const llamarCancelarTurno = httpsCallable(functionsInstancia, 'cancelarTurnoConCodigo');
        const respuesta = await llamarCancelarTurno({ id, codigo: codigoBusquedaActivo });
        const t = respuesta.data.turno;

        enviarCorreoNotificacion(EMAILJS_TEMPLATE_CANCELACION, {
            nombre_paciente: t.pacienteNombre, medico: t.medico, especialidad: t.especialidad, fecha: t.fecha, hora: t.horario, email_destino: t.pacienteEmail
        });

        mostrarExito("Turno Cancelado", "Tu turno ha sido cancelado exitosamente.");
        cerrarModal('modal-cancelar-paciente');
        generarHorariosPublicos();
    } catch (error) {
        console.error(error);
        mostrarAlerta("Error", error.message || "No se pudo cancelar el turno.");
    }
}

// Inicialización automática al cargar el DOM
document.addEventListener("DOMContentLoaded", async () => {
    establecerLimitesFecha(['input-fecha-paciente']);
    await asegurarSesionAnonima();
    await cargarEspecialistasPublico();
    await cargarConfiguracionModulacionPublico();
});
