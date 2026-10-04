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

// Exponer en window para manejadores inline del DOM
window.abrirModal = abrirModal;
window.cerrarModal = cerrarModal;
window.validarDiaHabil = validarDiaHabil;
