// ==========================================
// MÓDULO PANEL (ORQUESTADOR DE VISTAS Y STAFF)
// js/panel.js
// ==========================================

import {
    db,
    collection,
    query,
    where,
    getDocs,
    doc,
    getDoc,
    writeBatch
} from "./firebase.js";

import {
    mostrarAlerta,
    escaparHTML,
    establecerLimitesFecha
} from "./ui.js";

import {
    inicializarAuth,
    obtenerSesionActual,
    mostrarPantallaLogin
} from "./auth.js";

import {
    setCatalogosRecepcion,
    actualizarMedicosRecepcion,
    generarAgendaRecepcion,
    obtenerEstadoRecepcion
} from "./recepcion.js";

import {
    setCatalogosConsultorio,
    cargarAgendaMedico,
    inicializarEventosHC
} from "./consultorio.js";

import {
    cargarUsuariosAdmin,
    verificarLimpiezaAnual,
    verificarEntornoDemo,
    cargarMetricas,
    cargarAuditoriaAdmin
} from "./admin.js";

// Estado de catálogo compartido para el personal
let bdMedicosDinamica = {};
let duracionTurnoGlobal = 15;
let modulacionPorMedico = {};

export function obtenerCatalogosStaff() {
    return {
        bdMedicosDinamica,
        duracionTurnoGlobal,
        modulacionPorMedico
    };
}

export async function iniciarModuloStaff() {
    establecerLimitesFecha(['input-fecha-recepcion']);
    await cargarEspecialistasFirebase();
    await cargarConfiguracionModulacion();
}

export async function cargarEspecialistasFirebase() {
    try {
        let snap;
        try {
            snap = await getDocs(query(collection(db, "medicos_publicos"), where("activo", "==", true)));
        } catch (_) {
            snap = null;
        }
        if (!snap || snap.empty) {
            try {
                snap = await getDocs(query(collection(db, "usuarios"), where("rol", "==", "Médico")));
            } catch (_) {}
        }
        bdMedicosDinamica = {};
        const selectAlcance = document.getElementById('admin-select-alcance');
        if (selectAlcance) selectAlcance.innerHTML = '<option value="global">Todas las especialidades (Global)</option>';

        if (snap && !snap.empty) {
            snap.forEach((documento) => {
                const u = documento.data();
                const uid = u.medicoUid || documento.id;
                if (u.especialidad && u.nombre && u.activo !== false) {
                    if (!bdMedicosDinamica[u.especialidad]) bdMedicosDinamica[u.especialidad] = [];
                    const yaEsta = bdMedicosDinamica[u.especialidad].some(m => m.uid === uid);
                    if (!yaEsta) {
                        bdMedicosDinamica[u.especialidad].push({ uid: uid, nombre: u.nombre });
                        if (selectAlcance) selectAlcance.innerHTML += `<option value="${escaparHTML(u.nombre)}">Solo: ${escaparHTML(u.nombre)}</option>`;
                    }
                }
            });
        }

        const selectEspRec = document.getElementById('reception-especialidad');
        if (selectEspRec) {
            let opts = '<option value="">-- Elija especialidad --</option>';
            for (const esp of Object.keys(bdMedicosDinamica)) {
                opts += `<option value="${escaparHTML(esp)}">${escaparHTML(esp)}</option>`;
            }
            selectEspRec.innerHTML = opts;
        }

        // Sincronizar catálogo con los módulos de Recepción y Consultorio
        setCatalogosRecepcion({ bdMedicos: bdMedicosDinamica, duracionGlobal: duracionTurnoGlobal, modulacion: modulacionPorMedico });
        setCatalogosConsultorio({ bdMedicos: bdMedicosDinamica, duracionGlobal: duracionTurnoGlobal, modulacion: modulacionPorMedico });

    } catch (e) {
        console.warn("Error cargando especialistas:", e);
    }
}

