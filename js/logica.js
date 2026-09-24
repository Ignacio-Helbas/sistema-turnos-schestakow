// ==========================================
// IMPORTACIONES DE FIREBASE Y AUTH
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, query, where, getDocs, doc, setDoc, addDoc, updateDoc, deleteDoc, getDoc, orderBy, limit, startAfter } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-functions.js";

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
const functionsInstancia = getFunctions(app);
window.db = db;
window.auth = auth;

// ==========================================
// EXPORTACIÓN INMEDIATA AL SCOPE GLOBAL
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
window.simularAutocompletado = simularAutocompletado;
window.toggleTimeSelector = toggleTimeSelector;
window.verificarLimpiezaAnual = verificarLimpiezaAnual;
window.ejecutarLimpiezaYDescarga = ejecutarLimpiezaYDescarga;
window.inyectarMedicosDePrueba = inyectarMedicosDePrueba;
window.limpiarBaseDeDatos = limpiarBaseDeDatos; // NUEVO EXPORT

// ==========================================
// CONFIGURACIÓN DE EMAILJS
// ==========================================
const EMAILJS_PUBLIC_KEY = "eXBPLCSkZcKDBBz9h"; 
const EMAILJS_SERVICE_ID = "service_xitx594"; 
const EMAILJS_TEMPLATE_CONFIRMACION = "template_confirmacion"; 
const EMAILJS_TEMPLATE_CANCELACION = "template_cancelacion"; 

try {
    if(typeof emailjs !== 'undefined' && EMAILJS_PUBLIC_KEY) {
        emailjs.init(EMAILJS_PUBLIC_KEY);
    }
} catch(e) { console.warn("Librería EmailJS no detectada."); }

function enviarCorreoNotificacion(templateId, templateParams) {
    if (!templateParams.email_destino || typeof emailjs === 'undefined') return;
    emailjs.send(EMAILJS_SERVICE_ID, templateId, templateParams).catch(e => console.error(e));
}

// ==========================================
// VARIABLES GLOBALES
// ==========================================
let bdMedicosDinamica = {};
let duracionTurnoGlobal = 15; 
let modulacionPorMedico = {}; 
let usuariosPageSnapshots = []; 
let currentUsuariosPage = 0;
const USUARIOS_PER_PAGE = 5; 

let fechaRecepcionSeleccionada = '';
let medicoSeleccionadoRecepcion = '';
let especialidadSeleccionadaRecepcion = '';
let horaSeleccionadaRecepcion = '';

let turnosMedicoHoy = [];
let pacienteActivoId = null;

let turnoEncontradoActivo = null;
let codigoBusquedaActivo = '';

// ==========================================
// PERMISOS VISUALES (LLAVE MAESTRA)
// ==========================================
function aplicarPermisosVisuales() {
    const btnAdmin = document.getElementById('btn-nav-admin');
    const btnRec = document.getElementById('btn-nav-reception');
    const btnDoc = document.getElementById('btn-nav-doctor');
    const btnDummies = document.getElementById('btn-cargar-dummies');
    const btnReset = document.getElementById('btn-reset-db');

    if(btnAdmin) btnAdmin.classList.add('hidden');
    if(btnRec) btnRec.classList.add('hidden');
    if(btnDoc) btnDoc.classList.add('hidden');
    if(btnDummies) btnDummies.classList.add('hidden');
    if(btnReset) btnReset.classList.add('hidden');

    const sesionStr = localStorage.getItem("sesionHospitalActiva");
    if (!sesionStr) return; 

    const sesion = JSON.parse(sesionStr);
    
    // MODO DESARROLLADOR: Ve absolutamente todo
    if (sesion.correo === "nachohelbas@gmail.com") {
        if(btnAdmin) btnAdmin.classList.remove('hidden');
        if(btnRec) btnRec.classList.remove('hidden');
        if(btnDoc) btnDoc.classList.remove('hidden');
        if(btnDummies) btnDummies.classList.remove('hidden');
        if(btnReset) btnReset.classList.remove('hidden');
    } 
    // EMPLEADOS NORMALES
    else {
        if (sesion.rol === "Administración") {
            if(btnAdmin) btnAdmin.classList.remove('hidden');
            if(btnRec) btnRec.classList.remove('hidden');
        } 
        else if (sesion.rol === "Recepcionista" || sesion.rol === "Administrativo" || sesion.rol === "Recepción") {
            if(btnRec) btnRec.classList.remove('hidden');
        } 
        else if (sesion.rol === "Médico") {
            if(btnDoc) btnDoc.classList.remove('hidden');
        }
    }
}

// ==========================================
// INICIALIZACIÓN Y CATEGORÍAS CLÍNICAS
// ==========================================
function establecerLimitesFecha() {
    const hoy = new Date();
    const fechaMinima = hoy.toISOString().split('T')[0];
    const fp = document.getElementById('input-fecha-paciente');
    const fr = document.getElementById('input-fecha-recepcion');
    if(fp) fp.min = fechaMinima;
    if(fr) fr.min = fechaMinima;
}

