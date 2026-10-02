// ==========================================
// CONFIGURACIÓN DE FIREBASE (MODO REAL)
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getAuth,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    sendPasswordResetEmail,
    signInAnonymously
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    getFirestore,
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
    serverTimestamp,
    writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
    getFunctions,
    httpsCallable
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

const firebaseConfig = {
    apiKey: "AIzaSyAghXQKrYy6EJGD5IqEdO4c_E-ntozUmz8", // Restringir a tus dominios en GCP Console
    authDomain: "sistema-turnos-utn.firebaseapp.com",
    projectId: "sistema-turnos-utn",
    storageBucket: "sistema-turnos-utn.firebasestorage.app",
    messagingSenderId: "588893912264",
    appId: "1:588893912264:web:c5d56455f06cf178d979fd"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functionsInstancia = getFunctions(app);

// Exportar helpers de Firestore para evitar reimportaciones dispersas
export {
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
    serverTimestamp,
    writeBatch,
    httpsCallable,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    onAuthStateChanged,
    sendPasswordResetEmail,
    signInAnonymously
};

// ==========================================
// GESTIÓN DE SESIÓN CON CUSTOM CLAIMS
// ==========================================
export async function iniciarSesionFirebase(correoOUsername, password) {
    let correoFinal = correoOUsername.trim();
    if (!correoFinal.includes("@")) {
        const snap = await getDocs(query(collection(db, "usuarios"), where("username", "==", correoFinal)));
        if (!snap.empty) {
            correoFinal = snap.docs[0].data().correo;
        } else {
            throw new Error("USUARIO_NO_EXISTE");
        }
    }

    const credencial = await signInWithEmailAndPassword(auth, correoFinal, password);
    const user = credencial.user;

    // Obtener claims del token
    const tokenResult = await user.getIdTokenResult(true);
    let rol = tokenResult.claims.rol;

    // Fallback de rol desde Firestore y sincronización inicial si aplica
    let perfil = {};
    const perfilSnap = await getDoc(doc(db, "usuarios", user.uid));
    if (perfilSnap.exists()) {
        perfil = perfilSnap.data();
        if (perfil.activo === false) {
            await signOut(auth);
            throw new Error("USUARIO_INACTIVO");
        }
        if (!rol) {
            rol = perfil.rol;
            // Si el perfil en Firestore es admin y aún no tiene claim, asignarlo
            if (rol === "Administración") {
                try {
                    const fnAsignar = httpsCallable(functionsInstancia, "asignarRolAdminInicial");
                    await fnAsignar();
                    const refreshed = await user.getIdTokenResult(true);
                    rol = refreshed.claims.rol || rol;
                } catch (e) {
                    console.warn("No se pudo autoasignar claim inicial:", e);
                }
            }
        }
    }

    return {
        uid: user.uid,
        correo: user.email,
        nombre: perfil.nombre || user.displayName || user.email,
        rol: rol || perfil.rol || "Recepción"
    };
}

export async function cerrarSesionFirebase() {
    await signOut(auth);
}

export function observarSesion(callback) {
    return onAuthStateChanged(auth, async (user) => {
        if (!user || user.isAnonymous) {
            callback(null);
            return;
        }
        try {
            const tokenResult = await user.getIdTokenResult(false);
            let rol = tokenResult.claims.rol;

            const perfilSnap = await getDoc(doc(db, "usuarios", user.uid));
            let perfil = {};
            if (perfilSnap.exists()) {
                perfil = perfilSnap.data();
                if (perfil.activo === false) {
                    await signOut(auth);
                    callback(null);
                    return;
                }
                if (!rol) rol = perfil.rol;
            }

            callback({
                uid: user.uid,
                correo: user.email,
                nombre: perfil.nombre || user.displayName || user.email,
                rol: rol || "Recepción"
            });
        } catch (e) {
            console.error("Error al validar sesión:", e);
            callback(null);
        }
    });
}

export async function asegurarSesionAnonima() {
    if (!auth.currentUser) {
        try {
            await signInAnonymously(auth);
        } catch (e) {
            console.warn("Sesión anónima opcional no activada:", e);
        }
    }
}
