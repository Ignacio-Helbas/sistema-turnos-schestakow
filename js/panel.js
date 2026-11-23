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

    establecerLimitesFecha,

    mostrarOverlayCargaPanel,

    ocultarOverlayCargaPanel

} from "./ui.js";



import {
    inicializarAuth,
    obtenerSesionActual,
    establecerSesionActual,
    mostrarPantallaLogin,
    esRolAdministracion,
    esRolRecepcion,
    esRolMedico,
    esRolEnfermeria
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

    inicializarEventosHC,

    obtenerSubvistaDoctorActual

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

    await Promise.allSettled([

        cargarEspecialistasFirebase(),

        cargarConfiguracionModulacion()

    ]);

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

        const [snapGlobal, snapIndividual] = await Promise.all([

            getDoc(doc(db, "configuracion", "general")).catch(() => null),

            getDocs(collection(db, "modulacion_medicos")).catch(() => null)

        ]);

        if (snapGlobal && snapGlobal.exists && snapGlobal.exists()) {

            duracionTurnoGlobal = snapGlobal.data().duracionBase || 15;

            const selectAdmin = document.getElementById('admin-select-duracion');

            if (selectAdmin && document.getElementById('admin-select-alcance')?.value === 'global') {

                selectAdmin.value = duracionTurnoGlobal;

            }

        }

        modulacionPorMedico = {};

        if (snapIndividual && snapIndividual.forEach) {

            snapIndividual.forEach(d => { modulacionPorMedico[d.id] = d.data().duracionBase; });

        }



        setCatalogosRecepcion({ bdMedicos: bdMedicosDinamica, duracionGlobal: duracionTurnoGlobal, modulacion: modulacionPorMedico });

        setCatalogosConsultorio({ bdMedicos: bdMedicosDinamica, duracionGlobal: duracionTurnoGlobal, modulacion: modulacionPorMedico });

    } catch (e) {

        console.log("Configuración por defecto cargada.");

    }

}