async function cargarEspecialistasFirebase() {
    try {
        const snap = await getDocs(query(collection(window.db, "usuarios"), where("rol", "==", "Médico")));
        bdMedicosDinamica = {}; 
        const selectAlcance = document.getElementById('admin-select-alcance');
        if(selectAlcance) selectAlcance.innerHTML = '<option value="global">Todas las especialidades (Global)</option>';
        
        snap.forEach((documento) => {
            const u = documento.data();
            if(u.especialidad && u.nombre) {
                if (!bdMedicosDinamica[u.especialidad]) bdMedicosDinamica[u.especialidad] = [];
                if (!bdMedicosDinamica[u.especialidad].includes(u.nombre)) {
                    bdMedicosDinamica[u.especialidad].push(u.nombre);
                    if(selectAlcance) selectAlcance.innerHTML += `<option value="${u.nombre}">Solo: ${u.nombre}</option>`;
                }
            }
        });

        // AGRUPACIÓN PROFESIONAL POR CATEGORÍAS (OPTGROUP)
        const categoriasBase = {
            "Especialidades Clínicas": ["Clínica Médica", "Cardiología", "Pediatría", "Neurología", "Endocrinología", "Gastroenterología", "Neumonología", "Nefrología", "Infectología", "Dermatología", "Geriatría", "Hematología", "Alergia e Inmunología"],
            "Especialidades Quirúrgicas": ["Cirugía General", "Cirugía Cardiovascular", "Cirugía Plástica y Reparadora", "Traumatología y Ortopedia", "Neurocirugía", "Urología", "Otorrinolaringología", "Oftalmología", "Ginecología y Obstetricia"],
            "Diagnóstico, Tratamiento y Guardia": ["Diagnóstico por Imágenes", "Anatomía Patológica", "Anestesiología", "Terapia Intensiva", "Medicina Física y Rehabilitación", "Medicina de Emergencias"]
        };

        const selectEspPublico = document.getElementById('select-especialidad');
        const selectEspRecepcion = document.getElementById('reception-especialidad');
        
        let opcionesHtml = '<option value="">-- Elija una especialidad --</option>';
        let especialidadesEncontradas = Object.keys(bdMedicosDinamica);

        for (const [categoria, especialidades] of Object.entries(categoriasBase)) {
            let optgroup = `<optgroup label="${categoria}">`;
            let tieneItems = false;
            
            especialidades.forEach(esp => {
                if (especialidadesEncontradas.includes(esp)) {
                    optgroup += `<option value="${esp}">${esp}</option>`;
                    tieneItems = true;
                    especialidadesEncontradas = especialidadesEncontradas.filter(e => e !== esp);
                }
            });
            optgroup += `</optgroup>`;
            if (tieneItems) opcionesHtml += optgroup;
        }

        // Si quedó alguna especialidad suelta fuera del listado principal
        if (especialidadesEncontradas.length > 0) {
            opcionesHtml += `<optgroup label="Otras Especialidades">`;
            especialidadesEncontradas.sort().forEach(esp => {
                opcionesHtml += `<option value="${esp}">${esp}</option>`;
            });
            opcionesHtml += `</optgroup>`;
        }

        if (selectEspPublico) selectEspPublico.innerHTML = opcionesHtml;
        if (selectEspRecepcion) selectEspRecepcion.innerHTML = opcionesHtml;

    } catch(e) { console.warn("No se pudieron cargar especialistas.", e); }
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
    } catch(e) { console.log("Configuración por defecto cargada."); }
}

async function iniciarCargaDeDatos() {
    aplicarPermisosVisuales();
    establecerLimitesFecha(); 
    await cargarEspecialistasFirebase(); 
    await cargarConfiguracionModulacion();
    
    const vAdmin = document.getElementById('view-admin');
    if (vAdmin && vAdmin.classList.contains('active')) {
        cargarUsuariosAdmin();
        verificarLimpiezaAnual();
    }
    
    const vPublic = document.getElementById('view-public');
    if (vPublic && vPublic.classList.contains('active')) actualizarMedicosPublico();
    
    const vRec = document.getElementById('view-reception');
    if (vRec && vRec.classList.contains('active')) actualizarMedicosRecepcion();
}

// ==========================================
// SESIÓN Y NAVEGACIÓN
// ==========================================
function switchView(viewName) {
    document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
    const target = document.getElementById('view-' + viewName);
    if(target) target.classList.add('active');
    
    const btnLogout = document.getElementById('btn-logout');
    if (viewName !== 'public' && viewName !== 'login') {
        if(btnLogout) btnLogout.classList.remove('hidden');
        const sesionStr = localStorage.getItem("sesionHospitalActiva");
        if (sesionStr && btnLogout) { btnLogout.innerText = `Cerrar Sesión (${JSON.parse(sesionStr).nombre})`; } 
    } else { 
        if(btnLogout) btnLogout.classList.add('hidden'); 
    }
    
    if (viewName === 'reception') {
        actualizarMedicosRecepcion();
        if (fechaRecepcionSeleccionada) generarAgendaRecepcion();
    }
    if (viewName === 'public') {
        cargarEspecialistasFirebase();
    }
    if (viewName === 'doctor') cargarAgendaMedico();
    if (viewName === 'admin') {
        cargarUsuariosAdmin();
        verificarLimpiezaAnual();
    }
}

async function iniciarSesionReal() {
    const inputUsuario = document.getElementById('login-user').value.trim();
    const pass = document.getElementById('login-pass').value.trim();
    
    if (!inputUsuario || !pass) { 
        mostrarAlerta("Datos Faltantes", "Ingrese correo o usuario y contraseña."); 
        return; 
    }
    
    try {
        let correoAuth = inputUsuario;
        if (!inputUsuario.includes('@')) {
            const snapBusqueda = await getDocs(query(collection(window.db, "usuarios"), where("username", "==", inputUsuario)));
            if (!snapBusqueda.empty) {
                correoAuth = snapBusqueda.docs[0].data().correo;
            } else {
                mostrarAlerta("Acceso Denegado", "El nombre de usuario no existe en el sistema.");
                return;
            }
        }

        const userCredential = await signInWithEmailAndPassword(window.auth, correoAuth, pass);
        const user = userCredential.user;
        
        let rolUsuario = "Administración"; 
        let nombreUsuario = user.email;

        try {
            const snapRol = await getDocs(query(collection(window.db, "usuarios"), where("correo", "==", user.email)));
            if (!snapRol.empty) {
                const data = snapRol.docs[0].data();
                rolUsuario = data.rol;
                if(data.nombre) nombreUsuario = data.nombre;
            }
        } catch (e) { console.warn("Rol no leído."); }

        localStorage.setItem("sesionHospitalActiva", JSON.stringify({
            correo: user.email,
            nombre: nombreUsuario,
            rol: rolUsuario,
            uid: user.uid
        }));
        
        aplicarPermisosVisuales();

        document.getElementById('login-user').value = ''; 
        document.getElementById('login-pass').value = '';
        
        if (rolUsuario === "Médico") switchView("doctor");
        else if (rolUsuario === "Administrativo" || rolUsuario === "Recepción") switchView("reception");
        else switchView("admin");

    } catch (error) {
        console.error("Auth Error:", error);
        mostrarAlerta("Acceso Denegado", "Las credenciales son incorrectas en Firebase Auth.");
    }
}

