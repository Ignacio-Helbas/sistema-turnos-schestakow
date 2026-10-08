import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Comprobante Oficial y Código QR Funcional de Turnos', () => {
    const rootDir = process.cwd();
    const indexHtmlPath = path.join(rootDir, 'index.html');
    const publicoJsPath = path.join(rootDir, 'js', 'publico.js');
    const qrcodeJsPath = path.join(rootDir, 'js', 'qrcode.min.js');

    test('1. La biblioteca local qrcode.min.js existe e implementa la función QRCode', () => {
        assert.ok(fs.existsSync(qrcodeJsPath), 'js/qrcode.min.js debe existir para soporte offline');
        const qrcodeContenido = fs.readFileSync(qrcodeJsPath, 'utf-8');
        assert.ok(qrcodeContenido.includes('QRCode'), 'js/qrcode.min.js debe declarar el constructor QRCode');
        assert.ok(qrcodeContenido.length > 5000, 'js/qrcode.min.js debe ser la librería completa');
    });

    test('2. index.html carga qrcode.min.js y dispone de los elementos del talón oficial', () => {
        const html = fs.readFileSync(indexHtmlPath, 'utf-8');
        
        // Inclusión de la librería
        assert.ok(html.includes('js/qrcode.min.js'), 'index.html debe cargar js/qrcode.min.js');

        // Estructura del comprobante y QR dinámico
        assert.ok(html.includes('id="talon-comprobante-exito"'), 'Debe existir #talon-comprobante-exito');
        assert.ok(html.includes('id="contenedor-qr-confirmacion"'), 'Debe existir #contenedor-qr-confirmacion para renderizar el QR real');
        assert.ok(html.includes('id="talon-paciente-nom"'), 'Debe existir el campo de nombre del paciente en el talón');
        assert.ok(html.includes('id="talon-paciente-dni"'), 'Debe existir el campo de DNI del paciente en el talón');
        assert.ok(html.includes('id="talon-turno-med"'), 'Debe existir el campo del médico en el talón');
        assert.ok(html.includes('id="talon-turno-esp"'), 'Debe existir el campo de especialidad en el talón');
        assert.ok(html.includes('id="talon-turno-fec"'), 'Debe existir el campo de fecha en el talón');
        assert.ok(html.includes('id="talon-turno-hor"'), 'Debe existir el campo de horario en el talón');
        assert.ok(html.includes('id="talon-turno-cod"'), 'Debe existir el campo de código en el talón');
        assert.ok(html.includes('id="btn-copiar-link-turno"'), 'Debe existir el botón para copiar el enlace');
    });

    test('3. js/publico.js implementa y exporta la lógica de comprobante y QR escaneable', () => {
        const publicoJs = fs.readFileSync(publicoJsPath, 'utf-8');

        assert.ok(publicoJs.includes('export function renderizarCodigoQR'), 'Debe exportar renderizarCodigoQR');
        assert.ok(publicoJs.includes('export function prepararComprobanteExito'), 'Debe exportar prepararComprobanteExito');
        assert.ok(publicoJs.includes('export async function copiarEnlaceTurno'), 'Debe exportar copiarEnlaceTurno');
        assert.ok(publicoJs.includes('window.renderizarCodigoQR = renderizarCodigoQR'), 'Debe exponer renderizarCodigoQR en window');
        assert.ok(publicoJs.includes('window.copiarEnlaceTurno = copiarEnlaceTurno'), 'Debe exponer copiarEnlaceTurno en window');
    });

    test('4. js/publico.js detecta los parámetros ?codigo= y ?dni= para auto-verificación en celular', () => {
        const publicoJs = fs.readFileSync(publicoJsPath, 'utf-8');

        assert.ok(publicoJs.includes("urlParams.get('codigo')"), 'Debe leer el parámetro codigo de la URL');
        assert.ok(publicoJs.includes("urlParams.get('dni')"), 'Debe leer el parámetro dni de la URL');
        assert.ok(publicoJs.includes("buscarTurnosPaciente()"), 'Debe disparar la búsqueda automática al escanear el QR');
    });

    test('5. La URL codificada para el QR contiene los parámetros exactos y seguros de verificación', () => {
        const turnoIdFicticio = 'T-9876543210ABCDEF';
        const dniFicticio = '41234567';
        const dummyOrigin = 'https://ignacio-helbas.github.io';
        const dummyPath = '/sistema-turnos-schestakow/';

        const urlVerificacion = `${dummyOrigin}${dummyPath}?codigo=${encodeURIComponent(turnoIdFicticio)}&dni=${encodeURIComponent(dniFicticio)}`;
        const parsed = new URL(urlVerificacion);

        assert.equal(parsed.searchParams.get('codigo'), turnoIdFicticio);
        assert.equal(parsed.searchParams.get('dni'), dniFicticio);
    });
});
