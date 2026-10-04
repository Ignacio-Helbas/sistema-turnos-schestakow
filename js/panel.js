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
    cargarMetricas
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
    const btnNavDemoForo = document.getElementById('btn-nav-demo-foro');

    if (btnAdmin) btnAdmin.classList.add('hidden');
    if (btnRec) btnRec.classList.add('hidden');
    if (btnDoc) btnDoc.classList.add('hidden');
    if (btnDummies) btnDummies.classList.add('hidden');
    if (btnReset) btnReset.classList.add('hidden');
    if (btnDemoForo) btnDemoForo.classList.add('hidden');
    if (btnNavDemoForo) btnNavDemoForo.classList.add('hidden');

    if (btnLogout) {
        btnLogout.classList.remove('hidden');
        btnLogout.innerText = `Cerrar Sesión (${sesion.nombre || sesion.correo})`;
    }

    const esNacho = (sesion.correo && sesion.correo.toLowerCase() === "nachohelbas@gmail.com");

    if (esNacho) {
        if (btnAdmin) btnAdmin.classList.remove('hidden');
        if (btnRec) btnRec.classList.remove('hidden');
        if (btnDoc) btnDoc.classList.remove('hidden');
        if (btnDummies) btnDummies.classList.remove('hidden');
        if (btnDemoForo) btnDemoForo.classList.remove('hidden');
        if (btnNavDemoForo) btnNavDemoForo.classList.remove('hidden');

        verificarEntornoDemo().then(esDemo => {
            if (btnReset) {
                if (esDemo) btnReset.classList.remove('hidden');
                else btnReset.classList.add('hidden');
            }
        });

        sincronizarMedicosPublicos();
        switchView('admin');
    } else if (sesion.rol === "Administración") {
        if (btnAdmin) btnAdmin.classList.remove('hidden');
        if (btnDummies) btnDummies.classList.remove('hidden');

        verificarEntornoDemo().then(esDemo => {
            if (btnReset) {
                if (esDemo) btnReset.classList.remove('hidden');
                else btnReset.classList.add('hidden');
            }
        });

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

    if (viewName === 'reception') {
        actualizarMedicosRecepcion();
        const estRec = obtenerEstadoRecepcion();
        if (estRec.fechaRecepcionSeleccionada) generarAgendaRecepcion();
    }
    if (viewName === 'doctor') {
        cargarAgendaMedico();
    }
    if (viewName === 'admin') {
        cargarUsuariosAdmin('init');
        verificarLimpiezaAnual();
    }
}

export function cambiarTabAdmin(tabId) {
    document.querySelectorAll('.admin-tab').forEach(t => {
        t.classList.remove('active', 'text-neutral-900', 'text-blue-800');
        t.classList.add('text-slate-500');
    });
    document.querySelectorAll('.admin-section').forEach(s => s.classList.add('hidden'));

    const tabActiva = document.getElementById('tab-' + tabId);
    if (tabActiva) {
        tabActiva.classList.add('active', 'text-neutral-900');
        tabActiva.classList.remove('text-slate-500', 'text-blue-800');
    }

    const secActiva = document.getElementById('admin-sec-' + tabId);
    if (secActiva) secActiva.classList.remove('hidden');

    if (tabId === 'metricas') cargarMetricas();
}

export function toggleHistorial() {
    // Helper visual
}

// Inicialización de la sesión y módulos del panel
inicializarAuth((sesion) => {
    aplicarPermisosVisuales(sesion);
    iniciarModuloStaff();
});

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializarEventosHC);
} else {
    inicializarEventosHC();
}

// Exponer en window para manejadores inline del DOM
window.switchView = switchView;
window.cambiarTabAdmin = cambiarTabAdmin;
window.toggleHistorial = toggleHistorial;
window.cargarMetricas = cargarMetricas;
window.cargarConfiguracionModulacion = cargarConfiguracionModulacion;