function cerrarSesionReal() { 
    localStorage.removeItem("sesionHospitalActiva"); 
    aplicarPermisosVisuales();
    switchView("public"); 
}

function loginAs(role) { switchView(role); }

function abrirModal(id) { 
    const modal = document.getElementById(id);
    if(modal) modal.classList.add('active'); 
}

function cerrarModal(id) { 
    const modal = document.getElementById(id);
    if(modal) modal.classList.remove('active'); 
    
    if (id === 'modal-cancelar-paciente') { 
        if(document.getElementById('input-buscar-dni')) document.getElementById('input-buscar-dni').value = ''; 
        if(document.getElementById('input-buscar-codigo')) document.getElementById('input-buscar-codigo').value = ''; 
        if(document.getElementById('resultado-turnos-paciente')) {
            document.getElementById('resultado-turnos-paciente').innerHTML = ''; 
            document.getElementById('resultado-turnos-paciente').classList.add('hidden');
        }
        turnoEncontradoActivo = null;
        codigoBusquedaActivo = '';
    } 
    if (id === 'modal-ausencia-emergencia') { 
        if(document.getElementById('motivo-ausencia')) document.getElementById('motivo-ausencia').value = ''; 
        if(document.getElementById('hora-desde-ausencia')) document.getElementById('hora-desde-ausencia').value = ''; 
    } 
}

// ==========================================
// PACIENTES (PÚBLICO)
// ==========================================
function actualizarMedicosPublico() {
    const esp = document.getElementById('select-especialidad').value;
    const selectMed = document.getElementById('select-medico');
    if(!selectMed) return;
    
    selectMed.innerHTML = '';
    
    if (!esp) { 
        selectMed.disabled = true; 
        selectMed.className = "w-full border border-slate-300 rounded p-2.5 bg-slate-50 text-slate-500 outline-none transition";
        selectMed.innerHTML = '<option>Primero seleccione especialidad</option>';
        generarHorariosPublicos(); 
        return; 
    }
    
    selectMed.disabled = false;
    selectMed.className = "w-full border border-slate-300 rounded p-2.5 bg-white text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none transition";
    
    if (bdMedicosDinamica[esp] && bdMedicosDinamica[esp].length > 0) {
        selectMed.innerHTML = '<option value="">-- Seleccione Profesional --</option>';
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
    if(!container) return;
    
    if(!input || !medico || medico.includes("Primero") || medico.includes("No hay") || medico.includes("--")) {
        container.innerHTML = '<p class="text-sm text-slate-500 col-span-2 sm:col-span-3 text-center mt-2">Seleccione Profesional y Fecha.</p>'; 
        return;
    }
    container.innerHTML = '<div class="col-span-2 sm:col-span-3 flex justify-center py-4"><p class="text-sm text-blue-600 font-bold ml-2">Consultando disponibilidad...</p></div>';

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
                html += `<button type="button" class="bg-slate-100 text-slate-400 font-bold rounded p-2 border cursor-not-allowed animate-fade-in-up-fast" style="animation-delay: ${delay}ms" disabled>${hsStr} (Ocupado)</button>`;
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
    container.innerHTML = html || '<p class="text-sm text-slate-500 col-span-2 sm:col-span-3 text-center">No hay turnos web disponibles.</p>';
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
        const llamarCrearTurno = httpsCallable(functionsInstancia, 'crearTurnoPublico');
        const respuesta = await llamarCrearTurno({
            especialidad: esp, medico: med, fecha: fec, horario: hor,
            pacienteNombre: nom, pacienteDni: dni, pacienteCelular: cel, pacienteEmail: email
        });
        const codigo = respuesta.data.codigo;

        enviarCorreoNotificacion(EMAILJS_TEMPLATE_CONFIRMACION, {
            nombre_paciente: nom, medico: med, especialidad: esp, fecha: fec, hora: hor,
            email_destino: email, codigo_confirmacion: codigo
        });

        mostrarExito("¡Turno Confirmado!", `Tu código de confirmación es ${codigo}. Guardalo: lo vas a necesitar para cancelar o consultar este turno. También te lo enviamos por email.`);
        
        document.getElementById('paciente-nombre').value = ''; 
        document.getElementById('paciente-dni').value = ''; 
        document.getElementById('paciente-celular').value = ''; 
        document.getElementById('paciente-email').value = ''; 
        document.getElementById('input-fecha-paciente').value = ''; 
        document.getElementById('select-especialidad').value = ''; 
        document.getElementById('horarios-publicos').innerHTML = '<p class="text-sm text-slate-500 col-span-2 sm:col-span-3 text-center mt-2">Seleccione una fecha.</p>'; 
        document.getElementById('select-medico').innerHTML = '<option>Primero seleccione especialidad</option>'; 
        document.getElementById('select-medico').disabled = true;

    } catch (error) { 
        console.error(error); 
        mostrarAlerta("Error de Conexión", error.message || "Hubo un error al registrar el turno. Intente nuevamente."); 
    } 
}

