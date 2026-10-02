/**
 * Pruebas Unitarias de Funciones Puras de Métricas
 * Hospital Teodoro J. Schestakow (UTN FRSR)
 * 
 * Casos evaluados:
 * 1. Casos normales con datos completos
 * 2. Casos con conjuntos vacíos ([])
 * 3. Casos con datos faltantes, incompletos o anómalos
 * 4. Prevención estricta de división por cero y valores NaN
 * 5. Evaluación semafórica y textos accesibles
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
    CONFIG_UMBRALES,
    extraerMilisegundos,
    convertirFechaHoraAMilisegundos,
    evaluarSemaforo,
    filtrarTurnosPorRango,
    calcularMetricasMedico,
    calcularMetricasRecepcion,
    calcularMetricasGenerales,
    compararEntidades,
    generarTurnosHistoricosDemo
} from '../js/metricas.js';

test('Módulo de Métricas - Pruebas Unitarias', async (t) => {

    await t.test('1. extraerMilisegundos y convertirFechaHoraAMilisegundos', () => {
        // Objeto Date
        const d = new Date('2026-10-02T10:00:00Z');
        assert.equal(extraerMilisegundos(d), d.getTime());

        // Objeto Timestamp estilo Firestore ({ toMillis })
        const fakeTs1 = { toMillis: () => 1760000000000 };
        assert.equal(extraerMilisegundos(fakeTs1), 1760000000000);

        // Objeto Timestamp estilo Firestore ({ seconds, nanoseconds })
        const fakeTs2 = { seconds: 1760000000, nanoseconds: 500000000 };
        assert.equal(extraerMilisegundos(fakeTs2), 1760000000500);

        // String ISO
        assert.equal(extraerMilisegundos('2026-10-02T08:30:00Z'), Date.parse('2026-10-02T08:30:00Z'));

        // Número directo
        assert.equal(extraerMilisegundos(123456789), 123456789);

        // Datos faltantes o inválidos
        assert.equal(extraerMilisegundos(null), null);
        assert.equal(extraerMilisegundos(undefined), null);
        assert.equal(extraerMilisegundos('invalido'), null);

        // Conversión fecha + hora
        const msHora = convertirFechaHoraAMilisegundos('2026-10-02', '08:30');
        assert.ok(typeof msHora === 'number' && msHora > 0);
        assert.equal(convertirFechaHoraAMilisegundos(null, '08:30'), null);
        assert.equal(convertirFechaHoraAMilisegundos('2026-10-02', null), null);
    });

    await t.test('2. evaluarSemaforo - Umbrales y accesibilidad', () => {
        // Datos faltantes o NaN
        const resNull = evaluarSemaforo(null, 'ocupacion');
        assert.equal(resNull.estado, 'sin_datos');
        assert.equal(resNull.textoAccesible, 'Sin datos suficientes');
        assert.equal(resNull.valorFormateado, 'Sin datos suficientes');

        const resNaN = evaluarSemaforo(NaN, 'ausentismo');
        assert.equal(resNaN.estado, 'sin_datos');

        // Mayor es mejor (Ocupación: >=75 verde, >=50 amarillo, <50 rojo)
        const ocupOptima = evaluarSemaforo(82.4, 'ocupacion');
        assert.equal(ocupOptima.estado, 'optimo');
        assert.equal(ocupOptima.color, 'emerald');
        assert.equal(ocupOptima.valorFormateado, '82.4%');

        const ocupAlerta = evaluarSemaforo(60.0, 'ocupacion');
        assert.equal(ocupAlerta.estado, 'alerta');
        assert.equal(ocupAlerta.color, 'amber');

        const ocupCritica = evaluarSemaforo(35.5, 'ocupacion');
        assert.equal(ocupCritica.estado, 'critico');
        assert.equal(ocupCritica.color, 'rose');

        // Menor es mejor (Ausentismo: <=10 verde, <=20 amarillo, >20 rojo)
        const ausOptimo = evaluarSemaforo(6.5, 'ausentismo');
        assert.equal(ausOptimo.estado, 'optimo');

        const ausAlerta = evaluarSemaforo(15.0, 'ausentismo');
        assert.equal(ausAlerta.estado, 'alerta');

        const ausCritico = evaluarSemaforo(28.0, 'ausentismo');
        assert.equal(ausCritico.estado, 'critico');
    });

    await t.test('3. filtrarTurnosPorRango - Filtros exactos y límites', () => {
        const turnosMock = [
            { id: '1', fecha: '2026-09-01', especialidad: 'Clínica Médica', medico: 'Dr. Quiroga', canal: 'Web' },
            { id: '2', fecha: '2026-09-15', especialidad: 'Cardiología', medico: 'Dr. San Martín', canal: 'Presencial' },
            { id: '3', fecha: '2026-09-30', especialidad: 'Clínica Médica', medico: 'Dr. Quiroga', canal: 'Web' },
            { id: '4', fecha: '2026-10-01', especialidad: 'Pediatría', medico: 'Dra. Antonieta', canal: 'Presencial' }
        ];

        // Rango completo septiembre
        const sept = filtrarTurnosPorRango(turnosMock, '2026-09-01', '2026-09-30');
        assert.equal(sept.length, 3);

        // Filtro por especialidad
        const soloClinica = filtrarTurnosPorRango(turnosMock, '2026-09-01', '2026-10-31', { especialidad: 'Clínica Médica' });
        assert.equal(soloClinica.length, 2);

        // Filtro por médico y canal
        const quirogaWeb = filtrarTurnosPorRango(turnosMock, '2026-09-01', '2026-10-31', { medico: 'Dr. Quiroga', canal: 'Web' });
        assert.equal(quirogaWeb.length, 2);

        // Conjunto vacío o null
        assert.deepEqual(filtrarTurnosPorRango([], '2026-09-01', '2026-09-30'), []);
        assert.deepEqual(filtrarTurnosPorRango(null), []);
    });

    await t.test('4. calcularMetricasMedico - Caso normal con tiempos', () => {
        const baseTime = new Date('2026-10-02T08:00:00Z').getTime();

        const turnos = [
            {
                estado: 'Atendido',
                fecha: '2026-10-02',
                horario: '08:00',
                llegadaEn: baseTime,                          // 08:00
                inicioConsultaEn: baseTime + 10 * 60 * 1000,  // 08:10 (10 min espera)
                finConsultaEn: baseTime + 25 * 60 * 1000      // 08:25 (15 min consulta)
            },
            {
                estado: 'Atendido',
                fecha: '2026-10-02',
                horario: '08:30',
                llegadaEn: baseTime + 20 * 60 * 1000,         // 08:20
                inicioConsultaEn: baseTime + 40 * 60 * 1000,  // 08:40 (20 min espera)
                finConsultaEn: baseTime + 60 * 60 * 1000      // 09:00 (20 min consulta)
            },
            {
                estado: 'Ausente',
                fecha: '2026-10-02',
                horario: '09:00',
                llegadaEn: null,
                inicioConsultaEn: null,
                finConsultaEn: null
            },
            {
                estado: 'Cancelado por Médico',
                canceladoPor: 'medico',
                fecha: '2026-10-02',
                horario: '09:30'
            }
        ];

        const m = calcularMetricasMedico(turnos, 4, 15);

        assert.equal(m.totalTurnos, 4);
        assert.equal(m.atendidos, 2);
        assert.equal(m.ausentes, 1);
        assert.equal(m.cancelados, 1);
        assert.equal(m.ausenciasMedico, 1);

        // Ocupación: 4 asignados / 4 franjas = 100%
        assert.equal(m.ocupacionPct, 100);

        // Ausentismo: 1 ausente / 4 asignados = 25%
        assert.equal(m.ausentismoPct, 25);

        // Tasa de atención: 2 atendidos / 4 asignados = 50%
        assert.equal(m.tasaAtencionPct, 50);

        // Espera promedio: (10 + 20) / 2 = 15 minutos
        assert.equal(m.tiempoEsperaPromedioMin, 15);

        // Duración promedio: (15 + 20) / 2 = 17.5 minutos
        assert.equal(m.duracionRealPromedioMin, 17.5);
        assert.equal(m.duracionProgramadaMin, 15);
        assert.equal(m.diferenciaDuracionMin, 2.5);

        // Evolución cerrada: 2 atendidos con finConsultaEn / 2 atendidos = 100%
        assert.equal(m.porcentajeEvolucionCerrada, 100);
    });

    await t.test('5. calcularMetricasMedico - Conjunto vacío y datos incompletos (Sin NaN)', () => {
        // Array vacío
        const mVacio = calcularMetricasMedico([], 10, 15);
        assert.equal(mVacio.totalTurnos, 0);
        assert.equal(mVacio.ocupacionPct, null);
        assert.equal(mVacio.ausentismoPct, null);
        assert.equal(mVacio.tiempoEsperaPromedioMin, null);
        assert.equal(mVacio.duracionRealPromedioMin, null);
        assert.equal(mVacio.pacientesPorHora, null);

        // Turnos sin marcas de tiempo (datos legados)
        const turnosSinTiempos = [
            { estado: 'Confirmado', fecha: '2026-10-02', horario: '08:00' },
            { estado: 'Atendido', fecha: '2026-10-02', horario: '08:30' }
        ];
        const mLegado = calcularMetricasMedico(turnosSinTiempos);
        assert.equal(mLegado.totalTurnos, 2);
        assert.equal(mLegado.atendidos, 1);
        assert.equal(mLegado.tiempoEsperaPromedioMin, null);
        assert.equal(mLegado.duracionRealPromedioMin, null);
        assert.equal(mLegado.porcentajeEvolucionCerrada, 0);
    });

    await t.test('6. calcularMetricasRecepcion - Mix de canal, cancelaciones y calidad', () => {
        const turnos = [
            {
                canal: 'Web',
                estado: 'Confirmado',
                creadoPor: null,
                pacienteDni: '11111111',
                pacienteEmail: 'p1@test.com',
                pacienteCelular: '2604001122'
            },
            {
                canal: 'Web',
                estado: 'Ausente',
                creadoPor: null,
                pacienteDni: '22222222',
                pacienteEmail: 'p2@test.com',
                pacienteCelular: '2604001133'
            },
            {
                canal: 'Presencial',
                estado: 'Atendido',
                creadoPor: 'recep_1',
                pacienteDni: '33333333',
                pacienteEmail: '', // Falta email
                pacienteCelular: '2604001144'
            },
            {
                canal: 'Presencial',
                estado: 'Cancelado en Recepción',
                canceladoPor: 'recepcion',
                creadoPor: 'recep_2',
                pacienteDni: '33333333', // DNI duplicado mismo día
                fecha: '2026-10-02',
                especialidad: 'Clínica Médica',
                pacienteEmail: 'p4@test.com',
                pacienteCelular: '' // Falta celular
            }
        ];

        const usuarios = {
            'recep_1': { nombre: 'Ana Gómez', rol: 'Recepción' },
            'recep_2': { nombre: 'Carlos Ruiz', rol: 'Recepción' }
        };

        const r = calcularMetricasRecepcion(turnos, usuarios);

        assert.equal(r.totalTurnos, 4);

        // Mix de canal: 2 Web, 2 Presenciales = 50% y 50%
        assert.equal(r.mixCanal.web, 2);
        assert.equal(r.mixCanal.presencial, 2);
        assert.equal(r.mixCanal.webPct, 50);
        assert.equal(r.mixCanal.presencialPct, 50);

        // Ausentismo canal Web: 1 de 2 = 50%
        assert.equal(r.ausentismoPorCanal.webPct, 50);

        // Cancelaciones: 1 cancelado de 4 = 25%
        assert.equal(r.tasaCancelacionPct, 25);
        assert.equal(r.cancelacionesPorActor.recepcion, 1);

        // Turnos por persona
        assert.equal(r.turnosPorPersona.length, 2);
        assert.equal(r.turnosPorPersona[0].nombre, 'Ana Gómez');

        // Calidad de carga: de 2 presenciales, 1 sin email y 1 sin celular (50% faltante cada uno)
        assert.equal(r.calidadCarga.sinEmail, 1);
        assert.equal(r.calidadCarga.sinEmailPct, 50);
        assert.equal(r.calidadCarga.sinCelular, 1);
        assert.equal(r.calidadCarga.sinCelularPct, 50);
        assert.ok(r.calidadCarga.puntajeCalidadPct < 100);
    });

    await t.test('7. calcularMetricasGenerales y Comparador', () => {
        const turnosActuales = [
            { fecha: '2026-10-02', horario: '08:00', especialidad: 'Cardiología', estado: 'Atendido', canal: 'Web' },
            { fecha: '2026-10-02', horario: '08:30', especialidad: 'Cardiología', estado: 'Atendido', canal: 'Presencial' },
            { fecha: '2026-10-03', horario: '09:00', especialidad: 'Pediatría', estado: 'Ausente', canal: 'Web' }
        ];

        const turnosPrevios = [
            { fecha: '2026-09-25', horario: '08:00', especialidad: 'Cardiología', estado: 'Atendido', canal: 'Web' },
            { fecha: '2026-09-25', horario: '08:30', especialidad: 'Pediatría', estado: 'Atendido', canal: 'Web' }
        ];

        const g = calcularMetricasGenerales(turnosActuales, turnosPrevios, '2026-10-02');

        assert.equal(g.totalTurnos, 3);
        assert.ok(g.kpis.ausentismo.valor > 0);
        assert.ok(g.kpis.turnosWeb.valor > 0);
        assert.ok(Array.isArray(g.conclusionesAutomaticas));
        assert.ok(g.conclusionesAutomaticas.length > 0);

        // Mapa de calor
        assert.ok(g.mapaCalor.matriz[5]); // Viernes existe en matriz
        assert.ok(Array.isArray(g.rankings.ausentismo));

        // Comparador
        const mA = calcularMetricasMedico(turnosActuales);
        const mB = calcularMetricasMedico(turnosPrevios);
        const comp = compararEntidades(mA, mB, 'Período A', 'Período B');

        assert.equal(comp.nombreA, 'Período A');
        assert.equal(comp.nombreB, 'Período B');
        assert.equal(comp.comparaciones.length, 4);
    });

    await t.test('8. generarTurnosHistoricosDemo - Cobertura temporal, patrones de pico, marcas temporales y sin PII', () => {
        const turnosDemo = generarTurnosHistoricosDemo(new Date('2026-10-02T12:00:00Z'));
        
        // 1. Volumen y cobertura de 60 días
        assert.ok(turnosDemo.length >= 250 && turnosDemo.length <= 500, `Volumen generado (${turnosDemo.length}) debe estar entre 250 y 500 turnos`);
        
        // 2. Todos marcados como demo y reversibles
        const todosDemo = turnosDemo.every(t => t.data.demo === true && t.data.esDemo === true);
        assert.ok(todosDemo, 'Todos los documentos deben contener demo: true y esDemo: true');

        // 3. Sin PII real
        const sinPii = turnosDemo.every(t => 
            t.data.pacienteNombre.startsWith('Paciente Simulado') &&
            t.data.pacienteCelular === '2604000000' &&
            t.data.pacienteDni.startsWith('2000')
        );
        assert.ok(sinPii, 'No debe existir información personal real en los datos sintéticos');

        // 4. No hay fines de semana
        const sinFinesDeSemana = turnosDemo.every(t => {
            const [y, m, d] = t.data.fecha.split('-').map(Number);
            const dt = new Date(y, m - 1, d);
            return dt.getDay() !== 0 && dt.getDay() !== 6;
        });
        assert.ok(sinFinesDeSemana, 'Solo deben programarse turnos de lunes a viernes');

        // 5. Pico de los lunes
        let turnosLunes = 0;
        let turnosOtrosDias = 0;
        let conteoLunesDias = 0;
        let conteoOtrosDias = 0;
        const mapaDias = {};

        turnosDemo.forEach(t => {
            mapaDias[t.data.fecha] = (mapaDias[t.data.fecha] || 0) + 1;
        });

        Object.entries(mapaDias).forEach(([fStr, cant]) => {
            const [y, m, d] = fStr.split('-').map(Number);
            const dt = new Date(y, m - 1, d);
            if (dt.getDay() === 1) {
                turnosLunes += cant;
                conteoLunesDias++;
            } else {
                turnosOtrosDias += cant;
                conteoOtrosDias++;
            }
        });

        const promLunes = turnosLunes / conteoLunesDias;
        const promOtros = turnosOtrosDias / conteoOtrosDias;
        assert.ok(promLunes > promOtros, `El promedio de los lunes (${promLunes.toFixed(1)}) debe ser superior a otros días (${promOtros.toFixed(1)})`);

        // 6. Marcas de tiempo coherentes en atendidos
        const atendidos = turnosDemo.filter(t => t.data.estado === 'Atendido');
        assert.ok(atendidos.length > 0, 'Debe haber turnos atendidos');
        
        const tiemposCoherentes = atendidos.every(t => {
            const llegada = t.data.llegadaEn.getTime();
            const inicio = t.data.inicioConsultaEn.getTime();
            const fin = t.data.finConsultaEn.getTime();
            return llegada <= inicio && inicio < fin;
        });
        assert.ok(tiemposCoherentes, 'En atendidos debe cumplirse llegadaEn <= inicioConsultaEn < finConsultaEn');

        // 7. Ausentismo y cancelaciones presentes
        const ausentes = turnosDemo.filter(t => t.data.estado === 'Ausente');
        const cancelados = turnosDemo.filter(t => t.data.estado === 'Cancelado');
        const tasaAus = ausentes.length / turnosDemo.length;
        const tasaCanc = cancelados.length / turnosDemo.length;

        assert.ok(tasaAus >= 0.08 && tasaAus <= 0.22, `Tasa de ausentismo (${(tasaAus * 100).toFixed(1)}%) debe rondar ~15%`);
        assert.ok(tasaCanc >= 0.05 && tasaCanc <= 0.18, `Tasa de cancelaciones (${(tasaCanc * 100).toFixed(1)}%) debe ser realista`);

        // 8. Quién cancela registrado
        const canceladosConActor = cancelados.every(t => ['paciente', 'recepcion', 'medico'].includes(t.data.canceladoPor));
        assert.ok(canceladosConActor, 'Los cancelados deben detallar canceladoPor');
    });

});
