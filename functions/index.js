/**



 * Cloud Functions para Sistema de Turnos - Hospital Teodoro J. Schestakow



 * Proyecto Firebase: sistema-turnos-utn



 */







const functions = require("firebase-functions");



const admin = require("firebase-admin");



const https = require("https");







admin.initializeApp();



const db = admin.firestore();







// ----------------------------------------------------



// Helpers de Validación y Sanitización



// ----------------------------------------------------



function sanitizarTexto(texto) {



    if (typeof texto !== "string") return "";



    return texto.trim().replace(/<[^>]*>?/gm, "");



}







function validarDni(dni) {



    return typeof dni === "string" && /^[0-9]{6,10}$/.test(dni.trim());



}







function validarCelular(cel) {



    return typeof cel === "string" && /^[0-9+ -]{6,20}$/.test(cel.trim());



}







function validarEmail(email) {



    if (!email) return true; // email opcional



    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;



    return re.test(email.trim());



}







function generarCodigoConfirmacion() {



    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";



    let code = "";



    for (let i = 0; i < 8; i++) {



        code += chars.charAt(Math.floor(Math.random() * chars.length));



    }



    return code;



}







// ----------------------------------------------------



// 1. crearTurnoPublico



// Callable para que pacientes (anónimos o autenticados) reserven turno



// Utiliza transacción para evitar turnos duplicados (Race condition)



// ----------------------------------------------------



exports.crearTurnoPublico = functions.https.onCall(async (data, context) => {



    const especialidad = sanitizarTexto(data.especialidad);



    const medico = sanitizarTexto(data.medico);



    const fecha = sanitizarTexto(data.fecha);



    const horario = sanitizarTexto(data.horario);



    const pacienteNombre = sanitizarTexto(data.pacienteNombre);



    const pacienteDni = sanitizarTexto(data.pacienteDni);



    const pacienteCelular = sanitizarTexto(data.pacienteCelular);



    const pacienteEmail = sanitizarTexto(data.pacienteEmail);







    if (!especialidad || !medico || !fecha || !horario) {



        throw new functions.https.HttpsError(



            "invalid-argument",



            "Especialidad, médico, fecha y horario son obligatorios."



        );



    }







    if (!pacienteNombre || !validarDni(pacienteDni) || !validarCelular(pacienteCelular)) {



        throw new functions.https.HttpsError(



            "invalid-argument",



            "Datos del paciente inválidos. Verifique nombre, DNI numérico y celular."



        );



    }







    if (pacienteEmail && !validarEmail(pacienteEmail)) {



        throw new functions.https.HttpsError(



            "invalid-argument",



            "El formato del correo electrónico es inválido."



        );



    }







    // Validar que la fecha sea de lunes a viernes y no anterior a hoy



    const fechaObj = new Date(fecha + "T00:00:00");



    const diaSemana = fechaObj.getDay(); // 0 domingo, 6 sábado



    if (diaSemana === 0 || diaSemana === 6) {



        throw new functions.https.HttpsError(



            "invalid-argument",



            "Los turnos se otorgan únicamente de lunes a viernes."



        );



    }







    const hoyStr = new Date().toISOString().split("T")[0];



    if (fecha < hoyStr) {



        throw new functions.https.HttpsError(



            "invalid-argument",



            "No es posible reservar turnos en fechas pasadas."



        );



    }







    const codigoConfirmacion = generarCodigoConfirmacion();



    const pacienteUid = context.auth ? context.auth.uid : "anonimo";







    const turnoRef = db.collection("turnos").doc();







    // Transacción para garantizar que no exista turno previo no cancelado



    await db.runTransaction(async (transaction) => {



        const queryExistente = db.collection("turnos")



            .where("medico", "==", medico)



            .where("fecha", "==", fecha)



            .where("horario", "==", horario);







        const snapshotExistente = await transaction.get(queryExistente);







        const ocupado = snapshotExistente.docs.some(docSnap => {



            const t = docSnap.data();



            return !t.estado || !t.estado.toLowerCase().includes("cancelado");



        });







        if (ocupado) {



            throw new functions.https.HttpsError(



                "already-exists",



                "El horario seleccionado ya no se encuentra disponible. Por favor elija otro."



            );



        }







        transaction.set(turnoRef, {



            especialidad,



            medico,



            fecha,



            horario,



            pacienteNombre,



            pacienteDni,



            pacienteCelular,



            pacienteEmail: pacienteEmail || "",



            codigoConfirmacion,



            canal: "Web",



            estado: "Confirmado",



            pacienteUid,



            creadoEn: admin.firestore.FieldValue.serverTimestamp()



        });



    });







    return {



        success: true,



        id: turnoRef.id,



        codigo: codigoConfirmacion



    };



});







