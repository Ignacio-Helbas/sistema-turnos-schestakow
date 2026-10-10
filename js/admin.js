// ==========================================
// MÓDULO ADMINISTRACIÓN
// js/admin.js
// ==========================================

import {
    db,
    auth,
    collection,
    query,
    getDocs,
    doc,
    getDoc,
    setDoc,
    addDoc,
    updateDoc,
    deleteDoc,
    writeBatch,
    serverTimestamp,
    orderBy,
    limit,
    startAfter,
    sendPasswordResetEmail,
    crearCuentaAuthSecundaria
} from "./firebase.js";

import {
    mostrarAlerta,
    mostrarExito,
    pedirConfirmacion,
    abrirModal,
    cerrarModal,
    escaparHTML,
    mostrarToast,
    formatearFechaAR,
    formatearHoraAR
} from "./ui.js";

import {
    obtenerSesionActual
} from "./auth.js";

import {
    iniciarModuloMetricasUI
} from "./metricas-ui.js";

import {
    generarTurnosHistoricosDemo
} from "./metricas.js";

import {
    generarAgendaRecepcion
} from "./recepcion.js";

import {
    cargarAgendaMedico
} from "./consultorio.js";

import {
    cargarEspecialistasFirebase,
    cargarConfiguracionModulacion
} from "./panel.js";

// Estado de Administración de Usuarios
let usuariosPageSnapshots = [];
let currentUsuariosPage = 0;
const USUARIOS_PER_PAGE = 5;

export async function cargarUsuariosAdmin(direccion = 'init') {
    const tbody = document.getElementById('admin-users-tbody');
    const pagInfo = document.getElementById('admin-pag-info');
    const btnPrev = document.getElementById('btn-prev-users');
    const btnNext = document.getElementById('btn-next-users');

    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-slate-400">Cargando personal institucional...</td></tr>';

    try {
        let q;
        if (direccion === 'init') {
            usuariosPageSnapshots = [];
            currentUsuariosPage = 0;
            q = query(collection(db, "usuarios"), orderBy("nombre"), limit(USUARIOS_PER_PAGE));
        } else if (direccion === 'next' && usuariosPageSnapshots[currentUsuariosPage]) {
            currentUsuariosPage++;
            const lastVisible = usuariosPageSnapshots[currentUsuariosPage - 1];
            q = query(collection(db, "usuarios"), orderBy("nombre"), startAfter(lastVisible), limit(USUARIOS_PER_PAGE));
        } else if (direccion === 'prev' && currentUsuariosPage > 0) {
            currentUsuariosPage--;
            if (currentUsuariosPage === 0) {
                q = query(collection(db, "usuarios"), orderBy("nombre"), limit(USUARIOS_PER_PAGE));
            } else {
                const prevVisible = usuariosPageSnapshots[currentUsuariosPage - 1];
                q = query(collection(db, "usuarios"), orderBy("nombre"), startAfter(prevVisible), limit(USUARIOS_PER_PAGE));
            }
        } else {
            return;
        }

        const snap = await getDocs(q);
        if (snap.empty) {
            tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-slate-500">No hay usuarios registrados.</td></tr>';
            return;
        }

        usuariosPageSnapshots[currentUsuariosPage] = snap.docs[snap.docs.length - 1];

        if (pagInfo) pagInfo.innerText = `Página ${currentUsuariosPage + 1}`;
        if (btnPrev) btnPrev.disabled = (currentUsuariosPage === 0);
        if (btnNext) btnNext.disabled = (snap.docs.length < USUARIOS_PER_PAGE);

        let filas = '';
        snap.forEach(d => {
            const u = d.data();
            const id = d.id;
            let badgeRol = 'badge-his badge-his-pendiente';
            if (u.rol === 'Administración') badgeRol = 'badge-his badge-his-admin';
            else if (u.rol === 'Médico') badgeRol = 'badge-his badge-his-atendido';

            filas += `
                <tr class="border-b border-slate-100 hover:bg-slate-50 transition">
                    <td class="p-3">
                        <p class="font-bold text-slate-800 text-xs">${escaparHTML(u.nombre || 'Sin Nombre')}</p>
                        <p class="text-[11px] text-slate-500">${escaparHTML(u.correo || 'Sin correo')}</p>
                    </td>
                    <td class="p-3">
                        <span class="${badgeRol} text-[11px]">${escaparHTML(u.rol || 'Recepción')}</span>
                        ${u.matricula ? `<p class="text-[11px] text-slate-500 font-mono mt-1">M.P.: ${escaparHTML(u.matricula)}</p>` : ''}
                    </td>
                    <td class="p-3 text-xs text-slate-600">
                        <p class="text-slate-700 text-xs font-semibold">${escaparHTML(u.correo || 'N/A')}</p>
                        <button data-correo="${escaparHTML(u.correo || '')}" onclick="enviarResetPasswordUsuario(this.dataset.correo)" class="text-[11px] text-blue-700 underline hover:text-blue-900 mt-1 inline-block">Enviar reset clave</button>
                    </td>
                    <td class="p-3 text-center">
                        <div class="flex justify-center gap-1.5">
                            <button data-id="${escaparHTML(id)}" onclick="editarUsuarioAdmin(this.dataset.id)" class="btn-his-text text-xs px-2.5 py-1 text-slate-700 hover:text-slate-900 border border-slate-200 rounded">Editar</button>
                            <button data-id="${escaparHTML(id)}" onclick="eliminarUsuarioAdmin(this.dataset.id)" class="btn-his-danger text-xs px-2.5 py-1">Eliminar</button>
                        </div>
                    </td>
                </tr>
            `;
        });
        tbody.innerHTML = filas;
    } catch (e) {
        console.error(e);
        tbody.innerHTML = '<tr><td colspan="4" class="p-4 text-center text-red-500">Error al cargar usuarios.</td></tr>';
    }
}

