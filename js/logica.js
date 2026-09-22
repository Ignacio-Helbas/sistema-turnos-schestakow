// ==========================================
// IMPORTACIONES DE FIREBASE Y AUTH
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

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

const medicosPorDefecto = [
    { nombre: 'Dr. Roberto Gómez', especialidad: 'clinica', username: 'rgomez', password: '123' },
    { nombre: 'Dra. Silvia Fernández', especialidad: 'clinica', username: 'sfernandez', password: '123' },
    { nombre: 'Dr. Juan Pérez', especialidad: 'cardiologia', username: 'jperez', password: '123' },
    { nombre: 'Dra. Laura Martínez', especialidad: 'cardiologia', username: 'lmartinez', password: '123' },
    { nombre: 'Dra. Ana Gómez', especialidad: 'pediatria', username: 'agomez', password: '123' },
    { nombre: 'Dr. Martín Silva', especialidad: 'pediatria', username: 'msilva', password: '123' },
    { nombre: 'Dra. Florencia Castro', especialidad: 'dermatologia', username: 'fcastro', password: '123' },
    { nombre: 'Dra. Valeria Román', especialidad: 'endocrinologia', username: 'vroman', password: '123' },
    { nombre: 'Dr. Diego Torres', especialidad: 'gastroenterologia', username: 'dtorres', password: '123' },
    { nombre: 'Dra. Mariana Vega', especialidad: 'infectologia', username: 'mvega', password: '123' },
    { nombre: 'Dr. Pablo Herrera', especialidad: 'neurologia', username: 'pherrera', password: '123' },
    { nombre: 'Dra. Claudia Ortiz', especialidad: 'nefrologia', username: 'cortiz', password: '123' },
    { nombre: 'Dr. Jorge Medina', especialidad: 'neumonologia', username: 'jmedina', password: '123' },
    { nombre: 'Dra. Susana Paz', especialidad: 'geriatria', username: 'spaz', password: '123' },
    { nombre: 'Dr. Ricardo Luna', especialidad: 'psiquiatria', username: 'rluna', password: '123' },
    { nombre: 'Dr. Guillermo Acosta', especialidad: 'cirugia_general', username: 'gacosta', password: '123' },
    { nombre: 'Dra. Sofía Ríos', especialidad: 'cirugia_general', username: 'srios', password: '123' },
    { nombre: 'Dr. Héctor Farias', especialidad: 'cirugia_cardiovascular', username: 'hfarias', password: '123' },
    { nombre: 'Dra. Carolina Gil', especialidad: 'cirugia_plastica', username: 'cgil', password: '123' },
    { nombre: 'Dr. Alejandro Vera', especialidad: 'traumatologia', username: 'avera', password: '123' },
    { nombre: 'Dr. Tomás Cruz', especialidad: 'traumatologia', username: 'tcruz', password: '123' },
    { nombre: 'Dr. Fernando Sosa', especialidad: 'urologia', username: 'fsosa', password: '123' },
    { nombre: 'Dra. Beatriz Mora', especialidad: 'neurocirugia', username: 'bmora', password: '123' },
    { nombre: 'Dr. Andrés Pino', especialidad: 'otorrinolaringologia', username: 'apino', password: '123' },
    { nombre: 'Dra. Natalia Rey', especialidad: 'oftalmologia', username: 'nrey', password: '123' },
    { nombre: 'Dra. Mónica López', especialidad: 'ginecologia', username: 'mlopez', password: '123' },
    { nombre: 'Dr. Carlos Imagen', especialidad: 'diagnostico_imagenes', username: 'cimagen', password: '123' },
    { nombre: 'Dra. Elena Lab', especialidad: 'anatomia_patologica', username: 'elab', password: '123' },
    { nombre: 'Dr. Luis Sangre', especialidad: 'laboratorio', username: 'lsangre', password: '123' },
    { nombre: 'Dra. UTI Jefe', especialidad: 'terapia_intensiva', username: 'ujefe', password: '123' },
    { nombre: 'Lic. Marcos Peña', especialidad: 'rehabilitacion', username: 'mpena', password: '123' }
];

// ==========================================
// INICIALIZACIÓN
// ==========================================
function establecerLimitesFecha() {
    const hoy = new Date();
    const fechaMinima = hoy.toISOString().split('T')[0];
    if(document.getElementById('input-fecha-paciente')) document.getElementById('input-fecha-paciente').min = fechaMinima;
    if(document.getElementById('input-fecha-recepcion')) document.getElementById('input-fecha-recepcion').min = fechaMinima;
    if(document.getElementById('input-fecha-proxima-visita')) document.getElementById('input-fecha-proxima-visita').min = fechaMinima;
}

async function forzarReseedDB() {
    const confirmado = await pedirConfirmacion("⚠️ RESET DB", "Esto borrará TODOS los usuarios actuales y cargará la nueva lista por defecto en Firebase. ¿Continuar?", "Sí, formatear");
    if (!confirmado) return;
    
    try {
        const { collection, getDocs, deleteDoc, doc, addDoc } = await import("https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js");
        const snap = await getDocs(collection(window.db, "usuarios"));
        
        const deletePromises = [];
        snap.forEach(d => deletePromises.push(deleteDoc(doc(window.db, "usuarios", d.id))));
        await Promise.all(deletePromises);

        const promesas = medicosPorDefecto.map(medico => {
            return addDoc(collection(window.db, "usuarios"), {
                nombre: medico.nombre, rol: "Médico", username: medico.username, password: medico.password,
                tel: "2604000000", correo: medico.username + "@hospital.gov.ar", matricula: Math.floor(Math.random() * 10000) + 1000,
                especialidad: medico.especialidad, timestamp: new Date()
            });
        });
        promesas.push(addDoc(collection(window.db, "usuarios"), { nombre: "Admin Sistema", rol: "Administración", username: "admin", password: "123", tel: "", correo: "admin@hospital.gov.ar", matricula: "", especialidad: "", timestamp: new Date() }));
        promesas.push(addDoc(collection(window.db, "usuarios"), { nombre: "Recepción Turnos", rol: "Administrativo", username: "recepcion", password: "123", tel: "", correo: "recepcion@hospital.gov.ar", matricula: "", especialidad: "", timestamp: new Date() }));
        
        await Promise.all(promesas);
        mostrarExito("Base de Datos Reiniciada", "Se han cargado todos los especialistas por defecto.");
        setTimeout(() => window.location.reload(), 2000);
    } catch (e) { console.error(e); mostrarAlerta("Error", "Error al reiniciar BD."); }
}

