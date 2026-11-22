// ==========================================
// MÓDULO DISPONIBILIDAD DE QUIRÓFANOS
// js/quirofanos.js
// ==========================================

import {
    db,
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    addDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    serverTimestamp,
    functionsInstancia,
    httpsCallable
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
    esRolRecepcion,
    esRolMedico,
    esRolEnfermeria
} from "./auth.js";
import { ejecutarUnaVez } from "./guardia.js";

// Estado interno del módulo de quirófanos
let quirofanosCache = [];
let reservasCache = [];
let fechaSeleccionadaQuirofano = obtenerFechaHoyISO();
let filtroQuirofanoSeleccionado = "TODOS";
let filtroCirujanoSeleccionado = "TODOS";
let filtroEstadoSeleccionado = "TODOS";
let reservaSeleccionadaParaDetalle = null;

// =============================================================================
// 1. HELPERS MATEMÁTICOS Y VALIDACIÓN TEMPORAL (ANTI-COLISIÓN)
// =============================================================================

/**
 * Obtiene la fecha actual en huso horario local en formato YYYY-MM-DD
 */
export function obtenerFechaHoyISO() {
    const d = new Date();
    const anio = d.getFullYear();
    const mes = String(d.getMonth() + 1).padStart(2, '0');
    const dia = String(d.getDate()).padStart(2, '0');
    return `${anio}-${mes}-${dia}`;
}

/**
 * Convierte un string de hora en formato HH:mm a minutos desde las 00:00
 * @param {string} horaStr - Ej: "08:30"
 * @returns {number} Minutos (ej: 510)
 */
