// ==========================================
// MÓDULO INTERNO / ADMIN (RECEPCIÓN, CONSULTORIO, ADMINISTRACIÓN)
// Operación directa en Firestore (Plan Gratuito Spark)
// ==========================================

import {
    auth,
    db,
    collection,
    query,
    where,
    getDocs,
    doc,
    setDoc,
    addDoc,
    updateDoc,
    deleteDoc,
    getDoc,
    orderBy,
    limit,
    startAfter,
    writeBatch,
    serverTimestamp,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    sendPasswordResetEmail,
    crearCuentaAuthSecundaria
} from "./firebase-config.js";

import {
    mostrarAlerta,
    mostrarExito,
    pedirConfirmacion,
    abrirModal,
    cerrarModal,
    escaparHTML,
    validarDiaHabil,
    establecerLimitesFecha
} from "./utils.js";

import {
    iniciarModuloMetricasUI
} from "./metricas-ui.js";

// Variables de Estado Interno
let sesionActual = null;
let bdMedicosDinamica = {};
let duracionTurnoGlobal = 15;
let modulacionPorMedico = {};
let fechaRecepcionSeleccionada = '';
let medicoSeleccionadoRecepcion = '';
let medicoUidSeleccionadoRecepcion = '';
let especialidadSeleccionadaRecepcion = '';
let horaSeleccionadaRecepcion = '';
let pacienteSeleccionadoMedico = null;
let usuariosPageSnapshots = [];
let currentUsuariosPage = 0;
const USUARIOS_PER_PAGE = 5;

// Exposición global
window.abrirModal = abrirModal;
window.cerrarModal = cerrarModal;
window.validarDiaHabil = validarDiaHabil;
window.switchView = switchView;
window.iniciarSesionReal = iniciarSesionReal;
window.cerrarSesionReal = cerrarSesionReal;
window.actualizarMedicosRecepcion = actualizarMedicosRecepcion;
window.buscarAgendaRecepcion = buscarAgendaRecepcion;
window.generarAgendaRecepcion = generarAgendaRecepcion;
window.abrirModalDarTurno = abrirModalDarTurno;
window.confirmarTurnoRecepcionFirebase = confirmarTurnoRecepcionFirebase;
window.cancelarTurnoRecepcion = cancelarTurnoRecepcion;
window.registrarLlegadaRecepcion = registrarLlegadaRecepcion;
window.ejecutarAusenciaEmergencia = ejecutarAusenciaEmergencia;
window.descargarExcelRecepcion = descargarExcelRecepcion;
window.simularAutocompletado = simularAutocompletado;
window.toggleTimeSelector = toggleTimeSelector;
window.cargarAgendaMedico = cargarAgendaMedico;
window.llamarPaciente = llamarPaciente;
window.marcarAusente = marcarAusente;
window.guardarConsultaInmutable = guardarConsultaInmutable;
window.guardarEvolucionMedico = guardarConsultaInmutable;
window.toggleCamposMedico = toggleCamposMedico;
window.abrirModalUsuarioNulo = abrirModalUsuarioNulo;
window.cargarUsuariosAdmin = cargarUsuariosAdmin;
window.editarUsuarioAdmin = editarUsuarioAdmin;
window.guardarUsuarioAdminFirebase = guardarUsuarioAdminFirebase;
window.eliminarUsuarioAdmin = eliminarUsuarioAdmin;
window.enviarResetPasswordUsuario = enviarResetPasswordUsuario;
window.cambiarTabAdmin = cambiarTabAdmin;
window.iniciarGuardadoModulacion = iniciarGuardadoModulacion;
window.ejecutarGuardadoModulacion = ejecutarGuardadoModulacion;
window.cargarMetricas = cargarMetricas;
window.toggleHistorial = toggleHistorial;
window.togglePasswordVisibility = togglePasswordVisibility;
window.verificarLimpiezaAnual = verificarLimpiezaAnual;
window.ejecutarLimpiezaYDescarga = ejecutarLimpiezaYDescarga;
window.limpiarBaseDeDatos = limpiarBaseDeDatos;
window.inyectarMedicosDePrueba = inyectarMedicosDePrueba;
window.buscarPacientePorDni = buscarPacientePorDni;
window.abrirFichaPacienteHC = abrirFichaPacienteHC;
window.guardarConsultaInmutable = guardarConsultaInmutable;
window.abrirModalRectificar = abrirModalRectificar;
window.guardarRectificacionInmutable = guardarRectificacionInmutable;
window.abrirModalEditarResumen = abrirModalEditarResumen;
window.guardarResumenClinico = guardarResumenClinico;
window.ejecutarAccesoEmergencia = ejecutarAccesoEmergencia;
window.exportarHistoriaClinica = exportarHistoriaClinica;
window.cerrarFichaPacienteHC = cerrarFichaPacienteHC;
window.abrirModalProximaConsulta = abrirModalProximaConsulta;
window.toggleModoHorarioCitacion = toggleModoHorarioCitacion;
window.cambioFechaProximaConsulta = cambioFechaProximaConsulta;
window.seleccionarSlotProximaConsulta = seleccionarSlotProximaConsulta;
window.guardarProximaConsultaMedico = guardarProximaConsultaMedico;
window.copiarEnlaceCitacion = copiarEnlaceCitacion;
window.imprimirComprobanteCitacion = imprimirComprobanteCitacion;
window.autocompletarNachoDemo = autocompletarNachoDemo;
window.inyectarDemoCompletaForo = inyectarDemoCompletaForo;

// ==========================================
// SESIÓN Y AUTENTICACIÓN
// ==========================================
onAuthStateChanged(auth, async (user) => {
    // Protección contra auto-login pasivo / bypass:
    // Requiere autenticación activa explícita en esta sesión del navegador
    if (!user || user.isAnonymous || sessionStorage.getItem('hospital_sesion_activa') !== 'true') {
        sesionActual = null;
        if (user && !user.isAnonymous && sessionStorage.getItem('hospital_sesion_activa') !== 'true') {
            try { await signOut(auth); } catch (_) {}
        }
        mostrarPantallaLogin();
        return;
    }

    let rol = "Recepción";
    let nombre = user.displayName || user.email;

    try {
        const docRef = doc(db, "usuarios", user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.rol) rol = data.rol;
            if (data.nombre) nombre = data.nombre;
        }
    } catch (e) {
        console.warn("No se pudo leer perfil desde Firestore:", e);
    }

    if (user.email && user.email.toLowerCase() === "nachohelbas@gmail.com") {
        rol = "Administración";
        if (!nombre || nombre === user.email) nombre = "Ignacio Helbas (SuperAdmin)";

        // Sincronizar inmediatamente el perfil en Firestore para habilitar permisos
        // de reglas de seguridad (isSuperAdmin()) en base de datos en tiempo real
        try {
            const userDocRef = doc(db, "usuarios", user.uid);
            await setDoc(userDocRef, {
                nombre: "Ignacio Helbas",
                correo: user.email,
                rol: "Administración",
                activo: true,
                actualizadoEn: serverTimestamp()
            }, { merge: true });
        } catch (syncErr) {
            console.warn("Aviso al sincronizar perfil SuperAdmin en Firestore:", syncErr);
        }
    }

    sesionActual = {
        uid: user.uid,
        correo: user.email,
        nombre: nombre,
        rol: rol
    };

    aplicarPermisosVisuales(sesionActual);
    iniciarModuloStaff();
});

function mostrarPantallaLogin() {
    sesionActual = null;
    document.body.dataset.view = 'login';
    document.querySelectorAll('.view').forEach(el => {
        el.classList.remove('active');
        el.classList.add('hidden');
    });
    const vLogin = document.getElementById('view-login');
    if (vLogin) {
        vLogin.classList.remove('hidden');
        vLogin.classList.add('active');
    }

    const btnAdmin = document.getElementById('btn-nav-admin');
    const btnRec = document.getElementById('btn-nav-reception');
    const btnDoc = document.getElementById('btn-nav-doctor');
    const btnLogout = document.getElementById('btn-logout');
    const btnNavDemo = document.getElementById('btn-nav-demo-foro');

    if (btnAdmin) btnAdmin.classList.add('hidden');
    if (btnRec) btnRec.classList.add('hidden');
    if (btnDoc) btnDoc.classList.add('hidden');
    if (btnLogout) btnLogout.classList.add('hidden');
    if (btnNavDemo) btnNavDemo.classList.add('hidden');
}

export async function iniciarSesionReal() {
    const emailInput = document.getElementById('login-user')?.value.trim();
    const passInput = document.getElementById('login-pass')?.value.trim();

    if (!emailInput || !passInput) {
        mostrarAlerta("Datos Faltantes", "Ingrese correo electrónico y contraseña.");
        return;
    }

    try {
        sessionStorage.setItem('hospital_sesion_activa', 'true');
        try {
            await signInWithEmailAndPassword(auth, emailInput, passInput);
        } catch (signInErr) {
            if (passInput.trim() !== passInput) {
                await signInWithEmailAndPassword(auth, emailInput, passInput.trim());
            } else {
                throw signInErr;
            }
        }

        document.getElementById('login-user').value = '';
        document.getElementById('login-pass').value = '';
    } catch (error) {
        sessionStorage.removeItem('hospital_sesion_activa');
        sesionActual = null;
        console.error("Error Auth:", error);
        let mensaje = "Correo o contraseña incorrectos.";
        if (error.code === 'auth/too-many-requests') {
            mensaje = "Demasiados intentos fallidos. Espere unos minutos o intente más tarde.";
        } else if (error.code === 'auth/operation-not-allowed') {
            mensaje = "El proveedor de Correo/Contraseña no está habilitado en Firebase Authentication.";
        }
        mostrarAlerta("Acceso Denegado", mensaje);
    }
}

function aplicarPermisosVisuales(sesion) {
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
        // Exclusivo para Nacho (SuperAdmin del sistema): acceso y visibilidad total a todos los paneles
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
        if (!sesionActual || sessionStorage.getItem('hospital_sesion_activa') !== 'true') {
            mostrarPantallaLogin();
            return;
        }

        const esNacho = (sesionActual.correo && sesionActual.correo.toLowerCase() === "nachohelbas@gmail.com");
        const rol = sesionActual.rol;

        let permitido = false;
        if (esNacho) {
            // Nacho tiene acceso irrestricto a todas las vistas
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
        if (fechaRecepcionSeleccionada) generarAgendaRecepcion();
    }
    if (viewName === 'doctor') {
        cargarAgendaMedico();
    }
    if (viewName === 'admin') {
        cargarUsuariosAdmin('init');
        verificarLimpiezaAnual();
    }
}

export async function cerrarSesionReal() {
    sessionStorage.removeItem('hospital_sesion_activa');
    sesionActual = null;
    await signOut(auth);
    mostrarPantallaLogin();
}

// ==========================================
// INICIALIZACIÓN DE DATOS DEL STAFF
// ==========================================
async function iniciarModuloStaff() {
    establecerLimitesFecha(['input-fecha-recepcion']);
    await cargarEspecialistasFirebase();
    await cargarConfiguracionModulacion();
}

async function cargarEspecialistasFirebase() {
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

async function cargarConfiguracionModulacion() {
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
    } catch (e) {
        console.log("Configuración por defecto cargada.");
    }
}

// ==========================================
// RECEPCIÓN
// ==========================================
export function actualizarMedicosRecepcion() {
    const esp = document.getElementById('reception-especialidad')?.value;
    const selectMed = document.getElementById('reception-medico');
    if (!selectMed) return;

    if (!esp) {
        selectMed.innerHTML = '<option value="">Primero seleccione especialidad</option>';
        selectMed.disabled = true;
        selectMed.classList.add('bg-slate-50', 'text-slate-500');
        return;
    }

    const medicos = bdMedicosDinamica[esp] || [];
    selectMed.disabled = false;
    selectMed.classList.remove('bg-slate-50', 'text-slate-500');
    let opts = '<option value="">-- Elija un profesional --</option>';
    medicos.forEach(m => {
        opts += `<option value="${escaparHTML(m.nombre)}" data-uid="${escaparHTML(m.uid)}">${escaparHTML(m.nombre)}</option>`;
    });
    selectMed.innerHTML = opts;
}

export function buscarAgendaRecepcion() {
    especialidadSeleccionadaRecepcion = document.getElementById('reception-especialidad')?.value;
    const selectMed = document.getElementById('reception-medico');
    medicoSeleccionadoRecepcion = selectMed?.value;
    const selectedOption = selectMed ? selectMed.options[selectMed.selectedIndex] : null;
    medicoUidSeleccionadoRecepcion = selectedOption ? (selectedOption.getAttribute('data-uid') || '') : '';
    fechaRecepcionSeleccionada = document.getElementById('input-fecha-recepcion')?.value;

    if (!especialidadSeleccionadaRecepcion || !medicoSeleccionadoRecepcion || !fechaRecepcionSeleccionada) {
        mostrarAlerta("Datos Faltantes", "Seleccione especialidad, médico y fecha para consultar la agenda.");
        return;
    }

    generarAgendaRecepcion();
}

