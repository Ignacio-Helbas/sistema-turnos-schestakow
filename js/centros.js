// =============================================================================
// DIRECTORIO DE CENTROS DE SALUD, CAPS Y AMBULATORIOS DE SAN RAFAEL
// Hospital Schestakow y Red Sanitaria Departamental
// =============================================================================

import { CENTROS_SALUD } from './centros-data.js';

let filtroZonaActual = 'todos'; // 'todos' | 'ciudad' | 'distritos'
let busquedaTextoActual = '';

/**
 * Sanitiza un número telefónico para usar de forma segura en atributos tel:
 * Elimina espacios, guiones, barras y paréntesis, conservando el prefijo internacional (+).
 * @param {string|null} telefono
 * @returns {string|null}
 */
export function sanitizarTelefono(telefono) {
    if (!telefono || typeof telefono !== 'string') return null;
    const limpio = telefono.trim().replace(/[^\d+]/g, '');
    return limpio.length >= 6 ? limpio : null;
}

/**
 * Escapa caracteres HTML para evitar inyección XSS en textos dinámicos.
 * @param {string} str
 * @returns {string}
 */
export function escaparHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Filtra el listado de centros de salud según zona geográfica y texto de búsqueda.
 * @param {Array} centros
 * @param {string} filtroZona 'todos' | 'ciudad' | 'distritos'
 * @param {string} busquedaTexto
 * @returns {Array}
 */
export function filtrarCentros(centros, filtroZona = 'todos', busquedaTexto = '') {
    if (!Array.isArray(centros)) return [];
    const q = (busquedaTexto || '').toLowerCase().trim();

    return centros.filter((centro) => {
        // 1. Filtro por Zona
        if (filtroZona === 'ciudad') {
            const z = (centro.zona || '').toLowerCase();
            const esCiudad = z.includes('ciudad') || z.includes('barrio');
            if (!esCiudad) return false;
        } else if (filtroZona === 'distritos') {
            const z = (centro.zona || '').toLowerCase();
            const esDistrito = z.includes('distrito');
            if (!esDistrito) return false;
        }

        // 2. Filtro por Búsqueda de texto libre
        if (q) {
            const nombre = (centro.nombre || '').toLowerCase();
            const direccion = (centro.direccion || '').toLowerCase();
            const tipo = (centro.tipo || '').toLowerCase();
            const capsNro = centro.caps_nro ? String(centro.caps_nro) : '';
            const coincide =
                nombre.includes(q) ||
                direccion.includes(q) ||
                tipo.includes(q) ||
                capsNro.includes(q);
            if (!coincide) return false;
        }

        return true;
    });
}

/**
 * Prepara el iframe de Google Maps agregando atributos de accesibilidad,
 * estilo responsivo y carga diferida (lazy loading).
 * @param {string} mapEmbedHtml
 * @returns {string}
 */
export function formatearIframeEmbed(mapEmbedHtml) {
    if (!mapEmbedHtml || typeof mapEmbedHtml !== 'string') {
        return '<div class="w-full h-[200px] bg-slate-100 flex items-center justify-center text-xs text-slate-400">Mapa no disponible</div>';
    }
    // Asegurar loading='lazy', estilo al 100% y alto adecuado
    let embed = mapEmbedHtml;
    if (!embed.includes('loading=')) {
        embed = embed.replace('<iframe', '<iframe loading="lazy"');
    }
    if (!embed.includes('title=')) {
        embed = embed.replace('<iframe', '<iframe title="Mapa de ubicación en Google Maps"');
    }
    // Asegurar clase responsiva
    embed = embed.replace('<iframe', '<iframe class="w-full h-[200px] rounded border border-slate-200"');
    return embed;
}

/**
 * Genera el markup HTML de una tarjeta (card) para un centro de salud.
 * @param {Object} centro
 * @returns {string}
 */
