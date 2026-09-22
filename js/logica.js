// ==========================================
// IMPORTACIONES DE FIREBASE Y AUTH
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, query, where, getDocs, doc, setDoc, addDoc, updateDoc, deleteDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// ==========================================
// CONFIGURACIÓN DE FIREBASE
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyAghXQKrYy6EJGD5IqEdO4c_E-ntozUmz8",
    authDomain: "sistema-turnos-utn.firebaseapp.com",
    projectId: "sistema-turnos-utn",
    storageBucket: "sistema-turnos-utn.firebasestorage.app",
    messagingSenderId: "588893912264",
    appId: "1:588893912264:web:c5d56455f06cf178d979fd"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
window.db = db;
window.auth = auth;

// ==========================================
// CONFIGURACIÓN DE EMAILJS
// ==========================================
const EMAILJS_PUBLIC_KEY = "eXBPLCSkZcKDBBz9h"; 
const EMAILJS_SERVICE_ID = "service_xitx594"; 
const EMAILJS_TEMPLATE_CONFIRMACION = "template_confirmacion"; 
const EMAILJS_TEMPLATE_CANCELACION = "template_cancelacion"; 

if(EMAILJS_PUBLIC_KEY) {
    emailjs.init(EMAILJS_PUBLIC_KEY);
}

function enviarCorreoNotificacion(templateId, templateParams) {
    if (!templateParams.email_destino) return;
    emailjs.send(EMAILJS_SERVICE_ID, templateId, templateParams)
        .then(function() { console.log("Correo enviado a " + templateParams.email_destino); }, 
              function(error) { console.error("Fallo al enviar correo:", error); });
}

// ==========================================
// VARIABLES GLOBALES
// ==========================================
let bdMedicosDinamica = {};
let duracionTurnoGlobal = 15; 
let modulacionPorMedico = {}; 
let datosMetricasCache = []; 

// ==========================================
// INICIALIZACIÓN (SISTEMA LIMPIO)
// ==========================================
function establecerLimitesFecha() {
    const hoy = new Date();
    const fechaMinima = hoy.toISOString().split('T')[0];
    if(document.getElementById('input-fecha-paciente')) document.getElementById('input-fecha-paciente').min = fechaMinima;
    if(document.getElementById('input-fecha-recepcion')) document.getElementById('input-fecha-recepcion').min = fechaMinima;
    if(document.getElementById('input-fecha-proxima-visita')) document.getElementById('input-fecha-proxima-visita').min = fechaMinima;
}

// Función purgada, ya no inyecta datos falsos
function forzarReseedDB() {
    mostrarAlerta("Aviso", "El sistema de prueba fue eliminado. El software está en modo producción (vacío).");
}

async function cargarEspecialistasFirebase() {
    try {
        const snap = await getDocs(query(collection(window.db, "usuarios"), where("rol", "==", "Médico")));
        bdMedicosDinamica = {}; 
        const selectAlcance = document.getElementById('admin-select-alcance');
        if(selectAlcance) selectAlcance.innerHTML = '<option value="global">Todas las especialidades (Global)</option>';
        
        snap.forEach((doc) => {
            const u = doc.data();
            if(u.especialidad && u.nombre) {
                if (!bdMedicosDinamica[u.especialidad]) bdMedicosDinamica[u.especialidad] = [];
                bdMedicosDinamica[u.especialidad].push(u.nombre);
                if(selectAlcance) selectAlcance.innerHTML += `<option value="${u.nombre}">Solo: ${u.nombre}</option>`;
            }
        });
    } catch(e) { console.error(e); }
}

async function cargarConfiguracionModulacion() {
    try {
        const snapGlobal = await getDoc(doc(window.db, "configuracion", "general"));
        if(snapGlobal.exists()) {
            duracionTurnoGlobal = snapGlobal.data().duracionBase || 15;
            const selectAdmin = document.getElementById('admin-select-duracion');
            if(selectAdmin && document.getElementById('admin-select-alcance').value === 'global') {
                selectAdmin.value = duracionTurnoGlobal;
            }
        }
        const snapIndividual = await getDocs(collection(window.db, "modulacion_medicos"));
        modulacionPorMedico = {}; 
        snapIndividual.forEach(documento => { modulacionPorMedico[documento.id] = documento.data().duracionBase; });
    } catch(e) { console.log("Configuración por defecto."); }
}

async function iniciarCargaDeDatos() {
    establecerLimitesFecha(); 
    await cargarEspecialistasFirebase(); 
    await cargarConfiguracionModulacion();
    
    if (document.getElementById('view-admin').classList.contains('active')) cargarUsuariosAdmin();
    if (document.getElementById('view-public').classList.contains('active')) actualizarMedicosPublico();
    if (document.getElementById('view-reception').classList.contains('active')) actualizarMedicosRecepcion();
}

// ==========================================
// SESIÓN Y NAVEGACIÓN (ESTRICTAMENTE FIREBASE AUTH)
// ==========================================
function switchView(viewName) {
    document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
    document.getElementById('view-' + viewName).classList.add('active');
    
    const btnLogout = document.getElementById('btn-logout');
    if (viewName !== 'public' && viewName !== 'login') {
        btnLogout.classList.remove('hidden');
        const sesionStr = localStorage.getItem("sesionHospitalActiva");
        if (sesionStr) { btnLogout.innerText = `Cerrar Sesión (${JSON.parse(sesionStr).nombre})`; } 
        else { btnLogout.innerText = "Cerrar Sesión"; }
    } else { 
        btnLogout.classList.add('hidden'); 
    }
    
    if (viewName === 'reception') {
        actualizarMedicosRecepcion();
        if (fechaRecepcionSeleccionada) generarAgendaRecepcion();
    }
    if (viewName === 'public') actualizarMedicosPublico();
    if (viewName === 'doctor') cargarAgendaMedico();
    if (viewName === 'admin') cargarUsuariosAdmin();
}

