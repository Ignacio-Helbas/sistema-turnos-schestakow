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
    export function onSnapshot(q, onNext) {
        const col = q._col || (q.collection && q.collection._col) || '';
        setTimeout(() => {
            const dict = window.__mockDB[col] || {};
            const docs = Object.keys(dict).map(id => ({
                id,
                ref: { _col: col, id },
                data: () => dict[id]
            }));
            if (typeof onNext === 'function') {
                onNext({
                    docs,
                    forEach(cb) { docs.forEach(cb); },
                    empty: docs.length === 0
                });
            }
        }, 30);
        return () => {};
    }
    export function arrayUnion(...items) { return items; }
    export function initializeAppCheck() { return null; }
    export class ReCaptchaV3Provider {}
`;

const PORT = 8099;

server.listen(PORT, async () => {
    let browser;
    try {
        console.log(`[Servidor Local] Activo en http://localhost:${PORT}`);

        const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
        browser = await puppeteer.launch({
            executablePath: chromePath,
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1366,800']
        });

        const page = await browser.newPage();
        await page.setViewport({ width: 1366, height: 800 });

        page.on('console', msg => console.log('PAGE LOG:', msg.text()));
        page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

        await page.setRequestInterception(true);
        page.on('request', req => {
            const url = req.url();
            const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/javascript' };
            if (url.includes('firebase-app.js') || url.includes('firebase-firestore.js') ||
                url.includes('firebase-auth.js') || url.includes('firebase-functions.js') ||
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

        // Simular sesión de Administración previa a la carga
        await page.evaluateOnNewDocument(() => {
            sessionStorage.setItem('hospital_sesion_activa', 'true');
            sessionStorage.setItem('hospital_usuario_sesion', JSON.stringify({
                uid: 'admin_uid',
                nombre: 'Ignacio Helbas',
                correo: 'ignaciohelbas@gmail.com',
                rol: 'Administración',
                activo: true
            }));
            window.__autoConfirmar = true;
        });

        // Cargar panel
        await page.goto(`http://localhost:${PORT}/panel.html?dev=1`, { waitUntil: 'networkidle0' });

        // Inyectar utilidades de layout offline correspondientes a Tailwind
        await page.addStyleTag({
            content: `
                body {
                    background-color: #f1f5f9 !important;
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
                }
                .grid { display: grid !important; }
                .grid-cols-1 { grid-template-columns: repeat(1, minmax(0, 1fr)) !important; }
                .grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
                .grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; }
                @media (min-width: 1024px) {
                    .lg\\:grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; }
                }
                @media (min-width: 1280px) {
                    .xl\\:grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; }
                }
                .gap-1 { gap: 0.25rem !important; }
                .gap-1\\.5 { gap: 0.375rem !important; }
                .gap-2 { gap: 0.5rem !important; }
                .gap-2\\.5 { gap: 0.625rem !important; }
                .gap-3 { gap: 0.75rem !important; }
                .gap-4 { gap: 1rem !important; }
                .gap-4\\.5 { gap: 1.125rem !important; }
                .flex { display: flex !important; }
                .inline-flex { display: inline-flex !important; }
                .flex-col { flex-direction: column !important; }
                .flex-row { flex-direction: row !important; }
                .items-center { align-items: center !important; }
                .justify-between { justify-content: space-between !important; }
                .justify-center { justify-content: center !important; }
                .shrink-0 { flex-shrink: 0 !important; }
                .min-w-0 { min-width: 0px !important; }
                .w-full { width: 100% !important; }
                .rounded-md { border-radius: 0.375rem !important; }
                .rounded-lg { border-radius: 0.5rem !important; }
                .rounded-xl { border-radius: 0.75rem !important; }
                .rounded-2xl { border-radius: 1rem !important; }
                .rounded-full { border-radius: 9999px !important; }
                .border { border-width: 1px !important; border-style: solid !important; }
                .p-2 { padding: 0.5rem !important; }
                .p-2\\.5 { padding: 0.625rem !important; }
                .p-3 { padding: 0.75rem !important; }
                .p-3\\.5 { padding: 0.875rem !important; }
                .p-4 { padding: 1rem !important; }
                .px-2 { padding-left: 0.5rem !important; padding-right: 0.5rem !important; }
                .py-1 { padding-top: 0.25rem !important; padding-bottom: 0.25rem !important; }
                .px-1\\.5 { padding-left: 0.375rem !important; padding-right: 0.375rem !important; }
                .py-0\\.5 { padding-top: 0.125rem !important; padding-bottom: 0.125rem !important; }
                .bg-white { background-color: #ffffff !important; }
                .bg-slate-50 { background-color: #f8fafc !important; }
                .bg-slate-100 { background-color: #f1f5f9 !important; }
                .border-slate-100 { border-color: #f1f5f9 !important; }
                .border-slate-200 { border-color: #e2e8f0 !important; }
                .border-slate-200\\/80, .border-slate-200\\/90 { border-color: rgba(226, 232, 240, 0.9) !important; }
                .text-slate-900 { color: #0f172a !important; }
                .text-slate-700 { color: #334155 !important; }
                .text-slate-600 { color: #475569 !important; }
                .text-slate-500 { color: #64748b !important; }
                .text-slate-400 { color: #94a3b8 !important; }
                .text-white { color: #ffffff !important; }
                .font-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important; }
                .font-bold { font-weight: 700 !important; }
                .font-semibold { font-weight: 600 !important; }
                .font-medium { font-weight: 500 !important; }
                .text-xs { font-size: 0.75rem !important; line-height: 1rem !important; }
                .text-sm { font-size: 0.875rem !important; line-height: 1.25rem !important; }
                .text-\\[9px\\] { font-size: 9px !important; line-height: 12px !important; }
                .text-\\[10px\\] { font-size: 10px !important; line-height: 14px !important; }
                .text-\\[11px\\] { font-size: 11px !important; line-height: 15px !important; }
                .truncate {
                    overflow: hidden !important;
                    text-overflow: ellipsis !important;
                    white-space: nowrap !important;
                }
                .whitespace-nowrap { white-space: nowrap !important; }
                .shadow-2xs { box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05) !important; }
                .shadow-md { box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1) !important; }
            `
        });

        // Configurar sesión activa y auto-confirmaciones
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
            }, 40);
        });

        // Paso 1: Sembrar escenario demo completo
        console.log('-> 1. Sembrando datos de demostración en Administración...');
        await page.evaluate(async () => {
            await window.sembrarEscenarioDemoCompleto();
        });
        await new Promise(r => setTimeout(r, 600));

        // Paso 2: Cambiar a vista de Internación y seleccionar Piso 2
        console.log('-> 2. Cambiando a vista de Internación en Piso 2...');
        await page.evaluate(async () => {
            window.switchView('internacion');
            await window.cargarCamasHospital();
            window.seleccionarPisoInternacion(2);
        });
        await new Promise(r => setTimeout(r, 800));

        // Paso 3: Auditar tarjetas de camas en Piso 2 (Hab 201, 202, 203)
        console.log('-> 3. Auditando contención de texto y recuadros en Piso 2...');
        const diagnosticoCamas = await page.evaluate(() => {
            const grid = document.getElementById('internacion-mapa-grid');
            if (!grid) return { error: 'No se encontró grid' };

            const tarjetas = Array.from(grid.querySelectorAll('[role="button"]'));
            return tarjetas.map(t => {
                const cardRect = t.getBoundingClientRect();
                const numCamaEl = t.querySelector('.font-mono');
                const badgeEl = t.querySelector('.rounded-full');

                // Verificar si algún hijo desborda el ancho del recuadro
                let desborda = false;
                let maxRight = cardRect.right;
                Array.from(t.querySelectorAll('*')).forEach(child => {
                    const r = child.getBoundingClientRect();
                    if (r.right > cardRect.right + 2) {
                        desborda = true;
                        if (r.right > maxRight) maxRight = r.right;
                    }
                });

                return {
                    numCamaTexto: numCamaEl ? numCamaEl.textContent.trim() : '',
                    numCamaMultilinea: numCamaEl ? numCamaEl.offsetHeight > 20 : false,
                    badgeTexto: badgeEl ? badgeEl.textContent.trim() : '',
                    asignarTexto: t.innerText.includes('Asignar'),
                    textoDuplicadoAsignar: t.innerText.includes('+ + Asignar'),
                    textoDuplicadoDr: t.innerText.includes('Dr. Dr.'),
                    desbordaDerecha: desborda,
                    cardWidth: cardRect.width,
                    cardRight: cardRect.right,
                    maxRightHijos: maxRight
                };
            });
        });

        console.log('   Resultados de recuadros de camas en Piso 2:\n', JSON.stringify(diagnosticoCamas, null, 2));

        // Aserciones rigurosas
        assert.ok(diagnosticoCamas.length >= 6, 'Deben existir al menos 6 camas en Piso 2 (Hab 201, 202, 203)');
        diagnosticoCamas.forEach(c => {
            assert.strictEqual(c.numCamaMultilinea, false, `El nombre de la cama "${c.numCamaTexto}" no debe partirse en dos líneas`);
            assert.strictEqual(c.desbordaDerecha, false, `El recuadro de "${c.numCamaTexto}" no debe desbordar hacia la derecha (exceso: ${c.maxRightHijos - c.cardRight}px)`);
            assert.strictEqual(c.textoDuplicadoAsignar, false, `No debe figurar duplicado "+ + Asignar" en "${c.numCamaTexto}"`);
            assert.strictEqual(c.textoDuplicadoDr, false, `No debe figurar duplicado "Dr. Dr." en "${c.numCamaTexto}"`);
        });

        // Captura de evidencia de Piso 2 corregido (enfocada en las habitaciones 201, 202 y 203)
        const gridElement = await page.$('#internacion-mapa-grid');
        const imgPiso2 = path.join(artifactDir, 'internacion-recuadros-piso2-corregido.png');
        if (gridElement) {
            await gridElement.screenshot({ path: imgPiso2 });
        } else {
            await page.screenshot({ path: imgPiso2, fullPage: false });
        }
        console.log(`[Evidencia] Captura Piso 2 corregido guardada en: ${imgPiso2}`);

        // Paso 4: Auditar identidad visual de los desplegables (selects)
        console.log('-> 4. Auditando consistencia e identidad visual de los desplegables...');
        const diagnosticoSelects = await page.evaluate(() => {
            const selects = Array.from(document.querySelectorAll('select'));
            return selects.map(s => {
                const style = window.getComputedStyle(s);
                return {
                    id: s.id,
                    clases: s.className,
                    paddingRight: parseFloat(style.paddingRight),
                    paddingLeft: parseFloat(style.paddingLeft),
                    height: parseFloat(style.height),
                    bgColor: style.backgroundColor,
                    tieneArrow: style.backgroundImage.includes('svg')
                };
            });
        });

        console.log(`   Se auditaron ${diagnosticoSelects.length} listas desplegables en el sistema.`);
        const muestraSelects = diagnosticoSelects.filter(s => ['internacion-filtro-sector', 'internacion-filtro-estado', 'quirofano-filtro-sala', 'admin-filtro-rol'].includes(s.id));
        console.log('   Muestra representativa de desplegables:', JSON.stringify(muestraSelects, null, 2));

        diagnosticoSelects.forEach(sel => {
            assert.ok(sel.tieneArrow, `El desplegable #${sel.id} debe incluir la flecha vectorial institucional`);
            assert.ok(sel.paddingRight >= 28, `El desplegable #${sel.id} debe tener padding derecho adecuado (${sel.paddingRight}px) para no pisar la flecha`);
        });

        // Captura de la barra de filtros y desplegables institucionales
        const barraFiltrosHandle = await page.evaluateHandle(() => {
            const selectEl = document.getElementById('internacion-filtro-sector');
            return selectEl ? selectEl.closest('.bg-white') : null;
        });
        const imgSelects = path.join(artifactDir, 'desplegables-identidad-visual.png');
        const barraElem = barraFiltrosHandle.asElement();
        if (barraElem) {
            await barraElem.screenshot({ path: imgSelects });
        } else {
            await page.screenshot({ path: imgSelects, clip: { x: 50, y: 150, width: 1200, height: 250 } });
        }
        console.log(`[Evidencia] Captura desplegables guardada en: ${imgSelects}`);

        console.log('\n===================================================================');
        console.log('✅ TODAS LAS PRUEBAS VISUALES Y RECUADROS SUPERADAS CON ÉXITO');
        console.log('===================================================================');

    } catch (err) {
        console.error('❌ Error en prueba de interfaz:', err);
        process.exitCode = 1;
    } finally {
        if (browser) await browser.close();
        server.close();
    }
});
