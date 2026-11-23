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

        renderizarPisosSelector();
        renderizarMapaCamas();

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
            <div class="bg-white border border-slate-200/90 rounded-2xl p-3.5 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between relative overflow-hidden group">
                <div>
                    <!-- Cabecera de Habitación (Bahía arquitectónica) -->
                    <div class="flex items-center justify-between pb-2.5 mb-3 border-b border-slate-100">
                        <div class="flex items-center gap-2 min-w-0">
                            <div class="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 font-mono font-bold text-xs flex items-center justify-center border border-slate-200 shrink-0">
                                H${escaparHTML(hab.numero)}
                            </div>
                            <div class="min-w-0">
                                <h4 class="font-bold text-slate-900 text-xs sm:text-sm truncate leading-tight">Habitación ${escaparHTML(hab.numero)}</h4>
                                <p class="text-[10px] text-slate-500 font-medium truncate">${escaparHTML(hab.sector)}</p>
                            </div>
                        </div>
                        <span class="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-200/80 shrink-0">
                            <svg class="w-3 h-3 text-slate-400" width="12" height="12" style="width: 12px; height: 12px; display: inline-block;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path></svg>
                            ${hab.camas.length} ${hab.camas.length === 1 ? 'cama' : 'camas'}
                        </span>
                    </div>

                    <!-- Distribución tipo Selector de Asientos / Camas -->
                    <div class="grid grid-cols-2 gap-2.5">
                        ${hab.camas.map(cama => renderizarTarjetaCamaIndividual(cama)).join("")}
                    </div>
                </div>

                <!-- Pie de bahía con tipo de habitación -->
                <div class="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400 font-medium">
                    <span>${escaparHTML(hab.tipo)}</span>
                    <span class="font-mono">Piso ${pisoSeleccionado}</span>
                </div>
            </div>
        `;
    });

    contenedor.innerHTML = html;
}

function renderizarTarjetaCamaIndividual(cama) {
    const esLibre = cama.estado === "libre";
    const esOcupada = cama.estado === "ocupada";
    const esMantenimiento = cama.estado === "mantenimiento";

    // Accesibilidad para Daltonismo: Cada estado combina Color + Icono de Forma Exclusiva + Texto Explícito
    let configEstado = {
        clasesContenedor: "border-emerald-300 bg-emerald-50/70 text-emerald-950 hover:bg-emerald-100/90 hover:border-emerald-500 shadow-2xs hover:shadow-md ring-1 ring-emerald-200/50 cursor-pointer",
        iconoForma: `
            <span class="w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-2xs" style="width: 16px; height: 16px; min-width: 16px; min-height: 16px; display: inline-flex;" title="Estado: Disponible">
                <svg class="w-2.5 h-2.5" width="10" height="10" style="width: 10px; height: 10px; display: block;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"></path>
                </svg>
            </span>
        `,
        textoEstado: "LIBRE",
        badgeColor: "text-emerald-800",
        tooltip: `Cama ${cama.numeroCama} disponible. Clic para internar paciente nuevo.`
    };

    if (esOcupada) {
        configEstado = {
            clasesContenedor: "border-rose-300 bg-rose-50/80 text-rose-950 hover:border-rose-400 hover:bg-rose-100/70 shadow-2xs cursor-pointer ring-1 ring-rose-200/50",
            iconoForma: `
                <span class="w-4 h-4 rounded-full bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-2xs" style="width: 16px; height: 16px; min-width: 16px; min-height: 16px; display: inline-flex;" title="Estado: Cama Ocupada">
                    <svg class="w-2.5 h-2.5" width="10" height="10" style="width: 10px; height: 10px; display: block;" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"></path>
                    </svg>
                </span>
            `,
            textoEstado: "OCUPADA",
            badgeColor: "text-rose-800",
            tooltip: `Cama ocupada por ${cama.pacienteNombre || 'Paciente'} (DNI: ${cama.pacienteDni || '--'}). Clic para ver evolución o dar de alta.`
        };
    } else if (esMantenimiento) {
        configEstado = {
            clasesContenedor: "border-amber-300 bg-amber-50/75 text-amber-950 hover:border-amber-400 shadow-2xs ring-1 ring-amber-200/50 cursor-not-allowed opacity-90",
            iconoForma: `
                <span class="w-4 h-4 rounded-md bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-2xs" style="width: 16px; height: 16px; min-width: 16px; min-height: 16px; display: inline-flex;" title="Estado: Mantenimiento / Higiene">
                    <svg class="w-2.5 h-2.5" width="10" height="10" style="width: 10px; height: 10px; display: block;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
                    </svg>
                </span>
            `,
            textoEstado: "MANTENIMIENTO",
            badgeColor: "text-amber-800",
            tooltip: `Cama ${cama.numeroCama} en desinfección o reparación técnica.`
        };
    }

    // Cuerpo de información del asiento clínico
    let cuerpoAsiento = "";
    if (esLibre) {
        cuerpoAsiento = `
            <div class="mt-2 text-center">
                <span class="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] tracking-wide transition shadow-2xs w-full justify-center">
                    <svg class="w-3 h-3" width="12" height="12" style="width: 12px; height: 12px; display: inline-block;" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"></path></svg>
                    <span>+ Asignar</span>
                </span>
            </div>
        `;
    } else if (esOcupada) {
        cuerpoAsiento = `
            <div class="mt-1.5 pt-1.5 border-t border-rose-200/60 text-left leading-tight">
                <p class="font-bold text-slate-900 truncate text-[11px]">${escaparHTML(cama.pacienteNombre || 'Paciente')}</p>
                <p class="text-[10px] text-slate-600 font-mono">DNI: ${escaparHTML(cama.pacienteDni || '--')}</p>
                <p class="text-[9px] text-slate-500 truncate mt-0.5">Dr. ${escaparHTML(cama.medicoTratante || 'Sin asignar')}</p>
            </div>
        `;
    } else {
        cuerpoAsiento = `
            <div class="mt-1.5 pt-1.5 border-t border-amber-200/60 text-center">
                <p class="text-[9px] font-semibold text-amber-800 uppercase tracking-wide">En Desinfección</p>
                <p class="text-[9px] text-slate-500 italic mt-0.5">No disponible</p>
            </div>
        `;
    }

    return `
        <div onclick="window.abrirDetalleCama('${cama.id}')"
            title="${escaparHTML(configEstado.tooltip)}"
            role="button"
            tabindex="0"
            aria-label="Cama ${escaparHTML(cama.numeroCama)}, Habitación ${escaparHTML(cama.habitacion)}, ${configEstado.textoEstado}"
            class="border rounded-xl p-2.5 transition-all select-none hover:scale-[1.02] active:scale-[0.98] ${configEstado.clasesContenedor} flex flex-col justify-between min-h-[92px]">
            
            <!-- Barra superior del asiento: Cabezal simbólico + Identificador + Icono accesible de forma -->
            <div>
                <!-- Cabezal físico del asiento hospitalario -->
                <div class="w-7 h-1 rounded-full mx-auto mb-1.5 opacity-30 bg-current"></div>
                <div class="flex items-center justify-between gap-1">
                    <span class="font-mono font-bold text-xs text-slate-900 tracking-tight">${escaparHTML(cama.numeroCama)}</span>
                    <div class="flex items-center gap-1">
                        ${configEstado.iconoForma}
                        <span class="text-[9px] font-black tracking-wider ${configEstado.badgeColor}">${configEstado.textoEstado}</span>
                    </div>
                </div>
            </div>

            <!-- Datos clínicos o botón de acción directa -->
            ${cuerpoAsiento}
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

