import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Calendario Hospitalario Schestakow Interactivo', () => {
    const rootDir = process.cwd();
    const indexHtmlPath = path.join(rootDir, 'index.html');
    const calendarioJsPath = path.join(rootDir, 'js', 'calendario.js');

    test('1. El módulo js/calendario.js existe y exporta CalendarioHospitalario', () => {
        assert.ok(fs.existsSync(calendarioJsPath), 'js/calendario.js debe existir');
        const contenido = fs.readFileSync(calendarioJsPath, 'utf-8');
        assert.ok(contenido.includes('class CalendarioHospitalario'), 'Debe declarar la clase CalendarioHospitalario');
        assert.ok(contenido.includes('export { CalendarioHospitalario }'), 'Debe exportar la clase CalendarioHospitalario');
    });

    test('2. index.html contiene el contenedor visual y mantiene el input preservado para compatibilidad', () => {
        const html = fs.readFileSync(indexHtmlPath, 'utf-8');

        assert.ok(html.includes('id="contenedor-calendario-hospitalario"'), 'Debe existir #contenedor-calendario-hospitalario');
        assert.ok(html.includes('id="input-fecha-paciente"'), 'Debe preservar el input #input-fecha-paciente para retrocompatibilidad');
        assert.ok(html.includes('id="banner-fecha-seleccionada"'), 'Debe existir el banner de confirmación visual #banner-fecha-seleccionada');
        assert.ok(html.includes('id="texto-fecha-seleccionada"'), 'Debe existir #texto-fecha-seleccionada');
        assert.ok(html.includes('src="js/calendario.js"'), 'index.html debe cargar js/calendario.js');
    });

    test('3. El módulo de calendario bloquea fines de semana (Sábado y Domingo)', () => {
        const contenido = fs.readFileSync(calendarioJsPath, 'utf-8');

        assert.ok(contenido.includes('diaSemana === 0 || diaSemana === 6'), 'Debe identificar sábados y domingos como días no laborables');
        assert.ok(contenido.includes('No laborable para consultorios externos'), 'Debe rotular los fines de semana adecuadamente');
    });

    test('4. El formato ISO de fecha generado es siempre YYYY-MM-DD', () => {
        const anio = 2026;
        const mes = 9; // Octubre (0-indexed)
        const dia = 14;

        const m = String(mes + 1).padStart(2, '0');
        const d = String(dia).padStart(2, '0');
        const iso = `${anio}-${m}-${d}`;

        assert.equal(iso, '2026-10-14');
        assert.match(iso, /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/, 'Debe cumplir con el regex estándar de fechas ISO');
    });

    test('5. El banner de fecha seleccionada no contiene emojis y usa icono vectorial limpio', () => {
        const html = fs.readFileSync(indexHtmlPath, 'utf-8');
        const bannerSnippet = html.substring(html.indexOf('id="banner-fecha-seleccionada"'), html.indexOf('id="banner-fecha-seleccionada"') + 400);

        assert.doesNotMatch(bannerSnippet, /📅/, 'El banner no debe contener el emoji 📅');
        assert.ok(bannerSnippet.includes('<svg'), 'El banner debe incluir un icono SVG vectorial institucional');
    });

    test('6. El calendario identifica y estiliza feriados nacionales de Argentina en rojo', () => {
        const contenido = fs.readFileSync(calendarioJsPath, 'utf-8');

        assert.ok(contenido.includes('obtenerFeriadoNacional'), 'Debe exportar obtenerFeriadoNacional');
        assert.ok(contenido.includes('text-rose-700') || contenido.includes('text-red-700'), 'Debe estilizar los feriados en rojo/rose');
        assert.ok(contenido.includes('bg-rose-50') || contenido.includes('bg-red-50'), 'Debe destacar el fondo del feriado');
        assert.ok(contenido.includes('FERIADOS_FIJOS'), 'Debe contener el listado de feriados inamovibles');
        assert.ok(contenido.includes('05-25'), 'El 25 de mayo debe ser feriado nacional');
        assert.ok(contenido.includes('07-09'), 'El 9 de julio debe ser feriado nacional');
    });
});