export async function sincronizarMedicosPublicos() {
    try {
        const snap = await getDocs(query(collection(db, "usuarios"), where("rol", "==", "Médico")));
        const batch = writeBatch(db);
        let count = 0;
        snap.forEach(d => {
            const u = d.data();
            if (u.activo !== false && u.nombre && u.especialidad) {
                const pubRef = doc(db, "medicos_publicos", d.id);
                batch.set(pubRef, {
                    medicoUid: d.id,
                    nombre: u.nombre,
                    especialidad: u.especialidad,
                    activo: true
                });
                count++;
            }
        });
        if (count > 0) {
            await batch.commit();
        }
    } catch (e) {
        console.warn("Sincronización de médicos públicos omitida:", e);
    }
}

export async function cargarConfiguracionModulacion() {
    try {
        const snapGlobal = await getDoc(doc(db, "configuracion", "general"));
        if (snapGlobal.exists()) {
            duracionTurnoGlobal = snapGlobal.data().duracionBase || 15;
            const selectAdmin = document.getElementById('admin-select-duracion');
            if (selectAdmin && document.getElementById('admin-select-alcance').value === 'global') {
                selectAdmin.value = duracionTurnoGlobal;
            }
        }
        const snapIndividual = await getDocs(collection(db, "modulacion_medicos"));
        modulacionPorMedico = {};
        snapIndividual.forEach(d => { modulacionPorMedico[d.id] = d.data().duracionBase; });

        setCatalogosRecepcion({ bdMedicos: bdMedicosDinamica, duracionGlobal: duracionTurnoGlobal, modulacion: modulacionPorMedico });
        setCatalogosConsultorio({ bdMedicos: bdMedicosDinamica, duracionGlobal: duracionTurnoGlobal, modulacion: modulacionPorMedico });
    } catch (e) {
        console.log("Configuración por defecto cargada.");
    }
}

export function aplicarPermisosVisuales(sesion) {
    const btnAdmin = document.getElementById('btn-nav-admin');
    const btnRec = document.getElementById('btn-nav-reception');
    const btnDoc = document.getElementById('btn-nav-doctor');
    const btnLogout = document.getElementById('btn-logout');
    const btnDummies = document.getElementById('btn-cargar-dummies');
    const btnReset = document.getElementById('btn-reset-db');
    const btnDemoForo = document.getElementById('btn-demo-foro');

    const usuarioSesionInfo = document.getElementById('usuario-sesion-info');
    const usuarioSesionNombre = document.getElementById('usuario-sesion-nombre');
    const usuarioSesionRol = document.getElementById('usuario-sesion-rol');

    if (btnAdmin) btnAdmin.classList.add('hidden');
    if (btnRec) btnRec.classList.add('hidden');
    if (btnDoc) btnDoc.classList.add('hidden');
    if (btnDummies) btnDummies.classList.add('hidden');
    if (btnReset) btnReset.classList.add('hidden');
    if (btnDemoForo) btnDemoForo.classList.add('hidden');

    const barraSuperadmin = document.getElementById('barra-superadmin-controles');
    if (barraSuperadmin) barraSuperadmin.classList.add('hidden');

    if (btnLogout) {
        btnLogout.classList.remove('hidden');
        btnLogout.innerText = `Cerrar Sesión (${sesion.nombre || sesion.correo})`;
    }

    const esNacho = (sesion.correo && sesion.correo.toLowerCase() === "nachohelbas@gmail.com");
    const rolMostrar = esNacho ? 'Superadmin' : (sesion.rol || 'Personal');

    if (usuarioSesionInfo) usuarioSesionInfo.classList.remove('hidden');
    if (usuarioSesionNombre) usuarioSesionNombre.textContent = sesion.nombre || sesion.correo || 'Usuario Staff';
    if (usuarioSesionRol) {
        usuarioSesionRol.textContent = rolMostrar;
        usuarioSesionRol.className = 'badge-his ' + (sesion.rol === 'Médico' ? 'badge-his-atendido' : (sesion.rol === 'Administración' || esNacho ? 'badge-his-admin' : 'badge-his-pendiente'));
    }

    const params = new URLSearchParams(window.location.search);
    const esModoDev = params.get('dev') === '1';

    if (esNacho) {
        if (btnAdmin) btnAdmin.classList.remove('hidden');
        if (btnRec) btnRec.classList.remove('hidden');
        if (btnDoc) btnDoc.classList.remove('hidden');
        if (btnDummies) btnDummies.classList.remove('hidden');
        if (btnDemoForo) btnDemoForo.classList.remove('hidden');
        if (btnReset) btnReset.classList.remove('hidden');
        if (barraSuperadmin) barraSuperadmin.classList.remove('hidden');

        sincronizarMedicosPublicos();
        switchView('admin');
    } else if (sesion.rol === "Administración") {
        if (btnAdmin) btnAdmin.classList.remove('hidden');
        if (esModoDev) {
            if (btnDummies) btnDummies.classList.remove('hidden');
            if (btnDemoForo) btnDemoForo.classList.remove('hidden');
            if (btnReset) btnReset.classList.remove('hidden');
            if (barraSuperadmin) barraSuperadmin.classList.remove('hidden');
        }

        sincronizarMedicosPublicos();
        switchView('admin');
    } else if (sesion.rol === "Médico") {
        if (btnDoc) btnDoc.classList.remove('hidden');
        switchView('doctor');
    } else {
        if (btnRec) btnRec.classList.remove('hidden');
        switchView('reception');
    }
}