// ----------------------------------------------------



// 2. buscarTurnoPorCodigo



// Permite a los pacientes consultar su turno usando su DNI y código secreto



// ----------------------------------------------------



exports.buscarTurnoPorCodigo = functions.https.onCall(async (data, context) => {



    const dni = sanitizarTexto(data.dni);



    const codigo = sanitizarTexto(data.codigo).toUpperCase();







    if (!validarDni(dni) || !codigo) {



        throw new functions.https.HttpsError(



            "invalid-argument",



            "DNI y código de confirmación son requeridos."



        );



    }







    const snap = await db.collection("turnos")



        .where("pacienteDni", "==", dni)



        .where("codigoConfirmacion", "==", codigo)



        .limit(1)



        .get();







    if (snap.empty) {



        throw new functions.https.HttpsError(



            "not-found",



            "No se encontró ningún turno activo con ese DNI y código de confirmación."



        );



    }







    const docTurno = snap.docs[0];



    const t = docTurno.data();







    return {



        success: true,



        turno: {



            id: docTurno.id,



            especialidad: t.especialidad,



            medico: t.medico,



            fecha: t.fecha,



            horario: t.horario,



            pacienteNombre: t.pacienteNombre,



            pacienteEmail: t.pacienteEmail || "",



            estado: t.estado || "Confirmado"



        }



    };



});







// ----------------------------------------------------



// 3. cancelarTurnoConCodigo



// Permite al paciente cancelar su turno validando el código de confirmación



// ----------------------------------------------------



exports.cancelarTurnoConCodigo = functions.https.onCall(async (data, context) => {



    const id = sanitizarTexto(data.id);



    const codigo = sanitizarTexto(data.codigo).toUpperCase();







    if (!id || !codigo) {



        throw new functions.https.HttpsError(



            "invalid-argument",



            "ID de turno y código de confirmación son obligatorios."



        );



    }







    const turnoRef = db.collection("turnos").doc(id);



    const snap = await turnoRef.get();







    if (!snap.exists) {



        throw new functions.https.HttpsError("not-found", "El turno no existe.");



    }







    const t = snap.data();



    if (t.codigoConfirmacion !== codigo) {



        throw new functions.https.HttpsError("permission-denied", "Código de confirmación inválido.");



    }







    if (t.estado && t.estado.toLowerCase().includes("cancelado")) {



        throw new functions.https.HttpsError("failed-precondition", "El turno ya se encuentra cancelado.");



    }







    if (t.estado === "Atendido" || t.estado === "Ausente") {



        throw new functions.https.HttpsError(



            "failed-precondition",



            `No es posible cancelar un turno con estado: ${t.estado}`



        );



    }







    await turnoRef.update({



        estado: "Cancelado por Paciente",



        canceladoEn: admin.firestore.FieldValue.serverTimestamp()



    });







    return {



        success: true,



        turno: {



            id: snap.id,



            especialidad: t.especialidad,



            medico: t.medico,



            fecha: t.fecha,



            horario: t.horario,



            pacienteNombre: t.pacienteNombre,



            pacienteEmail: t.pacienteEmail || ""



        }



    };



});







// ----------------------------------------------------



// 4. guardarUsuarioAdmin



// Solo ejecutable por usuarios con rol 'Administración'



// Crea o actualiza usuarios en Firebase Auth y Firestore, y sincroniza Custom Claims



// ----------------------------------------------------



