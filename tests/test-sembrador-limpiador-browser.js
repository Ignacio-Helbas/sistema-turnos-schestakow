const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml'
};

const baseDir = process.cwd();
const artifactDir = 'C:\\Users\\nacho\\.gemini\\antigravity\\brain\\176137f8-6556-4815-aa6e-5ff31c52522c';

const server = http.createServer((req, res) => {
    let reqPath = req.url.split('?')[0];
    if (reqPath === '/' || reqPath === '') reqPath = '/panel.html';
    const filePath = path.join(baseDir, reqPath);

    fs.readFile(filePath, (err, content) => {
        if (err) {
            res.writeHead(404);
            res.end('Not found: ' + reqPath);
            return;
        }
        const ext = path.extname(filePath);
        res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
        res.end(content);
    });
});

const mockFirebaseESM = `
    window.__mockDB = {
        usuarios: {
            'admin_uid': {
                activo: true,
                rol: 'Administración',
                nombre: 'Ignacio Helbas',
                correo: 'ignaciohelbas@gmail.com'
            }
        },
        medicos_publicos: {},
        turnos: {},
        camas: {},
        quirofanos: {},
        reservas_quirofano: {},
        pacientes: {},
        pacientes_por_dni: {},
        historial_internaciones: {
            'HIST_INMUTABLE_1': {
                id: 'HIST_INMUTABLE_1',
                camaId: 'P1_H101_C1',
                piso: 1,
                habitacion: '101',
                numeroCama: 'Cama 1',
                sector: 'Clínica Médica',
                pacienteNombre: 'Paciente Histórico Previo',
                pacienteDni: '12345678',
                medicoTratante: 'Dr. René Favaloro',
                fechaIngreso: '2026-10-01T08:00:00Z',
                fechaAlta: '2026-10-05T12:00:00Z',
                estado: 'alta'
            }
        }
    };

    export function initializeApp() { return {}; }
    export function deleteApp() { return Promise.resolve(); }
    export function getAuth() { return { currentUser: { uid: 'admin_uid' } }; }
    export function getFirestore() { return {}; }
    export function getFunctions() { return {}; }
    export function httpsCallable() { return () => Promise.resolve({ data: {} }); }
    export function collection(db, col) { return { _col: col }; }
    export function doc(db, col, id) { return { _col: col, id: id || ('doc_' + Math.random().toString(36).substring(2)) }; }
    export function query(colRef, ...conditions) { return { _col: colRef._col, conditions }; }
    export function where(campo, op, valor) { return { campo, op, valor }; }
    export function orderBy(campo, dir) { return { campo, dir }; }
    export function limit() { return {}; }
    export function startAfter() { return {}; }

    export function getDoc(docRef) {
        const col = docRef._col;
        const id = docRef.id;
        const data = window.__mockDB[col] ? window.__mockDB[col][id] : null;
        return Promise.resolve({
            exists: () => !!data,
            data: () => data || null,
            id: id
        });
    }

    export function getDocs(q) {
        const col = q._col || (q.collection && q.collection._col) || '';
        const dict = window.__mockDB[col] || {};
        const docs = Object.keys(dict).map(id => ({
            id,
            ref: { _col: col, id },
            data: () => dict[id]
        }));
        return Promise.resolve({
            docs,
            forEach(cb) { docs.forEach(cb); },
            empty: docs.length === 0
        });
    }

    export function setDoc(docRef, data, options) {
        const col = docRef._col;
        const id = docRef.id;
        if (!window.__mockDB[col]) window.__mockDB[col] = {};
        if (options && options.merge && window.__mockDB[col][id]) {
            window.__mockDB[col][id] = Object.assign({}, window.__mockDB[col][id], data);
        } else {
            window.__mockDB[col][id] = Object.assign({}, data);
        }
        return Promise.resolve();
    }

    export function addDoc(colRef, data) {
        const col = colRef._col;
        const id = 'auto_' + Math.random().toString(36).substring(2);
        if (!window.__mockDB[col]) window.__mockDB[col] = {};
        window.__mockDB[col][id] = Object.assign({}, data);
        return Promise.resolve({ id, _col: col });
    }

    export function updateDoc(docRef, data) {
        const col = docRef._col;
        const id = docRef.id;
        if (window.__mockDB[col] && window.__mockDB[col][id]) {
            window.__mockDB[col][id] = Object.assign({}, window.__mockDB[col][id], data);
        }
        return Promise.resolve();
    }

    export function deleteDoc(docRef) {
        const col = docRef._col;
        const id = docRef.id;
        if (window.__mockDB[col] && window.__mockDB[col][id]) {
            delete window.__mockDB[col][id];
        }
        return Promise.resolve();
    }

    export function serverTimestamp() { return new Date().toISOString(); }

    export function writeBatch() {
        const ops = [];
        return {
            set: (docRef, data, options) => {
                ops.push(() => setDoc(docRef, data, options));
            },
            delete: (docRef) => {
                ops.push(() => deleteDoc(docRef));
            },
            commit: async () => {
                for (const op of ops) await op();
            }
        };
    }

    export function signInWithEmailAndPassword() { return Promise.resolve({ user: { uid: 'admin_uid' } }); }
    export function createUserWithEmailAndPassword() { return Promise.resolve({ user: { uid: 'new_uid' } }); }
    export function signOut() { return Promise.resolve(); }
    export function onAuthStateChanged(auth, cb) {
        setTimeout(() => cb(auth.currentUser), 10);
        return () => {};
    }
    export function sendPasswordResetEmail() { return Promise.resolve(); }
    export function signInAnonymously() { return Promise.resolve({ user: { uid: 'anon' } }); }
    export function onSnapshot() { return () => {}; }
    export function arrayUnion(...items) { return items; }
    export function initializeAppCheck() { return null; }
    export class ReCaptchaV3Provider {}
`;