async function buscarTurnosPaciente() {
    const dni = document.getElementById('input-buscar-dni').value.trim();
    const codigo = document.getElementById('input-buscar-codigo').value.trim();
    const res = document.getElementById('resultado-turnos-paciente');

    if (!dni || !codigo) { mostrarAlerta("Dato Faltante", "Ingresá tu DNI y el código de confirmación."); return; }

    try {
        const llamarBuscarTurno = httpsCallable(functionsInstancia, 'buscarTurnoPorCodigo');
        const respuesta = await llamarBuscarTurno({ dni, codigo });
        const t = respuesta.data.turno;

        turnoEncontradoActivo = t;
        codigoBusquedaActivo = codigo;

        const cancelado = t.estado.includes("Cancelado");
        const badge = cancelado ? `<span class="text-xs bg-red-100 text-red-800 px-2 py-1 rounded font-bold">${t.estado}</span>` : '';
        const btn = cancelado || t.estado === "Atendido" || t.estado === "Ausente" ? '' : `<button onclick="cancelarTurnoFirebase('${t.id}')" class="text-xs bg-white text-red-700 px-3 py-2 rounded font-bold border hover:bg-red-50 transition">Cancelar</button>`;
        res.innerHTML = `<div class="bg-slate-50 border p-3 rounded-lg flex flex-col sm:flex-row justify-between items-start sm:items-center mb-2 gap-2"><div class="w-full"><p class="font-bold text-sm text-blue-900">${t.especialidad} - ${t.medico}</p><p class="text-xs text-slate-600 mt-1">${t.fecha} - ${t.horario} hs ${badge}</p></div>${btn}</div>`;
        res.classList.remove('hidden');
    } catch (error) {
        console.error(error);
        res.innerHTML = `<p class="text-sm text-red-600 font-semibold text-center mt-4">${error.message || 'No encontramos ningún turno con esos datos.'}</p>`;
        res.classList.remove('hidden');
    }
}

async function cancelarTurnoFirebase(id) {
    const confirmado = await pedirConfirmacion("¿Cancelar este turno?", "Se cancelará la reserva y se enviará un correo notificando la cancelación.", "Sí, cancelar turno");
    if (!confirmado) return;

    try {
        const llamarCancelarTurno = httpsCallable(functionsInstancia, 'cancelarTurnoConCodigo');
        const respuesta = await llamarCancelarTurno({ id, codigo: codigoBusquedaActivo });
        const t = respuesta.data.turno;

        enviarCorreoNotificacion(EMAILJS_TEMPLATE_CANCELACION, {
            nombre_paciente: t.pacienteNombre, medico: t.medico, especialidad: t.especialidad, fecha: t.fecha, hora: t.horario, email_destino: t.pacienteEmail
        });

        mostrarExito("Turno Cancelado", "Su turno ha sido cancelado.");
        buscarTurnosPaciente(); 
    } catch (error) { console.error(error); mostrarAlerta("Error", error.message || "No se pudo cancelar el turno."); }
}

// ==========================================
// RECEPCIÓN
// ==========================================
function actualizarMedicosRecepcion() {
    const esp = document.getElementById('reception-especialidad').value;
    const selectMed = document.getElementById('reception-medico');
    if(!selectMed) return;
    
    selectMed.innerHTML = '';
    
    if (!esp) { 
        selectMed.disabled = true; 
        selectMed.className = "w-full border border-slate-300 rounded-lg p-2.5 bg-slate-50 text-slate-500 outline-none";
        selectMed.innerHTML = '<option>Primero seleccione especialidad</option>';
        return; 
    }
    
    selectMed.disabled = false;
    selectMed.className = "w-full border border-slate-300 rounded-lg p-2.5 bg-white text-slate-800 focus:ring-2 focus:ring-blue-500 outline-none";
    
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
        const styleCanal = esCanalWeb ? 'bg-blue-100 text-blue-800' : 'bg-slate-200 text-slate-800';
        
        let htmlPaciente = '<i class="text-slate-400">Libre</i>';
        let htmlEstado = '<span class="text-emerald-700 font-bold text-sm">Disponible</span>';
        let htmlAccion = `<button onclick="abrirModalDarTurno('${horaStr}')" class="bg-blue-800 text-white text-xs px-3 py-2 rounded font-bold hover:bg-blue-900 shadow-sm transition">Asignar Turno</button>`;
        
        if (turnosOcupados[horaStr]) {
            const t = turnosOcupados[horaStr];
            htmlPaciente = `<span class="font-bold text-slate-800">${t.pacienteNombre}</span> <span class="text-xs text-slate-500 block sm:inline">(DNI: ${t.pacienteDni})</span>`;
            
            if(t.estado.includes("Cancelado")) {
                htmlEstado = `<span class="text-red-600 font-bold text-xs uppercase">${t.estado}</span>`;
                htmlAccion = `<span class="text-xs text-slate-400 font-bold">Bloqueado</span>`;
            } else {
                htmlEstado = `<span class="text-amber-600 font-bold text-sm">${t.estado}</span>`;
                htmlAccion = `<button onclick="cancelarTurnoRecepcion('${t.id}')" class="bg-white border border-red-500 text-red-600 text-xs px-3 py-2 rounded font-bold hover:bg-red-50 transition shadow-sm">Cancelar</button>`;
            }
        }

        html += `
        <tr class="border-b hover:bg-slate-50 bg-white">
            <td class="p-3 font-bold text-slate-800">${horaStr}</td>
            <td class="p-3"><span class="text-xs px-2 py-1 rounded font-bold border border-slate-300 ${styleCanal}">${canalStr}</span></td>
            <td class="p-3">${htmlPaciente}</td>
            <td class="p-3">${htmlEstado}</td>
            <td class="p-3">${htmlAccion}</td>
        </tr>`;

        esCanalWeb = !esCanalWeb; 
        minutosBucle += duracionActual;
    }
    tbody.innerHTML = html;
}

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
    if(typeof XLSX === 'undefined') { mostrarAlerta("Error", "La librería de Excel no se pudo cargar."); return; }
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
        let q = nombreFiltro ? query(collection(window.db, "turnos"), where("fecha", "==", hoy), where("medico", "==", nombreFiltro)) : query(collection(window.db, "turnos"), where("fecha", "==", hoy));
        const snap = await getDocs(q);
        turnosMedicoHoy = [];
        snap.forEach((documento) => { if (!documento.data().estado.includes("Cancelado")) turnosMedicoHoy.push({ id: documento.id, ...documento.data() }); });
        turnosMedicoHoy.sort((a, b) => a.horario.localeCompare(b.horario));

        let html = ''; 
        let primerPaciente = "Ningún paciente en espera";

        if(turnosMedicoHoy.length === 0) { 
            html = '<p class="text-sm text-slate-500 p-2">No tiene pacientes para hoy.</p>'; 
        } else {
            let contador = 0;
            turnosMedicoHoy.forEach((t) => {
                if (t.estado === "En consultorio" || (contador === 0 && t.estado !== "Atendido" && t.estado !== "Ausente")) {
                    if (!pacienteActivoId && t.estado === "En consultorio") pacienteActivoId = t.id;
                    primerPaciente = `${t.pacienteNombre} (DNI: ${t.pacienteDni})`;
                }
                if (t.estado !== "Atendido" && t.estado !== "Ausente") contador++;

                let color = "bg-amber-200 text-amber-800";
                if(t.estado === "En consultorio") color = "bg-emerald-200 text-emerald-800";
                if(t.estado === "Atendido") color = "bg-slate-200 text-slate-800";
                if(t.estado === "Ausente") color = "bg-red-200 text-red-800";

                let btnHtml = '';
                if (t.estado !== "Atendido" && t.estado !== "Ausente") {
                    btnHtml = `<div class="mt-3 flex gap-2"><button onclick="llamarPaciente('${t.id}')" class="flex-1 bg-blue-600 text-white text-xs font-bold py-2 rounded shadow hover:bg-blue-700 transition">Llamar</button><button onclick="marcarAusente('${t.id}')" class="flex-1 bg-white border border-red-100 text-red-600 text-xs font-bold py-2 rounded shadow hover:bg-red-50 transition">Ausente</button></div>`;
                }

                const opacidad = (t.estado === 'Atendido' || t.estado === 'Ausente') ? 'opacity-60' : 'opacity-100';
                const borde = t.estado === 'En consultorio' ? 'border-emerald-500 bg-emerald-50' : 'border-blue-500 bg-blue-50';

                html += `<div class="border-l-4 ${borde} p-4 rounded-lg shadow-sm border border-slate-200 ${opacidad}"><div class="flex justify-between items-center text-sm mb-2"><span class="font-bold text-blue-900">${t.horario} hs</span><span class="text-xs ${color} px-2 py-0.5 rounded font-bold">${t.estado}</span></div><p class="font-bold text-lg text-slate-800 leading-tight">${t.pacienteNombre}</p><p class="text-xs text-slate-500 mt-1">DNI: ${t.pacienteDni} | Tel: ${t.pacienteCelular}</p>${btnHtml}</div>`;
            });
            if(contador === 0) html += '<p class="text-sm text-slate-500 p-2 mt-4 border-t border-slate-200 pt-4">No hay más pacientes en espera.</p>';
        }
        container.innerHTML = html; 
        if(lblPacienteActivo) lblPacienteActivo.innerText = primerPaciente;
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
// ADMIN Y GESTIÓN DE USUARIOS
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
        document.getElementById('input-usuario-especialidad').value = 'Clínica Médica'; 
    }
}

