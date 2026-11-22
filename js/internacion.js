// ==========================================
// MÓDULO INTERNACIÓN Y OCUPACIÓN DE CAMAS
// js/internacion.js
// ==========================================

import {
    db,
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
    query,
    where,
    orderBy,
    limit,
    serverTimestamp,
    writeBatch
} from "./firebase.js";

import {
    mostrarAlerta,
    mostrarExito,
    mostrarToast,
    pedirConfirmacion,
    escaparHTML,
    abrirModal,
    cerrarModal
} from "./ui.js";

import {
    obtenerSesionActual,
    esRolAdministracion,
    tienePermisoInternacion
} from "./auth.js";
import { ejecutarUnaVez } from "./guardia.js";

// Estado interno del módulo de internación
let camasCache = [];
let pisoSeleccionado = 1;
let sectorSeleccionado = "TODOS";
let filtroEstado = "TODOS";
let camaSeleccionadaParaAccion = null;

// =============================================================================
// 1. INICIALIZACIÓN Y CARGA DE DATOS
// =============================================================================

export async function inicializarModuloInternacion() {
    await cargarCamasHospital();
    renderizarPisosSelector();
    renderizarMapaCamas();
}

/**
 * Consulta todas las camas activas en la colección plana 'camas'
 */
export async function cargarCamasHospital() {
    try {
        const q = query(collection(db, "camas"), where("activo", "==", true));
        const snap = await getDocs(q);
        camasCache = [];

        snap.forEach(docSnap => {
            camasCache.push({ id: docSnap.id, ...docSnap.data() });
        });

        // Ordenar en memoria por piso, habitación y número de cama
        camasCache.sort((a, b) => {
            if (a.piso !== b.piso) return Number(a.piso) - Number(b.piso);
            if (a.habitacion !== b.habitacion) return String(a.habitacion).localeCompare(String(b.habitacion), undefined, { numeric: true });
            return String(a.numeroCama).localeCompare(String(b.numeroCama), undefined, { numeric: true });
        });

        return camasCache;
    } catch (err) {
        console.error("Error al cargar camas del hospital:", err);
        mostrarAlerta("Error al cargar camas", "No se pudo recuperar la estructura de internación. Verifique la conexión.");
        return [];
    }
}

// =============================================================================
// 2. RENDERIZADO VISUAL DEL MAPA POR PISO Y HABITACIÓN
// =============================================================================

export function renderizarPisosSelector() {
    const contenedor = document.getElementById("internacion-selector-pisos");
    if (!contenedor) return;

    // Obtener pisos únicos disponibles
    const pisosUnicos = [...new Set(camasCache.map(c => Number(c.piso)))].sort((a, b) => a - b);
    if (pisosUnicos.length === 0) pisosUnicos.push(1);

    if (!pisosUnicos.includes(Number(pisoSeleccionado))) {
        pisoSeleccionado = pisosUnicos[0];
    }

    let html = "";
    pisosUnicos.forEach(piso => {
        const activo = Number(piso) === Number(pisoSeleccionado);
        const clases = activo
            ? "bg-[#002845] text-white font-bold shadow-xs border-[#001c31]"
            : "bg-white text-slate-700 hover:bg-slate-100 border-slate-300 font-medium";
        html += `
            <button type="button" onclick="window.seleccionarPisoInternacion(${piso})"
                class="px-3.5 py-1.5 rounded-lg border text-xs sm:text-sm transition cursor-pointer flex items-center gap-1.5 ${clases}">
                <span>Piso ${piso}</span>
            </button>
        `;
    });

    contenedor.innerHTML = html;

    const sesion = obtenerSesionActual();
    const btnConfigCamas = document.getElementById("btn-admin-config-camas");
    if (btnConfigCamas) {
        if (sesion && esRolAdministracion(sesion.rol)) {
            btnConfigCamas.classList.remove("hidden");
        } else {
            btnConfigCamas.classList.add("hidden");
        }
    }
}

export function seleccionarPisoInternacion(piso) {
    pisoSeleccionado = Number(piso);
    renderizarPisosSelector();
    renderizarMapaCamas();
}