async function iniciarSesionReal() {
    const email = document.getElementById('login-user').value.trim();
    const pass = document.getElementById('login-pass').value.trim();
    
    if (!email || !pass) { 
        mostrarAlerta("Datos Faltantes", "Ingrese correo electrónico y contraseña."); 
        return; 
    }
    
    try {
        // 1. PASO ESTRICTO: Solo permite acceso si Firebase Auth valida el correo y contraseña
        await signInWithEmailAndPassword(window.auth, email, pass);
        
        // 2. Busca qué rol tiene asignado ese correo en Firestore
        const snapUser = await getDocs(query(collection(window.db, "usuarios"), where("correo", "==", email)));
        
        let datosUser = null;
        if (!snapUser.empty) {
            snapUser.forEach((doc) => { datosUser = doc.data(); });
        } else {
            mostrarAlerta("Error de Permisos", "Correo validado, pero no tiene un perfil asignado en el sistema.");
            return;
        }

        localStorage.setItem("sesionHospitalActiva", JSON.stringify(datosUser));
        
        document.getElementById('login-user').value = ''; 
        document.getElementById('login-pass').value = '';
        
        if (datosUser.rol === "Médico") switchView("doctor");
        else if (datosUser.rol === "Administrativo" || datosUser.rol === "Recepción") switchView("reception");
        else if (datosUser.rol === "Administración") switchView("admin");

    } catch (error) {
        console.error("Error de autenticación:", error);
        mostrarAlerta("Acceso Denegado", "Correo o contraseña incorrectos.");
    }
}

function cerrarSesionReal() { 
    localStorage.removeItem("sesionHospitalActiva"); 
    switchView("public"); 
}

function loginAs(role) { switchView(role); }

function abrirModal(id) { document.getElementById(id).classList.add('active'); }

function cerrarModal(id) { 
    document.getElementById(id).classList.remove('active'); 
    if (id === 'modal-cancelar-paciente') { 
        document.getElementById('input-buscar-dni').value = ''; 
        document.getElementById('resultado-turnos-paciente').innerHTML = ''; 
        document.getElementById('resultado-turnos-paciente').classList.add('hidden'); 
    } 
    if (id === 'modal-ausencia-emergencia') { 
        document.getElementById('motivo-ausencia').value = ''; 
        document.getElementById('hora-desde-ausencia').value = ''; 
    } 
}

// ==========================================
// PACIENTES (PÚBLICO)
// ==========================================
function actualizarMedicosPublico() {
    const esp = document.getElementById('select-especialidad').value;
    const selectMed = document.getElementById('select-medico');
    selectMed.innerHTML = '';
    
    if (!esp) { 
        selectMed.disabled = true; 
        selectMed.className = "w-full border rounded p-3 bg-gray-100 text-gray-500 outline-none";
        selectMed.innerHTML = '<option>Primero seleccione especialidad</option>';
        generarHorariosPublicos(); 
        return; 
    }
    
    selectMed.disabled = false;
    selectMed.className = "w-full border rounded p-3 bg-white text-gray-800 focus:ring-2 focus:ring-blue-500 outline-none transition-shadow";
    
    if (bdMedicosDinamica[esp] && bdMedicosDinamica[esp].length > 0) {
        bdMedicosDinamica[esp].sort().forEach(m => selectMed.innerHTML += `<option value="${m}">${m}</option>`);
    } else {
        selectMed.innerHTML = '<option value="">No hay profesionales registrados en esta área</option>';
    }
    generarHorariosPublicos(); 
}

function validarDiaHabil(input) {
    if (!input.value) return;
    const [anio, mes, dia] = input.value.split('-');
    const f = new Date(anio, mes - 1, dia);
    
    const hoy = new Date();
    hoy.setHours(0,0,0,0);

    if (f < hoy) {
        mostrarAlerta("Fecha Inválida", "Operación denegada. No se pueden seleccionar fechas en el pasado.");
        input.value = "";
        return;
    }

    if (f.getDay() === 0 || f.getDay() === 6) { 
        mostrarAlerta("Día no hábil", "Atención denegada. El hospital atiende por turnos solo de Lunes a Viernes."); 
        input.value = ""; 
    }
}

async function generarHorariosPublicos() {
    const input = document.getElementById('input-fecha-paciente').value;
    const medico = document.getElementById('select-medico').value;
    const container = document.getElementById('horarios-publicos');
    
    if(!input || !medico || medico.includes("Primero") || medico.includes("No hay")) {
        container.innerHTML = '<p class="text-sm text-gray-500 col-span-3">Seleccione Profesional y Fecha.</p>'; 
        return;
    }
    container.innerHTML = '<div class="col-span-3 flex justify-center py-4"><p class="text-sm text-blue-600 font-bold ml-2">Consultando disponibilidad...</p></div>';

    let turnosOcupados = {};
    try {
        const snap = await getDocs(query(collection(window.db, "turnos"), where("fecha", "==", input)));
        snap.forEach((doc) => {
            const data = doc.data();
            if (data.medico === medico && !data.estado.includes("Cancelado") && data.estado !== "Ausente") {
                turnosOcupados[data.horario] = true; 
            }
        });
    } catch (error) { console.error(error); }

    const ahora = new Date();
    const esHoy = (input === (ahora.getFullYear() + "-" + String(ahora.getMonth() + 1).padStart(2, '0') + "-" + String(ahora.getDate()).padStart(2, '0')));
    const minActuales = ahora.getHours() * 60 + ahora.getMinutes();
    
    let duracionActual = modulacionPorMedico[medico] ? parseInt(modulacionPorMedico[medico]) : parseInt(duracionTurnoGlobal);
    if (isNaN(duracionActual) || duracionActual <= 0) duracionActual = 15;

    let html = '';
    let minBucle = 7 * 60; 
    const finBucle = 12 * 60 + 30; 
    let esCanalWeb = true; 
    let delay = 0; 

    while (minBucle <= finBucle) {
        let h = Math.floor(minBucle / 60);
        let m = minBucle % 60;
        let hsStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
        
        if (esCanalWeb) {
            if (turnosOcupados[hsStr]) { 
                html += `<button type="button" class="bg-gray-100 text-gray-400 font-bold rounded p-2 border cursor-not-allowed animate-fade-in-up-fast" style="animation-delay: ${delay}ms" disabled>${hsStr} (Ocupado)</button>`;
            } else if (esHoy && (minBucle - minActuales) < 60) {
                html += `<button type="button" class="bg-red-50 text-red-400 font-bold rounded p-2 border border-red-200 cursor-not-allowed animate-fade-in-up-fast" style="animation-delay: ${delay}ms" disabled>${hsStr} (Cerrado)</button>`;
            } else { 
                html += `<button type="button" onclick="seleccionarHorario(this)" class="btn-horario bg-white border border-blue-800 text-blue-900 font-bold rounded p-2 hover:bg-blue-50 shadow-sm transition animate-fade-in-up-fast" style="animation-delay: ${delay}ms">${hsStr}</button>`;
            }
            delay += 10;
        }
        esCanalWeb = !esCanalWeb; 
        minBucle += duracionActual; 
    }
    container.innerHTML = html || '<p class="text-sm text-gray-500 col-span-3">No hay turnos web disponibles.</p>';
}

