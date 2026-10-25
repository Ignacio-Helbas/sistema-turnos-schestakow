// ==========================================
// CONTROL DE CONCURRENCIA Y ANTI DOBLE ENVÍO
// js/guardia.js
// ==========================================

const clavesEnEjecucion = new Set();

/**
 * Ejecuta una función una sola vez por clave activa, evitando dobles envíos y
 * llamadas concurrentes repetidas. No accede a objetos globales del DOM (window/document).
 *
 * @param {string} clave Identificador único de la operación.
 * @param {Function} fn Función a ejecutar (sincrónica o asíncrona).
 * @param {Object} [opciones]
 * @param {HTMLElement|Object} [opciones.boton] Elemento de botón a deshabilitar durante la ejecución.
 * @returns {Promise<*>} Retorna el resultado de la función o undefined si la clave ya está en uso.
 */
export async function ejecutarUnaVez(clave, fn, opciones = {}) {
    if (!clave || typeof fn !== 'function') {
        return undefined;
    }

    if (clavesEnEjecucion.has(clave)) {
        return undefined;
    }

    clavesEnEjecucion.add(clave);

    const boton = opciones && typeof opciones === 'object' ? opciones.boton : null;

    if (boton && typeof boton === 'object') {
        boton.disabled = true;
        if (typeof boton.setAttribute === 'function') {
            boton.setAttribute('aria-busy', 'true');
        }
    }

    try {
        return await fn();
    } finally {
        clavesEnEjecucion.delete(clave);
        if (boton && typeof boton === 'object') {
            boton.disabled = false;
            if (typeof boton.removeAttribute === 'function') {
                boton.removeAttribute('aria-busy');
            }
        }
    }
}
