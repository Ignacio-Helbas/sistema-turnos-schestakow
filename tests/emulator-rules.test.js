/**
 * Pruebas dinámicas de reglas de seguridad contra Emulador local de Firestore.
 * 
 * NOTA: Este archivo define la suite de pruebas unitarias dinámicas de integración.
 * Su ejecución se omite automáticamente (skip) cuando no se detecta la variable de
 * entorno FIRESTORE_EMULATOR_HOST.
 * 
 * Para ejecutar estas pruebas contra el emulador:
 *   npm run test:rules
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const HAS_EMULATOR = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const SKIP_MSG = 'Omitido: Requiere emulador local de Firestore activo (FIRESTORE_EMULATOR_HOST no configurado). Para ejecutar esta suite dinámica con Java y Firebase CLI, utilice "npm run test:rules".';

const PROJECT_ID = 'demo-turnos-schestakow';
const RULES_PATH = path.resolve(__dirname, '../firestore.rules');

test('Reglas de Seguridad en Emulador de Firestore (Suite Dinámica)', async (suite) => {
    if (!HAS_EMULATOR) {
        suite.skip(SKIP_MSG);
        return;
    }

    const { initializeTestEnvironment, assertFails, assertSucceeds } = require('@firebase/rules-unit-testing');
    const firebaseCompat = require('firebase/compat/app');
    require('firebase/compat/firestore');
    const serverTimestamp = () => firebaseCompat.firestore.FieldValue.serverTimestamp();

    const rules = fs.readFileSync(RULES_PATH, 'utf8');
    const testEnv = await initializeTestEnvironment({
        projectId: PROJECT_ID,
        firestore: { rules }
    });

    suite.after(async () => {
        if (testEnv) await testEnv.cleanup();
    });

    suite.afterEach(async () => {
        if (testEnv) await testEnv.clearFirestore();
    });

    // Caso 1: Anónimo no puede crear documento en /usuarios
    await suite.test('1. Anónimo no puede crear documento en /usuarios', async () => {
        const unauthedDb = testEnv.unauthenticatedContext().firestore();
        await assertFails(
            unauthedDb.collection('usuarios').doc('user_anon').set({
                nombre: 'Atacante Anónimo',
                rol: 'Administración'
            })
        );
    });

    // Caso 2: Usuario autenticado sin rol no puede crear documento en /usuarios con rol Administrador
    await suite.test('2. Usuario autenticado sin rol no puede crear documento en /usuarios con rol Administrador', async () => {
        const authedNoRoleDb = testEnv.authenticatedContext('user_norole').firestore();
        await assertFails(
            authedNoRoleDb.collection('usuarios').doc('user_norole').set({
                nombre: 'Atacante Registrado',
                rol: 'Administración'
            })
        );
    });

    // Caso 3: Superadmin puede crear documento en /usuarios
    await suite.test('3. Superadmin puede crear documento en /usuarios', async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            await context.firestore().collection('usuarios').doc('admin_root').set({
                rol: 'Administración',
                activo: true
            });
        });

        const adminDb = testEnv.authenticatedContext('admin_root').firestore();
        await assertSucceeds(
            adminDb.collection('usuarios').doc('nuevo_staff').set({
                nombre: 'Personal Nuevo',
                rol: 'Recepción',
                activo: true
            })
        );
    });

    // Caso 4: Anónimo puede crear turno público con datos válidos
    await suite.test('4. Anónimo puede crear turno público con datos válidos', async () => {
        const unauthedDb = testEnv.unauthenticatedContext().firestore();
        const turnoData = {
            especialidad: 'Clínica Médica',
            medico: 'Dr. Roberto Gómez',
            medicoUid: 'med_001',
            fecha: '2026-10-25',
            horario: '08:30',
            pacienteNombre: 'Juan Carlos Pérez',
            pacienteDni: '30123456',
            pacienteCelular: '2604123456',
            pacienteEmail: 'juan.perez@example.com',
            pacienteCobertura: 'Pública Exclusiva (Sin Obra Social)',
            pacienteFechaNacimiento: '1985-05-15',
            consentimientoLey25326: true,
            consentimientoLey26529: true,
            codigoConfirmacion: 'SCH-7X9K2M',
            canal: 'Web',
            estado: 'Confirmado',
            creadoEn: serverTimestamp()
        };
        await assertSucceeds(
            unauthedDb.collection('turnos').doc('TURNO_WEB_12345').set(turnoData)
        );
    });

    // Caso 5: Anónimo no puede leer turnos por listado (collection get)
    await suite.test('5. Anónimo no puede leer turnos por listado (collection get)', async () => {
        const unauthedDb = testEnv.unauthenticatedContext().firestore();
        await assertFails(
            unauthedDb.collection('turnos').get()
        );
    });

    // Caso 6: Paciente puede leer su turno específico conociendo el ID
    await suite.test('6. Paciente puede leer su turno específico conociendo el ID', async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            await context.firestore().collection('turnos').doc('TURNO_SECRETO_987').set({
                pacienteNombre: 'Paciente Simulado',
                estado: 'Confirmado'
            });
        });

        const unauthedDb = testEnv.unauthenticatedContext().firestore();
        await assertSucceeds(
            unauthedDb.collection('turnos').doc('TURNO_SECRETO_987').get()
        );
    });

    // Caso 7: Médico autenticado puede crear consulta clínica
    await suite.test('7. Médico autenticado puede crear consulta clínica', async () => {
        const medicoUid = 'med_clinico_01';
        const pacienteId = 'pac_12345';

        await testEnv.withSecurityRulesDisabled(async (context) => {
            await context.firestore().collection('usuarios').doc(medicoUid).set({
                rol: 'Médico',
                activo: true
            });
            await context.firestore().collection('pacientes').doc(pacienteId).collection('acceso').doc(medicoUid).set({
                medicoUid: medicoUid,
                turnoId: 'TURNO_WEB_12345',
                concedidoEn: serverTimestamp()
            });
        });

        const medDb = testEnv.authenticatedContext(medicoUid).firestore();
        const consultaRef = medDb.collection('pacientes').doc(pacienteId).collection('consultas').doc('cons_001');

        await assertSucceeds(
            consultaRef.set({
                turnoId: 'TURNO_WEB_12345',
                medicoUid: medicoUid,
                medicoNombre: 'Dr. Médico Clínico',
                fecha: serverTimestamp(),
                motivo: 'Consulta general de control anual',
                evolucion: 'Paciente lúcido, afebril, normotenso. Examen clínico sin particularidades.',
                indicaciones: 'Laboratorio de rutina en 6 meses.',
                diagnostico: 'Examen de salud general de rutina',
                diagnosticoCodigo: 'Z00.0',
                signosVitales: { pa: '120/80', fc: 75, temp: 36.6, sat: 98 },
                corrige: null
            })
        );
    });

    // Caso 8: Médico no puede modificar consulta clínica ya creada (inmutabilidad por reglas)
    await suite.test('8. Médico no puede modificar consulta clínica ya creada (inmutabilidad por reglas)', async () => {
        const medicoUid = 'med_clinico_01';
        const pacienteId = 'pac_12345';

        await testEnv.withSecurityRulesDisabled(async (context) => {
            await context.firestore().collection('usuarios').doc(medicoUid).set({
                rol: 'Médico',
                activo: true
            });
            await context.firestore().collection('pacientes').doc(pacienteId).collection('consultas').doc('cons_asentada').set({
                turnoId: 'TURNO_WEB_12345',
                medicoUid: medicoUid,
                evolucion: 'Evolución original asentada en historia clínica'
            });
        });

        const medDb = testEnv.authenticatedContext(medicoUid).firestore();
        const consultaRef = medDb.collection('pacientes').doc(pacienteId).collection('consultas').doc('cons_asentada');

        await assertFails(
            consultaRef.update({
                evolucion: 'Intento de modificación indebida posterior'
            })
        );
    });

    // Caso 9: Usuario no autenticado no puede crear consulta clínica
    await suite.test('9. Usuario no autenticado no puede crear consulta clínica', async () => {
        const unauthedDb = testEnv.unauthenticatedContext().firestore();
        const consultaRef = unauthedDb.collection('pacientes').doc('pac_12345').collection('consultas').doc('cons_intruso');

        await assertFails(
            consultaRef.set({
                motivo: 'Intento de inserción sin autenticación',
                evolucion: 'Texto no autorizado'
            })
        );
    });

    // Caso 10: Usuario autenticado sin rol no puede modificar turnos
    await suite.test('10. Usuario autenticado sin rol no puede modificar turnos', async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            await context.firestore().collection('turnos').doc('TURNO_TEST_10').set({
                estado: 'Confirmado',
                creadoEn: serverTimestamp(),
                creadoPor: null
            });
        });

        const authedNoRoleDb = testEnv.authenticatedContext('user_norole').firestore();
        await assertFails(
            authedNoRoleDb.collection('turnos').doc('TURNO_TEST_10').update({
                estado: 'Atendido'
            })
        );
    });

    // Caso 11: Usuario autenticado sin rol no puede leer perfil de otro usuario en /usuarios ni listar
    await suite.test('11. Usuario autenticado sin rol no puede leer perfil de otro usuario en /usuarios ni listar', async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            await context.firestore().collection('usuarios').doc('admin_target').set({
                rol: 'Administración',
                nombre: 'Admin Privado'
            });
        });

        const authedNoRoleDb = testEnv.authenticatedContext('user_norole').firestore();
        await assertFails(
            authedNoRoleDb.collection('usuarios').doc('admin_target').get()
        );
        await assertFails(
            authedNoRoleDb.collection('usuarios').get()
        );
    });

    // Caso 12: Usuario autenticado sin rol no puede escribir en ninguna colección asistencial
    await suite.test('12. Usuario autenticado sin rol no puede escribir en ninguna colección asistencial', async () => {
        const authedNoRoleDb = testEnv.authenticatedContext('user_norole').firestore();

        // 12.a) No puede crear consultas médicas
        await assertFails(
            authedNoRoleDb.collection('pacientes').doc('pac_001').collection('consultas').doc('cons_norole').set({
                motivo: 'Intento de consulta por usuario sin rol',
                evolucion: 'Texto asistencial'
            })
        );

        // 12.b) No puede escribir resumen clínico
        await assertFails(
            authedNoRoleDb.collection('pacientes').doc('pac_001').collection('clinico').doc('resumen').set({
                alergias: 'Penicilina'
            })
        );

        // 12.c) No puede concederse acceso clínico a la historia del paciente
        await assertFails(
            authedNoRoleDb.collection('pacientes').doc('pac_001').collection('acceso').doc('user_norole').set({
                medicoUid: 'user_norole',
                motivoEmergencia: 'Auto-habilitacion no autorizada'
            })
        );

        // 12.d) No puede crear interconsultas médicas
        await assertFails(
            authedNoRoleDb.collection('interconsultas').doc('inter_001').set({
                asunto: 'Interconsulta no autorizada',
                estado: 'pendiente'
            })
        );
    });

    // Caso 13: Cuenta sin rol NO puede leer, crear ni modificar /pacientes ni /pacientes_por_dni
    await suite.test('13. Cuenta sin rol no puede leer, crear ni modificar /pacientes ni /pacientes_por_dni', async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            await context.firestore().collection('pacientes').doc('pac_existente').set({
                nombre: 'Carlos',
                apellido: 'Gomez',
                dni: '28111222'
            });
            await context.firestore().collection('pacientes_por_dni').doc('28111222').set({
                pacienteId: 'pac_existente',
                dni: '28111222',
                creadoEn: serverTimestamp()
            });
        });

        const authedNoRoleDb = testEnv.authenticatedContext('user_norole').firestore();

        // No puede leer pacientes
        await assertFails(authedNoRoleDb.collection('pacientes').doc('pac_existente').get());
        await assertFails(authedNoRoleDb.collection('pacientes').get());

        // No puede crear ni modificar pacientes
        await assertFails(
            authedNoRoleDb.collection('pacientes').doc('pac_nuevo').set({
                nombre: 'Intruso',
                apellido: 'NoAutorizado',
                dni: '40111222'
            })
        );
        await assertFails(
            authedNoRoleDb.collection('pacientes').doc('pac_existente').update({
                nombre: 'Carlos Modificado'
            })
        );

        // No puede leer ni crear en pacientes_por_dni
        await assertFails(authedNoRoleDb.collection('pacientes_por_dni').doc('28111222').get());
        await assertFails(
            authedNoRoleDb.collection('pacientes_por_dni').doc('40111222').set({
                pacienteId: 'pac_nuevo',
                dni: '40111222',
                creadoEn: serverTimestamp()
            })
        );
    });

    // Caso 14: Recepción puede crear un paciente válido
    await suite.test('14. Recepción puede crear un paciente válido', async () => {
        const recepUid = 'recep_01';
        await testEnv.withSecurityRulesDisabled(async (context) => {
            await context.firestore().collection('usuarios').doc(recepUid).set({
                rol: 'Recepción',
                activo: true
            });
        });

        const recepDb = testEnv.authenticatedContext(recepUid).firestore();
        await assertSucceeds(
            recepDb.collection('pacientes').doc('pac_recep_01').set({
                dni: '35999888',
                nombre: 'Mariana',
                apellido: 'Lopez',
                fechaNacimiento: '1992-04-10',
                sexo: 'Femenino',
                contacto: '2604998877',
                creadoEn: serverTimestamp(),
                creadoPor: recepUid
            })
        );
    });

    // Caso 15: Médico puede leer un paciente
    await suite.test('15. Médico puede leer un paciente', async () => {
        const medUid = 'med_lector_01';
        await testEnv.withSecurityRulesDisabled(async (context) => {
            await context.firestore().collection('usuarios').doc(medUid).set({
                rol: 'Médico',
                activo: true
            });
            await context.firestore().collection('pacientes').doc('pac_para_medico').set({
                dni: '31222333',
                nombre: 'Esteban',
                apellido: 'Rivas'
            });
        });

        const medDb = testEnv.authenticatedContext(medUid).firestore();
        await assertSucceeds(
            medDb.collection('pacientes').doc('pac_para_medico').get()
        );
    });

    // Caso 16: Recepción puede crear auditoría con actorUid igual a su uid (y falla con otro uid)
    await suite.test('16. Recepción puede crear auditoría solo con actorUid igual a su uid', async () => {
        const recepUid = 'recep_auditor';
        await testEnv.withSecurityRulesDisabled(async (context) => {
            await context.firestore().collection('usuarios').doc(recepUid).set({
                rol: 'Recepción',
                activo: true
            });
        });

        const recepDb = testEnv.authenticatedContext(recepUid).firestore();

        // Éxito: actorUid coincide con request.auth.uid
        await assertSucceeds(
            recepDb.collection('auditoria').doc('aud_legitima').set({
                actorUid: recepUid,
                actorRol: 'Recepción',
                accion: 'admision_paciente',
                pacienteId: 'pac_01',
                fecha: serverTimestamp(),
                detalle: 'Paciente admitido en sala'
            })
        );

        // Falla: actorUid falsificado
        await assertFails(
            recepDb.collection('auditoria').doc('aud_falsificada').set({
                actorUid: 'otro_usuario_suplantado',
                actorRol: 'Recepción',
                accion: 'admision_paciente',
                pacienteId: 'pac_01',
                fecha: serverTimestamp(),
                detalle: 'Intento de spoofing de actorUid'
            })
        );
    });

    // Caso 17: Administración puede leer auditoría (y otros roles/anónimos no pueden)
    await suite.test('17. Administración puede leer auditoría (y otros roles no pueden)', async () => {
        const adminUid = 'admin_auditor';
        const recepUid = 'recep_no_auditor';

        await testEnv.withSecurityRulesDisabled(async (context) => {
            await context.firestore().collection('usuarios').doc(adminUid).set({
                rol: 'Administración',
                activo: true
            });
            await context.firestore().collection('usuarios').doc(recepUid).set({
                rol: 'Recepción',
                activo: true
            });
            await context.firestore().collection('auditoria').doc('aud_evento_1').set({
                actorUid: adminUid,
                actorRol: 'Administración',
                accion: 'configuracion_agenda',
                fecha: serverTimestamp()
            });
        });

        const adminDb = testEnv.authenticatedContext(adminUid).firestore();
        const recepDb = testEnv.authenticatedContext(recepUid).firestore();
        const unauthedDb = testEnv.unauthenticatedContext().firestore();

        // Administración sí puede leer
        await assertSucceeds(adminDb.collection('auditoria').doc('aud_evento_1').get());
        await assertSucceeds(adminDb.collection('auditoria').get());

        // Recepción y anónimo no pueden leer auditoría
        await assertFails(recepDb.collection('auditoria').doc('aud_evento_1').get());
        await assertFails(recepDb.collection('auditoria').get());
        await assertFails(unauthedDb.collection('auditoria').get());
    });

    // Caso 18: Un anónimo no puede leer, crear ni modificar /pacientes, /pacientes_por_dni ni /auditoria
    await suite.test('18. Un anónimo no puede operar sobre /pacientes, /pacientes_por_dni ni /auditoria', async () => {
        const unauthedDb = testEnv.unauthenticatedContext().firestore();

        // Denegado en pacientes
        await assertFails(unauthedDb.collection('pacientes').doc('pac_01').get());
        await assertFails(unauthedDb.collection('pacientes').get());
        await assertFails(unauthedDb.collection('pacientes').doc('pac_anon').set({ nombre: 'X' }));

        // Denegado en pacientes_por_dni
        await assertFails(unauthedDb.collection('pacientes_por_dni').doc('30111222').get());
        await assertFails(unauthedDb.collection('pacientes_por_dni').doc('30111222').set({ dni: '30111222' }));

        // Denegado en auditoria
        await assertFails(unauthedDb.collection('auditoria').doc('aud_anon').get());
        await assertFails(
            unauthedDb.collection('auditoria').doc('aud_anon').set({
                actorUid: 'anon',
                fecha: serverTimestamp()
            })
        );
    });
});
