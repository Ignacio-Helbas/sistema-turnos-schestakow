// =============================================================================
// CAPA DE DATOS DESACOPLADA: MÓDULO DE INTERCONSULTAS MÉDICAS
// js/datos-interconsultas.js
// Aísla completamente el SDK de Firebase de la interfaz de usuario.
// =============================================================================

import {
    auth,
    db,
    collection,
    doc,
    getDoc,
    getDocs,
    addDoc,
    updateDoc,
    query,
    where,
    orderBy,
    onSnapshot,
    serverTimestamp,
    arrayUnion
} from "./firebase.js";

/**
 * Registra una acción trazable en la colección de auditoría del hospital.
 * Minimizando datos sensibles: no almacena contenidos clínicos de mensajes.
 */
export async function registrarAuditoria({ interconsultaId, accion, detalle = "" }) {
    try {
        const uid = auth.currentUser?.uid;
        if (!uid) return;

        await addDoc(collection(db, "auditoria"), {
            actorUid: uid,
            actorRol: "Médico",
            accion: accion,
            interconsultaId: interconsultaId,
            fecha: serverTimestamp(),
            detalle: detalle
        });
    } catch (e) {
        console.warn("Aviso de auditoría:", e.message);
    }
}

/**
 * Crea una nueva interconsulta confidencial entre el médico emisor y el colega receptor.
 * @param {Object} params
 * @param {string} params.idTurno
 * @param {string} params.codigoTurno
 * @param {string} params.asunto
 * @param {string} params.motivo
 * @param {string} params.especialidadDestino
 * @param {string} params.prioridad 'normal' | 'urgente'
 * @param {string} params.participanteDestinoUid
 * @returns {Promise<string>} ID de la interconsulta creada
 */
export async function crearInterconsulta({
    idTurno,
    codigoTurno,
    asunto,
    motivo,
    especialidadDestino,
    prioridad = "normal",
    participanteDestinoUid
}) {
    const user = auth.currentUser;
    if (!user) throw new Error("Debe contar con una sesión activa de médico.");

    const asuntoLimpio = (asunto || "").trim().slice(0, 120);
    const motivoLimpio = (motivo || "").trim().slice(0, 1000);
    if (!asuntoLimpio) throw new Error("El asunto de la interconsulta es obligatorio.");
    if (!motivoLimpio) throw new Error("El motivo clínico es obligatorio.");
    if (!participanteDestinoUid) throw new Error("Debe seleccionar un profesional de destino.");

    const participantes = Array.from(new Set([user.uid, participanteDestinoUid]));

    const nuevaData = {
        idTurno: String(idTurno || "").slice(0, 128),
        codigoTurno: String(codigoTurno || "SIN_CODIGO").slice(0, 64),
        asunto: asuntoLimpio,
        motivo: motivoLimpio,
        especialidadDestino: String(especialidadDestino || "General").slice(0, 100),
        prioridad: prioridad === "urgente" ? "urgente" : "normal",
        estado: "pendiente",
        creadaPor: user.uid,
        participantes: participantes,
        lecturas: {
            [user.uid]: serverTimestamp()
        },
        creadaEn: serverTimestamp(),
        actualizadaEn: serverTimestamp()
    };

    const docRef = await addDoc(collection(db, "interconsultas"), nuevaData);

    // Mensaje inicial del sistema para trazabilidad
    await addDoc(collection(db, "interconsultas", docRef.id, "mensajes"), {
        autorUid: user.uid,
        texto: `Interconsulta abierta por el profesional solicitante. Motivo: ${motivoLimpio}`,
        tipo: "sistema",
        creadoEn: serverTimestamp()
    });

    await registrarAuditoria({
        interconsultaId: docRef.id,
        accion: "creada",
        detalle: `Interconsulta ${docRef.id} solicitada hacia ${especialidadDestino}`
    });

    return docRef.id;
}

/**
 * Escucha en tiempo real las interconsultas en las que participa el usuario autenticado.
 * Incluye fallback defensivo si Firestore solicita creación de índice compuesto.
 * @param {string} uid
 * @param {Function} callback (listaInterconsultas)
 * @param {Function} onError
 * @returns {Function} unsubscribe
 */