export function filtrarSectorInternacion(sector) {
    sectorSeleccionado = sector;
    renderizarMapaCamas();
}

export function filtrarEstadoInternacion(estado) {
    filtroEstado = estado;
    renderizarMapaCamas();
}

/**
 * Renderiza el plano visual de habitaciones y camas del piso seleccionado
 */
export function renderizarMapaCamas() {
    const contenedor = document.getElementById("internacion-mapa-grid");
    const metricasTotal = document.getElementById("internacion-badge-total");
    const metricasLibres = document.getElementById("internacion-badge-libres");
    const metricasOcupadas = document.getElementById("internacion-badge-ocupadas");

    if (!contenedor) return;

    // Métricas globales del piso actual
    const camasPisoActual = camasCache.filter(c => Number(c.piso) === Number(pisoSeleccionado));
    const libresPiso = camasPisoActual.filter(c => c.estado === "libre").length;
    const ocupadasPiso = camasPisoActual.filter(c => c.estado === "ocupada").length;

    if (metricasTotal) metricasTotal.textContent = String(camasPisoActual.length);
    if (metricasLibres) metricasLibres.textContent = String(libresPiso);
    if (metricasOcupadas) metricasOcupadas.textContent = String(ocupadasPiso);

    // Filtrar según controles
    let camasFiltradas = camasPisoActual;
    if (sectorSeleccionado !== "TODOS") {
        camasFiltradas = camasFiltradas.filter(c => c.sector === sectorSeleccionado);
    }
    if (filtroEstado !== "TODOS") {
        camasFiltradas = camasFiltradas.filter(c => c.estado === filtroEstado);
    }

    if (camasFiltradas.length === 0) {
        contenedor.innerHTML = `
            <div class="col-span-full py-12 text-center bg-slate-50 border border-dashed border-slate-300 rounded-2xl">
                <svg class="w-10 h-10 text-slate-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path>
                </svg>
                <p class="text-sm font-bold text-slate-700">No hay camas que coincidan con los filtros en este piso</p>
                <p class="text-xs text-slate-500 mt-0.5">Seleccione otro piso o limpie los criterios de búsqueda.</p>
            </div>
        `;
        return;
    }

    // Agrupar camas por habitación
    const habitaciones = {};
    camasFiltradas.forEach(cama => {
        const habId = cama.habitacion || "Sin Número";
        if (!habitaciones[habId]) {
            habitaciones[habId] = {
                numero: habId,
                sector: cama.sector || "General",
                tipo: cama.tipo || "Compartida",
                camas: []
            };
        }
        habitaciones[habId].camas.push(cama);
    });

    let html = "";
    Object.values(habitaciones).forEach(hab => {
        html += `
            <div class="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-2xs hover:shadow-md transition flex flex-col justify-between">
                <div>
                    <div class="flex items-center justify-between pb-2 mb-3 border-b border-slate-100">
                        <div class="flex items-center gap-2">
                            <span class="w-2.5 h-2.5 rounded-full ${hab.tipo === 'Individual' ? 'bg-indigo-600' : 'bg-sky-600'}"></span>
                            <h4 class="font-bold text-slate-900 text-sm">Habitación ${escaparHTML(hab.numero)}</h4>
                        </div>
                        <span class="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                            ${escaparHTML(hab.sector)}
                        </span>
                    </div>

                    <div class="grid grid-cols-2 gap-2.5">
                        ${hab.camas.map(cama => renderizarTarjetaCamaIndividual(cama)).join("")}
                    </div>
                </div>

                <div class="mt-3 pt-2 border-t border-slate-50 flex items-center justify-between text-[11px] text-slate-500">
                    <span>${escaparHTML(hab.tipo)}</span>
                    <span>${hab.camas.length} cama${hab.camas.length > 1 ? 's' : ''}</span>
                </div>
            </div>
        `;
    });

    contenedor.innerHTML = html;
}

