// =============================================================================
// MÓDULO INTERFAZ: INTERCONSULTAS MÉDICAS CONFIDENCIALES
// js/interconsultas.js
// Gestión visual, tiempo real, sanitización anti-XSS y accesibilidad.
// =============================================================================

import {
    crearInterconsulta,
    escucharMisInterconsultas,
    escucharMensajes,
    enviarMensaje,
    cambiarEstado,
    agregarParticipante,
    marcarComoLeida,
    obtenerColegasMedicosDisponibles,
    obtenerDatosOficialesMedico
} from "./datos-interconsultas.js";

import {
    auth
} from "./firebase.js";

import {
    mostrarAlerta,
    mostrarExito,
    pedirConfirmacion,
    abrirModal,
    cerrarModal,
    formatearFechaAR,
    formatearHoraAR
} from "./ui.js";

import {
    obtenerPacienteActivoHC
} from "./consultorio.js";

// Estado interno del módulo
let interconsultasCargadas = [];
let interconsultaSeleccionadaId = null;
let filtroEstadoActual = "todos"; // todos | pendiente | en_curso | respondida | cerrada
let busquedaTextoActual = "";

let unsubscribeLista = null;
let unsubscribeMensajes = null;

// Caché de perfiles médicos oficiales (uid -> {nombre, especialidad})
const cachePerfilesMedicos = new Map();

/**
 * Escapa caracteres HTML para evitar XSS.
 * @param {string} str
 * @returns {string}
 */