export function escucharMisInterconsultas(uid, callback, onError) {
    if (!uid) return () => {};

    // 1. Intentar consulta ordenada por fecha de actualización
    const qConOrden = query(
        collection(db, "interconsultas"),
        where("participantes", "array-contains", uid),
        orderBy("actualizadaEn", "desc")
    );

    let unsubscribe = null;
    let fallbackActivo = false;

    const procesarSnapshot = (snap) => {
        const lista = [];
        snap.forEach((d) => {
            lista.push({
                id: d.id,
                ...d.data()
            });
        });

        // Ordenamiento seguro en memoria
        lista.sort((a, b) => {
            const timeA = a.actualizadaEn?.toMillis ? a.actualizadaEn.toMillis() : (a.actualizadaEn?.seconds ? a.actualizadaEn.seconds * 1000 : 0);
            const timeB = b.actualizadaEn?.toMillis ? b.actualizadaEn.toMillis() : (b.actualizadaEn?.seconds ? b.actualizadaEn.seconds * 1000 : 0);
            return timeB - timeA;
        });

        callback(lista);
    };

    unsubscribe = onSnapshot(
        qConOrden,
        procesarSnapshot,
        (err) => {
            // Si Firestore requiere índice compuesto (failed-precondition), activar fallback sin orden en el query
            if (!fallbackActivo && err.code === "failed-precondition") {
                console.warn("Aviso de índice compuesto Firestore en interconsultas. Aplicando fallback con orden en memoria:", err.message);
                fallbackActivo = true;
                const qFallback = query(
                    collection(db, "interconsultas"),
                    where("participantes", "array-contains", uid)
                );
                unsubscribe = onSnapshot(qFallback, procesarSnapshot, (errFallback) => {
                    if (onError) onError(errFallback);
                });
                return;
            }

            if (onError) onError(err);
        }
    );

    return () => {
        if (typeof unsubscribe === "function") unsubscribe();
    };
}

/**
 * Escucha en tiempo real los mensajes de una interconsulta específica.
 * @param {string} interconsultaId
 * @param {Function} callback (listaMensajes)
 * @param {Function} onError
 * @returns {Function} unsubscribe
 */
export function escucharMensajes(interconsultaId, callback, onError) {
    if (!interconsultaId) return () => {};

    const q = query(
        collection(db, "interconsultas", interconsultaId, "mensajes"),
        orderBy("creadoEn", "asc")
    );

    return onSnapshot(
        q,
        (snap) => {
            const lista = [];
            snap.forEach((d) => {
                lista.push({
                    id: d.id,
                    ...d.data()
                });
            });
            callback(lista);
        },
        (err) => {
            if (onError) onError(err);
        }
    );
}

/**
 * Envía un mensaje en la conversación de la interconsulta y actualiza el timestamp de la conversación.
 * @param {Object} params
 * @param {string} params.interconsultaId
 * @param {string} params.texto
 * @param {string} [params.tipo='mensaje'] 'mensaje' | 'sistema'
 * @returns {Promise<string>} ID del mensaje enviado
 */
export async function enviarMensaje({ interconsultaId, texto, tipo = "mensaje" }) {
    const user = auth.currentUser;
    if (!user) throw new Error("Sesión no iniciada.");

    const textoLimpio = (texto || "").trim().slice(0, 2000);
    if (!textoLimpio) throw new Error("El mensaje no puede estar vacío.");

    // 1. Guardar mensaje inmutable en subcolección
    const msgRef = await addDoc(
        collection(db, "interconsultas", interconsultaId, "mensajes"),
        {
            autorUid: user.uid,
            texto: textoLimpio,
            tipo: tipo === "sistema" ? "sistema" : "mensaje",
            creadoEn: serverTimestamp()
        }
    );

    // 2. Actualizar conversación (última actividad y lectura propia)
    const icRef = doc(db, "interconsultas", interconsultaId);
    await updateDoc(icRef, {
        actualizadaEn: serverTimestamp(),
        [`lecturas.${user.uid}`]: serverTimestamp(),
        // Si estaba pendiente y responde el colega, pasa a en_curso automáticamente
        estado: "en_curso"
    });

    return msgRef.id;
}

/**
 * Cambia el estado de una interconsulta (pendiente, en_curso, respondida, cerrada).
 * @param {Object} params
 * @param {string} params.interconsultaId
 * @param {string} params.nuevoEstado
 * @returns {Promise<void>}
 */
