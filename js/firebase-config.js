// ==========================================
// CONFIGURACIÓN DE FIREBASE (MODO REAL)
// ==========================================
// IMPORTANTE: La apiKey web de Firebase es pública por diseño en aplicaciones de cliente.
// La seguridad REAL del sistema se aplica mediante:
// 1. Reglas de seguridad de Firestore (firestore.rules) en el servidor.
// 2. Restricciones de HTTP Referer en Google Cloud Console para esta API Key (¡Acción manual requerida!).
// 3. Validación de Custom Claims (Roles) dentro de las Cloud Functions.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getAuth,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    sendPasswordResetEmail // Agregado para flujo seguro de recuperación/creación de claves
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    getFirestore,
    doc,
    getDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyAghXQKrYy6EJGD5IqEdO4c_E-ntozUmz8", // Recordá restringir esta key a tu dominio
    authDomain: "sistema-turnos-utn.firebaseapp.com",
    projectId: "sistema-turnos-utn",
    storageBucket: "sistema-turnos-utn.firebasestorage.app",
    messagingSenderId: "588893912264",
    appId: "1:588893912264:web:c5d56455f06cf178d979fd"
};

export const firebaseConfigurada = firebaseConfig.apiKey !== "PEGAR_API_KEY_ACA" && firebaseConfig.apiKey !== "";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// ==========================================
// LOGIN REAL CON FIREBASE AUTH
// ==========================================
// Las contraseñas viven hasheadas en los servidores de Google, nunca pasan por la BD de Firestore.
// El rol se lee del documento /usuarios/{uid} en Firestore (o idealmente de los Custom Claims).
export async function iniciarSesionFirebase(correo, password) {
    const credencial = await signInWithEmailAndPassword(auth, correo, password);
    const uid = credencial.user.uid;

    const perfilSnap = await getDoc(doc(db, "usuarios", uid));
    if (!perfilSnap.exists()) {
        await signOut(auth);
        throw new Error("SIN_PERFIL");
    }
    const perfil = perfilSnap.data();
    if (perfil.activo === false) {
        await signOut(auth);
        throw new Error("USUARIO_INACTIVO");
    }

    return {
        uid,
        correo: credencial.user.email,
        nombre: perfil.nombre || credencial.user.email,
        rol: perfil.rol || "Recepción"
    };
}

export async function cerrarSesionFirebase() {
    await signOut(auth);
}

// Restaura la sesión al recargar la página.
// callback(sesion) recibe null si no hay usuario autenticado.
export function observarSesion(callback) {
    return onAuthStateChanged(auth, async (user) => {
        if (!user) { callback(null); return; }
        try {
            const perfilSnap = await getDoc(doc(db, "usuarios", user.uid));
            if (!perfilSnap.exists() || perfilSnap.data().activo === false) {
                await signOut(auth);
                callback(null);
                return;
            }
            const perfil = perfilSnap.data();
            callback({
                uid: user.uid,
                correo: user.email,
                nombre: perfil.nombre || user.email,
                rol: perfil.rol || "Recepción"
            });
        } catch (e) {
            console.error("Error restaurando sesión:", e);
            callback(null);
        }
    });
}

// ==========================================
// RECUPERACIÓN / RESET DE CONTRASEÑA
// ==========================================
// Permite que el usuario defina su clave de forma segura, evitando que el admin la maneje en texto plano.
export async function enviarRecuperacionPass(correo) {
    await sendPasswordResetEmail(auth, correo);
}
