const puppeteer = require('puppeteer-core');
const http = require('http');
const fs = require('fs');
const path = require('path');

const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml'
};

const baseDir = process.cwd();

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
    const salasIniciales = [
        { id: 'Q1', nombre: 'Quirófano 1 Central', activo: true, orden: 1 },
        { id: 'Q2', nombre: 'Quirófano 2 Traumatología', activo: true, orden: 2 }
    ];
    window.__mockSalas = salasIniciales;
    if (!window.__mockReservas) window.__mockReservas = [];

    export function initializeApp() { return {}; }
    export function deleteApp() { return Promise.resolve(); }
    export function getAuth() { return { currentUser: null }; }
    export function getFirestore() { return {}; }
    export function getFunctions() { return {}; }
    export function httpsCallable() { return () => Promise.resolve({ data: {} }); }
    export function collection(db, nombre) { return { _col: nombre }; }
    export function doc(db, col, id) { return { _col: col, id: id || 'doc_' + Math.random().toString(36).substring(2, 7) }; }
    export function query(colRef, ...conditions) { return { _col: colRef._col, conditions }; }
    export function where(campo, op, valor) { return { campo, op, valor }; }
    export function orderBy(campo, dir) { return { campo, dir }; }
    export function limit() { return {}; }
    export function startAfter() { return {}; }
    
    export function getDoc(docRef) {
        return Promise.resolve({
            exists: () => true,
            data: () => ({ activo: true, rol: 'Médico', nombre: 'Dr. Cirujano Puppeteer' })
        });
    }

    export function getDocs(q) {
        const col = q._col || (q.collection && q.collection._col) || '';
        if (col === 'quirofanos') {
            return Promise.resolve({
                docs: window.__mockSalas.map(s => ({ id: s.id, data: () => s })),
                forEach(cb) { window.__mockSalas.forEach(s => cb({ id: s.id, data: () => s })); },
                empty: window.__mockSalas.length === 0
            });
        }
        if (col === 'reservas_quirofano') {
            const docs = window.__mockReservas.map(r => ({ id: r.id, data: () => r }));
            return Promise.resolve({
                docs,
                forEach(cb) { docs.forEach(cb); },
                empty: docs.length === 0
            });
        }
        return Promise.resolve({ docs: [], forEach() {}, empty: true });
    }

    export function setDoc(docRef, data) {
        return Promise.resolve();
    }

    export function addDoc(colRef, data) {
        const id = 'res_' + Math.random().toString(36).substring(2, 9);
        const item = { id, ...data };
        window.__mockReservas.push(item);
        return Promise.resolve({ id });
    }

    export function updateDoc(docRef, data) {
        const r = window.__mockReservas.find(x => x.id === docRef.id);
        if (r) Object.assign(r, data);
        return Promise.resolve();
    }

    export function deleteDoc(docRef) {
        window.__mockReservas = window.__mockReservas.filter(x => x.id !== docRef.id);
        return Promise.resolve();
    }

    export function serverTimestamp() { return new Date().toISOString(); }
    export function writeBatch() { return { set: () => {}, commit: () => Promise.resolve() }; }
    export function signInWithEmailAndPassword() { return Promise.resolve({ user: { uid: 'med_test' } }); }
    export function createUserWithEmailAndPassword() { return Promise.resolve({ user: { uid: 'new_uid' } }); }
    export function signOut() { return Promise.resolve(); }
    export function onAuthStateChanged() { return () => {}; }
    export function sendPasswordResetEmail() { return Promise.resolve(); }
    export function signInAnonymously() { return Promise.resolve({ user: { uid: 'anon' } }); }
    export function onSnapshot() { return () => {}; }
    export function arrayUnion(...items) { return items; }
    export function initializeAppCheck() { return null; }
    export class ReCaptchaV3Provider {}