async function verificarYCargarMedicosPorDefecto() {
    try {
        const { collection, getDocs, addDoc } = await import("https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js");
        const snap = await getDocs(collection(window.db, "usuarios"));
        if (snap.empty) {
            const promesas = medicosPorDefecto.map(medico => {
                return addDoc(collection(window.db, "usuarios"), {
                    nombre: medico.nombre, rol: "Médico", username: medico.username, password: medico.password,
                    tel: "2604000000", correo: medico.username + "@hospital.gov.ar", matricula: Math.floor(Math.random() * 10000) + 1000,
                    especialidad: medico.especialidad, timestamp: new Date()
                });
            });
            promesas.push(addDoc(collection(window.db, "usuarios"), { nombre: "Admin Sistema", rol: "Administración", username: "admin", password: "123", tel: "", correo: "admin@hospital.gov.ar", matricula: "", especialidad: "", timestamp: new Date() }));
            promesas.push(addDoc(collection(window.db, "usuarios"), { nombre: "Recepción Turnos", rol: "Administrativo", username: "recepcion", password: "123", tel: "", correo: "recepcion@hospital.gov.ar", matricula: "", especialidad: "", timestamp: new Date() }));
            await Promise.all(promesas); await cargarEspecialistasFirebase();
        } else { 
            await cargarEspecialistasFirebase(); 
        }
    } catch (error) { console.error(error); }
}

async function cargarEspecialistasFirebase() {
    try {
        const { collection, query, where, getDocs } = await import("https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js");
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
        const { collection, getDocs, doc, getDoc } = await import("https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js");
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
        snapIndividual.forEach(doc => { modulacionPorMedico[doc.id] = doc.data().duracionBase; });
    } catch(e) { console.log("Configuración por defecto."); }
}

async function iniciarCargaDeDatos() {
    establecerLimitesFecha(); 
    await verificarYCargarMedicosPorDefecto(); 
    await cargarConfiguracionModulacion();
    
    if (document.getElementById('view-admin').classList.contains('active')) cargarUsuariosAdmin();
    if (document.getElementById('view-public').classList.contains('active')) actualizarMedicosPublico();
    if (document.getElementById('view-reception').classList.contains('active')) actualizarMedicosRecepcion();
}