export async function generarAgendaRecepcion() {
    const contenedor = document.getElementById('contenedor-grilla-recepcion');
    const tbody = document.getElementById('reception-tbody');
    const titulo = document.getElementById('titulo-agenda-recepcion');

    if (!contenedor || !tbody) return;

    if (titulo) {
        titulo.innerText = `Agenda: ${medicoSeleccionadoRecepcion} (${fechaRecepcionSeleccionada})`;
    }
    contenedor.classList.remove('hidden');
    tbody.innerHTML = '<tr><td colspan="5" class="p-6 text-center text-slate-400">Cargando turnos...</td></tr>';

    let turnosOcupados = {};
    try {
        const q = query(
            collection(db, "turnos"),
            where("medico", "==", medicoSeleccionadoRecepcion),
            where("fecha", "==", fechaRecepcionSeleccionada)
        );
        const snap = await getDocs(q);
        snap.forEach(d => {
            const data = d.data();
            data.idDoc = d.id;
            turnosOcupados[data.horario] = data;
        });
    } catch (e) {
        console.error("Error al cargar turnos de recepción:", e);
    }

    const duracionActual = modulacionPorMedico[medicoSeleccionadoRecepcion] || duracionTurnoGlobal;
    let minBucle = 7 * 60;
    const finBucle = 12 * 60 + 30;
    let esCanalWeb = true;
    let filas = '';

    while (minBucle <= finBucle) {
        let h = Math.floor(minBucle / 60);
        let m = minBucle % 60;
        let hsStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
        let canal = esCanalWeb ? "Web" : "Presencial";
        let turno = turnosOcupados[hsStr];

        if (turno) {
            let badgeColor = "bg-blue-100 text-blue-800";
            if (turno.estado === "Atendido") badgeColor = "bg-emerald-100 text-emerald-800";
            else if (turno.estado === "En Espera") badgeColor = "bg-teal-100 text-teal-800";
            else if (turno.estado && turno.estado.includes("Cancelado")) badgeColor = "bg-red-100 text-red-800";
            else if (turno.estado === "Ausente") badgeColor = "bg-amber-100 text-amber-800";

            filas += `
                <tr class="border-b border-slate-100 hover:bg-slate-50 transition">
                    <td class="p-3 font-mono font-bold text-slate-700">${hsStr}</td>
                    <td class="p-3 text-xs font-semibold text-slate-500">${escaparHTML(turno.canal || canal)}</td>
                    <td class="p-3">
                        <p class="font-bold text-slate-800">${escaparHTML(turno.pacienteNombre)}</p>
                        <p class="text-xs text-slate-500">DNI: ${escaparHTML(turno.pacienteDni || 'N/A')} - Tel: ${escaparHTML(turno.pacienteCelular || 'N/A')}</p>
                    </td>
                    <td class="p-3"><span class="px-2 py-1 rounded text-xs font-bold ${badgeColor}">${escaparHTML(turno.estado)}</span></td>
                    <td class="p-3">
                        ${turno.estado === "Confirmado" || turno.estado === "Confirmado Presencial" ? `
                            <button onclick="registrarLlegadaRecepcion('${turno.idDoc}')" class="text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-1 rounded hover:bg-emerald-100 font-bold transition mr-1">Registrar llegada</button>
                            <button onclick="cancelarTurnoRecepcion('${turno.idDoc}')" class="text-xs bg-red-50 text-red-600 border border-red-200 px-2 py-1 rounded hover:bg-red-100 font-bold transition">Liberar</button>
                        ` : (turno.estado === "En Espera" ? `
                            <span class="text-[11px] font-bold text-teal-700 bg-teal-50 px-2 py-1 rounded border border-teal-200 inline-block mr-1">En Sala</span>
                            <button onclick="cancelarTurnoRecepcion('${turno.idDoc}')" class="text-xs bg-red-50 text-red-600 border border-red-200 px-2 py-1 rounded hover:bg-red-100 font-bold transition">Liberar</button>
                        ` : '')}
                    </td>
                </tr>
            `;
        } else {
            filas += `
                <tr class="border-b border-slate-100 hover:bg-slate-50 transition">
                    <td class="p-3 font-mono font-bold text-slate-400">${hsStr}</td>
                    <td class="p-3 text-xs font-semibold text-slate-400">${canal}</td>
                    <td class="p-3 text-sm text-slate-400 italic">Disponible</td>
                    <td class="p-3"><span class="px-2 py-1 rounded text-xs font-bold bg-slate-100 text-slate-500">Libre</span></td>
                    <td class="p-3">
                        <button onclick="abrirModalDarTurno('${hsStr}')" class="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-1 rounded hover:bg-blue-100 font-bold transition">+ Asignar</button>
                    </td>
                </tr>
            `;
        }

        esCanalWeb = !esCanalWeb;
        minBucle += duracionActual;
    }

    tbody.innerHTML = filas;
}

export async function registrarLlegadaRecepcion(idDoc) {
    try {
        await updateDoc(doc(db, "turnos", idDoc), {
            estado: "En Espera",
            llegadaEn: serverTimestamp()
        });
        mostrarExito("Llegada Registrada", "El paciente fue ingresado en la Sala de Espera.");
        generarAgendaRecepcion();
    } catch (e) {
        console.error("Error al registrar llegada:", e);
        mostrarAlerta("Error", "No se pudo registrar la llegada del paciente.");
    }
}

export function abrirModalDarTurno(hora) {
    horaSeleccionadaRecepcion = hora;
    const horaSpan = document.getElementById('modal-hora-turno');
    if (horaSpan) horaSpan.innerText = hora;
    abrirModal('modal-dar-turno');
}

export async function confirmarTurnoRecepcionFirebase() {
    const dni = document.getElementById('auto-dni').value.trim();
    const nombre = document.getElementById('auto-nombre').value.trim();
    const celular = document.getElementById('auto-celular').value.trim();
    const email = document.getElementById('auto-email').value.trim();

    if (!nombre || !celular) {
        mostrarAlerta("Datos Obligatorios", "Nombre y celular son obligatorios.");
        return;
    }
    if (dni && !/^[0-9]{6,10}$/.test(dni)) {
        mostrarAlerta("DNI Inválido", "El DNI debe contener solo números (6 a 10 dígitos).");
        return;
    }
    if (!/^[0-9+ -]{6,20}$/.test(celular)) {
        mostrarAlerta("Celular Inválido", "Ingrese un número de teléfono válido.");
        return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        mostrarAlerta("Correo Inválido", "El formato del correo es incorrecto.");
        return;
    }

    try {
        const qExistente = query(
            collection(db, "turnos"),
            where("medico", "==", medicoSeleccionadoRecepcion),
            where("fecha", "==", fechaRecepcionSeleccionada),
            where("horario", "==", horaSeleccionadaRecepcion)
        );
        const snap = await getDocs(qExistente);
        const ocupado = snap.docs.some(d => {
            const est = d.data().estado;
            return !est || !est.toLowerCase().includes("cancelado");
        });

        if (ocupado) {
            mostrarAlerta("Horario No Disponible", "Este horario ya fue asignado previamente.");
            generarAgendaRecepcion();
            return;
        }

        const medUid = medicoUidSeleccionadoRecepcion || 'medico_demo';
        const slotId = `${medUid}_${fechaRecepcionSeleccionada}_${horaSeleccionadaRecepcion.replace(':', '')}`;
        const slotRef = doc(db, "disponibilidad", slotId);
        const turnoRef = doc(collection(db, "turnos"));

        const batch = writeBatch(db);
        batch.set(slotRef, {
            medicoUid: medUid,
            fecha: fechaRecepcionSeleccionada,
            horario: horaSeleccionadaRecepcion,
            creadoEn: serverTimestamp()
        });

        batch.set(turnoRef, {
            especialidad: especialidadSeleccionadaRecepcion,
            medico: medicoSeleccionadoRecepcion,
            medicoUid: medUid,
            fecha: fechaRecepcionSeleccionada,
            horario: horaSeleccionadaRecepcion,
            pacienteNombre: nombre,
            pacienteDni: dni,
            pacienteCelular: celular,
            pacienteEmail: email || "",
            canal: "Presencial",
            estado: "Confirmado Presencial",
            codigoConfirmacion: turnoRef.id,
            creadoEn: serverTimestamp(),
            creadoPor: sesionActual?.uid || null,
            llegadaEn: null,
            inicioConsultaEn: null,
            finConsultaEn: null,
            canceladoPor: null,
            canceladoEn: null,
            reprogramadoDe: null,
            timestamp: serverTimestamp()
        });

        await batch.commit();

        cerrarModal('modal-dar-turno');
        mostrarExito("¡Turno Asignado!", "El turno presencial fue registrado.");
        document.getElementById('auto-dni').value = '';
        document.getElementById('auto-nombre').value = '';
        document.getElementById('auto-celular').value = '';
        document.getElementById('auto-email').value = '';
        generarAgendaRecepcion();
    } catch (error) {
        console.error(error);
        mostrarAlerta("Error", "Error al registrar el turno.");
    }
}

export async function cancelarTurnoRecepcion(idDoc) {
    const confirmado = await pedirConfirmacion("¿Liberar Horario?", "Se cancelará el turno de la agenda.", "Sí, liberar");
    if (!confirmado) return;

    try {
        const snapT = await getDoc(doc(db, "turnos", idDoc));
        const batch = writeBatch(db);
        batch.update(doc(db, "turnos", idDoc), {
            estado: "Cancelado en Recepción",
            canceladoEn: serverTimestamp(),
            canceladoPor: "recepcion"
        });
        if (snapT.exists()) {
            const dataT = snapT.data();
            const slotId = `${dataT.medicoUid || medicoUidSeleccionadoRecepcion}_${dataT.fecha}_${dataT.horario.replace(':', '')}`;
            batch.delete(doc(db, "disponibilidad", slotId));
        }
        await batch.commit();
        mostrarExito("Turno Cancelado", "El turno fue cancelado.");
        generarAgendaRecepcion();
    } catch (error) {
        console.error(error);
        mostrarAlerta("Error", "No se pudo cancelar el turno.");
    }
}

export async function ejecutarAusenciaEmergencia() {
    if (!fechaRecepcionSeleccionada || !medicoSeleccionadoRecepcion) {
        mostrarAlerta("Faltan datos", "Seleccione profesional y fecha primero.");
        return;
    }
    const alcance = document.getElementById('select-alcance-ausencia').value;
    const horaDesde = document.getElementById('hora-desde-ausencia').value;
    const motivo = document.getElementById('motivo-ausencia').value || "Emergencia Médica";

    if (alcance === 'desde_hora' && !horaDesde) {
        mostrarAlerta("Hora Requerida", "Indique la hora a partir de la cual se suspende.");
        return;
    }

    try {
        const snap = await getDocs(query(collection(db, "turnos"), where("fecha", "==", fechaRecepcionSeleccionada)));
        let turnosCancelados = 0;
        const promesas = [];

        snap.forEach((documento) => {
            const t = documento.data();
            if (t.medico === medicoSeleccionadoRecepcion && (!t.estado || !t.estado.includes("Cancelado"))) {
                let cancelar = (alcance === 'todo_dia') || (alcance === 'desde_hora' && t.horario >= horaDesde);
                if (cancelar) {
                    promesas.push(updateDoc(doc(db, "turnos", documento.id), {
                        estado: "Cancelado: " + motivo,
                        canceladoEn: serverTimestamp(),
                        canceladoPor: "recepcion"
                    }));
                    turnosCancelados++;
                }
            }
        });

        await Promise.all(promesas);
        cerrarModal('modal-ausencia-emergencia');
        mostrarExito("Agenda Suspendida", `Se han bloqueado ${turnosCancelados} turnos.`);
        generarAgendaRecepcion();
    } catch (error) {
        console.error(error);
        mostrarAlerta("Error Crítico", "Fallo durante la suspensión.");
    }
}

export function toggleTimeSelector() {
    const alcance = document.getElementById('select-alcance-ausencia')?.value;
    const divHora = document.getElementById('div-hora-ausencia');
    if (divHora) {
        if (alcance === 'desde_hora') divHora.classList.remove('hidden');
        else divHora.classList.add('hidden');
    }
}

export async function simularAutocompletado(dni) {
    if (!dni || dni.length < 6) return;
    try {
        const snap = await getDocs(query(collection(db, "turnos"), where("pacienteDni", "==", dni), limit(1)));
        if (!snap.empty) {
            const d = snap.docs[0].data();
            const nomEl = document.getElementById('auto-nombre');
            const celEl = document.getElementById('auto-celular');
            const mailEl = document.getElementById('auto-email');
            const msgEl = document.getElementById('auto-msg');
            if (nomEl && !nomEl.value) nomEl.value = d.pacienteNombre || '';
            if (celEl && !celEl.value) celEl.value = d.pacienteCelular || '';
            if (mailEl && !mailEl.value) mailEl.value = d.pacienteEmail || '';
            if (msgEl) msgEl.classList.remove('hidden');
        }
    } catch (e) {
        // Silencioso
    }
}

export function descargarExcelRecepcion() {
    if (typeof XLSX === 'undefined') {
        mostrarAlerta("Librería no cargada", "SheetJS no está disponible para exportar a Excel.");
        return;
    }
    const tabla = document.querySelector("#contenedor-grilla-recepcion table");
    if (!tabla) return;
    const wb = XLSX.utils.table_to_book(tabla, { sheet: "Agenda Recepcion" });
    XLSX.writeFile(wb, `Agenda_${medicoSeleccionadoRecepcion}_${fechaRecepcionSeleccionada}.xlsx`);
}