export async function abrirModalConfigCamasAdmin() {
    await renderizarTablaConfigCamasAdmin();
    actualizarPreviewCamasMasivas();
    abrirModal("modal-config-cama");
}

export function cambiarTabConfigCamas(tab) {
    const tabIndiv = document.getElementById("tab-cama-individual-btn");
    const tabMasiv = document.getElementById("tab-cama-masiva-btn");
    const panelIndiv = document.getElementById("panel-cama-individual");
    const panelMasiv = document.getElementById("panel-cama-masiva");

    if (tab === "masiva") {
        tabIndiv?.classList.remove("border-indigo-600", "text-indigo-600");
        tabIndiv?.classList.add("border-transparent", "text-slate-500");
        tabMasiv?.classList.remove("border-transparent", "text-slate-500");
        tabMasiv?.classList.add("border-indigo-600", "text-indigo-600");

        panelIndiv?.classList.add("hidden");
        panelMasiv?.classList.remove("hidden");
        actualizarPreviewCamasMasivas();
    } else {
        tabMasiv?.classList.remove("border-indigo-600", "text-indigo-600");
        tabMasiv?.classList.add("border-transparent", "text-slate-500");
        tabIndiv?.classList.remove("border-transparent", "text-slate-500");
        tabIndiv?.classList.add("border-indigo-600", "text-indigo-600");

        panelMasiv?.classList.add("hidden");
        panelIndiv?.classList.remove("hidden");
    }
}