function seleccionarHorario(btnClickeado) {
    document.querySelectorAll('.btn-horario').forEach(btn => { 
        btn.classList.remove('bg-blue-800', 'text-white'); 
        btn.classList.add('bg-white', 'text-blue-900'); 
    });
    btnClickeado.classList.remove('bg-white', 'text-blue-900');
    btnClickeado.classList.add('bg-blue-800', 'text-white');
}

async function confirmarTurnoFirebase() {
    const esp = document.getElementById('select-especialidad').value;
    const med = document.getElementById('select-medico').value;
    const fec = document.getElementById('input-fecha-paciente').value;
    const btn = document.querySelector('.btn-horario.bg-blue-800');
    const hor = btn ? btn.innerText.replace(' (Ocupado)', '').replace(' (Cerrado)', '').trim() : '';
    const nom = document.getElementById('paciente-nombre').value.trim();
    const dni = document.getElementById('paciente-dni').value.trim();
    const cel = document.getElementById('paciente-celular').value.trim();
    const email = document.getElementById('paciente-email').value.trim();

    if (!esp || !med || !fec || !hor) { mostrarAlerta("Datos Incompletos", "Seleccione Especialidad, Profesional, Fecha y Horario."); return; }
    if (!nom || !dni || !cel) { mostrarAlerta("Faltan Datos del Paciente", "Nombre, DNI y Celular son campos obligatorios."); return; }

    try {
        await addDoc(collection(window.db, "turnos"), {
            especialidad: esp, medico: med, fecha: fec, horario: hor, pacienteNombre: nom, pacienteDni: dni, pacienteCelular: cel, pacienteEmail: email, estado: "Reservado Web", timestamp: new Date()
        });
        
        enviarCorreoNotificacion(EMAILJS_TEMPLATE_CONFIRMACION, {
            nombre_paciente: nom, medico: med, especialidad: esp, fecha: fec, hora: hor, email_destino: email
        });
        
        mostrarExito("¡Turno Confirmado!", "El turno ha sido guardado exitosamente.");
        
        document.getElementById('paciente-nombre').value = ''; 
        document.getElementById('paciente-dni').value = ''; 
        document.getElementById('paciente-celular').value = ''; 
        document.getElementById('paciente-email').value = ''; 
        document.getElementById('input-fecha-paciente').value = ''; 
        document.getElementById('select-especialidad').value = ''; 
        document.getElementById('horarios-publicos').innerHTML = '<p class="text-sm text-gray-500 col-span-3">Seleccione una fecha.</p>'; 
        document.getElementById('select-medico').innerHTML = '<option>Primero seleccione especialidad</option>'; 
        document.getElementById('select-medico').disabled = true;

    } catch (error) { 
        console.error(error); 
        mostrarAlerta("Error de Conexión", "Hubo un error al registrar el turno. Intente nuevamente."); 
    } 
}

async function buscarTurnosPaciente() {
    const dni = document.getElementById('input-buscar-dni').value.trim();
    const res = document.getElementById('resultado-turnos-paciente');
    
    if (!dni) { mostrarAlerta("Dato Faltante", "Por favor ingrese su número de DNI para realizar la búsqueda."); return; }

    try {
        const snap = await getDocs(query(collection(window.db, "turnos"), where("pacienteDni", "==", dni)));
        
        let html = '';
        if (snap.empty) { 
            html = `<p class="text-sm text-red-600 font-semibold text-center">No hay turnos activos para este DNI.</p>`; 
        } else {
            snap.forEach((doc) => {
                const t = doc.data();
                const cancelado = t.estado.includes("Cancelado");
                const badge = cancelado ? `<span class="text-xs bg-red-100 text-red-800 px-2 py-1 rounded font-bold">${t.estado}</span>` : '';
                const btn = cancelado || t.estado==="Atendido" || t.estado==="Ausente" ? '' : `<button onclick="cancelarTurnoFirebase('${doc.id}')" class="text-xs bg-white text-red-700 px-3 py-2 rounded font-bold border hover:bg-red-50 transition">Cancelar</button>`;
                html += `<div class="bg-gray-50 border p-3 rounded flex justify-between items-center mb-2"><div><p class="font-bold text-sm">${t.especialidad} - ${t.medico}</p><p class="text-xs text-gray-600">${t.fecha} - ${t.horario} hs ${badge}</p></div>${btn}</div>`;
            });
        }
        res.innerHTML = html; 
        res.classList.remove('hidden');
    } catch (error) { console.error(error); mostrarAlerta("Error", "Error al conectar con la base de datos."); }
}

async function cancelarTurnoFirebase(id) {
    const confirmado = await pedirConfirmacion("¿Cancelar este turno?", "Se eliminará la reserva y se enviará un correo notificando la cancelación.", "Sí, cancelar turno");
    if (!confirmado) return;

    try {
        const docSnap = await getDoc(doc(window.db, "turnos", id));
        if (docSnap.exists()) {
            const t = docSnap.data();
            enviarCorreoNotificacion(EMAILJS_TEMPLATE_CANCELACION, {
                nombre_paciente: t.pacienteNombre, medico: t.medico, especialidad: t.especialidad, fecha: t.fecha, hora: t.horario, email_destino: t.pacienteEmail
            });
        }

        await deleteDoc(doc(window.db, "turnos", id));
        mostrarExito("Turno Cancelado", "Su turno ha sido cancelado.");
        buscarTurnosPaciente(); 
    } catch (error) { console.error(error); mostrarAlerta("Error", "No se pudo cancelar el turno."); }
}