// ==========================================
// CONSULTORIO MÉDICO
// ==========================================
export async function cargarAgendaMedico() {
    const container = document.getElementById('medico-agenda-container');
    const tituloContainer = document.getElementById('titulo-medico-dashboard-container');
    const tituloDashboard = document.getElementById('titulo-medico-dashboard');

    if (!container) return;

    const esNacho = (sesionActual?.correo && sesionActual.correo.toLowerCase() === "nachohelbas@gmail.com");
    const nombreMedico = sesionActual?.nombre || sesionActual?.correo;
    if (tituloContainer) tituloContainer.classList.remove('hidden');
    if (tituloDashboard) {
        tituloDashboard.innerText = esNacho ? `Consultorio Médico (Modo Foro - Nacho)` : `Consultorio: ${nombreMedico}`;
    }

    container.innerHTML = '<p class="text-sm text-slate-400 text-center mt-10">Cargando pacientes del día...</p>';

    const hoyStr = new Date().toISOString().split('T')[0];

    try {
        let q;
        if (esNacho || sesionActual?.rol === "Administración") {
            // En modo presentación, cargar los turnos de hoy para que la Sala de Espera esté activa al 100%
            q = query(
                collection(db, "turnos"),
                where("fecha", "==", hoyStr)
            );
        } else {
            q = query(
                collection(db, "turnos"),
                where("medico", "==", nombreMedico),
                where("fecha", "==", hoyStr)
            );
        }
        const snap = await getDocs(q);

        if (snap.empty) {
            container.innerHTML = '<p class="text-sm text-slate-500 text-center mt-10">No hay turnos programados para hoy.</p>';
            return;
        }

        let lista = [];
        snap.forEach(d => {
            const data = d.data();
            data.idDoc = d.id;
            lista.push(data);
        });
        lista.sort((a, b) => a.horario.localeCompare(b.horario));

        let html = '';
        lista.forEach(t => {
            const esAtendido = t.estado === "Atendido";
            const esAusente = t.estado === "Ausente";
            const esCancelado = t.estado && t.estado.includes("Cancelado");

            let badge = `<span class="text-xs px-2 py-0.5 rounded font-bold bg-teal-100 text-teal-800">${escaparHTML(t.estado)}</span>`;
            if (esAtendido) badge = `<span class="text-xs px-2 py-0.5 rounded font-bold bg-emerald-100 text-emerald-800">Atendido</span>`;
            if (esAusente) badge = `<span class="text-xs px-2 py-0.5 rounded font-bold bg-amber-100 text-amber-800">Ausente</span>`;
            if (esCancelado) badge = `<span class="text-xs px-2 py-0.5 rounded font-bold bg-red-100 text-red-800">Cancelado</span>`;

            html += `
                <div class="bg-white p-3 rounded-lg border border-slate-200 shadow-sm flex justify-between items-center gap-2">
                    <div>
                        <div class="flex items-center gap-2">
                            <span class="font-mono font-bold text-sm text-emerald-900">${t.horario} hs</span>
                            ${badge}
                        </div>
                        <p class="font-bold text-sm text-slate-800 mt-1">${escaparHTML(t.pacienteNombre)}</p>
                        <p class="text-xs text-slate-500">DNI: ${escaparHTML(t.pacienteDni || 'N/A')}</p>
                    </div>
                    <div class="flex flex-col gap-1">
                        ${!esAtendido && !esAusente && !esCancelado ? `
                            <button onclick="llamarPaciente('${t.idDoc}')" class="text-xs bg-emerald-700 text-white font-bold px-3 py-1.5 rounded hover:bg-emerald-800 transition">Llamar</button>
                            <button onclick="marcarAusente('${t.idDoc}')" class="text-xs bg-slate-100 text-slate-600 font-bold px-2 py-1 rounded hover:bg-slate-200 transition">Ausente</button>
                        ` : ''}
                    </div>
                </div>
            `;
        });

        container.innerHTML = html;
    } catch (e) {
        console.error(e);
        container.innerHTML = '<p class="text-sm text-red-500 text-center mt-10">Error al cargar pacientes.</p>';
    }
}

// ==========================================
// HISTORIA CLÍNICA INMUTABLE Y CONSULTORIO MÉDICO
// ==========================================
let pacienteActivoHC = null;
let consultasHistoriaClinica = [];

function calcularEdad(fechaNacimientoStr) {
    if (!fechaNacimientoStr) return 'N/A';
    const cumple = new Date(fechaNacimientoStr);
    const hoy = new Date();
    let edad = hoy.getFullYear() - cumple.getFullYear();
    const m = hoy.getMonth() - cumple.getMonth();
    if (m < 0 || (m === 0 && hoy.getDate() < cumple.getDate())) {
        edad--;
    }
    return edad >= 0 ? `${edad} años` : 'N/A';
}

function generarIdCripto(prefijo = 'DOC', longitud = 20) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    const array = new Uint8Array(longitud);
    window.crypto.getRandomValues(array);
    let id = '';
    for (let i = 0; i < longitud; i++) {
        id += chars[array[i] % chars.length];
    }
    return `${prefijo}_${id}`;
}

export async function buscarPacientePorDni(dniParam) {
    const inputDni = document.getElementById('input-buscar-dni-medico');
    const dni = (dniParam || (inputDni ? inputDni.value : '')).trim();

    if (!/^[0-9]{6,10}$/.test(dni)) {
        mostrarAlerta("DNI Inválido", "Ingrese un número de documento válido de entre 6 y 10 dígitos numéricos.");
        return;
    }

    try {
        const dniDocSnap = await getDoc(doc(db, "pacientes_por_dni", dni));
        if (!dniDocSnap.exists()) {
            const crear = await pedirConfirmacion(
                "Paciente no encontrado",
                `No existe historia clínica registrada para el DNI ${dni}. ¿Desea crear la ficha demográfica inicial del paciente?`,
                "Crear Ficha"
            );
            if (!crear) return;

            const nuevoPacienteId = generarIdCripto('PAC', 20);
            const batch = writeBatch(db);

            batch.set(doc(db, "pacientes_por_dni", dni), {
                pacienteId: nuevoPacienteId,
                dni: dni,
                creadoEn: serverTimestamp()
            });

            batch.set(doc(db, "pacientes", nuevoPacienteId), {
                dni: dni,
                nombre: "Paciente",
                apellido: `DNI ${dni}`,
                fechaNacimiento: "1990-01-01",
                sexo: "No especificado",
                contacto: { celular: "", email: "" },
                creadoEn: serverTimestamp(),
                creadoPor: sesionActual ? sesionActual.uid : "staff",
                esDemo: true
            });

            if (sesionActual) {
                batch.set(doc(db, "pacientes", nuevoPacienteId, "acceso", sesionActual.uid), {
                    medicoUid: sesionActual.uid,
                    creadoEn: serverTimestamp(),
                    motivoEmergencia: "Alta inicial de paciente por consultorio"
                });

                batch.set(doc(collection(db, "auditoria")), {
                    actorUid: sesionActual.uid,
                    actorRol: sesionActual.rol || "Médico",
                    accion: "ALTA_PACIENTE_HC",
                    pacienteId: nuevoPacienteId,
                    fecha: serverTimestamp(),
                    detalle: `Alta demográfica para DNI ${dni}`
                });
            }

            await batch.commit();
            await abrirFichaPacienteHC(nuevoPacienteId);
            return;
        }

        const pacienteId = dniDocSnap.data().pacienteId;
        await abrirFichaPacienteHC(pacienteId);
    } catch (e) {
        console.error("Error al buscar paciente:", e);
        mostrarAlerta("Error de Consulta", "No se pudo acceder a la historia clínica del paciente. Verifique permisos.");
    }
}

export async function abrirFichaPacienteHC(pacienteId, turnoId = null) {
    try {
        const pacSnap = await getDoc(doc(db, "pacientes", pacienteId));
        if (!pacSnap.exists()) {
            mostrarAlerta("Error", "Ficha de paciente no encontrada.");
            return;
        }

        const pacData = pacSnap.data();
        pacienteActivoHC = { id: pacienteId, ...pacData, turnoId };

        if (sesionActual && sesionActual.uid) {
            const accesoRef = doc(db, "pacientes", pacienteId, "acceso", sesionActual.uid);
            const accesoSnap = await getDoc(accesoRef);
            if (!accesoSnap.exists()) {
                await setDoc(accesoRef, {
                    medicoUid: sesionActual.uid,
                    turnoId: turnoId || "consulta_directa",
                    creadoEn: serverTimestamp()
                });
            }

            await addDoc(collection(db, "auditoria"), {
                actorUid: sesionActual.uid,
                actorRol: sesionActual.rol || "Médico",
                accion: "LECTURA_HISTORIA_CLINICA",
                pacienteId: pacienteId,
                fecha: serverTimestamp(),
                detalle: `Apertura de historia clínica de ${pacData.nombre} ${pacData.apellido}`
            }).catch(() => {});
        }

        const cabecera = document.getElementById('cabecera-paciente-hc');
        if (cabecera) cabecera.classList.remove('hidden');

        const iniciales = (pacData.nombre ? pacData.nombre[0] : '') + (pacData.apellido ? pacData.apellido[0] : '');
        const elInit = document.getElementById('hc-paciente-iniciales');
        if (elInit) elInit.innerText = iniciales.toUpperCase() || 'HC';

        const elNom = document.getElementById('hc-paciente-nombre');
        if (elNom) elNom.innerText = `${pacData.nombre} ${pacData.apellido}`;

        const elDni = document.getElementById('hc-paciente-dni');
        if (elDni) elDni.innerText = pacData.dni || 'S/D';

        const elEdad = document.getElementById('hc-paciente-edad');
        if (elEdad) elEdad.innerText = calcularEdad(pacData.fechaNacimiento);

        const elSexo = document.getElementById('hc-paciente-sexo');
        if (elSexo) elSexo.innerText = pacData.sexo || 'No especificado';

        const elContacto = document.getElementById('hc-paciente-contacto');
        if (elContacto) elContacto.innerText = pacData.contacto?.celular || pacData.contacto?.email || 'Sin contacto';

        const badgeDemo = document.getElementById('hc-paciente-badge-demo');
        if (badgeDemo) {
            badgeDemo.classList.toggle('hidden', !pacData.esDemo);
        }

        await cargarResumenClinico(pacienteId);

        const labelActivo = document.getElementById('medico-paciente-activo');
        if (labelActivo) {
            labelActivo.innerText = `Atendiendo a: ${pacData.nombre} ${pacData.apellido} (DNI ${pacData.dni})`;
        }
        const badgeTurno = document.getElementById('badge-turno-en-curso');
        if (badgeTurno) {
            badgeTurno.classList.toggle('hidden', !turnoId);
        }

        await cargarCronologiaConsultas(pacienteId);

    } catch (e) {
        console.error("Error abriendo ficha clínica:", e);
        mostrarAlerta("Acceso Restringido", "No posee habilitación de acceso a la historia clínica de este paciente.");
    }
}

export async function cargarResumenClinico(pacienteId) {
    const elAlergias = document.getElementById('hc-alergias-texto');
    const elAntecedentes = document.getElementById('hc-antecedentes-texto');
    const elMedicacion = document.getElementById('hc-medicacion-texto');

    try {
        const snap = await getDoc(doc(db, "pacientes", pacienteId, "clinico", "resumen"));
        if (snap.exists()) {
            const data = snap.data();
            if (elAlergias) elAlergias.innerText = data.alergias || 'Sin alergias registradas';
            if (elAntecedentes) elAntecedentes.innerText = data.antecedentes || 'Ninguno informado';
            if (elMedicacion) elMedicacion.innerText = data.medicacion || 'Sin medicación regular';
        } else {
            if (elAlergias) elAlergias.innerText = 'Sin alergias registradas';
            if (elAntecedentes) elAntecedentes.innerText = 'Ninguno informado';
            if (elMedicacion) elMedicacion.innerText = 'Sin medicación regular';
        }
    } catch (e) {
        console.warn("Fallo lectura de resumen clínico:", e);
    }
}

export async function cargarCronologiaConsultas(pacienteId) {
    const container = document.getElementById('contenedor-cronologia-consultas');
    const badgeTotal = document.getElementById('badge-total-consultas');
    if (!container) return;

    container.innerHTML = '<p class="text-xs text-slate-400 text-center py-4">Cargando cronología médica...</p>';

    try {
        const q = query(
            collection(db, "pacientes", pacienteId, "consultas"),
            orderBy("fecha", "desc")
        );
        const snap = await getDocs(q);

        if (snap.empty) {
            container.innerHTML = '<p class="text-sm text-slate-500 text-center py-6">No hay consultas previas registradas para este paciente.</p>';
            if (badgeTotal) badgeTotal.innerText = '0 consultas';
            consultasHistoriaClinica = [];
            return;
        }

        consultasHistoriaClinica = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        if (badgeTotal) badgeTotal.innerText = `${consultasHistoriaClinica.length} consulta${consultasHistoriaClinica.length !== 1 ? 's' : ''}`;

        const idsRectificados = new Set();
        consultasHistoriaClinica.forEach(c => {
            if (c.corrige) idsRectificados.add(c.corrige);
        });

        let html = '';
        consultasHistoriaClinica.forEach(c => {
            const fechaStr = c.fecha?.toDate ? c.fecha.toDate().toLocaleString('es-AR') : (c.fecha || 'Fecha N/D');
            const esRectificada = idsRectificados.has(c.id);
            const esRectificacion = Boolean(c.corrige);

            let signosBadges = '';
            if (c.signosVitales && typeof c.signosVitales === 'object') {
                const sv = c.signosVitales;
                if (sv.ta) signosBadges += `<span class="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[11px] font-mono">TA: ${escaparHTML(sv.ta)}</span>`;
                if (sv.fc) signosBadges += `<span class="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[11px] font-mono">FC: ${escaparHTML(sv.fc)} lpm</span>`;
                if (sv.temp) signosBadges += `<span class="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[11px] font-mono">Temp: ${escaparHTML(sv.temp)}°C</span>`;
                if (sv.sat) signosBadges += `<span class="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[11px] font-mono">Sat: ${escaparHTML(sv.sat)}%</span>`;
                if (sv.peso) signosBadges += `<span class="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[11px] font-mono">${escaparHTML(sv.peso)} kg</span>`;
            }

            html += `
                <div class="border ${esRectificada ? 'border-amber-300 bg-amber-50/30' : 'border-slate-200 bg-white'} rounded-xl p-4 shadow-sm space-y-3">
                    <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-slate-100 pb-2">
                        <div class="flex items-center gap-2 flex-wrap">
                            <span class="text-xs font-mono font-bold text-emerald-950 bg-emerald-50 px-2.5 py-1 rounded">${escaparHTML(fechaStr)}</span>
                            <span class="text-xs font-semibold text-slate-700">${escaparHTML(c.medicoNombre || 'Médico')}</span>
                            ${esRectificacion ? `<span class="text-[11px] font-bold bg-teal-100 text-teal-800 px-2 py-0.5 rounded">Rectificación de consulta</span>` : ''}
                            ${esRectificada ? `<span class="text-[11px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded">Rectificada por entrada posterior</span>` : ''}
                        </div>
                        <div class="flex items-center gap-2">
                            <span class="text-[11px] bg-slate-100 text-slate-500 font-mono px-2 py-0.5 rounded">Inmutable</span>
                            <button onclick="abrirModalRectificar('${c.id}')" class="text-xs text-emerald-700 hover:text-emerald-900 font-bold border border-emerald-200 px-2 py-1 rounded bg-emerald-50/50 hover:bg-emerald-100 transition">
                                Rectificar
                            </button>
                        </div>
                    </div>

                    <div>
                        <p class="text-xs font-bold text-slate-500 uppercase tracking-wider">Motivo de Consulta</p>
                        <p class="text-sm text-slate-900 font-medium">${escaparHTML(c.motivo || 'No especificado')}</p>
                    </div>

                    ${c.diagnostico ? `
                        <div>
                            <p class="text-xs font-bold text-slate-500 uppercase tracking-wider">Diagnóstico</p>
                            <p class="text-sm font-bold text-slate-800">${escaparHTML(c.diagnostico)}</p>
                        </div>
                    ` : ''}

                    ${signosBadges ? `
                        <div>
                            <p class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Signos Vitales</p>
                            <div class="flex flex-wrap gap-1.5">${signosBadges}</div>
                        </div>
                    ` : ''}

                    <div>
                        <p class="text-xs font-bold text-slate-500 uppercase tracking-wider">Evolución y Examen Clínico</p>
                        <p class="text-sm text-slate-700 whitespace-pre-line bg-slate-50 p-3 rounded-lg border border-slate-100 mt-1">${escaparHTML(c.evolucion || '')}</p>
                    </div>

                    ${c.indicaciones ? `
                        <div>
                            <p class="text-xs font-bold text-slate-500 uppercase tracking-wider">Indicaciones / Tratamiento</p>
                            <p class="text-sm text-slate-800 italic bg-emerald-50/50 p-2.5 rounded-lg border border-emerald-100 mt-1">${escaparHTML(c.indicaciones)}</p>
                        </div>
                    ` : ''}
                </div>
            `;
        });

        container.innerHTML = html;
    } catch (e) {
        console.error("Error al cargar consultas:", e);
        container.innerHTML = '<p class="text-sm text-red-500 text-center py-4">Error al cargar la cronología de consultas.</p>';
    }
}

