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

// Asegurar resolución de dependencias de functions (firebase-admin, firebase-functions)
const functionsModules = path.resolve(__dirname, '../functions/node_modules');
if (!module.paths.includes(functionsModules)) {
    module.paths.unshift(functionsModules);
}

const HAS_EMULATOR = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const SKIP_MSG = 'Omitido: Requiere emulador local de Firestore activo (FIRESTORE_EMULATOR_HOST no configurado). Para ejecutar esta suite dinámica con Java y Firebase CLI, utilice "npm run test:rules".';

const PROJECT_ID = 'demo-turnos-rules-' + process.pid;
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
            const db = context.firestore();
            await db.collection('usuarios').doc('admin_root').set({
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
            unauthedDb.collection('turnos').doc('TURNOWEB12345').set(turnoData)
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
            const db = context.firestore();
            await db.collection('turnos').doc('TURNOSECRETO987').set({
                pacienteNombre: 'Paciente Simulado',
                estado: 'Confirmado'
            });
        });

        const unauthedDb = testEnv.unauthenticatedContext().firestore();
        await assertSucceeds(
            unauthedDb.collection('turnos').doc('TURNOSECRETO987').get()
        );
    });

    // Caso 7: Médico autenticado puede crear consulta clínica
    await suite.test('7. Médico autenticado puede crear consulta clínica', async () => {
        const medicoUid = 'med_clinico_01';
        const pacienteId = 'pac_12345';

        await testEnv.withSecurityRulesDisabled(async (context) => {
            const db = context.firestore();
            await db.collection('usuarios').doc(medicoUid).set({
                rol: 'Médico',
                activo: true
            });
            await db.collection('pacientes').doc(pacienteId).collection('acceso').doc(medicoUid).set({
                medicoUid: medicoUid,
                turnoId: 'TURNOWEB12345',
                concedidoEn: serverTimestamp()
            });
        });

        const medDb = testEnv.authenticatedContext(medicoUid).firestore();
        const consultaRef = medDb.collection('pacientes').doc(pacienteId).collection('consultas').doc('cons_001');

        await assertSucceeds(
            consultaRef.set({
                turnoId: 'TURNOWEB12345',
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
            const db = context.firestore();
            await db.collection('usuarios').doc(medicoUid).set({
                rol: 'Médico',
                activo: true
            });
            await db.collection('pacientes').doc(pacienteId).collection('consultas').doc('cons_asentada').set({
                turnoId: 'TURNOWEB12345',
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
            const db = context.firestore();
            await db.collection('turnos').doc('TURNOTEST10').set({
                estado: 'Confirmado',
                creadoEn: serverTimestamp(),
                creadoPor: null
            });
        });

        const authedNoRoleDb = testEnv.authenticatedContext('user_norole').firestore();
        await assertFails(
            authedNoRoleDb.collection('turnos').doc('TURNOTEST10').update({
                estado: 'Atendido'
            })
        );
    });

    // Caso 11: Usuario autenticado sin rol no puede leer perfil de otro usuario en /usuarios ni listar
    await suite.test('11. Usuario autenticado sin rol no puede leer perfil de otro usuario en /usuarios ni listar', async () => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
            const db = context.firestore();
            await db.collection('usuarios').doc('admin_target').set({
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
            const db = context.firestore();
            await db.collection('pacientes').doc('pac_existente').set({
                nombre: 'Carlos',
                apellido: 'Gomez',
                dni: '28111222'
            });
            await db.collection('pacientes_por_dni').doc('28111222').set({
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
            const db = context.firestore();
            await db.collection('usuarios').doc(recepUid).set({
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
            const db = context.firestore();
            await db.collection('usuarios').doc(medUid).set({
                rol: 'Médico',
                activo: true
            });
            await db.collection('pacientes').doc('pac_para_medico').set({
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
            const db = context.firestore();
            await db.collection('usuarios').doc(recepUid).set({
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
            const db = context.firestore();
            await db.collection('usuarios').doc(adminUid).set({
                rol: 'Administración',
                activo: true
            });
            await db.collection('usuarios').doc(recepUid).set({
                rol: 'Recepción',
                activo: true
            });
            await db.collection('auditoria').doc('aud_evento_1').set({
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

    // Caso 19: Un anónimo no puede leer ni escribir en camas, historial_internaciones, quirofanos ni reservas_quirofano
    await suite.test('19. Un anónimo no puede operar sobre camas, historial_internaciones, quirofanos ni reservas_quirofano', async () => {
        const unauthedDb = testEnv.unauthenticatedContext().firestore();

        // Camas
        await assertFails(unauthedDb.collection('camas').doc('cama_test').get());
        await assertFails(unauthedDb.collection('camas').get());
        await assertFails(unauthedDb.collection('camas').doc('cama_test').set({ piso: 1, habitacion: '101' }));

        // Historial internaciones
        await assertFails(unauthedDb.collection('historial_internaciones').doc('hist_test').get());
        await assertFails(unauthedDb.collection('historial_internaciones').get());
        await assertFails(unauthedDb.collection('historial_internaciones').doc('hist_test').set({ estado: 'activa' }));

        // Quirófanos
        await assertFails(unauthedDb.collection('quirofanos').doc('q_test').get());
        await assertFails(unauthedDb.collection('quirofanos').get());
        await assertFails(unauthedDb.collection('quirofanos').doc('q_test').set({ nombre: 'Q1' }));

        // Reservas de quirófano
        await assertFails(unauthedDb.collection('reservas_quirofano').doc('res_test').get());
        await assertFails(unauthedDb.collection('reservas_quirofano').get());
        await assertFails(unauthedDb.collection('reservas_quirofano').doc('res_test').set({ estado: 'reservado' }));
    });

    // Caso 20: SuperAdmin puede crear camas y salas de quirófano
    await suite.test('20. SuperAdmin puede crear camas y salas de quirófano válidas', async () => {
        const adminUid = 'admin_infra';
        await testEnv.withSecurityRulesDisabled(async (context) => {
            const db = context.firestore();
            await db.collection('usuarios').doc(adminUid).set({
                rol: 'Administración',
                activo: true
            });
        });

        const adminDb = testEnv.authenticatedContext(adminUid).firestore();

        // Crear cama
        await assertSucceeds(
            adminDb.collection('camas').doc('P1_H101_C1').set({
                piso: 1,
                habitacion: '101',
                numeroCama: 'Cama 1',
                sector: 'Clínica Médica',
                tipo: 'Compartida',
                estado: 'libre',
                activo: true,
                pacienteNombre: null,
                pacienteDni: null,
                medicoTratante: null,
                fechaIngreso: null,
                internacionId: null,
                creadoEn: serverTimestamp(),
                actualizadoEn: serverTimestamp()
            })
        );

        // Crear quirófano
        await assertSucceeds(
            adminDb.collection('quirofanos').doc('Q1').set({
                nombre: 'Quirófano 1 - Cirugía General',
                especialidadPrincipal: 'Cirugía General',
                equipamiento: 'Torre de laparoscopía',
                activo: true,
                orden: 1,
                creadoEn: serverTimestamp()
            })
        );
    });

    // Caso 21: Médico autor puede cancelar su reserva de quirófano pero no confirmarla
    await suite.test('21. Médico autor puede cancelar su reserva de quirófano pero no confirmarla', async () => {
        const medUid = 'med_cirujano_01';
        await testEnv.withSecurityRulesDisabled(async (context) => {
            const db = context.firestore();
            await db.collection('usuarios').doc(medUid).set({
                rol: 'Médico',
                activo: true
            });
            await db.collection('reservas_quirofano').doc('res_cirugia_01').set({
                quirofanoId: 'Q1',
                quirofanoNombre: 'Quirófano 1',
                fecha: '2026-12-01',
                horaInicio: '08:00',
                horaFin: '09:30',
                duracionMinutos: 90,
                pacienteNombre: 'Roberto Sánchez',
                pacienteDni: '25111222',
                cirujanoNombre: 'Dr. Cirujano',
                cirujanoUid: medUid,
                especialidad: 'Cirugía General',
                procedimiento: 'Apendicectomía laparoscópica',
                tipoAnestesia: 'General',
                observaciones: 'Sin antecedentes alérgicos',
                estado: 'reservado',
                creadoPor: {
                    uid: medUid,
                    nombre: 'Dr. Cirujano',
                    rol: 'Médico'
                },
                creadoEn: serverTimestamp(),
                actualizadoEn: serverTimestamp()
            });
        });

        const medDb = testEnv.authenticatedContext(medUid).firestore();
        const resRef = medDb.collection('reservas_quirofano').doc('res_cirugia_01');

        // Intento indebido: Médico intenta auto-confirmarse la cirugía (denegado)
        await assertFails(resRef.update({
            estado: 'confirmado',
            actualizadoEn: serverTimestamp()
        }));

        // Legítimo: Médico autor cancela su reserva
        await assertSucceeds(resRef.update({
            estado: 'cancelado',
            actualizadoEn: serverTimestamp()
        }));
    });

    // Caso 22: Actualización de historial de internación (Alternativa A)
    await suite.test('22. Historial internación: permite editar médico/observaciones en estado activa y dar alta, pero camaId y registros de alta son inmutables', async () => {
        const recepUid = 'recep_internacion';
        await testEnv.withSecurityRulesDisabled(async (context) => {
            const db = context.firestore();
            await db.collection('usuarios').doc(recepUid).set({
                rol: 'Recepción',
                activo: true
            });
            await db.collection('historial_internaciones').doc('hist_activa_01').set({
                camaId: 'P1_H101_C1',
                piso: 1,
                habitacion: '101',
                numeroCama: 'Cama 1',
                sector: 'Clínica Médica',
                pacienteNombre: 'Mario Kempes',
                pacienteDni: '11223344',
                pacienteCobertura: 'Pública Exclusiva',
                medicoTratante: 'Dr. Original',
                diagnosticoIngreso: 'Neumonía',
                fechaIngreso: '2026-11-20T08:00:00Z',
                fechaAlta: null,
                altaPor: null,
                motivoAlta: null,
                observacionesAlta: null,
                estado: 'activa',
                creadoEn: serverTimestamp()
            });
            await db.collection('historial_internaciones').doc('hist_cerrada_01').set({
                camaId: 'P1_H101_C2',
                piso: 1,
                habitacion: '101',
                numeroCama: 'Cama 2',
                sector: 'Clínica Médica',
                pacienteNombre: 'Diego Maradona',
                pacienteDni: '10101010',
                pacienteCobertura: 'Pública Exclusiva',
                medicoTratante: 'Dr. Médico',
                diagnosticoIngreso: 'Traumatismo',
                fechaIngreso: '2026-11-15T08:00:00Z',
                fechaAlta: '2026-11-18T10:00:00Z',
                altaPor: recepUid,
                motivoAlta: 'Alta médica',
                observacionesAlta: 'Evolución favorable',
                estado: 'alta',
                creadoEn: serverTimestamp()
            });
        });

        const recepDb = testEnv.authenticatedContext(recepUid).firestore();
        const histActivaRef = recepDb.collection('historial_internaciones').doc('hist_activa_01');
        const histCerradaRef = recepDb.collection('historial_internaciones').doc('hist_cerrada_01');

        // Intento indebido: intentar cambiar camaId (debe fallar siempre)
        await assertFails(histActivaRef.update({
            camaId: 'P1_H102_C1',
            actualizadoEn: serverTimestamp()
        }));

        // Intento indebido: intentar cambiar pacienteDni o fechaIngreso
        await assertFails(histActivaRef.update({
            pacienteDni: '99999999',
            actualizadoEn: serverTimestamp()
        }));

        // Legítimo (Alternativa A - Branch 1): editar médico tratante y observaciones manteniéndose activa
        await assertSucceeds(histActivaRef.update({
            medicoTratante: 'Dr. Nuevo Tratante',
            observacionesAlta: 'Paciente evoluciona favorablemente en sala',
            actualizadoEn: serverTimestamp()
        }));

        // Legítimo (Alternativa A - Branch 2): dar de alta con transición a 'alta'
        await assertSucceeds(histActivaRef.update({
            estado: 'alta',
            fechaAlta: '2026-11-21T11:00:00Z',
            altaPor: recepUid,
            motivoAlta: 'Alta médica definitiva',
            observacionesAlta: 'Paciente en condiciones de egreso',
            actualizadoEn: serverTimestamp()
        }));

        // Intento indebido: intentar modificar un registro ya cerrado con estado 'alta' (inmutabilidad legal)
        await assertFails(histCerradaRef.update({
            medicoTratante: 'Dr. Intruso',
            actualizadoEn: serverTimestamp()
        }));
    });

    // Caso 23: Precondición de transición de cama a estado 'ocupada'
    await suite.test('23. Cama solo puede pasar a estado ocupada si su estado previo era libre (o si es SuperAdmin)', async () => {
        const recepUid = 'recep_camas_transicion';
        const adminUid = 'admin_camas_transicion';

        await testEnv.withSecurityRulesDisabled(async (context) => {
            const db = context.firestore();
            await db.collection('usuarios').doc(recepUid).set({
                rol: 'Recepción',
                activo: true
            });
            await db.collection('usuarios').doc(adminUid).set({
                rol: 'Administración',
                activo: true
            });

            // Cama A: libre
            await db.collection('camas').doc('cama_libre_01').set({
                piso: 2,
                habitacion: '201',
                numeroCama: 'Cama 1',
                sector: 'Clínica Médica',
                tipo: 'Compartida',
                estado: 'libre',
                activo: true,
                pacienteNombre: null,
                pacienteDni: null,
                medicoTratante: null,
                fechaIngreso: null,
                internacionId: null,
                creadoEn: serverTimestamp(),
                actualizadoEn: serverTimestamp()
            });

            // Cama B: ocupada
            await db.collection('camas').doc('cama_ocupada_01').set({
                piso: 2,
                habitacion: '202',
                numeroCama: 'Cama 1',
                sector: 'Clínica Médica',
                tipo: 'Compartida',
                estado: 'ocupada',
                activo: true,
                pacienteNombre: 'Paciente Actual',
                pacienteDni: '12345678',
                medicoTratante: 'Dr. López',
                fechaIngreso: '2026-11-20T10:00:00Z',
                internacionId: 'hist_01',
                creadoEn: serverTimestamp(),
                actualizadoEn: serverTimestamp()
            });

            // Cama C: mantenimiento
            await db.collection('camas').doc('cama_mant_01').set({
                piso: 2,
                habitacion: '203',
                numeroCama: 'Cama 1',
                sector: 'Clínica Médica',
                tipo: 'Compartida',
                estado: 'mantenimiento',
                activo: true,
                pacienteNombre: null,
                pacienteDni: null,
                medicoTratante: null,
                fechaIngreso: null,
                internacionId: null,
                creadoEn: serverTimestamp(),
                actualizadoEn: serverTimestamp()
            });
        });

        const recepDb = testEnv.authenticatedContext(recepUid).firestore();
        const adminDb = testEnv.authenticatedContext(adminUid).firestore();

        // 1. Recepción puede pasar cama_libre_01 a 'ocupada'
        await assertSucceeds(recepDb.collection('camas').doc('cama_libre_01').update({
            estado: 'ocupada',
            pacienteNombre: 'Nuevo Paciente',
            pacienteDni: '87654321',
            medicoTratante: 'Dr. Gómez',
            fechaIngreso: '2026-11-21T12:00:00Z',
            internacionId: 'hist_nuevo',
            actualizadoEn: serverTimestamp()
        }));

        // 2. Recepción intenta pasar cama_mant_01 a 'ocupada' directamente (debe fallar porque no estaba libre)
        await assertFails(recepDb.collection('camas').doc('cama_mant_01').update({
            estado: 'ocupada',
            pacienteNombre: 'Paciente Denegado',
            pacienteDni: '11223344',
            medicoTratante: 'Dr. Pérez',
            fechaIngreso: '2026-11-21T12:00:00Z',
            internacionId: 'hist_denegado',
            actualizadoEn: serverTimestamp()
        }));

        // 3. Recepción intenta sobreescribir cama_ocupada_01 sin liberarla antes (debe fallar)
        await assertFails(recepDb.collection('camas').doc('cama_ocupada_01').update({
            estado: 'ocupada',
            pacienteNombre: 'Intruso Paciente',
            pacienteDni: '99887766',
            actualizadoEn: serverTimestamp()
        }));

        // 4. Recepción puede liberar cama_ocupada_01 pasando a 'libre' (alta)
        await assertSucceeds(recepDb.collection('camas').doc('cama_ocupada_01').update({
            estado: 'libre',
            pacienteNombre: null,
            pacienteDni: null,
            medicoTratante: null,
            fechaIngreso: null,
            internacionId: null,
            actualizadoEn: serverTimestamp()
        }));

        // 5. SuperAdmin puede actualizar cualquier estado (exento de restricción previa)
        await assertSucceeds(adminDb.collection('camas').doc('cama_mant_01').update({
            estado: 'ocupada',
            pacienteNombre: 'Paciente Admin',
            pacienteDni: '44556677',
            actualizadoEn: serverTimestamp()
        }));
    });

    // Caso 24: Creación directa de reservas de quirófano regida por puedeCrearReservaQuirofano
    await suite.test('24. Creación de reservas de quirófano regida por puedeCrearReservaQuirofano (matriz de roles y estados)', async () => {
        const medUid = 'med_cirujano_reserva';
        const recepUid = 'recep_reserva_quirofano';
        const adminUid = 'admin_reserva_quirofano';
        const enfermUid = 'enferm_reserva_quirofano';

        await testEnv.withSecurityRulesDisabled(async (context) => {
            const db = context.firestore();
            await db.collection('usuarios').doc(medUid).set({
                rol: 'Médico',
                activo: true
            });
            await db.collection('usuarios').doc(recepUid).set({
                rol: 'Recepción',
                activo: true
            });
            await db.collection('usuarios').doc(adminUid).set({
                rol: 'Administración',
                activo: true
            });
            await db.collection('usuarios').doc(enfermUid).set({
                rol: 'Enfermería',
                activo: true
            });
        });

        const reservaPayload = {
            quirofanoId: 'Q1',
            quirofanoNombre: 'Quirófano 1',
            fecha: '2026-12-05',
            horaInicio: '10:00',
            horaFin: '11:30',
            duracionMinutos: 90,
            pacienteNombre: 'Ana Frank',
            pacienteDni: '33444555',
            cirujanoNombre: 'Dr. Quirúrgico',
            cirujanoUid: medUid,
            especialidad: 'Cirugía General',
            procedimiento: 'Colecistectomía',
            tipoAnestesia: 'General',
            observaciones: 'Cirugía programada',
            estado: 'reservado',
            creadoPor: {
                uid: medUid,
                nombre: 'Dr. Quirúrgico',
                rol: 'Médico'
            },
            creadoEn: serverTimestamp(),
            actualizadoEn: serverTimestamp()
        };

        const medDb = testEnv.authenticatedContext(medUid).firestore();
        const recepDb = testEnv.authenticatedContext(recepUid).firestore();
        const adminDb = testEnv.authenticatedContext(adminUid).firestore();
        const enfermDb = testEnv.authenticatedContext(enfermUid).firestore();

        // 1. assertSucceeds para Médico creando en 'reservado' con su propio UID
        await assertSucceeds(medDb.collection('reservas_quirofano').doc('res_med_reservado').set(reservaPayload));

        // 2. assertFails para Médico creando en 'confirmado'
        await assertFails(medDb.collection('reservas_quirofano').doc('res_med_confirmado').set({
            ...reservaPayload,
            estado: 'confirmado'
        }));

        // 3. assertFails para Médico creando con UID ajeno
        await assertFails(medDb.collection('reservas_quirofano').doc('res_med_uid_ajeno').set({
            ...reservaPayload,
            creadoPor: {
                uid: 'otro_uid_medico',
                nombre: 'Dr. Otro',
                rol: 'Médico'
            }
        }));

        // 4. assertSucceeds para Recepción y SuperAdmin creando en 'reservado' o 'confirmado'
        await assertSucceeds(recepDb.collection('reservas_quirofano').doc('res_recep_reservado').set({
            ...reservaPayload,
            creadoPor: {
                uid: recepUid,
                nombre: 'Recepción',
                rol: 'Recepción'
            }
        }));
        await assertSucceeds(recepDb.collection('reservas_quirofano').doc('res_recep_confirmado').set({
            ...reservaPayload,
            estado: 'confirmado',
            creadoPor: {
                uid: recepUid,
                nombre: 'Recepción',
                rol: 'Recepción'
            }
        }));
        await assertSucceeds(adminDb.collection('reservas_quirofano').doc('res_admin_reservado').set({
            ...reservaPayload,
            creadoPor: {
                uid: adminUid,
                nombre: 'SuperAdmin',
                rol: 'Administración'
            }
        }));
        await assertSucceeds(adminDb.collection('reservas_quirofano').doc('res_admin_confirmado').set({
            ...reservaPayload,
            estado: 'confirmado',
            creadoPor: {
                uid: adminUid,
                nombre: 'SuperAdmin',
                rol: 'Administración'
            }
        }));

        // 5. assertFails para Enfermería base sin 'coordinaQuirofano'
        await assertFails(enfermDb.collection('reservas_quirofano').doc('res_enferm_base').set({
            ...reservaPayload,
            creadoPor: {
                uid: enfermUid,
                nombre: 'Enfermero Base',
                rol: 'Enfermería'
            }
        }));

        // 6. assertFails para payload inválido (ej: DNI no numérico / formato inválido)
        await assertFails(medDb.collection('reservas_quirofano').doc('res_payload_invalido').set({
            ...reservaPayload,
            pacienteDni: 'dni_invalido'
        }));
    });

    // Caso 25: Cloud Function reservarQuirofano - Prevención transaccional de doble reserva (anti-colisión)
    await suite.test('25. Cloud Function reservarQuirofano: transacción rechaza segunda reserva superpuesta en horario', async () => {
        let procesarReservaQuirofano;
        try {
            const functionsPath = path.resolve(__dirname, '../functions/index.js');
            const funcs = require(functionsPath);
            procesarReservaQuirofano = funcs.procesarReservaQuirofano;
        } catch (e) {
            assert.fail('No se pudo cargar procesarReservaQuirofano de functions/index.js: ' + e.message);
        }

        const admin = require('firebase-admin');
        if (admin.apps.length === 0) {
            admin.initializeApp({ projectId: 'demo-turnos-schestakow' });
        }
        const adminDb = admin.firestore();

        const medUid = 'med_cirujano_concurrente';

        const contextMedico = {
            auth: {
                uid: medUid,
                token: {
                    rol: 'Médico',
                    name: 'Dr. Cirujano Concurrente',
                    email: 'cirujano@schestakow.ar'
                }
            }
        };

        const reservaData1 = {
            quirofanoId: 'Q_CENTRAL_CONCURRENT',
            quirofanoNombre: 'Quirófano Central',
            fecha: '2026-12-10',
            horaInicio: '08:00',
            horaFin: '10:00',
            duracionMinutos: 120,
            pacienteNombre: 'Carlos Bilardo',
            pacienteDni: '14123456',
            cirujanoNombre: 'Dr. Cirujano Concurrente',
            cirujanoUid: medUid,
            especialidad: 'Traumatología',
            procedimiento: 'Reemplazo de cadera',
            tipoAnestesia: 'Raquídea',
            observaciones: 'Primer turno matutino',
            estado: 'reservado'
        };

        const reservaDataSuperpuesta = {
            quirofanoId: 'Q_CENTRAL_CONCURRENT',
            quirofanoNombre: 'Quirófano Central',
            fecha: '2026-12-10',
            horaInicio: '09:00',
            horaFin: '11:00',
            duracionMinutos: 120,
            pacienteNombre: 'Juan Paciente Dos',
            pacienteDni: '28999888',
            cirujanoNombre: 'Dr. Segundo Cirujano',
            cirujanoUid: 'med_cirujano_2',
            especialidad: 'Cirugía General',
            procedimiento: 'Apendicectomía',
            tipoAnestesia: 'General',
            observaciones: 'Intento en horario ocupado',
            estado: 'reservado'
        };

        const reservaDataLibre = {
            quirofanoId: 'Q_CENTRAL_CONCURRENT',
            quirofanoNombre: 'Quirófano Central',
            fecha: '2026-12-10',
            horaInicio: '10:00',
            horaFin: '12:00',
            duracionMinutos: 120,
            pacienteNombre: 'Laura Martínez',
            pacienteDni: '35111222',
            cirujanoNombre: 'Dra. Traumatóloga',
            cirujanoUid: medUid,
            especialidad: 'Traumatología',
            procedimiento: 'Artroscopía de rodilla',
            tipoAnestesia: 'Local con sedación',
            observaciones: 'Horario contiguo sin solapamiento',
            estado: 'reservado'
        };

        // 1. La primera reserva en horario 08:00 - 10:00 debe crearse exitosamente
        const res1 = await procesarReservaQuirofano(reservaData1, contextMedico, adminDb);
        assert.ok(res1.id, 'Debe retornar el ID de la reserva creada');
        assert.strictEqual(res1.estado, 'reservado');

        // 2. Intento de segunda reserva SUPERPUESTA (09:00 - 11:00) en el mismo quirófano y fecha
        // Debe ser RECHAZADA transaccionalmente con error de ya reservado / already-exists
        await assert.rejects(
            async () => {
                await procesarReservaQuirofano(reservaDataSuperpuesta, contextMedico, adminDb);
            },
            (err) => {
                assert.ok(
                    err.code === 'already-exists' || (err.message && err.message.includes('ya está reservado')), 
                    `Error esperado de superposición, obtenido: ${err.message}`
                );
                return true;
            },
            'La segunda reserva superpuesta debe ser rechazada transaccionalmente'
        );

        // 3. Intento de tercera reserva NO superpuesta (10:00 - 12:00) en el mismo quirófano y fecha
        // Debe ser ACEPTADA exitosamente
        const res3 = await procesarReservaQuirofano(reservaDataLibre, contextMedico, adminDb);
        assert.ok(res3.id, 'Debe crearse exitosamente la reserva posterior no superpuesta');
    });

    // Caso 26: Confirma que un usuario con rol 'Administración' SÍ puede reservar quirófano exitosamente llamando a la Cloud Function procesarReservaQuirofano
    await suite.test('26. Usuario con rol Administración sí puede reservar quirófano exitosamente llamando a Cloud Function procesarReservaQuirofano', async () => {
        let procesarReservaQuirofano;
        try {
            const functionsPath = path.resolve(__dirname, '../functions/index.js');
            const funcs = require(functionsPath);
            procesarReservaQuirofano = funcs.procesarReservaQuirofano;
        } catch (e) {
            assert.fail('No se pudo cargar procesarReservaQuirofano de functions/index.js: ' + e.message);
        }

        const admin = require('firebase-admin');
        if (admin.apps.length === 0) {
            admin.initializeApp({ projectId: 'demo-turnos-schestakow' });
        }
        const adminDb = admin.firestore();

        const adminUid = 'admin_quirofano_fn';
        const contextAdmin = {
            auth: {
                uid: adminUid,
                token: {
                    rol: 'Administración',
                    name: 'SuperAdmin Hospital',
                    email: 'admin@schestakow.ar'
                }
            }
        };

        const reservaAdminConfirmada = {
            quirofanoId: 'Q_ADMIN_TEST',
            quirofanoNombre: 'Quirófano Central',
            fecha: '2026-12-15',
            horaInicio: '08:00',
            horaFin: '09:30',
            duracionMinutos: 90,
            pacienteNombre: 'Paciente Admin Prueba',
            pacienteDni: '30123456',
            cirujanoNombre: 'Dr. Cirujano Staff',
            cirujanoUid: 'med_cirujano_staff',
            especialidad: 'Cirugía General',
            procedimiento: 'Hernioplastía',
            tipoAnestesia: 'General',
            observaciones: 'Reserva confirmada registrada por administración',
            estado: 'confirmado'
        };

        const reservaAdminReservada = {
            quirofanoId: 'Q_ADMIN_TEST',
            quirofanoNombre: 'Quirófano Central',
            fecha: '2026-12-15',
            horaInicio: '10:00',
            horaFin: '11:30',
            duracionMinutos: 90,
            pacienteNombre: 'Paciente Admin Reserva',
            pacienteDni: '31987654',
            cirujanoNombre: 'Dr. Cirujano Staff',
            cirujanoUid: 'med_cirujano_staff',
            especialidad: 'Cirugía General',
            procedimiento: 'Apendicectomía',
            tipoAnestesia: 'General',
            observaciones: 'Reserva preliminar registrada por administración',
            estado: 'reservado'
        };

        // 1. Administración puede registrar con estado 'confirmado'
        const resConf = await procesarReservaQuirofano(reservaAdminConfirmada, contextAdmin, adminDb);
        assert.ok(resConf.id, 'Debe retornar ID de la reserva creada por Administración en estado confirmado');
        assert.strictEqual(resConf.estado, 'confirmado', 'Administración debe poder registrar en estado confirmado');
        assert.strictEqual(resConf.creadoPor.uid, adminUid);
        assert.strictEqual(resConf.creadoPor.rol, 'Administración');

        // 2. Administración también puede registrar con estado 'reservado'
        const resRes = await procesarReservaQuirofano(reservaAdminReservada, contextAdmin, adminDb);
        assert.ok(resRes.id, 'Debe retornar ID de la reserva creada por Administración en estado reservado');
        assert.strictEqual(resRes.estado, 'reservado', 'Administración debe poder registrar en estado reservado');
        assert.strictEqual(resRes.creadoPor.uid, adminUid);
    });

    // Caso 27: Ciclo completo - Creación por Médico con SDK de cliente y posterior actualización por Recepción
    await suite.test('27. Ciclo completo: Creación por Médico con SDK de cliente y posterior actualización por Recepción (Recepción confirma)', async () => {
        const medUid = 'med_cirujano_ciclo';
        const recepUid = 'recep_ciclo_quirofano';

        // 1. Sembrar perfiles de usuarios en Firestore
        await testEnv.withSecurityRulesDisabled(async (context) => {
            const db = context.firestore();
            await db.collection('usuarios').doc(medUid).set({
                rol: 'Médico',
                activo: true
            });
            await db.collection('usuarios').doc(recepUid).set({
                rol: 'Recepción',
                activo: true
            });
        });

        const reservaData = {
            quirofanoId: 'Q_CICLO',
            quirofanoNombre: 'Quirófano 1 - Central',
            fecha: '2026-12-20',
            horaInicio: '09:00',
            horaFin: '11:00',
            duracionMinutos: 120,
            pacienteNombre: 'Jorge Valdano',
            pacienteDni: '17222333',
            cirujanoNombre: 'Dr. Cirujano Ciclo',
            cirujanoUid: medUid,
            especialidad: 'Cirugía General',
            procedimiento: 'Colecistectomía laparoscópica',
            tipoAnestesia: 'General',
            observaciones: 'Paciente sin antecedentes alérgicos',
            estado: 'reservado',
            creadoPor: {
                uid: medUid,
                nombre: 'Dr. Cirujano Ciclo',
                rol: 'Médico'
            },
            creadoEn: serverTimestamp(),
            actualizadoEn: serverTimestamp()
        };

        // 2. Crear reserva usando el contexto autenticado del médico (SDK de cliente sujeto a firestore.rules)
        const medDb = testEnv.authenticatedContext(medUid).firestore();
        const reservaId = 'res_ciclo_quirofano_01';
        await assertSucceeds(
            medDb.collection('reservas_quirofano').doc(reservaId).set(reservaData)
        );

        // 3. Obtener contexto autenticado de Recepción con SDK de Cliente (sujeto a firestore.rules)
        const recepDb = testEnv.authenticatedContext(recepUid).firestore();
        const resRef = recepDb.collection('reservas_quirofano').doc(reservaId);

        // 4. Intentar update legítimo por Recepción: pasar a 'confirmado' con su timestamp
        await assertSucceeds(
            resRef.update({
                estado: 'confirmado',
                observaciones: 'Confirmado por mesa de entradas de quirófano',
                actualizadoEn: serverTimestamp()
            })
        );

        // 5. Verificar que el documento actualizado en Firestore refleja el nuevo estado
        const docSnap = await resRef.get();
        assert.strictEqual(docSnap.data().estado, 'confirmado');
        assert.strictEqual(docSnap.data().observaciones, 'Confirmado por mesa de entradas de quirófano');
    });

    // Caso 28: Permiso adicional 'internacion': Médico con permiso puede internar/dar de alta; Médico base es denegado
    await suite.test('28. Permiso adicional internacion: Médico con internacion puede internar y dar de alta; Médico base es denegado', async () => {
        const medConPermisoUid = 'med_con_internacion';
        const medSinPermisoUid = 'med_sin_internacion';
        const camaId = 'CAMA_TEST_MED_INTERNACION';

        // 1. Sembrar usuarios y cama inicial libre
        await testEnv.withSecurityRulesDisabled(async (context) => {
            const db = context.firestore();
            await db.collection('usuarios').doc(medConPermisoUid).set({
                rol: 'Médico',
                permisosAdicionales: ['internacion'],
                activo: true
            });
            await db.collection('usuarios').doc(medSinPermisoUid).set({
                rol: 'Médico',
                permisosAdicionales: [],
                activo: true
            });

            await db.collection('camas').doc(camaId).set({
                piso: 2,
                habitacion: '205',
                numeroCama: 'Cama 1',
                sector: 'Clínica Médica',
                tipo: 'General',
                estado: 'libre',
                activo: true,
                pacienteNombre: null,
                pacienteDni: null,
                medicoTratante: null,
                fechaIngreso: null,
                internacionId: null,
                creadoEn: serverTimestamp(),
                actualizadoEn: serverTimestamp()
            });
        });

        const dbMedSin = testEnv.authenticatedContext(medSinPermisoUid).firestore();
        const dbMedCon = testEnv.authenticatedContext(medConPermisoUid).firestore();

        // 2. Médico sin permiso intenta internar (pasar cama a ocupada) -> DEBE SER DENEGADO
        await assertFails(
            dbMedSin.collection('camas').doc(camaId).update({
                estado: 'ocupada',
                pacienteNombre: 'Paciente Denegado',
                pacienteDni: '30111222',
                medicoTratante: 'Dr. Sin Permiso',
                fechaIngreso: '2026-11-21T10:00:00Z',
                internacionId: 'INT_DENEGADA',
                actualizadoEn: serverTimestamp()
            })
        );

        // 3. Médico sin permiso intenta crear registro en historial_internaciones -> DEBE SER DENEGADO
        await assertFails(
            dbMedSin.collection('historial_internaciones').doc('INT_DENEGADA').set({
                camaId: camaId,
                piso: 2,
                habitacion: '205',
                numeroCama: 'Cama 1',
                sector: 'Clínica Médica',
                pacienteNombre: 'Paciente Denegado',
                pacienteDni: '30111222',
                pacienteCobertura: 'Pública Exclusiva',
                medicoTratante: 'Dr. Sin Permiso',
                diagnosticoIngreso: 'Ingreso clínico no autorizado',
                fechaIngreso: '2026-11-21T10:00:00Z',
                fechaAlta: null,
                altaPor: null,
                motivoAlta: null,
                observacionesAlta: null,
                estado: 'activa',
                creadoEn: serverTimestamp(),
                actualizadoEn: serverTimestamp()
            })
        );

        // 4. Médico CON permiso 'internacion' interna al paciente (pasar cama a ocupada) -> DEBE SER EXITOSO
        const internacionIdValida = 'INT_PERMITIDA_MED';
        await assertSucceeds(
            dbMedCon.collection('camas').doc(camaId).update({
                estado: 'ocupada',
                pacienteNombre: 'Paciente Autorizado',
                pacienteDni: '35444555',
                medicoTratante: 'Dr. Con Permiso',
                fechaIngreso: '2026-11-21T11:00:00Z',
                internacionId: internacionIdValida,
                actualizadoEn: serverTimestamp()
            })
        );

        // 5. Médico CON permiso 'internacion' crea registro en historial_internaciones -> DEBE SER EXITOSO
        await assertSucceeds(
            dbMedCon.collection('historial_internaciones').doc(internacionIdValida).set({
                camaId: camaId,
                piso: 2,
                habitacion: '205',
                numeroCama: 'Cama 1',
                sector: 'Clínica Médica',
                pacienteNombre: 'Paciente Autorizado',
                pacienteDni: '35444555',
                pacienteCobertura: 'Pública Exclusiva',
                medicoTratante: 'Dr. Con Permiso',
                diagnosticoIngreso: 'Ingreso clínico autorizado',
                fechaIngreso: '2026-11-21T11:00:00Z',
                fechaAlta: null,
                altaPor: null,
                motivoAlta: null,
                observacionesAlta: null,
                estado: 'activa',
                creadoEn: serverTimestamp(),
                actualizadoEn: serverTimestamp()
            })
        );

        // 6. Médico CON permiso 'internacion' otorga el alta médica y libera la cama -> DEBE SER EXITOSO
        await assertSucceeds(
            dbMedCon.collection('historial_internaciones').doc(internacionIdValida).update({
                fechaAlta: '2026-11-21T18:00:00Z',
                altaPor: medConPermisoUid,
                motivoAlta: 'Alta Médica',
                observacionesAlta: 'Paciente recuperado favorablemente',
                estado: 'alta',
                actualizadoEn: serverTimestamp()
            })
        );

        await assertSucceeds(
            dbMedCon.collection('camas').doc(camaId).update({
                estado: 'libre',
                pacienteNombre: null,
                pacienteDni: null,
                medicoTratante: null,
                fechaIngreso: null,
                internacionId: null,
                actualizadoEn: serverTimestamp()
            })
        );
    });

    // Caso 37: Cartelera TV / Llamador de Turnos (/llamador_turnos)
    await suite.test('37. Cartelera TV / Llamador de Turnos (/llamador_turnos): create, update restringido y delete', async () => {
        const unauthedDb = testEnv.unauthenticatedContext().firestore();

        // 1. Configurar usuario médico y recepción en /usuarios
        await testEnv.withSecurityRulesDisabled(async (context) => {
            const db = context.firestore();
            await db.collection('usuarios').doc('medico_llamador').set({
                rol: 'Médico',
                activo: true
            });
            await db.collection('usuarios').doc('recep_llamador').set({
                rol: 'Recepción',
                activo: true
            });
        });

        const medDb = testEnv.authenticatedContext('medico_llamador').firestore();
        const recepDb = testEnv.authenticatedContext('recep_llamador').firestore();

        const docId = 'llamado_demo_1';
        const docRefMed = medDb.collection('llamador_turnos').doc(docId);
        const docRefAnon = unauthedDb.collection('llamador_turnos').doc(docId);
        const docRefRecep = recepDb.collection('llamador_turnos').doc(docId);

        const payloadValido = {
            pacienteNombre: 'Juan Perez',
            consultorio: 'Consultorio 1',
            medico: 'Dr. Lopez',
            especialidad: 'Clínica Médica',
            horario: '10:30',
            llamadoEn: serverTimestamp(),
            estado: 'llamando'
        };

        // Anónimo NO puede crear en /llamador_turnos
        await assertFails(docRefAnon.set(payloadValido));

        // Creación con estado 'cancelado' DEBE FALLAR (ya no es un estado permitido en isValidLlamador)
        await assertFails(
            docRefMed.set({
                ...payloadValido,
                estado: 'cancelado'
            })
        );

        // Médico PUEDE crear con datos válidos y estado 'llamando'
        await assertSucceeds(docRefMed.set(payloadValido));

        // Lectura pública permitida para TV / kiosco anónimo
        await assertSucceeds(docRefAnon.get());

        // Update de sólo 'estado' y 'llamadoEn' por staff DEBE SER EXITOSO
        await assertSucceeds(
            docRefMed.update({
                estado: 'atendiendo',
                llamadoEn: serverTimestamp()
            })
        );

        // Update de sólo 'estado' ('finalizado') DEBE SER EXITOSO
        await assertSucceeds(
            docRefMed.update({
                estado: 'finalizado'
            })
        );

        // Update intentando modificar datos inmutables (ej: pacienteNombre o consultorio) DEBE FALLAR
        await assertFails(
            docRefMed.update({
                pacienteNombre: 'Atacante Hacker',
                estado: 'atendiendo'
            })
        );

        await assertFails(
            docRefMed.update({
                consultorio: 'Consultorio 99'
            })
        );

        // Anónimo NO puede actualizar
        await assertFails(
            docRefAnon.update({
                estado: 'finalizado'
            })
        );

        // Recepción PUEDE eliminar documento
        await assertSucceeds(docRefRecep.delete());
    });
});