exports.guardarUsuarioAdmin = functions.https.onCall(async (data, context) => {



    if (!context.auth) {



        throw new functions.https.HttpsError("unauthenticated", "Debe iniciar sesión.");



    }







    const rolToken = context.auth.token.rol;



    if (rolToken !== "Administración") {



        // Verificar fallback si es el primer usuario creador en Firestore



        const adminCheck = await db.collection("usuarios").doc(context.auth.uid).get();



        if (!adminCheck.exists || adminCheck.data().rol !== "Administración") {



            throw new functions.https.HttpsError("permission-denied", "Requiere rol de Administración.");



        }



    }







    const id = sanitizarTexto(data.id);



    const nombre = sanitizarTexto(data.nombre);



    const rol = sanitizarTexto(data.rol);



    const username = sanitizarTexto(data.username);



    const password = data.password ? String(data.password) : null;



    const correo = sanitizarTexto(data.correo);



    const tel = sanitizarTexto(data.tel);



    const matricula = sanitizarTexto(data.matricula);



    const especialidad = sanitizarTexto(data.especialidad);







    const rolesValidos = ["Administración", "Recepción", "Médico", "Enfermería", "Recepcionista", "Administrativo"];

    const PERMISOS_VALIDOS = ["coordinaQuirofano", "anestesia", "instrumentacion", "internacion"];
    const permisosAdicionales = Array.isArray(data.permisosAdicionales)
        ? data.permisosAdicionales.filter(p => typeof p === "string" && PERMISOS_VALIDOS.includes(p.trim()))
        : [];



    if (!rolesValidos.includes(rol)) {



        throw new functions.https.HttpsError("invalid-argument", "Rol no permitido.");



    }







    let uid = id;







    if (!uid) {



        // Crear usuario nuevo en Firebase Auth



        if (!correo || !password || password.length < 12) {



            throw new functions.https.HttpsError(



                "invalid-argument",



                "Correo y contraseña de al menos 12 caracteres son requeridos para nuevos usuarios."



            );



        }







        const userRecord = await admin.auth().createUser({



            email: correo,



            password: password,



            displayName: nombre,



            disabled: false



        });



        uid = userRecord.uid;



    } else {



        // Actualizar usuario existente en Auth si se envió password



        const updateData = {};



        if (correo) updateData.email = correo;



        if (nombre) updateData.displayName = nombre;



        if (password) {



            if (password.length < 12) {



                throw new functions.https.HttpsError(



                    "invalid-argument",



                    "La nueva contraseña debe tener al menos 12 caracteres."



                );



            }



            updateData.password = password;



        }



        if (Object.keys(updateData).length > 0) {



            await admin.auth().updateUser(uid, updateData);



        }



    }







    // Asignar Custom Claim de rol en Firebase Auth



    await admin.auth().setCustomUserClaims(uid, {
        rol: rol,
        permisosAdicionales: permisosAdicionales
    });







    // Guardar o actualizar en Firestore



    const userDocRef = db.collection("usuarios").doc(uid);



    const payloadFirestore = {
        nombre,
        rol,
        permisosAdicionales,



        username,



        correo,



        tel,



        matricula: rol === "Médico" ? matricula : "",



        especialidad: rol === "Médico" ? especialidad : "",



        activo: true,



        actualizadoEn: admin.firestore.FieldValue.serverTimestamp()



    };







    if (!id) {



        payloadFirestore.creadoEn = admin.firestore.FieldValue.serverTimestamp();



    }







    await userDocRef.set(payloadFirestore, { merge: true });







    return {



        success: true,



        uid: uid,



        mensaje: id ? "Usuario actualizado correctamente." : "Usuario creado correctamente."



    };



});







// ----------------------------------------------------



// 5. limpiarBaseDeDatos



// Función de reset protegida exclusivamente para Administración



// ----------------------------------------------------