function abrirModalUsuarioNulo() {
    document.getElementById('titulo-modal-usuario').innerText = "Registrar Nuevo Usuario";
    document.getElementById('input-usuario-id').value = "";
    document.getElementById('input-usuario-nombre').value = "";
    document.getElementById('input-usuario-rol').value = "Administrativo";
    document.getElementById('input-usuario-username').value = "";
    document.getElementById('input-usuario-correo').value = "";
    document.getElementById('input-usuario-pass').value = "";
    document.getElementById('input-usuario-tel').value = "";
    document.getElementById('input-usuario-matricula').value = "";
    document.getElementById('input-usuario-especialidad').value = "Clínica Médica";
    toggleCamposMedico();
    abrirModal('modal-usuario');
}

async function cargarUsuariosAdmin(direccion = 'init') {
    const tbody = document.getElementById('admin-users-tbody');
    if(!tbody) return;

    tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-slate-500 font-bold animate-pulse">Cargando base de datos...</td></tr>';

    let q;
    const refCol = collection(window.db, "usuarios");

    if (direccion === 'init') {
        usuariosPageSnapshots = [];
        currentUsuariosPage = 0;
        q = query(refCol, orderBy("nombre"), limit(USUARIOS_PER_PAGE)); 
    } 
    else if (direccion === 'next') {
        const ultimoDoc = usuariosPageSnapshots[currentUsuariosPage].lastVisible;
        q = query(refCol, orderBy("nombre"), startAfter(ultimoDoc), limit(USUARIOS_PER_PAGE));
        currentUsuariosPage++;
    } 
    else if (direccion === 'prev') {
        currentUsuariosPage--;
        if (currentUsuariosPage === 0) {
            q = query(refCol, orderBy("nombre"), limit(USUARIOS_PER_PAGE));
        } else {
            const docPrevio = usuariosPageSnapshots[currentUsuariosPage - 1].lastVisible;
            q = query(refCol, orderBy("nombre"), startAfter(docPrevio), limit(USUARIOS_PER_PAGE));
        }
    }

    try {
        const snap = await getDocs(q);
        
        if (snap.empty) {
            if (direccion === 'next') currentUsuariosPage--; 
            tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-slate-500">No hay más usuarios registrados.</td></tr>';
            actualizarBotonesPaginacion(false);
            return;
        }

        usuariosPageSnapshots[currentUsuariosPage] = {
            firstVisible: snap.docs[0],
            lastVisible: snap.docs[snap.docs.length - 1]
        };

        let html = '';
        snap.forEach(documento => {
            const u = { id: documento.id, ...documento.data() };
            let color = u.rol === 'Médico' ? 'text-emerald-700' : (u.rol === 'Administración' ? 'text-slate-800' : 'text-blue-700');
            const j = encodeURIComponent(JSON.stringify(u));
            
            html += `
            <tr class="border-b hover:bg-slate-50 bg-white transition">
                <td class="p-3">
                    <p class="font-bold text-slate-800">${u.nombre || 'Sin Nombre'}</p>
                    <p class="text-xs text-slate-500">${u.tel || 'Sin teléfono'}</p>
                </td>
                <td class="p-3 font-bold ${color}">${u.rol} ${u.matricula ? `<span class="text-xs text-slate-400 block font-normal mt-0.5">MP: ${u.matricula} (${u.especialidad})</span>` : ''}</td>
                <td class="p-3 font-mono text-sm text-slate-600">
                    <div><b>${u.correo}</b></div>
                    <div class="text-xs text-slate-500 mt-0.5">UID: <span class="text-blue-600">${u.uid || 'No vinculado'}</span></div>
                    <div class="text-xs text-slate-500 mt-0.5">Usr: <b>${u.username || 'N/A'}</b></div>
                </td>
                <td class="p-3 text-center whitespace-nowrap">
                    <button onclick="editarUsuarioAdmin('${j}')" class="bg-slate-100 text-slate-700 border border-slate-300 px-3 py-1 rounded hover:bg-slate-200 font-bold text-xs transition shadow-sm">Editar</button> 
                    <button onclick="eliminarUsuarioAdmin('${u.id}')" class="text-red-600 hover:text-red-800 font-bold text-xs ml-2 transition">Borrar</button>
                </td>
            </tr>`;
        });
        
        tbody.innerHTML = html;
        actualizarBotonesPaginacion(snap.docs.length === USUARIOS_PER_PAGE);

    } catch (error) {
        console.error(error);
        tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-red-500 font-bold">Error de conexión. Es posible que falte un índice en Firestore.</td></tr>';
    }
}