export function escaparTexto(str) {
    if (str === null || str === undefined) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/**
 * Formatea una fecha/timestamp a formato argentino: dd/mm/aaaa, hh:mm hs
 * @param {any} timestamp
 * @returns {string}
 */
export function formatearFechaHoraAR(timestamp) {
    if (!timestamp) return "--/--/----";
    let d = null;
    if (typeof timestamp.toDate === "function") d = timestamp.toDate();
    else if (typeof timestamp.toMillis === "function") d = new Date(timestamp.toMillis());
    else if (timestamp.seconds) d = new Date(timestamp.seconds * 1000);
    else if (timestamp instanceof Date) d = timestamp;
    else d = new Date(timestamp);

    if (isNaN(d.getTime())) return "--/--/----";

    const dia = String(d.getDate()).padStart(2, "0");
    const mes = String(d.getMonth() + 1).padStart(2, "0");
    const anio = d.getFullYear();
    const hora = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");

    return `${dia}/${mes}/${anio} - ${hora}:${min} hs`;
}

/**
 * Resuelve los datos de un médico desde la caché o Firestore.
 * @param {string} uid
 * @returns {Promise<{nombre: string, especialidad: string}>}
 */
async function resolverPerfilMedico(uid) {
    if (!uid) return { nombre: "Profesional", especialidad: "Medicina" };
    if (cachePerfilesMedicos.has(uid)) {
        return cachePerfilesMedicos.get(uid);
    }
    const perfil = await obtenerDatosOficialesMedico(uid);
    cachePerfilesMedicos.set(uid, perfil);
    return perfil;
}

/**
 * Inicializa el módulo cuando el médico entra a la vista.
 */
export function inicializarModuloInterconsultas() {
    const user = auth.currentUser;
    if (!user) return;

    // Cancelar listeners previos si existían
    desmontarModuloInterconsultas();

    // Iniciar escucha en tiempo real de mis interconsultas
    unsubscribeLista = escucharMisInterconsultas(user.uid, (lista) => {
        interconsultasCargadas = lista;
        actualizarContadorNoLeidas();
        renderizarListaInterconsultas();

        // Si hay una interconsulta abierta, refrescar encabezado
        if (interconsultaSeleccionadaId) {
            const actual = interconsultasCargadas.find((ic) => ic.id === interconsultaSeleccionadaId);
            if (actual) {
                renderizarEncabezadoConversacion(actual);
            }
        }
    }, (err) => {
        console.warn("Aviso al escuchar interconsultas:", err.message);
    });
}

/**
 * Desmonta listeners activos para evitar duplicaciones o fugas de memoria.
 */
export function desmontarModuloInterconsultas() {
    if (typeof unsubscribeLista === "function") {
        unsubscribeLista();
        unsubscribeLista = null;
    }
    if (typeof unsubscribeMensajes === "function") {
        unsubscribeMensajes();
        unsubscribeMensajes = null;
    }
    interconsultaSeleccionadaId = null;
}

/**
 * Calcula y actualiza el badge de interconsultas no leídas.
 */
function actualizarContadorNoLeidas() {
    const user = auth.currentUser;
    const badge = document.getElementById("badge-interconsultas-no-leidas");
    if (!badge || !user) return;

    let noLeidas = 0;
    interconsultasCargadas.forEach((ic) => {
        if (ic.estado === "cerrada") return;
        const miLectura = ic.lecturas?.[user.uid];
        const miTime = miLectura?.toMillis ? miLectura.toMillis() : (miLectura?.seconds ? miLectura.seconds * 1000 : 0);
        const actTime = ic.actualizadaEn?.toMillis ? ic.actualizadaEn.toMillis() : (ic.actualizadaEn?.seconds ? ic.actualizadaEn.seconds * 1000 : 0);

        if (!miLectura || actTime > miTime) {
            noLeidas++;
        }
    });

    if (noLeidas > 0) {
        badge.innerText = String(noLeidas);
        badge.classList.remove("hidden");
    } else {
        badge.classList.add("hidden");
    }
}

/**
 * Renderiza el listado izquierdo de interconsultas.
 */
export function renderizarListaInterconsultas() {
    const contenedor = document.getElementById("interconsultas-lista-container");
    if (!contenedor) return;

    const user = auth.currentUser;
    const uidActual = user ? user.uid : "";

    // Filtrar por estado y por texto de búsqueda
    const q = busquedaTextoActual.toLowerCase().trim();
    const filtradas = interconsultasCargadas.filter((ic) => {
        if (filtroEstadoActual !== "todos" && ic.estado !== filtroEstadoActual) {
            return false;
        }
        if (q) {
            const asunto = (ic.asunto || "").toLowerCase();
            const codigo = (ic.codigoTurno || "").toLowerCase();
            const esp = (ic.especialidadDestino || "").toLowerCase();
            if (!asunto.includes(q) && !codigo.includes(q) && !esp.includes(q)) {
                return false;
            }
        }
        return true;
    });

    if (filtradas.length === 0) {
        contenedor.innerHTML = `
            <div class="p-8 text-center text-slate-400 text-xs">
                <svg class="w-8 h-8 mx-auto mb-2 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg>
                <p class="font-semibold text-slate-600">No hay interconsultas</p>
                <p class="text-[11px] text-slate-400 mt-1">No se encontraron conversaciones con los filtros actuales.</p>
            </div>
        `;
        return;
    }

    let html = "";
    filtradas.forEach((ic) => {
        const esSeleccionada = ic.id === interconsultaSeleccionadaId;
        const esUrgente = ic.prioridad === "urgente";

        // Comprobar si hay mensajes no leídos por mí
        const miLectura = ic.lecturas?.[uidActual];
        const miTime = miLectura?.toMillis ? miLectura.toMillis() : (miLectura?.seconds ? miLectura.seconds * 1000 : 0);
        const actTime = ic.actualizadaEn?.toMillis ? ic.actualizadaEn.toMillis() : (ic.actualizadaEn?.seconds ? ic.actualizadaEn.seconds * 1000 : 0);
        const noLeida = ic.estado !== "cerrada" && (!miLectura || actTime > miTime);

        // Chip de estado
        let chipEstado = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">Pendiente</span>`;
        if (ic.estado === "en_curso") chipEstado = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-100 text-sky-800 border border-sky-200">En Curso</span>`;
        else if (ic.estado === "respondida") chipEstado = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">Respondida</span>`;
        else if (ic.estado === "cerrada") chipEstado = `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">Cerrada</span>`;

        const badgeUrgente = esUrgente
            ? `<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-800 border border-red-300 uppercase">Urgente</span>`
            : "";

        const badgeNuevo = noLeida
            ? `<span class="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" title="Mensajes nuevos"></span>`
            : "";

        const claseBg = esSeleccionada
            ? "bg-emerald-50/80 border-emerald-600 shadow-xs"
            : (noLeida ? "bg-white border-amber-300 hover:bg-slate-50" : "bg-white border-slate-200 hover:bg-slate-50");

        html += `
            <div data-id="${escaparTexto(ic.id)}" onclick="window.seleccionarInterconsulta('${escaparTexto(ic.id)}')" class="p-3.5 rounded-lg border ${claseBg} cursor-pointer transition flex flex-col gap-1.5 select-none relative">
                <div class="flex items-center justify-between gap-2">
                    <div class="flex items-center gap-1.5 flex-wrap">
                        ${chipEstado}
                        ${badgeUrgente}
                        <span class="text-[11px] font-mono text-slate-500">Ref: ${escaparTexto(ic.codigoTurno)}</span>
                    </div>
                    ${badgeNuevo}
                </div>

                <h4 class="text-xs sm:text-sm font-bold text-slate-800 line-clamp-2 leading-snug">
                    ${escaparTexto(ic.asunto)}
                </h4>

                <div class="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                    <span class="truncate max-w-[150px] font-medium text-emerald-800">
                        Destino: ${escaparTexto(ic.especialidadDestino)}
                    </span>
                    <span class="font-mono text-[10px] text-slate-400">
                        ${formatearFechaHoraAR(ic.actualizadaEn)}
                    </span>
                </div>
            </div>
        `;
    });

    contenedor.innerHTML = html;
}

/**
 * Selecciona una interconsulta y abre su conversación a la derecha.
 * @param {string} id
 */
export async function seleccionarInterconsulta(id) {
    if (!id) return;
    interconsultaSeleccionadaId = id;

    const user = auth.currentUser;
    if (user) {
        await marcarComoLeida({ interconsultaId: id, uid: user.uid });
        actualizarContadorNoLeidas();
    }

    renderizarListaInterconsultas();

    const ic = interconsultasCargadas.find((x) => x.id === id);
    if (!ic) return;

    // En pantallas chicas, cambiar a vista conversación
    const colLista = document.getElementById("interconsultas-col-lista");
    const colChat = document.getElementById("interconsultas-col-chat");
    if (colLista && colChat && window.innerWidth < 1024) {
        colLista.classList.add("hidden");
        colChat.classList.remove("hidden");
    }

    renderizarEncabezadoConversacion(ic);
    iniciarEscuchaMensajes(id);
}

/**
 * Vuelve al listado en vista móvil.
 */
export function volverAListaInterconsultasMovil() {
    const colLista = document.getElementById("interconsultas-col-lista");
    const colChat = document.getElementById("interconsultas-col-chat");
    if (colLista && colChat) {
        colChat.classList.add("hidden");
        colLista.classList.remove("hidden");
    }
}

/**
 * Renderiza el encabezado del panel de conversación activo.
 * @param {Object} ic
 */
async function renderizarEncabezadoConversacion(ic) {
    const header = document.getElementById("interconsulta-chat-header");
    const placeholder = document.getElementById("interconsulta-chat-placeholder");
    const chatContenido = document.getElementById("interconsulta-chat-contenido");

    if (!header || !placeholder || !chatContenido) return;

    placeholder.classList.add("hidden");
    chatContenido.classList.remove("hidden");

    // Resolver nombres de los participantes
    const nombresPromesas = (ic.participantes || []).map(async (uid) => {
        const p = await resolverPerfilMedico(uid);
        return `${p.nombre} (${p.especialidad})`;
    });
    const nombres = await Promise.all(nombresPromesas);

    let chipEstado = `<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-200">Pendiente</span>`;
    if (ic.estado === "en_curso") chipEstado = `<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-sky-100 text-sky-800 border border-sky-200">En Curso</span>`;
    else if (ic.estado === "respondida") chipEstado = `<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">Respondida</span>`;
    else if (ic.estado === "cerrada") chipEstado = `<span class="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">Cerrada</span>`;

    const esCerrada = ic.estado === "cerrada";

    header.innerHTML = `
        <div class="flex items-center justify-between gap-2 border-b border-slate-200 pb-3 mb-3 flex-wrap">
            <div class="flex items-center gap-2">
                <button type="button" onclick="window.volverAListaInterconsultasMovil()" class="lg:hidden p-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700" title="Volver al listado">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>
                </button>
                <div>
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="text-xs font-mono font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">Turno: ${escaparTexto(ic.codigoTurno)}</span>
                        ${chipEstado}
                        ${ic.prioridad === "urgente" ? '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-800 border border-red-300">Urgente</span>' : ""}
                    </div>
                    <h3 class="text-sm sm:text-base font-bold text-slate-900 mt-1">
                        ${escaparTexto(ic.asunto)}
                    </h3>
                </div>
            </div>

            <div class="flex items-center gap-2">
                ${!esCerrada ? `
                    <button type="button" onclick="window.abrirModalAgregarColega('${escaparTexto(ic.id)}')" class="btn-his-secondary text-xs py-1.5 px-2.5 flex items-center gap-1 shadow-xs" title="Sumar a otro colega médico">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"></path></svg>
                        <span>Agregar Colega</span>
                    </button>
                    <button type="button" onclick="window.confirmarCierreInterconsulta('${escaparTexto(ic.id)}')" class="btn-his-text text-xs py-1.5 px-2.5 text-red-700 hover:bg-red-50 border border-red-200 rounded flex items-center gap-1">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                        <span>Cerrar</span>
                    </button>
                ` : `
                    <span class="text-xs text-slate-400 italic">Interconsulta archivada</span>
                `}
            </div>
        </div>

        <!-- Participantes y Especialidad -->
        <div class="text-xs text-slate-600 bg-slate-50 p-2.5 rounded border border-slate-200 flex flex-col sm:flex-row justify-between gap-2">
            <div>
                <strong>Profesionales participantes:</strong>
                <span class="text-slate-800">${escaparTexto(nombres.join(", "))}</span>
            </div>
            <div class="text-slate-500 shrink-0">
                Especialidad: <strong>${escaparTexto(ic.especialidadDestino)}</strong>
            </div>
        </div>
    `;

    // Deshabilitar caja de texto si está cerrada
    const formEnvio = document.getElementById("interconsulta-form-envio");
    const inputTexto = document.getElementById("interconsulta-input-mensaje");
    if (formEnvio && inputTexto) {
        if (esCerrada) {
            formEnvio.classList.add("hidden");
        } else {
            formEnvio.classList.remove("hidden");
            inputTexto.disabled = false;
        }
    }
}

/**
 * Escucha los mensajes de la interconsulta seleccionada y actualiza el chat en tiempo real.
 * @param {string} interconsultaId
 */
function iniciarEscuchaMensajes(interconsultaId) {
    if (typeof unsubscribeMensajes === "function") {
        unsubscribeMensajes();
        unsubscribeMensajes = null;
    }

    const contenedor = document.getElementById("interconsultas-mensajes-container");
    if (!contenedor) return;

    contenedor.innerHTML = `<p class="text-xs text-slate-400 text-center py-8">Cargando mensajes confidenciales...</p>`;

    unsubscribeMensajes = escucharMensajes(interconsultaId, async (mensajes) => {
        const user = auth.currentUser;
        const miUid = user ? user.uid : "";

        if (mensajes.length === 0) {
            contenedor.innerHTML = `<p class="text-xs text-slate-400 text-center py-8 italic">No hay mensajes aún. Comience la conversación abajo.</p>`;
            return;
        }

        // Limitar a los últimos 50 mensajes en pantalla
        const mensajesTramos = mensajes.slice(-50);

        let html = "";
        for (const m of mensajesTramos) {
            const esMio = m.autorUid === miUid;
            const esSistema = m.tipo === "sistema";

            if (esSistema) {
                html += `
                    <div class="flex justify-center my-2">
                        <div class="bg-slate-100 text-slate-600 text-[11px] px-3 py-1 rounded-full border border-slate-200 text-center max-w-md">
                            ${escaparTexto(m.texto)}
                        </div>
                    </div>
                `;
                continue;
            }

            const perfil = await resolverPerfilMedico(m.autorUid);
            const claseAlineacion = esMio ? "justify-end" : "justify-start";
            const claseBurbuja = esMio
                ? "bg-[#002845] text-white rounded-br-none"
                : "bg-white text-slate-800 border border-slate-200 rounded-bl-none shadow-xs";
            const claseAutor = esMio ? "text-emerald-200" : "text-emerald-800";
            const claseHora = esMio ? "text-slate-300" : "text-slate-400";

            html += `
                <div class="flex ${claseAlineacion} mb-3">
                    <div class="max-w-[85%] sm:max-w-[70%] p-3 rounded-lg ${claseBurbuja} space-y-1">
                        <div class="flex items-center justify-between gap-3 text-[11px]">
                            <span class="font-bold ${claseAutor}">
                                ${escaparTexto(perfil.nombre)} <span class="font-normal opacity-80">(${escaparTexto(perfil.especialidad)})</span>
                            </span>
                            <span class="font-mono text-[10px] ${claseHora}">
                                ${formatearFechaHoraAR(m.creadoEn)}
                            </span>
                        </div>
                        <p class="text-xs sm:text-sm whitespace-pre-wrap break-words leading-relaxed">
                            ${escaparTexto(m.texto)}
                        </p>
                    </div>
                </div>
            `;
        }

        contenedor.innerHTML = html;

        // Auto-scroll al final
        setTimeout(() => {
            contenedor.scrollTop = contenedor.scrollHeight;
        }, 50);
    }, (err) => {
        contenedor.innerHTML = `<p class="text-xs text-red-500 text-center py-6">Error al cargar mensajes: ${escaparTexto(err.message)}</p>`;
    });
}

/**
 * Envía el mensaje escrito por el médico en la conversación activa.
 */
export async function enviarMensajeInterconsultaActual() {
    if (!interconsultaSeleccionadaId) return;

    const input = document.getElementById("interconsulta-input-mensaje");
    const btn = document.getElementById("btn-enviar-mensaje-ic");
    if (!input) return;

    const texto = input.value.trim();
    if (!texto) return;

    if (texto.length > 2000) {
        mostrarAlerta("Mensaje Demasiado Largo", "El mensaje no puede superar los 2000 caracteres.");
        return;
    }

    try {
        if (btn) btn.disabled = true;
        input.disabled = true;

        await enviarMensaje({
            interconsultaId: interconsultaSeleccionadaId,
            texto: texto
        });

        input.value = "";
        actualizarContadorCaracteresMensaje();
    } catch (e) {
        console.error("Error al enviar mensaje:", e);
        mostrarAlerta("Error al Enviar", e.message || "No se pudo enviar el mensaje.");
    } finally {
        if (input) input.disabled = false;
        if (btn) btn.disabled = false;
        if (input) input.focus();
    }
}

/**
 * Actualiza el contador de caracteres del campo de texto de mensaje.
 */
export function actualizarContadorCaracteresMensaje() {
    const input = document.getElementById("interconsulta-input-mensaje");
    const contador = document.getElementById("contador-caracteres-ic");
    if (!input || !contador) return;

    const len = input.value.length;
    contador.innerText = `${len} / 2000`;
    if (len > 1900) {
        contador.className = "text-[10px] font-mono text-red-600 font-bold";
    } else {
        contador.className = "text-[10px] font-mono text-slate-400";
    }
}

/**
 * Abre el modal para crear una nueva interconsulta desde el botón del paciente.
 */
export async function abrirModalNuevaInterconsultaDesdePaciente() {
    const paciente = obtenerPacienteActivoHC();
    if (!paciente) {
        mostrarAlerta("Sin Paciente", "Seleccione primero un paciente en la sala de espera o busque por DNI.");
        return;
    }

    await abrirModalCrearInterconsulta({
        idTurno: paciente.idTurno || paciente.turnoId || "",
        codigoTurno: paciente.codigoConfirmacion || paciente.idTurno || `PAC_${paciente.dni || "000"}`,
        nombrePaciente: `${paciente.nombre} ${paciente.apellido || ""}`.trim()
    });
}

/**
 * Abre el diálogo de nueva interconsulta con precarga opcional de turno.
 * @param {Object} [datosTurno]
 */
export async function abrirModalCrearInterconsulta(datosTurno = null) {
    const modal = document.getElementById("modal-nueva-interconsulta");
    if (!modal) return;

    // Poblar selector de colegas filtrables
    const selectColega = document.getElementById("input-ic-colega-destino");
    const selectEsp = document.getElementById("input-ic-especialidad-filtro");
    const inputAsunto = document.getElementById("input-ic-asunto");
    const inputMotivo = document.getElementById("input-ic-motivo");
    const inputCodigoTurno = document.getElementById("input-ic-codigo-turno");
    const inputIdTurno = document.getElementById("input-ic-id-turno");
    const radioNormal = document.getElementById("radio-ic-prioridad-normal");

    if (inputAsunto) inputAsunto.value = "";
    if (inputMotivo) inputMotivo.value = "";
    if (radioNormal) radioNormal.checked = true;

    if (datosTurno) {
        if (inputCodigoTurno) inputCodigoTurno.value = datosTurno.codigoTurno || "";
        if (inputIdTurno) inputIdTurno.value = datosTurno.idTurno || "";
    } else {
        if (inputCodigoTurno) inputCodigoTurno.value = "";
        if (inputIdTurno) inputIdTurno.value = "";
    }

    // Cargar colegas
    const colegas = await obtenerColegasMedicosDisponibles();
    const miUid = auth.currentUser?.uid;
    const colegasSinMi = colegas.filter((c) => c.uid !== miUid);

    // Especialidades únicas
    const especialidades = Array.from(new Set(colegasSinMi.map((c) => c.especialidad).filter(Boolean)));
    if (selectEsp) {
        selectEsp.innerHTML = `<option value="">-- Todas las especialidades --</option>` +
            especialidades.map((esp) => `<option value="${escaparTexto(esp)}">${escaparTexto(esp)}</option>`).join("");
    }

    window.actualizarSelectColegasPorEspecialidad = () => {
        const espSel = selectEsp ? selectEsp.value : "";
        const filtrados = espSel ? colegasSinMi.filter((c) => c.especialidad === espSel) : colegasSinMi;

        if (selectColega) {
            if (filtrados.length === 0) {
                selectColega.innerHTML = `<option value="">No hay profesionales disponibles en esta área</option>`;
            } else {
                selectColega.innerHTML = `<option value="">-- Seleccione profesional destinatario --</option>` +
                    filtrados.map((c) => `<option value="${escaparTexto(c.uid)}">${escaparTexto(c.nombre)} (${escaparTexto(c.especialidad)})</option>`).join("");
            }
        }
    };

    window.actualizarSelectColegasPorEspecialidad();
    abrirModal("modal-nueva-interconsulta");
}

/**
 * Confirma la creación de la nueva interconsulta desde el modal.
 */
export async function confirmarCrearNuevaInterconsulta() {
    const inputIdTurno = document.getElementById("input-ic-id-turno");
    const inputCodigoTurno = document.getElementById("input-ic-codigo-turno");
    const inputAsunto = document.getElementById("input-ic-asunto");
    const inputMotivo = document.getElementById("input-ic-motivo");
    const selectColega = document.getElementById("input-ic-colega-destino");
    const selectEsp = document.getElementById("input-ic-especialidad-filtro");
    const radioUrgente = document.getElementById("radio-ic-prioridad-urgente");

    const asunto = inputAsunto ? inputAsunto.value.trim() : "";
    const motivo = inputMotivo ? inputMotivo.value.trim() : "";
    const colegaUid = selectColega ? selectColega.value : "";
    const codigoTurno = inputCodigoTurno ? inputCodigoTurno.value.trim() : "SIN_CODIGO";
    const idTurno = inputIdTurno ? inputIdTurno.value.trim() : "";
    const especialidad = selectEsp ? selectEsp.value : "General";
    const prioridad = radioUrgente && radioUrgente.checked ? "urgente" : "normal";

    if (!asunto) {
        mostrarAlerta("Datos Faltantes", "Debe ingresar el asunto de la interconsulta.");
        return;
    }
    if (!motivo) {
        mostrarAlerta("Datos Faltantes", "Debe describir el motivo clínico de la consulta.");
        return;
    }
    if (!colegaUid) {
        mostrarAlerta("Datos Faltantes", "Debe seleccionar al colega médico destinatario.");
        return;
    }

    try {
        const idCreada = await crearInterconsulta({
            idTurno: idTurno || "turno-manual",
            codigoTurno: codigoTurno || "MANUAL",
            asunto: asunto,
            motivo: motivo,
            especialidadDestino: especialidad || "Medicina",
            prioridad: prioridad,
            participanteDestinoUid: colegaUid
        });

        cerrarModal("modal-nueva-interconsulta");
        mostrarExito("Interconsulta Iniciada", "La interconsulta fue creada y notificada al profesional de forma confidencial.");

        // Cambiar a la pestaña de interconsultas y abrirla
        cambiarSubvistaDoctor("interconsultas");
        setTimeout(() => {
            seleccionarInterconsulta(idCreada);
        }, 300);
    } catch (e) {
        console.error("Error al crear interconsulta:", e);
        mostrarAlerta("Error al Crear", e.message || "No se pudo crear la interconsulta.");
    }
}

/**
 * Pide confirmación y cierra una interconsulta activa.
 * @param {string} interconsultaId
 */
export async function confirmarCierreInterconsulta(interconsultaId) {
    if (!interconsultaId) return;

    pedirConfirmacion(
        "Cerrar Interconsulta",
        "¿Confirma que desea cerrar esta interconsulta? La conversación se archivará y no se permitirán nuevos mensajes (podrá consultarse como registro histórico).",
        async () => {
            try {
                await cambiarEstado({
                    interconsultaId: interconsultaId,
                    nuevoEstado: "cerrada"
                });
                mostrarExito("Interconsulta Cerrada", "La interconsulta ha sido archivada satisfactoriamente.");
            } catch (e) {
                mostrarAlerta("Error al Cerrar", e.message || "No se pudo cerrar la interconsulta.");
            }
        }
    );
}

/**
 * Abre el diálogo para incorporar a otro colega médico a la conversación.
 * @param {string} interconsultaId
 */
export async function abrirModalAgregarColega(interconsultaId) {
    if (!interconsultaId) return;

    const ic = interconsultasCargadas.find((x) => x.id === interconsultaId);
    if (!ic) return;

    const colegas = await obtenerColegasMedicosDisponibles();
    const participantesActuales = new Set(ic.participantes || []);
    const disponibles = colegas.filter((c) => !participantesActuales.has(c.uid));

    const select = document.getElementById("select-agregar-colega-uid");
    if (!select) return;

    if (disponibles.length === 0) {
        select.innerHTML = `<option value="">No hay otros profesionales disponibles</option>`;
    } else {
        select.innerHTML = `<option value="">-- Seleccionar colega --</option>` +
            disponibles.map((c) => `<option value="${escaparTexto(c.uid)}">${escaparTexto(c.nombre)} (${escaparTexto(c.especialidad)})</option>`).join("");
    }

    document.getElementById("input-agregar-colega-ic-id").value = interconsultaId;
    abrirModal("modal-agregar-colega-ic");
}

/**
 * Confirma la incorporación del colega médico seleccionado.
 */
export async function confirmarAgregarColega() {
    const icId = document.getElementById("input-agregar-colega-ic-id")?.value;
    const select = document.getElementById("select-agregar-colega-uid");
    const colegaUid = select ? select.value : "";

    if (!icId || !colegaUid) {
        mostrarAlerta("Selección Requerida", "Seleccione un profesional para agregar.");
        return;
    }

    const perfil = await resolverPerfilMedico(colegaUid);

    try {
        await agregarParticipante({
            interconsultaId: icId,
            nuevoColegaUid: colegaUid,
            nombreColega: perfil.nombre
        });

        cerrarModal("modal-agregar-colega-ic");
        mostrarExito("Colega Incorporado", `El Dr./Dra. ${perfil.nombre} fue sumado a la interconsulta.`);
    } catch (e) {
        mostrarAlerta("Error", e.message || "No se pudo agregar al profesional.");
    }
}

/**
 * Cambia la sub-pestaña activa dentro del Consultorio Médico.
 * @param {'atencion'|'interconsultas'} subvista
 */
export function cambiarSubvistaDoctor(subvista) {
    const tabAtencion = document.getElementById("tab-consultorio-atencion");
    const tabInterconsultas = document.getElementById("tab-consultorio-interconsultas");
    const subAtencion = document.getElementById("subvista-doctor-atencion");
    const subInterconsultas = document.getElementById("subvista-doctor-interconsultas");

    if (!tabAtencion || !tabInterconsultas || !subAtencion || !subInterconsultas) return;

    if (subvista === "interconsultas") {
        tabAtencion.className = "px-4 py-2.5 text-xs sm:text-sm font-medium text-slate-600 hover:text-slate-900 border-b-2 border-transparent flex items-center gap-2 transition cursor-pointer";
        tabInterconsultas.className = "px-4 py-2.5 text-xs sm:text-sm font-bold text-emerald-800 border-b-2 border-emerald-700 flex items-center gap-2 transition cursor-pointer";

        subAtencion.classList.add("hidden");
        subInterconsultas.classList.remove("hidden");

        inicializarModuloInterconsultas();
    } else {
        tabAtencion.className = "px-4 py-2.5 text-xs sm:text-sm font-bold text-emerald-800 border-b-2 border-emerald-700 flex items-center gap-2 transition cursor-pointer";
        tabInterconsultas.className = "px-4 py-2.5 text-xs sm:text-sm font-medium text-slate-600 hover:text-slate-900 border-b-2 border-transparent flex items-center gap-2 transition cursor-pointer";

        subInterconsultas.classList.add("hidden");
        subAtencion.classList.remove("hidden");
    }
}

// Filtros de estado por chips
export function establecerFiltroEstadoInterconsultas(estado) {
    filtroEstadoActual = estado;

    const botones = {
        todos: document.getElementById("btn-filtro-ic-todos"),
        pendiente: document.getElementById("btn-filtro-ic-pendiente"),
        en_curso: document.getElementById("btn-filtro-ic-en_curso"),
        respondida: document.getElementById("btn-filtro-ic-respondida"),
        cerrada: document.getElementById("btn-filtro-ic-cerrada")
    };

    Object.entries(botones).forEach(([k, btn]) => {
        if (!btn) return;
        if (k === estado) {
            btn.className = "px-2.5 py-1 text-[11px] font-bold rounded bg-emerald-800 text-white shadow-xs transition";
        } else {
            btn.className = "px-2.5 py-1 text-[11px] font-medium rounded bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 transition";
        }
    });

    renderizarListaInterconsultas();
}

// Escuchadores de eventos para input de búsqueda y redacción
export function vincularEventosDOMInterconsultas() {
    const inputBusqueda = document.getElementById("input-buscar-interconsultas");
    if (inputBusqueda) {
        inputBusqueda.addEventListener("input", (e) => {
            busquedaTextoActual = e.target.value;
            renderizarListaInterconsultas();
        });
    }

    const inputMsg = document.getElementById("interconsulta-input-mensaje");
    if (inputMsg) {
        inputMsg.addEventListener("input", actualizarContadorCaracteresMensaje);
        inputMsg.addEventListener("keydown", (e) => {
            // Enter envía, Shift+Enter inserta salto de línea
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                enviarMensajeInterconsultaActual();
            }
        });
    }

    // Exponer funciones globales a window para onclick en HTML
    window.cambiarSubvistaDoctor = cambiarSubvistaDoctor;
    window.seleccionarInterconsulta = seleccionarInterconsulta;
    window.volverAListaInterconsultasMovil = volverAListaInterconsultasMovil;
    window.enviarMensajeInterconsultaActual = enviarMensajeInterconsultaActual;
    window.abrirModalNuevaInterconsultaDesdePaciente = abrirModalNuevaInterconsultaDesdePaciente;
    window.abrirModalCrearInterconsulta = abrirModalCrearInterconsulta;
    window.confirmarCrearNuevaInterconsulta = confirmarCrearNuevaInterconsulta;
    window.confirmarCierreInterconsulta = confirmarCierreInterconsulta;
    window.abrirModalAgregarColega = abrirModalAgregarColega;
    window.confirmarAgregarColega = confirmarAgregarColega;
    window.establecerFiltroEstadoInterconsultas = establecerFiltroEstadoInterconsultas;
    window.inicializarModuloInterconsultas = inicializarModuloInterconsultas;
    window.desmontarModuloInterconsultas = desmontarModuloInterconsultas;
}