// ==========================================
// RECEPCIÓN
// ==========================================
let fechaRecepcionSeleccionada = '';
let medicoSeleccionadoRecepcion = '';
let especialidadSeleccionadaRecepcion = '';

function actualizarMedicosRecepcion() {
    const esp = document.getElementById('reception-especialidad').value;
    const selectMed = document.getElementById('reception-medico');
    selectMed.innerHTML = '';
    
    if (!esp) { 
        selectMed.disabled = true; 
        selectMed.className = "w-full border border-gray-300 rounded p-2 bg-gray-100 text-gray-500 outline-none";
        selectMed.innerHTML = '<option>Primero seleccione especialidad</option>';
        return; 
    }
    
    selectMed.disabled = false;
    selectMed.className = "w-full border border-gray-300 rounded p-2 bg-white text-gray-800 focus:ring-2 focus:ring-indigo-600 outline-none";
    
    if (bdMedicosDinamica[esp] && bdMedicosDinamica[esp].length > 0) {
        bdMedicosDinamica[esp].sort().forEach(m => selectMed.innerHTML += `<option value="${m}">${m}</option>`);
    } else {
        selectMed.innerHTML = '<option value="">No hay profesionales registrados en esta área</option>';
    }
}

function buscarAgendaRecepcion() {
    especialidadSeleccionadaRecepcion = document.getElementById('reception-especialidad').value;
    medicoSeleccionadoRecepcion = document.getElementById('reception-medico').value;
    fechaRecepcionSeleccionada = document.getElementById('input-fecha-recepcion').value;

    if (!especialidadSeleccionadaRecepcion || document.getElementById('reception-medico').disabled || !fechaRecepcionSeleccionada || medicoSeleccionadoRecepcion.includes("No hay")) {
        mostrarAlerta("Datos Faltantes", "Seleccione Especialidad, Profesional y Fecha para consultar la agenda."); 
        return;
    }

    const [anio, mes, dia] = fechaRecepcionSeleccionada.split('-');
    document.getElementById('titulo-agenda-recepcion').innerText = `Agenda: ${medicoSeleccionadoRecepcion} - ${dia}/${mes}/${anio}`;
    document.getElementById('contenedor-grilla-recepcion').classList.remove('hidden');
    
    generarAgendaRecepcion();
}

async function generarAgendaRecepcion() {
    const tbody = document.getElementById('reception-tbody');
    if(!tbody) return;

    let turnosOcupados = {};
    try {
        const snap = await getDocs(query(collection(window.db, "turnos"), where("fecha", "==", fechaRecepcionSeleccionada)));
        snap.forEach((documento) => {
            const data = documento.data();
            if (data.medico === medicoSeleccionadoRecepcion) {
                turnosOcupados[data.horario] = { id: documento.id, ...data };
            }
        });
    } catch (error) { console.error("Error BD:", error); }

    let html = '';
    let minutosBucle = 7 * 60; 
    const finBucle = 12 * 60 + 30; 
    let esCanalWeb = true; 
    
    let duracionActual = modulacionPorMedico[medicoSeleccionadoRecepcion] ? parseInt(modulacionPorMedico[medicoSeleccionadoRecepcion]) : parseInt(duracionTurnoGlobal);
    if (isNaN(duracionActual) || duracionActual <= 0) duracionActual = 15;

    while (minutosBucle <= finBucle) {
        let h = Math.floor(minutosBucle / 60);
        let m = minutosBucle % 60;
        let horaStr = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
        
        const canalStr = esCanalWeb ? 'Web' : 'Presencial';
        const styleCanal = esCanalWeb ? 'bg-blue-100 text-blue-800' : 'bg-gray-200 text-gray-800';
        
        let htmlPaciente = '<i class="text-gray-400">Libre</i>';
        let htmlEstado = '<span class="text-green-700 font-bold text-sm">Disponible</span>';
        let htmlAccion = `<button onclick="abrirModalDarTurno('${horaStr}')" class="bg-indigo-700 text-white text-xs px-3 py-2 rounded font-bold hover:bg-indigo-800 shadow-sm transition">Asignar Turno</button>`;
        
        if (turnosOcupados[horaStr]) {
            const t = turnosOcupados[horaStr];
            htmlPaciente = `<span class="font-bold text-gray-800">${t.pacienteNombre}</span> <span class="text-xs text-gray-500">(DNI: ${t.pacienteDni})</span>`;
            
            if(t.estado.includes("Cancelado")) {
                htmlEstado = `<span class="text-red-600 font-bold text-xs uppercase">${t.estado}</span>`;
                htmlAccion = `<span class="text-xs text-gray-400 font-bold">Bloqueado</span>`;
            } else {
                htmlEstado = `<span class="text-yellow-700 font-bold text-sm">${t.estado}</span>`;
                htmlAccion = `<button onclick="cancelarTurnoRecepcion('${t.id}')" class="bg-white border border-red-500 text-red-700 text-xs px-3 py-2 rounded font-bold hover:bg-red-50 transition shadow-sm">Cancelar</button>`;
            }
        }

        html += `
        <tr class="border-b hover:bg-gray-50 bg-white">
            <td class="p-3 font-bold text-gray-800">${horaStr}</td>
            <td class="p-3"><span class="text-xs px-2 py-1 rounded font-bold border border-gray-300 ${styleCanal}">${canalStr}</span></td>
            <td class="p-3">${htmlPaciente}</td>
            <td class="p-3">${htmlEstado}</td>
            <td class="p-3">${htmlAccion}</td>
        </tr>`;

        esCanalWeb = !esCanalWeb; 
        minutosBucle += duracionActual;
    }
    tbody.innerHTML = html;
}

let horaSeleccionadaRecepcion = '';
function abrirModalDarTurno(hora) {
    horaSeleccionadaRecepcion = hora;
    document.getElementById('modal-hora-turno').innerText = hora;
    document.getElementById('auto-dni').value = ''; 
    document.getElementById('auto-nombre').value = ''; 
    document.getElementById('auto-celular').value = ''; 
    document.getElementById('auto-email').value = ''; 
    abrirModal('modal-dar-turno');
}