function renderizarTarjetaCamaIndividual(cama) {
    const esOcupada = cama.estado === "ocupada";
    const esMantenimiento = cama.estado === "mantenimiento";

    let colorBorde = "border-emerald-300 bg-emerald-50/60 text-emerald-950";
    let badgeEstado = '<span class="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>';
    let textoEstado = "Libre";

    if (esOcupada) {
        colorBorde = "border-rose-300 bg-rose-50/70 text-rose-950 shadow-2xs";
        badgeEstado = '<span class="inline-block w-2 h-2 rounded-full bg-rose-600 animate-pulse"></span>';
        textoEstado = "Ocupada";
    } else if (esMantenimiento) {
        colorBorde = "border-amber-300 bg-amber-50/60 text-amber-950";
        badgeEstado = '<span class="inline-block w-2 h-2 rounded-full bg-amber-500"></span>';
        textoEstado = "Mantenimiento";
    }

    const pacienteInfo = esOcupada ? `
        <div class="mt-1.5 pt-1.5 border-t border-rose-200/60 text-left">
            <p class="font-bold text-slate-900 truncate text-[11px]">${escaparHTML(cama.pacienteNombre || 'Paciente')}</p>
            <p class="text-[10px] text-slate-600 font-mono">DNI: ${escaparHTML(cama.pacienteDni || '--')}</p>
            <p class="text-[10px] text-slate-500 truncate">Dr. ${escaparHTML(cama.medicoTratante || 'Sin asignar')}</p>
            <p class="text-[9px] text-rose-800 font-semibold mt-0.5">Ingreso: ${cama.fechaIngreso ? cama.fechaIngreso.split("T")[0] : '--'}</p>
        </div>
    ` : `
        <p class="text-[10px] text-slate-500 mt-1 italic">Disponible para internación</p>
    `;

    return `
        <div onclick="window.abrirDetalleCama('${cama.id}')"
            class="border rounded-xl p-2.5 transition cursor-pointer hover:scale-[1.02] active:scale-[0.98] ${colorBorde}">
            <div class="flex items-center justify-between">
                <span class="font-mono font-bold text-xs">${escaparHTML(cama.numeroCama)}</span>
                <span class="flex items-center gap-1 text-[10px] font-semibold">${badgeEstado} ${textoEstado}</span>
            </div>
            ${pacienteInfo}
        </div>
    `;
}

// =============================================================================
// 3. BÚSQUEDA DIRECTA DE PACIENTE INTERNADO
// =============================================================================

export function buscarPacienteInternado() {
    const input = document.getElementById("input-buscar-internado");
    const contenedorRes = document.getElementById("resultado-busqueda-internado");
    if (!input || !contenedorRes) return;

    const queryTexto = input.value.trim().toLowerCase();
    if (!queryTexto) {
        contenedorRes.classList.add("hidden");
        contenedorRes.innerHTML = "";
        return;
    }

    const coincidencias = camasCache.filter(c => {
        if (c.estado !== "ocupada") return false;
        const nombre = (c.pacienteNombre || "").toLowerCase();
        const dni = (c.pacienteDni || "").toLowerCase();
        return nombre.includes(queryTexto) || dni.includes(queryTexto);
    });

    if (coincidencias.length === 0) {
        contenedorRes.innerHTML = `
            <div class="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 text-center">
                No se encontró ningún paciente internado con el término <strong>"${escaparHTML(queryTexto)}"</strong>.
            </div>
        `;
        contenedorRes.classList.remove("hidden");
        return;
    }

    let html = '<div class="space-y-2">';
    coincidencias.forEach(c => {
        html += `
            <div class="p-3 bg-white border border-slate-200 rounded-xl shadow-2xs flex items-center justify-between gap-3">
                <div>
                    <h5 class="font-bold text-slate-900 text-xs sm:text-sm">${escaparHTML(c.pacienteNombre)}</h5>
                    <p class="text-xs text-slate-600 font-mono">DNI: ${escaparHTML(c.pacienteDni)} • Cobertura: ${escaparHTML(c.pacienteCobertura || 'Sin obra social')}</p>
                    <p class="text-[11px] text-slate-500 mt-0.5">Médico Tratante: <strong>Dr. ${escaparHTML(c.medicoTratante || 'No asignado')}</strong></p>
                </div>
                <div class="text-right shrink-0">
                    <span class="inline-block px-2.5 py-1 rounded-lg bg-[#002845] text-white font-bold text-xs">
                        Piso ${c.piso} • Hab ${escaparHTML(c.habitacion)} • ${escaparHTML(b.numeroCama)}
                    </span>
                    <div class="mt-1">
                        <button type="button" onclick="window.localizarCamaEnMapa('${c.id}', ${c.piso})"
                            class="text-[11px] text-sky-700 hover:text-sky-900 font-bold underline cursor-pointer">
                            Ver en Plano
                        </button>
                    </div>
                </div>
            </div>
        `;
    });
    html += '</div>';

    contenedorRes.innerHTML = html;
    contenedorRes.classList.remove("hidden");
}