export async function guardarConsultaInmutable() {
    if (!pacienteActivoHC) {
        mostrarAlerta("Ningún Paciente", "Seleccione o busque a un paciente antes de registrar una consulta.");
        return;
    }

    const motivo = document.getElementById('input-motivo-consulta')?.value.trim();
    const diagnostico = document.getElementById('input-diagnostico-consulta')?.value.trim();
    const evolucion = document.getElementById('texto-evolucion')?.value.trim();
    const indicaciones = document.getElementById('texto-indicaciones')?.value.trim();

    if (!motivo || !diagnostico || !evolucion) {
        mostrarAlerta("Campos Obligatorios", "Motivo de consulta, diagnóstico y evolución son obligatorios.");
        return;
    }

    const confirmado = await pedirConfirmacion(
        "Confirmar Consulta Inmutable",
        "Conforme a la Ley 26.529, esta consulta quedará asentada de forma permanente y NO podrá ser editada ni eliminada. ¿Desea registrarla definitivamente?",
        "Sí, Registrar Inmutable"
    );
    if (!confirmado) return;

    const signosVitales = {
        ta: document.getElementById('sv-ta')?.value.trim() || '',
        fc: document.getElementById('sv-fc')?.value.trim() || '',
        temp: document.getElementById('sv-temp')?.value.trim() || '',
        sat: document.getElementById('sv-sat')?.value.trim() || '',
        peso: document.getElementById('sv-peso')?.value.trim() || '',
        talla: document.getElementById('sv-talla')?.value.trim() || ''
    };

    try {
        const consultaId = generarIdCripto('CONS', 20);
        const consultaRef = doc(db, "pacientes", pacienteActivoHC.id, "consultas", consultaId);
        const batch = writeBatch(db);

        batch.set(consultaRef, {
            turnoId: pacienteActivoHC.turnoId || '',
            medicoUid: sesionActual ? sesionActual.uid : 'medico_demo',
            medicoNombre: sesionActual ? sesionActual.nombre : 'Profesional Médico',
            fecha: serverTimestamp(),
            motivo: motivo,
            diagnostico: diagnostico,
            diagnosticoCodigo: '',
            evolucion: evolucion,
            indicaciones: indicaciones,
            signosVitales: signosVitales,
            corrige: null
        });

        if (pacienteActivoHC.turnoId) {
            const turnoRef = doc(db, "turnos", pacienteActivoHC.turnoId);
            batch.update(turnoRef, {
                estado: "Atendido",
                atendidoEn: serverTimestamp(),
                finConsultaEn: serverTimestamp(),
                pacienteId: pacienteActivoHC.id
            });
        }

        const auditRef = doc(collection(db, "auditoria"));
        batch.set(auditRef, {
            actorUid: sesionActual ? sesionActual.uid : 'anon',
            actorRol: sesionActual ? sesionActual.rol : 'Médico',
            accion: "CONSULTA_MEDICA_REGISTRADA",
            pacienteId: pacienteActivoHC.id,
            consultaId: consultaId,
            fecha: serverTimestamp(),
            detalle: `Consulta registrada: ${motivo}`
        });

        await batch.commit();

        mostrarExito("Consulta Asentada", "La consulta fue incorporada a la historia clínica de forma inmutable.");

        document.getElementById('input-motivo-consulta').value = '';
        document.getElementById('input-diagnostico-consulta').value = '';
        document.getElementById('texto-evolucion').value = '';
        document.getElementById('texto-indicaciones').value = '';
        document.getElementById('sv-ta').value = '';
        document.getElementById('sv-fc').value = '';
        document.getElementById('sv-temp').value = '';
        document.getElementById('sv-sat').value = '';
        document.getElementById('sv-peso').value = '';
        document.getElementById('sv-talla').value = '';

        await cargarCronologiaConsultas(pacienteActivoHC.id);
        cargarAgendaMedico();

    } catch (e) {
        console.error("Error guardando consulta:", e);
        mostrarAlerta("Error al Guardar", "No se pudo registrar la consulta médica. Verifique permisos.");
    }
}

export function abrirModalRectificar(consultaId) {
    const consulta = consultasHistoriaClinica.find(c => c.id === consultaId);
    if (!consulta) return;

    document.getElementById('rectificar-consulta-original-id').value = consultaId;
    const fechaStr = consulta.fecha?.toDate ? consulta.fecha.toDate().toLocaleString('es-AR') : (consulta.fecha || '');
    const resumenEl = document.getElementById('rectificar-resumen-original');
    if (resumenEl) {
        resumenEl.innerText = `ID: ${consultaId} | Fecha: ${fechaStr} | Motivo: ${consulta.motivo} | Evolución previa: ${consulta.evolucion?.substring(0, 100) || ''}...`;
    }

    document.getElementById('rectificar-motivo').value = '';
    document.getElementById('rectificar-evolucion').value = '';
    document.getElementById('rectificar-indicaciones').value = '';

    abrirModal('modal-rectificar-consulta');
}

export async function guardarRectificacionInmutable() {
    const originalId = document.getElementById('rectificar-consulta-original-id')?.value;
    const motivo = document.getElementById('rectificar-motivo')?.value.trim();
    const evolucion = document.getElementById('rectificar-evolucion')?.value.trim();
    const indicaciones = document.getElementById('rectificar-indicaciones')?.value.trim();

    if (!motivo || !evolucion) {
        mostrarAlerta("Datos Faltantes", "Motivo de la rectificación y nueva evolución son obligatorios.");
        return;
    }

    const confirmado = await pedirConfirmacion(
        "Confirmar Rectificación",
        "Esta rectificación quedará asentada inmutablemente vinculada a la consulta original. ¿Confirmar?",
        "Registrar Rectificación"
    );
    if (!confirmado) return;

    try {
        const nuevaConsultaId = generarIdCripto('CONS_RECT', 20);
        const consultaRef = doc(db, "pacientes", pacienteActivoHC.id, "consultas", nuevaConsultaId);
        const batch = writeBatch(db);

        batch.set(consultaRef, {
            turnoId: '',
            medicoUid: sesionActual ? sesionActual.uid : 'medico_demo',
            medicoNombre: sesionActual ? sesionActual.nombre : 'Profesional Médico',
            fecha: serverTimestamp(),
            motivo: `[Rectificación] ${motivo}`,
            diagnostico: 'Rectificación de consulta previa',
            diagnosticoCodigo: '',
            evolucion: evolucion,
            indicaciones: indicaciones,
            signosVitales: {},
            corrige: originalId
        });

        const auditRef = doc(collection(db, "auditoria"));
        batch.set(auditRef, {
            actorUid: sesionActual ? sesionActual.uid : 'anon',
            actorRol: sesionActual ? sesionActual.rol : 'Médico',
            accion: "CONSULTA_RECTIFICADA",
            pacienteId: pacienteActivoHC.id,
            consultaId: originalId,
            fecha: serverTimestamp(),
            detalle: `Rectificación de consulta ${originalId}: ${motivo}`
        });

        await batch.commit();

        cerrarModal('modal-rectificar-consulta');
        mostrarExito("Rectificación Asentada", "La rectificación fue registrada de forma inmutable.");
        await cargarCronologiaConsultas(pacienteActivoHC.id);
    } catch (e) {
        console.error("Error al rectificar:", e);
        mostrarAlerta("Error", "No se pudo registrar la rectificación.");
    }
}

export function abrirModalEditarResumen() {
    if (!pacienteActivoHC) return;
    const elAlergias = document.getElementById('hc-alergias-texto')?.innerText || '';
    const elAntecedentes = document.getElementById('hc-antecedentes-texto')?.innerText || '';
    const elMedicacion = document.getElementById('hc-medicacion-texto')?.innerText || '';

    document.getElementById('modal-input-alergias').value = elAlergias.includes('Sin alergias') ? '' : elAlergias;
    document.getElementById('modal-input-antecedentes').value = elAntecedentes.includes('Ninguno informado') ? '' : elAntecedentes;
    document.getElementById('modal-input-medicacion').value = elMedicacion.includes('Sin medicación') ? '' : elMedicacion;
    document.getElementById('modal-input-motivo-cambio-resumen').value = '';

    abrirModal('modal-editar-resumen-clinico');
}

export async function guardarResumenClinico() {
    if (!pacienteActivoHC) return;
    const alergias = document.getElementById('modal-input-alergias')?.value.trim();
    const antecedentes = document.getElementById('modal-input-antecedentes')?.value.trim();
    const medicacion = document.getElementById('modal-input-medicacion')?.value.trim();
    const motivo = document.getElementById('modal-input-motivo-cambio-resumen')?.value.trim();

    if (!motivo) {
        mostrarAlerta("Motivo Requerido", "Por trazabilidad y auditoría clínica, ingrese el motivo del cambio.");
        return;
    }

    try {
        const batch = writeBatch(db);
        const resumenRef = doc(db, "pacientes", pacienteActivoHC.id, "clinico", "resumen");

        batch.set(resumenRef, {
            alergias: alergias || 'Sin alergias registradas',
            antecedentes: antecedentes || 'Ninguno informado',
            medicacion: medicacion || 'Sin medicación regular',
            actualizadoEn: serverTimestamp()
        }, { merge: true });

        const auditRef = doc(collection(db, "auditoria"));
        batch.set(auditRef, {
            actorUid: sesionActual ? sesionActual.uid : 'anon',
            actorRol: sesionActual ? sesionActual.rol : 'Médico',
            accion: "ACTUALIZAR_RESUMEN_CLINICO",
            pacienteId: pacienteActivoHC.id,
            fecha: serverTimestamp(),
            detalle: `Actualización de resumen clínico: ${motivo}`
        });

        await batch.commit();

        cerrarModal('modal-editar-resumen-clinico');
        mostrarExito("Resumen Actualizado", "Los datos clínicos permanentes fueron guardados.");
        await cargarResumenClinico(pacienteActivoHC.id);
    } catch (e) {
        console.error("Error guardando resumen:", e);
        mostrarAlerta("Error", "No se pudo actualizar el resumen clínico.");
    }
}

export async function ejecutarAccesoEmergencia() {
    const dni = document.getElementById('modal-emergencia-dni')?.value.trim();
    const motivo = document.getElementById('modal-emergencia-motivo')?.value.trim();

    if (!/^[0-9]{6,10}$/.test(dni)) {
        mostrarAlerta("DNI Inválido", "Ingrese un DNI numérico válido (6 a 10 dígitos).");
        return;
    }
    if (!motivo || motivo.length < 10) {
        mostrarAlerta("Motivo Insuficiente", "El motivo justificado de emergencia debe tener al menos 10 caracteres.");
        return;
    }

    try {
        let pacienteId;
        const dniSnap = await getDoc(doc(db, "pacientes_por_dni", dni));
        if (dniSnap.exists()) {
            pacienteId = dniSnap.data().pacienteId;
        } else {
            pacienteId = generarIdCripto('PAC_EMERG', 20);
            const batchCrear = writeBatch(db);
            batchCrear.set(doc(db, "pacientes_por_dni", dni), { pacienteId, dni, creadoEn: serverTimestamp() });
            batchCrear.set(doc(db, "pacientes", pacienteId), {
                dni,
                nombre: "Paciente",
                apellido: `Emergencia ${dni}`,
                fechaNacimiento: "1980-01-01",
                sexo: "No especificado",
                contacto: {},
                creadoEn: serverTimestamp(),
                creadoPor: sesionActual ? sesionActual.uid : 'emergencia',
                esDemo: true
            });
            await batchCrear.commit();
        }

        const batch = writeBatch(db);
        const accesoRef = doc(db, "pacientes", pacienteId, "acceso", sesionActual.uid);
        batch.set(accesoRef, {
            medicoUid: sesionActual.uid,
            creadoEn: serverTimestamp(),
            motivoEmergencia: motivo
        });

        const auditRef = doc(collection(db, "auditoria"));
        batch.set(auditRef, {
            actorUid: sesionActual.uid,
            actorRol: sesionActual.rol || "Médico",
            accion: "ACCESO_EMERGENCIA",
            pacienteId: pacienteId,
            fecha: serverTimestamp(),
            detalle: `Acceso extraordinario de emergencia: ${motivo}`
        });

        await batch.commit();

        cerrarModal('modal-acceso-emergencia');
        mostrarExito("Acceso Concedido", "Se habilitó el acceso clínico de emergencia y se registró en la auditoría.");
        await abrirFichaPacienteHC(pacienteId);

    } catch (e) {
        console.error("Error en acceso de emergencia:", e);
        mostrarAlerta("Error", "No se pudo habilitar el acceso de emergencia.");
    }
}