export function abrirModalUsuarioNulo() {
    document.getElementById('input-usuario-id').value = '';
    document.getElementById('input-usuario-nombre').value = '';
    document.getElementById('input-usuario-rol').value = 'Administración';
    document.getElementById('input-usuario-pass').value = '';
    document.getElementById('input-usuario-tel').value = '';
    document.getElementById('input-usuario-correo').value = '';
    document.getElementById('input-usuario-matricula').value = '';
    toggleCamposMedico();
    abrirModal('modal-usuario');
}

export async function editarUsuarioAdmin(id) {
    try {
        const snap = await getDoc(doc(db, "usuarios", id));
        if (!snap.exists()) return;
        const u = snap.data();

        document.getElementById('input-usuario-id').value = id;
        document.getElementById('input-usuario-nombre').value = u.nombre || '';
        document.getElementById('input-usuario-rol').value = u.rol || 'Administración';
        document.getElementById('input-usuario-pass').value = '';
        document.getElementById('input-usuario-tel').value = u.tel || '';
        document.getElementById('input-usuario-correo').value = u.correo || '';
        document.getElementById('input-usuario-matricula').value = u.matricula || '';
        if (u.especialidad) document.getElementById('input-usuario-especialidad').value = u.especialidad;

        toggleCamposMedico();
        abrirModal('modal-usuario');
    } catch (e) {
        console.error(e);
        mostrarAlerta("Error", "No se pudo cargar el perfil del usuario.");
    }
}