const PORT = 8099;

server.listen(PORT, async () => {
    console.log(`[Servidor Local] Escuchando en http://localhost:${PORT}`);
    let browser;
    try {
        browser = await puppeteer.launch({
            executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1440, height: 900 });

        page.on('console', msg => console.log('PAGE LOG:', msg.text()));
        page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

        // Interceptar SDKs externos para correr 100% aislados y deterministas
        await page.setRequestInterception(true);
        page.on('request', req => {
            const url = req.url();
            const headers = {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': '*',
                'Content-Type': 'application/javascript'
            };

            if (url.includes('firebase-app.js') || url.includes('firebase-auth.js') ||
                url.includes('firebase-firestore.js') || url.includes('firebase-functions.js') ||
                url.includes('firebase-app-check.js')) {
                req.respond({ status: 200, headers, body: mockFirebaseESM });
                return;
            }
            if (url.includes('chart.js') || url.includes('canvas-confetti') || url.includes('xlsx')) {
                req.respond({ status: 200, headers, body: 'window.Chart = function(){ return { update: ()=>{}, destroy: ()=>{} }; };' });
                return;
            }
            req.continue();
        });

        console.log('-> 1. Cargando panel con sesión de Administración...');
        await page.evaluateOnNewDocument(() => {
            sessionStorage.setItem('hospital_sesion_activa', 'true');
            sessionStorage.setItem('hospital_usuario_sesion', JSON.stringify({
                uid: 'admin_uid',
                nombre: 'Ignacio Helbas',
                correo: 'ignaciohelbas@gmail.com',
                rol: 'Administración',
                activo: true
            }));
            // Auto-aprobar confirmaciones modales durante el test
            window.__autoConfirmar = true;
        });

        await page.goto(`http://localhost:${PORT}/panel.html?dev=1`, { waitUntil: 'networkidle0' });

        // Asegurar sesión de Administrador y auto-aceptar modales de confirmación
        await page.evaluate(() => {
            window.establecerSesionActual({
                uid: 'admin_uid',
                nombre: 'Ignacio Helbas',
                correo: 'ignaciohelbas@gmail.com',
                rol: 'Administración',
                activo: true
            });
            window.switchView('admin');

            setInterval(() => {
                const modal = document.getElementById('modal-confirmacion');
                const btn = document.getElementById('btn-confirm-aceptar');
                if (modal && modal.classList.contains('active') && btn) {
                    btn.click();
                }
            }, 30);
        });

        // 2. Verificar estado inicial: Base vacía salvo historial_internaciones previo
        const estadoInicial = await page.evaluate(() => {
            return {
                turnos: Object.keys(window.__mockDB.turnos).length,
                camas: Object.keys(window.__mockDB.camas).length,
                quirofanos: Object.keys(window.__mockDB.quirofanos).length,
                reservas: Object.keys(window.__mockDB.reservas_quirofano).length,
                historial: Object.keys(window.__mockDB.historial_internaciones).length,
                usuarios: Object.keys(window.__mockDB.usuarios).length
            };
        });
        console.log('   Estado Inicial BD:', JSON.stringify(estadoInicial));
        assert.strictEqual(estadoInicial.turnos, 0, 'No debe haber turnos iniciales');
        assert.strictEqual(estadoInicial.camas, 0, 'No debe haber camas iniciales');
        assert.strictEqual(estadoInicial.reservas, 0, 'No debe haber reservas iniciales');
        assert.strictEqual(estadoInicial.historial, 1, 'Historial previo debe existir');

        // 3. Ejecutar Sembrador de Escenario Demo Completo
        console.log('-> 2. Ejecutando Sembrador Demo Completo desde la interfaz de Administración...');
        await page.evaluate(async () => {
            await window.sembrarEscenarioDemoCompleto();
        });

        // Captura del panel de Administración tras la siembra
        const imgAdminSembrado = path.join(artifactDir, 'admin-escenario-demo-sembrado.png');
        await page.screenshot({ path: imgAdminSembrado, fullPage: false });
        console.log(`[Evidencia] Captura Admin Sembrado guardada en: ${imgAdminSembrado}`);

        // 4. Verificar integridad y coherencia de datos sembrados
        const estadoPostSiembra = await page.evaluate(() => {
            const t = window.__mockDB.turnos;
            const c = window.__mockDB.camas;
            const q = window.__mockDB.quirofanos;
            const r = window.__mockDB.reservas_quirofano;
            const m = window.__mockDB.medicos_publicos;

            const turnosArray = Object.values(t);
            const camasArray = Object.values(c);
            const reservasArray = Object.values(r);

            return {
                turnosCount: turnosArray.length,
                turnosEstados: turnosArray.map(x => x.estado),
                turnosCanales: turnosArray.map(x => x.canal),
                camasCount: camasArray.length,
                camasLibres: camasArray.filter(x => x.estado === 'libre').length,
                camasOcupadas: camasArray.filter(x => x.estado === 'ocupada').length,
                camasMantenimiento: camasArray.filter(x => x.estado === 'mantenimiento').length,
                quirofanosCount: Object.keys(q).length,
                reservasCount: reservasArray.length,
                reservasCirujanosUids: reservasArray.map(x => x.cirujanoUid),
                medicosUids: Object.keys(m)
            };
        });

        console.log('   Reporte de Siembra:', JSON.stringify(estadoPostSiembra, null, 2));

        // Aserciones de Turnos
        assert.strictEqual(estadoPostSiembra.turnosCount, 8, 'Deben sembrarse exactamente 8 turnos');
        const estadosValidos = ['Atendido', 'En Consultorio', 'En Espera', 'Confirmado Presencial', 'Confirmado', 'Cancelado'];
        estadoPostSiembra.turnosEstados.forEach(est => {
            assert.ok(estadosValidos.includes(est), `Estado de turno inválido: ${est}`);
        });

        // Aserciones de Camas
        assert.strictEqual(estadoPostSiembra.camasCount, 12, 'Deben sembrarse exactamente 12 camas');
        assert.strictEqual(estadoPostSiembra.camasLibres, 6, 'Deben haber 6 camas libres');
        assert.strictEqual(estadoPostSiembra.camasOcupadas, 4, 'Deben haber 4 camas ocupadas');
        assert.strictEqual(estadoPostSiembra.camasMantenimiento, 2, 'Deben haber 2 camas en mantenimiento');

        // Aserciones de Quirófanos y Cirugías vinculadas
        assert.strictEqual(estadoPostSiembra.quirofanosCount, 3, 'Deben existir 3 quirófanos (Q1, Q2, Q3)');
        assert.strictEqual(estadoPostSiembra.reservasCount, 4, 'Deben existir 4 cirugías programadas');
        
        // Comprobar que los cirujanoUid corresponden exactamente a los médicos sembrados
        estadoPostSiembra.reservasCirujanosUids.forEach(uid => {
            assert.ok(estadoPostSiembra.medicosUids.includes(uid), `El cirujanoUid ${uid} no pertenece a los médicos sembrados`);
        });

        // 5. Verificar visualmente la renderización en el módulo de Internación (Mapa de Camas)
        console.log('-> 3. Verificando visualización del mapa de camas en Internación...');
        await page.evaluate(() => {
            window.switchView('internacion');
            window.renderizarMapaCamas(1);
        });
        const imgInternacion = path.join(artifactDir, 'internacion-mapa-camas-sembradas.png');
        await page.screenshot({ path: imgInternacion, fullPage: false });
        console.log(`[Evidencia] Captura Internación guardada en: ${imgInternacion}`);

        // 6. Verificar visualmente el módulo de Quirófanos
        console.log('-> 4. Verificando visualización de cirugías en Quirófanos...');
        await page.evaluate(() => {
            window.switchView('quirofanos');
        });
        const imgQuirofanos = path.join(artifactDir, 'quirofanos-cirugias-sembradas.png');
        await page.screenshot({ path: imgQuirofanos, fullPage: false });
        console.log(`[Evidencia] Captura Quirófanos guardada en: ${imgQuirofanos}`);

        // 7. Ejecutar Limpieza ("Limpiar Datos Demo")
        console.log('-> 5. Regresando a Administración y ejecutando Limpiar Datos Demo...');
        await page.evaluate(async () => {
            window.switchView('admin');
            await window.limpiarDatosDemoConConfirmacion();
        });

        // Captura del panel de Administración tras la limpieza
        const imgAdminLimpio = path.join(artifactDir, 'admin-datos-limpiados.png');
        await page.screenshot({ path: imgAdminLimpio, fullPage: false });
        console.log(`[Evidencia] Captura Admin Limpio guardada en: ${imgAdminLimpio}`);

        // 8. Verificar estado final tras limpieza (Inmutabilidad de historial y cuenta SuperAdmin)
        const estadoPostLimpieza = await page.evaluate(() => {
            return {
                turnos: Object.keys(window.__mockDB.turnos).length,
                camas: Object.keys(window.__mockDB.camas).length,
                quirofanos: Object.keys(window.__mockDB.quirofanos).length,
                reservas: Object.keys(window.__mockDB.reservas_quirofano).length,
                medicos: Object.keys(window.__mockDB.medicos_publicos).length,
                historialInternaciones: Object.keys(window.__mockDB.historial_internaciones).length,
                superadminExiste: !!window.__mockDB.usuarios['admin_uid']
            };
        });

        console.log('   Reporte Post Limpieza:', JSON.stringify(estadoPostLimpieza, null, 2));

        assert.strictEqual(estadoPostLimpieza.turnos, 0, 'Los turnos deben quedar en 0');
        assert.strictEqual(estadoPostLimpieza.camas, 0, 'Las camas deben quedar en 0');
        assert.strictEqual(estadoPostLimpieza.reservas, 0, 'Las reservas de quirófano deben quedar en 0');
        assert.strictEqual(estadoPostLimpieza.quirofanos, 0, 'Los quirófanos deben quedar en 0');
        assert.strictEqual(estadoPostLimpieza.medicos, 0, 'El catálogo médico de prueba debe quedar en 0');
        // REGLAS CLAVE:
        assert.strictEqual(estadoPostLimpieza.historialInternaciones, 1, 'CRÍTICO: historial_internaciones DEBE permanecer inmutable');
        assert.strictEqual(estadoPostLimpieza.superadminExiste, true, 'CRÍTICO: La cuenta de Administración en usuarios/ debe permanecer intacta');

        console.log('\n===================================================================');
        console.log('✅ TODAS LAS PRUEBAS DEL SEMBRADOR Y LIMPIADOR SUPERADAS CON ÉXITO');
        console.log('===================================================================');

    } catch (err) {
        console.error('❌ Error en prueba automatizada:', err);
        process.exitCode = 1;
    } finally {
        if (browser) await browser.close();
        server.close();
    }
});