exports.limpiarBaseDeDatos = functions.https.onCall(async (data, context) => {



    if (!context.auth) {



        throw new functions.https.HttpsError("unauthenticated", "Debe iniciar sesión.");



    }



    if (context.auth.token.rol !== "Administración") {



        const callerDoc = await db.collection("usuarios").doc(context.auth.uid).get();



        if (!callerDoc.exists || callerDoc.data().rol !== "Administración") {



            throw new functions.https.HttpsError("permission-denied", "Solo administradores pueden ejecutar esta acción.");



        }



    }







    if (data.confirmacion !== "BORRAR") {



        throw new functions.https.HttpsError("invalid-argument", "Palabra de confirmación incorrecta.");



    }







    // 1. Borrar turnos en lotes



    const turnosSnap = await db.collection("turnos").get();



    const batchTurnos = db.batch();



    turnosSnap.docs.forEach(docSnap => batchTurnos.delete(docSnap.ref));



    await batchTurnos.commit();







    // 2. Borrar usuarios de prueba preservando al administrador que ejecuta la acción



    const usuariosSnap = await db.collection("usuarios").get();



    const batchUsuarios = db.batch();



    usuariosSnap.docs.forEach(docSnap => {



        if (docSnap.id !== context.auth.uid) {



            batchUsuarios.delete(docSnap.ref);



        }



    });



    await batchUsuarios.commit();







    return { success: true, mensaje: "Base de datos restaurada al estado de fábrica." };



});







// ----------------------------------------------------



// 6. inyectarMedicosDePrueba



// Función callable protegida para cargar médicos demostrativos



// ----------------------------------------------------



exports.inyectarMedicosDePrueba = functions.https.onCall(async (data, context) => {



    if (!context.auth) {



        throw new functions.https.HttpsError("unauthenticated", "Debe iniciar sesión.");



    }



    if (context.auth.token.rol !== "Administración") {



        const callerDoc = await db.collection("usuarios").doc(context.auth.uid).get();



        if (!callerDoc.exists || callerDoc.data().rol !== "Administración") {



            throw new functions.https.HttpsError("permission-denied", "Solo administradores pueden inyectar datos.");



        }



    }







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







    const batch = db.batch();



    for (const med of medicosDemo) {



        const docRef = db.collection("usuarios").doc();



        const baseUser = med.nom.split(" ")[1].toLowerCase();



        batch.set(docRef, {



            nombre: med.nom,



            rol: "Médico",



            username: baseUser + Math.floor(Math.random() * 1000),



            correo: baseUser + "@hospital.demo",



            tel: "2604000000",



            matricula: med.mat,



            especialidad: med.esp,



            activo: true,



            esDummy: true,



            creadoEn: admin.firestore.FieldValue.serverTimestamp()



        });



    }



    await batch.commit();







    return { success: true, count: medicosDemo.length, mensaje: "Médicos inyectados correctamente." };



});







// ----------------------------------------------------



// 7. asignarRolAdminInicial



// Permite reclamar el rol de administrador inicial si no existen administradores con custom claims



// ----------------------------------------------------



exports.asignarRolAdminInicial = functions.https.onCall(async (data, context) => {



    if (!context.auth) {



        throw new functions.https.HttpsError("unauthenticated", "Debe iniciar sesión para inicializar credenciales.");



    }







    const uid = context.auth.uid;



    const userDoc = await db.collection("usuarios").doc(uid).get();







    // Solo se permite si el perfil en Firestore tiene rol 'Administración' o si no hay ningún usuario activo aún



    const esAdminEnFirestore = userDoc.exists && userDoc.data().rol === "Administración";



    const totalUsuariosSnap = await db.collection("usuarios").limit(2).get();







    if (esAdminEnFirestore || totalUsuariosSnap.empty) {



        await admin.auth().setCustomUserClaims(uid, { rol: "Administración", permisosAdicionales: [] });



        if (!userDoc.exists) {



            await db.collection("usuarios").doc(uid).set({



                nombre: context.auth.token.name || context.auth.token.email || "Administrador Inicial",



                correo: context.auth.token.email || "",



                rol: "Administración",



                activo: true,



                creadoEn: admin.firestore.FieldValue.serverTimestamp()



            });



        }



        return { success: true, mensaje: "Custom Claims de Administración asignados con éxito." };



    }







    throw new functions.https.HttpsError("permission-denied", "No está autorizado a autoproclamarse administrador.");



});







// ----------------------------------------------------



// 8. enviarNotificacionTurno



// Cloud Function intermediaria para despacho seguro de notificaciones (EmailJS)



// Protege las credenciales de servicio en el backend, sin exponerlas al cliente