export async function guardarUsuarioAdminFirebase() {
    const id = document.getElementById('input-usuario-id').value;
    const nom = document.getElementById('input-usuario-nombre').value.trim();
    const rol = document.getElementById('input-usuario-rol').value;
    const tel = document.getElementById('input-usuario-tel').value.trim();
    const cor = document.getElementById('input-usuario-correo').value.trim();
    const mat = document.getElementById('input-usuario-matricula').value.trim();
    const esp = document.getElementById('input-usuario-especialidad').value;
    const pass = document.getElementById('input-usuario-pass')?.value?.trim();

    if (!cor || !nom) {
        mostrarAlerta("Datos Faltantes", "Nombre y Correo Electrónico son obligatorios.");
        return;
    }

    if (!id && (!pass || pass.length < 6)) {
        mostrarAlerta("Contraseña Requerida", "Para nuevos usuarios, la contraseña debe tener al menos 6 caracteres.");
        return;
    }

    const payload = {
        nombre: nom,
        rol: rol,
        correo: cor,
        tel: tel,
        matricula: rol === 'Médico' ? mat : '',
        especialidad: rol === 'Médico' ? esp : '',
        activo: true
    };

    try {
        let uidFinal = id;
        if (id) {
            await updateDoc(doc(db, "usuarios", id), {
                ...payload,
                actualizadoEn: serverTimestamp()
            });
        } else {
            try {
                uidFinal = await crearCuentaAuthSecundaria(cor, pass);
            } catch (authErr) {
                console.error("Error al registrar cuenta Auth:", authErr);
                let msg = "No se pudo registrar la cuenta en Authentication.";
                if (authErr.code === 'auth/email-already-in-use') {
                    msg = "El correo electrónico ya se encuentra registrado en el sistema.";
                } else if (authErr.code === 'auth/weak-password') {
                    msg = "La contraseña es muy débil (debe tener al menos 6 caracteres).";
                } else if (authErr.code === 'auth/invalid-email') {
                    msg = "El formato del correo electrónico es inválido.";
                }
                mostrarAlerta("Error al Registrar", msg);
                return;
            }

            await setDoc(doc(db, "usuarios", uidFinal), {
                ...payload,
                uid: uidFinal,
                creadoEn: serverTimestamp()
            });
        }

        if (rol === 'Médico') {
            await setDoc(doc(db, "medicos_publicos", uidFinal), {
                medicoUid: uidFinal,
                nombre: nom,
                especialidad: esp,
                activo: true
            }, { merge: true });
        }

        mostrarExito(
            id ? "Actualizado" : "Guardado",
            id ? "Los datos se guardaron correctamente." : "Usuario registrado y habilitado para iniciar sesión."
        );

        cerrarModal('modal-usuario');
        cargarUsuariosAdmin('init');
        cargarEspecialistasFirebase();
    } catch (error) {
        console.error(error);
        mostrarAlerta("Error", "Fallo al comunicar con la base de datos.");
    }
}

export async function eliminarUsuarioAdmin(id) {
    const confirmado = await pedirConfirmacion("¿Eliminar Usuario?", "Esta acción quitará el perfil de la tabla administrativa.", "Sí, eliminar");
    if (!confirmado) return;

    try {
        await deleteDoc(doc(db, "usuarios", id));
        await deleteDoc(doc(db, "medicos_publicos", id)).catch(() => {});
        mostrarExito("Usuario Eliminado", "El perfil fue removido del sistema.");
        cargarUsuariosAdmin('init');
        cargarEspecialistasFirebase();
    } catch (error) {
        console.error(error);
        mostrarAlerta("Error", "Error al intentar eliminar.");
    }
}

export async function enviarResetPasswordUsuario(correo) {
    try {
        await sendPasswordResetEmail(auth, correo);
        mostrarToast(`Se envió un correo a ${correo} para restablecer su clave.`, "info");
    } catch (error) {
        console.error(error);
        mostrarAlerta("Error", "No se pudo enviar el correo de restablecimiento.");
    }
}

export function toggleCamposMedico() {
    const rol = document.getElementById('input-usuario-rol')?.value;
    const divMat = document.getElementById('div-usuario-matricula');
    const divEsp = document.getElementById('div-usuario-especialidad');
    if (rol === 'Médico') {
        if (divMat) divMat.classList.remove('hidden');
        if (divEsp) divEsp.classList.remove('hidden');
    } else {
        if (divMat) divMat.classList.add('hidden');
        if (divEsp) divEsp.classList.add('hidden');
    }
}

export function togglePasswordVisibility() {
    const input = document.getElementById('input-usuario-pass');
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
}

export function iniciarGuardadoModulacion() {
    const input = document.getElementById('input-seguridad-admin');
    if (input) input.value = '';
    abrirModal('modal-seguridad-modulacion');
}

export async function ejecutarGuardadoModulacion() {
    const alcance = document.getElementById('admin-select-alcance').value;
    const duracion = parseInt(document.getElementById('admin-select-duracion').value, 10);

    try {
        if (alcance === 'global') {
            await setDoc(doc(db, "configuracion", "general"), { duracionBase: duracion }, { merge: true });
        } else {
            await setDoc(doc(db, "modulacion_medicos", alcance), { duracionBase: duracion }, { merge: true });
        }

        cerrarModal('modal-seguridad-modulacion');
        mostrarToast("Modulación aplicada correctamente", "success");
        await cargarConfiguracionModulacion();
    } catch (e) {
        console.error(e);
        mostrarAlerta("Error", "No se pudo actualizar la modulación.");
    }
}

export async function cargarMetricas(forzarRecarga = false) {
    try {
        await iniciarModuloMetricasUI(forzarRecarga);
    } catch (e) {
        console.error("Error al inicializar módulo de métricas:", e);
    }
}

