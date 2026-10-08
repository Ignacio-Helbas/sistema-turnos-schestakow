// ==========================================
// UTILIDADES COMPARTIDAS DE UI (MODALES, ALERTAS, EMAILJS, FORMATOS)
// Módulo ui.js
// ==========================================

const EMAILJS_PUBLIC_KEY = "eXBPLCSkZcKDBBz9h"; 
const EMAILJS_SERVICE_ID = "service_xitx594"; 
export const EMAILJS_TEMPLATE_CONFIRMACION = "template_confirmacion"; 
export const EMAILJS_TEMPLATE_CANCELACION = "template_cancelacion"; 

try {
    if (typeof emailjs !== 'undefined' && EMAILJS_PUBLIC_KEY) {
        emailjs.init(EMAILJS_PUBLIC_KEY);
    }
} catch (e) {
    console.warn("Librería EmailJS no detectada.");
}

export function enviarCorreoNotificacion(templateId, templateParams) {
    if (!templateParams.email_destino || typeof emailjs === 'undefined') return;
    emailjs.send(EMAILJS_SERVICE_ID, templateId, templateParams).catch(e => console.error("EmailJS Error:", e));
}

export function escaparHTML(texto) {
    if (texto === null || texto === undefined) return '';
    return String(texto)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function abrirModal(id) { 
    const modal = document.getElementById(id);
    if (modal) modal.classList.add('active'); 
}

export function cerrarModal(id) { 
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('active'); 
    
    if (id === 'modal-cancelar-paciente') { 
        const inputDni = document.getElementById('input-buscar-dni');
        const inputCod = document.getElementById('input-buscar-codigo');
        const resTurnos = document.getElementById('resultado-turnos-paciente');
        if (inputDni) inputDni.value = ''; 
        if (inputCod) inputCod.value = ''; 
        if (resTurnos) {
            resTurnos.innerHTML = ''; 
            resTurnos.classList.add('hidden');
        }
    } 
    if (id === 'modal-ausencia-emergencia') { 
        const mot = document.getElementById('motivo-ausencia');
        const hora = document.getElementById('hora-desde-ausencia');
        if (mot) mot.value = ''; 
        if (hora) hora.value = ''; 
    } 
}

export function mostrarAlerta(titulo, mensaje) { 
    const t = document.getElementById('alerta-titulo');
    const m = document.getElementById('alerta-mensaje');
    if (t) t.innerText = titulo; 
    if (m) m.innerText = mensaje; 
    abrirModal('modal-alerta'); 
}

export function mostrarExito(titulo, mensaje) { 
    const t = document.getElementById('exito-titulo');
    const m = document.getElementById('exito-mensaje');
    if (t) t.innerText = titulo; 
    if (m) m.innerText = mensaje; 
    abrirModal('modal-exito'); 
}

export function pedirConfirmacion(titulo, mensaje, textoBoton = "Aceptar") {
    return new Promise((resolve) => {
        const t = document.getElementById('confirm-titulo');
        const m = document.getElementById('confirm-mensaje');
        const btnOk = document.getElementById('btn-confirm-aceptar');
        const btnCancel = document.getElementById('btn-confirm-cancelar');

        if (t) t.innerText = titulo;
        if (m) m.innerText = mensaje;
        if (btnOk) btnOk.innerText = textoBoton;

        const limpiar = () => {
            if (btnOk) btnOk.onclick = null;
            if (btnCancel) btnCancel.onclick = null;
            cerrarModal('modal-confirmacion');
        };

        if (btnOk) {
            btnOk.onclick = () => {
                limpiar();
                resolve(true);
            };
        }
        if (btnCancel) {
            btnCancel.onclick = () => {
                limpiar();
                resolve(false);
            };
        }

        abrirModal('modal-confirmacion');
    });
}

export function validarDiaHabil(inputElement) {
    if (!inputElement || !inputElement.value) return;
    const fecha = new Date(inputElement.value + 'T00:00:00');
    const dia = fecha.getDay(); 
    if (dia === 0 || dia === 6) { 
        mostrarAlerta("Día No Laborable", "El hospital atiende de Lunes a Viernes. Seleccione un día hábil.");
        inputElement.value = '';
        if (window.calendarioHospitalario) window.calendarioHospitalario.deseleccionar();
        return;
    }

    if (window.calendarioHospitalario && typeof window.calendarioHospitalario.obtenerFeriado === 'function') {
        const feriado = window.calendarioHospitalario.obtenerFeriado(inputElement.value);
        if (feriado) {
            mostrarAlerta("Feriado Nacional", `La fecha seleccionada corresponde a un feriado nacional (${feriado}). Los consultorios externos permanecen cerrados; sólo funciona la Guardia de Emergencias.`);
            inputElement.value = '';
            window.calendarioHospitalario.deseleccionar();
        }
    }
}

export function establecerLimitesFecha(inputIds = ['input-fecha-paciente', 'input-fecha-recepcion']) {
    const hoy = new Date();
    const fechaMinima = hoy.toISOString().split('T')[0];
    inputIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.min = fechaMinima;
    });
}