export function localizarCamaEnMapa(camaId, piso) {
    seleccionarPisoInternacion(piso);
    const modalBusqueda = document.getElementById("resultado-busqueda-internado");
    if (modalBusqueda) modalBusqueda.classList.add("hidden");
    abrirDetalleCama(camaId);
}

// =============================================================================
// 4. GESTIÓN: INTERNACIÓN Y ALTA MÉDICA (ASIGNACIÓN / LIBERACIÓN)
// =============================================================================

export function abrirDetalleCama(camaId) {
    const cama = camasCache.find(c => c.id === camaId);
    if (!cama) return;

    camaSeleccionadaParaAccion = cama;

    const sesion = obtenerSesionActual();
    const puedeOperar = tienePermisoInternacion(sesion);

    if (cama.estado === "libre") {
        if (!puedeOperar) {
            mostrarAlerta("Cama Libre", `La cama ${cama.numeroCama} de la Hab. ${cama.habitacion} se encuentra disponible. La asignación e internación de pacientes corresponde a Recepción, Enfermería, Administración o personal con permiso de internación.`);
            return;
        }
        abrirModalInternar(cama);
    } else if (cama.estado === "ocupada") {
        abrirModalAlta(cama);
        const btnConfirmarAlta = document.getElementById("btn-confirmar-alta-paciente");
        const divCamposAlta = document.getElementById("div-campos-alta-paciente");
        if (!puedeOperar) {
            if (btnConfirmarAlta) btnConfirmarAlta.classList.add("hidden");
            if (divCamposAlta) divCamposAlta.classList.add("hidden");
        } else {
            if (btnConfirmarAlta) btnConfirmarAlta.classList.remove("hidden");
            if (divCamposAlta) divCamposAlta.classList.remove("hidden");
        }
    } else {
        mostrarAlerta("Cama en Mantenimiento", `La cama ${cama.numeroCama} de la Hab. ${cama.habitacion} se encuentra en desinfección o mantenimiento.`);
    }
}

export function abrirModalInternar(cama) {
    const titulo = document.getElementById("modal-internar-titulo");
    const sub = document.getElementById("modal-internar-subtitulo");
    const inputCamaId = document.getElementById("modal-internar-cama-id");

    if (titulo) titulo.textContent = `Internar Paciente en ${cama.numeroCama}`;
    if (sub) sub.textContent = `Piso ${cama.piso} • Habitación ${cama.habitacion} • Sector: ${cama.sector}`;
    if (inputCamaId) inputCamaId.value = cama.id;

    // Limpiar campos del formulario
    document.getElementById("internar-paciente-dni").value = "";
    document.getElementById("internar-paciente-nombre").value = "";
    document.getElementById("internar-paciente-cobertura").value = "Pública Exclusiva";
    document.getElementById("internar-medico-tratante").value = "";
    document.getElementById("internar-diagnostico").value = "";

    abrirModal("modal-internar-paciente");
}