async function confirmarTurnoRecepcionFirebase() {
    const dni = document.getElementById('auto-dni').value.trim();
    const nombre = document.getElementById('auto-nombre').value.trim();
    const celular = document.getElementById('auto-celular').value.trim();
    const email = document.getElementById('auto-email').value.trim();

    if (!nombre || !celular) { mostrarAlerta("Datos Obligatorios", "Nombre y celular son obligatorios."); return; }

    try {
        await addDoc(collection(window.db, "turnos"), {
            especialidad: especialidadSeleccionadaRecepcion, medico: medicoSeleccionadoRecepcion,
            fecha: fechaRecepcionSeleccionada, horario: horaSeleccionadaRecepcion,
            pacienteNombre: nombre, pacienteDni: dni, pacienteCelular: celular, pacienteEmail: email,
            estado: "Confirmado Presencial", timestamp: new Date()
        });

        cerrarModal('modal-dar-turno'); 
        mostrarExito("¡Turno Asignado!", "El turno presencial fue registrado.");
        generarAgendaRecepcion();
    } catch (error) { console.error(error); mostrarAlerta("Error", "Error al registrar el turno."); }
}

async function cancelarTurnoRecepcion(idDoc) {
    const confirmado = await pedirConfirmacion("¿Liberar Horario?", "Se cancelará el turno de la agenda.", "Sí, liberar");
    if (!confirmado) return;

    try {
        await deleteDoc(doc(window.db, "turnos", idDoc));
        mostrarExito("Turno Cancelado", "El turno fue cancelado."); 
        generarAgendaRecepcion();
    } catch (error) { console.error(error); mostrarAlerta("Error", "No se pudo cancelar."); }
}

function toggleTimeSelector() { 
    if (document.getElementById('select-alcance-ausencia').value === 'desde_hora') { 
        document.getElementById('div-hora-ausencia').classList.remove('hidden'); 
    } else { 
        document.getElementById('div-hora-ausencia').classList.add('hidden'); 
    } 
}

async function ejecutarAusenciaEmergencia() {
    if (!fechaRecepcionSeleccionada || !medicoSeleccionadoRecepcion) { mostrarAlerta("Faltan datos", "Seleccione profesional y fecha primero."); return; }
    const alcance = document.getElementById('select-alcance-ausencia').value;
    const horaDesde = document.getElementById('hora-desde-ausencia').value;
    const motivo = document.getElementById('motivo-ausencia').value || "Emergencia Médica";

    if (alcance === 'desde_hora' && !horaDesde) { mostrarAlerta("Hora Requerida", "Indique la hora a partir de la cual se suspende."); return; }

    try {
        const snap = await getDocs(query(collection(window.db, "turnos"), where("fecha", "==", fechaRecepcionSeleccionada)));

        let turnosCancelados = 0; 
        const promesas = [];

        snap.forEach((documento) => {
            const t = documento.data();
            if (t.medico === medicoSeleccionadoRecepcion && !t.estado.includes("Cancelado")) {
                let cancelar = (alcance === 'todo_dia') || (alcance === 'desde_hora' && t.horario >= horaDesde);
                if (cancelar) {
                    promesas.push(updateDoc(doc(window.db, "turnos", documento.id), { estado: "Cancelado: " + motivo }));
                    turnosCancelados++;
                }
            }
        });

        await Promise.all(promesas);
        cerrarModal('modal-ausencia-emergencia'); 
        mostrarExito("Agenda Suspendida", `Se han bloqueado ${turnosCancelados} turnos.`);
        generarAgendaRecepcion(); 
    } catch (error) { console.error(error); mostrarAlerta("Error Crítico", "Fallo durante la suspensión."); }
}

async function descargarExcelRecepcion() {
    if (!fechaRecepcionSeleccionada || !medicoSeleccionadoRecepcion) { mostrarAlerta("Visualización Requerida", "Cargue una agenda primero."); return; }
    try {
        const snap = await getDocs(query(collection(window.db, "turnos"), where("fecha", "==", fechaRecepcionSeleccionada)));
        let turnos = []; 
        snap.forEach((documento) => { if (documento.data().medico === medicoSeleccionadoRecepcion) turnos.push(documento.data()); });
        turnos.sort((a, b) => a.horario.localeCompare(b.horario));
        
        let dataExcel = turnos.map(t => ({
            "Hora": t.horario, "Paciente": t.pacienteNombre, "DNI": t.pacienteDni, "Celular": t.pacienteCelular, "Estado": t.estado, "Canal": t.estado.includes("Web") ? "Web" : "Presencial"
        }));
        let ws = XLSX.utils.json_to_sheet(dataExcel);
        let wb = XLSX.utils.book_new(); 
        XLSX.utils.book_append_sheet(wb, ws, "Agenda");
        XLSX.writeFile(wb, `Agenda_${medicoSeleccionadoRecepcion}_${fechaRecepcionSeleccionada}.xlsx`);
    } catch (error) { console.error(error); mostrarAlerta("Error", "Error al exportar planilla."); } 
}

// ==========================================
// MÉDICO
// ==========================================
let turnosMedicoHoy = [];
let pacienteActivoId = null;

