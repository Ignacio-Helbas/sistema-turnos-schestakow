// ==========================================
// CONFIGURACIÓN DE FIREBASE (MODO REAL)
// ==========================================
// La apiKey web de Firebase es pública por diseño: la seguridad real
// la aplican las Reglas de Firestore en el servidor, no esta clave.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getAuth,
    signInWithEmailAndPassword,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    getFirestore,
    doc,
    getDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "PEGAR_API_KEY_ACA",
    authDomain: "sistema-turnos-utn.firebaseapp.com",
    projectId: "sistema-turnos-utn",
    storageBucket: "sistema-turnos-utn.firebasestorage.app",
    messagingSenderId: "588893912264",
    appId: "1:588893912264:web:c5d56455f06cf178d979fd"
};

export const firebaseConfigurada = firebaseConfig.apiKey !== "PEGAR_API_KEY_ACA";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// ==========================================
// LOGIN REAL CON FIREBASE AUTH
// ==========================================
// Las contraseñas viven hasheadas en los servidores de Google.
// El rol se lee del documento /usuarios/{uid} en Firestore,
// que solo un administrador puede modificar (lo garantizan las reglas).
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
