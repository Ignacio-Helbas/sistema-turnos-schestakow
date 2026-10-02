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
    rulesTesting = null;
}

const PROJECT_ID = 'demo-turnos-schestakow';
const RULES_PATH = path.resolve(__dirname, '../firestore.rules');

test('Matriz de Seguridad de Reglas de Firestore', async (t) => {
    // Verificación estática de seguridad de esquema de firestore.rules
    await t.test('1. Verificación estática de reglas de Firestore', () => {
        const rulesContent = fs.readFileSync(RULES_PATH, 'utf8');
        
        // 1. Cierre por defecto
        assert.match(rulesContent, /match \/\{document=\*\*\} \{\s*allow read, write: if false;\s*\}/, 
            'Debe contener cierre por defecto de lectura y escritura');

        // 2. Denegación de lectura pública de usuarios y turnos
        assert.doesNotMatch(rulesContent, /match \/usuarios\/\{uid\} \{\s*allow read: if true;/,
            'La colección usuarios NO debe permitir lectura pública abierta');
        assert.doesNotMatch(rulesContent, /match \/turnos\/\{turnoId\} \{\s*allow read: if true;/,
            'La colección turnos NO debe permitir lectura pública abierta');

        // 3. Catálogo de médicos públicos separado
        assert.match(rulesContent, /match \/medicos_publicos\/\{medicoUid\} \{\s*allow read: if true;\s*allow write: if isSuperAdmin\(\);/,
            'Debe existir la colección medicos_publicos protegida para escritura');

        // 4. Eliminación de correo hardcodeado
        assert.doesNotMatch(rulesContent, /nachohelbas@gmail\.com/,
            'No debe contener correos electrónicos personales hardcodeados');

        // 5. Historia Clínica: Inmutabilidad estricta de consultas
        assert.match(rulesContent, /match \/consultas\/\{consultaId\} \{[\s\S]*?allow update, delete: if false;/,
            'Las consultas médicas deben ser estrictamente inmutables (update y delete en false)');

        // 6. Auditoría: append-only
        assert.match(rulesContent, /match \/auditoria\/\{auditId\} \{[\s\S]*?allow update, delete: if false;/,
            'Los registros de auditoría no pueden ser modificados ni borrados');

        // 7. Acceso a historia clínica: solo médicos autorizados o emergencia
        assert.match(rulesContent, /match \/acceso\/\{medicoUid\}/,
            'Debe existir control de acceso explícito por médico para la historia clínica');
    });

    // Si está disponible el emulador en vivo, se ejecutan las pruebas de integración
    if (rulesTesting && process.env.FIRESTORE_EMULATOR_HOST) {
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

        await t.test('2. turnos: Denegado listado público para anónimos', async () => {
            const unauthedDb = testEnv.unauthenticatedContext().firestore();
            await rulesTesting.assertFails(unauthedDb.collection('turnos').get());
        });

        await t.test('3. consultas: Inmutable - Denegado update y delete para cualquier rol', async () => {
            const adminDb = testEnv.authenticatedContext('admin_1', { rol: 'Administración' }).firestore();
            const consultaRef = adminDb.collection('pacientes').doc('pac_1').collection('consultas').doc('cons_1');

            await rulesTesting.assertFails(consultaRef.update({ evolucion: 'Texto modificado' }));
            await rulesTesting.assertFails(consultaRef.delete());
        });

        await t.test('4. auditoria: Denegado update y delete', async () => {
            const staffDb = testEnv.authenticatedContext('med_1', { rol: 'Médico' }).firestore();
            const auditRef = staffDb.collection('auditoria').doc('aud_1');

            await rulesTesting.assertFails(auditRef.update({ detalle: 'Modificación' }));
            await rulesTesting.assertFails(auditRef.delete());
        });
    }
});