// ----------------------------------------------------



function despacharEmailJS(payload) {



    return new Promise((resolve, reject) => {



        const bodyStr = JSON.stringify(payload);



        const options = {



            hostname: "api.emailjs.com",



            port: 443,



            path: "/api/v1.0/email/send",



            method: "POST",



            headers: {



                "Content-Type": "application/json",



                "Content-Length": Buffer.byteLength(bodyStr),



                "User-Agent": "Hospital-Schestakow-Backend/1.0"



            }



        };







        const req = https.request(options, (res) => {



            let resData = "";



            res.on("data", chunk => { resData += chunk; });



            res.on("end", () => {



                if (res.statusCode >= 200 && res.statusCode < 300) {



                    resolve({ status: res.statusCode, body: resData });



                } else {



                    reject(new Error(`EmailJS API respondió con estado ${res.statusCode}: ${resData}`));



                }



            });



        });







        req.on("error", (err) => {



            reject(err);



        });







        req.setTimeout(10000, () => {



            req.destroy(new Error("Timeout al contactar EmailJS API"));



        });







        req.write(bodyStr);



        req.end();



    });



}







exports.enviarNotificacionTurno = functions.https.onCall(async (data, context) => {



    const templateId = sanitizarTexto(data && data.templateId);



    const params = (data && data.templateParams) || {};







    const templatesValidos = ["template_confirmacion", "template_cancelacion"];



    if (!templatesValidos.includes(templateId)) {



        throw new functions.https.HttpsError("invalid-argument", "Plantilla de notificación no permitida.");



    }







    const emailDestino = sanitizarTexto(params.email_destino);



    if (!emailDestino || !validarEmail(emailDestino)) {



        throw new functions.https.HttpsError("invalid-argument", "Dirección de correo destino inválida.");



    }







    const serviceId = process.env.EMAILJS_SERVICE_ID || "service_xitx594";



    const publicKey = process.env.EMAILJS_PUBLIC_KEY || "eXBPLCSkZcKDBBz9h";



    const privateKey = process.env.EMAILJS_PRIVATE_KEY || "";







    const payload = {



        service_id: serviceId,



        template_id: templateId,



        user_id: publicKey,



        template_params: {



            email_destino: emailDestino,



            nombre_paciente: sanitizarTexto(params.nombre_paciente),



            especialidad: sanitizarTexto(params.especialidad),



            medico: sanitizarTexto(params.medico),



            fecha: sanitizarTexto(params.fecha),



            horario: sanitizarTexto(params.horario),



            codigo_confirmacion: sanitizarTexto(params.codigo_confirmacion || params.codigo_turno || params.codigo || "")



        }



    };







    if (privateKey) {



        payload.accessToken = privateKey;



    }







    try {



        await despacharEmailJS(payload);



        return { success: true, mensaje: "Notificación enviada exitosamente." };



    } catch (err) {



        functions.logger.error("Error despachando notificación EmailJS:", err.message);



        throw new functions.https.HttpsError("internal", "No se pudo despachar el correo de notificación.");



    }



});





// ----------------------------------------------------
// 12. reservarQuirofano
// Callable para registrar reservas de quirófano con verificación transaccional anti-colisión
// ----------------------------------------------------

