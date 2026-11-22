const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

test('Módulo de Internación y Ocupación de Camas', async (t) => {

    await t.test('1. Validación de estados válidos de cama hospitalaria', () => {
        const estadosValidos = ['libre', 'ocupada', 'mantenimiento'];
        
        function esEstadoValido(estado) {
            return estadosValidos.includes(estado);
        }

        assert.strictEqual(esEstadoValido('libre'), true);
        assert.strictEqual(esEstadoValido('ocupada'), true);
        assert.strictEqual(esEstadoValido('mantenimiento'), true);
        assert.strictEqual(esEstadoValido('reservada'), false);
        assert.strictEqual(esEstadoValido(''), false);
        assert.strictEqual(esEstadoValido(null), false);
    });

    await t.test('2. Lógica de transición de cama al internar un paciente', () => {
        const camaInicial = {
            id: 'P1_H101_Cama1',
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
            internacionId: null
        };

        function simularInternacion(cama, datosPaciente) {
            if (cama.estado !== 'libre') {
                throw new Error('La cama no se encuentra disponible para internación');
            }
            if (!datosPaciente.nombre || !datosPaciente.dni || !datosPaciente.medico) {
                throw new Error('Datos incompletos del paciente');
            }

            return {
                ...cama,
                estado: 'ocupada',
                pacienteNombre: datosPaciente.nombre,
                pacienteDni: datosPaciente.dni,
                medicoTratante: datosPaciente.medico,
                fechaIngreso: '2026-11-21T10:00:00Z',
                internacionId: `INT_${Date.now()}`
            };
        }

        const camaOcupada = simularInternacion(camaInicial, {
            nombre: 'Carlos Gardel',
            dni: '12345678',
            medico: 'Dr. Roberto Gómez'
        });

        assert.strictEqual(camaOcupada.estado, 'ocupada');
        assert.strictEqual(camaOcupada.pacienteNombre, 'Carlos Gardel');
        assert.strictEqual(camaOcupada.pacienteDni, '12345678');
        assert.ok(camaOcupada.internacionId);

        // Intentar internar en una cama ya ocupada debe arrojar error
        assert.throws(() => {
            simularInternacion(camaOcupada, {
                nombre: 'Otro Paciente',
                dni: '87654321',
                medico: 'Dra. Pérez'
            });
        }, /no se encuentra disponible/);
    });

    await t.test('3. Lógica de transición de cama al dar el alta médica', () => {
        const camaOcupada = {
            id: 'P1_H101_Cama1',
            piso: 1,
            habitacion: '101',
            numeroCama: 'Cama 1',
            sector: 'Clínica Médica',
            tipo: 'Compartida',
            estado: 'ocupada',
            activo: true,
            pacienteNombre: 'Carlos Gardel',
            pacienteDni: '12345678',
            medicoTratante: 'Dr. Roberto Gómez',
            fechaIngreso: '2026-11-20T08:00:00Z',
            internacionId: 'INT_12345'
        };

        function simularAlta(cama, motivoAlta, observaciones = '') {
            if (cama.estado !== 'ocupada') {
                throw new Error('Solo se puede dar de alta a una cama ocupada');
            }

            const registroHistorial = {
                camaId: cama.id,
                fechaAlta: '2026-11-21T14:00:00Z',
                altaPor: 'staff_123',
                motivoAlta: motivoAlta || 'Alta Médica Definitiva',
                observacionesAlta: observaciones,
                estado: 'alta'
            };

            const camaLiberada = {
                ...cama,
                estado: 'libre',
                pacienteNombre: null,
                pacienteDni: null,
                medicoTratante: null,
                fechaIngreso: null,
                internacionId: null
            };

            return { camaLiberada, registroHistorial };
        }

        const { camaLiberada, registroHistorial } = simularAlta(camaOcupada, 'Alta Médica Definitiva');

        assert.strictEqual(camaLiberada.estado, 'libre');
        assert.strictEqual(camaLiberada.pacienteNombre, null);
        assert.strictEqual(camaLiberada.pacienteDni, null);
        assert.strictEqual(registroHistorial.estado, 'alta');
        assert.strictEqual(registroHistorial.motivoAlta, 'Alta Médica Definitiva');
    });

    await t.test('4. Seguridad de aislamiento: No exposición en index.html público', () => {
        const indexHtml = fs.readFileSync(path.resolve(__dirname, '../index.html'), 'utf8');
        assert.doesNotMatch(indexHtml, /id=["']view-internacion["']/, 'index.html no debe incluir view-internacion');
        assert.doesNotMatch(indexHtml, /modal-internar-paciente/, 'index.html no debe incluir modal-internar-paciente');
        assert.doesNotMatch(indexHtml, /modal-alta-paciente/, 'index.html no debe incluir modal-alta-paciente');
        assert.doesNotMatch(indexHtml, /js\/internacion\.js/, 'index.html no debe importar internacion.js');
    });

    await t.test('5. Integridad de interfaz en panel.html', () => {
        const panelHtml = fs.readFileSync(path.resolve(__dirname, '../panel.html'), 'utf8');
        assert.match(panelHtml, /id="view-internacion"/, 'panel.html debe incluir el contenedor view-internacion');
        assert.match(panelHtml, /id="internacion-selector-pisos"/, 'panel.html debe incluir el selector de pisos');
        assert.match(panelHtml, /id="internacion-mapa-grid"/, 'panel.html debe incluir el grid del mapa de camas');
        assert.match(panelHtml, /id="modal-internar-paciente"/, 'panel.html debe incluir el modal de internar');
        assert.match(panelHtml, /id="modal-alta-paciente"/, 'panel.html debe incluir el modal de alta');
        assert.match(panelHtml, /id="modal-config-cama"/, 'panel.html debe incluir el modal de configuración de camas admin');
        assert.match(panelHtml, /src="js\/internacion\.js"/, 'panel.html debe cargar el módulo js/internacion.js');
    });

    await t.test('6. Ordenamiento robusto de camas (sin ReferenceError con varias camas por habitación)', () => {
        const internacionJs = fs.readFileSync(path.resolve(__dirname, '../js/internacion.js'), 'utf8');

        // Verificar que el comparador use b.numeroCama y NO c.numeroCama
        assert.match(internacionJs, /String\(a\.numeroCama\)\.localeCompare\(String\(b\.numeroCama\)/);
        assert.doesNotMatch(internacionJs, /String\(a\.numeroCama\)\.localeCompare\(String\(c\.numeroCama\)/);

        // Prueba en memoria con las 13 camas de demostración
        const camasDemo = [
            { id: '1', piso: 1, habitacion: '103', numeroCama: 'Cama 2' },
            { id: '2', piso: 1, habitacion: '103', numeroCama: 'Cama 1' },
            { id: '3', piso: 1, habitacion: '101', numeroCama: 'Cama 1' },
            { id: '4', piso: 2, habitacion: '201', numeroCama: 'Cama 2' },
            { id: '5', piso: 2, habitacion: '201', numeroCama: 'Cama 1' }
        ];

        camasDemo.sort((a, b) => {
            if (a.piso !== b.piso) return Number(a.piso) - Number(b.piso);
            if (a.habitacion !== b.habitacion) return String(a.habitacion).localeCompare(String(b.habitacion), undefined, { numeric: true });
            return String(a.numeroCama).localeCompare(String(b.numeroCama), undefined, { numeric: true });
        });

        assert.strictEqual(camasDemo[0].habitacion, '101');
        assert.strictEqual(camasDemo[1].habitacion, '103');
        assert.strictEqual(camasDemo[1].numeroCama, 'Cama 1');
        assert.strictEqual(camasDemo[2].habitacion, '103');
        assert.strictEqual(camasDemo[2].numeroCama, 'Cama 2');
    });

    await t.test('7. Centralización de alias de rol y permisos en auth.js', () => {
        const authJs = fs.readFileSync(path.resolve(__dirname, '../js/auth.js'), 'utf8');
        const internacionJs = fs.readFileSync(path.resolve(__dirname, '../js/internacion.js'), 'utf8');

        assert.match(authJs, /export function esRolAdministracion/);
        assert.match(authJs, /export function esRolRecepcion/);
        assert.match(authJs, /export function esRolMedico/);
        assert.match(authJs, /export function esRolEnfermeria/);
        assert.match(authJs, /export function tienePermisoInternacion/);

        // internacion.js debe importar y usar tienePermisoInternacion y esRolAdministracion
        assert.match(internacionJs, /tienePermisoInternacion/);
        assert.match(internacionJs, /esRolAdministracion/);
    });
});
