/**
 * Pruebas automatizadas de reglas de seguridad de Firestore (Emulator Tests)
 * Casos permitidos y denegados según matriz de acceso y modelo de amenazas.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// Intentar cargar @firebase/rules-unit-testing si el emulador está disponible
let rulesTesting;
try {
    rulesTesting = require('@firebase/rules-unit-testing');
} catch (e) {
    // Entorno sin dependencias instaladas localmente
    rulesTesting = null;
}

const PROJECT_ID = 'demo-turnos-schestakow';
const RULES_PATH = path.resolve(__dirname, '../firestore.rules');

test('Matriz de Seguridad de Reglas de Firestore', async (t) => {
    // Si no está instalado el SDK de testing de emulador o no hay emulador activo,
    // se ejecuta la suite de validación lógica de esquema y especificación
    if (!rulesTesting || !process.env.FIRESTORE_EMULATOR_HOST) {
        await t.test('Verificación estática de firestore.rules', () => {
            const rulesContent = fs.readFileSync(RULES_PATH, 'utf8');
            
            // 1. Cierre por defecto
            assert.match(rulesContent, /match \/\{document=\*\*\} \{\s*allow read, write: if false;\s*\}/, 
                'Debe contener cierre por defecto de lectura y escritura');

            // 2. Denegación de lectura pública de usuarios
            assert.doesNotMatch(rulesContent, /match \/usuarios\/\{uid\} \{\s*allow read: if true;/,
                'La colección usuarios NO debe permitir lectura pública abierta');

            // 3. Denegación de listado público de turnos
            assert.doesNotMatch(rulesContent, /match \/turnos\/\{turnoId\} \{\s*allow read: if true;/,
                'La colección turnos NO debe permitir lectura pública abierta');

            // 4. Catálogo de médicos públicos separado
            assert.match(rulesContent, /match \/medicos_publicos\/\{medicoUid\} \{\s*allow read: if true;\s*allow write: if isSuperAdmin\(\);/,
                'Debe existir la colección medicos_publicos protegida para escritura');

            // 5. Eliminación de correo hardcodeado
            assert.doesNotMatch(rulesContent, /nachohelbas@gmail\.com/,
                'No debe contener correos electrónicos personales hardcodeados');

            // 6. Validación de esquema en create de turnos
            assert.match(rulesContent, /isValidTurnoCreate\(\)/,
                'Debe exigir función de validación estricta de esquema para creación de turnos');
        });
        return;
    }

    // Suite de pruebas completa contra el Emulador de Firestore
    const rules = fs.readFileSync(RULES_PATH, 'utf8');
    let testEnv;

    try {
        testEnv = await rulesTesting.initializeTestEnvironment({
            projectId: PROJECT_ID,
            firestore: { rules }
        });
    } catch (err) {
        console.warn('Emulador de Firestore no detectado. Omitiendo pruebas en vivo:', err.message);
        return;
    }

    t.after(async () => {
        if (testEnv) await testEnv.cleanup();
    });

    await t.test('1. turnos: Denegado listado público para anónimos', async () => {
        const unauthedDb = testEnv.unauthenticatedContext().firestore();
        await rulesTesting.assertFails(unauthedDb.collection('turnos').get());
    });

    await t.test('2. turnos: Permitido get puntual con ID impredecible (>=16 chars)', async () => {
        const adminDb = testEnv.authenticatedContext('admin_user', { rol: 'Administración' }).firestore();
        const docId = 'tokenSeguro123456789ABC';
        await adminDb.collection('turnos').doc(docId).set({
            especialidad: 'Cardiología',
            medico: 'Dr. San Martín',
            medicoUid: 'medico_1',
            fecha: '2026-11-15',
            horario: '09:00',
            pacienteNombre: 'Juan Perez',
            pacienteDni: '30111222',
            pacienteCelular: '2604123456',
            pacienteEmail: '',
            codigoConfirmacion: docId,
            canal: 'Web',
            estado: 'Confirmado',
            creadoEn: new Date()
        });

        const unauthedDb = testEnv.unauthenticatedContext().firestore();
        await rulesTesting.assertSuccess(unauthedDb.collection('turnos').doc(docId).get());
    });

    await t.test('3. turnos: Denegado create con campos no autorizados o clínicos', async () => {
        const unauthedDb = testEnv.unauthenticatedContext().firestore();
        const docId = 'tokenSeguro999888777XYZ';
        await rulesTesting.assertFails(unauthedDb.collection('turnos').doc(docId).set({
            especialidad: 'Cardiología',
            medico: 'Dr. San Martín',
            medicoUid: 'medico_1',
            fecha: '2026-11-15',
            horario: '09:00',
            pacienteNombre: 'Juan Perez',
            pacienteDni: '30111222',
            pacienteCelular: '2604123456',
            codigoConfirmacion: docId,
            canal: 'Web',
            estado: 'Confirmado',
            evolucionMedica: 'Intento de inyección de dato clínico' // Campo prohibido
        }));
    });

    await t.test('4. usuarios: Denegada lectura anónima de perfiles privados', async () => {
        const unauthedDb = testEnv.unauthenticatedContext().firestore();
        await rulesTesting.assertFails(unauthedDb.collection('usuarios').get());
    });

    await t.test('5. medicos_publicos: Permitida lectura pública de profesionales', async () => {
        const unauthedDb = testEnv.unauthenticatedContext().firestore();
        await rulesTesting.assertSuccess(unauthedDb.collection('medicos_publicos').get());
    });
});