export function abrirModalAlta(cama) {
    const elNombre = document.getElementById("alta-paciente-nombre");
    const elDni = document.getElementById("alta-paciente-dni");
    const elUbicacion = document.getElementById("alta-cama-ubicacion");
    const elIngreso = document.getElementById("alta-fecha-ingreso");
    const elMedico = document.getElementById("alta-medico-tratante");
    const inputCamaId = document.getElementById("modal-alta-cama-id");

    if (elNombre) elNombre.textContent = cama.pacienteNombre || "--";
    if (elDni) elDni.textContent = cama.pacienteDni || "--";
    if (elUbicacion) elUbicacion.textContent = `Piso ${cama.piso} • Habitación ${cama.habitacion} • ${cama.numeroCama} (${cama.sector})`;
    if (elIngreso) elIngreso.textContent = cama.fechaIngreso ? cama.fechaIngreso.replace("T", " ").substring(0, 16) : "--";
    if (elMedico) elMedico.textContent = cama.medicoTratante ? `Dr. ${cama.medicoTratante}` : "No especificado";
    if (inputCamaId) inputCamaId.value = cama.id;

    document.getElementById("alta-motivo-select").value = "Alta Médica";
    document.getElementById("alta-observaciones").value = "";

    abrirModal("modal-alta-paciente");
}

/**
 * Registra el ingreso del paciente a una cama libre de forma atómica
 */
export async function confirmarInternacionPaciente() {
    const camaId = document.getElementById("modal-internar-cama-id")?.value;
    const dni = document.getElementById("internar-paciente-dni")?.value.trim();
    const nombre = document.getElementById("internar-paciente-nombre")?.value.trim();
    const cobertura = document.getElementById("internar-paciente-cobertura")?.value;
    const medico = document.getElementById("internar-medico-tratante")?.value.trim();
    const diagnostico = document.getElementById("internar-diagnostico")?.value.trim();

    if (!camaId || !dni || !nombre || !medico) {
        mostrarAlerta("Campos Incompletos", "DNI, Nombre del Paciente y Médico Tratante son obligatorios.");
        return;
    }

    if (!/^[0-9]{6,10}$/.test(dni)) {
        mostrarAlerta("DNI Inválido", "El DNI debe tener entre 6 y 10 dígitos numéricos.");
        return;
    }

    const confirma = await pedirConfirmacion(
        "Confirmar Internación",
        `¿Desea asignar a ${nombre} (DNI ${dni}) en la cama seleccionada?`,
        "Sí, Asignar Cama"
    );
    if (!confirma) return;

    return await ejecutarUnaVez(`internar-${camaId}`, async () => {
        try {
            const sesion = obtenerSesionActual();
            const staffUid = sesion ? sesion.uid : "staff_anon";

            const camaRef = doc(db, "camas", camaId);
            const camaSnap = await getDoc(camaRef);

            if (!camaSnap.exists()) {
                mostrarAlerta("Error", "La cama seleccionada no existe.");
                return;
            }

            const camaData = camaSnap.data();
            if (camaData.estado === "ocupada") {
                mostrarAlerta("Cama No Disponible", "Esta cama acaba de ser ocupada por otro paciente. Elija otra.");
                await cargarCamasHospital();
                renderizarMapaCamas();
                cerrarModal("modal-internar-paciente");
                return;
            }

            const fechaIngresoISO = new Date().toISOString();

            // 1. Crear documento en historial_internaciones
            const historialRef = doc(collection(db, "historial_internaciones"));
            const batch = writeBatch(db);

            batch.set(historialRef, {
                camaId: camaId,
                piso: camaData.piso,
                habitacion: camaData.habitacion,
                numeroCama: camaData.numeroCama,
                sector: camaData.sector,
                pacienteNombre: nombre,
                pacienteDni: dni,
                pacienteCobertura: cobertura || "Pública Exclusiva",
                medicoTratante: medico,
                diagnosticoIngreso: diagnostico || "Ingreso hospitalario general",
                fechaIngreso: fechaIngresoISO,
                fechaAlta: null,
                altaPor: null,
                motivoAlta: null,
                observacionesAlta: null,
                estado: "activa",
                creadoEn: serverTimestamp(),
                actualizadoEn: serverTimestamp()
            });

            // 2. Actualizar cama a ocupada
            batch.update(camaRef, {
                estado: "ocupada",
                pacienteNombre: nombre,
                pacienteDni: dni,
                medicoTratante: medico,
                fechaIngreso: fechaIngresoISO,
                internacionId: historialRef.id,
                actualizadoEn: serverTimestamp()
            });

            await batch.commit();

            cerrarModal("modal-internar-paciente");
            mostrarExito("Paciente Internado", `Se asignó la cama correctamente a ${nombre}.`);
            await cargarCamasHospital();
            renderizarMapaCamas();
        } catch (err) {
            console.error("Error al internar paciente:", err);
            mostrarAlerta("Error de Internación", "No se pudo registrar la internación: " + (err.message || "Error de red"));
        }
    });
}