function convertirHoraAMinutos(horaStr) {
    if (!horaStr || typeof horaStr !== "string" || !horaStr.includes(":")) return 0;
    const [h, m] = horaStr.split(":").map(Number);
    return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

function haySuperposicionHorarios(hInicio1, hFin1, hInicio2, hFin2) {
    const ini1 = convertirHoraAMinutos(hInicio1);
    const fin1 = convertirHoraAMinutos(hFin1);
    const ini2 = convertirHoraAMinutos(hInicio2);
    const fin2 = convertirHoraAMinutos(hFin2);
    return !(fin1 <= ini2 || ini1 >= fin2);
}

async function procesarReservaQuirofano(data, context, firestoreDb) {
    if (!context || !context.auth) {
        throw new functions.https.HttpsError(
            "unauthenticated",
            "Debe estar autenticado para registrar una reserva de quirófano."
        );
    }

    const token = context.auth.token || {};
    const rol = token.rol || "";
    const permisos = Array.isArray(token.permisosAdicionales) ? token.permisosAdicionales : [];

    const esAdmin = rol === "Administración";
    const esRecepcion = rol === "Recepción" || rol === "Recepcionista";
    const esCoordinador = permisos.includes("coordinaQuirofano");
    const esMedico = rol === "Médico" || rol === "Medico";
    const esAnestesia = permisos.includes("anestesia");

    const puedeConfirmar = esAdmin || esRecepcion || esCoordinador || (esMedico && esAnestesia);
    const puedeReservar = puedeConfirmar || esMedico || esAnestesia;

    if (!puedeReservar) {
        throw new functions.https.HttpsError(
            "permission-denied",
            "No cuenta con permisos habilitados para reservar quirófanos."
        );
    }

    const quirofanoId = sanitizarTexto(data.quirofanoId);
    const quirofanoNombre = sanitizarTexto(data.quirofanoNombre);
    const fecha = sanitizarTexto(data.fecha);
    const horaInicio = sanitizarTexto(data.horaInicio);
    const horaFin = sanitizarTexto(data.horaFin);
    const duracionMinutos = parseInt(data.duracionMinutos, 10);
    const pacienteNombre = sanitizarTexto(data.pacienteNombre);
    const pacienteDni = sanitizarTexto(data.pacienteDni);
    const cirujanoNombre = sanitizarTexto(data.cirujanoNombre);
    const cirujanoUid = data.cirujanoUid ? sanitizarTexto(data.cirujanoUid) : null;
    const especialidad = sanitizarTexto(data.especialidad || "");
    const procedimiento = sanitizarTexto(data.procedimiento);
    const tipoAnestesia = sanitizarTexto(data.tipoAnestesia || "");
    const observaciones = sanitizarTexto(data.observaciones || "");

    if (!quirofanoId || !quirofanoNombre || !fecha || !horaInicio || !horaFin || !duracionMinutos || !pacienteNombre || !pacienteDni || !cirujanoNombre || !procedimiento) {
        throw new functions.https.HttpsError(
            "invalid-argument",
            "Faltan campos obligatorios para registrar la reserva de quirófano."
        );
    }

    if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(fecha)) {
        throw new functions.https.HttpsError("invalid-argument", "Formato de fecha inválido (debe ser YYYY-MM-DD).");
    }

    if (!/^[0-9]{2}:[0-9]{2}$/.test(horaInicio) || !/^[0-9]{2}:[0-9]{2}$/.test(horaFin)) {
        throw new functions.https.HttpsError("invalid-argument", "Formato de horario inválido (debe ser HH:mm).");
    }

    if (!validarDni(pacienteDni)) {
        throw new functions.https.HttpsError("invalid-argument", "El DNI del paciente debe contener entre 6 y 10 dígitos numéricos.");
    }

    const minInicio = convertirHoraAMinutos(horaInicio);
    const minFin = convertirHoraAMinutos(horaFin);
    if (minInicio >= minFin) {
        throw new functions.https.HttpsError("invalid-argument", "La hora de inicio debe ser anterior a la hora de finalización.");
    }

    let estado = (data.estado === "confirmado" && puedeConfirmar) ? "confirmado" : "reservado";

    return await firestoreDb.runTransaction(async (transaction) => {
        const reservasCol = firestoreDb.collection("reservas_quirofano");
        const queryRef = reservasCol
            .where("quirofanoId", "==", quirofanoId)
            .where("fecha", "==", fecha);

        // Lectura estrictamente transaccional: propaga cualquier fallo de consulta atómica
        const querySnapshot = await transaction.get(queryRef);

        for (const docSnap of querySnapshot.docs) {
            const reserva = docSnap.data();
            if (reserva.estado === "cancelado") continue;

            if (haySuperposicionHorarios(horaInicio, horaFin, reserva.horaInicio, reserva.horaFin)) {
                throw new functions.https.HttpsError(
                    "already-exists",
                    `El quirófano ya está reservado en ese horario (${reserva.horaInicio} - ${reserva.horaFin} por ${reserva.cirujanoNombre || "otro profesional"}).`
                );
            }
        }

        const nuevaReservaRef = reservasCol.doc();
        const nuevaReserva = {
            quirofanoId,
            quirofanoNombre,
            fecha,
            horaInicio,
            horaFin,
            duracionMinutos,
            pacienteNombre,
            pacienteDni,
            cirujanoNombre,
            cirujanoUid: cirujanoUid || context.auth.uid,
            especialidad,
            procedimiento,
            tipoAnestesia,
            observaciones,
            estado,
            creadoPor: {
                uid: context.auth.uid,
                nombre: token.name || token.email || "Personal Hospital",
                rol: rol,
                email: token.email || ""
            },
            creadoEn: admin.firestore.FieldValue.serverTimestamp(),
            actualizadoEn: admin.firestore.FieldValue.serverTimestamp()
        };

        transaction.set(nuevaReservaRef, nuevaReserva);

        return {
            id: nuevaReservaRef.id,
            ...nuevaReserva,
            mensaje: "Reserva de quirófano registrada exitosamente."
        };
    });
}