export async function exportarHistoriaClinica() {
    if (!pacienteActivoHC) {
        mostrarAlerta("Ningún Paciente", "Seleccione un paciente para imprimir su historia clínica.");
        return;
    }

    if (sesionActual) {
        await addDoc(collection(db, "auditoria"), {
            actorUid: sesionActual.uid,
            actorRol: sesionActual.rol || "Médico",
            accion: "EXPORTAR_HISTORIA_CLINICA",
            pacienteId: pacienteActivoHC.id,
            fecha: serverTimestamp(),
            detalle: `Impresión/Exportación de ficha de ${pacienteActivoHC.nombre} ${pacienteActivoHC.apellido}`
        }).catch(() => {});
    }

    window.print();
}

export function cerrarFichaPacienteHC() {
    pacienteActivoHC = null;
    const cabecera = document.getElementById('cabecera-paciente-hc');
    if (cabecera) cabecera.classList.add('hidden');
    const container = document.getElementById('contenedor-cronologia-consultas');
    if (container) container.innerHTML = '<p class="text-sm text-slate-400 text-center py-8">Seleccione un paciente para ver su historial clínico.</p>';
    const labelActivo = document.getElementById('medico-paciente-activo');
    if (labelActivo) labelActivo.innerText = "Ningún paciente en atención";
    const badgeTurno = document.getElementById('badge-turno-en-curso');
    if (badgeTurno) badgeTurno.classList.add('hidden');
}

export async function llamarPaciente(idDoc) {
    try {
        const snap = await getDoc(doc(db, "turnos", idDoc));
        if (!snap.exists()) return;
        const turnoData = snap.data();

        let pacienteId = turnoData.pacienteId;

        if (!pacienteId && turnoData.pacienteDni) {
            const dni = turnoData.pacienteDni.trim();
            const dniSnap = await getDoc(doc(db, "pacientes_por_dni", dni));
            if (dniSnap.exists()) {
                pacienteId = dniSnap.data().pacienteId;
            } else {
                pacienteId = generarIdCripto('PAC', 20);
                const batchAlta = writeBatch(db);
                batchAlta.set(doc(db, "pacientes_por_dni", dni), {
                    pacienteId,
                    dni,
                    creadoEn: serverTimestamp()
                });
                batchAlta.set(doc(db, "pacientes", pacienteId), {
                    dni,
                    nombre: (turnoData.pacienteNombre || 'Paciente').split(' ')[0] || 'Paciente',
                    apellido: (turnoData.pacienteNombre || '').split(' ').slice(1).join(' ') || 'Schestakow',
                    fechaNacimiento: '1990-01-01',
                    sexo: 'No especificado',
                    contacto: {
                        celular: turnoData.pacienteCelular || '',
                        email: turnoData.pacienteEmail || ''
                    },
                    creadoEn: serverTimestamp(),
                    creadoPor: sesionActual ? sesionActual.uid : 'recepcion',
                    esDemo: true
                });
                await batchAlta.commit();
            }

            await updateDoc(doc(db, "turnos", idDoc), {
                estado: "En Consultorio",
                inicioConsultaEn: serverTimestamp(),
                pacienteId: pacienteId
            });
        } else {
            await updateDoc(doc(db, "turnos", idDoc), {
                estado: "En Consultorio",
                inicioConsultaEn: serverTimestamp()
            });
        }

        if (sesionActual && pacienteId) {
            await setDoc(doc(db, "pacientes", pacienteId, "acceso", sesionActual.uid), {
                medicoUid: sesionActual.uid,
                turnoId: idDoc,
                creadoEn: serverTimestamp()
            }, { merge: true });
        }

        if (pacienteId) {
            await abrirFichaPacienteHC(pacienteId, idDoc);
        }

        cargarAgendaMedico();
    } catch (e) {
        console.error("Error al llamar paciente:", e);
        mostrarAlerta("Error", "No se pudo actualizar el estado del turno.");
    }
}

export async function marcarAusente(idDoc) {
    const ok = await pedirConfirmacion("Marcar Ausente", "¿Confirmar que el paciente no se presentó al consultorio?");
    if (!ok) return;

    try {
        await updateDoc(doc(db, "turnos", idDoc), {
            estado: "Ausente",
            canceladoPor: "medico",
            canceladoEn: serverTimestamp()
        });
        cargarAgendaMedico();
    } catch (e) {
        console.error(e);
        mostrarAlerta("Error", "No se pudo actualizar el estado.");
    }
}

// ==========================================
// ADMINISTRACIÓN
// ==========================================
export async function cargarUsuariosAdmin(direccion = 'init') {
    const tbody = document.getElementById('admin-users-tbody');
    const pagInfo = document.getElementById('admin-pag-info');
    const btnPrev = document.getElementById('btn-prev-users');
    const btnNext = document.getElementById('btn-next-users');

    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-slate-400">Cargando personal institucional...</td></tr>';

    try {
        let q;
        if (direccion === 'init') {
            usuariosPageSnapshots = [];
            currentUsuariosPage = 0;
            q = query(collection(db, "usuarios"), orderBy("nombre"), limit(USUARIOS_PER_PAGE));
        } else if (direccion === 'next' && usuariosPageSnapshots[currentUsuariosPage]) {
            currentUsuariosPage++;
            const lastVisible = usuariosPageSnapshots[currentUsuariosPage - 1];
            q = query(collection(db, "usuarios"), orderBy("nombre"), startAfter(lastVisible), limit(USUARIOS_PER_PAGE));
        } else if (direccion === 'prev' && currentUsuariosPage > 0) {
            currentUsuariosPage--;
            if (currentUsuariosPage === 0) {
                q = query(collection(db, "usuarios"), orderBy("nombre"), limit(USUARIOS_PER_PAGE));
            } else {
                const prevVisible = usuariosPageSnapshots[currentUsuariosPage - 1];
                q = query(collection(db, "usuarios"), orderBy("nombre"), startAfter(prevVisible), limit(USUARIOS_PER_PAGE));
            }
        } else {
            return;
        }

        const snap = await getDocs(q);
        if (snap.empty) {
            tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-slate-500">No hay usuarios registrados.</td></tr>';
            return;
        }

        usuariosPageSnapshots[currentUsuariosPage] = snap.docs[snap.docs.length - 1];

        if (pagInfo) pagInfo.innerText = `Página ${currentUsuariosPage + 1}`;
        if (btnPrev) btnPrev.disabled = (currentUsuariosPage === 0);
        if (btnNext) btnNext.disabled = (snap.docs.length < USUARIOS_PER_PAGE);

        let filas = '';
        snap.forEach(d => {
            const u = d.data();
            const id = d.id;
            filas += `
                <tr class="border-b border-slate-100 hover:bg-slate-50 transition">
                    <td class="p-3">
                        <p class="font-bold text-slate-800">${escaparHTML(u.nombre || 'Sin Nombre')}</p>
                        <p class="text-xs text-slate-500">${escaparHTML(u.correo || 'Sin correo')}</p>
                    </td>
                    <td class="p-3">
                        <span class="px-2 py-0.5 rounded text-xs font-bold ${u.rol === 'Administración' ? 'bg-neutral-800 text-white' : u.rol === 'Médico' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'}">${escaparHTML(u.rol || 'Recepción')}</span>
                        ${u.matricula ? `<p class="text-xs text-slate-500 mt-1">M.P.: ${escaparHTML(u.matricula)}</p>` : ''}
                    </td>
                    <td class="p-3 text-xs text-slate-600">
                        <p class="font-mono text-slate-700 text-xs font-semibold">${escaparHTML(u.correo || 'N/A')}</p>
                        <button data-correo="${escaparHTML(u.correo || '')}" onclick="enviarResetPasswordUsuario(this.dataset.correo)" class="text-[11px] text-neutral-700 underline hover:text-neutral-900 mt-1">Enviar reset clave</button>
                    </td>
                    <td class="p-3 text-center">
                        <div class="flex justify-center gap-2">
                            <button data-id="${escaparHTML(id)}" onclick="editarUsuarioAdmin(this.dataset.id)" class="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-1 rounded font-bold transition">Editar</button>
                            <button data-id="${escaparHTML(id)}" onclick="eliminarUsuarioAdmin(this.dataset.id)" class="text-xs bg-red-50 hover:bg-red-100 text-red-600 px-2 py-1 rounded font-bold transition">Eliminar</button>
                        </div>
                    </td>
                </tr>
            `;
        });
        tbody.innerHTML = filas;
    } catch (e) {
        console.error(e);
        tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-red-500">Error al cargar usuarios.</td></tr>';
    }
}

export function abrirModalUsuarioNulo() {
    document.getElementById('input-usuario-id').value = '';
    document.getElementById('input-usuario-nombre').value = '';
    document.getElementById('input-usuario-rol').value = 'Administración';
    document.getElementById('input-usuario-pass').value = '';
    document.getElementById('input-usuario-tel').value = '';
    document.getElementById('input-usuario-correo').value = '';
    document.getElementById('input-usuario-matricula').value = '';
    toggleCamposMedico();
    abrirModal('modal-usuario');
}

export async function editarUsuarioAdmin(id) {
    try {
        const snap = await getDoc(doc(db, "usuarios", id));
        if (!snap.exists()) return;
        const u = snap.data();

        document.getElementById('input-usuario-id').value = id;
        document.getElementById('input-usuario-nombre').value = u.nombre || '';
        document.getElementById('input-usuario-rol').value = u.rol || 'Administración';
        document.getElementById('input-usuario-pass').value = '';
        document.getElementById('input-usuario-tel').value = u.tel || '';
        document.getElementById('input-usuario-correo').value = u.correo || '';
        document.getElementById('input-usuario-matricula').value = u.matricula || '';
        if (u.especialidad) document.getElementById('input-usuario-especialidad').value = u.especialidad;

        toggleCamposMedico();
        abrirModal('modal-usuario');
    } catch (e) {
        console.error(e);
        mostrarAlerta("Error", "No se pudo cargar el perfil del usuario.");
    }
}

export async function guardarUsuarioAdminFirebase() {
    const id = document.getElementById('input-usuario-id').value;
    const nom = document.getElementById('input-usuario-nombre').value.trim();
    const rol = document.getElementById('input-usuario-rol').value;
    const tel = document.getElementById('input-usuario-tel').value.trim();
    const cor = document.getElementById('input-usuario-correo').value.trim();
    const mat = document.getElementById('input-usuario-matricula').value.trim();
    const esp = document.getElementById('input-usuario-especialidad').value;
    const pass = document.getElementById('input-usuario-pass')?.value?.trim();

    if (!cor || !nom) {
        mostrarAlerta("Datos Faltantes", "Nombre y Correo Electrónico son obligatorios.");
        return;
    }

    if (!id && (!pass || pass.length < 6)) {
        mostrarAlerta("Contraseña Requerida", "Para nuevos usuarios, la contraseña debe tener al menos 6 caracteres.");
        return;
    }

    const payload = {
        nombre: nom,
        rol: rol,
        correo: cor,
        tel: tel,
        matricula: rol === 'Médico' ? mat : '',
        especialidad: rol === 'Médico' ? esp : '',
        activo: true
    };

    try {
        let uidFinal = id;
        if (id) {
            await updateDoc(doc(db, "usuarios", id), {
                ...payload,
                actualizadoEn: serverTimestamp()
            });
        } else {
            try {
                uidFinal = await crearCuentaAuthSecundaria(cor, pass);
            } catch (authErr) {
                console.error("Error al registrar cuenta Auth:", authErr);
                let msg = "No se pudo registrar la cuenta en Authentication.";
                if (authErr.code === 'auth/email-already-in-use') {
                    msg = "El correo electrónico ya se encuentra registrado en el sistema.";
                } else if (authErr.code === 'auth/weak-password') {
                    msg = "La contraseña es muy débil (debe tener al menos 6 caracteres).";
                } else if (authErr.code === 'auth/invalid-email') {
                    msg = "El formato del correo electrónico es inválido.";
                }
                mostrarAlerta("Error al Registrar", msg);
                return;
            }

            await setDoc(doc(db, "usuarios", uidFinal), {
                ...payload,
                uid: uidFinal,
                creadoEn: serverTimestamp()
            });
        }

        if (rol === 'Médico') {
            await setDoc(doc(db, "medicos_publicos", uidFinal), {
                medicoUid: uidFinal,
                nombre: nom,
                especialidad: esp,
                activo: true
            }, { merge: true });
        }

        mostrarExito(
            id ? "Actualizado" : "Guardado",
            id ? "Los datos se guardaron correctamente." : "Usuario registrado y habilitado para iniciar sesión."
        );

        cerrarModal('modal-usuario');
        cargarUsuariosAdmin('init');
        cargarEspecialistasFirebase();
    } catch (error) {
        console.error(error);
        mostrarAlerta("Error", "Fallo al comunicar con la base de datos.");
    }
}

export async function eliminarUsuarioAdmin(id) {
    const confirmado = await pedirConfirmacion("¿Eliminar Usuario?", "Esta acción quitará el perfil de la tabla administrativa.", "Sí, eliminar");
    if (!confirmado) return;

    try {
        await deleteDoc(doc(db, "usuarios", id));
        await deleteDoc(doc(db, "medicos_publicos", id)).catch(() => {});
        mostrarExito("Usuario Eliminado", "El perfil fue removido del sistema.");
        cargarUsuariosAdmin('init');
        cargarEspecialistasFirebase();
    } catch (error) {
        console.error(error);
        mostrarAlerta("Error", "Error al intentar eliminar.");
    }
}

export async function enviarResetPasswordUsuario(correo) {
    try {
        await sendPasswordResetEmail(auth, correo);
        mostrarExito("Email Enviado", `Se envió un correo a ${correo} para restablecer su clave.`);
    } catch (error) {
        console.error(error);
        mostrarAlerta("Error", "No se pudo enviar el correo de restablecimiento.");
    }
}