export function crearTarjetaCentroHTML(centro) {
    const nombre = escaparHTML(centro.nombre || 'Centro de Salud');
    const tipo = escaparHTML(centro.tipo || 'Atención Primaria');
    const zona = escaparHTML(centro.zona || 'San Rafael');
    const direccion = escaparHTML(centro.direccion || 'Dirección no especificada');
    const mapUrl = centro.map_url ? escaparHTML(centro.map_url) : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(centro.direccion || centro.nombre)}`;
    const telLimpio = sanitizarTelefono(centro.telefono);

    const capsBadge = (centro.caps_nro !== null && centro.caps_nro !== undefined)
        ? `<span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-[#002845] text-white tracking-wide">CAPS N° ${escaparHTML(centro.caps_nro)}</span>`
        : `<span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">Coordinación</span>`;

    const telefonoHtml = telLimpio
        ? `<a href="tel:${telLimpio}" class="inline-flex items-center gap-1.5 text-xs font-semibold text-[#007a78] hover:text-[#005f5d] hover:underline focus:outline-none focus:ring-1 focus:ring-[#007a78] rounded p-0.5" title="Llamar directamente al centro de salud">
             <svg class="w-3.5 h-3.5 shrink-0 text-[#007a78]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path></svg>
             <span>${escaparHTML(centro.telefono)}</span>
           </a>`
        : `<span class="inline-flex items-center gap-1.5 text-xs text-slate-400 italic">
             <svg class="w-3.5 h-3.5 shrink-0 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"></path></svg>
             <span>Sin teléfono registrado</span>
           </span>`;

    const webHtml = (centro.web && typeof centro.web === 'string' && centro.web.trim().length > 0)
        ? `<a href="${escaparHTML(centro.web)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 text-[11px] text-blue-700 hover:underline">
             <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"></path></svg>
             <span>Sitio Web</span>
           </a>`
        : '';

    const mapaEmbedHtml = formatearIframeEmbed(centro.map_embed);

    return `
    <article class="card-his bg-white/95 backdrop-blur-sm rounded-lg border border-slate-200 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between overflow-hidden">
        <!-- Cabecera de la Tarjeta -->
        <div class="p-4 sm:p-5 flex-grow">
            <!-- Badges Superiores -->
            <div class="flex flex-wrap items-center justify-between gap-1.5 mb-2.5">
                <div class="flex items-center gap-1.5 flex-wrap">
                    ${capsBadge}
                    <span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-[#e6f5f4] text-[#007a78] border border-[#a7f3d0]">
                        ${tipo}
                    </span>
                </div>
                <span class="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    ${zona}
                </span>
            </div>

            <!-- Título del Centro -->
            <h3 class="text-sm sm:text-base font-bold text-[#002845] leading-snug mb-3">
                ${nombre}
            </h3>

            <!-- Datos de Contacto y Ubicación -->
            <div class="space-y-2 text-xs text-slate-700 mb-4">
                <div class="flex items-start gap-2">
                    <svg class="w-4 h-4 text-slate-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                    <span class="leading-relaxed">${direccion}</span>
                </div>

                <div class="flex items-center justify-between gap-2 pt-1 border-t border-slate-100">
                    <div class="flex items-center gap-1.5">
                        ${telefonoHtml}
                    </div>
                    ${webHtml}
                </div>
            </div>

            <!-- Iframe de Google Maps Embebido -->
            <div class="mt-2 mb-3 overflow-hidden rounded border border-slate-200 bg-slate-50">
                ${mapaEmbedHtml}
            </div>
        </div>

        <!-- Pie de la Tarjeta con Botón a Google Maps -->
        <div class="p-3 sm:px-5 bg-slate-50/80 border-t border-slate-200">
            <a href="${mapUrl}" target="_blank" rel="noopener noreferrer" class="btn-his-secondary w-full py-2 px-3 text-xs justify-center font-semibold hover:border-[#002845] hover:text-[#002845] shadow-xs">
                <svg class="w-4 h-4 text-red-600 shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
                <span>Abrir en Google Maps</span>
                <svg class="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
            </a>
        </div>
    </article>
    `;
}

/**
 * Renderiza el listado de tarjetas en el contenedor correspondiente.
 */
export function renderizarCentros() {
    const contenedor = document.getElementById('grid-centros-salud');
    const contador = document.getElementById('contador-centros-salud');
    if (!contenedor) return;

    const filtrados = filtrarCentros(CENTROS_SALUD, filtroZonaActual, busquedaTextoActual);

    if (contador) {
        const total = CENTROS_SALUD.length;
        contador.innerText = `Mostrando ${filtrados.length} de ${total} centros`;
    }

    if (filtrados.length === 0) {
        contenedor.innerHTML = `
            <div class="col-span-full py-12 px-4 text-center bg-white/90 rounded-lg border border-slate-200 card-his">
                <svg class="w-12 h-12 text-slate-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                <h4 class="text-sm font-bold text-slate-800 mb-1">No se encontraron centros de salud</h4>
                <p class="text-xs text-slate-500 max-w-sm mx-auto mb-4">No hay resultados que coincidan con los filtros o el texto ingresado.</p>
                <button type="button" onclick="window.limpiarFiltrosCentros()" class="btn-his-secondary text-xs py-1.5 px-3">
                    Restablecer filtros de búsqueda
                </button>
            </div>
        `;
        return;
    }

    contenedor.innerHTML = filtrados.map((centro) => crearTarjetaCentroHTML(centro)).join('');
}