export function aplicarPermisosVisuales(sesion) {
    if (!sesion) sesion = obtenerSesionActual() || {};

    const btnAdmin = document.getElementById('btn-nav-admin');
    const btnRec = document.getElementById('btn-nav-reception');
    const btnDoc = document.getElementById('btn-nav-doctor');
    const btnInternacion = document.getElementById('btn-nav-internacion');
    const btnQuirofanos = document.getElementById('btn-nav-quirofanos');
    const btnLogout = document.getElementById('btn-logout');
    const btnDummies = document.getElementById('btn-cargar-dummies');
    const btnReset = document.getElementById('btn-reset-db');
    const btnDemoForo = document.getElementById('btn-demo-foro');

    const usuarioSesionInfo = document.getElementById('usuario-sesion-info');
    const usuarioSesionNombre = document.getElementById('usuario-sesion-nombre');
    const usuarioSesionRol = document.getElementById('usuario-sesion-rol');
    const usuarioSesionPermisos = document.getElementById('usuario-sesion-permisos');

    if (btnAdmin) btnAdmin.classList.add('hidden');
    if (btnRec) btnRec.classList.add('hidden');
    if (btnDoc) btnDoc.classList.add('hidden');
    if (btnInternacion) btnInternacion.classList.add('hidden');
    if (btnQuirofanos) btnQuirofanos.classList.add('hidden');
    if (btnDummies) btnDummies.classList.add('hidden');
    if (btnReset) btnReset.classList.add('hidden');
    if (btnDemoForo) btnDemoForo.classList.add('hidden');

    const barraSuperadmin = document.getElementById('barra-superadmin-controles');
    if (barraSuperadmin) barraSuperadmin.classList.add('hidden');

    if (btnLogout) {
        btnLogout.classList.remove('hidden');
    }

    const btnPerfilDesktop = document.getElementById('btn-perfil-desktop');
    const avatarDesktop = document.getElementById('avatar-perfil-desktop');
    const dropdownAvatar = document.getElementById('dropdown-perfil-avatar');
    const dropdownNombre = document.getElementById('dropdown-perfil-nombre');
    const dropdownEmail = document.getElementById('dropdown-perfil-email');
    const dropdownVistas = document.getElementById('dropdown-perfil-vistas');

    const rol = sesion.rol || 'Personal';
    const permisos = Array.isArray(sesion.permisosAdicionales) ? sesion.permisosAdicionales : [];
    const esAdmin = esRolAdministracion(rol);
    const esRecepcion = esRolRecepcion(rol);
    const esMedico = esRolMedico(rol);
    const esEnfermeria = esRolEnfermeria(rol);

    const tieneCoordQuirofano = permisos.includes('coordinaQuirofano');
    const tieneAnestesia = permisos.includes('anestesia');
    const tieneInstrumentacion = permisos.includes('instrumentacion');
    const tieneInternacion = permisos.includes('internacion');

    const rolMostrar = rol;
    const nombreMostrar = sesion.nombre || sesion.correo || 'Usuario Staff';
    const inicial = (sesion.nombre || sesion.correo || 'U').charAt(0).toUpperCase();

    if (btnPerfilDesktop) {
        btnPerfilDesktop.classList.remove('hidden');
        btnPerfilDesktop.classList.add('flex');
    }
    if (avatarDesktop) {
        avatarDesktop.textContent = inicial;
        if (esMedico) {
            avatarDesktop.className = "w-8 h-8 rounded-full bg-emerald-700 text-white font-bold text-xs flex items-center justify-center shadow-xs ring-2 ring-emerald-100 shrink-0";
        } else if (esAdmin) {
            avatarDesktop.className = "w-8 h-8 rounded-full bg-slate-800 text-white font-bold text-xs flex items-center justify-center shadow-xs ring-2 ring-slate-200 shrink-0";
        } else if (esEnfermeria) {
            avatarDesktop.className = "w-8 h-8 rounded-full bg-teal-700 text-white font-bold text-xs flex items-center justify-center shadow-xs ring-2 ring-teal-100 shrink-0";
        } else {
            avatarDesktop.className = "w-8 h-8 rounded-full bg-sky-700 text-white font-bold text-xs flex items-center justify-center shadow-xs ring-2 ring-sky-100 shrink-0";
        }
    }
    if (dropdownAvatar) {
        dropdownAvatar.textContent = inicial;
        if (esMedico) {
            dropdownAvatar.className = "w-9 h-9 rounded-full bg-emerald-700 text-white font-bold text-sm flex items-center justify-center shadow-xs shrink-0";
        } else if (esAdmin) {
            dropdownAvatar.className = "w-9 h-9 rounded-full bg-slate-800 text-white font-bold text-sm flex items-center justify-center shadow-xs shrink-0";
        } else if (esEnfermeria) {
            dropdownAvatar.className = "w-9 h-9 rounded-full bg-teal-700 text-white font-bold text-sm flex items-center justify-center shadow-xs shrink-0";
        } else {
            dropdownAvatar.className = "w-9 h-9 rounded-full bg-sky-700 text-white font-bold text-sm flex items-center justify-center shadow-xs shrink-0";
        }
    }
    if (dropdownNombre) dropdownNombre.textContent = nombreMostrar;
    if (dropdownEmail) dropdownEmail.textContent = sesion.correo || sesion.email || `${rolMostrar.toLowerCase()}@schestakow.gob.ar`;
    if (dropdownVistas) {
        if (esAdmin) {
            dropdownVistas.classList.remove('hidden');
        } else {
            dropdownVistas.classList.add('hidden');
        }
    }

    sincronizarNavegacionMobile(sesion);

    if (usuarioSesionInfo) usuarioSesionInfo.classList.remove('hidden');
    if (usuarioSesionNombre) usuarioSesionNombre.textContent = nombreMostrar;
    if (usuarioSesionRol) {
        usuarioSesionRol.textContent = rolMostrar;
        let badgeClase = 'badge-his-pendiente';
        if (esMedico) badgeClase = 'badge-his-atendido';
        else if (esAdmin) badgeClase = 'badge-his-admin';
        else if (esEnfermeria) badgeClase = 'badge-his-confirmado bg-teal-100 text-teal-800 border-teal-300';
        else if (esRecepcion) badgeClase = 'badge-his-espera';
        usuarioSesionRol.className = 'badge-his ' + badgeClase;
    }

    if (usuarioSesionPermisos) {
        if (permisos.length > 0 && !esAdmin) {
            const labels = {
                coordinaQuirofano: 'Quirófano',
                anestesia: 'Anestesia',
                instrumentacion: 'Instrumentación',
                internacion: 'Internación'
            };
            usuarioSesionPermisos.innerHTML = permisos.map(p =>
                `<span class="text-[9px] px-1 py-0.2 rounded font-semibold bg-slate-100 text-slate-700 border border-slate-200">${labels[p] || p}</span>`
            ).join('');
            usuarioSesionPermisos.classList.remove('hidden');
        } else {
            usuarioSesionPermisos.innerHTML = '';
            usuarioSesionPermisos.classList.add('hidden');
        }
    }

    const params = new URLSearchParams(window.location.search);
    const esModoDev = params.get('dev') === '1';

    if (esAdmin) {
        if (btnAdmin) btnAdmin.classList.remove('hidden');
        if (btnRec) btnRec.classList.remove('hidden');
        if (btnDoc) btnDoc.classList.remove('hidden');
        if (btnInternacion) btnInternacion.classList.remove('hidden');
        if (btnQuirofanos) btnQuirofanos.classList.remove('hidden');

        if (esModoDev) {
            if (btnDummies) btnDummies.classList.remove('hidden');
            if (btnDemoForo) btnDemoForo.classList.remove('hidden');
            if (btnReset) btnReset.classList.remove('hidden');
            if (barraSuperadmin) barraSuperadmin.classList.remove('hidden');
        }

        sincronizarMedicosPublicos().catch(() => {});
        switchView('admin');
    } else if (esMedico) {
        if (btnDoc) btnDoc.classList.remove('hidden');
        if (btnQuirofanos) btnQuirofanos.classList.remove('hidden');
        if (btnInternacion) btnInternacion.classList.remove('hidden');
        switchView('doctor');
    } else if (esEnfermeria) {
        if (btnInternacion) btnInternacion.classList.remove('hidden');
        if (btnQuirofanos) btnQuirofanos.classList.remove('hidden');
        switchView('internacion');
    } else {
        if (btnRec) btnRec.classList.remove('hidden');
        if (btnInternacion) btnInternacion.classList.remove('hidden');
        if (btnQuirofanos) btnQuirofanos.classList.remove('hidden');
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

        const rol = sesionActual.rol || '';
        const permisos = Array.isArray(sesionActual.permisosAdicionales) ? sesionActual.permisosAdicionales : [];
        const esAdmin = esRolAdministracion(rol);
        const esRecepcion = esRolRecepcion(rol);
        const esMedico = esRolMedico(rol);
        const esEnfermeria = esRolEnfermeria(rol);

        let permitido = false;
        if (esAdmin) {
            permitido = true;
        } else if (viewName === 'doctor' && esMedico) {
            permitido = true;
        } else if (viewName === 'reception' && esRecepcion) {
            permitido = true;
        } else if (viewName === 'internacion') {
            permitido = esAdmin || esRecepcion || esEnfermeria || esMedico || permisos.includes('internacion');
        } else if (viewName === 'quirofanos') {
            permitido = esAdmin || esRecepcion || esMedico || esEnfermeria || permisos.includes('coordinaQuirofano') || permisos.includes('anestesia') || permisos.includes('instrumentacion');
        }

        if (!permitido) {
            mostrarAlerta("Acceso No Autorizado", `Su rol actual (${rol || 'Sin Rol'}) no tiene permisos para acceder a esta vista.`);
            return;
        }
    }

    document.body.dataset.view = viewName;
    document.querySelectorAll('.view').forEach(el => {
        el.classList.remove('active');
        el.classList.add('hidden');
    });
    const target = document.getElementById('view-' + viewName);
    if (target) {
        target.classList.add('active');
        target.classList.remove('hidden');
    }

    const mobSub = document.getElementById('mobile-header-subtitle');
    if (mobSub) {
        if (viewName === 'doctor') {
            mobSub.textContent = 'Consultorio Médico';
            mobSub.className = 'text-[10px] text-emerald-700 font-semibold';
        } else if (viewName === 'admin') {
            mobSub.textContent = 'Administración';
            mobSub.className = 'text-[10px] text-slate-700 font-semibold';
        } else if (viewName === 'reception') {
            mobSub.textContent = 'Recepción y Admisión';
            mobSub.className = 'text-[10px] text-sky-800 font-semibold';
        } else if (viewName === 'internacion') {
            mobSub.textContent = 'Internación y Camas';
            mobSub.className = 'text-[10px] text-indigo-800 font-semibold';
        } else if (viewName === 'quirofanos') {
            mobSub.textContent = 'Agenda de Quirófanos';
            mobSub.className = 'text-[10px] text-teal-800 font-semibold';
        }
    }

    // Breadcrumbs
    const breadcrumbView = document.getElementById('breadcrumb-current-view');
    if (breadcrumbView) {
        const nombresVistas = {
            'reception': 'Recepción y Admisión',
            'doctor': 'Consultorio Médico',
            'internacion': 'Internación y Camas',
            'quirofanos': 'Agenda de Quirófanos',
            'admin': 'Administración Institucional',
            'login': 'Identificación del Personal'
        };
        breadcrumbView.textContent = nombresVistas[viewName] || viewName;
    }

    // Actualizar estilo activo de los botones de navegación del personal
    ['reception', 'doctor', 'internacion', 'quirofanos', 'admin'].forEach(v => {
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

    if (viewName === 'internacion') {
        window.cargarCamasHospital?.();
    }

    if (viewName === 'quirofanos') {
        window.cargarQuirofanosHospital?.();
        const hoy = window.obtenerFechaHoyISO?.() || new Date().toISOString().substring(0, 10);
        window.cargarReservasPorFecha?.(hoy);
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

    if (secActiva) {

        secActiva.classList.remove('hidden');

        secActiva.classList.remove('subview-slide-in');

        void secActiva.offsetWidth;

        secActiva.classList.add('subview-slide-in');

    }



    const mobSub = document.getElementById('mobile-header-subtitle');

    if (mobSub) {

        const nombres = {

            'gestion': 'Administración • Gestión',

            'metricas': 'Administración • Métricas',

            'auditoria': 'Administración • Auditoría'

        };

        mobSub.textContent = nombres[tabId] || 'Administración';

        mobSub.className = 'text-xs font-bold text-slate-800';

    }



    if (tabId === 'metricas') cargarMetricas();

    if (tabId === 'auditoria') cargarAuditoriaAdmin();

    actualizarBotonesBottomNavAdmin(tabId);

}



export function cambiarSubvistaAdminMobile(tabId) {

    cambiarTabAdmin(tabId);

}



function actualizarBotonesBottomNavAdmin(tabId) {

    const tabs = ['gestion', 'metricas', 'auditoria'];

    tabs.forEach(t => {

        const btn = document.getElementById('btn-bottom-adm-' + t);

        if (!btn) return;

        const iconWrap = btn.querySelector('div');

        const iconSvg = btn.querySelector('svg');

        const spanText = btn.querySelector('span');

        if (t === tabId) {

            btn.className = "flex flex-col items-center justify-center py-1 text-white font-bold transition-all cursor-pointer";

            iconWrap?.classList.add('bg-white/15');

            iconSvg?.classList.remove('text-white/80');

            iconSvg?.classList.add('text-white');

            spanText?.classList.remove('text-white/80');

            spanText?.classList.add('text-white');

        } else {

            btn.className = "flex flex-col items-center justify-center py-1 text-white/75 hover:text-white font-medium transition-all cursor-pointer";

            iconWrap?.classList.remove('bg-white/15');

            iconSvg?.classList.remove('text-white');

            iconSvg?.classList.add('text-white/80');

            spanText?.classList.remove('text-white');

            spanText?.classList.add('text-white/80');

        }

    });

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

inicializarAuth(async (sesion) => {

    mostrarOverlayCargaPanel("Cargando módulos institucionales...");

    try {

        aplicarPermisosVisuales(sesion);

        await iniciarModuloStaff();

    } finally {

        ocultarOverlayCargaPanel();

    }

});





export function obtenerSubvistaAdminActual() {

    const secAuditoria = document.getElementById('admin-sec-auditoria');

    const secMetricas = document.getElementById('admin-sec-metricas');

    if (secAuditoria && !secAuditoria.classList.contains('hidden')) {

        return 'auditoria';

    }

    if (secMetricas && !secMetricas.classList.contains('hidden')) {

        return 'metricas';

    }

    return 'gestion';

}

if (document.readyState === 'loading') {

    document.addEventListener('DOMContentLoaded', () => {

        iniciarRelojHospitalario();

        inicializarEventosHC();

    });

} else {

    iniciarRelojHospitalario();

    inicializarEventosHC();

}





export function toggleMenuPerfilDesktop(forzar) {

    const dropdown = document.getElementById('dropdown-perfil-desktop');

    const btn = document.getElementById('btn-perfil-desktop');

    const chevron = document.getElementById('chevron-perfil-desktop');

    if (!dropdown) return;



    const estaOculto = dropdown.classList.contains('hidden');

    const abrir = typeof forzar === 'boolean' ? forzar : estaOculto;



    if (abrir) {

        dropdown.classList.remove('hidden');

        if (btn) btn.setAttribute('aria-expanded', 'true');

        if (chevron) chevron.classList.add('rotate-180');

    } else {

        dropdown.classList.add('hidden');

        if (btn) btn.setAttribute('aria-expanded', 'false');

        if (chevron) chevron.classList.remove('rotate-180');

    }

}



export function cambiarVistaDesdeMenuDesktop(vista) {

    toggleMenuPerfilDesktop(false);

    switchView(vista);

}



document.addEventListener('click', (e) => {

    const dropdown = document.getElementById('dropdown-perfil-desktop');

    const btn = document.getElementById('btn-perfil-desktop');

    if (!dropdown || dropdown.classList.contains('hidden')) return;

    if (!dropdown.contains(e.target) && !btn?.contains(e.target)) {

        toggleMenuPerfilDesktop(false);

    }

});



document.addEventListener('keydown', (e) => {

    if (e.key === 'Escape') {

        toggleMenuPerfilDesktop(false);

    }

});



// Exponer en window para manejadores inline del DOM

window.toggleMenuPerfilDesktop = toggleMenuPerfilDesktop;

window.cambiarVistaDesdeMenuDesktop = cambiarVistaDesdeMenuDesktop;



window.switchView = switchView;

window.aplicarPermisosVisuales = aplicarPermisosVisuales;

window.cambiarTabAdmin = cambiarTabAdmin;

window.toggleHistorial = toggleHistorial;

window.cargarMetricas = cargarMetricas;

window.cargarAuditoriaAdmin = cargarAuditoriaAdmin;

window.cargarConfiguracionModulacion = cargarConfiguracionModulacion;



// Fallback reactivo de navegación entre sub-vistas del Consultorio (Espera, Atención, Interconsultas)

if (!window.cambiarSubvistaDoctor) {

    window.cambiarSubvistaDoctor = function (subvista) {

        const subAtencion = document.getElementById("subvista-doctor-atencion");

        const subInterconsultas = document.getElementById("subvista-doctor-interconsultas");

        const tabAtencion = document.getElementById("tab-consultorio-atencion");

        const tabInterconsultas = document.getElementById("tab-consultorio-interconsultas");



        if (!subAtencion || !subInterconsultas) return;



        const btnBottomEspera = document.getElementById("btn-bottom-doc-espera");

        const btnBottomAtencion = document.getElementById("btn-bottom-doc-atencion");

        const btnBottomIc = document.getElementById("btn-bottom-doc-interconsultas");



        function actualizarBotonesNav(activoId) {

            const botones = [

                { id: 'btn-bottom-doc-espera', el: btnBottomEspera },

                { id: 'btn-bottom-doc-atencion', el: btnBottomAtencion },

                { id: 'btn-bottom-doc-interconsultas', el: btnBottomIc }

            ];

            botones.forEach(b => {

                if (!b.el) return;

                const dot = b.el.querySelector('.nav-indicator-dot');

                if (b.id === activoId) {

                    b.el.classList.remove('is-inactive');

                    b.el.classList.add('is-active');

                    if (dot) dot.classList.remove('opacity-0');

                } else {

                    b.el.classList.remove('is-active');

                    b.el.classList.add('is-inactive');

                    if (dot) dot.classList.add('opacity-0');

                }

            });

        }



        if (subvista === "interconsultas") {

            subAtencion.classList.add("hidden");

            subInterconsultas.classList.remove("hidden");

            if (tabAtencion) tabAtencion.className = "px-4 py-2.5 text-xs sm:text-sm font-medium text-slate-600 hover:text-slate-900 border-b-2 border-transparent flex items-center gap-2 transition cursor-pointer";

            if (tabInterconsultas) tabInterconsultas.className = "px-4 py-2.5 text-xs sm:text-sm font-bold text-emerald-800 border-b-2 border-emerald-700 flex items-center gap-2 transition cursor-pointer";

            actualizarBotonesNav('btn-bottom-doc-interconsultas');

            window.inicializarModuloInterconsultas?.();

        } else if (subvista === "espera") {

            subInterconsultas.classList.add("hidden");

            subAtencion.classList.remove("hidden");

            subAtencion.dataset.mobileSubview = "espera";

            if (tabAtencion) tabAtencion.className = "px-4 py-2.5 text-xs sm:text-sm font-bold text-emerald-800 border-b-2 border-emerald-700 flex items-center gap-2 transition cursor-pointer";

            if (tabInterconsultas) tabInterconsultas.className = "px-4 py-2.5 text-xs sm:text-sm font-medium text-slate-600 hover:text-slate-900 border-b-2 border-transparent flex items-center gap-2 transition cursor-pointer";

            actualizarBotonesNav('btn-bottom-doc-espera');

        } else {

            subInterconsultas.classList.add("hidden");

            subAtencion.classList.remove("hidden");

            subAtencion.dataset.mobileSubview = "atencion";

            if (tabAtencion) tabAtencion.className = "px-4 py-2.5 text-xs sm:text-sm font-bold text-emerald-800 border-b-2 border-emerald-700 flex items-center gap-2 transition cursor-pointer";

            if (tabInterconsultas) tabInterconsultas.className = "px-4 py-2.5 text-xs sm:text-sm font-medium text-slate-600 hover:text-slate-900 border-b-2 border-transparent flex items-center gap-2 transition cursor-pointer";

            actualizarBotonesNav('btn-bottom-doc-atencion');

        }

    };

}



// ==========================================

// CONTROL DE NAVEGACIÓN MÓVIL Y MENÚ PERFIL

// ==========================================

export function sincronizarNavegacionMobile(sesion) {

    if (!sesion) return;

    const esSuperadmin = esRolAdministracion(sesion.rol);



    const nombre = sesion.nombre || sesion.correo || "Personal";

    const inicial = nombre.trim().charAt(0).toUpperCase();



    const elAvatarBottom = document.getElementById("avatar-bottom-doc");

    if (elAvatarBottom) elAvatarBottom.textContent = inicial;



    const elAvatarBottomAdm = document.getElementById("avatar-bottom-adm");

    if (elAvatarBottomAdm) elAvatarBottomAdm.textContent = inicial;



    const elAvatarBottomRec = document.getElementById("avatar-bottom-rec");

    if (elAvatarBottomRec) elAvatarBottomRec.textContent = inicial;



    const elAvatarMobile = document.getElementById("perfil-mobile-avatar");

    if (elAvatarMobile) elAvatarMobile.textContent = inicial;



    const elNombreMobile = document.getElementById("perfil-mobile-nombre");

    if (elNombreMobile) elNombreMobile.textContent = nombre;



    const elCorreoMobile = document.getElementById("perfil-mobile-correo");

    if (elCorreoMobile) elCorreoMobile.textContent = sesion.correo || "";



    const elRolBadge = document.getElementById("perfil-mobile-rol-badge");

    if (elRolBadge) {

        elRolBadge.textContent = sesion.rol || "Personal";

        const rolU = sesion.rol || "Personal";
        let badgeClase = "badge-his-pendiente";
        if (esRolMedico(rolU)) badgeClase = "badge-his-atendido";
        else if (esRolAdministracion(rolU)) badgeClase = "badge-his-admin";
        else if (esRolEnfermeria(rolU)) badgeClase = "badge-his-confirmado bg-teal-100 text-teal-800 border-teal-300";
        else if (esRolRecepcion(rolU)) badgeClase = "badge-his-espera";
        elRolBadge.className = "badge-his " + badgeClase;

    }



    const secCambiarVista = document.getElementById("seccion-cambiar-vista-mobile");
    if (secCambiarVista) {
        const btnMobRec = document.getElementById("btn-menu-mob-reception");
        const btnMobDoc = document.getElementById("btn-menu-mob-doctor");
        const btnMobInt = document.getElementById("btn-menu-mob-internacion");
        const btnMobQui = document.getElementById("btn-menu-mob-quirofanos");
        const btnMobAdm = document.getElementById("btn-menu-mob-admin");

        // Ocultar todos por defecto
        [btnMobRec, btnMobDoc, btnMobInt, btnMobQui, btnMobAdm].forEach(b => {
            if (b) b.classList.add("hidden");
        });

        const rolU = sesion.rol || "";
        const esAdmin = esRolAdministracion(rolU);
        const esMedico = esRolMedico(rolU);
        const esEnfermeria = esRolEnfermeria(rolU);
        const esRecepcion = esRolRecepcion(rolU);

        if (esAdmin) {
            secCambiarVista.classList.remove("hidden");
            [btnMobRec, btnMobDoc, btnMobInt, btnMobQui, btnMobAdm].forEach(b => {
                if (b) b.classList.remove("hidden");
            });
        } else if (esMedico) {
            secCambiarVista.classList.remove("hidden");
            if (btnMobDoc) btnMobDoc.classList.remove("hidden");
            if (btnMobInt) btnMobInt.classList.remove("hidden");
            if (btnMobQui) btnMobQui.classList.remove("hidden");
        } else if (esEnfermeria) {
            secCambiarVista.classList.remove("hidden");
            if (btnMobInt) btnMobInt.classList.remove("hidden");
            if (btnMobQui) btnMobQui.classList.remove("hidden");
        } else if (esRecepcion) {
            secCambiarVista.classList.remove("hidden");
            if (btnMobRec) btnMobRec.classList.remove("hidden");
            if (btnMobInt) btnMobInt.classList.remove("hidden");
            if (btnMobQui) btnMobQui.classList.remove("hidden");
        } else {
            secCambiarVista.classList.add("hidden");
        }
    }

}



export function sincronizarVistasMenuMobile() {

    const vistaActual = document.body.dataset.view || 'admin';

    const items = [
        { id: 'btn-menu-mob-reception', view: 'reception', bg: 'bg-blue-50/80', border: 'border-blue-200', badgeColor: 'bg-blue-700' },
        { id: 'btn-menu-mob-doctor', view: 'doctor', bg: 'bg-emerald-50/80', border: 'border-emerald-200', badgeColor: 'bg-emerald-700' },
        { id: 'btn-menu-mob-internacion', view: 'internacion', bg: 'bg-indigo-50/80', border: 'border-indigo-200', badgeColor: 'bg-indigo-700' },
        { id: 'btn-menu-mob-quirofanos', view: 'quirofanos', bg: 'bg-teal-50/80', border: 'border-teal-200', badgeColor: 'bg-teal-700' },
        { id: 'btn-menu-mob-admin', view: 'admin', bg: 'bg-slate-100', border: 'border-slate-300', badgeColor: 'bg-slate-900' }
    ];



    items.forEach(item => {

        const btn = document.getElementById(item.id);

        if (!btn) return;

        const badgeActual = btn.querySelector('.badge-vista-actual');

        const iconIndicador = btn.querySelector('.indicador-vista-actual');

        const arrow = btn.querySelector('.arrow-vista-otra');

        const isCurrent = vistaActual === item.view;



        if (isCurrent) {

            btn.className = `w-full flex items-center justify-between p-2.5 rounded-xl ${item.bg} border ${item.border} transition cursor-pointer`;

            if (badgeActual) {

                badgeActual.className = `badge-vista-actual text-[9px] ${item.badgeColor} text-white font-bold px-1.5 py-0.2 rounded-full`;

                badgeActual.classList.remove('hidden');

            }

            if (iconIndicador) iconIndicador.classList.remove('hidden');

            if (arrow) arrow.classList.add('hidden');

        } else {

            btn.className = "w-full flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 transition border border-transparent hover:border-slate-200 cursor-pointer";

            if (badgeActual) badgeActual.classList.add('hidden');

            if (iconIndicador) iconIndicador.classList.add('hidden');

            if (arrow) arrow.classList.remove('hidden');

        }

    });

}



export function toggleMenuPerfilMobile() {

    const modal = document.getElementById("modal-perfil-mobile");

    if (!modal) return;

    sincronizarVistasMenuMobile();

    modal.classList.toggle("hidden");

}



export function cerrarMenuPerfilMobile() {

    const modal = document.getElementById("modal-perfil-mobile");

    if (modal) modal.classList.add("hidden");

}



export function cambiarVistaDesdeMenuMobile(vista) {

    cerrarMenuPerfilMobile();

    switchView(vista);

}



export function accesoRapidoDev() {

    console.warn("Seguridad: El bypass de desarrollo ha sido deshabilitado. Inicie sesión mediante Firebase Authentication.");

    mostrarAlerta("Acceso Restringido", "El bypass de desarrollo fue deshabilitado por política de seguridad hospitalaria. Inicie sesión con credenciales autenticadas.");

}



window.toggleMenuPerfilMobile = toggleMenuPerfilMobile;

window.cerrarMenuPerfilMobile = cerrarMenuPerfilMobile;

window.cambiarVistaDesdeMenuMobile = cambiarVistaDesdeMenuMobile;

window.cambiarSubvistaAdminMobile = cambiarSubvistaAdminMobile;

window.sincronizarVistasMenuMobile = sincronizarVistasMenuMobile;
window.sincronizarNavegacionMobile = sincronizarNavegacionMobile;

window.accesoRapidoDev = accesoRapidoDev;

window.obtenerSubvistaAdminActual = obtenerSubvistaAdminActual;