function actualizarBotonesPaginacion(hayMas) {
    const btnPrev = document.getElementById('btn-prev-users');
    const btnNext = document.getElementById('btn-next-users');
    const info = document.getElementById('admin-pag-info');
    
    if(btnPrev) btnPrev.disabled = currentUsuariosPage === 0;
    if(btnNext) btnNext.disabled = !hayMas;
    if(info) info.innerText = `Página ${currentUsuariosPage + 1}`;
}

function editarUsuarioAdmin(userJSONEncoded) {
    const u = JSON.parse(decodeURIComponent(userJSONEncoded));
    document.getElementById('titulo-modal-usuario').innerText = "Actualizar Datos de Usuario";
    document.getElementById('input-usuario-id').value = u.id;
    document.getElementById('input-usuario-nombre').value = u.nombre || '';
    document.getElementById('input-usuario-rol').value = u.rol || 'Administrativo';
    document.getElementById('input-usuario-username').value = u.username || '';
    document.getElementById('input-usuario-correo').value = u.correo || '';
    document.getElementById('input-usuario-pass').value = ''; // Ya no viaja el password guardado: se deja vacío = "no cambiar"
    document.getElementById('input-usuario-tel').value = u.tel || '';
    document.getElementById('input-usuario-matricula').value = u.matricula || '';
    document.getElementById('input-usuario-especialidad').value = u.especialidad || 'Clínica Médica';
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

    if (!cor || !nom || !user) {
        mostrarAlerta("Datos Faltantes", "Nombre, Usuario y Correo son obligatorios.");
        return;
    }
    if (!id && !pass) {
        mostrarAlerta("Datos Faltantes", "La contraseña es obligatoria para crear un usuario nuevo.");
        return;
    }

    // A partir de acá, la creación/edición del usuario (incluida la contraseña
    // y el rol como custom claim) la hace la Cloud Function "guardarUsuarioAdmin".
    // El cliente NUNCA vuelve a escribir el password en Firestore.
    const payload = {
        id: id || null,
        nombre: nom,
        rol: rol,
        username: user,
        password: pass || null, // null = "no cambiar" al editar
        correo: cor,
        tel: tel,
        matricula: rol === 'Médico' ? mat : '',
        especialidad: rol === 'Médico' ? esp : '',
    };

    try {
        const llamarGuardarUsuario = httpsCallable(functionsInstancia, 'guardarUsuarioAdmin');
        await llamarGuardarUsuario(payload);

        mostrarExito(
            id ? "Actualizado" : "Sincronizado",
            id ? "Los datos se guardaron correctamente en el perfil." : "Usuario creado en Auth y Firestore correctamente."
        );

        cerrarModal('modal-usuario');
        cargarUsuariosAdmin();
        cargarEspecialistasFirebase();

    } catch (error) {
        console.error(error);
        mostrarAlerta("Error", error.message || "Fallo al comunicar con la base de datos.");
    }
}

async function eliminarUsuarioAdmin(id) {
    const confirmado = await pedirConfirmacion("¿Eliminar Usuario?", "Esta acción quitará el perfil de la tabla administrativa.", "Sí, eliminar");
    if (!confirmado) return;

    try {
        await deleteDoc(doc(window.db, "usuarios", id));
        cargarUsuariosAdmin(); cargarEspecialistasFirebase();
    } catch (error) { console.error(error); mostrarAlerta("Error", "Error al intentar eliminar."); }
}

