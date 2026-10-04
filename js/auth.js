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
    mostrarAlerta
} from "./ui.js";

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

        const inputUser = document.getElementById('login-user');
        const inputPass = document.getElementById('login-pass');
        if (inputUser) inputUser.value = '';
        if (inputPass) inputPass.value = '';
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

export async function cerrarSesionReal() {
    sessionStorage.removeItem('hospital_sesion_activa');
    sesionActual = null;
    await signOut(auth);
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

        if (user.email && user.email.toLowerCase() === "nachohelbas@gmail.com") {
            rol = "Administración";
            if (!nombre || nombre === user.email) nombre = "Ignacio Helbas (SuperAdmin)";

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