exports.reservarQuirofano = functions.https.onCall(async (data, context) => {
    return await procesarReservaQuirofano(data, context, db);
});

exports.procesarReservaQuirofano = procesarReservaQuirofano;

// ----------------------------------------------------
// 8. administrarUsuarioStaff
// Callable de administración de personal: sincronización de claims
// y eliminación / rollback de cuentas en Firebase Auth.
// ----------------------------------------------------

async function procesarAdministrarUsuarioStaff(data, context, authAdmin, firestoreDb) {
    if (!context || !context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "Debe iniciar sesión para administrar personal.");
    }

    const rolToken = context.auth.token ? context.auth.token.rol : null;
    if (rolToken !== "Administración") {
        const adminCheck = await firestoreDb.collection("usuarios").doc(context.auth.uid).get();
        if (!adminCheck.exists || adminCheck.data().rol !== "Administración") {
            throw new functions.https.HttpsError("permission-denied", "Requiere rol de Administración para esta operación.");
        }
    }

    const uid = sanitizarTexto(data.id || data.uid);
    if (!uid) {
        throw new functions.https.HttpsError("invalid-argument", "El UID o ID del usuario es obligatorio.");
    }

    // Rama 1: Rollback o eliminación directa de la cuenta de Firebase Auth
    // IMPORTANTE: Opera exclusivamente contra Firebase Auth usando el UID.
    // NO requiere ni depende de que exista un documento previo en Firestore,
    // garantizando que el rollback tras un fallo en setDoc() funcione siempre.
    if (data.eliminar === true) {
        try {
            await authAdmin.deleteUser(uid);
        } catch (authErr) {
            // Si la cuenta ya no existe en Auth (idempotencia), se considera exitoso el rollback
            if (authErr.code !== "auth/user-not-found") {
                console.error("Error al eliminar usuario en Firebase Auth:", authErr);
                throw new functions.https.HttpsError("internal", "No se pudo eliminar la cuenta de Authentication: " + authErr.message);
            }
        }

        return {
            success: true,
            mensaje: "Cuenta de Authentication eliminada correctamente (rollback completado)."
        };
    }

    // Rama 2: Sincronización de Custom Claims (rol y permisos adicionales)
    const rol = sanitizarTexto(data.rol);
    const PERMISOS_VALIDOS = ["coordinaQuirofano", "anestesia", "instrumentacion", "internacion"];
    const permisosAdicionales = Array.isArray(data.permisosAdicionales)
        ? data.permisosAdicionales.filter(p => typeof p === "string" && PERMISOS_VALIDOS.includes(p.trim()))
        : [];

    const claims = {};
    if (rol) claims.rol = rol;
    claims.permisosAdicionales = permisosAdicionales;

    await authAdmin.setCustomUserClaims(uid, claims);

    return {
        success: true,
        mensaje: "Claims de staff sincronizados correctamente en Authentication."
    };
}

exports.administrarUsuarioStaff = functions.https.onCall(async (data, context) => {
    return await procesarAdministrarUsuarioStaff(data, context, admin.auth(), db);
});

exports.procesarAdministrarUsuarioStaff = procesarAdministrarUsuarioStaff;