/**
 * Da de alta al paciente, liberando la cama y cerrando el registro histórico
 */
export async function confirmarAltaPaciente() {
    const camaId = document.getElementById("modal-alta-cama-id")?.value;
    const motivo = document.getElementById("alta-motivo-select")?.value;
    const observaciones = document.getElementById("alta-observaciones")?.value.trim();

    if (!camaId) return;

    const confirma = await pedirConfirmacion(
        "Confirmar Alta de Paciente",
        `¿Está seguro de otorgar el alta y liberar la cama? Se registrará la fecha y hora oficial de egreso.`,
        "Sí, Dar de Alta"
    );
    if (!confirma) return;

    return await ejecutarUnaVez(`alta-${camaId}`, async () => {
        try {
            const sesion = obtenerSesionActual();
            const staffUid = sesion ? sesion.uid : "staff_anon";

            const camaRef = doc(db, "camas", camaId);
            const camaSnap = await getDoc(camaRef);

            if (!camaSnap.exists()) {
                mostrarAlerta("Error", "Cama no encontrada.");
                return;
            }

            const camaData = camaSnap.data();
            const internacionId = camaData.internacionId;
            const fechaAltaISO = new Date().toISOString();

            const batch = writeBatch(db);

            // 1. Cerrar historial si existe la referencia
            if (internacionId) {
                const historialRef = doc(db, "historial_internaciones", internacionId);
                batch.update(historialRef, {
                    fechaAlta: fechaAltaISO,
                    altaPor: staffUid,
                    motivoAlta: motivo || "Alta Médica",
                    observacionesAlta: observaciones || "",
                    estado: "alta",
                    actualizadoEn: serverTimestamp()
                });
            }

            // 2. Liberar la cama
            batch.update(camaRef, {
                estado: "libre",
                pacienteNombre: null,
                pacienteDni: null,
                medicoTratante: null,
                fechaIngreso: null,
                internacionId: null,
                actualizadoEn: serverTimestamp()
            });

            await batch.commit();

            cerrarModal("modal-alta-paciente");
            mostrarExito("Cama Liberada", `El paciente ha sido dado de alta y la cama quedó en estado Libre.`);
            await cargarCamasHospital();
            renderizarMapaCamas();
        } catch (err) {
            console.error("Error al dar de alta al paciente:", err);
            mostrarAlerta("Error en Alta", "No se pudo completar el alta: " + (err.message || "Error"));
        }
    });
}

// =============================================================================
// 5. CONFIGURACIÓN DE ESTRUCTURA FÍSICA (ADMINISTRACIÓN)
// =============================================================================

export async function guardarNuevaCamaAdmin() {
    const piso = Number(document.getElementById("config-cama-piso")?.value || 1);
    const hab = document.getElementById("config-cama-hab")?.value.trim();
    const numeroCama = document.getElementById("config-cama-nombre")?.value.trim();
    const sector = document.getElementById("config-cama-sector")?.value;
    const tipo = document.getElementById("config-cama-tipo")?.value;

    if (!hab || !numeroCama || !sector) {
        mostrarAlerta("Campos Faltantes", "Ingrese número de habitación, identificador de cama y sector.");
        return;
    }

    const idGenerado = `P${piso}_H${hab.replace(/\s+/g, '')}_${numeroCama.replace(/\s+/g, '')}`;

    return await ejecutarUnaVez(`crear-cama-${idGenerado}`, async () => {
        try {
            const ref = doc(db, "camas", idGenerado);
            const snap = await getDoc(ref);

            if (snap.exists() && snap.data().activo) {
                mostrarAlerta("Cama Duplicada", `Ya existe una cama con ID ${idGenerado} en el sistema.`);
                return;
            }

            await setDoc(ref, {
                piso: piso,
                habitacion: hab,
                numeroCama: numeroCama,
                sector: sector,
                tipo: tipo || "Compartida",
                estado: "libre",
                activo: true,
                pacienteNombre: null,
                pacienteDni: null,
                medicoTratante: null,
                fechaIngreso: null,
                internacionId: null,
                creadoEn: serverTimestamp(),
                actualizadoEn: serverTimestamp()
            });

            mostrarToast(`Cama ${numeroCama} agregada a Hab. ${hab}.`);
            cerrarModal("modal-config-cama");
            await cargarCamasHospital();
            renderizarMapaCamas();
            renderizarTablaConfigCamasAdmin();
        } catch (err) {
            console.error("Error al crear cama:", err);
            mostrarAlerta("Error", "No se pudo registrar la nueva cama.");
        }
    });
}