export function convertirHoraAMinutos(horaStr) {
    if (!horaStr || typeof horaStr !== "string" || !horaStr.includes(":")) return 0;
    const [h, m] = horaStr.split(":").map(Number);
    return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

/**
 * Convierte minutos desde las 00:00 a string HH:mm
 * @param {number} minutosTotales
 * @returns {string} Ej: "10:15"
 */
export function convertirMinutosAHora(minutosTotales) {
    const m = Math.max(0, Math.floor(minutosTotales));
    const h = Math.floor(m / 60) % 24;
    const min = m % 60;
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/**
 * Calcula la hora de finalización a partir de la hora de inicio y la duración en minutos
 * @param {string} horaInicio - Ej: "08:00"
 * @param {number|string} duracionMinutos - Ej: 90
 * @returns {string} Ej: "09:30"
 */
export function calcularHoraFin(horaInicio, duracionMinutos) {
    const minInicio = convertirHoraAMinutos(horaInicio);
    const dur = Math.max(15, parseInt(duracionMinutos, 10) || 60);
    return convertirMinutosAHora(minInicio + dur);
}

/**
 * Determina estrictamente si dos intervalos de horario se superponen
 * Condición: Dos cirugías se solapan si y solo si: !(Fin1 <= Inicio2 || Inicio1 >= Fin2)
 * Se permiten cirugías consecutivas/adyacentes (Fin1 == Inicio2).
 *
 * @param {string} hInicio1 
 * @param {string} hFin1 
 * @param {string} hInicio2 
 * @param {string} hFin2 
 * @returns {boolean} True si hay colisión, False si están libres
 */
export function haySuperposicion(hInicio1, hFin1, hInicio2, hFin2) {
    const ini1 = convertirHoraAMinutos(hInicio1);
    const fin1 = convertirHoraAMinutos(hFin1);
    const ini2 = convertirHoraAMinutos(hInicio2);
    const fin2 = convertirHoraAMinutos(hFin2);

    return !(fin1 <= ini2 || ini1 >= fin2);
}

/**
 * Formatea una fecha YYYY-MM-DD a formato argentino legible
 */
export function formatearFechaArgentina(fechaISO) {
    if (!fechaISO) return "--/--/----";
    const partes = fechaISO.split("-");
    if (partes.length !== 3) return fechaISO;
    return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

// =============================================================================
// 2. CARGA Y CONSULTA DE DATOS (FIRESTORE)
// =============================================================================

/**
 * Inicializa el módulo de quirófanos al entrar a la vista
 */
export async function inicializarModuloQuirofanos() {
    await cargarQuirofanosHospital();
    await cargarReservasPorFecha(fechaSeleccionadaQuirofano);
    renderizarControlesQuirofanos();
    renderizarGrillaQuirofanos();
}

/**
 * Carga el catálogo de quirófanos físicos activos
 */
export async function cargarQuirofanosHospital() {
    try {
        const q = query(collection(db, "quirofanos"), where("activo", "==", true));
        const snap = await getDocs(q);
        quirofanosCache = [];

        snap.forEach(docSnap => {
            quirofanosCache.push({ id: docSnap.id, ...docSnap.data() });
        });

        // Nota: Si la base no tiene quirófanos configurados, se retorna array vacío para mostrar
        // el estado correspondiente en UI. No se auto-siembran datos de prueba sin confirmación.

        quirofanosCache.sort((a, b) => (a.orden || 0) - (b.orden || 0) || a.nombre.localeCompare(b.nombre));
        return quirofanosCache;
    } catch (err) {
        console.error("Error al cargar quirófanos del hospital:", err);
        mostrarAlerta("Error de Quirófanos", "No se pudo recuperar la lista de quirófanos. Verifique la conexión.");
        return [];
    }
}

/**
 * Carga las reservas de quirófano para una fecha dada
 * @param {string} fechaISO - Formato YYYY-MM-DD
 */
export async function cargarReservasPorFecha(fechaISO) {
    try {
        fechaSeleccionadaQuirofano = fechaISO || obtenerFechaHoyISO();
        const q = query(
            collection(db, "reservas_quirofano"),
            where("fecha", "==", fechaSeleccionadaQuirofano)
        );
        const snap = await getDocs(q);
        reservasCache = [];

        snap.forEach(docSnap => {
            reservasCache.push({ id: docSnap.id, ...docSnap.data() });
        });

        reservasCache.sort((a, b) => {
            return convertirHoraAMinutos(a.horaInicio) - convertirHoraAMinutos(b.horaInicio);
        });

        return reservasCache;
    } catch (err) {
        console.error("Error al cargar reservas de quirófano:", err);
        mostrarAlerta("Error al cargar reservas", "No se pudieron obtener las cirugías de la fecha.");
        return [];
    }
}

/**
 * Valida si un intervalo de horario colisiona con alguna reserva existente activa
 * @param {string} quirofanoId
 * @param {string} fecha
 * @param {string} horaInicio
 * @param {string} horaFin
 * @param {string|null} reservaIdIgnorar - Para ediciones de una reserva existente
 * @returns {object} { tieneConflicto: boolean, reservaConflicto: object|null }
 */
export function validarConflictoHorario(quirofanoId, fecha, horaInicio, horaFin, reservaIdIgnorar = null) {
    const reservasEnMismoQuirofano = reservasCache.filter(r => {
        if (r.quirofanoId !== quirofanoId) return false;
        if (r.fecha !== fecha) return false;
        if (r.id === reservaIdIgnorar) return false;
        if (r.estado === "cancelado") return false; // Las canceladas no bloquean el espacio
        return true;
    });

    for (const r of reservasEnMismoQuirofano) {
        if (haySuperposicion(horaInicio, horaFin, r.horaInicio, r.horaFin)) {
            return {
                tieneConflicto: true,
                reservaConflicto: r
            };
        }
    }

    return { tieneConflicto: false, reservaConflicto: null };
}

// =============================================================================
// 3. RENDERIZADO VISUAL: CONTROLES, GRILLA Y TIMELINE
// =============================================================================

/**
 * Renderiza los selectores superiores (fecha, quirófano, cirujano, estado y botones de acción)
 */
export function renderizarControlesQuirofanos() {
    const inputFecha = document.getElementById("quirofano-filtro-fecha");
    if (inputFecha) {
        inputFecha.value = fechaSeleccionadaQuirofano;
    }

    // Selector de Quirófanos
    const selectQ = document.getElementById("quirofano-filtro-sala");
    if (selectQ) {
        let htmlQ = '<option value="TODOS">Todos los Quirófanos</option>';
        quirofanosCache.forEach(q => {
            const selected = q.id === filtroQuirofanoSeleccionado ? "selected" : "";
            htmlQ += `<option value="${escaparHTML(q.id)}" ${selected}>${escaparHTML(q.nombre)}</option>`;
        });
        selectQ.innerHTML = htmlQ;
    }

    // Selector de Cirujanos presentes en el día
    const selectCirujano = document.getElementById("quirofano-filtro-cirujano");
    if (selectCirujano) {
        const cirujanosUnicos = [...new Set(reservasCache.map(r => r.cirujanoNombre).filter(Boolean))].sort();
        let htmlC = '<option value="TODOS">Todos los Cirujanos</option>';
        cirujanosUnicos.forEach(c => {
            const selected = c === filtroCirujanoSeleccionado ? "selected" : "";
            htmlC += `<option value="${escaparHTML(c)}" ${selected}>${escaparHTML(c)}</option>`;
        });
        selectCirujano.innerHTML = htmlC;
    }

    // Selector de Estado
    const selectEstado = document.getElementById("quirofano-filtro-estado");
    if (selectEstado) {
        selectEstado.value = filtroEstadoSeleccionado;
    }

    // Permisos de botones según el rol
    const sesion = obtenerSesionActual();
    const rol = sesion ? sesion.rol : null;
    const permisos = Array.isArray(sesion?.permisosAdicionales) ? sesion.permisosAdicionales : [];
    const btnNuevaReserva = document.getElementById("btn-quirofano-nueva-reserva");
    const btnConfigQuirofano = document.getElementById("btn-quirofano-config-admin");

    const esAdmin = esRolAdministracion(rol);
    const esRecepcion = esRolRecepcion(rol);
    const esMedico = esRolMedico(rol);
    const esEnfermeria = esRolEnfermeria(rol);
    const tieneCoord = (esMedico || esEnfermeria) && permisos.includes("coordinaQuirofano");
    const tieneAnestesia = esMedico && permisos.includes("anestesia");

    if (btnNuevaReserva) {
        const puedeAgendar = esMedico || esRecepcion || esAdmin || tieneCoord || tieneAnestesia;
        if (puedeAgendar) {
            btnNuevaReserva.classList.remove("hidden");
            if (esMedico && !tieneCoord && !tieneAnestesia) {
                btnNuevaReserva.innerHTML = `
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
                    <span>Solicitar Quirófano</span>
                `;
            } else {
                btnNuevaReserva.innerHTML = `
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
                    <span>Agendar Cirugía</span>
                `;
            }
        } else {
            btnNuevaReserva.classList.add("hidden");
        }
    }

    if (btnConfigQuirofano) {
        if (esAdmin) {
            btnConfigQuirofano.classList.remove("hidden");
        } else {
            btnConfigQuirofano.classList.add("hidden");
        }
    }
}

/**
 * Renderiza la grilla cronológica de quirófanos
 */
export function renderizarGrillaQuirofanos() {
    const contenedor = document.getElementById("quirofano-grilla-salas");
    const resumenContainer = document.getElementById("quirofano-resumen-metricas");
    if (!contenedor) return;

    // Filtrar quirófanos a mostrar
    let quirofanosAMostrar = quirofanosCache;
    if (filtroQuirofanoSeleccionado !== "TODOS") {
        quirofanosAMostrar = quirofanosCache.filter(q => q.id === filtroQuirofanoSeleccionado);
    }

    // Métricas del día
    const activasHoy = reservasCache.filter(r => r.estado !== "cancelado");
    const confirmadas = activasHoy.filter(r => r.estado === "confirmado").length;
    const enCurso = activasHoy.filter(r => r.estado === "en_curso").length;
    const finalizadas = activasHoy.filter(r => r.estado === "finalizado").length;
    const pendientes = activasHoy.filter(r => r.estado === "reservado").length;

    if (resumenContainer) {
        resumenContainer.innerHTML = `
            <div class="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs mb-4">
                <div class="flex items-center gap-3">
                    <div class="w-9 h-9 rounded-lg bg-teal-100 text-teal-800 flex items-center justify-center font-bold text-sm">
                        <svg class="w-5 h-5 text-teal-800" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                    </div>
                    <div>
                        <div class="text-xs font-bold text-slate-800 flex items-center gap-2">
                            <span>Programación Quirúrgica del ${formatearFechaArgentina(fechaSeleccionadaQuirofano)}</span>
                            <span class="badge-his bg-teal-50 text-teal-800 border-teal-200">${quirofanosCache.length} Salas Activas</span>
                        </div>
                        <p class="text-[11px] text-slate-500">Gestión de cirugías programadas, bloqueos y disponibilidad de mesa operatoria</p>
                    </div>
                </div>
                <div class="flex flex-wrap items-center gap-2 text-xs">
                    <span class="badge-his bg-blue-50 text-blue-800 border-blue-200 font-bold">${confirmadas} Confirmadas</span>
                    <span class="badge-his bg-emerald-50 text-emerald-800 border-emerald-200 font-bold ${enCurso > 0 ? 'animate-pulse' : ''}">${enCurso} En Curso</span>
                    <span class="badge-his bg-amber-50 text-amber-800 border-amber-200 font-bold">${pendientes} Pendientes</span>
                    <span class="badge-his bg-slate-100 text-slate-700 border-slate-200">${finalizadas} Finalizadas</span>
                </div>
            </div>
        `;
    }

    if (quirofanosAMostrar.length === 0) {
        contenedor.innerHTML = `
            <div class="text-center py-12 bg-white rounded-2xl border border-slate-200 p-8 shadow-xs">
                <div class="w-12 h-12 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-3">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                </div>
                <h4 class="text-sm font-bold text-slate-800">No se encontraron quirófanos</h4>
                <p class="text-xs text-slate-500 mt-1">No hay salas configuradas o coincidentes con los filtros aplicados.</p>
            </div>
        `;
        return;
    }

    // Configurar columnas tipo grilla responsiva
    const gridCols = quirofanosAMostrar.length === 1 ? 'grid-cols-1 max-w-2xl mx-auto' :
                    quirofanosAMostrar.length === 2 ? 'grid-cols-1 lg:grid-cols-2' :
                    'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';

    let htmlSalas = `<div class="grid ${gridCols} gap-5">`;

    quirofanosAMostrar.forEach(sala => {
        // Reservas de esta sala
        let reservasSala = reservasCache.filter(r => r.quirofanoId === sala.id);

        // Filtro cirujano
        if (filtroCirujanoSeleccionado !== "TODOS") {
            reservasSala = reservasSala.filter(r => r.cirujanoNombre === filtroCirujanoSeleccionado);
        }
        // Filtro estado
        if (filtroEstadoSeleccionado !== "TODOS") {
            reservasSala = reservasSala.filter(r => r.estado === filtroEstadoSeleccionado);
        }

        htmlSalas += `
            <div class="card-his bg-white border border-slate-200/90 shadow-2xs rounded-2xl overflow-hidden flex flex-col">
                <!-- Cabecera de la Sala -->
                <div class="bg-gradient-to-r from-slate-900 to-slate-800 text-white p-4">
                    <div class="flex items-start justify-between gap-2">
                        <div>
                            <div class="flex items-center gap-2">
                                <span class="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
                                <h3 class="font-bold text-sm text-white">${escaparHTML(sala.nombre)}</h3>
                            </div>
                            <p class="text-[11px] text-slate-300 mt-0.5">${escaparHTML(sala.especialidadPrincipal || 'Cirugía General y Especializada')}</p>
                        </div>
                        <button type="button" onclick="window.abrirModalNuevaReservaConSala('${escaparHTML(sala.id)}')" 
                            class="px-2.5 py-1 bg-white/10 hover:bg-white/20 active:bg-white/30 text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition"
                            title="Agendar cirugía en esta sala">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
                            <span>Reservar</span>
                        </button>
                    </div>
                    ${sala.equipamiento ? `
                        <div class="mt-2.5 pt-2 border-t border-slate-700/60 flex items-center gap-1.5 text-[10.5px] text-slate-300">
                            <svg class="w-3.5 h-3.5 text-teal-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"></path></svg>
                            <span class="truncate" title="${escaparHTML(sala.equipamiento)}">${escaparHTML(sala.equipamiento)}</span>
                        </div>
                    ` : ''}
                </div>

                <!-- Lista de Cirugías / Bloques del Día -->
                <div class="p-3.5 space-y-3 flex-1 overflow-y-auto max-h-[560px] bg-slate-50/50">
                    ${reservasSala.length === 0 ? `
                        <div class="text-center py-10 px-4 bg-white rounded-xl border border-dashed border-slate-200">
                            <p class="text-xs text-slate-400">Sin cirugías programadas para esta fecha</p>
                            <button type="button" onclick="window.abrirModalNuevaReservaConSala('${escaparHTML(sala.id)}')" 
                                class="mt-2 text-xs font-bold text-blue-700 hover:text-blue-800 transition">
                                + Agendar Primera Cirugía
                            </button>
                        </div>
                    ` : `
                        ${reservasSala.map(res => renderizarTarjetaReserva(res)).join('')}
                    `}
                </div>
            </div>
        `;
    });

    htmlSalas += `</div>`;
    contenedor.innerHTML = htmlSalas;
}

/**
 * Renderiza la tarjeta visual individual de una cirugía programada
 */
function renderizarTarjetaReserva(res) {
    let badgeColor = "bg-amber-100 text-amber-800 border-amber-300";
    let badgeTexto = "Reservado (Pendiente)";
    let borderStatus = "border-l-4 border-amber-500";

    if (res.estado === "confirmado") {
        badgeColor = "bg-blue-100 text-blue-800 border-blue-300";
        badgeTexto = "Confirmado";
        borderStatus = "border-l-4 border-blue-600";
    } else if (res.estado === "en_curso") {
        badgeColor = "bg-emerald-100 text-emerald-800 border-emerald-300";
        badgeTexto = "En Curso";
        borderStatus = "border-l-4 border-emerald-500 ring-2 ring-emerald-300/40";
    } else if (res.estado === "finalizado") {
        badgeColor = "bg-slate-100 text-slate-700 border-slate-300";
        badgeTexto = "Finalizada";
        borderStatus = "border-l-4 border-slate-400 opacity-80";
    } else if (res.estado === "cancelado") {
        badgeColor = "bg-red-100 text-red-700 border-red-300";
        badgeTexto = "Cancelada";
        borderStatus = "border-l-4 border-red-400 opacity-60";
    }

    return `
        <div onclick="window.abrirDetalleReservaQuirofano('${escaparHTML(res.id)}')"
            class="card-his bg-white p-3.5 rounded-xl shadow-2xs hover:shadow-md transition cursor-pointer ${borderStatus}">
            <div class="flex items-center justify-between gap-2 mb-2">
                <div class="flex items-center gap-1.5 font-mono text-xs font-black text-slate-900 bg-slate-100 px-2 py-0.5 rounded-md">
                    <svg class="w-3.5 h-3.5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    <span>${escaparHTML(res.horaInicio)} - ${escaparHTML(res.horaFin)}</span>
                    <span class="text-[10px] text-slate-500 font-sans font-normal">(${escaparHTML(String(res.duracionMinutos || 60))}m)</span>
                </div>
                <span class="badge-his text-[10px] ${badgeColor} font-bold">${badgeTexto}</span>
            </div>

            <h4 class="text-xs font-bold text-slate-900 line-clamp-1" title="${escaparHTML(res.procedimiento || 'Procedimiento Quirúrgico')}">
                ${escaparHTML(res.procedimiento || 'Procedimiento sin especificar')}
            </h4>

            <div class="mt-2 space-y-1 text-[11px] text-slate-600">
                <div class="flex items-center gap-1.5 truncate">
                    <svg class="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                    <span class="font-semibold text-slate-800">Paciente:</span>
                    <span class="truncate">${escaparHTML(res.pacienteNombre)} (DNI: ${escaparHTML(res.pacienteDni)})</span>
                </div>
                <div class="flex items-center gap-1.5 truncate">
                    <svg class="w-3.5 h-3.5 text-emerald-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    <span class="font-semibold text-slate-800">Cirujano:</span>
                    <span class="truncate">${escaparHTML(res.cirujanoNombre || 'Equipo de Cirugía')}</span>
                </div>
            </div>
        </div>
    `;
}

// =============================================================================
// 4. ACCIONES Y MODALES: NUEVA RESERVA, DETALLE Y ESTADOS
// =============================================================================

/**
 * Abre el modal para crear una nueva reserva de quirófano
 */
export function abrirModalNuevaReservaQuirofano(quirofanoPreseleccionadoId = null) {
    const modal = document.getElementById("modal-nueva-reserva-quirofano");
    if (!modal) return;

    // Llenar select de quirófanos disponibles
    const selectQ = document.getElementById("modal-quirofano-select-sala");
    if (selectQ) {
        selectQ.innerHTML = quirofanosCache.map(q => `
            <option value="${escaparHTML(q.id)}" ${q.id === quirofanoPreseleccionadoId ? 'selected' : ''}>
                ${escaparHTML(q.nombre)} (${escaparHTML(q.especialidadPrincipal || 'General')})
            </option>
        `).join('');
    }

    // Fecha
    const inputFecha = document.getElementById("modal-quirofano-input-fecha");
    if (inputFecha) {
        inputFecha.value = fechaSeleccionadaQuirofano || obtenerFechaHoyISO();
        inputFecha.min = obtenerFechaHoyISO();
    }

    // Resetear formulario
    const form = document.getElementById("form-nueva-reserva-quirofano");
    if (form) form.reset();

    if (inputFecha) inputFecha.value = fechaSeleccionadaQuirofano || obtenerFechaHoyISO();
    if (quirofanoPreseleccionadoId && selectQ) selectQ.value = quirofanoPreseleccionadoId;

    // Precargar datos del cirujano si el usuario en sesión es Médico
    const sesion = obtenerSesionActual();
    const permisos = Array.isArray(sesion?.permisosAdicionales) ? sesion.permisosAdicionales : [];
    const inputCirujano = document.getElementById("modal-quirofano-input-cirujano");
    const selectEstado = document.getElementById("modal-quirofano-select-estado");

    const esMed = esRolMedico(sesion?.rol);
    const esAdmin = esRolAdministracion(sesion?.rol);
    const esRec = esRolRecepcion(sesion?.rol);
    const tieneCoord = (esMed || esRolEnfermeria(sesion?.rol)) && permisos.includes("coordinaQuirofano");
    const tieneAnestesia = esMed && permisos.includes("anestesia");
    const puedeConfirmarDirecto = esAdmin || esRec || tieneCoord || tieneAnestesia;

    if (inputCirujano && sesion && esMed) {
        inputCirujano.value = sesion.nombre || "";
        inputCirujano.readOnly = true;
    } else if (inputCirujano) {
        inputCirujano.readOnly = false;
    }

    if (selectEstado) {
        if (puedeConfirmarDirecto) {
            selectEstado.disabled = false;
            selectEstado.value = "confirmado";
        } else {
            selectEstado.value = "reservado";
            selectEstado.disabled = true;
        }
    }

    actualizarPreviewHoraFinModal();
    abrirModal("modal-nueva-reserva-quirofano");
}

export function abrirModalNuevaReservaConSala(quirofanoId) {
    abrirModalNuevaReservaQuirofano(quirofanoId);
}

/**
 * Actualiza en tiempo real el cálculo de la hora fin en el modal de reserva
 */
export function actualizarPreviewHoraFinModal() {
    const hInicio = document.getElementById("modal-quirofano-input-hora-inicio")?.value;
    const duracion = document.getElementById("modal-quirofano-select-duracion")?.value;
    const previewEl = document.getElementById("modal-quirofano-preview-hora-fin");

    if (previewEl && hInicio && duracion) {
        const hFin = calcularHoraFin(hInicio, duracion);
        previewEl.textContent = `${hFin} hs`;
    }
}

/**
 * Guarda una nueva reserva de quirófano en Firestore tras estricta validación anti-colisión
 */
export async function guardarReservaQuirofano() {
    await ejecutarUnaVez("guardar-reserva-quirofano", async () => {
        const sesion = obtenerSesionActual();
        if (!sesion) {
            mostrarAlerta("Sesión Requerida", "Debe iniciar sesión para agendar turnos de quirófano.");
            return;
        }

        const quirofanoId = document.getElementById("modal-quirofano-select-sala")?.value;
        const fecha = document.getElementById("modal-quirofano-input-fecha")?.value;
        const horaInicio = document.getElementById("modal-quirofano-input-hora-inicio")?.value;
        const duracionMin = parseInt(document.getElementById("modal-quirofano-select-duracion")?.value, 10) || 60;
        const pacienteNombre = document.getElementById("modal-quirofano-input-paciente-nombre")?.value?.trim();
        const pacienteDni = document.getElementById("modal-quirofano-input-paciente-dni")?.value?.trim();
        const cirujanoNombre = document.getElementById("modal-quirofano-input-cirujano")?.value?.trim();
        const especialidad = document.getElementById("modal-quirofano-input-especialidad")?.value?.trim() || "Cirugía General";
        const procedimiento = document.getElementById("modal-quirofano-input-procedimiento")?.value?.trim();
        const tipoAnestesia = document.getElementById("modal-quirofano-select-anestesia")?.value || "General";
        const observaciones = document.getElementById("modal-quirofano-input-observaciones")?.value?.trim() || "";

        const permisos = Array.isArray(sesion?.permisosAdicionales) ? sesion.permisosAdicionales : [];
        const esAdmin = esRolAdministracion(sesion.rol);
        const esRecepcion = esRolRecepcion(sesion.rol);
        const esMedico = esRolMedico(sesion.rol);
        const tieneCoord = (esMedico || esRolEnfermeria(sesion.rol)) && permisos.includes("coordinaQuirofano");
        const tieneAnestesia = esMedico && permisos.includes("anestesia");
        const puedeConfirmarDirecto = esAdmin || esRecepcion || tieneCoord || tieneAnestesia;

        let estado = "reservado";
        if (puedeConfirmarDirecto) {
            estado = document.getElementById("modal-quirofano-select-estado")?.value || "confirmado";
        }

        // Validaciones de presencia
        if (!quirofanoId || !fecha || !horaInicio || !pacienteNombre || !pacienteDni || !cirujanoNombre || !procedimiento) {
            mostrarAlerta("Campos Incompletos", "Por favor complete todos los datos obligatorios de la cirugía (sala, fecha, horario, paciente, cirujano y procedimiento).");
            return;
        }

        const horaFin = calcularHoraFin(horaInicio, duracionMin);

        // Validación anti-colisión preventiva local en base a la grilla en memoria
        const conflicto = validarConflictoHorario(quirofanoId, fecha, horaInicio, horaFin);
        if (conflicto.tieneConflicto) {
            const c = conflicto.reservaConflicto;
            mostrarAlerta(
                "Superposición de Horario",
                `El quirófano ya se encuentra reservado de ${c.horaInicio} a ${c.horaFin} hs para el paciente ${c.pacienteNombre} (Cirujano: ${c.cirujanoNombre || 'Equipo'}). Seleccione otro horario o quirófano.`
            );
            return;
        }

        const salaObj = quirofanosCache.find(q => q.id === quirofanoId);
        const quirofanoNombre = salaObj ? salaObj.nombre : quirofanoId;

        try {
            const fnReservar = httpsCallable(functionsInstancia, "reservarQuirofano");
            await fnReservar({
                quirofanoId,
                quirofanoNombre,
                fecha,
                horaInicio,
                horaFin,
                duracionMinutos: duracionMin,
                pacienteNombre,
                pacienteDni,
                cirujanoNombre,
                cirujanoUid: esMedico ? sesion.uid : null,
                especialidad,
                procedimiento,
                tipoAnestesia,
                observaciones,
                estado
            });

            cerrarModal("modal-nueva-reserva-quirofano");
            mostrarExito("Cirugía Agendada", `La reserva para el paciente ${pacienteNombre} se registró exitosamente.`);
            
            // Recargar datos
            fechaSeleccionadaQuirofano = fecha;
            await cargarReservasPorFecha(fecha);
            renderizarControlesQuirofanos();
            renderizarGrillaQuirofanos();
        } catch (err) {
            console.error("Error al registrar reserva de quirófano:", err);
            const esColision = err?.code === "already-exists" ||
                               err?.code === "functions/already-exists" ||
                               err?.message?.includes("already-exists") ||
                               err?.message?.includes("ya está reservado");

            const titulo = esColision ? "Superposición de Horario" : "Error al Registrar";
            let msg = "No se pudo guardar la reserva en la base de datos.";
            if (err?.message) {
                msg = err.message.replace(/^FirebaseError:\s*/, "").replace(/^.*already-exists:\s*/i, "");
            }
            mostrarAlerta(titulo, msg);
        }
    });
}

/**
 * Abre el modal con el detalle completo de una reserva y permite cambiar su estado
 */
export function abrirDetalleReservaQuirofano(reservaId) {
    const res = reservasCache.find(r => r.id === reservaId);
    if (!res) return;

    reservaSeleccionadaParaDetalle = res;
    const modal = document.getElementById("modal-detalle-quirofano");
    if (!modal) return;

    // Rellenar información visual
    document.getElementById("modal-detalle-q-sala").textContent = res.quirofanoNombre || "Quirófano";
    document.getElementById("modal-detalle-q-fecha").textContent = formatearFechaArgentina(res.fecha);
    document.getElementById("modal-detalle-q-horario").textContent = `${res.horaInicio} - ${res.horaFin} hs (${res.duracionMinutos || 60} min)`;
    document.getElementById("modal-detalle-q-paciente").textContent = `${res.pacienteNombre} (DNI: ${res.pacienteDni})`;
    document.getElementById("modal-detalle-q-cirujano").textContent = res.cirujanoNombre || "No especificado";
    document.getElementById("modal-detalle-q-especialidad").textContent = res.especialidad || "Cirugía General";
    document.getElementById("modal-detalle-q-procedimiento").textContent = res.procedimiento || "No especificado";
    document.getElementById("modal-detalle-q-anestesia").textContent = res.tipoAnestesia || "General";
    document.getElementById("modal-detalle-q-observaciones").textContent = res.observaciones || "Sin observaciones adicionales";

    const badgeEstado = document.getElementById("modal-detalle-q-estado");
    if (badgeEstado) {
        badgeEstado.textContent = res.estado.toUpperCase();
        badgeEstado.className = "badge-his font-bold uppercase text-xs " + (
            res.estado === 'confirmado' ? 'bg-blue-100 text-blue-800 border-blue-300' :
            res.estado === 'en_curso' ? 'bg-emerald-100 text-emerald-800 border-emerald-300 animate-pulse' :
            res.estado === 'finalizado' ? 'bg-slate-100 text-slate-700 border-slate-300' :
            res.estado === 'cancelado' ? 'bg-red-100 text-red-700 border-red-300' :
            'bg-amber-100 text-amber-800 border-amber-300'
        );
    }

    // Configurar botones de acción según el rol y estado actual
    const sesion = obtenerSesionActual();
    const rol = sesion ? sesion.rol : "";
    const permisos = Array.isArray(sesion?.permisosAdicionales) ? sesion.permisosAdicionales : [];
    const contenedorBotones = document.getElementById("modal-detalle-q-acciones");

    if (contenedorBotones) {
        let botonesHTML = '';
        const esAdmin = esRolAdministracion(rol);
        const esRecepcion = esRolRecepcion(rol);
        const esMedico = esRolMedico(rol);
        const esEnfermeria = esRolEnfermeria(rol);

        const tieneCoord = (esMedico || esEnfermeria) && permisos.includes("coordinaQuirofano");
        const tieneAnestesia = esMedico && permisos.includes("anestesia");
        const tieneInstrumentacion = esEnfermeria && permisos.includes("instrumentacion");
        const esAutorMedico = esMedico && res.creadoPor && res.creadoPor.uid === sesion?.uid;

        // Permisos de transición estrictamente alineados con firestore.rules (puedeActualizarReservaQuirofano)
        const tieneGestionTotal = esAdmin || esRecepcion || tieneCoord || tieneAnestesia;

        const puedeConfirmar = tieneGestionTotal;
        const puedeIniciarOFinalizar = tieneGestionTotal || tieneInstrumentacion;
        const puedeCancelar = tieneGestionTotal || esAutorMedico;

        if (res.estado === "reservado" && puedeConfirmar) {
            botonesHTML += `
                <button type="button" onclick="window.cambiarEstadoReservaQuirofano('confirmado')" class="btn-his-primary text-xs font-bold bg-blue-700 hover:bg-blue-800">
                    Confirmar Reserva
                </button>
            `;
        }

        if (res.estado === "confirmado" && puedeIniciarOFinalizar) {
            botonesHTML += `
                <button type="button" onclick="window.cambiarEstadoReservaQuirofano('en_curso')" class="btn-his-primary text-xs font-bold bg-emerald-700 hover:bg-emerald-800">
                    Ingresar Paciente a Quirófano (En Curso)
                </button>
            `;
        }

        if (res.estado === "en_curso" && puedeIniciarOFinalizar) {
            botonesHTML += `
                <button type="button" onclick="window.cambiarEstadoReservaQuirofano('finalizado')" class="btn-his-primary text-xs font-bold bg-slate-800 hover:bg-slate-900">
                    Finalizar Cirugía (Liberar Quirófano)
                </button>
            `;
        }

        if (res.estado !== "finalizado" && res.estado !== "cancelado" && puedeCancelar) {
            botonesHTML += `
                <button type="button" onclick="window.confirmarCancelacionReservaQuirofano()" class="btn-his-danger text-xs font-bold">
                    Cancelar Reserva
                </button>
            `;
        }

        contenedorBotones.innerHTML = botonesHTML;
    }

    abrirModal("modal-detalle-quirofano");
}

/**
 * Cambia el estado de una reserva (confirmado, en_curso, finalizado)
 */
export async function cambiarEstadoReservaQuirofano(nuevoEstado) {
    if (!reservaSeleccionadaParaDetalle) return;

    await ejecutarUnaVez("cambiar-estado-quirofano", async () => {
        try {
            const ref = doc(db, "reservas_quirofano", reservaSeleccionadaParaDetalle.id);
            await updateDoc(ref, {
                estado: nuevoEstado,
                actualizadoEn: serverTimestamp()
            });

            cerrarModal("modal-detalle-quirofano");
            mostrarToast(`Estado de la cirugía actualizado a ${nuevoEstado.replace('_', ' ')}.`);

            await cargarReservasPorFecha(fechaSeleccionadaQuirofano);
            renderizarGrillaQuirofanos();
        } catch (err) {
            console.error("Error al actualizar estado de la cirugía:", err);
            mostrarAlerta("Error", "No se pudo actualizar el estado de la reserva.");
        }
    });
}

/**
 * Solicita confirmación y cancela una reserva de quirófano
 */
export async function confirmarCancelacionReservaQuirofano() {
    if (!reservaSeleccionadaParaDetalle) return;

    const confirmado = await pedirConfirmacion(
        "Cancelar Reserva de Quirófano",
        `¿Está seguro de que desea cancelar la cirugía del paciente ${reservaSeleccionadaParaDetalle.pacienteNombre}? El quirófano quedará disponible para otras cirugías.`
    );

    if (!confirmado) return;

    await cambiarEstadoReservaQuirofano("cancelado");
}

// =============================================================================
// 5. CONFIGURACIÓN FÍSICA DE QUIRÓFANOS (EXCLUSIVO ADMINISTRACIÓN)
// =============================================================================

/**
 * Abre el modal de configuración de quirófanos para el Administrador
 */
export function abrirConfigQuirofanosAdmin() {
    const sesion = obtenerSesionActual();
    if (!sesion || !esRolAdministracion(sesion.rol)) {
        mostrarAlerta("Acceso Restringido", "Solo el Administrador institucional puede configurar los quirófanos físicos.");
        return;
    }

    renderizarTablaConfigQuirofanosAdmin();
    abrirModal("modal-config-quirofanos-admin");
}

/**
 * Renderiza la tabla de quirófanos en el modal de configuración
 */
export function renderizarTablaConfigQuirofanosAdmin() {
    const tbody = document.getElementById("tabla-admin-quirofanos-body");
    if (!tbody) return;

    if (quirofanosCache.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-xs text-slate-500">No hay quirófanos registrados.</td></tr>`;
        return;
    }

    tbody.innerHTML = quirofanosCache.map(q => `
        <tr class="border-b border-slate-100 hover:bg-slate-50 text-xs">
            <td class="py-2.5 px-3 font-bold text-slate-900">${escaparHTML(q.nombre)}</td>
            <td class="py-2.5 px-3 text-slate-600">${escaparHTML(q.especialidadPrincipal || 'General')}</td>
            <td class="py-2.5 px-3 text-slate-500 max-w-xs truncate" title="${escaparHTML(q.equipamiento || '')}">${escaparHTML(q.equipamiento || 'Estándar')}</td>
            <td class="py-2.5 px-3 text-center">
                <span class="badge-his bg-emerald-50 text-emerald-800 border-emerald-200 text-[10px]">Activo</span>
            </td>
            <td class="py-2.5 px-3 text-right">
                <button type="button" onclick="window.eliminarQuirofanoAdmin('${escaparHTML(q.id)}')" class="text-red-600 hover:text-red-800 font-bold text-xs p-1">
                    Eliminar
                </button>
            </td>
        </tr>
    `).join('');
}

/**
 * Guarda un nuevo quirófano creado por el Administrador
 */
export async function guardarNuevoQuirofanoAdmin() {
    await ejecutarUnaVez("guardar-quirofano-admin", async () => {
        const sesion = obtenerSesionActual();
        if (!sesion || !esRolAdministracion(sesion.rol)) return;

        const nombre = document.getElementById("admin-quirofano-nombre")?.value?.trim();
        const especialidad = document.getElementById("admin-quirofano-especialidad")?.value?.trim();
        const equipamiento = document.getElementById("admin-quirofano-equipamiento")?.value?.trim();

        if (!nombre) {
            mostrarAlerta("Dato Requerido", "Debe ingresar el nombre o número del quirófano.");
            return;
        }

        const id = `Q_${Date.now()}`;
        const nuevoQ = {
            nombre,
            especialidadPrincipal: especialidad || "Cirugía General",
            equipamiento: equipamiento || "Equipamiento estándar de cirugía",
            activo: true,
            orden: quirofanosCache.length + 1,
            creadoEn: serverTimestamp()
        };

        try {
            await setDoc(doc(db, "quirofanos", id), nuevoQ);
            document.getElementById("form-admin-nuevo-quirofano")?.reset();
            mostrarExito("Quirófano Creado", `El ${nombre} fue agregado a la estructura hospitalaria.`);
            await cargarQuirofanosHospital();
            renderizarTablaConfigQuirofanosAdmin();
            renderizarControlesQuirofanos();
            renderizarGrillaQuirofanos();
        } catch (err) {
            console.error("Error al crear quirófano:", err);
            mostrarAlerta("Error", "No se pudo guardar el nuevo quirófano.");
        }
    });
}

/**
 * Elimina o desactiva un quirófano
 */
export async function eliminarQuirofanoAdmin(quirofanoId) {
    const sesion = obtenerSesionActual();
    if (!sesion || !esRolAdministracion(sesion.rol)) return;

    const confirmado = await pedirConfirmacion(
        "Desactivar Quirófano",
        "¿Está seguro de que desea retirar este quirófano de la estructura activa? Las reservas históricas se conservarán intactas."
    );

    if (!confirmado) return;

    try {
        await updateDoc(doc(db, "quirofanos", quirofanoId), {
            activo: false,
            desactivadoEn: serverTimestamp()
        });

        mostrarToast("Quirófano desactivado correctamente.");
        await cargarQuirofanosHospital();
        renderizarTablaConfigQuirofanosAdmin();
        renderizarControlesQuirofanos();
        renderizarGrillaQuirofanos();
    } catch (err) {
        console.error("Error al desactivar quirófano:", err);
        mostrarAlerta("Error", "No se pudo desactivar el quirófano.");
    }
}

/**
 * Siembra inicial de quirófanos típicos para el Hospital Teodoro J. Schestakow
 */
export async function sembrarQuirofanosInicial() {
    const salasDemo = [
        {
            id: "Q1",
            nombre: "Quirófano 1 - Cirugía General y Laparoscopía",
            especialidadPrincipal: "Cirugía General",
            equipamiento: "Torre laparoscópica Karl Storz 4K, electrobisturí monopolar/bipolar, mesa radiolúcida",
            orden: 1
        },
        {
            id: "Q2",
            nombre: "Quirófano 2 - Traumatología y Ortopedia",
            especialidadPrincipal: "Traumatología",
            equipamiento: "Arco en C radiológico digital Siemens, tracción ortopédica, set completo de osteosíntesis",
            orden: 2
        },
        {
            id: "Q3",
            nombre: "Quirófano 3 - Cirugía Infantil y Gineco-Obstetricia",
            especialidadPrincipal: "Cirugía Pediátrica",
            equipamiento: "Mesa termorregulada pediátrica, servocuna de reanimación neonatal, monitor multiparamétrico Dräger",
            orden: 3
        }
    ];

    try {
        for (const sala of salasDemo) {
            await setDoc(doc(db, "quirofanos", sala.id), {
                nombre: sala.nombre,
                especialidadPrincipal: sala.especialidadPrincipal,
                equipamiento: sala.equipamiento,
                activo: true,
                orden: sala.orden,
                creadoEn: serverTimestamp()
            });
        }
        console.log("Quirófanos iniciales del Hospital Schestakow sembrados con éxito.");
    } catch (e) {
        console.warn("Aviso al sembrar quirófanos iniciales:", e);
    }
}

// =============================================================================
// SIEMBRA MANUAL CON CONFIRMACIÓN (igual que internacion.js)
// =============================================================================
export async function sembrarQuirofanosInicialConConfirmacion() {
    const sesion = obtenerSesionActual();
    if (!sesion || !esRolAdministracion(sesion.rol)) {
        mostrarAlerta('Sin Permiso', 'Solo Administración puede cargar la estructura de quirófanos.');
        return;
    }
    const ok = await pedirConfirmacion(
        'Cargar Estructura de Quirófanos',
        '¿Desea cargar los 3 quirófanos modelo del Hospital Schestakow (Q1 Cirugía General, Q2 Traumatología, Q3 Infantil)? Esta acción solo debería realizarse en un hospital sin quirófanos configurados.'
    );
    if (!ok) return;
    await sembrarQuirofanosInicial();
    mostrarExito('Quirófanos Cargados', 'Se crearon los 3 quirófanos modelo.');
    await cargarQuirofanosHospital();
    renderizarTablaConfigQuirofanosAdmin();
    renderizarControlesQuirofanos();
    renderizarGrillaQuirofanos();
}

// =============================================================================
// 6. EXPOSICIÓN GLOBAL EN WINDOW
// =============================================================================
window.inicializarModuloQuirofanos = inicializarModuloQuirofanos;
window.cambiarFechaQuirofano = async function(nuevaFecha) {
    fechaSeleccionadaQuirofano = nuevaFecha;
    await cargarReservasPorFecha(nuevaFecha);
    renderizarControlesQuirofanos();
    renderizarGrillaQuirofanos();
};
window.filtrarQuirofano = function(quirofanoId) {
    filtroQuirofanoSeleccionado = quirofanoId;
    renderizarGrillaQuirofanos();
};
window.filtrarCirujanoQuirofano = function(cirujanoNombre) {
    filtroCirujanoSeleccionado = cirujanoNombre;
    renderizarGrillaQuirofanos();
};
window.filtrarEstadoQuirofano = function(estado) {
    filtroEstadoSeleccionado = estado;
    renderizarGrillaQuirofanos();
};
window.abrirModalNuevaReservaQuirofano = abrirModalNuevaReservaQuirofano;
window.abrirModalNuevaReservaConSala = abrirModalNuevaReservaConSala;
window.actualizarPreviewHoraFinModal = actualizarPreviewHoraFinModal;
window.guardarReservaQuirofano = guardarReservaQuirofano;
window.abrirDetalleReservaQuirofano = abrirDetalleReservaQuirofano;
window.cambiarEstadoReservaQuirofano = cambiarEstadoReservaQuirofano;
window.confirmarCancelacionReservaQuirofano = confirmarCancelacionReservaQuirofano;
window.abrirConfigQuirofanosAdmin = abrirConfigQuirofanosAdmin;
window.guardarNuevoQuirofanoAdmin = guardarNuevoQuirofanoAdmin;
window.eliminarQuirofanoAdmin = eliminarQuirofanoAdmin;
window.sembrarQuirofanosInicialConConfirmacion = sembrarQuirofanosInicialConConfirmacion;