// ==========================================
// SESIÓN Y NAVEGACIÓN (CON FIREBASE AUTH)
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
    const inputUsuario = document.getElementById('login-user').value.trim();
    const pass = document.getElementById('login-pass').value.trim();
    
    if (!inputUsuario || !pass) { 
        mostrarAlerta("Datos Faltantes", "Ingrese usuario y contraseña."); 
        return; 
    }
    
    try {
        let correoReal = "";

        if (inputUsuario.includes("@")) {
            correoReal = inputUsuario;
        } else {
            const { collection, query, where, getDocs } = await import("https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js");
            const snap = await getDocs(query(collection(window.db, "usuarios"), where("username", "==", inputUsuario)));
            
            if (!snap.empty) {
                snap.forEach((doc) => {
                    correoReal = doc.data().correo;
                });
            } else {
                if (inputUsuario === "admin") correoReal = "admin@hospital.gov.ar";
                else if (inputUsuario === "recepcion") correoReal = "recepcion@hospital.gov.ar";
                else {
                    mostrarAlerta("Error de Acceso", "El nombre de usuario no existe.");
                    return;
                }
            }
        }

        // Autenticación segura mediante Firebase Auth
        await signInWithEmailAndPassword(window.auth, correoReal, pass);
        
        const { collection, query, where, getDocs } = await import("https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js");
        const snapUser = await getDocs(query(collection(window.db, "usuarios"), where("correo", "==", correoReal)));
        
        let datosUser = { nombre: inputUsuario, rol: "Médico" };
        if (!snapUser.empty) {
            snapUser.forEach((doc) => { datosUser = doc.data(); });
        } else if (correoReal.includes("admin")) {
            datosUser = { nombre: "Administrador General", rol: "Administración" };
        } else if (correoReal.includes("recepcion")) {
            datosUser = { nombre: "Personal de Admisión", rol: "Administrativo" };
        }

        localStorage.setItem("sesionHospitalActiva", JSON.stringify(datosUser));
        
        document.getElementById('login-user').value = ''; 
        document.getElementById('login-pass').value = '';
        
        if (datosUser.rol === "Médico") switchView("doctor");
        else if (datosUser.rol === "Administrativo" || datosUser.rol === "Recepción") switchView("reception");
        else if (datosUser.rol === "Administración") switchView("admin");

    } catch (error) {
        console.error("Error de autenticación:", error);
        mostrarAlerta("Acceso Denegado", "Usuario o contraseña incorrectos.");
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
    container.innerHTML = '<div class="col-span-3 flex justify-center py-4"><svg class="animate-spin h-6 w-6 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg><p class="text-sm text-blue-600 font-bold ml-2">Consultando disponibilidad...</p></div>';

    let turnosOcupados = {};
    try {
        const { collection, query, where, getDocs } = await import("https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js");
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
    if (!/^[0-9]{7,8}$/.test(dni)) { mostrarAlerta("DNI Inválido", "Por favor, ingrese un número de DNI válido (entre 7 y 8 dígitos sin puntos)."); return; }

    const btnConfirmar = document.getElementById('btn-confirmar-turno');
    const textoOriginal = btnConfirmar ? btnConfirmar.innerHTML : 'Confirmar Turno';
    if (btnConfirmar) {
        btnConfirmar.disabled = true;
        btnConfirmar.innerHTML = `<svg class="animate-spin -ml-1 mr-3 h-5 w-5 text-white inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> Procesando...`;
        btnConfirmar.classList.add("opacity-75", "cursor-not-allowed");
    }

    try {
        const { collection, addDoc } = await import("https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js");
        await addDoc(collection(window.db, "turnos"), {
            especialidad: esp, medico: med, fecha: fec, horario: hor, pacienteNombre: nom, pacienteDni: dni, pacienteCelular: cel, pacienteEmail: email, estado: "Reservado Web", timestamp: new Date()
        });
        
        enviarCorreoNotificacion(EMAILJS_TEMPLATE_CONFIRMACION, {
            nombre_paciente: nom, medico: med, especialidad: esp, fecha: fec, hora: hor, email_destino: email
        });
        
        mostrarExito("¡Turno Confirmado!", "El turno ha sido guardado exitosamente. Hemos enviado un correo electrónico con los detalles.");
        
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
    } finally {
        if (btnConfirmar) {
            btnConfirmar.disabled = false;
            btnConfirmar.innerHTML = textoOriginal;
            btnConfirmar.classList.remove("opacity-75", "cursor-not-allowed");
        }
    }
}

async function buscarTurnosPaciente() {
    const dni = document.getElementById('input-buscar-dni').value.trim();
    const res = document.getElementById('resultado-turnos-paciente');
    
    if (!dni) { mostrarAlerta("Dato Faltante", "Por favor ingrese su número de DNI para realizar la búsqueda."); return; }

    try {
        const { collection, query, where, getDocs } = await import("https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js");
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
        const { doc, getDoc, deleteDoc } = await import("https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js");
        
        const docSnap = await getDoc(doc(window.db, "turnos", id));
        if (docSnap.exists()) {
            const t = docSnap.data();
            enviarCorreoNotificacion(EMAILJS_TEMPLATE_CANCELACION, {
                nombre_paciente: t.pacienteNombre, medico: t.medico, especialidad: t.especialidad, fecha: t.fecha, hora: t.horario, email_destino: t.pacienteEmail
            });
        }

        await deleteDoc(doc(window.db, "turnos", id));
        mostrarExito("Turno Cancelado", "Su turno ha sido cancelado. Hemos enviado una notificación por correo.");
        buscarTurnosPaciente(); 
    } catch (error) { console.error(error); mostrarAlerta("Error", "No se pudo cancelar el turno en este momento."); }
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
        const { collection, query, where, getDocs } = await import("https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js");
        const snap = await getDocs(query(collection(window.db, "turnos"), where("fecha", "==", fechaRecepcionSeleccionada)));
        snap.forEach((doc) => {
            const data = doc.data();
            if (data.medico === medicoSeleccionadoRecepcion) {
                turnosOcupados[data.horario] = { id: doc.id, ...data };
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
    document.getElementById('auto-msg').classList.add('hidden');
    abrirModal('modal-dar-turno');
}

async function confirmarTurnoRecepcionFirebase() {
    const dni = document.getElementById('auto-dni').value.trim();
    const nombre = document.getElementById('auto-nombre').value.trim();
    const celular = document.getElementById('auto-celular').value.trim();
    const email = document.getElementById('auto-email').value.trim();

    if (!/^[0-9]{7,8}$/.test(dni)) { mostrarAlerta("DNI Inválido", "Ingrese un documento válido."); return; }
    if (!nombre || !celular) { mostrarAlerta("Datos Obligatorios", "Nombre y celular son obligatorios."); return; }

    try {
        const { collection, addDoc } = await import("https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js");
        await addDoc(collection(window.db, "turnos"), {
            especialidad: especialidadSeleccionadaRecepcion, medico: medicoSeleccionadoRecepcion,
            fecha: fechaRecepcionSeleccionada, horario: horaSeleccionadaRecepcion,
            pacienteNombre: nombre, pacienteDni: dni, pacienteCelular: celular, pacienteEmail: email,
            estado: "Confirmado Presencial", timestamp: new Date()
        });
        
        enviarCorreoNotificacion(EMAILJS_TEMPLATE_CONFIRMACION, {
            nombre_paciente: nombre, medico: medicoSeleccionadoRecepcion, especialidad: especialidadSeleccionadaRecepcion, fecha: fechaRecepcionSeleccionada, hora: horaSeleccionadaRecepcion, email_destino: email
        });

        cerrarModal('modal-dar-turno'); 
        mostrarExito("¡Turno Asignado!", "El turno presencial fue registrado y el paciente ha sido notificado por correo.");
        generarAgendaRecepcion();
    } catch (error) { console.error(error); mostrarAlerta("Error", "Error al registrar el turno."); }
}

async function cancelarTurnoRecepcion(idDoc) {
    const confirmado = await pedirConfirmacion("¿Liberar Horario?", "Se cancelará el turno de la agenda y el horario volverá a estar disponible.", "Sí, liberar");
    if (!confirmado) return;

    try {
        const { doc, getDoc, deleteDoc } = await import("https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js");
        
        const docSnap = await getDoc(doc(window.db, "turnos", idDoc));
        if (docSnap.exists()) {
            const t = docSnap.data();
            enviarCorreoNotificacion(EMAILJS_TEMPLATE_CANCELACION, {
                nombre_paciente: t.pacienteNombre, medico: t.medico, especialidad: t.especialidad, fecha: t.fecha, hora: t.horario, email_destino: t.pacienteEmail
            });
        }

        await deleteDoc(doc(window.db, "turnos", idDoc));
        mostrarExito("Turno Cancelado", "El turno fue cancelado y se notificó al paciente."); 
        generarAgendaRecepcion();
    } catch (error) { console.error(error); mostrarAlerta("Error", "No se pudo cancelar."); }
}

async function ejecutarAusenciaEmergencia() {
    if (!fechaRecepcionSeleccionada || !medicoSeleccionadoRecepcion) { mostrarAlerta("Faltan datos", "Seleccione profesional y fecha primero."); return; }
    const alcance = document.getElementById('select-alcance-ausencia').value;
    const horaDesde = document.getElementById('hora-desde-ausencia').value;
    const motivo = document.getElementById('motivo-ausencia').value || "Emergencia Médica";

    if (alcance === 'desde_hora' && !horaDesde) { mostrarAlerta("Hora Requerida", "Indique la hora a partir de la cual se suspende la atención."); return; }

    try {
        const { collection, query, where, getDocs, doc, updateDoc } = await import("https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js");
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
                    
                    enviarCorreoNotificacion(EMAILJS_TEMPLATE_CANCELACION, {
                        nombre_paciente: t.pacienteNombre, medico: t.medico, especialidad: t.especialidad, fecha: t.fecha, hora: t.horario, email_destino: t.pacienteEmail
                    });
                }
            }
        });

        await Promise.all(promesas);
        cerrarModal('modal-ausencia-emergencia'); 
        mostrarExito("Agenda Suspendida", `Se han bloqueado y notificado por correo a los pacientes de ${turnosCancelados} turnos afectados.`);
        generarAgendaRecepcion(); 
    } catch (error) { console.error(error); mostrarAlerta("Error Crítico", "Fallo durante la cancelación masiva."); }
}

