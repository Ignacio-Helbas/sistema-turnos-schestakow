/**
 * Pruebas unitarias de integridad de la UI para Roles y Permisos Adicionales
 * Validación de panel.html, js/admin.js, js/panel.js y js/quirofanos.js
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

test('Matriz de UI y Permisos Adicionales de Personal', async (t) => {

    await t.test('1. panel.html contiene los 4 roles hospitalarios y los 4 permisos adicionales en modal-usuario', () => {
        const panelHtml = fs.readFileSync(path.resolve(__dirname, '../panel.html'), 'utf8');

        // Roles en select
        assert.match(panelHtml, /<option value="Administración">Administración<\/option>/);
        assert.match(panelHtml, /<option value="Recepción">Recepción<\/option>/);
        assert.match(panelHtml, /<option value="Médico">Médico<\/option>/);
        assert.match(panelHtml, /<option value="Enfermería">Enfermería<\/option>/);

        // Permisos adicionales
        assert.match(panelHtml, /id="div-usuario-permisos"/);
        assert.match(panelHtml, /id="chk-permiso-coordina-quirofano"\s+value="coordinaQuirofano"/);
        assert.match(panelHtml, /id="chk-permiso-anestesia"\s+value="anestesia"/);
        assert.match(panelHtml, /id="chk-permiso-instrumentacion"\s+value="instrumentacion"/);
        assert.match(panelHtml, /id="chk-permiso-internacion"\s+value="internacion"/);

        // Contenedor de permisos en sesión activa
        assert.match(panelHtml, /id="usuario-sesion-permisos"/);
    });

    await t.test('2. js/admin.js gestiona permisos adicionales y sincronización de staff', () => {
        const adminJs = fs.readFileSync(path.resolve(__dirname, '../js/admin.js'), 'utf8');

        // Limpieza de checkboxes al abrir modal nuevo
        assert.match(adminJs, /chk-permiso-coordina-quirofano/);
        assert.match(adminJs, /chk-permiso-anestesia/);
        assert.match(adminJs, /chk-permiso-instrumentacion/);
        assert.match(adminJs, /chk-permiso-internacion/);

        // Recolectar permisosAdicionales en payload
        assert.match(adminJs, /permisosAdicionales:\s*permisosAdicionales/);

        // Badges y chips en tabla de usuarios
        assert.match(adminJs, /Enfermería/);
        assert.match(adminJs, /permisosLabels/);

        // Sincronización mediante Cloud Function administrarUsuarioStaff
        assert.match(adminJs, /administrarUsuarioStaff/);

        // Normalización de roles legados en editarUsuarioAdmin
        assert.match(adminJs, /esRolAdministracion\(rolNormalizado\)/);
        assert.match(adminJs, /esRolMedico\(rolNormalizado\)/);
        assert.match(adminJs, /esRolEnfermeria\(rolNormalizado\)/);
        assert.match(adminJs, /esRolRecepcion\(rolNormalizado\)/);

        // Uso de funciones centralizadas para matrícula y especialidad
        assert.match(adminJs, /esRolMedico\(rol\)\s*\|\|\s*esRolEnfermeria\(rol\)/);

        // Rollback de Auth si falla setDoc en nuevo usuario
        assert.match(adminJs, /administrarUsuarioStaff.*eliminar:\s*true/s);

        // Desactivación de catálogo público si rol cambia a no-Médico
        assert.match(adminJs, /if\s*\(id\s*&&\s*!esRolMedico\(rol\)\)\s*\{[\s\S]*?medicos_publicos[\s\S]*?activo:\s*false/);

        // Filtrado de permisos adicionales según rol base
        assert.match(adminJs, /actualizarPermisosSegunRol/);
    });

    await t.test('3. js/panel.js controla visibilidad y switchView con permisos adicionales', () => {
        const panelJs = fs.readFileSync(path.resolve(__dirname, '../js/panel.js'), 'utf8');

        // Centralización de funciones de rol importadas de auth.js
        assert.match(panelJs, /import\s*\{[\s\S]*?esRolAdministracion[\s\S]*?\} from "\.\/auth\.js"/);
        assert.match(panelJs, /const esAdmin = esRolAdministracion\(rol\)/);
        assert.match(panelJs, /const esRecepcion = esRolRecepcion\(rol\)/);
        assert.match(panelJs, /const esMedico = esRolMedico\(rol\)/);
        assert.match(panelJs, /const esEnfermeria = esRolEnfermeria\(rol\)/);

        // Soporte para permisos adicionales
        assert.match(panelJs, /tieneCoordQuirofano/);
        assert.match(panelJs, /tieneAnestesia/);
        assert.match(panelJs, /tieneInstrumentacion/);
        assert.match(panelJs, /tieneInternacion/);

        // Visibilidad de internacion y quirofanos en switchView
        assert.match(panelJs, /viewName === 'internacion'/);
        assert.match(panelJs, /viewName === 'quirofanos'/);
    });

    await t.test('4. js/quirofanos.js crea reservas exclusivamente vía Cloud Function reservarQuirofano', () => {
        const quirofanosJs = fs.readFileSync(path.resolve(__dirname, '../js/quirofanos.js'), 'utf8');

        // Debe importar httpsCallable y functionsInstancia
        assert.match(quirofanosJs, /httpsCallable/);
        assert.match(quirofanosJs, /functionsInstancia/);

        // Debe llamar a la Cloud Function reservarQuirofano
        assert.match(quirofanosJs, /httpsCallable\(functionsInstancia,\s*"reservarQuirofano"\)/);

        // NO debe escribir directamente en reservas_quirofano mediante addDoc
        assert.doesNotMatch(quirofanosJs, /addDoc\(collection\(db,\s*"reservas_quirofano"\)/);
    });

    await t.test('5. js/internacion.js restringe controles según rol y permisos', () => {
        const internacionJs = fs.readFileSync(path.resolve(__dirname, '../js/internacion.js'), 'utf8');

        // Control de botón de configuración de camas exclusivo de Administración
        assert.match(internacionJs, /btn-admin-config-camas/);

        // Control de permisos para internación y alta
        assert.match(internacionJs, /puedeOperar/);
        assert.match(internacionJs, /btn-confirmar-alta-paciente/);
    });
});