export function switchView(viewName) {
    if (viewName !== 'login') {
        const sesionActual = obtenerSesionActual();
        if (!sesionActual || sessionStorage.getItem('hospital_sesion_activa') !== 'true') {
            mostrarPantallaLogin();
            return;
        }

        const esNacho = (sesionActual.correo && sesionActual.correo.toLowerCase() === "nachohelbas@gmail.com");
        const rol = sesionActual.rol;

        let permitido = false;
        if (esNacho) {
            permitido = true;
        } else if (viewName === 'admin' && rol === "Administración") {
            permitido = true;
        } else if (viewName === 'doctor' && rol === "Médico") {
            permitido = true;
        } else if (viewName === 'reception' && (rol === "Recepción" || rol === "Recepcionista" || rol === "Administrativo")) {
            permitido = true;
        }

        if (!permitido) {
            mostrarAlerta("Acceso No Autorizado", `Su rol actual (${rol || 'Sin Rol'}) no tiene permisos para acceder a esta vista.`);
            return;
        }
    }

    document.body.dataset.view = viewName;
    document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
    const target = document.getElementById('view-' + viewName);
    if (target) target.classList.add('active');

    // Breadcrumbs
    const breadcrumbView = document.getElementById('breadcrumb-current-view');
    if (breadcrumbView) {
        const nombresVistas = {
            'reception': 'Recepción y Admisión',
            'doctor': 'Consultorio Médico',
            'admin': 'Administración Institucional',
            'login': 'Identificación del Personal'
        };
        breadcrumbView.textContent = nombresVistas[viewName] || viewName;
    }

    // Actualizar estilo activo de los botones de navegación del personal
    ['reception', 'doctor', 'admin'].forEach(v => {
        const btn = document.getElementById(`btn-nav-${v}`);
        if (btn) {
            if (v === viewName) {
                btn.classList.add('text-blue-900', 'font-black', 'border-b-2', 'border-blue-900');
                btn.classList.remove('text-slate-600');
            } else {
                btn.classList.remove('text-blue-900', 'font-black', 'border-b-2', 'border-blue-900');
                btn.classList.add('text-slate-600');
            }
        }
    });

    if (viewName === 'reception') {
        actualizarMedicosRecepcion();
        const estRec = obtenerEstadoRecepcion();
        if (estRec.fechaRecepcionSeleccionada) generarAgendaRecepcion();
    }
    if (viewName === 'doctor') {
        cargarAgendaMedico();
        window.inicializarModuloInterconsultas?.();
    } else {
        window.desmontarModuloInterconsultas?.();
    }
    if (viewName === 'admin') {
        cargarUsuariosAdmin('init');
        verificarLimpiezaAnual();
    }
}