export function actualizarPreviewCamasMasivas() {
    const previewEl = document.getElementById("bulk-cama-preview");
    if (!previewEl) return;

    const pisoEl = document.getElementById("bulk-cama-piso");
    const habsEl = document.getElementById("bulk-cama-habs");
    const camasPorHabEl = document.getElementById("bulk-cama-por-hab");
    const habInicioEl = document.getElementById("bulk-cama-hab-inicio");
    const sectorEl = document.getElementById("bulk-cama-sector");
    const tipoEl = document.getElementById("bulk-cama-tipo");
    const btnEjecutar = document.getElementById("btn-ejecutar-bulk-camas");

    const piso = Math.max(1, parseInt(pisoEl?.value, 10) || 1);
    const cantHabs = Math.max(0, parseInt(habsEl?.value, 10) || 0);
    const camasPorHab = Math.max(0, parseInt(camasPorHabEl?.value, 10) || 0);
    const customInicio = habInicioEl?.value?.trim();
    const habInicio = customInicio ? parseInt(customInicio, 10) : (piso * 100 + 1);
    const sector = sectorEl?.value || "Clínica Médica";
    const tipo = tipoEl?.value || (camasPorHab === 1 ? "Individual" : "Compartida");

    // Sincronizar placeholder de hab-inicio
    if (habInicioEl && !customInicio) {
        habInicioEl.placeholder = `Ej: ${piso * 100 + 1}`;
    }

    if (cantHabs <= 0 || camasPorHab <= 0) {
        previewEl.innerHTML = `
            <div class="text-center py-3 text-slate-400">
                <p class="font-medium text-xs">Configure cantidad de habitaciones y camas por habitación para calcular la estructura.</p>
            </div>
        `;
        if (btnEjecutar) {
            btnEjecutar.disabled = true;
            btnEjecutar.classList.add("opacity-50", "cursor-not-allowed");
        }
        return;
    }

    const habitaciones = [];
    let camasNuevasCount = 0;
    let camasDuplicadasCount = 0;
    const listaNumerosHab = [];

    for (let i = 0; i < cantHabs; i++) {
        const numHab = String(habInicio + i);
        listaNumerosHab.push(numHab);
        let nuevasEnHab = 0;
        let duplicadasEnHab = 0;

        for (let c = 1; c <= camasPorHab; c++) {
            const nomCama = `Cama ${c}`;
            const idCama = `P${piso}_H${numHab}_Cama${c}`;
            const yaExiste = camasCache.some(item => item.activo && (
                item.id === idCama ||
                (item.piso === piso && String(item.habitacion) === numHab && String(item.numeroCama).toLowerCase() === nomCama.toLowerCase())
            ));

            if (yaExiste) {
                duplicadasEnHab++;
                camasDuplicadasCount++;
            } else {
                nuevasEnHab++;
                camasNuevasCount++;
            }
        }

        habitaciones.push({
            numero: numHab,
            nuevas: nuevasEnHab,
            duplicadas: duplicadasEnHab,
            total: camasPorHab
        });
    }

    const stringHabitaciones = listaNumerosHab.join(", ");

    let badgesHtml = "";
    habitaciones.forEach(h => {
        let estadoClase = "bg-emerald-50 text-emerald-800 border-emerald-200";
        let icono = `<svg class="w-3 h-3 text-emerald-600 inline shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>`;
        let detalle = `${h.nuevas} nuevas`;

        if (h.nuevas === 0) {
            estadoClase = "bg-slate-100 text-slate-500 border-slate-200";
            icono = `<svg class="w-3 h-3 text-slate-400 inline shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>`;
            detalle = "ya existe";
        } else if (h.duplicadas > 0) {
            estadoClase = "bg-amber-50 text-amber-800 border-amber-200";
            icono = `<svg class="w-3 h-3 text-amber-600 inline shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>`;
            detalle = `${h.nuevas} nuevas, ${h.duplicadas} exist.`;
        }

        badgesHtml += `
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] font-mono ${estadoClase}" title="Habitación ${h.numero}: ${detalle}">
                ${icono}
                <strong class="font-bold">Hab. ${h.numero}</strong>
                <span class="text-[9.5px] opacity-80">(${detalle})</span>
            </span>
        `;
    });

    previewEl.innerHTML = `
        <div class="space-y-2.5">
            <div class="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-indigo-100 text-xs">
                <div class="flex items-center gap-2">
                    <span class="px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 font-bold text-[11px]">Piso ${piso}</span>
                    <span class="text-slate-600">Sector: <strong class="text-slate-800">${escaparHTML(sector)}</strong></span>
                    <span class="text-slate-400">|</span>
                    <span class="text-slate-600">Tipo: <strong class="text-slate-800">${escaparHTML(tipo)}</strong></span>
                </div>
                <div class="flex items-center gap-3 font-semibold text-xs">
                    <span class="text-slate-600"><span class="font-bold text-indigo-600">${cantHabs}</span> habitaciones</span>
                    <span class="text-emerald-700"><span class="font-bold text-emerald-800">${camasNuevasCount}</span> camas a crear</span>
                    ${camasDuplicadasCount > 0 ? `<span class="text-amber-700 font-bold">(${camasDuplicadasCount} omitidas por existir)</span>` : ''}
                </div>
            </div>

            <!-- Listado Explícito de Habitaciones Requerido -->
            <div>
                <div class="flex items-center justify-between mb-1.5">
                    <span class="text-[11px] font-bold text-slate-700 uppercase tracking-wide">
                        Habitaciones a generar (${cantHabs}):
                    </span>
                    <span class="text-[10px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                        ${escaparHTML(stringHabitaciones)}
                    </span>
                </div>
                <div class="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-1.5 bg-slate-50/70 rounded border border-slate-100">
                    ${badgesHtml}
                </div>
            </div>

            ${camasDuplicadasCount > 0 ? `
                <div class="bg-amber-50 border border-amber-200 text-amber-800 px-3 py-1.5 rounded-lg text-[11px] flex items-center gap-2">
                    <svg class="w-4 h-4 shrink-0 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                    <span><strong>Atención:</strong> Se detectaron ${camasDuplicadasCount} camas que ya existen en el Piso ${piso}. Serán omitidas automáticamente del batch para no sobrescribir datos ni desvincular pacientes.</span>
                </div>
            ` : ''}

            ${camasNuevasCount === 0 ? `
                <div class="bg-slate-100 border border-slate-200 text-slate-600 px-3 py-1.5 rounded-lg text-[11px]">
                    Todas las camas para este rango de habitaciones ya están dadas de alta. No hay nuevas camas que generar.
                </div>
            ` : ''}
        </div>
    `;

    if (btnEjecutar) {
        btnEjecutar.disabled = (camasNuevasCount === 0);
        if (camasNuevasCount === 0) {
            btnEjecutar.classList.add("opacity-50", "cursor-not-allowed");
            btnEjecutar.title = "Todas las camas ya existen en el sistema";
        } else {
            btnEjecutar.classList.remove("opacity-50", "cursor-not-allowed");
            btnEjecutar.title = `Generar ${camasNuevasCount} camas en Piso ${piso}`;
        }
    }
}

