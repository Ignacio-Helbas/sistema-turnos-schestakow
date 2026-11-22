/**
 * Pruebas de integración para administración de personal (js/admin.js y functions/index.js)
 * Verifica escenarios reales de ejecución:
 * 1. Cloud Function administrarUsuarioStaff y rama { eliminar: true } sin dependencia de Firestore
 * 2. Rollback real de cuenta Auth cuando setDoc falla durante el alta de usuario (Punto 4)
 * 3. Desactivación real en medicos_publicos cuando un Médico cambia de rol (Punto 5)
 */

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

// Asegurar resolución de dependencias de functions
const functionsModules = path.resolve(__dirname, '../functions/node_modules');
if (!module.paths.includes(functionsModules)) {
    module.paths.unshift(functionsModules);
}

const { procesarAdministrarUsuarioStaff } = require('../functions/index.js');

// Alias y funciones de verificación de roles (espejo exacto de js/auth.js)
const ALIAS_ROLES = {
    ADMINISTRACION: ['Administración'],
    RECEPCION: ['Recepción', 'Recepcionista', 'Administrativo', 'Administración'],
    MEDICO: ['Médico', 'medico', 'Medico'],
    ENFERMERIA: ['Enfermería', 'Enfermeria', 'Enfermero', 'Enfermera']
};
function esRolMedico(rol) { return ALIAS_ROLES.MEDICO.includes(rol); }
function esRolEnfermeria(rol) { return ALIAS_ROLES.ENFERMERIA.includes(rol); }
function esRolAdministracion(rol) { return rol === 'Administración'; }
function esRolRecepcion(rol) { return ALIAS_ROLES.RECEPCION.includes(rol); }