export async function cargarAuditoriaAdmin() {
    const tbody = document.getElementById('admin-auditoria-tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="4" class="p-6 text-center text-slate-500 text-xs"><span class="inline-block w-4 h-4 border-2 border-slate-300 border-t-[#0f172a] rounded-full animate-spin mr-2 align-middle"></span> Consultando registros de auditoría institucional...</td></tr>';
    try {
        const q = query(
            collection(db, "auditoria"),
            orderBy("fecha", "desc"),
            limit(30)
        );
        const snap = await getDocs(q);
        if (snap.empty) {
            tbody.innerHTML = '<tr><td colspan="4" class="p-6 text-center text-slate-500 text-xs">Sin eventos de auditoría registrados aún.</td></tr>';
            return;
        }
        let html = '';
        snap.forEach(d => {
            const ev = d.data();
            const fechaStr = ev.fecha?.toDate ? ev.fecha.toDate().toLocaleString('es-AR') : (ev.fecha ? String(ev.fecha) : 'Fecha N/D');
            let badgeRol = 'badge-his badge-his-pendiente';
            if (ev.actorRol === 'Médico') badgeRol = 'badge-his badge-his-atendido';
            else if (ev.actorRol === 'Administración') badgeRol = 'badge-his badge-his-admin';

            html += `
                <tr class="hover:bg-slate-50 transition border-b border-slate-100">
                    <td class="font-mono text-xs text-slate-700 p-3">${escaparHTML(fechaStr)} hs</td>
                    <td class="p-3"><span class="${badgeRol}">${escaparHTML(ev.actorRol || 'Sistema')}</span></td>
                    <td class="font-bold text-xs text-slate-800 p-3">${escaparHTML(ev.accion || 'OPERACIÓN')}</td>
                    <td class="text-xs text-slate-600 p-3">${escaparHTML(ev.detalle || '-')}</td>
                </tr>
            `;
        });
        tbody.innerHTML = html;
    } catch (e) {
        console.warn("Aviso al cargar auditoría:", e);
        tbody.innerHTML = '<tr><td colspan="4" class="p-6 text-center text-slate-500">Para visualizar el log completo de auditoría, inicie sesión con rol de Administración.</td></tr>';
    }
}

export async function verificarLimpiezaAnual() {
    try {
        const snap = await getDocs(query(collection(db, "turnos"), limit(1)));
    } catch (e) {
        // Silencioso
    }
}

export function ejecutarLimpiezaYDescarga() {
    cerrarModal('modal-limpieza-anual');
    mostrarToast("Copia de respaldo exportada correctamente", "success");
}

export async function verificarEntornoDemo() {
    try {
        let snap = await getDoc(doc(db, "configuracion", "entorno"));
        if (!snap.exists()) {
            snap = await getDoc(doc(db, "config", "entorno"));
        }
        if (!snap.exists()) {
            await setDoc(doc(db, "configuracion", "entorno"), {
                esDemo: true,
                descripcion: "Entorno académico experimental UTN FRSR"
            }, { merge: true });
            return true;
        }
        return snap.data()?.esDemo === true;
    } catch (e) {
        console.warn("No se pudo verificar entorno demo:", e);
        return false;
    }
}

export async function limpiarBaseDeDatos() {
    const sesionActual = obtenerSesionActual();

    if (sesionActual?.rol !== 'Administración') {
        mostrarAlerta("Acceso Denegado", "Solo el Administrador General puede ejecutar la limpieza de la base de datos.");
        return;
    }

    const confirmacionPalabra = window.prompt(
        "Esta acción eliminará todos los turnos, disponibilidades, pacientes, historias clínicas y médicos demostrativos.\n" +
        "La cuenta del administrador en sesión quedará conservada y protegida.\n\n" +
        "Para confirmar la eliminación total, escriba la palabra LIMPIAR en mayúsculas:"
    );

    if (confirmacionPalabra !== "LIMPIAR") {
        if (confirmacionPalabra !== null) {
            mostrarAlerta("Operación Cancelada", "Debe escribir exactamente la palabra LIMPIAR para confirmar la eliminación.");
        }
        return;
    }

    abrirModal('modal-progreso');
    const barra = document.getElementById('progreso-barra');
    const texto = document.getElementById('progreso-texto');
    if (texto) texto.innerText = "Borrando turnos de prueba...";
    if (barra) barra.style.width = '20%';

    try {
        const turnosSnap = await getDocs(collection(db, "turnos"));
        const BATCH_SIZE = 400;
        for (let i = 0; i < turnosSnap.docs.length; i += BATCH_SIZE) {
            const batch = writeBatch(db);
            turnosSnap.docs.slice(i, i + BATCH_SIZE).forEach(d => batch.delete(d.ref));
            await batch.commit();
        }
        if (barra) barra.style.width = '40%';

        if (texto) texto.innerText = "Borrando disponibilidades y médicos públicos...";
        const dispSnap = await getDocs(collection(db, "disponibilidad"));
        const promesasDisp = dispSnap.docs.map(d => deleteDoc(doc(db, "disponibilidad", d.id)));
        await Promise.all(promesasDisp);

        const medicosPubSnap = await getDocs(collection(db, "medicos_publicos"));
        const promesasMedicosPub = medicosPubSnap.docs.map(d => deleteDoc(doc(db, "medicos_publicos", d.id)));
        await Promise.all(promesasMedicosPub);
        if (barra) barra.style.width = '60%';

        if (texto) texto.innerText = "Borrando pacientes e historias clínicas...";
        const pacientesSnap = await getDocs(collection(db, "pacientes"));
        for (let i = 0; i < pacientesSnap.docs.length; i += BATCH_SIZE) {
            const batch = writeBatch(db);
            pacientesSnap.docs.slice(i, i + BATCH_SIZE).forEach(d => batch.delete(d.ref));
            await batch.commit();
        }

        const dniMapSnap = await getDocs(collection(db, "pacientes_por_dni")).catch(() => ({ docs: [] }));
        if (dniMapSnap && dniMapSnap.docs) {
            const promesasDni = dniMapSnap.docs.map(d => deleteDoc(d.ref));
            await Promise.all(promesasDni);
        }
        if (barra) barra.style.width = '80%';

        if (texto) texto.innerText = "Limpiando personal demostrativo y protegiendo cuenta del Administrador...";
        const usuariosSnap = await getDocs(collection(db, "usuarios"));
        const promesasUsuarios = [];
        usuariosSnap.forEach(d => {
            const esCuentaAdminActual = (sesionActual && d.id === sesionActual.uid);
            if (!esCuentaAdminActual) {
                promesasUsuarios.push(deleteDoc(doc(db, "usuarios", d.id)));
            }
        });
        await Promise.all(promesasUsuarios);

        // Asegurar que la cuenta del administrador en sesión quede activa
        if (sesionActual?.uid) {
            await setDoc(doc(db, "usuarios", sesionActual.uid), {
                nombre: sesionActual.nombre || "Administrador",
                correo: sesionActual.correo,
                rol: "Administración",
                activo: true,
                actualizadoEn: serverTimestamp()
            }, { merge: true });
        }

        await deleteDoc(doc(db, "configuracion", "entorno")).catch(() => {});

        if (barra) barra.style.width = '100%';
        cerrarModal('modal-progreso');
        mostrarExito("Reinicio Exitoso", "Todos los datos inyectados fueron eliminados con éxito. La cuenta del Administrador en sesión se mantiene activa e intacta.");

        cargarUsuariosAdmin('init');
        cargarEspecialistasFirebase();
        cargarMetricas(true);
    } catch (e) {
        console.error(e);
        cerrarModal('modal-progreso');
        mostrarAlerta("Error", "Error al vaciar la base de datos: " + e.message);
    }
}

export async function inyectarMedicosDePrueba() {
    const confirm = await pedirConfirmacion(
        "¿Inyectar Médicos para Público General?",
        "Se cargarán 29 profesionales categorizados con todas sus especialidades médicas en el catálogo público para que cualquier persona en el portal web (index.html) pueda consultar y agendar turnos en vivo.",
        "Sí, Inyectar Médicos"
    );
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

    for (let i = 0; i < medicosDemo.length; i++) {
        const med = medicosDemo[i];
        const uidDoc = `med_demo_${med.mat}`;
        const payload = {
            nombre: med.nom,
            rol: "Médico",
            username: med.nom.split(' ')[1].toLowerCase() + med.mat.substring(0, 3),
            correo: med.nom.split(' ')[1].toLowerCase() + "@hospital.demo",
            tel: "2604000000",
            matricula: med.mat,
            especialidad: med.esp,
            activo: true,
            timestamp: new Date()
        };

        try {
            await setDoc(doc(db, "usuarios", uidDoc), payload, { merge: true });
            await setDoc(doc(db, "medicos_publicos", uidDoc), {
                medicoUid: uidDoc,
                nombre: med.nom,
                especialidad: med.esp,
                matricula: med.mat,
                activo: true
            }, { merge: true });
        } catch (e) {
            console.error("Fallo inyectando a:", med.nom, e);
        }

        completados++;
        let porcentaje = Math.round((completados / total) * 100);
        if (barra) barra.style.width = porcentaje + '%';
        if (texto) texto.innerText = `Cargando profesional: ${med.nom} (${completados}/${total})`;
    }

    cerrarModal('modal-progreso');
    mostrarExito("Médicos Inyectados con Éxito", "Se cargaron 29 profesionales hospitalarios categorizados para que el público general pueda reservar turnos en vivo desde el portal web.");

    await cargarEspecialistasFirebase();
    cargarUsuariosAdmin('init');
    cargarMetricas();
}

export async function inyectarDemoCompletaForo() {
    const sesionActual = obtenerSesionActual();
    if (!sesionActual || sesionActual.rol !== 'Administración') {
        mostrarAlerta("Acceso Denegado", "Solo el Administrador General puede ejecutar la inyección del escenario para el Foro.");
        return;
    }

    const confirm = await pedirConfirmacion(
        "Preparar Demostración para el Foro",
        "Esta acción cargará el escenario completo 100% funcional para el Foro: catálogo médico, pacientes de hoy en Recepción y Sala de Espera médica, historias clínicas y ~2 meses de histórico de métricas con indicadores realistas.",
        "Sí, Inyectar Escenario 100%"
    );
    if (!confirm) return;

    abrirModal('modal-progreso');
    const barra = document.getElementById('progreso-barra');
    const texto = document.getElementById('progreso-texto');

    try {
        if (texto) texto.innerText = "Preparando perfil de Administrador y catálogo médico...";
        if (barra) barra.style.width = '20%';

        if (sesionActual?.uid) {
            await setDoc(doc(db, "usuarios", sesionActual.uid), {
                nombre: sesionActual.nombre || "Administrador",
                correo: sesionActual.correo,
                rol: "Administración",
                activo: true,
                actualizadoEn: serverTimestamp()
            }, { merge: true });
        }

        const medicosBase = [
            { nom: "Dr. Esteban Quiroga", esp: "Clínica Médica", mat: "44019" },
            { nom: "Dr. Carlos San Martín", esp: "Cardiología", mat: "10293" },
            { nom: "Dra. María Antonieta", esp: "Pediatría", mat: "22019" },
            { nom: "Dra. Sofía Castro", esp: "Neurología", mat: "80291" },
            { nom: "Dr. Ricardo Silva", esp: "Traumatología y Ortopedia", mat: "33918" }
        ];

        for (let i = 0; i < medicosBase.length; i++) {
            const med = medicosBase[i];
            const uidDoc = `med_demo_${i + 1}`;
            await setDoc(doc(db, "medicos_publicos", uidDoc), {
                medicoUid: uidDoc,
                nombre: med.nom,
                especialidad: med.esp,
                matricula: med.mat,
                activo: true
            }, { merge: true });
        }

        if (texto) texto.innerText = "Generando pacientes y agenda de hoy...";
        if (barra) barra.style.width = '50%';

        const hoyStr = new Date().toISOString().split('T')[0];

        const pacientesDemo = [
            {
                dni: "30123456",
                nombre: "Carlos",
                apellido: "Gómez",
                celular: "2604112233",
                email: "carlos.gomez@demo.hospital",
                horario: "08:30",
                medico: "Dr. Esteban Quiroga",
                medicoUid: "med_demo_1",
                especialidad: "Clínica Médica",
                estado: "En Espera",
                antecedentes: "Hipertensión Arterial Diagnosticada hace 5 años en tratamiento. Diabetes Mellitus Tipo 2 no insulinodependiente.",
                medicacion: "Enalapril 10mg cada 12 hs vía oral. Metformina 850mg con almuerzo.",
                alergias: "Penicilina (edema de glotis y erupción cutánea grave)."
            },
            {
                dni: "28987654",
                nombre: "María",
                apellido: "Rodríguez",
                celular: "2604223344",
                email: "maria.rodriguez@demo.hospital",
                horario: "09:00",
                medico: "Dr. Esteban Quiroga",
                medicoUid: "med_demo_1",
                especialidad: "Clínica Médica",
                estado: "Confirmado Presencial",
                antecedentes: "Hipotiroidismo primario compensado.",
                medicacion: "Levotiroxina 75 mcg diaria en ayunas.",
                alergias: "Sin alergias medicamentosas conocidas."
            },
            {
                dni: "35111222",
                nombre: "Juan Pablo",
                apellido: "Rossi",
                celular: "2604334455",
                email: "juanpablo.rossi@demo.hospital",
                horario: "09:30",
                medico: "Dr. Carlos San Martín",
                medicoUid: "med_demo_2",
                especialidad: "Cardiología",
                estado: "En Espera",
                antecedentes: "Arritmia supraventricular paroxística.",
                medicacion: "Atenolol 25mg/día.",
                alergias: "AINEs (Ibuprofeno/Diclofenac: broncoespasmo)."
            },
            {
                dni: "42333444",
                nombre: "Lucía",
                apellido: "Fernández",
                celular: "2604556677",
                email: "lucia.fernandez@demo.hospital",
                horario: "10:00",
                medico: "Dra. María Antonieta",
                medicoUid: "med_demo_3",
                especialidad: "Pediatría",
                estado: "Confirmado Presencial",
                antecedentes: "Asma infantil leve intermitente.",
                medicacion: "Salbutamol aerosol SOS.",
                alergias: "Sin antecedentes alérgicos reportados."
            },
            {
                dni: "24555666",
                nombre: "Roberto",
                apellido: "Benítez",
                celular: "2604778899",
                email: "roberto.benitez@demo.hospital",
                horario: "08:00",
                medico: "Dr. Esteban Quiroga",
                medicoUid: "med_demo_1",
                especialidad: "Clínica Médica",
                estado: "Atendido",
                antecedentes: "Dislipemia mixta.",
                medicacion: "Atorvastatina 20mg nocturna.",
                alergias: "Sin alergias medicamentosas conocidas."
            }
        ];

        if (texto) texto.innerText = "Registrando historias clínicas y turnos activos...";
        if (barra) barra.style.width = '75%';

        for (let i = 0; i < pacientesDemo.length; i++) {
            const p = pacientesDemo[i];
            const pacienteId = `PAC_DEMO_${p.dni}`;
            const turnoId = `TURNO_DEMO_${hoyStr}_${i + 1}`;

            const dniDocRef = doc(db, "pacientes_por_dni", p.dni);
            const dniSnap = await getDoc(dniDocRef);
            if (!dniSnap.exists()) {
                await setDoc(dniDocRef, {
                    pacienteId: pacienteId,
                    dni: p.dni,
                    creadoEn: serverTimestamp()
                });
            } else {
                await setDoc(dniDocRef, {
                    pacienteId: pacienteId,
                    dni: p.dni
                }, { merge: true });
            }

            await setDoc(doc(db, "pacientes", pacienteId), {
                dni: p.dni,
                nombre: p.nombre,
                apellido: p.apellido,
                fechaNacimiento: "1985-05-15",
                sexo: i % 2 === 0 ? "Masculino" : "Femenino",
                contacto: {
                    celular: p.celular,
                    email: p.email
                },
                creadoEn: serverTimestamp(),
                creadoPor: sesionActual?.uid || "admin",
                esDemo: true
            }, { merge: true });

            await setDoc(doc(db, "pacientes", pacienteId, "clinico", "resumen"), {
                antecedentes: p.antecedentes,
                medicacion: p.medicacion,
                alergias: p.alergias,
                actualizadoEn: serverTimestamp(),
                actualizadoPor: sesionActual?.uid || "admin"
            }, { merge: true });

            if (sesionActual?.uid) {
                await setDoc(doc(db, "pacientes", pacienteId, "acceso", sesionActual.uid), {
                    medicoUid: sesionActual.uid,
                    turnoId: turnoId,
                    creadoEn: serverTimestamp()
                }, { merge: true });
            }

            let llegadaEn = null;
            let inicioConsultaEn = null;
            let finConsultaEn = null;
            if (p.estado === "En Espera") {
                llegadaEn = serverTimestamp();
            } else if (p.estado === "Atendido") {
                llegadaEn = serverTimestamp();
                inicioConsultaEn = serverTimestamp();
                finConsultaEn = serverTimestamp();
            }

            await setDoc(doc(db, "turnos", turnoId), {
                especialidad: p.especialidad,
                medico: p.medico,
                medicoUid: p.medicoUid,
                fecha: hoyStr,
                horario: p.horario,
                pacienteNombre: `${p.nombre} ${p.apellido}`,
                pacienteDni: p.dni,
                pacienteCelular: p.celular,
                pacienteEmail: p.email,
                codigoConfirmacion: `FORO${i + 1}`,
                canal: "Presencial",
                estado: p.estado,
                pacienteId: pacienteId,
                creadoEn: serverTimestamp(),
                creadoPor: sesionActual?.uid || "admin",
                llegadaEn: llegadaEn,
                inicioConsultaEn: inicioConsultaEn,
                finConsultaEn: finConsultaEn,
                canceladoPor: null,
                canceladoEn: null,
                reprogramadoDe: null,
                timestamp: serverTimestamp()
            }, { merge: true });
        }

        await setDoc(doc(db, "usuarios", "recep_demo_1"), {
            nombre: "Ana Morales",
            correo: "ana.recepcion@hospital.demo",
            rol: "Recepción",
            activo: true,
            esDemo: true
        }, { merge: true });

        await setDoc(doc(db, "usuarios", "recep_demo_2"), {
            nombre: "Marcos Véliz",
            correo: "marcos.recepcion@hospital.demo",
            rol: "Recepción",
            activo: true,
            esDemo: true
        }, { merge: true });

        if (texto) texto.innerText = "Inyectando ~2 meses de métricas y turnos históricos realistas...";
        if (barra) barra.style.width = '80%';

        const turnosHistoricos = generarTurnosHistoricosDemo(new Date());
        const BATCH_SIZE = 400;
        for (let i = 0; i < turnosHistoricos.length; i += BATCH_SIZE) {
            const batch = writeBatch(db);
            const chunk = turnosHistoricos.slice(i, i + BATCH_SIZE);
            chunk.forEach(t => {
                batch.set(doc(db, "turnos", t.id), t.data, { merge: true });
            });
            await batch.commit();
        }

        await setDoc(doc(db, "configuracion", "entorno"), {
            esDemo: true,
            actualizadoEn: serverTimestamp()
        }, { merge: true });

        const btnReset = document.getElementById('btn-reset-db');
        if (btnReset) btnReset.classList.remove('hidden');

        if (barra) barra.style.width = '100%';
        cerrarModal('modal-progreso');

        await cargarEspecialistasFirebase();
        cargarUsuariosAdmin('init');
        cargarMetricas(true);
        const inputFechaRec = document.getElementById('input-fecha-recepcion')?.value;
        if (inputFechaRec) generarAgendaRecepcion();
        if (document.body.dataset.view === 'doctor') cargarAgendaMedico();

        mostrarExito(
            "Demostración Preparada",
            "¡Escenario del Foro cargado al 100%! Especialistas disponibles, pacientes de hoy en Recepción y Consultorio, y ~2 meses de histórico de métricas listos para exponer."
        );
    } catch (err) {
        console.error("Error al inyectar escenario demo:", err);
        cerrarModal('modal-progreso');
        mostrarAlerta("Error", "No se pudo inyectar el escenario de demostración: " + err.message);
    }
}

// Exponer en window para manejadores inline del DOM
window.abrirModalUsuarioNulo = abrirModalUsuarioNulo;
window.cargarUsuariosAdmin = cargarUsuariosAdmin;
window.editarUsuarioAdmin = editarUsuarioAdmin;
window.guardarUsuarioAdminFirebase = guardarUsuarioAdminFirebase;
window.eliminarUsuarioAdmin = eliminarUsuarioAdmin;
window.enviarResetPasswordUsuario = enviarResetPasswordUsuario;
window.toggleCamposMedico = toggleCamposMedico;
window.togglePasswordVisibility = togglePasswordVisibility;
window.iniciarGuardadoModulacion = iniciarGuardadoModulacion;
window.ejecutarGuardadoModulacion = ejecutarGuardadoModulacion;
window.verificarLimpiezaAnual = verificarLimpiezaAnual;
window.ejecutarLimpiezaYDescarga = ejecutarLimpiezaYDescarga;
window.limpiarBaseDeDatos = limpiarBaseDeDatos;
window.inyectarMedicosDePrueba = inyectarMedicosDePrueba;
window.inyectarDemoCompletaForo = inyectarDemoCompletaForo;
window.generarTurnosHistoricosDemo = generarTurnosHistoricosDemo;
window.cargarAuditoriaAdmin = cargarAuditoriaAdmin;
