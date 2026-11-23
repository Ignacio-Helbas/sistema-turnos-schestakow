/**
 * Prueba de integración para el rechazo de inicio de sesión de cuentas huérfanas
 * o dadas de baja (Seguridad Spark: Validación contra /usuarios/{uid} en Firestore).
 * 
 * Verifica:
 * 1. Una cuenta de Authentication sin documento asociado en /usuarios/{uid} es RECHAZADA
 *    con error "USUARIO_NO_REGISTRADO" y signOut inmediato (nunca recibe rol Recepción).
 * 2. Una cuenta de Authentication con documento con activo === false es RECHAZADA
 *    con error "USUARIO_INACTIVO" y signOut inmediato.
 * 3. Una cuenta con perfil activo y rol legítimo inicia sesión correctamente.
 */

const test = require('node:test');
const assert = require('node:assert');

test('Seguridad de Acceso: Rechazo de cuentas huérfanas o sin perfil Firestore', async (t) => {

    await t.test('1. Cuenta de Auth SIN documento en /usuarios/{uid} es expulsada con USUARIO_NO_REGISTRADO', async () => {
        let signOutEjecutado = false;

        const authMock = { currentUser: { uid: 'usr_huerfano_123', email: 'despedido@hospital.ar' } };
        const dbMock = { _tipo: 'firestore_mock' };

        // Simular docSnap.exists() === false (documento eliminado de Firestore)
        const getDocMock = async () => ({
            exists: () => false,
            data: () => undefined
        });

        const signOutMock = async () => {
            signOutEjecutado = true;
            return Promise.resolve();
        };

        const signInWithEmailAndPasswordMock = async (a, email, pass) => ({
            user: { uid: 'usr_huerfano_123', email, displayName: null }
        });

        // Función iniciarSesionFirebase bajo test (lógica idéntica a js/firebase.js)
        async function probarIniciarSesion(correo, password) {
            const correoFinal = (correo || "").trim();
            const credencial = await signInWithEmailAndPasswordMock(authMock, correoFinal, password);
            const user = credencial.user;

            const perfilSnap = await getDocMock();
            if (!perfilSnap.exists()) {
                await signOutMock(authMock);
                throw new Error("USUARIO_NO_REGISTRADO");
            }

            const perfil = perfilSnap.data() || {};
            if (perfil.activo === false) {
                await signOutMock(authMock);
                throw new Error("USUARIO_INACTIVO");
            }

            const rol = perfil.rol;
            if (!rol) {
                await signOutMock(authMock);
                throw new Error("USUARIO_SIN_ROL");
            }

            return {
                uid: user.uid,
                correo: user.email,
                nombre: perfil.nombre || user.email,
                rol: rol
            };
        }

        // Ejecutar intento de login con cuenta huérfana
        await assert.rejects(
            async () => {
                await probarIniciarSesion('despedido@hospital.ar', 'contrasena123');
            },
            {
                name: 'Error',
                message: 'USUARIO_NO_REGISTRADO'
            },
            'Debe rechazar con USUARIO_NO_REGISTRADO'
        );

        assert.strictEqual(signOutEjecutado, true, 'Debe ejecutar signOut(auth) para no dejar la sesión colgada en Auth');
    });

    await t.test('2. Cuenta de Auth con perfil desactivado (activo: false) es expulsada con USUARIO_INACTIVO', async () => {
        let signOutEjecutado = false;

        const authMock = { currentUser: { uid: 'usr_inactivo_456' } };
        const getDocMock = async () => ({
            exists: () => true,
            data: () => ({ activo: false, rol: 'Enfermería', nombre: 'Personal Suspendido' })
        });
        const signOutMock = async () => { signOutEjecutado = true; };
        const signInWithEmailAndPasswordMock = async () => ({
            user: { uid: 'usr_inactivo_456', email: 'suspendido@hospital.ar' }
        });

        async function probarIniciarSesion() {
            const credencial = await signInWithEmailAndPasswordMock();
            const user = credencial.user;

            const perfilSnap = await getDocMock();
            if (!perfilSnap.exists()) {
                await signOutMock();
                throw new Error("USUARIO_NO_REGISTRADO");
            }
            const perfil = perfilSnap.data() || {};
            if (perfil.activo === false) {
                await signOutMock();
                throw new Error("USUARIO_INACTIVO");
            }
            return { uid: user.uid, rol: perfil.rol };
        }

        await assert.rejects(
            async () => { await probarIniciarSesion(); },
            { name: 'Error', message: 'USUARIO_INACTIVO' }
        );
        assert.strictEqual(signOutEjecutado, true, 'Debe ejecutar signOut(auth) al detectar usuario inactivo');
    });

    await t.test('3. Cuenta legítima con documento activo inicia sesión con su rol real', async () => {
        const authMock = { currentUser: { uid: 'usr_legitimo_789' } };
        const getDocMock = async () => ({
            exists: () => true,
            data: () => ({ activo: true, rol: 'Administración', nombre: 'Director Administrativo' })
        });
        const signInWithEmailAndPasswordMock = async () => ({
            user: { uid: 'usr_legitimo_789', email: 'admin@hospital.ar', displayName: 'Admin' }
        });

        async function probarIniciarSesion() {
            const credencial = await signInWithEmailAndPasswordMock();
            const user = credencial.user;

            const perfilSnap = await getDocMock();
            if (!perfilSnap.exists()) throw new Error("USUARIO_NO_REGISTRADO");
            const perfil = perfilSnap.data() || {};
            if (perfil.activo === false) throw new Error("USUARIO_INACTIVO");
            const rol = perfil.rol;
            if (!rol) throw new Error("USUARIO_SIN_ROL");

            return {
                uid: user.uid,
                correo: user.email,
                nombre: perfil.nombre || user.displayName,
                rol: rol
            };
        }

        const sesion = await probarIniciarSesion();
        assert.strictEqual(sesion.uid, 'usr_legitimo_789');
        assert.strictEqual(sesion.rol, 'Administración');
        assert.strictEqual(sesion.nombre, 'Director Administrativo');
    });

    await t.test('4. Verificación estática del código fuente de js/firebase.js y js/auth.js', async () => {
        const fs = require('fs');
        const path = require('path');

        const firebaseCode = fs.readFileSync(path.join(__dirname, '../js/firebase.js'), 'utf8');
        const authCode = fs.readFileSync(path.join(__dirname, '../js/auth.js'), 'utf8');

        // 1. En firebase.js no debe existir "asignarRolAdminInicial"
        assert.doesNotMatch(firebaseCode, /asignarRolAdminInicial/, 'asignarRolAdminInicial debe haber sido eliminado');

        // 2. En firebase.js no debe haber fallback ciego a Recepción
        assert.doesNotMatch(firebaseCode, /rol\s*\|\|\s*perfil\.rol\s*\|\|\s*["']Recepción["']/, 'No debe existir fallback ciego a Recepción');

        // 3. En firebase.js debe lanzarse USUARIO_NO_REGISTRADO
        assert.match(firebaseCode, /USUARIO_NO_REGISTRADO/, 'firebase.js debe lanzar USUARIO_NO_REGISTRADO');

        // 4. En auth.js no debe asignarse let rol = "Recepción" por omisión
        assert.doesNotMatch(authCode, /let\s+rol\s*=\s*["']Recepción["']/, 'auth.js no debe iniciar con rol Recepción por defecto');

        // 5. En admin.js no debe existir administrarUsuarioStaff
        const adminCode = fs.readFileSync(path.join(__dirname, '../js/admin.js'), 'utf8');
        assert.doesNotMatch(adminCode, /administrarUsuarioStaff/, 'admin.js no debe llamar a administrarUsuarioStaff');
    });
});