export async function cambiarEstado({ interconsultaId, nuevoEstado }) {
    const user = auth.currentUser;
    if (!user) throw new Error("Sesión no iniciada.");

    const estadosValidos = ["pendiente", "en_curso", "respondida", "cerrada"];
    if (!estadosValidos.includes(nuevoEstado)) {
        throw new Error("Estado de interconsulta inválido.");
    }

    const icRef = doc(db, "interconsultas", interconsultaId);
    await updateDoc(icRef, {
        estado: nuevoEstado,
        actualizadaEn: serverTimestamp(),
        [`lecturas.${user.uid}`]: serverTimestamp()
    });

    // Mensaje de sistema en la conversación
    await addDoc(collection(db, "interconsultas", interconsultaId, "mensajes"), {
        autorUid: user.uid,
        texto: `Estado de la interconsulta actualizado a: ${nuevoEstado.toUpperCase().replace("_", " ")}`,
        tipo: "sistema",
        creadoEn: serverTimestamp()
    });

    await registrarAuditoria({
        interconsultaId: interconsultaId,
        accion: nuevoEstado === "cerrada" ? "cerrada" : "estado_cambiado",
        detalle: `Estado modificado a ${nuevoEstado}`
    });
}

/**
 * Agrega a un nuevo médico participante a la interconsulta existente.
 * @param {Object} params
 * @param {string} params.interconsultaId
 * @param {string} params.nuevoColegaUid
 * @param {string} [params.nombreColega]
 * @returns {Promise<void>}
 */
export async function agregarParticipante({ interconsultaId, nuevoColegaUid, nombreColega = "colega" }) {
    const user = auth.currentUser;
    if (!user) throw new Error("Sesión no iniciada.");
    if (!nuevoColegaUid) throw new Error("UID de colega requerido.");

    const icRef = doc(db, "interconsultas", interconsultaId);
    await updateDoc(icRef, {
        participantes: arrayUnion(nuevoColegaUid),
        actualizadaEn: serverTimestamp(),
        [`lecturas.${user.uid}`]: serverTimestamp()
    });

    await addDoc(collection(db, "interconsultas", interconsultaId, "mensajes"), {
        autorUid: user.uid,
        texto: `Se incorporó al profesional ${nombreColega} a la interconsulta.`,
        tipo: "sistema",
        creadoEn: serverTimestamp()
    });

    await registrarAuditoria({
        interconsultaId: interconsultaId,
        accion: "participante_agregado",
        detalle: `Se incorporó al médico UID: ${nuevoColegaUid}`
    });
}

/**
 * Marca la interconsulta como leída para el usuario en sesión actualizando lecturas[uid].
 * @param {Object} params
 * @param {string} params.interconsultaId
 * @param {string} params.uid
 * @returns {Promise<void>}
 */
export async function marcarComoLeida({ interconsultaId, uid }) {
    if (!interconsultaId || !uid) return;
    try {
        const icRef = doc(db, "interconsultas", interconsultaId);
        await updateDoc(icRef, {
            [`lecturas.${uid}`]: serverTimestamp()
        });
    } catch (_) {}
}

/**
 * Obtiene el catálogo de profesionales médicos disponibles para interconsultas.
 * Lee desde medicos_publicos o usuarios/{uid}.
 * @returns {Promise<Array<{uid: string, nombre: string, especialidad: string}>>}
 */
export async function obtenerColegasMedicosDisponibles() {
    const colegas = [];
    try {
        // Consultar medicos_publicos
        const snapPub = await getDocs(query(collection(db, "medicos_publicos"), where("activo", "==", true)));
        if (!snapPub.empty) {
            snapPub.forEach((d) => {
                const data = d.data();
                colegas.push({
                    uid: data.medicoUid || d.id,
                    nombre: data.nombre || "Profesional de Salud",
                    especialidad: data.especialidad || "Clínica Médica"
                });
            });
            return colegas;
        }

        // Fallback: usuarios con rol Médico
        const snapUsers = await getDocs(query(collection(db, "usuarios"), where("rol", "==", "Médico")));
        snapUsers.forEach((d) => {
            const data = d.data();
            if (data.activo !== false) {
                colegas.push({
                    uid: d.id,
                    nombre: data.nombre || data.correo || "Profesional de Salud",
                    especialidad: data.especialidad || "Clínica Médica"
                });
            }
        });
    } catch (e) {
        console.warn("Aviso al consultar colegas:", e.message);
    }
    return colegas;
}

/**
 * Obtiene los datos oficiales de un profesional médico desde su documento en usuarios/{uid}.
 * No confía en datos que el cliente pueda falsificar.
 * @param {string} uid
 * @returns {Promise<{nombre: string, especialidad: string}>}
 */
export async function obtenerDatosOficialesMedico(uid) {
    if (!uid) return { nombre: "Profesional", especialidad: "Medicina" };
    try {
        const snap = await getDoc(doc(db, "usuarios", uid));
        if (snap.exists()) {
            const d = snap.data();
            return {
                nombre: d.nombre || d.correo || "Profesional",
                especialidad: d.especialidad || "Clínica Médica"
            };
        }
    } catch (_) {}
    return { nombre: "Profesional", especialidad: "Medicina" };
}