async function cargarAgendaMedico() {
    const container = document.getElementById('medico-agenda-container');
    const lblPacienteActivo = document.getElementById('medico-paciente-activo');
    if(!container) return;

    const hoy = new Date().toISOString().split('T')[0];
    try {
        const snap = await getDocs(query(collection(window.db, "turnos"), where("fecha", "==", hoy)));
        turnosMedicoHoy = [];
        snap.forEach((documento) => { if (!documento.data().estado.includes("Cancelado")) turnosMedicoHoy.push({ id: documento.id, ...documento.data() }); });
        turnosMedicoHoy.sort((a, b) => a.horario.localeCompare(b.horario));

        let html = ''; 
        let primerPaciente = "Ningún paciente en espera";

        if(turnosMedicoHoy.length === 0) { 
            html = '<p class="text-sm text-gray-500 p-2">No tiene pacientes para hoy.</p>'; 
        } else {
            let contador = 0;
            turnosMedicoHoy.forEach((t) => {
                if (t.estado === "En consultorio" || (contador === 0 && t.estado !== "Atendido" && t.estado !== "Ausente")) {
                    if (!pacienteActivoId && t.estado === "En consultorio") pacienteActivoId = t.id;
                    primerPaciente = `${t.pacienteNombre} (DNI: ${t.pacienteDni})`;
                }
                if (t.estado !== "Atendido" && t.estado !== "Ausente") contador++;

                let color = "bg-yellow-200 text-yellow-800";
                if(t.estado === "En consultorio") color = "bg-green-200 text-green-800";
                if(t.estado === "Atendido") color = "bg-gray-200 text-gray-800";
                if(t.estado === "Ausente") color = "bg-red-200 text-red-800";

                let btnHtml = '';
                if (t.estado !== "Atendido" && t.estado !== "Ausente") {
                    btnHtml = `<div class="mt-3 flex gap-2"><button onclick="llamarPaciente('${t.id}')" class="flex-1 bg-teal-600 text-white text-xs font-bold py-1.5 rounded shadow">Llamar</button><button onclick="marcarAusente('${t.id}')" class="flex-1 bg-white border border-red-50 text-red-700 text-xs font-bold py-1.5 rounded shadow">Ausente</button></div>`;
                }

                html += `<div class="border-l-4 border-teal-600 bg-teal-50 p-3 rounded shadow-sm border mb-2"><div class="flex justify-between text-sm mb-1"><span class="font-bold text-teal-800">${t.horario} hs</span><span class="text-xs ${color} px-2 py-0.5 rounded font-bold">${t.estado}</span></div><p class="font-bold text-lg text-gray-800">${t.pacienteNombre}</p><p class="text-xs text-gray-600">DNI: ${t.pacienteDni} | Tel: ${t.pacienteCelular}</p>${btnHtml}</div>`;
            });
        }
        container.innerHTML = html; 
        lblPacienteActivo.innerText = primerPaciente;
    } catch (error) { console.error(error); }
}

async function llamarPaciente(id) {
    const paciente = turnosMedicoHoy.find(t => t.id === id); 
    if(!paciente) return;
    try {
        await updateDoc(doc(window.db, "turnos", id), { estado: "En consultorio" });
    } catch(e) { console.error(e); }
    pacienteActivoId = id;
    document.getElementById('medico-paciente-activo').innerText = `${paciente.pacienteNombre} (DNI: ${paciente.pacienteDni})`;
    document.getElementById('input-motivo-consulta').value = ''; 
    document.getElementById('texto-evolucion').value = '';
    cargarAgendaMedico(); 
}

async function marcarAusente(id) {
    try {
        await updateDoc(doc(window.db, "turnos", id), { estado: "Ausente" });
        if (pacienteActivoId === id) { 
            pacienteActivoId = null; 
            document.getElementById('medico-paciente-activo').innerText = "Ningún paciente seleccionado"; 
        }
        cargarAgendaMedico(); 
    } catch (error) { console.error(error); }
}

async function guardarEvolucionMedico() {
    if(!pacienteActivoId) { mostrarAlerta("Requisito", "Debe llamar a un paciente antes de guardar."); return; }
    const motivo = document.getElementById('input-motivo-consulta').value.trim();
    const evolucion = document.getElementById('texto-evolucion').value.trim();

    try {
        await updateDoc(doc(window.db, "turnos", pacienteActivoId), { estado: "Atendido", motivoConsulta: motivo, evolucionMedica: evolucion });
        mostrarExito("Guardado", "Evolución registrada correctamente.");
        pacienteActivoId = null; 
        document.getElementById('medico-paciente-activo').innerText = "Ningún paciente seleccionado";
        document.getElementById('input-motivo-consulta').value = ''; 
        document.getElementById('texto-evolucion').value = '';
        cargarAgendaMedico();
    } catch (error) { console.error(error); mostrarAlerta("Error", "No se pudo guardar la evolución."); }
}

// ==========================================
// ADMIN Y GESTIÓN DE USUARIOS (100% LIMPIO)
// ==========================================
function toggleCamposMedico() {
    const rol = document.getElementById('input-usuario-rol').value;
    const divMatricula = document.getElementById('div-usuario-matricula');
    const divEspecialidad = document.getElementById('div-usuario-especialidad');
    
    if (rol === 'Médico') {
        divMatricula.classList.remove('hidden');
        divEspecialidad.classList.remove('hidden');
    } else { 
        divMatricula.classList.add('hidden'); 
        divEspecialidad.classList.add('hidden'); 
        document.getElementById('input-usuario-matricula').value = ''; 
        document.getElementById('input-usuario-especialidad').value = 'clinica'; 
    }
}

function abrirModalUsuarioNulo() {
    document.getElementById('titulo-modal-usuario').innerText = "Registrar Nuevo Usuario";
    document.getElementById('input-usuario-id').value = "";
    document.getElementById('input-usuario-nombre').value = "";
    document.getElementById('input-usuario-rol').value = "Administrativo";
    document.getElementById('input-usuario-correo').value = "";
    document.getElementById('input-usuario-pass').value = "";
    document.getElementById('input-usuario-tel').value = "";
    document.getElementById('input-usuario-matricula').value = "";
    document.getElementById('input-usuario-especialidad').value = "clinica";
    toggleCamposMedico();
    abrirModal('modal-usuario');
}