export async function ejecutarCargaMasivaCamasAdmin() {
    const sesion = obtenerSesionActual();
    if (!sesion || !esRolAdministracion(sesion.rol)) {
        mostrarAlerta("Acceso Denegado", "Solo Administración puede configurar la estructura de camas.");
        return;
    }

    const piso = Number(document.getElementById("bulk-cama-piso")?.value || 1);
    const cantHabs = Number(document.getElementById("bulk-cama-habs")?.value || 0);
    const camasPorHab = Number(document.getElementById("bulk-cama-por-hab")?.value || 0);
    const customInicio = document.getElementById("bulk-cama-hab-inicio")?.value?.trim();
    const habInicio = customInicio ? Number(customInicio) : (piso * 100 + 1);
    const sector = document.getElementById("bulk-cama-sector")?.value;
    const tipo = document.getElementById("bulk-cama-tipo")?.value || (camasPorHab === 1 ? "Individual" : "Compartida");

    if (piso < 1 || cantHabs < 1 || camasPorHab < 1 || !sector) {
        mostrarAlerta("Campos Incompletos", "Por favor indique un piso válido (>= 1), cantidad de habitaciones (>= 1), camas por habitación (>= 1) y sector.");
        return;
    }

    const camasAGenerar = [];
    const duplicadosOmitidos = [];
    const listaHabitaciones = [];

    for (let i = 0; i < cantHabs; i++) {
        const numHab = (habInicio + i).toString();
        listaHabitaciones.push(numHab);
        for (let b = 1; b <= camasPorHab; b++) {
            const nomCama = `Cama ${b}`;
            const idCama = `P${piso}_H${numHab}_Cama${b}`;
            
            const yaExiste = camasCache.some(c => c.activo && (
                c.id === idCama ||
                (c.piso === piso && String(c.habitacion) === numHab && String(c.numeroCama).toLowerCase() === nomCama.toLowerCase())
            ));

            if (yaExiste) {
                duplicadosOmitidos.push({ piso, habitacion: numHab, numeroCama: nomCama });
            } else {
                camasAGenerar.push({
                    id: idCama,
                    piso: piso,
                    habitacion: numHab,
                    numeroCama: nomCama,
                    sector: sector,
                    tipo: tipo
                });
            }
        }
    }

    if (camasAGenerar.length === 0) {
        mostrarAlerta("Sin Camas Nuevas", `Todas las ${duplicadosOmitidos.length} camas calculadas para el Piso ${piso} (Habitaciones: ${listaHabitaciones.join(', ')}) ya existen en el sistema. No se generaron duplicados.`);
        return;
    }

    const resumenHab = listaHabitaciones.length <= 10 
        ? listaHabitaciones.join(", ") 
        : `${listaHabitaciones.slice(0, 8).join(", ")} ... y ${listaHabitaciones.length - 8} más`;

    const textoConfirmacion = `¿Confirma la creación masiva de ${camasAGenerar.length} camas en el Piso ${piso}?\n\n` +
        `• Habitaciones (${listaHabitaciones.length}): ${resumenHab}\n` +
        `• Camas por habitación: ${camasPorHab}\n` +
        `• Sector: ${sector} | Tipo: ${tipo}\n` +
        (duplicadosOmitidos.length > 0 ? `• Omitidas por existir previamente: ${duplicadosOmitidos.length} camas\n` : "");

    const confirma = await pedirConfirmacion(
        "Confirmar Estructura Masiva",
        textoConfirmacion,
        `Sí, Generar ${camasAGenerar.length} Camas`
    );
    if (!confirma) return;

    return await ejecutarUnaVez(`bulk-camas-piso-${piso}`, async () => {
        try {
            const CHUNK_SIZE = 400;
            for (let i = 0; i < camasAGenerar.length; i += CHUNK_SIZE) {
                const chunk = camasAGenerar.slice(i, i + CHUNK_SIZE);
                const batch = writeBatch(db);
                chunk.forEach(c => {
                    const ref = doc(db, "camas", c.id);
                    batch.set(ref, {
                        piso: c.piso,
                        habitacion: c.habitacion,
                        numeroCama: c.numeroCama,
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
            }

            mostrarToast(`Se generaron exitosamente ${camasAGenerar.length} camas en Piso ${piso}.` + 
                (duplicadosOmitidos.length > 0 ? ` (${duplicadosOmitidos.length} duplicados omitidos)` : ""));
            
            await cargarCamasHospital();
            seleccionarPisoInternacion(piso);
            renderizarMapaCamas();
            renderizarTablaConfigCamasAdmin();
            actualizarPreviewCamasMasivas();
        } catch (err) {
            console.error("Error en carga masiva de camas:", err);
            mostrarAlerta("Error", "No se pudo completar la carga masiva de camas: " + (err.message || "Error de red"));
        }
    });
}

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
    actualizarPreviewCamasMasivas();
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
window.inicializarModuloInternacion = inicializarModuloInternacion;
window.cargarCamasHospital = cargarCamasHospital;
window.renderizarMapaCamas = renderizarMapaCamas;
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
window.abrirModalConfigCamasAdmin = abrirModalConfigCamasAdmin;
window.cambiarTabConfigCamas = cambiarTabConfigCamas;
window.actualizarPreviewCamasMasivas = actualizarPreviewCamasMasivas;
window.ejecutarCargaMasivaCamasAdmin = ejecutarCargaMasivaCamasAdmin;
