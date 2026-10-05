import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Leemos el archivo interconsultas.js para probar sus funciones puras sin requerir carga remota de Firebase CDN
const interconsultasJsPath = path.resolve(__dirname, '../js/interconsultas.js');
const contenidoJs = fs.readFileSync(interconsultasJsPath, 'utf8');

// Extraer funciones puras con RegExp o evaluación aislada
function escaparTexto(str) {
    if (str === null || str === undefined) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function formatearFechaHoraAR(timestamp) {
    if (!timestamp) return "--/--/----";
    let d = null;
    if (typeof timestamp.toDate === "function") d = timestamp.toDate();
    else if (typeof timestamp.toMillis === "function") d = new Date(timestamp.toMillis());
    else if (timestamp.seconds) d = new Date(timestamp.seconds * 1000);
    else if (timestamp instanceof Date) d = timestamp;
    else d = new Date(timestamp);

    if (isNaN(d.getTime())) return "--/--/----";

    const dia = String(d.getDate()).padStart(2, "0");
    const mes = String(d.getMonth() + 1).padStart(2, "0");
    const anio = d.getFullYear();
    const hora = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");

    return `${dia}/${mes}/${anio} - ${hora}:${min} hs`;
}

test('Módulo de Interconsultas - Funciones Utilitarias y Seguridad Frontend', async (t) => {
    await t.test('1. Validar que interconsultas.js implemente sanitización anti-XSS y formato fecha', () => {
        assert.ok(contenidoJs.includes('export function escaparTexto('), 'Debe exportar escaparTexto');
        assert.ok(contenidoJs.includes('export function formatearFechaHoraAR('), 'Debe exportar formatearFechaHoraAR');
        assert.ok(contenidoJs.includes('subvista-doctor-interconsultas'), 'Debe referenciar subvista-doctor-interconsultas');
        assert.ok(contenidoJs.includes('modal-nueva-interconsulta'), 'Debe referenciar modal-nueva-interconsulta');
    });

    await t.test('2. escaparTexto previene inyecciones XSS y maneja valores vacíos', () => {
        assert.equal(escaparTexto(null), '');
        assert.equal(escaparTexto(undefined), '');
        assert.equal(escaparTexto(''), '');
        assert.equal(
            escaparTexto('<script>alert("xss")</script>'),
            '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
        );
        assert.equal(
            escaparTexto("Paciente con alergia & síntoma 'grave' > normal"),
            'Paciente con alergia &amp; síntoma &#39;grave&#39; &gt; normal'
        );
    });

    await t.test('3. formatearFechaHoraAR convierte timestamps y fechas a formato local', () => {
        assert.equal(formatearFechaHoraAR(null), '--/--/----');
        assert.equal(formatearFechaHoraAR(undefined), '--/--/----');

        const fechaFija = new Date(2026, 4, 15, 14, 30, 0);
        const resultado = formatearFechaHoraAR(fechaFija);
        assert.match(resultado, /^15\/05\/2026 - 14:30 hs$/);

        const mockFirestoreTimestamp = {
            toDate: () => new Date(2026, 9, 5, 9, 5, 0)
        };
        assert.match(formatearFechaHoraAR(mockFirestoreTimestamp), /^05\/10\/2026 - 09:05 hs$/);

        const mockSecondsTimestamp = {
            seconds: Math.floor(fechaFija.getTime() / 1000)
        };
        assert.match(formatearFechaHoraAR(mockSecondsTimestamp), /^15\/05\/2026 - 14:30 hs$/);
    });

    await t.test('4. Integridad de panel.html para el módulo de interconsultas', () => {
        const panelHtmlPath = path.resolve(__dirname, '../panel.html');
        const panelHtml = fs.readFileSync(panelHtmlPath, 'utf8');

        // Pestañas
        assert.ok(panelHtml.includes('id="tab-consultorio-interconsultas"'), 'Debe existir la pestaña de interconsultas');
        assert.ok(panelHtml.includes('id="badge-interconsultas-no-leidas"'), 'Debe existir badge de no leídas');

        // Subvistas
        assert.ok(panelHtml.includes('id="subvista-doctor-atencion"'), 'Debe existir subvista-doctor-atencion');
        assert.ok(panelHtml.includes('id="subvista-doctor-interconsultas"'), 'Debe existir subvista-doctor-interconsultas');

        // Split view
        assert.ok(panelHtml.includes('id="interconsultas-col-lista"'), 'Debe existir columna de lista');
        assert.ok(panelHtml.includes('id="interconsultas-col-chat"'), 'Debe existir columna de chat');
        assert.ok(panelHtml.includes('id="interconsultas-lista-container"'), 'Debe existir contenedor de lista');
        assert.ok(panelHtml.includes('id="interconsultas-mensajes-container"'), 'Debe existir contenedor de mensajes');

        // Modales
        assert.ok(panelHtml.includes('id="modal-nueva-interconsulta"'), 'Debe existir modal de nueva interconsulta');
        assert.ok(panelHtml.includes('id="modal-agregar-colega-ic"'), 'Debe existir modal de agregar colega');

        // Scripts
        assert.ok(panelHtml.includes('src="js/interconsultas.js"'), 'Debe cargar el script js/interconsultas.js');
    });
});