export function toggleCamposMedico() {
    const rol = document.getElementById('input-usuario-rol')?.value;
    const divMat = document.getElementById('div-usuario-matricula');
    const divEsp = document.getElementById('div-usuario-especialidad');
    if (rol === 'Médico') {
        if (divMat) divMat.classList.remove('hidden');
        if (divEsp) divEsp.classList.remove('hidden');
    } else {
        if (divMat) divMat.classList.add('hidden');
        if (divEsp) divEsp.classList.add('hidden');
    }
}

export function togglePasswordVisibility() {
    const input = document.getElementById('input-usuario-pass');
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
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

export function iniciarGuardadoModulacion() {
    const input = document.getElementById('input-seguridad-admin');
    if (input) input.value = '';
    abrirModal('modal-seguridad-modulacion');
}

export async function ejecutarGuardadoModulacion() {
    const alcance = document.getElementById('admin-select-alcance').value;
    const duracion = parseInt(document.getElementById('admin-select-duracion').value, 10);

    try {
        if (alcance === 'global') {
            await setDoc(doc(db, "configuracion", "general"), { duracionBase: duracion }, { merge: true });
        } else {
            await setDoc(doc(db, "modulacion_medicos", alcance), { duracionBase: duracion }, { merge: true });
        }

        cerrarModal('modal-seguridad-modulacion');
        mostrarExito("Modulación Aplicada", "Los intervalos de atención han sido actualizados.");
        await cargarConfiguracionModulacion();
    } catch (e) {
        console.error(e);
        mostrarAlerta("Error", "No se pudo actualizar la modulación.");
    }
}

export async function cargarMetricas(forzarRecarga = false) {
    try {
        await iniciarModuloMetricasUI(forzarRecarga);
    } catch (e) {
        console.error("Error al inicializar módulo de métricas:", e);
    }
}

export function toggleHistorial() {
    // Helper visual
}

export async function verificarLimpiezaAnual() {
    try {
        const snap = await getDocs(query(collection(db, "turnos"), limit(1)));
    } catch (e) {
        // Silencioso
    }
}

export function ejecutarLimpiezaYDescarga() {
    cerrarModal('modal-limpieza-anual');
    mostrarExito("Descarga Realizada", "Copia de respaldo exportada.");
}

export async function verificarEntornoDemo() {
    try {
        let snap = await getDoc(doc(db, "configuracion", "entorno"));
        if (!snap.exists()) {
            snap = await getDoc(doc(db, "config", "entorno"));
        }
        if (!snap.exists()) {
            // Inicializar documento de entorno para la demo académica (UTN FRSR)
            await setDoc(doc(db, "configuracion", "entorno"), {
                esDemo: true,
                descripcion: "Entorno académico experimental UTN FRSR"
            }, { merge: true });
            return true;
        }
        return snap.data()?.esDemo === true;
    } catch (e) {
        console.warn("No se pudo verificar entorno demo:", e);
        return false;
    }
}

export async function limpiarBaseDeDatos() {
    // 1. Verificación obligatoria de entorno demo en Firestore
    try {
        let snap = await getDoc(doc(db, "configuracion", "entorno"));
        if (!snap.exists()) {
            snap = await getDoc(doc(db, "config", "entorno"));
        }
        if (!snap.exists() || snap.data()?.esDemo !== true) {
            mostrarAlerta(
                "Operación Bloqueada",
                "El Reset de Fábrica está bloqueado porque el entorno no tiene habilitada la bandera de demostración (configuracion/entorno con esDemo == true)."
            );
            return;
        }
    } catch (e) {
        console.error("Error al validar flag demo:", e);
        mostrarAlerta("Error de Seguridad", "No se pudo verificar la autorización del entorno para esta operación.");
        return;
    }

    // 2. Confirmación explícita por palabra clave
    const input = prompt("ADVERTENCIA DE SEGURIDAD\nEsta acción borrará TODOS los turnos y usuarios de prueba.\n\nPara confirmar, escriba exactamente la palabra: BORRAR");
    if (input !== "BORRAR") {
        mostrarAlerta("Cancelado", "Palabra de confirmación incorrecta. No se ha borrado ningún dato.");
        return;
    }

    abrirModal('modal-progreso');
    const barra = document.getElementById('progreso-barra');
    const texto = document.getElementById('progreso-texto');
    if (texto) texto.innerText = "Borrando turnos de prueba...";
    if (barra) barra.style.width = '30%';

    try {
        const turnosSnap = await getDocs(collection(db, "turnos"));
        const promesasTurnos = turnosSnap.docs.map(d => deleteDoc(doc(db, "turnos", d.id)));
        await Promise.all(promesasTurnos);
        if (barra) barra.style.width = '60%';

        if (texto) texto.innerText = "Borrando usuarios demostrativos...";
        const usuariosSnap = await getDocs(collection(db, "usuarios"));
        const promesasUsuarios = [];
        usuariosSnap.forEach(d => {
            const u = d.data();
            // Preservar la cuenta maestra del administrador
            if (u.rol !== "Administración" && d.id !== sesionActual?.uid) {
                promesasUsuarios.push(deleteDoc(doc(db, "usuarios", d.id)));
            }
        });
        await Promise.all(promesasUsuarios);

        // Limpiar catálogo de médicos públicos y slots de disponibilidad
        const medicosPubSnap = await getDocs(collection(db, "medicos_publicos"));
        const promesasMedicosPub = medicosPubSnap.docs.map(d => deleteDoc(doc(db, "medicos_publicos", d.id)));
        await Promise.all(promesasMedicosPub);

        const dispSnap = await getDocs(collection(db, "disponibilidad"));
        const promesasDisp = dispSnap.docs.map(d => deleteDoc(doc(db, "disponibilidad", d.id)));
        await Promise.all(promesasDisp);

        if (barra) barra.style.width = '100%';
        cerrarModal('modal-progreso');
        mostrarExito("Reinicio Exitoso", "El sistema ha sido restaurado a su estado de fábrica. Turnos, disponibilidad y médicos demostrativos eliminados.");

        cargarUsuariosAdmin('init');
        cargarEspecialistasFirebase();
        cargarMetricas(true);
    } catch (e) {
        console.error(e);
        cerrarModal('modal-progreso');
        mostrarAlerta("Error", "Error al vaciar la base de datos.");
    }
}

export async function inyectarMedicosDePrueba() {
    const confirm = await pedirConfirmacion("¿Inyectar Médicos?", "Se cargarán 28 profesionales categorizados para la demostración tecnológica.", "Sí, Inyectar");
    if (!confirm) return;

    const medicosDemo = [
        { nom: "Dr. Esteban Quiroga", esp: "Clínica Médica", mat: "44019" },
        { nom: "Dra. Valeria Román", esp: "Clínica Médica", mat: "45021" },
        { nom: "Dr. Carlos San Martín", esp: "Cardiología", mat: "10293" },
        { nom: "Dra. María Antonieta", esp: "Pediatría", mat: "22019" },
        { nom: "Dra. Sofía Castro", esp: "Neurología", mat: "80291" },
        { nom: "Dra. Analía Montes", esp: "Endocrinología", mat: "70331" },
        { nom: "Dr. Martín Ríos", esp: "Gastroenterología", mat: "90182" },
        { nom: "Dr. Roberto Sánchez", esp: "Neumonología", mat: "60442" },
        { nom: "Dr. Hugo Silva", esp: "Nefrología", mat: "11223" },
        { nom: "Dra. Laura Méndez", esp: "Infectología", mat: "33445" },
        { nom: "Dr. Pablo Gómez", esp: "Dermatología", mat: "55667" },
        { nom: "Dra. Silvia Paz", esp: "Geriatría", mat: "77889" },
        { nom: "Dr. Andrés Luna", esp: "Hematología", mat: "99001" },
        { nom: "Dra. Clara Vega", esp: "Alergia e Inmunología", mat: "22334" },
        { nom: "Dr. Fernando Ruiz", esp: "Cirugía General", mat: "50553" },
        { nom: "Dr. Jorge Medina", esp: "Cirugía Cardiovascular", mat: "20192" },
        { nom: "Dra. Luciana Herrera", esp: "Cirugía Plástica y Reparadora", mat: "44556" },
        { nom: "Dr. Ricardo Silva", esp: "Traumatología y Ortopedia", mat: "33918" },
        { nom: "Dr. Marcos Torres", esp: "Neurocirugía", mat: "66778" },
        { nom: "Dr. Javier López", esp: "Urología", mat: "88990" },
        { nom: "Dra. Elena Castro", esp: "Otorrinolaringología", mat: "11224" },
        { nom: "Dr. Matías Rojas", esp: "Oftalmología", mat: "33446" },
        { nom: "Dra. Carmen López", esp: "Ginecología y Obstetricia", mat: "60293" },
        { nom: "Dr. Javier Blanco", esp: "Diagnóstico por Imágenes", mat: "30775" },
        { nom: "Dra. Silvia Torres", esp: "Anatomía Patológica", mat: "20886" },
        { nom: "Dr. Mario Domínguez", esp: "Anestesiología", mat: "55668" },
        { nom: "Dr. Hugo Varela", esp: "Terapia Intensiva", mat: "10997" },
        { nom: "Dra. Natalia Cruz", esp: "Medicina Física y Rehabilitación", mat: "77880" },
        { nom: "Dr. Diego Ponce", esp: "Medicina de Emergencias", mat: "99002" }
    ];

    abrirModal('modal-progreso');
    const barra = document.getElementById('progreso-barra');
    const texto = document.getElementById('progreso-texto');

    let completados = 0;
    const total = medicosDemo.length;

    for (const med of medicosDemo) {
        const payload = {
            nombre: med.nom,
            rol: "Médico",
            username: med.nom.split(' ')[1].toLowerCase() + Math.floor(Math.random() * 1000),
            correo: med.nom.split(' ')[1].toLowerCase() + "@hospital.demo",
            tel: "2604000000",
            matricula: med.mat,
            especialidad: med.esp,
            activo: true,
            timestamp: new Date()
        };

        try {
            const userRef = await addDoc(collection(db, "usuarios"), payload);
            await setDoc(doc(db, "medicos_publicos", userRef.id), {
                medicoUid: userRef.id,
                nombre: med.nom,
                especialidad: med.esp,
                activo: true
            });
        } catch (e) {
            console.error("Fallo inyectando a:", med.nom);
        }

        completados++;
        let porcentaje = Math.round((completados / total) * 100);
        if (barra) barra.style.width = porcentaje + '%';
        if (texto) texto.innerText = `Cargando: ${med.nom} (${completados}/${total})`;
    }

    cerrarModal('modal-progreso');
    mostrarExito("Inyección Exitosa", "Los 28 profesionales demostrativos fueron cargados al sistema con sus respectivas especialidades.");

    cargarUsuariosAdmin('init');
    cargarEspecialistasFirebase();
    cargarMetricas();
}

// ==========================================
// SEGURIDAD: TIMEOUT DE INACTIVIDAD (15 MIN)
// ==========================================
let temporizadorInactividad;
function resetInactividad() {
    clearTimeout(temporizadorInactividad);
    if (sesionActual) {
        temporizadorInactividad = setTimeout(() => {
            mostrarAlerta("Sesión Expirada", "Su sesión fue cerrada automáticamente por superar 15 minutos de inactividad, en resguardo de la confidencialidad clínica.");
            cerrarSesionReal();
        }, 15 * 60 * 1000);
    }
}
['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(evt => {
    window.addEventListener(evt, resetInactividad, { passive: true });
});

// ==========================================
// VINCULACIÓN DE EVENTOS DE HISTORIA CLÍNICA
// ==========================================
function inicializarEventosHC() {
    const btnBuscarHC = document.getElementById('btn-buscar-paciente-hc');
    if (btnBuscarHC) {
        btnBuscarHC.addEventListener('click', () => buscarPacientePorDni());
    }

    const inputDniHC = document.getElementById('input-buscar-dni-medico');
    if (inputDniHC) {
        inputDniHC.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                buscarPacientePorDni();
            }
        });
    }

    const btnEmergencia = document.getElementById('btn-abrir-emergencia');
    if (btnEmergencia) {
        btnEmergencia.addEventListener('click', () => {
            const elDni = document.getElementById('modal-emergencia-dni');
            const elMot = document.getElementById('modal-emergencia-motivo');
            if (elDni) elDni.value = '';
            if (elMot) elMot.value = '';
            abrirModal('modal-acceso-emergencia');
        });
    }

    const btnConfirmarEmergencia = document.getElementById('btn-confirmar-acceso-emergencia');
    if (btnConfirmarEmergencia) {
        btnConfirmarEmergencia.addEventListener('click', () => ejecutarAccesoEmergencia());
    }

    const btnEditarResumen = document.getElementById('btn-editar-resumen-clinico');
    if (btnEditarResumen) {
        btnEditarResumen.addEventListener('click', () => abrirModalEditarResumen());
    }

    const btnConfirmarResumen = document.getElementById('btn-confirmar-guardar-resumen');
    if (btnConfirmarResumen) {
        btnConfirmarResumen.addEventListener('click', () => guardarResumenClinico());
    }

    const btnExportarHC = document.getElementById('btn-exportar-hc');
    if (btnExportarHC) {
        btnExportarHC.addEventListener('click', () => exportarHistoriaClinica());
    }

    const btnCerrarHC = document.getElementById('btn-cerrar-paciente-hc');
    if (btnCerrarHC) {
        btnCerrarHC.addEventListener('click', () => cerrarFichaPacienteHC());
    }

    const btnGuardarConsulta = document.getElementById('btn-guardar-consulta-hc');
    if (btnGuardarConsulta) {
        btnGuardarConsulta.addEventListener('click', () => guardarConsultaInmutable());
    }

    const btnConfirmarRect = document.getElementById('btn-confirmar-guardar-rectificacion');
    if (btnConfirmarRect) {
        btnConfirmarRect.addEventListener('click', () => guardarRectificacionInmutable());
    }

    // Soporte para inicio de sesión en panel.html
    const inputLoginUser = document.getElementById('login-user');
    if (inputLoginUser) {
        inputLoginUser.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                iniciarSesionReal();
            }
        });
    }

    const inputLoginPass = document.getElementById('login-pass');
    if (inputLoginPass) {
        inputLoginPass.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                iniciarSesionReal();
            }
        });
    }

    const btnLogin = document.getElementById('btn-login');
    if (btnLogin) {
        btnLogin.addEventListener('click', () => iniciarSesionReal());
    }
}