async function descargarExcelRecepcion() {
    if (!fechaRecepcionSeleccionada || !medicoSeleccionadoRecepcion) { mostrarAlerta("Visualización Requerida", "Cargue una agenda primero para exportarla."); return; }
    try {
        const { collection, query, where, getDocs } = await import("https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js");
        const snap = await getDocs(query(collection(window.db, "turnos"), where("fecha", "==", fechaRecepcionSeleccionada)));
        let turnos = []; 
        snap.forEach((doc) => { if (doc.data().medico === medicoSeleccionadoRecepcion) turnos.push(doc.data()); });
        turnos.sort((a, b) => a.horario.localeCompare(b.horario));
        
        let dataExcel = turnos.map(t => ({
            "Hora": t.horario, "Paciente": t.pacienteNombre, "DNI": t.pacienteDni, "Celular": t.pacienteCelular, "Estado": t.estado, "Canal": t.estado.includes("Web") ? "Web" : "Presencial"
        }));
        let ws = XLSX.utils.json_to_sheet(dataExcel);
        let wb = XLSX.utils.book_new(); 
        XLSX.utils.book_append_sheet(wb, ws, "Agenda");
        XLSX.writeFile(wb, `Agenda_${medicoSeleccionadoRecepcion}_${fechaRecepcionSeleccionada}.xlsx`);
    } catch (error) { console.error(error); mostrarAlerta("Error", "Error al intentar exportar el documento."); } 
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

    const sesionStr = localStorage.getItem("sesionHospitalActiva");
    let nombreFiltro = "";
    if (sesionStr) {
        const sesion = JSON.parse(sesionStr);
        if (sesion.rol === "Médico") {
            nombreFiltro = sesion.nombre;
            const tituloContenedor = document.getElementById("titulo-medico-dashboard-container");
            const tituloTexto = document.getElementById("titulo-medico-dashboard");
            if(tituloContenedor && tituloTexto) { 
                tituloTexto.innerText = `Agenda de Hoy: ${nombreFiltro}`; 
                tituloContenedor.classList.remove('hidden'); 
            }
        }
    }

    const hoy = new Date().toISOString().split('T')[0];
    try {
        const { collection, query, where, getDocs } = await import("https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js");
        let q = nombreFiltro ? query(collection(window.db, "turnos"), where("fecha", "==", hoy), where("medico", "==", nombreFiltro)) : query(collection(window.db, "turnos"), where("fecha", "==", hoy));
        const snap = await getDocs(q);
        turnosMedicoHoy = [];
        snap.forEach((doc) => { if (!doc.data().estado.includes("Cancelado")) turnosMedicoHoy.push({ id: doc.id, ...doc.data() }); });
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
                    btnHtml = `<div class="mt-3 flex gap-2"><button onclick="llamarPaciente('${t.id}')" class="flex-1 bg-teal-600 text-white text-xs font-bold py-1.5 rounded shadow">Llamar</button><button onclick="marcarAusente('${t.id}')" class="flex-1 bg-white border border-red-500 text-red-700 text-xs font-bold py-1.5 rounded shadow">Ausente</button></div>`;
                }

                const opacidad = (t.estado === 'Atendido' || t.estado === 'Ausente') ? 'opacity-60' : 'opacity-100';
                const borde = t.estado === 'En consultorio' ? 'border-green-600 bg-green-50' : 'border-teal-600 bg-teal-50';

                html += `<div class="border-l-4 ${borde} p-3 rounded shadow-sm border ${opacidad}"><div class="flex justify-between text-sm mb-1"><span class="font-bold text-teal-800">${t.horario} hs</span><span class="text-xs ${color} px-2 py-0.5 rounded font-bold">${t.estado}</span></div><p class="font-bold text-lg text-gray-800">${t.pacienteNombre}</p><p class="text-xs text-gray-600">DNI: ${t.pacienteDni} | Tel: ${t.pacienteCelular}</p>${btnHtml}</div>`;
            });
            if(contador === 0) html += '<p class="text-sm text-gray-500 p-2 mt-4 border-t pt-2">No hay más pacientes en espera.</p>';
        }
        container.innerHTML = html; 
        lblPacienteActivo.innerText = primerPaciente;
    } catch (error) { console.error(error); }
}