function cambiarTabAdmin(tabId) {
    document.querySelectorAll('.admin-tab').forEach(t => {
        t.classList.remove('active', 'text-blue-800');
        t.classList.add('text-slate-500');
    });
    document.querySelectorAll('.admin-section').forEach(s => s.classList.add('hidden'));
    
    const tabActiva = document.getElementById('tab-' + tabId);
    if(tabActiva) {
        tabActiva.classList.add('active', 'text-blue-800');
        tabActiva.classList.remove('text-slate-500');
    }
    
    const secActiva = document.getElementById('admin-sec-' + tabId);
    if(secActiva) secActiva.classList.remove('hidden');

    if(tabId === 'metricas') cargarMetricas();
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

async function cargarMetricas() {
    const tbody = document.getElementById('metricas-tbody');
    const kpiContainer = document.getElementById('metricas-kpi-container');
    tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-slate-500 font-bold animate-pulse">Procesando inteligencia de datos...</td></tr>';
    
    try {
        const turnosSnap = await getDocs(collection(window.db, "turnos"));
        const usuariosSnap = await getDocs(collection(window.db, "usuarios"));
        
        let turnosTotales = 0;
        let atendidosTotales = 0;
        let ausentesTotales = 0;
        let canceladosTotales = 0;
        let canalWeb = 0;
        let canalPresencial = 0;

        let datosMedicos = {};
        
        usuariosSnap.forEach(doc => {
            const u = doc.data();
            if (u.rol === "Médico") {
                datosMedicos[u.nombre] = { nombre: u.nombre, especialidad: u.especialidad, total: 0, atendidos: 0, ausentes: 0, cancelados: 0 };
            }
        });
        
        turnosSnap.forEach(doc => {
            const t = doc.data();
            turnosTotales++;
            
            if (t.estado === "Atendido") atendidosTotales++;
            if (t.estado === "Ausente") ausentesTotales++;
            if (t.estado.includes("Cancelado")) canceladosTotales++;

            if (t.estado.includes("Web")) canalWeb++;
            else canalPresencial++;

            if (datosMedicos[t.medico]) {
                datosMedicos[t.medico].total++;
                if (t.estado === "Atendido") datosMedicos[t.medico].atendidos++;
                if (t.estado === "Ausente") datosMedicos[t.medico].ausentes++;
                if (t.estado.includes("Cancelado")) datosMedicos[t.medico].cancelados++;
            }
        });

        let pctAusentismo = turnosTotales > 0 ? Math.round((ausentesTotales / turnosTotales) * 100) : 0;
        let pctEfectividad = turnosTotales > 0 ? Math.round((atendidosTotales / turnosTotales) * 100) : 0;
        let pctWeb = turnosTotales > 0 ? Math.round((canalWeb / turnosTotales) * 100) : 0;

        kpiContainer.innerHTML = `
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div class="bg-blue-50 border border-blue-200 p-4 rounded-xl shadow-sm text-center">
                    <p class="text-xs text-blue-600 font-bold uppercase tracking-wide">Volumen Institucional</p>
                    <p class="text-3xl font-bold text-blue-900 mt-2">${turnosTotales}</p>
                    <p class="text-xs text-blue-500 mt-1 font-medium">Turnos Totales</p>
                </div>
                <div class="bg-emerald-50 border border-emerald-200 p-4 rounded-xl shadow-sm text-center">
                    <p class="text-xs text-emerald-600 font-bold uppercase tracking-wide">Efectividad Global</p>
                    <p class="text-3xl font-bold text-emerald-900 mt-2">${pctEfectividad}%</p>
                    <p class="text-xs text-emerald-600 mt-1 font-medium">${atendidosTotales} Atendidos</p>
                </div>
                <div class="bg-red-50 border border-red-200 p-4 rounded-xl shadow-sm text-center">
                    <p class="text-xs text-red-600 font-bold uppercase tracking-wide">Tasa Ausentismo</p>
                    <p class="text-3xl font-bold text-red-900 mt-2">${pctAusentismo}%</p>
                    <p class="text-xs text-red-500 mt-1 font-medium">${ausentesTotales} Pacientes</p>
                </div>
                <div class="bg-purple-50 border border-purple-200 p-4 rounded-xl shadow-sm text-center">
                    <p class="text-xs text-purple-600 font-bold uppercase tracking-wide">Canal Ingreso</p>
                    <p class="text-3xl font-bold text-purple-900 mt-2">${pctWeb}% <span class="text-lg">Web</span></p>
                    <p class="text-xs text-purple-500 mt-1 font-medium">${canalPresencial} Presenciales</p>
                </div>
            </div>
        `;

        let htmlTabla = ''; 
        Object.values(datosMedicos).forEach(d => {
            if(d.total > 0) {
                let efectividad = Math.round((d.atendidos / d.total) * 100);
                let ausentismo = Math.round((d.ausentes / d.total) * 100);
                htmlTabla += `
                <tr class="border-b hover:bg-slate-50 transition bg-white">
                    <td class="p-3 font-bold text-slate-800">${d.nombre}</td>
                    <td class="p-3 text-xs text-slate-500 font-bold uppercase">${d.especialidad}</td>
                    <td class="p-3 font-mono font-bold text-center text-slate-600">${d.total}</td>
                    <td class="p-3 text-sm text-emerald-600 font-bold text-center">${d.atendidos} <span class="text-xs text-emerald-400">(${efectividad}%)</span></td>
                    <td class="p-3 text-sm text-red-600 font-bold text-center">${d.ausentes} <span class="text-xs text-red-400">(${ausentismo}%)</span></td>
                </tr>`;
            }
        });
        
        tbody.innerHTML = htmlTabla || '<tr><td colspan="5" class="p-4 text-center text-slate-500">No hay datos de turnos suficientes para generar métricas.</td></tr>';
    } catch(e) { 
        console.error(e); 
        tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-red-500 font-bold">Error al procesar las métricas.</td></tr>';
    }
}

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
// MANTENIMIENTO INTELIGENTE
// ==========================================
async function verificarLimpiezaAnual() {
    const hoy = new Date();
    hoy.setFullYear(hoy.getFullYear() - 1); 
    const fechaLimite = hoy.toISOString().split('T')[0];

    try {
        const snap = await getDocs(query(collection(window.db, "turnos"), where("fecha", "<", fechaLimite)));
        if (!snap.empty) {
            document.getElementById('limpieza-mensaje').innerText = `Se encontraron ${snap.docs.length} registros anteriores al ${fechaLimite}.`;
            abrirModal('modal-limpieza-anual');
        }
    } catch (error) { console.error("Fallo al verificar datos antiguos:", error); }
}

async function ejecutarLimpiezaYDescarga() {
    if(typeof XLSX === 'undefined') { mostrarAlerta("Error", "La librería de Excel no se pudo cargar."); return; }
    
    const hoy = new Date();
    hoy.setFullYear(hoy.getFullYear() - 1);
    const fechaLimite = hoy.toISOString().split('T')[0];

    try {
        const snap = await getDocs(query(collection(window.db, "turnos"), where("fecha", "<", fechaLimite)));
        if (snap.empty) return;

        let datosExcel = [];
        snap.forEach(doc => {
            const t = doc.data();
            datosExcel.push({
                "Fecha": t.fecha, "Hora": t.horario, "Especialidad": t.especialidad, "Profesional": t.medico, "Paciente": t.pacienteNombre, "DNI": t.pacienteDni, "Celular": t.pacienteCelular, "Correo": t.pacienteEmail || "N/A", "Estado Final": t.estado, "Evolución / Motivo": t.evolucionMedica || t.motivoConsulta || "Sin observaciones"
            });
        });

        let ws = XLSX.utils.json_to_sheet(datosExcel);
        let wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Archivo Histórico");
        XLSX.writeFile(wb, `Resguardo_Turnos_Hasta_${fechaLimite}.xlsx`);

        const promesasBorrado = snap.docs.map(documento => deleteDoc(doc(window.db, "turnos", documento.id)));
        await Promise.all(promesasBorrado);

        cerrarModal('modal-limpieza-anual');
        mostrarExito("Depuración Exitosa", `Se descargó el archivo y se eliminaron ${snap.docs.length} registros históricos de la base de datos operativa.`);
        cargarMetricas();
        
    } catch (error) { console.error(error); mostrarAlerta("Error Crítico", "Fallo al realizar la exportación."); }
}

// ==========================================
// HERRAMIENTAS DE DESARROLLO (SUPER ADMIN)
// ==========================================

async function limpiarBaseDeDatos() {
    const input = prompt("⚠️ ADVERTENCIA DE SEGURIDAD ⚠️\nEsta acción borrará TODOS los turnos y TODOS los usuarios del sistema (excepto su cuenta maestra).\n\nEl sistema quedará en blanco, como recién instalado.\n\nPara confirmar, escriba exactamente la palabra: BORRAR");
    
    if (input !== "BORRAR") {
        mostrarAlerta("Cancelado", "Palabra de seguridad incorrecta. No se ha borrado ningún dato.");
        return;
    }

    abrirModal('modal-progreso');
    const barra = document.getElementById('progreso-barra');
    const texto = document.getElementById('progreso-texto');
    
    if(texto) texto.innerText = "Vaciando base de datos...";
    if(barra) barra.style.width = '30%';

    try {
        // 1. Borrar todos los turnos
        const turnosSnap = await getDocs(collection(window.db, "turnos"));
        const promesasTurnos = turnosSnap.docs.map(d => deleteDoc(doc(window.db, "turnos", d.id)));
        await Promise.all(promesasTurnos);
        if(barra) barra.style.width = '60%';

        // 2. Borrar usuarios (Excepto el admin)
        const usuariosSnap = await getDocs(collection(window.db, "usuarios"));
        const promesasUsuarios = [];
        usuariosSnap.forEach(d => {
            const u = d.data();
            // No borramos la cuenta maestra actual
            if (u.correo !== "nachohelbas@gmail.com") {
                promesasUsuarios.push(deleteDoc(doc(window.db, "usuarios", d.id)));
            }
        });
        await Promise.all(promesasUsuarios);

        if(barra) barra.style.width = '100%';
        cerrarModal('modal-progreso');
        mostrarExito("Reinicio Exitoso", "El sistema ha sido restaurado a su estado de fábrica. Turnos y usuarios de prueba eliminados.");
        
        // Recargar datos en la UI
        cargarUsuariosAdmin('init');
        cargarEspecialistasFirebase();
        cargarMetricas();
    } catch (e) {
        console.error(e);
        cerrarModal('modal-progreso');
        mostrarAlerta("Error", "Ocurrió un problema al intentar vaciar la base de datos.");
    }
}

async function inyectarMedicosDePrueba() {
    const confirm = await pedirConfirmacion("¿Inyectar Base de Datos?", "Se cargarán 28 profesionales ficticios categorizados en la base de datos para la presentación. Este proceso tomará unos 15 segundos para no saturar el servidor.", "Sí, Inyectar");
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
            nombre: med.nom, rol: "Médico",
            username: med.nom.split(' ')[1].toLowerCase() + Math.floor(Math.random() * 1000),
            password: "demo", correo: med.nom.split(' ')[1].toLowerCase() + "@hospital.demo",
            tel: "2604000000", matricula: med.mat, especialidad: med.esp,
            uid: "dummy_" + Date.now(), timestamp: new Date()
        };

        try { await addDoc(collection(window.db, "usuarios"), payload); } 
        catch(e) { console.error("Fallo inyectando a:", med.nom); }

        completados++;
        let porcentaje = Math.round((completados / total) * 100);
        if(barra) barra.style.width = porcentaje + '%';
        if(texto) texto.innerText = `Procesando: ${med.nom} (${completados}/${total})`;

        // Pausa de 500ms para evitar bloqueo de red por "Spam"
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    cerrarModal('modal-progreso');
    mostrarExito("Inyección Exitosa", "Los 29 médicos de prueba fueron agregados al sistema con sus respectivas especialidades.");
    
    cargarUsuariosAdmin('init'); 
    cargarEspecialistasFirebase();
    cargarMetricas();
}

// ==========================================
// ARRANQUE SEGURO
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    iniciarCargaDeDatos();
    
    // Permitir inicio de sesión presionando "Enter"
    const inputUser = document.getElementById('login-user');
    const inputPass = document.getElementById('login-pass');
    if(inputUser) inputUser.addEventListener('keypress', e => { if(e.key === 'Enter') iniciarSesionReal(); });
    if(inputPass) inputPass.addEventListener('keypress', e => { if(e.key === 'Enter') iniciarSesionReal(); });

    console.log("Sistema cargado. Vistas inicializadas.");
});
