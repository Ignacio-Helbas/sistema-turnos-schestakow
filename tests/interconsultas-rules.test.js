/**
 * Pruebas automatizadas de reglas de seguridad de Firestore para Interconsultas Médicas
 * Verifica la matriz de confidencialidad, roles y modelo de amenazas.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

let rulesTesting;
try {
    rulesTesting = require('@firebase/rules-unit-testing');
} catch (_) {
    rulesTesting = null;
}

const PROJECT_ID = 'demo-turnos-schestakow';
const RULES_PATH = path.resolve(__dirname, '../firestore.rules');

test('Matriz de Reglas de Seguridad - Módulo de Interconsultas', async (t) => {
    const rulesContent = fs.readFileSync(RULES_PATH, 'utf8');

    // 1. Verificación Estática de Reglas de Interconsultas
    await t.test('1. Verificación estática de reglas de Interconsultas en firestore.rules', () => {
        // match /interconsultas/{interconsultaId}
        assert.match(rulesContent, /match \/interconsultas\/\{interconsultaId\}/,
            'Debe existir la regla match /interconsultas/{interconsultaId}');

        // allow read: solo médico participante
        assert.match(rulesContent, /allow read:\s*if\s*isMedico\(\)\s*&&\s*request\.auth\.uid in resource\.data\.participantes;/,
            'Solo médicos en el array participantes deben tener permiso de lectura');

        // allow create: solo médico y validación estricta
        assert.match(rulesContent, /allow create:\s*if\s*isMedico\(\)\s*&&\s*isValidInterconsultaCreate\(\);/,
            'Solo médicos pueden crear interconsultas con datos válidos');

        // allow delete: if false (no se borran, se cierran)
        assert.match(rulesContent, /allow delete:\s*if\s*false;/,
            'Las interconsultas no se borran (allow delete: if false)');

        // match /mensajes/{mensajeId}
        assert.match(rulesContent, /match \/mensajes\/\{mensajeId\}/,
            'Debe existir la subcolección mensajes dentro de interconsultas');

        // Trazabilidad de mensajes: no update, no delete
        assert.match(rulesContent, /match \/mensajes\/\{mensajeId\}[\s\S]*?allow update,\s*delete:\s*if\s*false;/,
            'Los mensajes son inmutables (no se editan ni se borran)');

        // autorUid verificado contra request.auth.uid
        assert.match(rulesContent, /request\.resource\.data\.autorUid\s*==\s*request\.auth\.uid/,
            'No se puede falsificar autorUid en los mensajes');

        // Recepción y Administración sin acceso
        const interconsultasBlock = rulesContent.match(/match \/interconsultas\/\{interconsultaId\}[\s\S]*?\n\s*\/\/ ===/)?.[0] || '';
        assert.doesNotMatch(interconsultasBlock, /isRecepcion/,
            'Recepción no debe tener acceso a interconsultas');
        assert.doesNotMatch(interconsultasBlock, /isSuperAdmin/,
            'Administración no debe tener acceso a interconsultas');
    });

    // 2. Pruebas dinámicas con emulador de Firebase si FIRESTORE_EMULATOR_HOST está presente
    if (rulesTesting && process.env.FIRESTORE_EMULATOR_HOST) {
        let testEnv;

        try {
            testEnv = await rulesTesting.initializeTestEnvironment({
                projectId: PROJECT_ID,
                firestore: { rules: rulesContent }
            });
        } catch (err) {
            console.warn('Emulador no disponible para pruebas dinámicas:', err.message);
            return;
        }

        // Configuración previa de usuarios en el emulador
        await testEnv.withSecurityRulesDisabled(async (context) => {
            const db = context.firestore();
            await db.collection('usuarios').doc('medico-1').set({ rol: 'Médico', nombre: 'Dr. Uno' });
            await db.collection('usuarios').doc('medico-2').set({ rol: 'Médico', nombre: 'Dra. Dos' });
            await db.collection('usuarios').doc('medico-ajeno').set({ rol: 'Médico', nombre: 'Dr. Ajeno' });
            await db.collection('usuarios').doc('recepcion-1').set({ rol: 'Recepción', nombre: 'Recepción' });
            await db.collection('usuarios').doc('admin-1').set({ rol: 'Administración', nombre: 'Admin' });
        });

        await t.test('2. Un médico participante crea interconsulta válida (PERMITIDO)', async () => {
            const db = testEnv.authenticatedContext('medico-1').firestore();
            const interconsultaRef = db.collection('interconsultas').doc('ic-1');

            await rulesTesting.assertSucceeds(interconsultaRef.set({
                idTurno: 'turno-123',
                codigoTurno: 'COD-123',
                asunto: 'Evaluación cardiológica',
                motivo: 'Paciente con soplos funcionales',
                especialidadDestino: 'Cardiología',
                prioridad: 'normal',
                estado: 'pendiente',
                creadaPor: 'medico-1',
                participantes: ['medico-1', 'medico-2'],
                lecturas: {},
                creadaEn: new Date(),
                actualizadaEn: new Date()
            }));
        });

        await t.test('3. Un participante lee la interconsulta y envía un mensaje (PERMITIDO)', async () => {
            const db1 = testEnv.authenticatedContext('medico-1').firestore();
            await rulesTesting.assertSucceeds(db1.collection('interconsultas').doc('ic-1').get());

            const db2 = testEnv.authenticatedContext('medico-2').firestore();
            await rulesTesting.assertSucceeds(db2.collection('interconsultas').doc('ic-1').get());

            const mensajeRef = db2.collection('interconsultas').doc('ic-1').collection('mensajes').doc('msg-1');
            await rulesTesting.assertSucceeds(mensajeRef.set({
                autorUid: 'medico-2',
                texto: 'Revisé los datos del ecocardiograma.',
                tipo: 'mensaje',
                creadoEn: new Date()
            }));
        });

        await t.test('4. Un médico que NO participa NO puede leer la interconsulta (DENEGADO)', async () => {
            const dbAjeno = testEnv.authenticatedContext('medico-ajeno').firestore();
            await rulesTesting.assertFails(dbAjeno.collection('interconsultas').doc('ic-1').get());
        });

        await t.test('5. Recepción y Administración NO pueden leer interconsultas (DENEGADO)', async () => {
            const dbRec = testEnv.authenticatedContext('recepcion-1').firestore();
            await rulesTesting.assertFails(dbRec.collection('interconsultas').doc('ic-1').get());

            const dbAdmin = testEnv.authenticatedContext('admin-1').firestore();
            await rulesTesting.assertFails(dbAdmin.collection('interconsultas').doc('ic-1').get());
        });

        await t.test('6. Un usuario sin sesión NO puede leer ni escribir (DENEGADO)', async () => {
            const dbAnon = testEnv.unauthenticatedContext().firestore();
            await rulesTesting.assertFails(dbAnon.collection('interconsultas').doc('ic-1').get());
            await rulesTesting.assertFails(dbAnon.collection('interconsultas').doc('ic-anon').set({
                asunto: 'Inseguro'
            }));
        });

        await t.test('7. Un mensaje NO se puede editar ni borrar (DENEGADO)', async () => {
            const db1 = testEnv.authenticatedContext('medico-1').firestore();
            const msgRef = db1.collection('interconsultas').doc('ic-1').collection('mensajes').doc('msg-1');
            await rulesTesting.assertFails(msgRef.update({ texto: 'Texto modificado' }));
            await rulesTesting.assertFails(msgRef.delete());
        });

        await t.test('8. NO se puede falsificar autorUid en los mensajes (DENEGADO)', async () => {
            const db1 = testEnv.authenticatedContext('medico-1').firestore();
            const msgFalsoRef = db1.collection('interconsultas').doc('ic-1').collection('mensajes').doc('msg-fake');
            await rulesTesting.assertFails(msgFalsoRef.set({
                autorUid: 'medico-2', // Intento de suplantar al colega
                texto: 'Mensaje con identidad falsa',
                tipo: 'mensaje',
                creadoEn: new Date()
            }));
        });

        await testEnv.cleanup();
    }
});