async function llamarPaciente(id) {
    const paciente = turnosMedicoHoy.find(t => t.id === id); 
    if(!paciente) return;
    try {
        const { doc, updateDoc } = await import("https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js");
        await updateDoc(doc(window.db, "turnos", id), { estado: "En consultorio" });
    } catch(e) { console.error(e); }
    pacienteActivoId = id;
    document.getElementById('medico-paciente-activo').innerText = `${paciente.pacienteNombre} (DNI: ${paciente.pacienteDni})`;
    document.getElementById('input-motivo-consulta').value = ''; 
    document.getElementById('texto-evolucion').value = '';
    cargarAgendaMedico(); 
}

async function marcarAusente(id) {
    const confirmado = await pedirConfirmacion("¿Marcar Ausente?", "El paciente perderá este turno y se registrará su ausencia en el sistema.", "Sí, marcar ausente");
    if (!confirmado) return;

    try {
        const { doc, updateDoc } = await import("https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js");
        await updateDoc(doc(window.db, "turnos", id), { estado: "Ausente" });
        if (pacienteActivoId === id) { 
            pacienteActivoId = null; 
            document.getElementById('medico-paciente-activo').innerText = "Ningún paciente seleccionado"; 
        }
        await cargarAgendaMedico(); 
        const sig = turnosMedicoHoy.find(t => t.estado.includes("Reservado") || t.estado.includes("Confirmado"));
        if (sig) { 
            mostrarExito("Paciente Ausente", `Llamando automáticamente al siguiente paciente: ${sig.pacienteNombre}`); 
            llamarPaciente(sig.id); 
        } else {
            mostrarExito("Paciente Ausente", "Se ha registrado la ausencia. No hay más pacientes en espera.");
        }
    } catch (error) { console.error(error); }
}

async function guardarEvolucionMedico() {
    if(!pacienteActivoId) { mostrarAlerta("Requisito previo", "Debe llamar a un paciente antes de guardar una evolución."); return; }
    const motivo = document.getElementById('input-motivo-consulta').value.trim();
    const evolucion = document.getElementById('texto-evolucion').value.trim();
    if(!evolucion) { mostrarAlerta("Campo vacío", "El campo de Evolución Médica no puede estar vacío."); return; }

    try {
        const { doc, updateDoc } = await import("https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js");
        await updateDoc(doc(window.db, "turnos", pacienteActivoId), { estado: "Atendido", motivoConsulta: motivo, evolucionMedica: evolucion });
        mostrarExito("Evolución Guardada", "El paciente ha sido marcado como atendido correctamente.");
        pacienteActivoId = null; 
        document.getElementById('medico-paciente-activo').innerText = "Ningún paciente seleccionado";
        document.getElementById('input-motivo-consulta').value = ''; 
        document.getElementById('texto-evolucion').value = '';
        cargarAgendaMedico();
    } catch (error) { console.error(error); mostrarAlerta("Error", "No se pudo guardar la evolución clínica."); }
}

// ==========================================
// ADMIN Y MÉTRICAS (CON VISUALIZACIÓN DE CLAVE)
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
    document.getElementById('input-usuario-username').value = "";
    document.getElementById('input-usuario-pass').value = "";
    document.getElementById('input-usuario-tel').value = "";
    document.getElementById('input-usuario-correo').value = "";
    document.getElementById('input-usuario-matricula').value = "";
    document.getElementById('input-usuario-especialidad').value = "clinica";
    toggleCamposMedico();
    abrirModal('modal-usuario');
}