export async function renderizarTablaConfigCamasAdmin() {
    const contenedor = document.getElementById("tabla-admin-camas-body");
    if (!contenedor) return;

    if (camasCache.length === 0) {
        contenedor.innerHTML = `
            <tr>
                <td colspan="7" class="p-6 text-center">
                    <p class="text-xs text-slate-500 mb-2.5">No hay camas cargadas en el hospital.</p>
                    <button type="button" onclick="window.sembrarEstructuraCamasInicial()"
                        class="px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 font-bold text-xs cursor-pointer transition">
                        Cargar estructura de ejemplo
                    </button>
                </td>
            </tr>
        `;
        return;
    }

    let html = "";
    camasCache.forEach(c => {
        html += `
            <tr class="border-b border-slate-100 hover:bg-slate-50/80 transition text-xs">
                <td class="p-3 font-bold text-slate-800">Piso ${c.piso}</td>
                <td class="p-3 font-medium">Hab. ${escaparHTML(c.habitacion)}</td>
                <td class="p-3 font-mono font-bold text-slate-900">${escaparHTML(c.numeroCama)}</td>
                <td class="p-3 text-slate-600">${escaparHTML(c.sector)}</td>
                <td class="p-3">
                    <span class="inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                        c.estado === 'libre' ? 'bg-emerald-100 text-emerald-800' :
                        c.estado === 'ocupada' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                    }">${c.estado.toUpperCase()}</span>
                </td>
                <td class="p-3 text-right">
                    ${c.estado === 'libre' ? `
                        <button type="button" onclick="window.eliminarCamaAdmin('${c.id}')"
                            class="text-rose-600 hover:text-rose-800 font-bold p-1 cursor-pointer" title="Desactivar cama">
                            Eliminar
                        </button>
                    ` : '<span class="text-[10px] text-slate-400">Ocupada</span>'}
                </td>
            </tr>
        `;
    });

    contenedor.innerHTML = html;
}

export async function eliminarCamaAdmin(camaId) {
    const cama = camasCache.find(c => c.id === camaId);
    if (!cama) return;

    if (cama.estado === "ocupada") {
        mostrarAlerta("No Permitido", "No es posible eliminar una cama ocupada. Primero dé de alta al paciente.");
        return;
    }

    const confirma = await pedirConfirmacion(
        "Eliminar Cama",
        `¿Desea dar de baja la cama ${cama.numeroCama} (Hab. ${cama.habitacion})? El historial anterior se preservará.`,
        "Sí, Eliminar"
    );
    if (!confirma) return;

    try {
        await updateDoc(doc(db, "camas", camaId), {
            activo: false,
            actualizadoEn: serverTimestamp()
        });
        mostrarToast("Cama dada de baja.");
        await cargarCamasHospital();
        renderizarMapaCamas();
        renderizarTablaConfigCamasAdmin();
    } catch (err) {
        console.error("Error al eliminar cama:", err);
        mostrarAlerta("Error", "No se pudo eliminar la cama.");
    }
}

/**
 * Siembra inicial para el caso de estudio del hospital Schestakow (demostración)
 */
