// ==========================================
// MÓDULO DE AUTENTICACIÓN Y CONTROL DE SESIÓN
// js/auth.js
// ==========================================

import {
    auth,
    db,
    doc,
    getDoc,
    setDoc,
    signOut,
    signInWithEmailAndPassword,
    onAuthStateChanged,
    serverTimestamp
} from "./firebase.js";

import {
    mostrarAlerta,
    mostrarOverlayCargaPanel,
    ocultarOverlayCargaPanel
} from "./ui.js";

import { ejecutarUnaVez } from "./guardia.js";

let sesionActual = null;
let temporizadorInactividad = null;

export function obtenerSesionActual() {
    return sesionActual;
}

export function establecerSesionActual(sesion) {
    sesionActual = sesion;
}

export function resetInactividad() {
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

export function mostrarPantallaLogin() {
    sesionActual = null;
    ocultarOverlayCargaPanel();

    // Cerrar y ocultar modal de perfil móvil si estaba abierto
    const modalPerfil = document.getElementById('modal-perfil-mobile');
    if (modalPerfil) {
        modalPerfil.classList.add('hidden');
    }
    if (typeof window.cerrarMenuPerfilMobile === 'function') {
        window.cerrarMenuPerfilMobile();
    }

    // Ocultar cualquier modal residual
    document.querySelectorAll('.modal, [role="dialog"]').forEach(m => {
        m.classList.add('hidden');
    });

    // Ocultar datos de usuario en cabecera desktop
    const usuarioSesionInfo = document.getElementById('usuario-sesion-info');
    if (usuarioSesionInfo) usuarioSesionInfo.classList.add('hidden');

    const btnLogin = document.getElementById('btn-login') || document.getElementById('btn-login-submit');
    if (btnLogin) {
        btnLogin.disabled = false;
        btnLogin.removeAttribute('aria-busy');
        btnLogin.classList.remove('cargando');
        btnLogin.textContent = 'Ingresar al Sistema';
    }
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

    if (btnAdmin) btnAdmin.classList.add('hidden');
    if (btnRec) btnRec.classList.add('hidden');
    if (btnDoc) btnDoc.classList.add('hidden');
    if (btnLogout) btnLogout.classList.add('hidden');

    // Ocultar barras inferiores móviles de staff y barra superadmin
    const navDoc = document.getElementById('bottom-nav-doctor');
    const navAdm = document.getElementById('bottom-nav-admin');
    const navRec = document.getElementById('bottom-nav-reception');
    const barraSuperadmin = document.getElementById('barra-superadmin-controles');
    if (navDoc) navDoc.classList.add('hidden');
    if (navAdm) navAdm.classList.add('hidden');
    if (navRec) navRec.classList.add('hidden');
    if (barraSuperadmin) barraSuperadmin.classList.add('hidden');
}

export async function iniciarSesionReal() {
    const emailInput = document.getElementById('login-user')?.value.trim();
    const passInput = document.getElementById('login-pass')?.value.trim();

    if (!emailInput || !passInput) {
        mostrarAlerta("Datos Faltantes", "Ingrese correo electrónico y contraseña.");
        return;
    }

    const boton = document.getElementById('btn-login') || document.getElementById('btn-login-submit');
    const textoOriginal = 'Ingresar al Sistema';

    if (boton) {
        if (boton.disabled || boton.classList.contains('cargando')) return;
        boton.disabled = true;
        boton.classList.add('cargando');
        boton.textContent = 'Iniciando...';
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

        const inputUser = document.getElementById('login-user');
        const inputPass = document.getElementById('login-pass');
        if (inputUser) inputUser.value = '';
        if (inputPass) inputPass.value = '';

        mostrarOverlayCargaPanel("Iniciando sesión en el sistema...");
    } catch (error) {
        if (boton) {
            boton.disabled = false;
            boton.classList.remove('cargando');
            boton.textContent = textoOriginal;
        }
        ocultarOverlayCargaPanel();
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

export async function cerrarSesionReal() {
    sessionStorage.removeItem('hospital_sesion_activa');
    sesionActual = null;
    const modalPerfil = document.getElementById('modal-perfil-mobile');
    if (modalPerfil) modalPerfil.classList.add('hidden');
    if (typeof window.cerrarMenuPerfilMobile === 'function') {
        window.cerrarMenuPerfilMobile();
    }
    try {
        await signOut(auth);
    } catch (_) {}
    mostrarPantallaLogin();
}

/**
 * Registra listeners de autenticación e inicializa el control de sesión.
 * @param {Function} onSessionReady Callback cuando hay una sesión activa confirmada
 */
export function inicializarAuth(onSessionReady) {
    // Escuchar cambios de estado en Firebase Auth
    onAuthStateChanged(auth, async (user) => {
        // Protección contra auto-login pasivo / bypass:
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

        sesionActual = {
            uid: user.uid,
            correo: user.email,
            nombre: nombre,
            rol: rol
        };

        resetInactividad();

        if (typeof onSessionReady === 'function') {
            onSessionReady(sesionActual);
        }
    });

    // Vincular teclado y botones de login si están presentes
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

// Exponer en window para manejadores inline del DOM
window.iniciarSesionReal = iniciarSesionReal;
window.cerrarSesionReal = cerrarSesionReal;
window.establecerSesionActual = establecerSesionActual;
