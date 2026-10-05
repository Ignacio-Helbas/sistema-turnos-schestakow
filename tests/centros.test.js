import { describe, it } from 'node:test';
import assert from 'node:assert';
import { CENTROS_SALUD } from '../js/centros-data.js';
import {
    sanitizarTelefono,
    escaparHTML,
    filtrarCentros,
    formatearIframeEmbed,
    crearTarjetaCentroHTML
} from '../js/centros.js';

describe('Directorio de Centros de Salud de San Rafael', () => {

    it('1. Dataset contiene exactamente 34 centros con estructura íntegra', () => {
        assert.strictEqual(Array.isArray(CENTROS_SALUD), true);
        assert.strictEqual(CENTROS_SALUD.length, 34, 'Deben existir exactamente 34 centros en el dataset');

        CENTROS_SALUD.forEach((c) => {
            assert.ok(c.id && typeof c.id === 'string', `El centro debe tener id válido: ${JSON.stringify(c)}`);
            assert.ok(c.nombre && typeof c.nombre === 'string', `El centro ${c.id} debe tener nombre`);
            assert.ok(c.tipo && typeof c.tipo === 'string', `El centro ${c.id} debe tener tipo`);
            assert.ok(c.zona && typeof c.zona === 'string', `El centro ${c.id} debe tener zona`);
            assert.ok(c.direccion && typeof c.direccion === 'string', `El centro ${c.id} debe tener dirección`);
            assert.ok(c.map_url && c.map_url.startsWith('http'), `El centro ${c.id} debe tener map_url válido`);
            assert.ok(c.map_embed && c.map_embed.includes('<iframe'), `El centro ${c.id} debe incluir map_embed con iframe`);
        });
    });

    it('2. sanitizarTelefono limpia correctamente números y maneja nulos con seguridad', () => {
        assert.strictEqual(sanitizarTelefono('+54 260 442-4000'), '+542604424000');
        assert.strictEqual(sanitizarTelefono('(0260) 442-1234'), '02604421234');
        assert.strictEqual(sanitizarTelefono(null), null);
        assert.strictEqual(sanitizarTelefono(undefined), null);
        assert.strictEqual(sanitizarTelefono(''), null);
        assert.strictEqual(sanitizarTelefono('123'), null, 'Números muy cortos no deben considerarse teléfonos válidos');
    });

    it('3. escaparHTML neutraliza caracteres peligrosos', () => {
        assert.strictEqual(escaparHTML('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
        assert.strictEqual(escaparHTML('A & B "C" \'D\''), 'A &amp; B &quot;C&quot; &#39;D&#39;');
        assert.strictEqual(escaparHTML(null), '');
        assert.strictEqual(escaparHTML(undefined), '');
    });

    it('4. filtrarCentros clasifica correctamente por zona y búsqueda de texto', () => {
        const todos = filtrarCentros(CENTROS_SALUD, 'todos');
        assert.strictEqual(todos.length, 34);

        const ciudad = filtrarCentros(CENTROS_SALUD, 'ciudad');
        assert.strictEqual(ciudad.length, 13, 'Debe haber 13 centros de Ciudad y Barrios (1 Área Sanitaria + 12 CAPS)');

        const distritos = filtrarCentros(CENTROS_SALUD, 'distritos');
        assert.strictEqual(distritos.length, 21, 'Debe haber 21 centros de Distritos');

        // Suma de ambas zonas debe cubrir el total sin centros huérfanos
        assert.strictEqual(ciudad.length + distritos.length, 34);

        // Búsqueda por texto (ej. "Valle Grande" o número de CAPS "183")
        const busquedaCaps = filtrarCentros(CENTROS_SALUD, 'todos', '183');
        assert.ok(busquedaCaps.length >= 1);
        assert.strictEqual(busquedaCaps[0].caps_nro, 183);

        const busquedaNihuil = filtrarCentros(CENTROS_SALUD, 'todos', 'Nihuil');
        assert.ok(busquedaNihuil.length >= 1);
        assert.ok(busquedaNihuil[0].nombre.toLowerCase().includes('nihuil'));
    });

    it('5. formatearIframeEmbed asegura carga diferida y estilos adecuados', () => {
        const rawEmbed = "<iframe width='100%' height='200' src='https://maps.google.com/maps?q=test' frameborder='0'></iframe>";
        const formateado = formatearIframeEmbed(rawEmbed);
        assert.ok(formateado.includes('loading="lazy"'));
        assert.ok(formateado.includes('title='));
        assert.ok(formateado.includes('w-full'));
    });

    it('6. crearTarjetaCentroHTML produce markup limpio sin null ni undefined', () => {
        const centroConTel = CENTROS_SALUD.find((c) => c.telefono !== null);
        const centroSinTel = CENTROS_SALUD.find((c) => c.telefono === null);

        assert.ok(centroConTel, 'Debe existir un centro con teléfono para la prueba');
        assert.ok(centroSinTel, 'Debe existir un centro sin teléfono para la prueba');

        const htmlConTel = crearTarjetaCentroHTML(centroConTel);
        assert.ok(!htmlConTel.includes('null'), 'No debe haber texto "null" en el HTML generado');
        assert.ok(!htmlConTel.includes('undefined'), 'No debe haber texto "undefined" en el HTML generado');
        assert.ok(htmlConTel.includes('href="tel:'), 'Debe incluir enlace tel: para llamada nativa');
        assert.ok(htmlConTel.includes('target="_blank"'), 'Debe abrir Google Maps en nueva pestaña');

        const htmlSinTel = crearTarjetaCentroHTML(centroSinTel);
        assert.ok(!htmlSinTel.includes('null'));
        assert.ok(!htmlSinTel.includes('undefined'));
        assert.ok(htmlSinTel.includes('Sin teléfono registrado'), 'Debe mostrar texto informativo cuando no hay teléfono');
    });
});