/**
 * Aplica el filtro de zona seleccionado y actualiza las clases activas en los botones.
 * @param {string} zona 'todos' | 'ciudad' | 'distritos'
 */
export function establecerFiltroZona(zona) {
    filtroZonaActual = zona;

    const botones = {
        todos: document.getElementById('btn-filtro-todos'),
        ciudad: document.getElementById('btn-filtro-ciudad'),
        distritos: document.getElementById('btn-filtro-distritos')
    };

    Object.entries(botones).forEach(([clave, btn]) => {
        if (!btn) return;
        if (clave === zona) {
            btn.className = 'px-3 py-1.5 text-xs font-semibold rounded bg-[#002845] text-white shadow-xs transition';
        } else {
            btn.className = 'px-3 py-1.5 text-xs font-medium rounded bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 transition';
        }
    });

    renderizarCentros();
}

/**
 * Limpia todos los filtros y restaura la vista inicial de centros.
 */
export function limpiarFiltrosCentros() {
    filtroZonaActual = 'todos';
    busquedaTextoActual = '';
    const inputBusqueda = document.getElementById('input-busqueda-centros');
    if (inputBusqueda) {
        inputBusqueda.value = '';
    }
    establecerFiltroZona('todos');
}

/**
 * Alterna entre la vista pública de reserva de turnos y la del directorio de centros de salud.
 * @param {'turnos'|'centros'} vista
 */
export function cambiarVistaPublica(vista) {
    const viewPublic = document.getElementById('view-public');
    const viewCentros = document.getElementById('view-centros-salud');
    const tabTurnos = document.getElementById('tab-nav-turnos');
    const tabCentros = document.getElementById('tab-nav-centros');

    if (!viewPublic || !viewCentros) return;

    if (vista === 'centros') {
        viewPublic.classList.add('hidden');
        viewPublic.classList.remove('active');
        viewCentros.classList.remove('hidden');
        viewCentros.classList.add('active');

        if (tabTurnos && tabCentros) {
            tabTurnos.className = 'px-3 py-1.5 text-xs sm:text-sm font-medium text-slate-600 hover:text-slate-900 border-b-2 border-transparent transition';
            tabCentros.className = 'px-3 py-1.5 text-xs sm:text-sm font-bold text-[#002845] border-b-2 border-[#002845] transition';
        }

        renderizarCentros();
        try {
            history.replaceState(null, '', '#centros');
        } catch (_) {}
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
        // 'turnos' por defecto
        viewCentros.classList.add('hidden');
        viewCentros.classList.remove('active');
        viewPublic.classList.remove('hidden');
        viewPublic.classList.add('active');

        if (tabTurnos && tabCentros) {
            tabTurnos.className = 'px-3 py-1.5 text-xs sm:text-sm font-bold text-[#002845] border-b-2 border-[#002845] transition';
            tabCentros.className = 'px-3 py-1.5 text-xs sm:text-sm font-medium text-slate-600 hover:text-slate-900 border-b-2 border-transparent transition';
        }

        try {
            history.replaceState(null, '', '#turnos');
        } catch (_) {}
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

// Inicialización de escuchadores una vez cargado el DOM
export function inicializarModuloCentros() {
    const inputBusqueda = document.getElementById('input-busqueda-centros');
    if (inputBusqueda) {
        inputBusqueda.addEventListener('input', (e) => {
            busquedaTextoActual = e.target.value;
            renderizarCentros();
        });
    }

    // Exponer a window para interacción directa en onclick
    window.cambiarVistaPublica = cambiarVistaPublica;
    window.establecerFiltroZona = establecerFiltroZona;
    window.limpiarFiltrosCentros = limpiarFiltrosCentros;
    window.renderizarCentros = renderizarCentros;

    // Detectar hash inicial (#centros)
    if (window.location.hash === '#centros') {
        cambiarVistaPublica('centros');
    } else {
        renderizarCentros();
    }
}

if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', inicializarModuloCentros);
    } else {
        inicializarModuloCentros();
    }
}