// Asignación síncrona inmediata en window apenas evalúa el script modular
if (typeof window !== "undefined") {
    window.cambiarSubvistaDoctor = cambiarSubvistaDoctor;
    window.seleccionarInterconsulta = seleccionarInterconsulta;
    window.volverAListaInterconsultasMovil = volverAListaInterconsultasMovil;
    window.enviarMensajeInterconsultaActual = enviarMensajeInterconsultaActual;
    window.abrirModalNuevaInterconsultaDesdePaciente = abrirModalNuevaInterconsultaDesdePaciente;
    window.abrirModalCrearInterconsulta = abrirModalCrearInterconsulta;
    window.confirmarCrearNuevaInterconsulta = confirmarCrearNuevaInterconsulta;
    window.confirmarCierreInterconsulta = confirmarCierreInterconsulta;
    window.abrirModalAgregarColega = abrirModalAgregarColega;
    window.confirmarAgregarColega = confirmarAgregarColega;
    window.establecerFiltroEstadoInterconsultas = establecerFiltroEstadoInterconsultas;
    window.inicializarModuloInterconsultas = inicializarModuloInterconsultas;
    window.desmontarModuloInterconsultas = desmontarModuloInterconsultas;
}

if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", vincularEventosDOMInterconsultas);
    } else {
        vincularEventosDOMInterconsultas();
    }
}