`;

const PORT = 8094;

server.listen(PORT, async () => {
    console.log(`[Servidor Local] Iniciado en http://localhost:${PORT}`);
    let browser;
    try {
        browser = await puppeteer.launch({
            executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();
        const logs = [];
        const jsErrors = [];

        await page.setRequestInterception(true);
        page.on('request', req => {
            const url = req.url();
            const headers = {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                'Access-Control-Allow-Headers': '*',
                'Content-Type': 'application/javascript'
            };

            if (url.includes('www.gstatic.com/firebasejs')) {
                req.respond({ status: 200, headers, body: mockFirebaseESM });
                return;
            }
            if (url.includes('cdn.tailwindcss.com')) {
                req.respond({ status: 200, headers, body: 'window.tailwind = { config: {} };' });
                return;
            }
            if (url.includes('cdn.sheetjs.com') || url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')) {
                req.respond({ status: 200, headers, body: 'window.XLSX = {};' });
                return;
            }
            req.continue();
        });

        page.on('console', msg => {
            const txt = msg.text();
            logs.push(`[${msg.type()}] ${txt}`);
            if (msg.type() === 'error') {
                jsErrors.push(`[Console Error] ${txt}`);
            }
        });

        page.on('pageerror', err => {
            jsErrors.push(`[Page Error] ${err.message}`);
        });

        await page.goto(`http://localhost:${PORT}/panel.html`, { waitUntil: 'load' });
        await new Promise(r => setTimeout(r, 1200));

        // 1. Simular inicio de sesión como Médico
        console.log("-> 1. Estableciendo sesión autenticada de Médico...");
        await page.evaluate(() => {
            sessionStorage.setItem('hospital_sesion_activa', 'true');
            window.establecerSesionActual({
                uid: 'med_cirujano_puppeteer',
                rol: 'Médico',
                nombre: 'Dr. Cirujano Puppeteer',
                correo: 'cirujano@schestakow.ar',
                permisosAdicionales: []
            });
            window.switchView('quirofanos');
        });

        await new Promise(r => setTimeout(r, 800));

        // 2. Inicializar módulo de quirófanos y verificar vista activa
        console.log("-> 2. Inicializando módulo de quirófanos...");
        const estadoInicial = await page.evaluate(async () => {
            await window.inicializarModuloQuirofanos();
            const viewQ = document.getElementById('view-quirofanos');
            const selectSala = document.getElementById('modal-quirofano-select-sala');
            return {
                viewQuirofanosVisible: viewQ && !viewQ.classList.contains('hidden'),
                salasCargadasEnSelect: selectSala ? selectSala.options.length : 0
            };
        });
        console.log("   Estado inicial de vista:", estadoInicial);

        // 3. Abrir modal de nueva reserva
        console.log("-> 3. Abriendo modal de nueva reserva de quirófano...");
        await page.evaluate(() => {
            window.abrirModalNuevaReservaQuirofano();
        });
        await new Promise(r => setTimeout(r, 400));

        // 4. Completar formulario con cirugía para Carlos Puppeteer
        console.log("-> 4. Completando campos del formulario...");
        await page.evaluate(() => {
            document.getElementById('modal-quirofano-select-sala').value = 'Q1';
            document.getElementById('modal-quirofano-input-fecha').value = '2026-12-10';
            document.getElementById('modal-quirofano-input-hora-inicio').value = '08:00';
            document.getElementById('modal-quirofano-select-duracion').value = '90';
            window.actualizarPreviewHoraFinModal();
            document.getElementById('modal-quirofano-input-paciente-nombre').value = 'Carlos Puppeteer';
            document.getElementById('modal-quirofano-input-paciente-dni').value = '35123456';
            document.getElementById('modal-quirofano-input-cirujano').value = 'Dr. Cirujano Puppeteer';
            document.getElementById('modal-quirofano-input-especialidad').value = 'Cirugía General';
            document.getElementById('modal-quirofano-input-procedimiento').value = 'Colecistectomía laparoscópica';
        });

        // 5. Guardar reserva mediante el flujo real (invocando window.guardarReservaQuirofano)
        console.log("-> 5. Guardando reserva de quirófano...");
        await page.evaluate(async () => {
            await window.guardarReservaQuirofano();
        });
        await new Promise(r => setTimeout(r, 1000));

        // 6. Verificar que la reserva fue creada en la base y renderizada en la grilla
        console.log("-> 6. Verificando persistencia y renderizado en grilla...");
        const resultadoFinal = await page.evaluate(() => {
            const modal = document.getElementById('modal-nueva-reserva-quirofano');
            const grilla = document.getElementById('quirofano-grilla-salas');
            const reservasGuardadas = window.__mockReservas || [];
            const grillaHTML = grilla ? grilla.innerHTML : '';

            return {
                modalCerrado: modal ? modal.classList.contains('hidden') : false,
                cantidadReservasGuardadas: reservasGuardadas.length,
                reservaGuardada: reservasGuardadas[0] || null,
                pacienteEnGrilla: grillaHTML.includes('Carlos Puppeteer'),
                procedimientoEnGrilla: grillaHTML.includes('Colecistectomía')
            };
        });

        console.log("\n=======================================================");
        console.log("RESULTADO DE PRUEBA EN CHROME REAL (PUPPETEER):");
        console.log(JSON.stringify(resultadoFinal, null, 2));
        console.log("=======================================================");

        // Capturar screenshot de evidencia
        const screenshotPath = 'C:\\Users\\nacho\\.gemini\\antigravity\\brain\\176137f8-6556-4815-aa6e-5ff31c52522c\\browser_evidence\\quirofanos-reserva-chrome.png';
        fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`Screenshot guardado en: ${screenshotPath}`);

        const erroresCriticos = jsErrors.filter(e => !e.includes('favicon.ico') && !e.includes('Password field'));
        console.log(`Errores de consola de JS: ${erroresCriticos.length}`);
        if (erroresCriticos.length > 0) {
            console.log("Detalle de errores:", erroresCriticos);
        }

    } catch (e) {
        console.error("Fallo durante la prueba Puppeteer:", e);
    } finally {
        if (browser) await browser.close();
        server.close();
        process.exit(0);
    }
});
