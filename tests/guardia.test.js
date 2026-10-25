import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ejecutarUnaVez } from '../js/guardia.js';

describe('Módulo de Guardia Anti Doble Envío (js/guardia.js)', () => {

    test('1. Ejecuta una función y retorna su valor resuelto', async () => {
        let contador = 0;
        const resultado = await ejecutarUnaVez('test-ejecucion-simple', async () => {
            contador++;
            return 'ok';
        });

        assert.equal(resultado, 'ok');
        assert.equal(contador, 1);
    });

    test('2. Ignora llamadas concurrentes simultáneas sobre la misma clave', async () => {
        let ejecucionesIniciadas = 0;

        let resolverPrimera;
        const promesaPrimera = new Promise((resolve) => {
            resolverPrimera = resolve;
        });

        // Disparamos la primera ejecución (asíncrona pendiente)
        const llamada1 = ejecutarUnaVez('clave-bloqueo-concurrente', async () => {
            ejecucionesIniciadas++;
            await promesaPrimera;
            return 'fin-1';
        });

        // Disparamos inmediatamente la segunda llamada con la misma clave
        const llamada2 = ejecutarUnaVez('clave-bloqueo-concurrente', async () => {
            ejecucionesIniciadas++;
            return 'fin-2';
        });

        // La segunda llamada debe resolverse como undefined inmediatamente por estar bloqueada
        const res2 = await llamada2;
        assert.equal(res2, undefined, 'La segunda llamada concurrente debe retornar undefined');
        assert.equal(ejecucionesIniciadas, 1, 'Solo debe haberse iniciado una ejecución');

        // Liberamos la primera promesa
        resolverPrimera();
        const res1 = await llamada1;
        assert.equal(res1, 'fin-1');
    });

    test('3. Permite ejecuciones paralelas de claves distintas', async () => {
        let ejecutadas = 0;

        const [r1, r2] = await Promise.all([
            ejecutarUnaVez('clave-A', async () => {
                ejecutadas++;
                return 'A';
            }),
            ejecutarUnaVez('clave-B', async () => {
                ejecutadas++;
                return 'B';
            })
        ]);

        assert.equal(r1, 'A');
        assert.equal(r2, 'B');
        assert.equal(ejecutadas, 2);
    });

    test('4. Libera la clave al finalizar y permite ejecución secuencial posterior', async () => {
        let llamadas = 0;
        const r1 = await ejecutarUnaVez('clave-secuencial', async () => {
            llamadas++;
            return 'primera';
        });

        const r2 = await ejecutarUnaVez('clave-secuencial', async () => {
            llamadas++;
            return 'segunda';
        });

        assert.equal(r1, 'primera');
        assert.equal(r2, 'segunda');
        assert.equal(llamadas, 2);
    });

    test('5. Libera la clave en el bloque finally si la función arroja una excepción', async () => {
        let claveLiberada = false;

        await assert.rejects(
            async () => {
                await ejecutarUnaVez('clave-con-error', async () => {
                    throw new Error('Fallo simulado');
                });
            },
            {
                name: 'Error',
                message: 'Fallo simulado'
            }
        );

        // Al haber fallado, la clave debió liberarse en finally y admitir nueva ejecución
        const posterior = await ejecutarUnaVez('clave-con-error', async () => {
            claveLiberada = true;
            return 'recuperado';
        });

        assert.equal(posterior, 'recuperado');
        assert.equal(claveLiberada, true);
    });

    test('6. Deshabilita el botón con disabled y aria-busy, y lo restaura en finally (éxito y error)', async () => {
        const crearBotonSimulado = () => {
            const attrs = {};
            return {
                disabled: false,
                setAttribute(nombre, valor) {
                    attrs[nombre] = valor;
                },
                removeAttribute(nombre) {
                    delete attrs[nombre];
                },
                getAttribute(nombre) {
                    return attrs[nombre];
                }
            };
        };

        // Caso con éxito
        const boton1 = crearBotonSimulado();
        let botonDeshabilitadoDuranteEjecucion = false;
        let ariaBusyDuranteEjecucion = null;

        await ejecutarUnaVez('clave-con-boton-exito', async () => {
            botonDeshabilitadoDuranteEjecucion = boton1.disabled;
            ariaBusyDuranteEjecucion = boton1.getAttribute('aria-busy');
            return true;
        }, { boton: boton1 });

        assert.equal(botonDeshabilitadoDuranteEjecucion, true, 'El botón debe estar disabled durante la ejecución');
        assert.equal(ariaBusyDuranteEjecucion, 'true', 'aria-busy debe ser "true" durante la ejecución');
        assert.equal(boton1.disabled, false, 'El botón debe restaurarse a disabled = false al terminar');
        assert.equal(boton1.getAttribute('aria-busy'), undefined, 'aria-busy debe eliminarse al terminar');

        // Caso con error
        const boton2 = crearBotonSimulado();
        await assert.rejects(async () => {
            await ejecutarUnaVez('clave-con-boton-error', async () => {
                assert.equal(boton2.disabled, true);
                assert.equal(boton2.getAttribute('aria-busy'), 'true');
                throw new Error('Error con botón');
            }, { boton: boton2 });
        });

        assert.equal(boton2.disabled, false, 'El botón debe restaurarse incluso si la función falló');
        assert.equal(boton2.getAttribute('aria-busy'), undefined, 'aria-busy debe ser removido incluso si falló');
    });

    test('7. Manejo robusto ante parámetros inválidos', async () => {
        const r1 = await ejecutarUnaVez('', async () => 'no-debe-correr');
        const r2 = await ejecutarUnaVez(null, async () => 'no-debe-correr');
        const r3 = await ejecutarUnaVez('clave-sin-fn', null);
        const r4 = await ejecutarUnaVez('clave-sin-opciones', async () => 123);

        assert.equal(r1, undefined);
        assert.equal(r2, undefined);
        assert.equal(r3, undefined);
        assert.equal(r4, 123);
    });
});