// ==========================================
// CITACIÓN Y PRÓXIMA CONSULTA (MÉDICOS)
// ==========================================
let ultimaCitacionGenerada = null;

export async function abrirModalProximaConsulta() {
    if (!pacienteActivoHC) {
        mostrarAlerta("Sin Paciente Seleccionado", "Debe buscar o atender a un paciente primero para agendarle su próxima consulta.");
        return;
    }

    const elNom = document.getElementById('prox-consulta-paciente-nombre');
    const elDni = document.getElementById('prox-consulta-paciente-dni');
    const elMed = document.getElementById('prox-consulta-medico-nombre');
    const elEsp = document.getElementById('prox-consulta-medico-especialidad');
    const elMot = document.getElementById('prox-consulta-motivo');
    const elFecha = document.getElementById('prox-consulta-fecha');
    const elSlot = document.getElementById('prox-consulta-horario-seleccionado');

    const nombreCompleto = `${pacienteActivoHC.nombre || ''} ${pacienteActivoHC.apellido || ''}`.trim() || 'Paciente';
    if (elNom) elNom.innerText = nombreCompleto;
    if (elDni) elDni.innerText = pacienteActivoHC.dni || '--';

    const nombreMed = sesionActual?.nombre || 'Médico Asignado';
    if (elMed) elMed.innerText = nombreMed;

    let especialidadMed = "Consulta Médica";
    for (const [esp, medList] of Object.entries(bdMedicosDinamica)) {
        if (medList.some(m => m.uid === sesionActual?.uid || m.nombre === nombreMed)) {
            especialidadMed = esp;
            break;
        }
    }
    if (elEsp) elEsp.innerText = especialidadMed;
    if (elMot) elMot.value = '';
    if (elSlot) elSlot.value = '';

    // Fecha mínima: mañana (evitando fin de semana)
    const manana = new Date();
    manana.setDate(manana.getDate() + 1);
    if (manana.getDay() === 6) manana.setDate(manana.getDate() + 2);
    if (manana.getDay() === 0) manana.setDate(manana.getDate() + 1);
    const mananaStr = manana.toISOString().split('T')[0];

    if (elFecha) {
        elFecha.min = mananaStr;
        elFecha.value = mananaStr;
    }

    const radioExacto = document.getElementById('modo-horario-exacto');
    if (radioExacto) radioExacto.checked = true;
    toggleModoHorarioCitacion();

    if (elFecha && elFecha.value) {
        await cargarHorariosDisponiblesProximaConsulta(elFecha.value);
    }

    abrirModal('modal-proxima-consulta');
}

export function toggleModoHorarioCitacion() {
    const esExacto = document.getElementById('modo-horario-exacto')?.checked;
    const labelExacto = document.getElementById('label-modo-exacto');
    const labelPaciente = document.getElementById('label-modo-paciente');
    const bloqueExacto = document.getElementById('bloque-horarios-exactos');
    const bloquePaciente = document.getElementById('bloque-info-paciente');

    if (esExacto) {
        if (labelExacto) {
            labelExacto.className = "border-2 border-emerald-600 bg-emerald-50/50 rounded-lg p-3 cursor-pointer transition flex flex-col justify-between";
        }
        if (labelPaciente) {
            labelPaciente.className = "border-2 border-slate-200 hover:border-emerald-300 rounded-lg p-3 cursor-pointer transition flex flex-col justify-between";
        }
        if (bloqueExacto) bloqueExacto.classList.remove('hidden');
        if (bloquePaciente) bloquePaciente.classList.add('hidden');
    } else {
        if (labelExacto) {
            labelExacto.className = "border-2 border-slate-200 hover:border-emerald-300 rounded-lg p-3 cursor-pointer transition flex flex-col justify-between";
        }
        if (labelPaciente) {
            labelPaciente.className = "border-2 border-teal-600 bg-teal-50/50 rounded-lg p-3 cursor-pointer transition flex flex-col justify-between";
        }
        if (bloqueExacto) bloqueExacto.classList.add('hidden');
        if (bloquePaciente) bloquePaciente.classList.remove('hidden');
    }
}

export async function cambioFechaProximaConsulta(input) {
    if (!validarDiaHabil(input)) return;
    await cargarHorariosDisponiblesProximaConsulta(input.value);
}

export async function cargarHorariosDisponiblesProximaConsulta(fecha) {
    const contenedor = document.getElementById('contenedor-slots-proxima-consulta');
    const inputSlot = document.getElementById('prox-consulta-horario-seleccionado');
    if (!contenedor) return;

    if (inputSlot) inputSlot.value = '';
    contenedor.innerHTML = '<p class="text-xs text-slate-400 col-span-3 sm:col-span-4 text-center py-4">Consultando disponibilidad...</p>';

    const nombreMed = sesionActual?.nombre || 'Médico Asignado';
    const medUid = sesionActual?.uid || 'medico_demo';

    let turnosOcupados = {};
    try {
        const q = query(
            collection(db, "turnos"),
            where("medico", "==", nombreMed),
            where("fecha", "==", fecha)
        );
        const snap = await getDocs(q);
        snap.forEach(d => {
            const data = d.data();
            const est = data.estado;
            if (!est || !est.toLowerCase().includes("cancelado")) {
                if (data.horario) turnosOcupados[data.horario] = true;
            }
        });

        const qDisp = query(
            collection(db, "disponibilidad"),
            where("medicoUid", "==", medUid),
            where("fecha", "==", fecha)
        );
        const snapDisp = await getDocs(qDisp);
        snapDisp.forEach(d => {
            const data = d.data();
            if (data.horario) turnosOcupados[data.horario] = true;
        });
    } catch (e) {
        console.warn("Fallo lectura de disponibilidad para citación:", e);
    }

    const duracionActual = modulacionPorMedico[nombreMed] || duracionTurnoGlobal || 15;
    let minBucle = 7 * 60;
    const finBucle = 12 * 60 + 30;

    let html = '';
    let disponiblesCount = 0;

    while (minBucle <= finBucle) {
        const h = Math.floor(minBucle / 60);
        const m = minBucle % 60;
        const hsStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;

        if (turnosOcupados[hsStr]) {
            html += `<button type="button" disabled class="bg-slate-100 text-slate-400 text-xs font-bold rounded p-2 border border-slate-200 cursor-not-allowed text-center">${hsStr} (Ocupado)</button>`;
        } else {
            html += `<button type="button" onclick="seleccionarSlotProximaConsulta(this, '${hsStr}')" class="btn-slot-prox bg-white hover:bg-emerald-50 text-slate-800 border border-slate-300 text-xs font-bold rounded p-2 transition text-center shadow-sm">${hsStr}</button>`;
            disponiblesCount++;
        }
        minBucle += duracionActual;
    }

    if (disponiblesCount === 0) {
        html = '<p class="text-xs text-red-500 col-span-3 sm:col-span-4 text-center py-4">No hay horarios libres en este día. Seleccione otra fecha o elija la opción de horario por paciente.</p>';
    }

    contenedor.innerHTML = html;
}

export function seleccionarSlotProximaConsulta(btn, horario) {
    document.querySelectorAll('.btn-slot-prox').forEach(b => {
        b.classList.remove('bg-emerald-700', 'text-white', 'border-emerald-800');
        b.classList.add('bg-white', 'text-slate-800', 'border-slate-300');
    });
    btn.classList.remove('bg-white', 'text-slate-800', 'border-slate-300');
    btn.classList.add('bg-emerald-700', 'text-white', 'border-emerald-800');

    const inputSlot = document.getElementById('prox-consulta-horario-seleccionado');
    if (inputSlot) inputSlot.value = horario;
}

export async function guardarProximaConsultaMedico() {
    if (!pacienteActivoHC) {
        mostrarAlerta("Error", "No hay un paciente activo.");
        return;
    }

    const fecha = document.getElementById('prox-consulta-fecha')?.value;
    if (!fecha) {
        mostrarAlerta("Fecha Requerida", "Debe seleccionar una fecha para la próxima consulta.");
        return;
    }

    const esExacto = document.getElementById('modo-horario-exacto')?.checked;
    const horario = esExacto ? document.getElementById('prox-consulta-horario-seleccionado')?.value : 'Pendiente';

    if (esExacto && !horario) {
        mostrarAlerta("Horario Requerido", "Por favor seleccione un horario disponible de la grilla.");
        return;
    }

    const motivo = document.getElementById('prox-consulta-motivo')?.value.trim() || 'Control y Seguimiento';
    const nombreMed = sesionActual?.nombre || 'Médico Asignado';
    const medUid = sesionActual?.uid || 'medico_demo';

    let especialidadMed = "Consulta Médica";
    for (const [esp, medList] of Object.entries(bdMedicosDinamica)) {
        if (medList.some(m => m.uid === medUid || m.nombre === nombreMed)) {
            especialidadMed = esp;
            break;
        }
    }

    const nombreCompleto = `${pacienteActivoHC.nombre || ''} ${pacienteActivoHC.apellido || ''}`.trim() || 'Paciente';

    const msgConfirm = esExacto 
        ? `¿Confirmar próxima consulta para ${nombreCompleto} el día ${fecha} a las ${horario} hs?`
        : `¿Asignar el día ${fecha} para ${nombreCompleto}, dejando que el paciente elija su horario dentro de esa fecha?`;

    const ok = await pedirConfirmacion("Confirmar Citación", msgConfirm, "Sí, Agendar");
    if (!ok) return;

    try {
        const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
        const arr = new Uint8Array(20);
        window.crypto.getRandomValues(arr);
        let randStr = '';
        for (let i = 0; i < 20; i++) randStr += chars[arr[i] % chars.length];
        const turnoId = `TUR_${randStr}`;

        const batch = writeBatch(db);
        const turnoRef = doc(db, "turnos", turnoId);

        const turnoData = {
            especialidad: especialidadMed,
            medico: nombreMed,
            medicoUid: medUid,
            fecha: fecha,
            horario: horario,
            pacienteNombre: nombreCompleto,
            pacienteDni: pacienteActivoHC.dni,
            pacienteCelular: pacienteActivoHC.contacto || '',
            pacienteEmail: pacienteActivoHC.email || '',
            pacienteId: pacienteActivoHC.id,
            codigoConfirmacion: turnoId,
            canal: "Consultorio",
            estado: esExacto ? "Confirmado Presencial" : "Pendiente de Horario",
            motivoCitacion: motivo,
            modoHorario: esExacto ? "exacto" : "paciente",
            creadoEn: serverTimestamp(),
            creadoPor: sesionActual?.uid || null,
            llegadaEn: null,
            inicioConsultaEn: null,
            finConsultaEn: null,
            canceladoPor: null,
            canceladoEn: null,
            reprogramadoDe: null,
            timestamp: serverTimestamp()
        };

        batch.set(turnoRef, turnoData);

        if (esExacto) {
            const slotId = `${medUid}_${fecha}_${horario.replace(':', '')}`;
            batch.set(doc(db, "disponibilidad", slotId), {
                medicoUid: medUid,
                fecha: fecha,
                horario: horario,
                creadoEn: serverTimestamp()
            });
        }

        batch.set(doc(collection(db, "auditoria")), {
            actorUid: sesionActual ? sesionActual.uid : "medico",
            actorRol: sesionActual ? sesionActual.rol : "Médico",
            accion: "CITACION_PROXIMA_CONSULTA",
            pacienteId: pacienteActivoHC.id,
            detalle: `Citación agendada para ${fecha} (${esExacto ? horario + ' hs' : 'Horario a elección del paciente'}) - Motivo: ${motivo}`,
            fecha: serverTimestamp()
        });

        await batch.commit();

        ultimaCitacionGenerada = {
            id: turnoId,
            ...turnoData
        };

        cerrarModal('modal-proxima-consulta');
        mostrarComprobanteCitacion(ultimaCitacionGenerada);

    } catch (e) {
        console.error("Error al agendar próxima consulta:", e);
        mostrarAlerta("Error al Agendar", "No se pudo registrar la citación. Verifique los datos ingresados.");
    }
}

function mostrarComprobanteCitacion(cita) {
    const cuerpo = document.getElementById('comprobante-citacion-cuerpo');
    const contenedorEnlace = document.getElementById('contenedor-enlace-citacion');
    const inputEnlace = document.getElementById('input-enlace-citacion');

    if (!cuerpo) return;

    const esExacto = cita.modoHorario === 'exacto';
    const horarioTexto = esExacto 
        ? `<strong class="text-emerald-800 font-bold">${cita.horario} hs</strong> (Confirmado)`
        : `<span class="bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded">A elección del paciente</span>`;

    cuerpo.innerHTML = `
        <div class="flex justify-between items-center border-b border-slate-200 pb-2 mb-2">
            <span class="font-bold text-slate-800 text-sm">Resumen de Citación Médica</span>
            <span class="font-mono text-slate-500 text-[11px]">${cita.canal}</span>
        </div>
        <div class="space-y-1">
            <p><strong>Paciente:</strong> ${escaparHTML(cita.pacienteNombre)} (DNI ${escaparHTML(cita.pacienteDni)})</p>
            <p><strong>Profesional:</strong> ${escaparHTML(cita.medico)} (${escaparHTML(cita.especialidad)})</p>
            <p><strong>Fecha Asignada:</strong> <span class="font-bold text-emerald-800">${escaparHTML(cita.fecha)}</span></p>
            <p><strong>Horario:</strong> ${horarioTexto}</p>
            ${cita.motivoCitacion ? `<p><strong>Motivo / Plan:</strong> ${escaparHTML(cita.motivoCitacion)}</p>` : ''}
            <p class="pt-1 text-[11px] text-slate-500">Código de Turno: <strong class="font-mono text-slate-800 select-all">${cita.codigoConfirmacion}</strong></p>
        </div>
    `;

    if (!esExacto && contenedorEnlace && inputEnlace) {
        const urlBase = window.location.href.split('panel.html')[0];
        const link = `${urlBase}index.html?cita=${cita.id}`;
        inputEnlace.value = link;
        contenedorEnlace.classList.remove('hidden');
    } else if (contenedorEnlace) {
        contenedorEnlace.classList.add('hidden');
    }

    abrirModal('modal-comprobante-citacion');
}