export function cambiarTabAdmin(tabId) {
    document.querySelectorAll('.admin-tab').forEach(t => {
        t.classList.remove('active', 'text-neutral-900', 'text-blue-800', 'border-b-2', 'border-slate-900');
        t.classList.add('text-slate-500');
    });
    document.querySelectorAll('.admin-section').forEach(s => s.classList.add('hidden'));

    const tabActiva = document.getElementById('tab-' + tabId);
    if (tabActiva) {
        tabActiva.classList.add('active', 'text-neutral-900', 'border-b-2', 'border-slate-900');
        tabActiva.classList.remove('text-slate-500', 'text-blue-800');
    }

    const secActiva = document.getElementById('admin-sec-' + tabId);
    if (secActiva) secActiva.classList.remove('hidden');

    if (tabId === 'metricas') cargarMetricas();
    if (tabId === 'auditoria') cargarAuditoriaAdmin();
}

export function toggleHistorial() {
    // Helper visual
}

function iniciarRelojHospitalario() {
    const elReloj = document.getElementById('reloj-hospitalario');
    if (!elReloj) return;
    const actualizar = () => {
        const d = new Date();
        const dia = String(d.getDate()).padStart(2, '0');
        const mes = String(d.getMonth() + 1).padStart(2, '0');
        const anio = d.getFullYear();
        const horas = String(d.getHours()).padStart(2, '0');
        const mins = String(d.getMinutes()).padStart(2, '0');
        const segs = String(d.getSeconds()).padStart(2, '0');
        elReloj.textContent = `${dia}/${mes}/${anio} - ${horas}:${mins}:${segs} hs`;
    };
    actualizar();
    setInterval(actualizar, 1000);
}

// Inicialización de la sesión y módulos del panel
inicializarAuth((sesion) => {
    aplicarPermisosVisuales(sesion);
    iniciarModuloStaff();
});

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        iniciarRelojHospitalario();
        inicializarEventosHC();
    });
} else {
    iniciarRelojHospitalario();
    inicializarEventosHC();
}

// Exponer en window para manejadores inline del DOM
window.switchView = switchView;
window.cambiarTabAdmin = cambiarTabAdmin;
window.toggleHistorial = toggleHistorial;
window.cargarMetricas = cargarMetricas;
window.cargarAuditoriaAdmin = cargarAuditoriaAdmin;
window.cargarConfiguracionModulacion = cargarConfiguracionModulacion;

// Fallback reactivo de navegación entre sub-vistas del Consultorio (Atención vs Interconsultas)
if (!window.cambiarSubvistaDoctor) {
    window.cambiarSubvistaDoctor = function (subvista) {
        const subAtencion = document.getElementById("subvista-doctor-atencion");
        const subInterconsultas = document.getElementById("subvista-doctor-interconsultas");
        const tabAtencion = document.getElementById("tab-consultorio-atencion");
        const tabInterconsultas = document.getElementById("tab-consultorio-interconsultas");

        if (!subAtencion || !subInterconsultas) return;

        if (subvista === "interconsultas") {
            subAtencion.classList.add("hidden");
            subInterconsultas.classList.remove("hidden");
            if (tabAtencion) {
                tabAtencion.className = "px-4 py-2.5 text-xs sm:text-sm font-medium text-slate-600 hover:text-slate-900 border-b-2 border-transparent flex items-center gap-2 transition cursor-pointer";
            }
            if (tabInterconsultas) {
                tabInterconsultas.className = "px-4 py-2.5 text-xs sm:text-sm font-bold text-emerald-800 border-b-2 border-emerald-700 flex items-center gap-2 transition cursor-pointer";
            }
            window.inicializarModuloInterconsultas?.();
        } else {
            subInterconsultas.classList.add("hidden");
            subAtencion.classList.remove("hidden");
            if (tabAtencion) {
                tabAtencion.className = "px-4 py-2.5 text-xs sm:text-sm font-bold text-emerald-800 border-b-2 border-emerald-700 flex items-center gap-2 transition cursor-pointer";
            }
            if (tabInterconsultas) {
                tabInterconsultas.className = "px-4 py-2.5 text-xs sm:text-sm font-medium text-slate-600 hover:text-slate-900 border-b-2 border-transparent flex items-center gap-2 transition cursor-pointer";
            }
        }
    };
}
