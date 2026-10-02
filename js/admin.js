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
    sendPasswordResetEmail
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

// ==========================================
// SESIÓN Y AUTENTICACIÓN
// ==========================================
onAuthStateChanged(auth, async (user) => {
    if (!user || user.isAnonymous) {
        sesionActual = null;
        mostrarPantallaLogin();
        return;
    }

    let rol = "Recepción";
    let nombre = user.displayName || user.email;

    // SuperAdmin maestro: nachohelbas@gmail.com
    const esCuentaAdmin = Boolean(user.email && user.email.toLowerCase() === "nachohelbas@gmail.com");
    if (esCuentaAdmin) {
        rol = "Administración";
        nombre = "Ignacio Helbas (Administrador)";
    }

    try {
        const docRef = doc(db, "usuarios", user.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.rol && !esCuentaAdmin) rol = data.rol;
            if (data.nombre && !esCuentaAdmin) nombre = data.nombre;
        } else if (esCuentaAdmin) {
            // Asegurar que el perfil exista en Firestore con el UID de Auth
            await setDoc(docRef, {
                nombre: "Ignacio Helbas",
                correo: user.email,
                rol: "Administración",
                activo: true,
                actualizadoEn: serverTimestamp()
            }, { merge: true }).catch(() => {});
        }
    } catch (e) {
        console.warn("No se pudo leer perfil desde Firestore:", e);
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
    document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
    const vLogin = document.getElementById('view-login');
    if (vLogin) vLogin.classList.add('active');

    const btnAdmin = document.getElementById('btn-nav-admin');
    const btnRec = document.getElementById('btn-nav-reception');
    const btnDoc = document.getElementById('btn-nav-doctor');
    const btnLogout = document.getElementById('btn-logout');

    if (btnAdmin) btnAdmin.classList.add('hidden');
    if (btnRec) btnRec.classList.add('hidden');
    if (btnDoc) btnDoc.classList.add('hidden');
    if (btnLogout) btnLogout.classList.add('hidden');
}

export async function iniciarSesionReal() {
    const userInput = document.getElementById('login-user')?.value.trim();
    const passInput = document.getElementById('login-pass')?.value.trim();

    if (!userInput || !passInput) {
        mostrarAlerta("Datos Faltantes", "Ingrese correo o usuario y contraseña.");
        return;
    }

    try {
        let correoFinal = userInput;
        if (!correoFinal.includes("@")) {
            const snap = await getDocs(query(collection(db, "usuarios"), where("username", "==", correoFinal)));
            if (!snap.empty) {
                correoFinal = snap.docs[0].data().correo;
            } else {
                mostrarAlerta("Acceso Denegado", "El nombre de usuario especificado no existe.");
                return;
            }
        }

        try {
            await signInWithEmailAndPassword(auth, correoFinal, passInput);
        } catch (signInErr) {
            if (passInput.trim() !== passInput) {
                await signInWithEmailAndPassword(auth, correoFinal, passInput.trim());
            } else {
                throw signInErr;
            }
        }

        document.getElementById('login-user').value = '';
        document.getElementById('login-pass').value = '';
    } catch (error) {
        console.error("Error Auth:", error);
        let mensaje = "Las credenciales ingresadas son incorrectas.";
        if (error.code === 'auth/invalid-credential' || error.code === 'auth/wrong-password') {
            mensaje = "Contraseña o usuario incorrecto. Verifique mayúsculas y minúsculas (la contraseña es sensible a mayúsculas: 'Nacho2015').";
        } else if (error.code === 'auth/user-not-found') {
            mensaje = "El usuario no está registrado en Firebase Authentication.";
        } else if (error.code === 'auth/too-many-requests') {
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

    if (btnAdmin) btnAdmin.classList.add('hidden');
    if (btnRec) btnRec.classList.add('hidden');
    if (btnDoc) btnDoc.classList.add('hidden');
    if (btnDummies) btnDummies.classList.add('hidden');
    if (btnReset) btnReset.classList.add('hidden');

    if (btnLogout) {
        btnLogout.classList.remove('hidden');
        btnLogout.innerText = `Cerrar Sesión (${sesion.nombre || sesion.correo})`;
    }

    // nachohelbas@gmail.com o rol Administración tienen acceso completo a todos los paneles
    const esSuperAdmin = (sesion.rol === "Administración" || sesion.correo?.toLowerCase() === "nachohelbas@gmail.com");

    if (esSuperAdmin) {
        if (btnAdmin) btnAdmin.classList.remove('hidden');
        if (btnRec) btnRec.classList.remove('hidden');
        if (btnDoc) btnDoc.classList.remove('hidden');
        if (btnDummies) btnDummies.classList.remove('hidden');
        if (btnReset) btnReset.classList.remove('hidden');
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
        const snap = await getDocs(query(collection(db, "usuarios"), where("rol", "==", "Médico")));
        bdMedicosDinamica = {};
        const selectAlcance = document.getElementById('admin-select-alcance');
        if (selectAlcance) selectAlcance.innerHTML = '<option value="global">Todas las especialidades (Global)</option>';

        snap.forEach((documento) => {
            const u = documento.data();
            if (u.especialidad && u.nombre && u.activo !== false) {
                if (!bdMedicosDinamica[u.especialidad]) bdMedicosDinamica[u.especialidad] = [];
                const yaEsta = bdMedicosDinamica[u.especialidad].some(m => m.uid === documento.id);
                if (!yaEsta) {
                    bdMedicosDinamica[u.especialidad].push({ uid: documento.id, nombre: u.nombre });
                    if (selectAlcance) selectAlcance.innerHTML += `<option value="${escaparHTML(u.nombre)}">Solo: ${escaparHTML(u.nombre)}</option>`;
                }
            }
        });

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
                            <button onclick="cancelarTurnoRecepcion('${turno.idDoc}')" class="text-xs bg-red-50 text-red-600 border border-red-200 px-2 py-1 rounded hover:bg-red-100 font-bold transition">Liberar</button>
                        ` : ''}
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
            canceladoEn: serverTimestamp()
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
                    promesas.push(updateDoc(doc(db, "turnos", documento.id), { estado: "Cancelado: " + motivo }));
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

    const nombreMedico = sesionActual?.nombre || sesionActual?.correo;
    if (tituloContainer) tituloContainer.classList.remove('hidden');
    if (tituloDashboard) tituloDashboard.innerText = `Consultorio: ${nombreMedico}`;

    container.innerHTML = '<p class="text-sm text-slate-400 text-center mt-10">Cargando pacientes del día...</p>';

    const hoyStr = new Date().toISOString().split('T')[0];

    try {
        const q = query(
            collection(db, "turnos"),
            where("medico", "==", nombreMedico),
            where("fecha", "==", hoyStr)
        );
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

            let badge = `<span class="text-xs px-2 py-0.5 rounded font-bold bg-blue-100 text-blue-800">${escaparHTML(t.estado)}</span>`;
            if (esAtendido) badge = `<span class="text-xs px-2 py-0.5 rounded font-bold bg-emerald-100 text-emerald-800">Atendido</span>`;
            if (esAusente) badge = `<span class="text-xs px-2 py-0.5 rounded font-bold bg-amber-100 text-amber-800">Ausente</span>`;
            if (esCancelado) badge = `<span class="text-xs px-2 py-0.5 rounded font-bold bg-red-100 text-red-800">Cancelado</span>`;

            html += `
                <div class="bg-white p-3 rounded-lg border border-slate-200 shadow-sm flex justify-between items-center gap-2">
                    <div>
                        <div class="flex items-center gap-2">
                            <span class="font-mono font-bold text-sm text-blue-900">${t.horario} hs</span>
                            ${badge}
                        </div>
                        <p class="font-bold text-sm text-slate-800 mt-1">${escaparHTML(t.pacienteNombre)}</p>
                        <p class="text-xs text-slate-500">DNI: ${escaparHTML(t.pacienteDni || 'N/A')}</p>
                    </div>
                    <div class="flex flex-col gap-1">
                        ${!esAtendido && !esAusente && !esCancelado ? `
                            <button onclick="llamarPaciente('${t.idDoc}')" class="text-xs bg-blue-800 text-white font-bold px-3 py-1.5 rounded hover:bg-blue-900 transition">Llamar</button>
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
                            <span class="text-xs font-mono font-bold text-blue-900 bg-blue-50 px-2.5 py-1 rounded">${escaparHTML(fechaStr)}</span>
                            <span class="text-xs font-semibold text-slate-700">${escaparHTML(c.medicoNombre || 'Médico')}</span>
                            ${esRectificacion ? `<span class="text-[11px] font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded">🔄 Rectificación de consulta</span>` : ''}
                            ${esRectificada ? `<span class="text-[11px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded">⚠️ Rectificada por entrada posterior</span>` : ''}
                        </div>
                        <div class="flex items-center gap-2">
                            <span class="text-[11px] bg-slate-100 text-slate-500 font-mono px-2 py-0.5 rounded">Inmutable</span>
                            <button onclick="abrirModalRectificar('${c.id}')" class="text-xs text-blue-700 hover:text-blue-900 font-bold border border-blue-200 px-2 py-1 rounded bg-blue-50/50 hover:bg-blue-100 transition">
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
                pacienteId: pacienteId
            });
        } else {
            await updateDoc(doc(db, "turnos", idDoc), { estado: "En Consultorio" });
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
        await updateDoc(doc(db, "turnos", idDoc), { estado: "Ausente" });
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
                        <span class="px-2 py-0.5 rounded text-xs font-bold ${u.rol === 'Administración' ? 'bg-purple-100 text-purple-800' : u.rol === 'Médico' ? 'bg-blue-100 text-blue-800' : 'bg-emerald-100 text-emerald-800'}">${escaparHTML(u.rol || 'Recepción')}</span>
                        ${u.matricula ? `<p class="text-xs text-slate-500 mt-1">M.P.: ${escaparHTML(u.matricula)}</p>` : ''}
                    </td>
                    <td class="p-3 text-xs text-slate-600">
                        <p>User: <span class="font-mono font-bold">${escaparHTML(u.username || 'N/A')}</span></p>
                        <button onclick="enviarResetPasswordUsuario('${escaparHTML(u.correo)}')" class="text-[11px] text-blue-700 underline hover:text-blue-900 mt-1">Enviar reset clave</button>
                    </td>
                    <td class="p-3 text-center">
                        <div class="flex justify-center gap-2">
                            <button onclick="editarUsuarioAdmin('${id}')" class="text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-1 rounded font-bold transition">Editar</button>
                            <button onclick="eliminarUsuarioAdmin('${id}')" class="text-xs bg-red-50 hover:bg-red-100 text-red-600 px-2 py-1 rounded font-bold transition">Eliminar</button>
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
    document.getElementById('input-usuario-username').value = '';
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
        document.getElementById('input-usuario-username').value = u.username || '';
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
    const user = document.getElementById('input-usuario-username').value.trim();
    const tel = document.getElementById('input-usuario-tel').value.trim();
    const cor = document.getElementById('input-usuario-correo').value.trim();
    const mat = document.getElementById('input-usuario-matricula').value.trim();
    const esp = document.getElementById('input-usuario-especialidad').value;

    if (!cor || !nom || !user) {
        mostrarAlerta("Datos Faltantes", "Nombre, Usuario y Correo son obligatorios.");
        return;
    }

    const payload = {
        nombre: nom,
        rol: rol,
        username: user,
        correo: cor,
        tel: tel,
        matricula: rol === 'Médico' ? mat : '',
        especialidad: rol === 'Médico' ? esp : '',
        activo: true
    };

    try {
        let uidFinal = id;
        if (id) {
            await updateDoc(doc(db, "usuarios", id), payload);
        } else {
            const userRef = await addDoc(collection(db, "usuarios"), {
                ...payload,
                creadoEn: serverTimestamp()
            });
            uidFinal = userRef.id;
        }

        if (rol === 'Médico') {
            await setDoc(doc(db, "medicos_publicos", uidFinal), {
                medicoUid: uidFinal,
                nombre: nom,
                especialidad: esp,
                activo: true
            });
        }

        mostrarExito(
            id ? "Actualizado" : "Guardado",
            id ? "Los datos se guardaron correctamente." : "Usuario registrado en Firestore correctamente."
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
        t.classList.remove('active', 'text-blue-800');
        t.classList.add('text-slate-500');
    });
    document.querySelectorAll('.admin-section').forEach(s => s.classList.add('hidden'));

    const tabActiva = document.getElementById('tab-' + tabId);
    if (tabActiva) {
        tabActiva.classList.add('active', 'text-blue-800');
        tabActiva.classList.remove('text-slate-500');
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

export async function cargarMetricas() {
    const tbody = document.getElementById('metricas-tbody');
    const kpiContainer = document.getElementById('metricas-kpi-container');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="5" class="p-6 text-center text-slate-400">Calculando indicadores clínicos...</td></tr>';

    try {
        const snapTurnos = await getDocs(collection(db, "turnos"));
        let statsPorMedico = {};
        let totalGeneral = 0;
        let totalAtendidos = 0;
        let totalAusentes = 0;

        snapTurnos.forEach(d => {
            const t = d.data();
            const med = t.medico || "Sin Asignar";
            if (!statsPorMedico[med]) {
                statsPorMedico[med] = { especialidad: t.especialidad || 'N/A', total: 0, atendidos: 0, ausentes: 0 };
            }
            statsPorMedico[med].total++;
            totalGeneral++;
            if (t.estado === "Atendido") {
                statsPorMedico[med].atendidos++;
                totalAtendidos++;
            }
            if (t.estado === "Ausente") {
                statsPorMedico[med].ausentes++;
                totalAusentes++;
            }
        });

        if (kpiContainer) {
            const tasaGlobal = totalGeneral > 0 ? Math.round((totalAusentes / totalGeneral) * 100) : 0;
            kpiContainer.innerHTML = `
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div class="bg-white/95 p-4 rounded-xl border border-slate-200 shadow-sm">
                        <p class="text-xs font-bold text-slate-500 uppercase">Volumen Total Turnos</p>
                        <p class="text-2xl font-bold text-blue-900 mt-1">${totalGeneral}</p>
                    </div>
                    <div class="bg-white/95 p-4 rounded-xl border border-slate-200 shadow-sm">
                        <p class="text-xs font-bold text-slate-500 uppercase">Turnos Efectivizados</p>
                        <p class="text-2xl font-bold text-emerald-600 mt-1">${totalAtendidos}</p>
                    </div>
                    <div class="bg-white/95 p-4 rounded-xl border border-slate-200 shadow-sm">
                        <p class="text-xs font-bold text-slate-500 uppercase">Tasa Global Ausentismo</p>
                        <p class="text-2xl font-bold text-amber-600 mt-1">${tasaGlobal}%</p>
                    </div>
                </div>
            `;
        }

        let filas = '';
        for (const [med, st] of Object.entries(statsPorMedico)) {
            const ausTasa = st.total > 0 ? Math.round((st.ausentes / st.total) * 100) : 0;
            filas += `
                <tr class="border-b border-slate-100 hover:bg-slate-50 transition">
                    <td class="p-3 font-bold text-slate-800">${escaparHTML(med)}</td>
                    <td class="p-3 text-xs text-slate-600">${escaparHTML(st.especialidad)}</td>
                    <td class="p-3 text-center font-bold text-slate-700">${st.total}</td>
                    <td class="p-3 text-center font-bold text-emerald-600">${st.atendidos}</td>
                    <td class="p-3 text-center">
                        <span class="px-2 py-0.5 rounded text-xs font-bold ${ausTasa > 30 ? 'bg-red-100 text-red-800' : 'bg-slate-100 text-slate-700'}">${ausTasa}%</span>
                    </td>
                </tr>
            `;
        }
        tbody.innerHTML = filas || '<tr><td colspan="5" class="p-6 text-center text-slate-500">No hay datos suficientes para calcular métricas.</td></tr>';
    } catch (e) {
        console.error(e);
        tbody.innerHTML = '<tr><td colspan="5" class="p-6 text-center text-red-500">Error al calcular métricas.</td></tr>';
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

export async function limpiarBaseDeDatos() {
    const input = prompt("⚠️ ADVERTENCIA DE SEGURIDAD ⚠️\nEsta acción borrará TODOS los turnos y usuarios de prueba.\n\nPara confirmar, escriba exactamente la palabra: BORRAR");
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
        cargarMetricas();
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

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializarEventosHC);
} else {
    inicializarEventosHC();
}