async function cargarUsuariosAdmin() {
    const tbody = document.getElementById('admin-users-tbody');
    if(!tbody) return;
    try {
        const { collection, getDocs } = await import("https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js");
        const snap = await getDocs(collection(window.db, "usuarios"));
        let html = '';
        const arr = [];
        snap.forEach(doc => { arr.push({ id: doc.id, ...doc.data() }); });
        arr.sort((a, b) => {
            if(a.rol < b.rol) return -1;
            if(a.rol > b.rol) return 1;
            return a.nombre.localeCompare(b.nombre);
        });

        arr.forEach(u => {
            let color = u.rol === 'Médico' ? 'text-teal-700' : (u.rol === 'Administración' ? 'text-gray-800' : 'text-indigo-700');
            const j = encodeURIComponent(JSON.stringify(u));
            html += `
            <tr class="border-b hover:bg-gray-50 bg-white">
                <td class="p-3">
                    <p class="font-bold text-gray-800">${u.nombre}</p>
                    <p class="text-xs text-gray-500">${u.correo || 'Sin correo'} | ${u.tel || 'Sin teléfono'}</p>
                </td>
                <td class="p-3 font-bold ${color}">${u.rol} ${u.matricula ? `<span class="text-xs text-gray-400 block font-normal">MP: ${u.matricula} (${u.especialidad})</span>` : ''}</td>
                <td class="p-3 font-mono text-sm text-gray-600">
                    <div>Usuario: <b>${u.username}</b></div>
                    <div class="text-xs text-gray-500">Clave: <span class="bg-gray-100 px-1 rounded border font-mono">${u.password || 'No registrada'}</span></div>
                </td>
                <td class="p-3 text-center">
                    <button onclick="editarUsuarioAdmin('${j}')" class="bg-gray-100 text-gray-700 border border-gray-300 px-3 py-1 rounded hover:bg-gray-200 font-bold text-xs transition">Editar / Clave</button> 
                    <button onclick="eliminarUsuarioAdmin('${u.id}')" class="text-red-600 hover:text-red-800 font-bold text-xs ml-2 transition">Borrar</button>
                </td>
            </tr>`;
        });
        tbody.innerHTML = html || '<tr><td colspan="4" class="p-4 text-center text-gray-500">No hay usuarios registrados.</td></tr>';
    } catch (error) { tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-red-500">Error al conectar.</td></tr>'; }
}

function editarUsuarioAdmin(userJSONEncoded) {
    const u = JSON.parse(decodeURIComponent(userJSONEncoded));
    document.getElementById('titulo-modal-usuario').innerText = "Actualizar Datos de Usuario";
    document.getElementById('input-usuario-id').value = u.id;
    document.getElementById('input-usuario-nombre').value = u.nombre || '';
    document.getElementById('input-usuario-rol').value = u.rol || 'Administrativo';
    document.getElementById('input-usuario-username').value = u.username || '';
    document.getElementById('input-usuario-pass').value = u.password || '';
    document.getElementById('input-usuario-tel').value = u.tel || '';
    document.getElementById('input-usuario-correo').value = u.correo || '';
    document.getElementById('input-usuario-matricula').value = u.matricula || '';
    document.getElementById('input-usuario-especialidad').value = u.especialidad || 'clinica';
    toggleCamposMedico();
    abrirModal('modal-usuario');
}

async function guardarUsuarioAdminFirebase() {
    const id = document.getElementById('input-usuario-id').value;
    const nom = document.getElementById('input-usuario-nombre').value.trim();
    const rol = document.getElementById('input-usuario-rol').value;
    const user = document.getElementById('input-usuario-username').value.trim();
    const pass = document.getElementById('input-usuario-pass').value.trim();
    const tel = document.getElementById('input-usuario-tel').value.trim();
    const cor = document.getElementById('input-usuario-correo').value.trim();
    const mat = document.getElementById('input-usuario-matricula').value.trim();
    const esp = document.getElementById('input-usuario-especialidad').value;

    if (!nom || !user || !pass) { mostrarAlerta("Datos Faltantes", "Nombre, Usuario y Contraseña son obligatorios."); return; }
    const payload = { nombre: nom, rol: rol, username: user, password: pass, tel: tel, correo: cor, matricula: rol === 'Médico' ? mat : '', especialidad: rol === 'Médico' ? esp : '', timestamp: new Date() };

    try {
        const { collection, addDoc, doc, updateDoc } = await import("https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js");
        if (id) {
            await updateDoc(doc(window.db, "usuarios", id), payload); 
            mostrarExito("Usuario Actualizado", "Los datos se guardaron correctamente.");
        } else {
            await addDoc(collection(window.db, "usuarios"), payload); 
            mostrarExito("Usuario Creado", "El nuevo usuario fue añadido al sistema.");
        }
        cerrarModal('modal-usuario'); cargarUsuariosAdmin(); cargarEspecialistasFirebase();
    } catch (error) { console.error(error); mostrarAlerta("Error", "Fallo al comunicar con la base de datos."); }
}

async function eliminarUsuarioAdmin(id) {
    const confirmado = await pedirConfirmacion("¿Eliminar Usuario?", "Todo su historial de conexión se perderá. Esta acción no se puede deshacer.", "Sí, eliminar");
    if (!confirmado) return;

    try {
        const { doc, deleteDoc } = await import("https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js");
        await deleteDoc(doc(window.db, "usuarios", id));
        cargarUsuariosAdmin(); cargarEspecialistasFirebase();
    } catch (error) { console.error(error); mostrarAlerta("Error", "Error al intentar eliminar el usuario."); }
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
    const passIngresada = document.getElementById('input-seguridad-admin').value.trim();
    const sesionStr = localStorage.getItem("sesionHospitalActiva");
    if (!sesionStr) { mostrarAlerta("Error", "Sesión inválida."); return; }
    const sesion = JSON.parse(sesionStr);
    
    if (passIngresada !== sesion.password) { mostrarAlerta("Acceso Denegado", "La contraseña ingresada es incorrecta."); return; }
    
    const alcance = document.getElementById('admin-select-alcance').value;
    const nuevaDuracion = document.getElementById('admin-select-duracion').value;
    
    try {
        const { doc, setDoc, collection, addDoc } = await import("https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js");
        if (alcance === 'global') {
            await setDoc(doc(window.db, "configuracion", "general"), { duracionBase: parseInt(nuevaDuracion) });
            duracionTurnoGlobal = parseInt(nuevaDuracion); 
            mostrarExito("Modulación Global", `La agenda de todas las especialidades se ajustó a ${nuevaDuracion} minutos.`);
        } else {
            await setDoc(doc(window.db, "modulacion_medicos", alcance), { duracionBase: parseInt(nuevaDuracion) });
            modulacionPorMedico[alcance] = parseInt(nuevaDuracion); 
            mostrarExito("Modulación Individual", `La agenda del profesional se ajustó a ${nuevaDuracion} minutos.`);
        }
        await addDoc(collection(window.db, "auditoria_cambios"), { administrador: sesion.nombre, accion: `Cambio modulación ${alcance} a ${nuevaDuracion} min`, fecha: new Date() });
        cerrarModal('modal-seguridad-modulacion');
    } catch(e) { mostrarAlerta("Error", "No se pudo guardar la configuración."); }
}

let segmentoMetricasActual = 'todos';

async function cargarMetricas(segmento) {
    segmentoMetricasActual = segmento;
    const tbody = document.getElementById('metricas-tbody');
    const kpiContainer = document.getElementById('metricas-kpi-container');
    tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-gray-500">Procesando registros...</td></tr>';
    
    try {
        const { collection, getDocs } = await import("https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js");
        const turnosSnap = await getDocs(collection(window.db, "turnos"));
        const usuariosSnap = await getDocs(collection(window.db, "usuarios"));
        
        let todosLosTurnos = [];
        turnosSnap.forEach(t => todosLosTurnos.push(t.data()));
        let datosAgrupados = {};
        let statsGlobales = { totalOperaciones: 0, cancelados: 0, completados: 0, ausentes: 0 };
        
        usuariosSnap.forEach(doc => {
            const u = doc.data();
            if(segmento === 'todos' || (segmento === 'medicos' && u.rol === 'Médico') || (segmento === 'recepcion' && (u.rol === 'Administrativo' || u.rol === 'Recepción'))) {
                datosAgrupados[u.nombre] = { nombre: u.nombre, rol: u.rol, totalTurnos: 0, atendidos: 0, cancelados: 0, ausentes: 0, generadosWeb: 0, generadosPresencial: 0 };
            }
        });
        
        todosLosTurnos.forEach(t => {
            statsGlobales.totalOperaciones++;
            if(t.estado.includes("Cancelado")) statsGlobales.cancelados++; 
            else if(t.estado === "Atendido") statsGlobales.completados++; 
            else if(t.estado === "Ausente") statsGlobales.ausentes++;
            
            if (datosAgrupados[t.medico]) {
                datosAgrupados[t.medico].totalTurnos++;
                if(t.estado === "Atendido") datosAgrupados[t.medico].atendidos++; 
                if(t.estado.includes("Cancelado")) datosAgrupados[t.medico].cancelados++; 
                if(t.estado === "Ausente") datosAgrupados[t.medico].ausentes++;
            }
            if (segmento === 'recepcion' || segmento === 'todos') {
                Object.keys(datosAgrupados).forEach(k => {
                    if(datosAgrupados[k].rol.includes('Administrativo')) {
                        if(t.estado.includes("Presencial")) datosAgrupados[k].generadosPresencial++;
                        datosAgrupados[k].totalTurnos = datosAgrupados[k].generadosPresencial;
                        datosAgrupados[k].atendidos = datosAgrupados[k].generadosPresencial; 
                    }
                });
            }
        });

        let htmlKpi = '';
        if(segmento === 'medicos' || segmento === 'todos') {
            const efectividad = statsGlobales.totalOperaciones > 0 ? Math.round((statsGlobales.completados / statsGlobales.totalOperaciones) * 100) : 0;
            htmlKpi = `<div class="bg-blue-50 border border-blue-200 p-4 rounded text-center"><p class="text-xs text-blue-600 font-bold uppercase">Citas Registradas</p><p class="text-3xl font-bold text-blue-900">${statsGlobales.totalOperaciones}</p></div><div class="bg-green-50 border border-green-200 p-4 rounded text-center"><p class="text-xs text-green-600 font-bold uppercase">Pacientes Atendidos</p><p class="text-3xl font-bold text-green-900">${statsGlobales.completados}</p></div><div class="bg-red-50 border border-red-200 p-4 rounded text-center"><p class="text-xs text-red-600 font-bold uppercase">Tasa Ausentismo</p><p class="text-3xl font-bold text-red-900">${statsGlobales.ausentes}</p></div><div class="bg-gray-50 border border-gray-300 p-4 rounded text-center"><p class="text-xs text-gray-600 font-bold uppercase">Eficiencia Global</p><p class="text-3xl font-bold text-gray-800">${efectividad}%</p></div>`;
        } else if(segmento === 'recepcion') {
            htmlKpi = `<div class="bg-indigo-50 border border-indigo-200 p-4 rounded text-center col-span-2"><p class="text-xs text-indigo-600 font-bold uppercase">Turnos Presenciales Otorgados</p><p class="text-3xl font-bold text-indigo-900">${statsGlobales.totalOperaciones - statsGlobales.cancelados}</p></div><div class="bg-red-50 border border-red-200 p-4 rounded text-center col-span-2"><p class="text-xs text-red-600 font-bold uppercase">Turnos Cancelados/Modificados</p><p class="text-3xl font-bold text-red-900">${statsGlobales.cancelados}</p></div>`;
        }
        kpiContainer.innerHTML = htmlKpi;

        let htmlTabla = ''; 
        datosMetricasCache = Object.values(datosAgrupados); 
        
        datosMetricasCache.sort((a,b) => b.totalTurnos - a.totalTurnos).forEach(d => {
            let efectividad = d.totalTurnos > 0 ? Math.round((d.atendidos / d.totalTurnos) * 100) : 0;
            let barra = `<div class="w-full bg-gray-200 rounded-full h-2 mt-1"><div class="bg-teal-600 h-2 rounded-full" style="width: ${efectividad}%"></div></div>`;
            let dJSON = encodeURIComponent(JSON.stringify(d));
            htmlTabla += `<tr class="border-b hover:bg-gray-50"><td class="p-3 font-bold text-gray-800">${d.nombre}</td><td class="p-3 text-xs text-gray-500 uppercase font-bold">${d.rol}</td><td class="p-3 font-mono font-bold">${d.totalTurnos}</td><td class="p-3 text-sm"><div class="flex justify-between"><span>${d.atendidos} exitosos</span> <span class="font-bold">${efectividad}%</span></div>${barra}</td><td class="p-3 text-center"><button onclick="verDetalleMetricaIndividual('${dJSON}')" class="text-blue-700 font-bold text-xs hover:underline border border-blue-200 bg-blue-50 px-2 py-1 rounded">Ver Info</button></td></tr>`;
        });
        
        if(htmlTabla === '') htmlTabla = '<tr><td colspan="5" class="p-4 text-center text-gray-500">No hay datos en este segmento.</td></tr>';
        tbody.innerHTML = htmlTabla;
    } catch(e) { console.error(e); }
}

function verDetalleMetricaIndividual(datosJSON) {
    const d = JSON.parse(decodeURIComponent(datosJSON));
    document.getElementById('rendimiento-titulo-nombre').innerText = `Rendimiento: ${d.nombre}`;
    let html = '';
    
    if(d.rol === 'Médico') { 
        html = `<div class="grid grid-cols-2 gap-4"><div class="bg-gray-50 p-3 rounded border text-center"><p class="text-xs text-gray-500 uppercase font-bold">Turnos Agendados</p><p class="text-2xl font-bold">${d.totalTurnos}</p></div><div class="bg-green-50 p-3 rounded border border-green-200 text-center"><p class="text-xs text-green-700 uppercase font-bold">Pacientes Atendidos</p><p class="text-2xl font-bold text-green-800">${d.atendidos}</p></div><div class="bg-red-50 p-3 rounded border border-red-200 text-center"><p class="text-xs text-red-700 uppercase font-bold">Pacientes Ausentes</p><p class="text-2xl font-bold text-red-800">${d.ausentes}</p></div><div class="bg-yellow-50 p-3 rounded border border-yellow-200 text-center"><p class="text-xs text-yellow-700 uppercase font-bold">Turnos Cancelados</p><p class="text-2xl font-bold text-yellow-800">${d.cancelados}</p></div></div>`; 
    } else { 
        html = `<div class="grid grid-cols-1 gap-4"><div class="bg-indigo-50 p-4 rounded border border-indigo-200 text-center"><p class="text-xs text-indigo-700 uppercase font-bold">Operaciones Realizadas (Asignaciones)</p><p class="text-4xl font-bold text-indigo-900">${d.generadosPresencial}</p></div></div>`; 
    }
    document.getElementById('rendimiento-detalle-contenido').innerHTML = html;
    window.datosMetricasIndividualActivo = d;
    abrirModal('modal-rendimiento-detalle');
}

function descargarReporteMetricas() {
    if(datosMetricasCache.length === 0) { mostrarAlerta("Atención", "No hay datos para exportar en este momento."); return; }
    let dataExcel = datosMetricasCache.map(d => ({
        "Nombre del Profesional": d.nombre, "Rol": d.rol, "Total Turnos / Acciones": d.totalTurnos, "Completados / Atendidos": d.atendidos, "Cancelados": d.cancelados, "Ausentes": d.ausentes
    }));
    let ws = XLSX.utils.json_to_sheet(dataExcel);
    let wb = XLSX.utils.book_new(); 
    XLSX.utils.book_append_sheet(wb, ws, "Rendimiento");
    XLSX.writeFile(wb, `Reporte_Rendimiento_${segmentoMetricasActual}.xlsx`);
}

function descargarReporteMetricasIndividual() {
    const d = window.datosMetricasIndividualActivo;
    if(!d) return;
    let dataExcel = [
        ["Concepto", "Valor"], ["Profesional", d.nombre], ["Rol", d.rol], ["Total Agendados/Acciones", d.totalTurnos], ["Atendidos/Exitosos", d.atendidos], ["Ausentes", d.ausentes], ["Cancelados", d.cancelados]
    ];
    let ws = XLSX.utils.aoa_to_sheet(dataExcel);
    let wb = XLSX.utils.book_new(); 
    XLSX.utils.book_append_sheet(wb, ws, "Individual");
    XLSX.writeFile(wb, `Reporte_Individual_${d.nombre.replace(/ /g, '_')}.xlsx`);
}

// ==========================================
// MODALES Y UTILIDADES
// ==========================================
function toggleHistorial() { document.getElementById('historial-paciente').classList.toggle('abierto'); }

function simularAutocompletado(dni) { 
    if(dni === '123456') { 
        document.getElementById('auto-nombre').value = 'Ana Martínez'; 
        document.getElementById('auto-celular').value = '2604112233'; 
        document.getElementById('auto-msg').classList.remove('hidden'); 
    } else { 
        document.getElementById('auto-msg').classList.add('hidden'); 
    } 
}

function toggleTimeSelector() { 
    if (document.getElementById('select-alcance-ausencia').value === 'desde_hora') { 
        document.getElementById('div-hora-ausencia').classList.remove('hidden'); 
    } else { 
        document.getElementById('div-hora-ausencia').classList.add('hidden'); 
    } 
}

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
// EXPORTACIÓN AL SCOPE GLOBAL (VITAL PARA HTML)
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
window.verDetalleMetricaIndividual = verDetalleMetricaIndividual;
window.descargarReporteMetricas = descargarReporteMetricas;
window.descargarReporteMetricasIndividual = descargarReporteMetricasIndividual;
window.toggleHistorial = toggleHistorial;
window.simularAutocompletado = simularAutocompletado;
window.toggleTimeSelector = toggleTimeSelector;
window.forzarReseedDB = forzarReseedDB;

// ==========================================
// ARRANQUE DEL SISTEMA
// ==========================================
iniciarCargaDeDatos();