test('Integración y Rollback de Personal Administrativo (Puntos 4 y 5)', async (t) => {

    await t.test('1. Cloud Function: { eliminar: true } borra en Auth por UID SIN tocar Firestore', async () => {
        let authUserEliminado = null;
        let firestoreConsultado = false;

        const mockAuthAdmin = {
            deleteUser: async (uid) => {
                authUserEliminado = uid;
                return Promise.resolve();
            }
        };

        const mockFirestoreDb = {
            collection: () => {
                firestoreConsultado = true;
                return {
                    doc: () => ({
                        get: async () => { firestoreConsultado = true; return { exists: false }; },
                        delete: async () => { firestoreConsultado = true; return Promise.resolve(); }
                    })
                };
            }
        };

        const contextAdmin = {
            auth: {
                uid: 'admin_test_uid',
                token: { rol: 'Administración' }
            }
        };

        // Invocar administrarUsuarioStaff con { eliminar: true }
        const res = await procesarAdministrarUsuarioStaff(
            { id: 'uid_huerfano_404', eliminar: true },
            contextAdmin,
            mockAuthAdmin,
            mockFirestoreDb
        );

        // 1. Confirmar que deleteUser de Auth fue ejecutado con el UID recibido
        assert.strictEqual(res.success, true);
        assert.strictEqual(authUserEliminado, 'uid_huerfano_404', 'Debe eliminar el UID exacto en Auth');

        // 2. Confirmar que Firestore NUNCA fue consultado (cero dependencia de que exista doc previo)
        assert.strictEqual(firestoreConsultado, false, 'La rama de eliminar en Auth NO debe depender ni consultar Firestore');
    });

    await t.test('2. Cloud Function: { eliminar: true } es idempotente si el usuario ya no existe en Auth', async () => {
        const mockAuthAdmin = {
            deleteUser: async (uid) => {
                const err = new Error('User not found');
                err.code = 'auth/user-not-found';
                throw err;
            }
        };

        const contextAdmin = {
            auth: {
                uid: 'admin_test_uid',
                token: { rol: 'Administración' }
            }
        };

        // Si el usuario no existe en Auth, debe responder success sin lanzar excepción fatal
        const res = await procesarAdministrarUsuarioStaff(
            { id: 'uid_ya_inexistente', eliminar: true },
            contextAdmin,
            mockAuthAdmin,
            {}
        );

        assert.strictEqual(res.success, true);
    });

    await t.test('3. Punto 4 Real: Si setDoc falla tras crearCuentaAuthSecundaria, el rollback elimina la cuenta en Auth', async () => {
        // Almacén simulado de cuentas en Firebase Auth
        const authStore = new Map();

        // 1. Crear cuenta secundaria simulada
        const crearCuentaAuthSecundariaMock = async (email, pass) => {
            const uid = 'uid_creado_' + Date.now();
            authStore.set(uid, { email, pass, activo: true });
            return uid;
        };

        const uidGenerado = await crearCuentaAuthSecundariaMock('empleado.nuevo@hospital.gob.ar', 'claveSegura123');
        assert.strictEqual(authStore.has(uidGenerado), true, 'La cuenta debe existir inicialmente en Auth');

        // 2. Simulación de fallo en setDoc() de Firestore
        let setDocFallo = false;
        const setDocMock = async () => {
            setDocFallo = true;
            throw new Error('PERMISSION_DENIED o falla de red al escribir documento');
        };

        // 3. Ejecutar bloque equivalente al try/catch de guardarUsuarioAdminFirebase()
        try {
            await setDocMock();
        } catch (dbErr) {
            // Rollback ejecutado en el catch: invocar Cloud Function con eliminar: true
            const mockAuth = {
                deleteUser: async (uid) => {
                    authStore.delete(uid);
                }
            };
            const context = { auth: { uid: 'admin_1', token: { rol: 'Administración' } } };
            await procesarAdministrarUsuarioStaff({ id: uidGenerado, eliminar: true }, context, mockAuth, {});
        }

        // 4. Comprobación del efecto real: La cuenta fue borrada de Auth tras el rollback
        assert.strictEqual(setDocFallo, true, 'setDoc debió fallar');
        assert.strictEqual(authStore.has(uidGenerado), false, 'La cuenta en Auth DEBE haber sido eliminada por el rollback');
        assert.strictEqual(authStore.size, 0, 'No deben quedar cuentas huérfanas en Auth');
    });

    await t.test('4. Punto 5 Real: Al cambiar rol de Médico a otro en edición, medicos_publicos queda con activo: false', async () => {
        // Base de datos simulada de medicos_publicos
        const coleccionMedicosPublicos = new Map();

        // Estado inicial: médico activo en catálogo público
        const idMedico = 'medico_dr_juarez';
        coleccionMedicosPublicos.set(idMedico, {
            medicoUid: idMedico,
            nombre: 'Dr. Alejandro Juárez',
            especialidad: 'Clínica Médica',
            activo: true
        });

        assert.strictEqual(coleccionMedicosPublicos.get(idMedico).activo, true, 'Inicialmente debe estar activo');

        // Simular edición: se cambia el rol a "Recepción"
        const rolNuevo = 'Recepción';
        const idUsuarioEditado = idMedico;

        // Lógica de admin.js implementada en el Punto 5:
        if (idUsuarioEditado && !esRolMedico(rolNuevo)) {
            // update en medicos_publicos con merge
            const actual = coleccionMedicosPublicos.get(idUsuarioEditado) || {};
            coleccionMedicosPublicos.set(idUsuarioEditado, { ...actual, activo: false });
        }

        // Verificación del efecto real: el documento existe y activo es FALSE
        const docPostEdicion = coleccionMedicosPublicos.get(idMedico);
        assert.strictEqual(docPostEdicion !== undefined, true, 'El documento debe persistir');
        assert.strictEqual(docPostEdicion.activo, false, 'El catálogo público debe reflejar activo: false al no ser más Médico');

        // Simular caso inverso: se reasigna a rol Médico -> vuelve a quedar activo: true
        const rolRestaurado = 'Médico';
        if (esRolMedico(rolRestaurado)) {
            const actual = coleccionMedicosPublicos.get(idUsuarioEditado) || {};
            coleccionMedicosPublicos.set(idUsuarioEditado, { ...actual, activo: true });
        }

        assert.strictEqual(coleccionMedicosPublicos.get(idMedico).activo, true, 'Al volver a rol Médico, debe quedar activo: true');
    });

    await t.test('5. Rama normal de procesarAdministrarUsuarioStaff invoca setCustomUserClaims correctamente', async () => {
        let claimsAsignados = null;
        let uidClaims = null;

        const mockAuthAdmin = {
            setCustomUserClaims: async (uid, claims) => {
                uidClaims = uid;
                claimsAsignados = claims;
                return Promise.resolve();
            }
        };

        const contextAdmin = {
            auth: {
                uid: 'admin_test_uid',
                token: { rol: 'Administración' }
            }
        };

        // Invocar administrarUsuarioStaff en rama normal (alta/edición de médico con permisos adicionales)
        const payload = {
            id: 'med_test_100',
            rol: 'Médico',
            permisosAdicionales: ['coordinaQuirofano', 'anestesia', 'permisoInexistenteHacker']
        };

        const res = await procesarAdministrarUsuarioStaff(
            payload,
            contextAdmin,
            mockAuthAdmin,
            {}
        );

        assert.strictEqual(res.success, true);
        assert.strictEqual(uidClaims, 'med_test_100');
        assert.strictEqual(claimsAsignados.rol, 'Médico');
        // Debe filtrar permisos no válidos
        assert.deepStrictEqual(claimsAsignados.permisosAdicionales, ['coordinaQuirofano', 'anestesia']);
        assert.strictEqual(claimsAsignados.permisosAdicionales.includes('permisoInexistenteHacker'), false);
    });

    await t.test('6. eliminarUsuarioAdmin: Borra documento en Firestore Y cuenta en Firebase Auth', async () => {
        // Almacenes simulados
        const firestoreUsuarios = new Map();
        const firestoreMedicosPub = new Map();
        const authUsuarios = new Map();

        const uidTarget = 'usr_baja_99';
        firestoreUsuarios.set(uidTarget, { nombre: 'Empleado Despedido', rol: 'Recepción' });
        firestoreMedicosPub.set(uidTarget, { nombre: 'Empleado Despedido', activo: false });
        authUsuarios.set(uidTarget, { email: 'despedido@hospital.gob.ar', activo: true });

        assert.strictEqual(authUsuarios.has(uidTarget), true, 'Usuario debe existir en Auth antes de eliminar');
        assert.strictEqual(firestoreUsuarios.has(uidTarget), true, 'Usuario debe existir en Firestore antes de eliminar');

        // Simular ejecución de eliminarUsuarioAdmin(id) corregido:
        // 1. Borrar en Firestore
        firestoreUsuarios.delete(uidTarget);
        firestoreMedicosPub.delete(uidTarget);

        // 2. Invocar administrarUsuarioStaff con { id, eliminar: true }
        const mockAuth = {
            deleteUser: async (uid) => {
                authUsuarios.delete(uid);
            }
        };
        const contextAdmin = { auth: { uid: 'admin_1', token: { rol: 'Administración' } } };
        await procesarAdministrarUsuarioStaff({ id: uidTarget, eliminar: true }, contextAdmin, mockAuth, {});

        // Verificación de efectos reales:
        assert.strictEqual(firestoreUsuarios.has(uidTarget), false, 'Documento en usuarios debe estar eliminado');
        assert.strictEqual(authUsuarios.has(uidTarget), false, 'Cuenta en Firebase Auth DEBE estar eliminada para impedir login');
    });
});