export async function sembrarEstructuraCamasInicial() {
    const sesion = obtenerSesionActual();
    if (!sesion || !esRolAdministracion(sesion.rol)) {
        mostrarAlerta("Acceso Denegado", "Solo Administración puede sembrar la estructura de camas de demostración.");
        return;
    }

    const confirma = await pedirConfirmacion(
        "Cargar Estructura de Ejemplo",
        "¿Desea sembrar la estructura física de camas de demostración para el Hospital Schestakow (Pisos 1, 2 y 3: UTI, Clínica Médica, Cirugía, Traumatología, etc.)?",
        "Sí, Cargar Estructura Demo"
    );
    if (!confirma) return;

    const estructuraDemo = [
        // Piso 1: Terapia Intensiva (UTI) y Clínica Médica
        { piso: 1, hab: "101", cama: "Cama 1", sector: "Terapia Intensiva (UTI)", tipo: "Individual" },
        { piso: 1, hab: "102", cama: "Cama 1", sector: "Terapia Intensiva (UTI)", tipo: "Individual" },
        { piso: 1, hab: "103", cama: "Cama 1", sector: "Clínica Médica", tipo: "Compartida" },
        { piso: 1, hab: "103", cama: "Cama 2", sector: "Clínica Médica", tipo: "Compartida" },
        { piso: 1, hab: "104", cama: "Cama 1", sector: "Clínica Médica", tipo: "Compartida" },
        { piso: 1, hab: "104", cama: "Cama 2", sector: "Clínica Médica", tipo: "Compartida" },
        
        // Piso 2: Cirugía y Traumatología
        { piso: 2, hab: "201", cama: "Cama 1", sector: "Cirugía General", tipo: "Compartida" },
        { piso: 2, hab: "201", cama: "Cama 2", sector: "Cirugía General", tipo: "Compartida" },
        { piso: 2, hab: "202", cama: "Cama 1", sector: "Traumatología", tipo: "Compartida" },
        { piso: 2, hab: "202", cama: "Cama 2", sector: "Traumatología", tipo: "Compartida" },

        // Piso 3: Pediatría y Maternidad
        { piso: 3, hab: "301", cama: "Cama 1", sector: "Pediatría", tipo: "Compartida" },
        { piso: 3, hab: "301", cama: "Cama 2", sector: "Pediatría", tipo: "Compartida" },
        { piso: 3, hab: "302", cama: "Cama 1", sector: "Maternidad", tipo: "Individual" }
    ];

    try {
        const batch = writeBatch(db);
        estructuraDemo.forEach(c => {
            const id = `P${c.piso}_H${c.hab}_${c.cama.replace(/\s+/g, '')}`;
            const ref = doc(db, "camas", id);
            batch.set(ref, {
                piso: c.piso,
                habitacion: c.hab,
                numeroCama: c.cama,
                sector: c.sector,
                tipo: c.tipo,
                estado: "libre",
                activo: true,
                pacienteNombre: null,
                pacienteDni: null,
                medicoTratante: null,
                fechaIngreso: null,
                internacionId: null,
                creadoEn: serverTimestamp(),
                actualizadoEn: serverTimestamp()
            });
        });

        await batch.commit();
        mostrarToast("Estructura de camas inicial sembrada con éxito.");
        await cargarCamasHospital();
        renderizarMapaCamas();
        renderizarTablaConfigCamasAdmin();
    } catch (e) {
        console.warn("Aviso al sembrar camas iniciales:", e);
    }
}

// =============================================================================
// EXPOSICIÓN GLOBAL EN WINDOW
// =============================================================================
window.seleccionarPisoInternacion = seleccionarPisoInternacion;
window.filtrarSectorInternacion = filtrarSectorInternacion;
window.filtrarEstadoInternacion = filtrarEstadoInternacion;
window.buscarPacienteInternado = buscarPacienteInternado;
window.localizarCamaEnMapa = localizarCamaEnMapa;
window.abrirDetalleCama = abrirDetalleCama;
window.confirmarInternacionPaciente = confirmarInternacionPaciente;
window.confirmarAltaPaciente = confirmarAltaPaciente;
window.guardarNuevaCamaAdmin = guardarNuevaCamaAdmin;
window.eliminarCamaAdmin = eliminarCamaAdmin;
window.renderizarTablaConfigCamasAdmin = renderizarTablaConfigCamasAdmin;
window.sembrarEstructuraCamasInicial = sembrarEstructuraCamasInicial;