export function copiarEnlaceCitacion() {
    const input = document.getElementById('input-enlace-citacion');
    const btn = document.getElementById('btn-copiar-enlace-citacion');
    if (!input || !input.value) return;

    const textoAviso = `Hospital Teodoro J. Schestakow: Tu médico te asignó consulta médica de seguimiento. Elegí tu horario preferido ingresando aquí: ${input.value}`;

    navigator.clipboard.writeText(textoAviso).then(() => {
        if (btn) {
            const original = btn.innerText;
            btn.innerText = "¡Copiado!";
            setTimeout(() => { btn.innerText = original; }, 2000);
        }
    }).catch(() => {
        input.select();
        document.execCommand('copy');
        if (btn) {
            btn.innerText = "¡Copiado!";
            setTimeout(() => { btn.innerText = "Copiar"; }, 2000);
        }
    });
}

export function imprimirComprobanteCitacion() {
    if (!ultimaCitacionGenerada) return;
    const c = ultimaCitacionGenerada;
    const esExacto = c.modoHorario === 'exacto';
    const horarioTexto = esExacto ? `${c.horario} hs` : `Pendiente de elección por el paciente`;

    const printWin = window.open('', '_blank', 'width=600,height=520');
    if (!printWin) {
        window.print();
        return;
    }

    const urlBase = window.location.href.split('panel.html')[0];
    const linkCita = `${urlBase}index.html?cita=${c.id}`;

    printWin.document.write(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
            <meta charset="UTF-8">
            <title>Talón de Citación - Hospital Schestakow</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 24px; color: #1e293b; }
                .header { text-align: center; border-bottom: 2px solid #047857; padding-bottom: 12px; margin-bottom: 16px; }
                .title { font-size: 16px; font-weight: bold; text-transform: uppercase; color: #047857; }
                .subtitle { font-size: 12px; color: #64748b; }
                .box { border: 1px dashed #047857; padding: 14px; border-radius: 8px; margin-bottom: 16px; background: #f8fafc; }
                .row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 13px; }
                .label { font-weight: bold; color: #334155; }
                .val { font-weight: bold; color: #047857; }
                .footer { font-size: 11px; color: #64748b; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 12px; }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="title">Hospital Teodoro J. Schestakow</div>
                <div class="subtitle">Orden de Citación y Seguimiento Médico</div>
            </div>
            <div class="box">
                <div class="row"><span class="label">Paciente:</span> <span>${c.pacienteNombre} (DNI ${c.pacienteDni})</span></div>
                <div class="row"><span class="label">Profesional:</span> <span>${c.medico} (${c.especialidad})</span></div>
                <div class="row"><span class="label">Fecha Asignada:</span> <span class="val">${c.fecha}</span></div>
                <div class="row"><span class="label">Horario:</span> <span class="val">${horarioTexto}</span></div>
                ${c.motivoCitacion ? `<div class="row"><span class="label">Indicación / Plan:</span> <span>${c.motivoCitacion}</span></div>` : ''}
                <div class="row"><span class="label">Código de Turno:</span> <span style="font-family: monospace;">${c.codigoConfirmacion}</span></div>
            </div>
            ${!esExacto ? `
                <div style="background:#ecfdf5; border:1px solid #a7f3d0; padding:10px; border-radius:6px; font-size:12px; margin-bottom:14px; text-align:center;">
                    <strong>Elección de Horario:</strong> Ingresá al siguiente enlace para elegir tu horario preferido del día asignado:<br>
                    <span style="font-family:monospace; color:#047857; word-break:break-all; font-weight:bold;">${linkCita}</span>
                </div>
            ` : ''}
            <div class="footer">
                Presentarse con 10 minutos de anticipación y DNI.<br>
                Emilio Civit 150, San Rafael, Mendoza. Tel: (0260) 442-7086.
            </div>
            <script>window.onload = function() { window.print(); }<\/script>
        </body>
        </html>
    `);
    printWin.document.close();
}

export function autocompletarNachoDemo() {
    const inputUser = document.getElementById('login-user');
    const inputPass = document.getElementById('login-pass');
    if (inputUser) inputUser.value = 'nachohelbas@gmail.com';
    if (inputPass) {
        inputPass.focus();
    }
}

export async function inyectarDemoCompletaForo() {
    if (!sesionActual || (sesionActual.rol !== 'Administración' && sesionActual.correo?.toLowerCase() !== 'nachohelbas@gmail.com')) {
        mostrarAlerta("Acceso Denegado", "Solo el Administrador General puede ejecutar la inyección del escenario para el Foro.");
        return;
    }

    const confirm = await pedirConfirmacion(
        "Preparar Demostración para el Foro",
        "Esta acción cargará el escenario completo 100% funcional: médicos especialistas, agenda de pacientes para el día de hoy en Recepción y Sala de Espera médica, con historias clínicas de prueba.",
        "Sí, Inyectar Escenario 100%"
    );
    if (!confirm) return;

    abrirModal('modal-progreso');
    const barra = document.getElementById('progreso-barra');
    const texto = document.getElementById('progreso-texto');

    try {
        if (texto) texto.innerText = "Preparando perfil de Administrador y catálogo médico...";
        if (barra) barra.style.width = '20%';

        // 0. Asegurar perfil de SuperAdmin en Firestore para validar reglas de seguridad
        if (sesionActual?.uid && sesionActual.correo?.toLowerCase() === 'nachohelbas@gmail.com') {
            await setDoc(doc(db, "usuarios", sesionActual.uid), {
                nombre: "Ignacio Helbas",
                correo: sesionActual.correo,
                rol: "Administración",
                activo: true,
                actualizadoEn: serverTimestamp()
            }, { merge: true });
        }

        // 1. Inyectar médicos especialistas base si no existen
        const medicosBase = [
            { nom: "Dr. Esteban Quiroga", esp: "Clínica Médica", mat: "44019" },
            { nom: "Dr. Carlos San Martín", esp: "Cardiología", mat: "10293" },
            { nom: "Dra. María Antonieta", esp: "Pediatría", mat: "22019" },
            { nom: "Dra. Sofía Castro", esp: "Neurología", mat: "80291" },
            { nom: "Dr. Ricardo Silva", esp: "Traumatología y Ortopedia", mat: "33918" }
        ];

        for (let i = 0; i < medicosBase.length; i++) {
            const med = medicosBase[i];
            const uidDoc = `med_demo_${i + 1}`;
            await setDoc(doc(db, "medicos_publicos", uidDoc), {
                medicoUid: uidDoc,
                nombre: med.nom,
                especialidad: med.esp,
                matricula: med.mat,
                activo: true
            }, { merge: true });
        }

        if (texto) texto.innerText = "Generando pacientes y agenda de hoy...";
        if (barra) barra.style.width = '50%';

        const hoyStr = new Date().toISOString().split('T')[0];

        // 2. Pacientes del día para Recepción y Consultorio
        const pacientesDemo = [
            {
                dni: "30123456",
                nombre: "Carlos",
                apellido: "Gómez",
                celular: "2604112233",
                email: "carlos.gomez@demo.hospital",
                horario: "08:30",
                medico: "Dr. Esteban Quiroga",
                medicoUid: "med_demo_1",
                especialidad: "Clínica Médica",
                estado: "En Espera",
                antecedentes: "Hipertensión Arterial Diagnosticada hace 5 años en tratamiento. Diabetes Mellitus Tipo 2 no insulinodependiente.",
                medicacion: "Enalapril 10mg cada 12 hs vía oral. Metformina 850mg con almuerzo.",
                alergias: "Penicilina (edema de glotis y erupción cutánea grave)."
            },
            {
                dni: "28987654",
                nombre: "María",
                apellido: "Rodríguez",
                celular: "2604223344",
                email: "maria.rodriguez@demo.hospital",
                horario: "09:00",
                medico: "Dr. Esteban Quiroga",
                medicoUid: "med_demo_1",
                especialidad: "Clínica Médica",
                estado: "Confirmado Presencial",
                antecedentes: "Hipotiroidismo primario compensado.",
                medicacion: "Levotiroxina 75 mcg diaria en ayunas.",
                alergias: "Sin alergias medicamentosas conocidas."
            },
            {
                dni: "35111222",
                nombre: "Juan Pablo",
                apellido: "Rossi",
                celular: "2604334455",
                email: "juanpablo.rossi@demo.hospital",
                horario: "09:30",
                medico: "Dr. Carlos San Martín",
                medicoUid: "med_demo_2",
                especialidad: "Cardiología",
                estado: "En Espera",
                antecedentes: "Arritmia supraventricular paroxística.",
                medicacion: "Atenolol 25mg/día.",
                alergias: "AINEs (Ibuprofeno/Diclofenac: broncoespasmo)."
            },
            {
                dni: "42333444",
                nombre: "Lucía",
                apellido: "Fernández",
                celular: "2604556677",
                email: "lucia.fernandez@demo.hospital",
                horario: "10:00",
                medico: "Dra. María Antonieta",
                medicoUid: "med_demo_3",
                especialidad: "Pediatría",
                estado: "Confirmado Presencial",
                antecedentes: "Asma infantil leve intermitente.",
                medicacion: "Salbutamol aerosol SOS.",
                alergias: "Sin antecedentes alérgicos reportados."
            },
            {
                dni: "24555666",
                nombre: "Roberto",
                apellido: "Benítez",
                celular: "2604778899",
                email: "roberto.benitez@demo.hospital",
                horario: "08:00",
                medico: "Dr. Esteban Quiroga",
                medicoUid: "med_demo_1",
                especialidad: "Clínica Médica",
                estado: "Atendido",
                antecedentes: "Dislipemia mixta.",
                medicacion: "Atorvastatina 20mg nocturna.",
                alergias: "Sin alergias medicamentosas conocidas."
            }
        ];

        if (texto) texto.innerText = "Registrando historias clínicas y turnos activos...";
        if (barra) barra.style.width = '75%';

        for (let i = 0; i < pacientesDemo.length; i++) {
            const p = pacientesDemo[i];
            const pacienteId = `PAC_DEMO_${p.dni}`;
            const turnoId = `TURNO_DEMO_${hoyStr}_${i + 1}`;

            // Índice por DNI seguro (create si nuevo, merge si existente)
            const dniDocRef = doc(db, "pacientes_por_dni", p.dni);
            const dniSnap = await getDoc(dniDocRef);
            if (!dniSnap.exists()) {
                await setDoc(dniDocRef, {
                    pacienteId: pacienteId,
                    dni: p.dni,
                    creadoEn: serverTimestamp()
                });
            } else {
                await setDoc(dniDocRef, {
                    pacienteId: pacienteId,
                    dni: p.dni
                }, { merge: true });
            }

            // Ficha Demográfica del Paciente
            await setDoc(doc(db, "pacientes", pacienteId), {
                dni: p.dni,
                nombre: p.nombre,
                apellido: p.apellido,
                fechaNacimiento: "1985-05-15",
                sexo: i % 2 === 0 ? "Masculino" : "Femenino",
                contacto: {
                    celular: p.celular,
                    email: p.email
                },
                creadoEn: serverTimestamp(),
                creadoPor: sesionActual?.uid || "admin",
                esDemo: true
            }, { merge: true });

            // Resumen Clínico
            await setDoc(doc(db, "pacientes", pacienteId, "clinico", "resumen"), {
                antecedentes: p.antecedentes,
                medicacion: p.medicacion,
                alergias: p.alergias,
                actualizadoEn: serverTimestamp(),
                actualizadoPor: sesionActual?.uid || "admin"
            }, { merge: true });

            // Otorgar acceso al staff actual
            if (sesionActual?.uid) {
                await setDoc(doc(db, "pacientes", pacienteId, "acceso", sesionActual.uid), {
                    medicoUid: sesionActual.uid,
                    turnoId: turnoId,
                    creadoEn: serverTimestamp()
                }, { merge: true });
            }

            // Timestamps para el flujo del foro
            let llegadaEn = null;
            let inicioConsultaEn = null;
            let finConsultaEn = null;
            if (p.estado === "En Espera") {
                llegadaEn = serverTimestamp();
            } else if (p.estado === "Atendido") {
                llegadaEn = serverTimestamp();
                inicioConsultaEn = serverTimestamp();
                finConsultaEn = serverTimestamp();
            }

            // Turno del Día
            await setDoc(doc(db, "turnos", turnoId), {
                especialidad: p.especialidad,
                medico: p.medico,
                medicoUid: p.medicoUid,
                fecha: hoyStr,
                horario: p.horario,
                pacienteNombre: `${p.nombre} ${p.apellido}`,
                pacienteDni: p.dni,
                pacienteCelular: p.celular,
                pacienteEmail: p.email,
                codigoConfirmacion: `FORO${i + 1}`,
                canal: "Presencial",
                estado: p.estado,
                pacienteId: pacienteId,
                creadoEn: serverTimestamp(),
                creadoPor: sesionActual?.uid || "admin",
                llegadaEn: llegadaEn,
                inicioConsultaEn: inicioConsultaEn,
                finConsultaEn: finConsultaEn,
                canceladoPor: null,
                canceladoEn: null,
                reprogramadoDe: null,
                timestamp: serverTimestamp()
            }, { merge: true });
        }

        if (barra) barra.style.width = '100%';
        cerrarModal('modal-progreso');

        await cargarEspecialistasFirebase();
        cargarUsuariosAdmin('init');
        cargarMetricas(true);
        if (fechaRecepcionSeleccionada) generarAgendaRecepcion();
        if (document.body.dataset.view === 'doctor') cargarAgendaMedico();

        mostrarExito(
            "Demostración Preparada",
            "¡Escenario del Foro cargado al 100%! Especialistas disponibles, pacientes en Recepción y Sala de Espera médica de hoy lista para atender."
        );
    } catch (err) {
        console.error("Error al inyectar escenario demo:", err);
        cerrarModal('modal-progreso');
        mostrarAlerta("Error", "No se pudo inyectar el escenario de demostración: " + err.message);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializarEventosHC);
} else {
    inicializarEventosHC();
}