/**
 * Formatea una fecha a formato institucional argentino dd/mm/aaaa
 * Soporta cadenas YYYY-MM-DD, objetos Date y Timestamps de Firestore
 */
export function formatearFechaAR(fechaVal) {
    if (!fechaVal) return '';
    if (fechaVal instanceof Date) {
        if (isNaN(fechaVal.getTime())) return '';
        const d = String(fechaVal.getDate()).padStart(2, '0');
        const m = String(fechaVal.getMonth() + 1).padStart(2, '0');
        const a = fechaVal.getFullYear();
        return `${d}/${m}/${a}`;
    }
    if (typeof fechaVal === 'object' && typeof fechaVal.toDate === 'function') {
        const dObj = fechaVal.toDate();
        const d = String(dObj.getDate()).padStart(2, '0');
        const m = String(dObj.getMonth() + 1).padStart(2, '0');
        const a = dObj.getFullYear();
        return `${d}/${m}/${a}`;
    }
    const str = String(fechaVal).trim();
    const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
        return `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
    }
    return str;
}

/**
 * Normaliza horarios agregando sufijo institucional "hs" (ej: "08:30 hs")
 */
export function formatearHoraAR(horaVal) {
    if (!horaVal) return '';
    const str = String(horaVal).trim();
    if (str.toLowerCase().endsWith('hs')) return str;
    return `${str} hs`;
}

/**
 * Notificación Toast flotante, accesible y discreta para operaciones rutinarias
 */
export function mostrarToast(mensaje, tipo = 'info', duracionMs = 3500) {
    if (typeof document === 'undefined') return;
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.setAttribute('aria-live', 'polite');
        container.setAttribute('aria-atomic', 'true');
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast-his toast-his-${tipo}`;
    toast.setAttribute('role', 'status');

    let iconoSvg = '';
    if (tipo === 'success') {
        iconoSvg = `<svg class="w-4 h-4 text-teal-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>`;
    } else if (tipo === 'error') {
        iconoSvg = `<svg class="w-4 h-4 text-red-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`;
    } else if (tipo === 'warning') {
        iconoSvg = `<svg class="w-4 h-4 text-amber-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>`;
    } else {
        iconoSvg = `<svg class="w-4 h-4 text-[#002845] shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`;
    }

    toast.innerHTML = `
        ${iconoSvg}
        <div class="flex-1 font-medium text-slate-800 text-xs">${escaparHTML(mensaje)}</div>
        <button type="button" aria-label="Cerrar notificación" class="text-slate-400 hover:text-slate-700 ml-1 text-sm leading-none font-bold">&times;</button>
    `;

    const closeBtn = toast.querySelector('button');
    const remover = () => {
        toast.classList.add('toast-salida');
        setTimeout(() => {
            if (toast.parentElement) toast.remove();
        }, 220);
    };
    if (closeBtn) closeBtn.onclick = remover;

    container.appendChild(toast);

    setTimeout(() => {
        remover();
    }, duracionMs);
}

// Exponer en window para manejadores inline del DOM
if (typeof window !== 'undefined') {
    window.abrirModal = abrirModal;
    window.cerrarModal = cerrarModal;
    window.validarDiaHabil = validarDiaHabil;
    window.mostrarAlerta = mostrarAlerta;
    window.mostrarExito = mostrarExito;
    window.pedirConfirmacion = pedirConfirmacion;
    window.formatearFechaAR = formatearFechaAR;
    window.formatearHoraAR = formatearHoraAR;
    window.mostrarToast = mostrarToast;
}
