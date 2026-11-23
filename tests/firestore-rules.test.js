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

const PROJECT_ID = 'demo-turnos-firestore-' + process.pid;
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

        // 8. /usuarios: Recepción no puede listar /usuarios ni Médico escribir
        const usuariosBlockMatch = rulesContent.match(/match \/usuarios\/\{uid\}\s*\{([^}]+)\}/);
        assert.ok(usuariosBlockMatch, 'Debe existir la regla match /usuarios/{uid}');
        const usuariosBlock = usuariosBlockMatch[1];
        assert.doesNotMatch(usuariosBlock, /isRecepcion/,
            'El bloque /usuarios no debe otorgar permisos a Recepción');
        assert.doesNotMatch(usuariosBlock, /isMedico/,
            'El bloque /usuarios no debe otorgar permisos a Médico');
        assert.match(usuariosBlock, /allow list:\s*if\s*isSuperAdmin\(\);/,
            'Solo SuperAdmin debe poder listar /usuarios');
        assert.match(usuariosBlock, /allow write:\s*if\s*isSuperAdmin\(\);/,
            'Solo SuperAdmin debe poder escribir /usuarios');

        // 9. Turnos: Inmutabilidad estricta de creadoEn y creadoPor en actualización
        assert.match(rulesContent, /!request\.resource\.data\.diff\(resource\.data\)\.affectedKeys\(\)\.hasAny\(\['creadoEn',\s*'creadoPor'\]\)/,
            'Nadie debe poder modificar creadoEn ni creadoPor después de creado el turno');

        // 10. Turnos: Recepción solo puede escribir llegadaEn / canceladoPor / estado / agenda
        const turnosBlockMatch = rulesContent.match(/match \/turnos\/\{turnoId\}\s*\{([\s\S]+?)\n\s*allow delete:/);
        assert.ok(turnosBlockMatch, 'Debe existir la regla match /turnos/{turnoId}');
        const turnosBlock = turnosBlockMatch[1];
        assert.match(turnosBlock, /llegadaEn/, 'Recepción debe tener permitido registrar llegadaEn');
        assert.match(turnosBlock, /inicioConsultaEn/, 'Médico debe tener permitido registrar inicioConsultaEn');
        assert.match(turnosBlock, /finConsultaEn/, 'Médico debe tener permitido registrar finConsultaEn');

        // 11. Turnos: SuperAdmin creación con estados de demostración y auditoría
        assert.match(rulesContent, /Cancelado por Paciente/, 'SuperAdmin debe poder sembrar turnos en estado cancelado para auditoría y métricas');

        // 12. Turnos Web: Inclusión de cobertura, fecha nacimiento y consentimientos legales
        assert.match(rulesContent, /'pacienteCobertura'/, 'Debe permitir pacienteCobertura en isValidTurnoCreate');
        assert.match(rulesContent, /'pacienteFechaNacimiento'/, 'Debe permitir pacienteFechaNacimiento en isValidTurnoCreate');
        assert.match(rulesContent, /'consentimientoLey25326'/, 'Debe permitir consentimientoLey25326 en isValidTurnoCreate');
        assert.match(rulesContent, /'consentimientoLey26529'/, 'Debe permitir consentimientoLey26529 en isValidTurnoCreate');

        // 13. VULN-01 Resuelta: Eliminación definitiva del borrado no autenticado indiscriminado en disponibilidad
        assert.doesNotMatch(rulesContent, /!\s*isSignedIn\(\)\s*&&\s*request\.time\s*!=\s*null/,
            'VULN-01 resuelta: No debe existir el borrado permisivo no autenticado de disponibilidad');

        // 14. Disponibilidad: Validación de claves en creación y borrado atado a batch getAfter de cancelación de turno
        assert.match(rulesContent, /'turnoId'/,
            'La disponibilidad debe validar la clave turnoId para trazabilidad y vinculación');
        assert.match(rulesContent, /isSlotLiberablePorPaciente\(\)/,
            'La liberación de slots por paciente anónimo debe verificarse mediante función de batch atómico');
        assert.match(rulesContent, /getAfter\(\/databases\/\$\(database\)\/documents\/turnos\/\$\(resource\.data\.turnoId\)\)\.data\.estado\s*==\s*'Cancelado por Paciente'/,
            'La liberación de disponibilidad debe corroborar el estado Cancelado por Paciente vía getAfter');

        // 15. Turnos: Restricción alfanumérica y longitud estricta en get anónimo
        assert.match(rulesContent, /turnoId\.matches\('\^\[a-zA-Z0-9\]\{8,64\}\$'\)/,
            'Debe restringir el formato del ID del turno a alfanumérico Base62 de 8 a 64 caracteres');

        // 16. Internación - Camas: Lectura por staff, creación por SuperAdmin, update por Recepción/Admin, delete SuperAdmin
        assert.match(rulesContent, /match \/camas\/\{camaId\}/,
            'Debe existir la colección camas en firestore.rules');
        assert.match(rulesContent, /function isValidCama\(data\)/,
            'Debe existir la función de validación de esquema para camas');
        assert.match(rulesContent, /match \/camas\/\{camaId\}[\s\S]*?allow create:\s*if\s*isSuperAdmin\(\)\s*&&\s*isValidCama\(request\.resource\.data\);/,
            'Solo SuperAdmin debe poder crear camas hospitalarias');
        assert.match(rulesContent, /match \/camas\/\{camaId\}[\s\S]*?allow delete:\s*if\s*isSuperAdmin\(\);/,
            'Solo SuperAdmin debe poder eliminar camas');
        assert.match(rulesContent, /request\.resource\.data\.estado\s*!=\s*'ocupada'\s*\|\|\s*resource\.data\.estado\s*==\s*'libre'/,
            'Una cama solo puede pasar a estado ocupada si su estado previo era libre (o si es SuperAdmin)');

        // 17. Internación - Historial de Internaciones: Creación por staff, inmutabilidad tras alta, allow delete: if false
        assert.match(rulesContent, /match \/historial_internaciones\/\{historialId\}/,
            'Debe existir la colección historial_internaciones en firestore.rules');
        assert.match(rulesContent, /match \/historial_internaciones\/\{historialId\}[\s\S]*?allow delete:\s*if\s*false;/,
            'Los registros de internación no pueden ser eliminados (inmutabilidad legal)');
        assert.match(rulesContent, /request\.resource\.data\.camaId\s*==\s*resource\.data\.camaId/,
            'El registro de internación debe proteger estrictamente camaId en modificaciones');
        assert.match(rulesContent, /request\.resource\.data\.fechaIngreso\s*==\s*resource\.data\.fechaIngreso/,
            'El registro de internación debe proteger la fechaIngreso original en modificaciones');
        assert.match(rulesContent, /request\.resource\.data\.pacienteDni\s*==\s*resource\.data\.pacienteDni/,
            'El registro de internación debe proteger el pacienteDni original en modificaciones');
        assert.match(rulesContent, /diff\.affectedKeys\(\)\.hasOnly\(\[\s*'medicoTratante',\s*'diagnosticoIngreso',\s*'pacienteCobertura',\s*'observacionesAlta',\s*'actualizadoEn'\s*\]\)/,
            'Debe permitir editar médico y observaciones en estado activa');
        assert.match(rulesContent, /diff\.affectedKeys\(\)\.hasOnly\(\[\s*'fechaAlta',\s*'altaPor',\s*'motivoAlta',\s*'observacionesAlta',\s*'estado',\s*'actualizadoEn'\s*\]\)/,
            'Debe permitir dar el alta con transición de estado y campos específicos');

        // 18. Quirófanos - Estructura física: Lectura staff, escritura exclusiva SuperAdmin
        assert.match(rulesContent, /match \/quirofanos\/\{quirofanoId\}/,
            'Debe existir la colección quirofanos en firestore.rules');
        assert.match(rulesContent, /match \/quirofanos\/\{quirofanoId\}[\s\S]*?allow create:\s*if\s*isSuperAdmin\(\)\s*&&\s*isValidQuirofano\(request\.resource\.data\);/,
            'Solo SuperAdmin debe poder crear salas de quirófano');
        assert.match(rulesContent, /match \/quirofanos\/\{quirofanoId\}[\s\S]*?allow update:\s*if\s*isSuperAdmin\(\)/,
            'Solo SuperAdmin debe poder modificar o desactivar salas de quirófano');
        assert.match(rulesContent, /match \/quirofanos\/\{quirofanoId\}[\s\S]*?allow delete:\s*if\s*isSuperAdmin\(\);/,
            'Solo SuperAdmin debe poder eliminar salas de quirófano');

        // 19. Reservas de Quirófano: Validación temporal, estados según rol y autoría
        assert.match(rulesContent, /match \/reservas_quirofano\/\{reservaId\}/,
            'Debe existir la colección reservas_quirofano en firestore.rules');
        assert.match(rulesContent, /function isValidReservaQuirofano\(data\)/,
            'Debe existir la función de validación de reservas quirúrgicas');
        assert.match(rulesContent, /allow create:\s*if\s*puedeCrearReservaQuirofano\(\);/,
            'La creación de reservas de quirófano debe regirse por puedeCrearReservaQuirofano()');
        assert.match(rulesContent, /match \/reservas_quirofano\/\{reservaId\}[\s\S]*?allow delete:\s*if\s*isSuperAdmin\(\);/,
            'Solo SuperAdmin debe poder eliminar reservas de quirófano');
        assert.match(rulesContent, /resource\.data\.creadoPor\.uid\s*==\s*request\.auth\.uid\s*&&\s*request\.resource\.data\.estado\s*==\s*'cancelado'/,
            'Un médico autor solo puede cancelar su propia reserva quirúrgica');
        assert.doesNotMatch(rulesContent, /!diff\.affectedKeys\(\)\.hasAny\(\[\s*'creadoPor'/,
            'puedeActualizarReservaQuirofano no debe contener la cláusula redundante hasAny previa a hasOnly');

        // 20. Cartelera TV / Llamador de Sala (/llamador_turnos)
        assert.match(rulesContent, /match \/llamador_turnos\/\{llamadoId\}/,
            'Debe existir la colección llamador_turnos en firestore.rules');
        assert.match(rulesContent, /function isValidLlamador\(data\)/,
            'Debe existir la función de validación isValidLlamador');
        assert.match(rulesContent, /data\.estado in \['llamando',\s*'atendiendo',\s*'finalizado'\];/,
            'isValidLlamador solo debe permitir los estados llamando, atendiendo y finalizado (sin cancelado)');
        assert.match(rulesContent, /allow create:\s*if\s*\(isSuperAdmin\(\)\s*\|\|\s*isRecepcion\(\)\s*\|\|\s*isMedico\(\)\s*\|\|\s*isEnfermeria\(\)\)\s*&&\s*isValidLlamador\(request\.resource\.data\);/,
            'allow create en llamador_turnos debe verificar roles de staff y validar el esquema completo');
        assert.match(rulesContent, /allow update:\s*if\s*\(isSuperAdmin\(\)\s*\|\|\s*isRecepcion\(\)\s*\|\|\s*isMedico\(\)\s*\|\|\s*isEnfermeria\(\)\)\s*&&\s*isValidLlamador\(request\.resource\.data\)\s*&&\s*request\.resource\.data\.diff\(resource\.data\)\.affectedKeys\(\)\.hasOnly\(\['estado',\s*'llamadoEn'\]\);/,
            'allow update en llamador_turnos debe separar create de update y restringir las claves modificables únicamente a estado y llamadoEn');
        assert.match(rulesContent, /match \/llamador_turnos\/\{llamadoId\}[\s\S]*?allow delete:\s*if\s*isSuperAdmin\(\)\s*\|\|\s*isRecepcion\(\);/,
            'allow delete en llamador_turnos debe mantenerse para SuperAdmin o Recepción');
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

        await t.test('5. usuarios: Recepción NO puede listar usuarios', async () => {
            const recepDb = testEnv.authenticatedContext('recep_1', { rol: 'Recepción' }).firestore();
            await rulesTesting.assertFails(recepDb.collection('usuarios').get());
        });

        await t.test('6. usuarios: Médico NO puede escribir usuarios', async () => {
            const medDb = testEnv.authenticatedContext('med_1', { rol: 'Médico' }).firestore();
            await rulesTesting.assertFails(medDb.collection('usuarios').doc('nuevo_u').set({ nombre: 'Hack' }));
        });
    } else {
        await t.test('2. Pruebas dinámicas con emulador de Firestore', (context) => {
            context.skip('Omitidas: Requiere emulador local de Firestore (FIRESTORE_EMULATOR_HOST no configurado o Java/firebase-tools no disponibles). Ejecute "npm run test:rules" en un entorno con Java y Firebase CLI.');
        });
    }
});
