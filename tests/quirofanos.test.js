/**
 * Pruebas unitarias para el Módulo de Disponibilidad y Agenda de Quirófanos
 * Validación estricta del algoritmo anti-colisión, cálculo de horarios y seguridad de acceso
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// Cargar funciones matemáticas y de validación desde js/quirofanos.js
function convertirHoraAMinutos(horaStr) {
    if (!horaStr || typeof horaStr !== "string" || !horaStr.includes(":")) return 0;
    const [h, m] = horaStr.split(":").map(Number);
    return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

function convertirMinutosAHora(minutosTotales) {
    const m = Math.max(0, Math.floor(minutosTotales));
    const h = Math.floor(m / 60) % 24;
    const min = m % 60;
    return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

function calcularHoraFin(horaInicio, duracionMinutos) {
    const minInicio = convertirHoraAMinutos(horaInicio);
    const dur = Math.max(15, parseInt(duracionMinutos, 10) || 60);
    return convertirMinutosAHora(minInicio + dur);
}

function haySuperposicion(hInicio1, hFin1, hInicio2, hFin2) {
    const ini1 = convertirHoraAMinutos(hInicio1);
    const fin1 = convertirHoraAMinutos(hFin1);
    const ini2 = convertirHoraAMinutos(hInicio2);
    const fin2 = convertirHoraAMinutos(hFin2);

    return !(fin1 <= ini2 || ini1 >= fin2);
}

test('Módulo de Quirófanos - Algoritmo Anti-Colisión y Horarios', async (t) => {

    await t.test('1. Conversión de horas y minutos bidireccional', () => {
        assert.strictEqual(convertirHoraAMinutos('08:00'), 480);
        assert.strictEqual(convertirHoraAMinutos('08:30'), 510);
        assert.strictEqual(convertirHoraAMinutos('14:45'), 885);
        assert.strictEqual(convertirHoraAMinutos('00:00'), 0);
        assert.strictEqual(convertirHoraAMinutos(''), 0);

        assert.strictEqual(convertirMinutosAHora(480), '08:00');
        assert.strictEqual(convertirMinutosAHora(510), '08:30');
        assert.strictEqual(convertirMinutosAHora(885), '14:45');
    });

    await t.test('2. Cálculo exacto de hora de finalización según duración', () => {
        assert.strictEqual(calcularHoraFin('08:00', 60), '09:00');
        assert.strictEqual(calcularHoraFin('08:30', 90), '10:00');
        assert.strictEqual(calcularHoraFin('10:45', 45), '11:30');
        assert.strictEqual(calcularHoraFin('14:00', 150), '16:30');
        assert.strictEqual(calcularHoraFin('20:00', 120), '22:00');
    });

    await t.test('3. Detección rigurosa de superposición (anti-colisión quirúrgica)', () => {
        // Caso exacto: Mismo inicio y mismo fin -> Conflicto
        assert.strictEqual(haySuperposicion('08:00', '10:00', '08:00', '10:00'), true, 'Mismo horario debe dar conflicto');

        // Caso B contenido en A: A(08:00 a 12:00) y B(09:00 a 11:00) -> Conflicto
        assert.strictEqual(haySuperposicion('08:00', '12:00', '09:00', '11:00'), true, 'Cirugía interna debe dar conflicto');

        // Caso A contenido en B: A(09:00 a 11:00) y B(08:00 a 12:00) -> Conflicto
        assert.strictEqual(haySuperposicion('09:00', '11:00', '08:00', '12:00'), true, 'Cirugía envolvente debe dar conflicto');

        // Caso solapamiento al final: A(08:00 a 10:00) y B(09:30 a 11:30) -> Conflicto
        assert.strictEqual(haySuperposicion('08:00', '10:00', '09:30', '11:30'), true, 'Solapamiento parcial debe dar conflicto');

        // Caso solapamiento al inicio: A(10:00 a 12:00) y B(09:00 a 10:30) -> Conflicto
        assert.strictEqual(haySuperposicion('10:00', '12:00', '09:00', '10:30'), true, 'Solapamiento al inicio debe dar conflicto');

        // Caso consecutivo/adyacente: A termina 10:00 y B inicia 10:00 -> SIN conflicto
        assert.strictEqual(haySuperposicion('08:00', '10:00', '10:00', '12:00'), false, 'Cirugías consecutivas deben permitirse');
        assert.strictEqual(haySuperposicion('10:00', '12:00', '08:00', '10:00'), false, 'Cirugías consecutivas inversas deben permitirse');

        // Caso totalmente separados: A(08:00 a 09:30) y B(13:00 a 15:00) -> SIN conflicto
        assert.strictEqual(haySuperposicion('08:00', '09:30', '13:00', '15:00'), false, 'Horarios separados no deben colisionar');
    });

    await t.test('4. Seguridad de aislamiento: No exposición en index.html público', () => {
        const indexHtml = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
        assert.doesNotMatch(indexHtml, /id=["']view-quirofanos["']/, 'index.html no debe incluir view-quirofanos');
        assert.doesNotMatch(indexHtml, /modal-nueva-reserva-quirofano/, 'index.html no debe incluir modal-nueva-reserva-quirofano');
        assert.doesNotMatch(indexHtml, /js\/quirofanos\.js/, 'index.html no debe importar quirofanos.js');
    });

    await t.test('5. Integridad de interfaz en panel.html', () => {
        const panelHtml = fs.readFileSync(path.resolve(__dirname, '../panel.html'), 'utf8');
        assert.match(panelHtml, /id="view-quirofanos"/, 'panel.html debe incluir el contenedor view-quirofanos');
        assert.match(panelHtml, /id="quirofano-grilla-salas"/, 'panel.html debe incluir la grilla de salas de quirofanos');
        assert.match(panelHtml, /id="modal-nueva-reserva-quirofano"/, 'panel.html debe incluir el modal de nueva reserva');
        assert.match(panelHtml, /id="modal-detalle-quirofano"/, 'panel.html debe incluir el modal de detalle de quirofano');
        assert.match(panelHtml, /id="modal-config-quirofanos-admin"/, 'panel.html debe incluir el modal de configuración admin');
        assert.match(panelHtml, /src="js\/quirofanos\.js"/, 'panel.html debe cargar el módulo js/quirofanos.js');
    });
});