async function cargarUsuariosAdmin() {
    const tbody = document.getElementById('admin-users-tbody');
    if(!tbody) return;
    try {
        const snap = await getDocs(collection(window.db, "usuarios"));
        let html = '';
        const arr = [];
        snap.forEach(documento => { arr.push({ id: documento.id, ...documento.data() }); });
        arr.sort((a, b) => a.nombre.localeCompare(b.nombre));

        arr.forEach(u => {
            let color = u.rol === 'Médico' ? 'text-teal-700' : (u.rol === 'Administración' ? 'text-gray-800' : 'text-indigo-700');
            const j = encodeURIComponent(JSON.stringify(u));
            html += `
            <tr class="border-b hover:bg-gray-50 bg-white">
                <td class="p-3">
                    <p class="font-bold text-gray-800">${u.nombre}</p>
                    <p class="text-xs text-gray-500">${u.tel || 'Sin teléfono'}</p>
                </td>
                <td class="p-3 font-bold ${color}">${u.rol} ${u.matricula ? `<span class="text-xs text-gray-400 block font-normal">MP: ${u.matricula} (${u.especialidad})</span>` : ''}</td>
                <td class="p-3 font-mono text-sm text-gray-600">
                    <div><b>${u.correo}</b></div>
                    <div class="text-xs text-gray-500">Clave: <span class="bg-gray-100 px-1 rounded border font-mono text-gray-800">${u.password || '******'}</span></div>
                </td>
                <td class="p-3 text-center">
                    <button onclick="editarUsuarioAdmin('${j}')" class="bg-gray-100 text-gray-700 border border-gray-300 px-3 py-1 rounded hover:bg-gray-200 font-bold text-xs transition">Editar</button> 
                    <button onclick="eliminarUsuarioAdmin('${u.id}')" class="text-red-600 hover:text-red-800 font-bold text-xs ml-2 transition">Borrar</button>
                </td>
            </tr>`;
        });
        tbody.innerHTML = html || '<tr><td colspan="4" class="p-4 text-center text-gray-500">No hay usuarios cargados. Usa "+ Nuevo Usuario" para comenzar.</td></tr>';
    } catch (error) { tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-red-500">Error al conectar con Firestore.</td></tr>'; }
}

function editarUsuarioAdmin(userJSONEncoded) {
    const u = JSON.parse(decodeURIComponent(userJSONEncoded));
    document.getElementById('titulo-modal-usuario').innerText = "Actualizar Datos de Usuario";
    document.getElementById('input-usuario-id').value = u.id;
    document.getElementById('input-usuario-nombre').value = u.nombre || '';
    document.getElementById('input-usuario-rol').value = u.rol || 'Administrativo';
    document.getElementById('input-usuario-correo').value = u.correo || '';
    document.getElementById('input-usuario-pass').value = u.password || '';
    document.getElementById('input-usuario-tel').value = u.tel || '';
    document.getElementById('input-usuario-matricula').value = u.matricula || '';
    document.getElementById('input-usuario-especialidad').value = u.especialidad || 'clinica';
    toggleCamposMedico();
    abrirModal('modal-usuario');
}

async function guardarUsuarioAdminFirebase() {
    const id = document.getElementById('input-usuario-id').value;
    const nom = document.getElementById('input-usuario-nombre').value.trim();
    const rol = document.getElementById('input-usuario-rol').value;
    const pass = document.getElementById('input-usuario-pass').value.trim();
    const tel = document.getElementById('input-usuario-tel').value.trim();
    const cor = document.getElementById('input-usuario-correo').value.trim();
    const mat = document.getElementById('input-usuario-matricula').value.trim();
    const esp = document.getElementById('input-usuario-especialidad').value;

    if (!nom || !pass || !cor) { 
        mostrarAlerta("Datos Faltantes", "Nombre, Contraseña y Correo Electrónico son obligatorios."); 
        return; 
    }

    const payload = { 
        nombre: nom, 
        rol: rol, 
        password: pass, 
        correo: cor, 
        tel: tel,
        matricula: rol === 'Médico' ? mat : '', 
        especialidad: rol === 'Médico' ? esp : '', 
        timestamp: new Date() 
    };

    try {
        if (id) {
            await updateDoc(doc(window.db, "usuarios", id), payload); 
            mostrarExito("Actualizado", "Los datos se guardaron correctamente en el perfil.");
        } else {
            // Alta en Firebase Authentication (Seguridad Google)
            try {
                await createUserWithEmailAndPassword(window.auth, cor, pass);
            } catch (authError) {
                console.warn("Aviso Auth:", authError.message);
                // Si falla (ej. correo ya existe), igual lo creamos en el panel visual
            }

            // Alta en Firestore (Tabla administrativa)
            await addDoc(collection(window.db, "usuarios"), payload); 
            mostrarExito("Sincronizado", "Usuario creado en el sistema exitosamente.");
        }
        
        cerrarModal('modal-usuario'); 
        cargarUsuariosAdmin(); 
        cargarEspecialistasFirebase();
        
    } catch (error) { 
        console.error(error); 
        mostrarAlerta("Error", "Fallo al comunicar con la base de datos."); 
    }
}

async function eliminarUsuarioAdmin(id) {
    const confirmado = await pedirConfirmacion("¿Eliminar Usuario?", "Esta acción quitará el perfil de la tabla administrativa. Para revocar el acceso total, también bórrelo desde la consola de Firebase Authentication.", "Sí, eliminar");
    if (!confirmado) return;

    try {
        await deleteDoc(doc(window.db, "usuarios", id));
        cargarUsuariosAdmin(); cargarEspecialistasFirebase();
    } catch (error) { console.error(error); mostrarAlerta("Error", "Error al intentar eliminar."); }
}

function cambiarTabAdmin(tabId) {
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.admin-section').forEach(s => s.classList.add('hidden'));
    document.getElementById('tab-' + tabId).classList.add('active');
    document.getElementById('admin-sec-' + tabId).classList.remove('hidden');
    if(tabId === 'metricas') cargarMetricas('todos');
}

function iniciarGuardadoModulacion() {
    document.getElementById('input-seguridad-admin').value = '';
    abrirModal('modal-seguridad-modulacion');
}

async function ejecutarGuardadoModulacion() {
    const alcance = document.getElementById('admin-select-alcance').value;
    const nuevaDuracion = document.getElementById('admin-select-duracion').value;
    
    try {
        if (alcance === 'global') {
            await setDoc(doc(window.db, "configuracion", "general"), { duracionBase: parseInt(nuevaDuracion) });
            duracionTurnoGlobal = parseInt(nuevaDuracion); 
            mostrarExito("Modulación Global", `Agenda ajustada a ${nuevaDuracion} minutos.`);
        } else {
            await setDoc(doc(window.db, "modulacion_medicos", alcance), { duracionBase: parseInt(nuevaDuracion) });
            modulacionPorMedico[alcance] = parseInt(nuevaDuracion); 
            mostrarExito("Modulación Individual", `Agenda ajustada a ${nuevaDuracion} minutos.`);
        }
        cerrarModal('modal-seguridad-modulacion');
    } catch(e) { mostrarAlerta("Error", "No se pudo guardar la configuración."); }
}

async function cargarMetricas(segmento) {
    const tbody = document.getElementById('metricas-tbody');
    const kpiContainer = document.getElementById('metricas-kpi-container');
    tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-gray-500">Procesando registros...</td></tr>';
    
    try {
        const turnosSnap = await getDocs(collection(window.db, "turnos"));
        const usuariosSnap = await getDocs(collection(window.db, "usuarios"));
        
        let todosLosTurnos = [];
        turnosSnap.forEach(t => todosLosTurnos.push(t.data()));
        let datosAgrupados = {};
        
        usuariosSnap.forEach(documento => {
            const u = documento.data();
            datosAgrupados[u.nombre] = { nombre: u.nombre, rol: u.rol, totalTurnos: 0, atendidos: 0 };
        });
        
        todosLosTurnos.forEach(t => {
            if (datosAgrupados[t.medico]) {
                datosAgrupados[t.medico].totalTurnos++;
                if(t.estado === "Atendido") datosAgrupados[t.medico].atendidos++;
            }
        });

        kpiContainer.innerHTML = `<div class="bg-blue-50 border border-blue-200 p-4 rounded text-center col-span-4"><p class="text-xs text-blue-600 font-bold uppercase">Total Citas Registradas</p><p class="text-3xl font-bold text-blue-900">${todosLosTurnos.length}</p></div>`;

        let htmlTabla = ''; 
        datosMetricasCache = Object.values(datosAgrupados); 
        
        datosMetricasCache.forEach(d => {
            let efectividad = d.totalTurnos > 0 ? Math.round((d.atendidos / d.totalTurnos) * 100) : 0;
            htmlTabla += `<tr class="border-b hover:bg-gray-50"><td class="p-3 font-bold text-gray-800">${d.nombre}</td><td class="p-3 text-xs text-gray-500 uppercase font-bold">${d.rol}</td><td class="p-3 font-mono font-bold">${d.totalTurnos}</td><td class="p-3 text-sm">${d.atendidos} (${efectividad}%)</td><td class="p-3 text-center">-</td></tr>`;
        });
        
        tbody.innerHTML = htmlTabla || '<tr><td colspan="5" class="p-4 text-center text-gray-500">No hay datos suficientes.</td></tr>';
    } catch(e) { console.error(e); }
}

function toggleHistorial() { document.getElementById('historial-paciente').classList.toggle('abierto'); }

function mostrarExito(titulo, mensaje) {
    document.getElementById('exito-titulo').innerText = titulo;
    document.getElementById('exito-mensaje').innerText = mensaje;
    abrirModal('modal-exito');
}

function mostrarAlerta(titulo, mensaje) {
    document.getElementById('alerta-titulo').innerText = titulo;
    document.getElementById('alerta-mensaje').innerText = mensaje;
    abrirModal('modal-alerta');
}

function pedirConfirmacion(titulo, mensaje, textoAceptar = "Aceptar") {
    return new Promise((resolve) => {
        document.getElementById('confirm-titulo').innerText = titulo;
        document.getElementById('confirm-mensaje').innerText = mensaje;
        document.getElementById('btn-confirm-aceptar').innerText = textoAceptar;
        abrirModal('modal-confirmacion');

        document.getElementById('btn-confirm-aceptar').onclick = () => {
            cerrarModal('modal-confirmacion');
            resolve(true);
        };

        document.getElementById('btn-confirm-cancelar').onclick = () => {
            cerrarModal('modal-confirmacion');
            resolve(false);
        };
    });
}

// ==========================================
// EXPORTACIÓN AL SCOPE GLOBAL
// ==========================================
window.switchView = switchView;
window.iniciarSesionReal = iniciarSesionReal;
window.cerrarSesionReal = cerrarSesionReal;
window.loginAs = loginAs;
window.abrirModal = abrirModal;
window.cerrarModal = cerrarModal;
window.actualizarMedicosPublico = actualizarMedicosPublico;
window.validarDiaHabil = validarDiaHabil;
window.generarHorariosPublicos = generarHorariosPublicos;
window.seleccionarHorario = seleccionarHorario;
window.confirmarTurnoFirebase = confirmarTurnoFirebase;
window.buscarTurnosPaciente = buscarTurnosPaciente;
window.cancelarTurnoFirebase = cancelarTurnoFirebase;
window.actualizarMedicosRecepcion = actualizarMedicosRecepcion;
window.buscarAgendaRecepcion = buscarAgendaRecepcion;
window.generarAgendaRecepcion = generarAgendaRecepcion;
window.abrirModalDarTurno = abrirModalDarTurno;
window.confirmarTurnoRecepcionFirebase = confirmarTurnoRecepcionFirebase;
window.cancelarTurnoRecepcion = cancelarTurnoRecepcion;
window.ejecutarAusenciaEmergencia = ejecutarAusenciaEmergencia;
window.descargarExcelRecepcion = descargarExcelRecepcion;
window.cargarAgendaMedico = cargarAgendaMedico;
window.llamarPaciente = llamarPaciente;
window.marcarAusente = marcarAusente;
window.guardarEvolucionMedico = guardarEvolucionMedico;
window.toggleCamposMedico = toggleCamposMedico;
window.abrirModalUsuarioNulo = abrirModalUsuarioNulo;
window.cargarUsuariosAdmin = cargarUsuariosAdmin;
window.editarUsuarioAdmin = editarUsuarioAdmin;
window.guardarUsuarioAdminFirebase = guardarUsuarioAdminFirebase;
window.eliminarUsuarioAdmin = eliminarUsuarioAdmin;
window.cambiarTabAdmin = cambiarTabAdmin;
window.iniciarGuardadoModulacion = iniciarGuardadoModulacion;
window.ejecutarGuardadoModulacion = ejecutarGuardadoModulacion;
window.cargarMetricas = cargarMetricas;
window.toggleHistorial = toggleHistorial;
window.forzarReseedDB = forzarReseedDB;

// ==========================================
// ARRANQUE
// ==========================================
iniciarCargaDeDatos();
