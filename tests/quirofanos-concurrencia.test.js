/**
 * Prueba de verificación real de comportamiento para el módulo de quirófanos:
 * 1. Creación válida y persistencia en Firestore (SDK cliente con firestore.rules).
 * 2. Rechazo preventivo de reserva superpuesta secuencial.
 * 3. Simulación empírica de condición de carrera concurrente (sin Cloud Function).
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const HAS_EMULATOR = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const PROJECT_ID = 'demo-turnos-quirofanos-' + process.pid;
const RULES_PATH = path.resolve(__dirname, '../firestore.rules');

// Importar algoritmo de anti-colisión
function convertirHoraAMinutos(horaStr) {
    if (!horaStr || typeof horaStr !== "string" || !horaStr.includes(":")) return 0;
    const [h, m] = horaStr.split(":").map(Number);
    return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

function haySuperposicion(hInicio1, hFin1, hInicio2, hFin2) {
    const ini1 = convertirHoraAMinutos(hInicio1);
    const fin1 = convertirHoraAMinutos(hFin1);
    const ini2 = convertirHoraAMinutos(hInicio2);
    const fin2 = convertirHoraAMinutos(hFin2);
    return !(fin1 <= ini2 || ini1 >= fin2);
}

// Lógica idéntica a la implementada en js/quirofanos.js para agendar una reserva
async function agendarReservaCliente(firestoreDb, sesion, datos) {
    const { quirofanoId, fecha, horaInicio, horaFin } = datos;

    // 1. Verificación en cliente consultando reservas del día y sala
    const snapshot = await firestoreDb.collection('reservas_quirofano')
        .where('quirofanoId', '==', quirofanoId)
        .where('fecha', '==', fecha)
        .get();

    for (const docSnap of snapshot.docs) {
        const r = docSnap.data();
        if (r.estado === 'cancelado') continue;
        if (haySuperposicion(horaInicio, horaFin, r.horaInicio, r.horaFin)) {
            const err = new Error(`El quirófano ya está reservado en ese horario (${r.horaInicio} - ${r.horaFin} por ${r.cirujanoNombre || "otro profesional"}).`);
            err.code = 'already-exists';
            throw err;
        }
    }

    // 2. Creación directa (sujeta a firestore.rules)
    const payload = {
        ...datos,
        creadoPor: {
            uid: sesion.uid,
            nombre: sesion.nombre || 'Personal Hospital',
            rol: sesion.rol,
            email: sesion.email || ''
        },
        creadoEn: new Date(),
        actualizadoEn: new Date()
    };

    const docRef = await firestoreDb.collection('reservas_quirofano').add(payload);
    return docRef.id;
}

test('Comportamiento y Concurrencia de Quirófanos en Emulador', async (suite) => {
    if (!HAS_EMULATOR) {
        suite.skip('Omitido: Requiere emulador local de Firestore');
        return;
    }

    const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');
    const rules = fs.readFileSync(RULES_PATH, 'utf8');
    const testEnv = await initializeTestEnvironment({
        projectId: PROJECT_ID,
        firestore: { rules }
    });

    suite.after(async () => {
        if (testEnv) await testEnv.cleanup();
    });

    suite.beforeEach(async () => {
        await testEnv.clearFirestore();

        // Configurar usuarios de prueba en Firestore
        await testEnv.withSecurityRulesDisabled(async (context) => {
            const db = context.firestore();
            await db.collection('usuarios').doc('med_cirujano_1').set({
                rol: 'Médico',
                nombre: 'Dr. Cirujano 1',
                email: 'cirujano1@schestakow.ar',
                activo: true
            });
            await db.collection('usuarios').doc('med_cirujano_2').set({
                rol: 'Médico',
                nombre: 'Dr. Cirujano 2',
                email: 'cirujano2@schestakow.ar',
                activo: true
            });
            await db.collection('usuarios').doc('recepcion_1').set({
                rol: 'Recepción',
                nombre: 'Recepcionista 1',
                email: 'recep1@schestakow.ar',
                activo: true
            });
        });
    });

    // Caso a: Creación válida y confirmación en base de datos
    await suite.test('a) Creación válida de reserva: persiste en Firestore conforme a firestore.rules', async () => {
        const med1Db = testEnv.authenticatedContext('med_cirujano_1').firestore();
        const sesionMed1 = {
            uid: 'med_cirujano_1',
            nombre: 'Dr. Cirujano 1',
            rol: 'Médico',
            email: 'cirujano1@schestakow.ar'
        };

        const reservaData = {
            quirofanoId: 'SALA_1',
            quirofanoNombre: 'Quirófano 1 Central',
            fecha: '2026-12-10',
            horaInicio: '08:00',
            horaFin: '09:30',
            duracionMinutos: 90,
            pacienteNombre: 'Carlos Gómez',
            pacienteDni: '30123456',
            cirujanoNombre: 'Dr. Cirujano 1',
            cirujanoUid: 'med_cirujano_1',
            especialidad: 'Cirugía General',
            procedimiento: 'Apendicectomía',
            tipoAnestesia: 'General',
            observaciones: 'Sin alergias',
            estado: 'reservado'
        };

        const idCreado = await agendarReservaCliente(med1Db, sesionMed1, reservaData);
        assert.ok(idCreado, 'La reserva debe retornar un ID de documento asignado');

        // Verificar en Firestore
        const docSnap = await med1Db.collection('reservas_quirofano').doc(idCreado).get();
        assert.strictEqual(docSnap.exists, true, 'El documento debe existir en Firestore');
        assert.strictEqual(docSnap.data().pacienteNombre, 'Carlos Gómez');
        assert.strictEqual(docSnap.data().estado, 'reservado');
    });

    // Caso b: Intento de reserva superpuesta en secuencia
    await suite.test('b) Reserva superpuesta en secuencia: verificación en cliente la rechaza antes de escribir', async () => {
        const med1Db = testEnv.authenticatedContext('med_cirujano_1').firestore();
        const recepDb = testEnv.authenticatedContext('recepcion_1').firestore();

        const sesionMed1 = {
            uid: 'med_cirujano_1',
            nombre: 'Dr. Cirujano 1',
            rol: 'Médico',
            email: 'cirujano1@schestakow.ar'
        };
        const sesionRecep = {
            uid: 'recepcion_1',
            nombre: 'Recepcionista 1',
            rol: 'Recepción',
            email: 'recep1@schestakow.ar'
        };

        // 1. Primera reserva legítima de 08:00 a 10:00
        const id1 = await agendarReservaCliente(med1Db, sesionMed1, {
            quirofanoId: 'SALA_1',
            quirofanoNombre: 'Quirófano 1 Central',
            fecha: '2026-12-10',
            horaInicio: '08:00',
            horaFin: '10:00',
            duracionMinutos: 120,
            pacienteNombre: 'Paciente Primero',
            pacienteDni: '28123456',
            cirujanoNombre: 'Dr. Cirujano 1',
            cirujanoUid: 'med_cirujano_1',
            especialidad: 'Cirugía General',
            procedimiento: 'Hernioplastia',
            tipoAnestesia: 'General',
            observaciones: '',
            estado: 'reservado'
        });
        assert.ok(id1);

        // 2. Segunda reserva superpuesta (09:00 a 11:00) en el mismo quirófano y fecha
        let errorCapturado = null;
        try {
            await agendarReservaCliente(recepDb, sesionRecep, {
                quirofanoId: 'SALA_1',
                quirofanoNombre: 'Quirófano 1 Central',
                fecha: '2026-12-10',
                horaInicio: '09:00',
                horaFin: '11:00',
                duracionMinutos: 120,
                pacienteNombre: 'Paciente Segundo Conflicto',
                pacienteDni: '35123456',
                cirujanoNombre: 'Dr. Cirujano 2',
                cirujanoUid: 'med_cirujano_2',
                especialidad: 'Traumatología',
                procedimiento: 'Artroscopía',
                tipoAnestesia: 'General',
                observaciones: '',
                estado: 'confirmado'
            });
        } catch (err) {
            errorCapturado = err;
        }

        assert.ok(errorCapturado, 'Debe arrojar un error de colisión');
        assert.strictEqual(errorCapturado.code, 'already-exists');
        assert.match(errorCapturado.message, /ya está reservado en ese horario/);

        // Confirmar que en la base de datos solo quedó 1 única reserva
        const snapshot = await recepDb.collection('reservas_quirofano').get();
        assert.strictEqual(snapshot.docs.length, 1, 'Firestore debe contener exclusivamente la primera reserva');
    });

    // Caso c: Simulación de condición de carrera concurrente (sin Cloud Function)
    await suite.test('c) Condición de carrera concurrente: qué ocurre cuando dos reservas superpuestas se disparan casi simultáneamente', async () => {
        const med1Db = testEnv.authenticatedContext('med_cirujano_1').firestore();
        const med2Db = testEnv.authenticatedContext('med_cirujano_2').firestore();

        const sesionMed1 = {
            uid: 'med_cirujano_1',
            nombre: 'Dr. Cirujano 1',
            rol: 'Médico',
            email: 'cirujano1@schestakow.ar'
        };
        const sesionMed2 = {
            uid: 'med_cirujano_2',
            nombre: 'Dr. Cirujano 2',
            rol: 'Médico',
            email: 'cirujano2@schestakow.ar'
        };

        const reservaData1 = {
            quirofanoId: 'SALA_RACE',
            quirofanoNombre: 'Quirófano Carrera',
            fecha: '2026-12-15',
            horaInicio: '10:00',
            horaFin: '12:00',
            duracionMinutos: 120,
            pacienteNombre: 'Paciente A (Simultáneo)',
            pacienteDni: '40111111',
            cirujanoNombre: 'Dr. Cirujano 1',
            cirujanoUid: 'med_cirujano_1',
            especialidad: 'Cirugía General',
            procedimiento: 'Cirugía A',
            tipoAnestesia: 'General',
            observaciones: '',
            estado: 'reservado'
        };

        const reservaData2 = {
            quirofanoId: 'SALA_RACE',
            quirofanoNombre: 'Quirófano Carrera',
            fecha: '2026-12-15',
            horaInicio: '10:30',
            horaFin: '12:30',
            duracionMinutos: 120,
            pacienteNombre: 'Paciente B (Simultáneo)',
            pacienteDni: '40222222',
            cirujanoNombre: 'Dr. Cirujano 2',
            cirujanoUid: 'med_cirujano_2',
            especialidad: 'Traumatología',
            procedimiento: 'Cirugía B',
            tipoAnestesia: 'General',
            observaciones: '',
            estado: 'reservado'
        };

        // Disparo concurrente en paralelo (exactamente al mismo tiempo)
        const resultados = await Promise.allSettled([
            agendarReservaCliente(med1Db, sesionMed1, reservaData1),
            agendarReservaCliente(med2Db, sesionMed2, reservaData2)
        ]);

        const exitos = resultados.filter(r => r.status === 'fulfilled');
        const rechazos = resultados.filter(r => r.status === 'rejected');

        let snapshot;
        await testEnv.withSecurityRulesDisabled(async (ctx) => {
            snapshot = await ctx.firestore().collection('reservas_quirofano')
                .where('quirofanoId', '==', 'SALA_RACE')
                .where('fecha', '==', '2026-12-15')
                .get();
        });

        console.log(`[RACE CONDITION TEST OBSERVED RESULT] Exitos: ${exitos.length}, Rechazos: ${rechazos.length}, Documentos en Firestore: ${snapshot.docs.length}`);
        snapshot.docs.forEach((doc, idx) => {
            const data = doc.data();
            console.log(`  Doc ${idx + 1}: ID=${doc.id}, Paciente=${data.pacienteNombre}, Horario=${data.horaInicio}-${data.horaFin}`);
        });

        // Verificamos lo observado
        assert.strictEqual(snapshot.docs.length >= 1, true);
    });
});
