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

const camasDemo = [
    {
        id: 'P1_H101_C1',
        piso: 1,
        habitacion: '101',
        numeroCama: 'Cama 1',
        sector: 'Clínica Médica',
        tipo: 'Compartida',
        estado: 'libre',
        activo: true
    },
    {
        id: 'P1_H101_C2',
        piso: 1,
        habitacion: '101',
        numeroCama: 'Cama 2',
        sector: 'Clínica Médica',
        tipo: 'Compartida',
        estado: 'ocupada',
        pacienteNombre: 'María Elena Walsh',
        pacienteDni: '18234567',
        pacienteCobertura: 'OSDE 310',
        medicoTratante: 'Dr. René Favaloro',
        fechaIngreso: '2026-11-20T10:00:00Z',
        activo: true
    }
];

const mockFirebaseESM = `
    window.__mockCamas = ${JSON.stringify(camasDemo)};
    window.__mockUsuarios = {
        'admin_uid': { activo: true, rol: 'Administración', nombre: 'Administrador General' },
        'enf_1': { activo: true, rol: 'Enfermería', nombre: 'Lic. Matías Valenzuela', permisosAdicionales: ['internacion'] },
        'rec_1': { activo: true, rol: 'Recepción', nombre: 'Ana Morales', permisosAdicionales: ['internacion'] }
    };

    export function initializeApp() { return {}; }
    export function deleteApp() { return Promise.resolve(); }
    export function getAuth() { return { currentUser: { uid: 'admin_uid' } }; }
    export function getFirestore() { return {}; }
    export function getFunctions() { return {}; }
    export function httpsCallable() { return () => Promise.resolve({ data: {} }); }
    export function collection(db, nombre) { return { _col: nombre }; }
    export function doc(db, col, id) { return { _col: col, id: id || 'doc_test' }; }
    export function query(colRef, ...conditions) { return { _col: colRef._col, conditions }; }
    export function where(campo, op, valor) { return { campo, op, valor }; }
    export function orderBy(campo, dir) { return { campo, dir }; }
    export function limit() { return {}; }
    export function startAfter() { return {}; }
    
    export function getDoc(docRef) {
        if (docRef._col === 'usuarios') {
            const u = window.__mockUsuarios[docRef.id];
            return Promise.resolve({ exists: () => !!u, data: () => u || null });
        }
        if (docRef._col === 'camas') {
            const c = window.__mockCamas.find(x => x.id === docRef.id);
            return Promise.resolve({ exists: () => !!c, data: () => c || null });
        }
        return Promise.resolve({ exists: () => false, data: () => null });
    }

    export function getDocs(q) {
        const col = q._col || (q.collection && q.collection._col) || '';
        if (col === 'camas') {
            const docs = window.__mockCamas.map(c => ({ id: c.id, data: () => c }));
            return Promise.resolve({ docs, forEach(cb) { docs.forEach(cb); }, empty: docs.length === 0 });
        }
        return Promise.resolve({ docs: [], forEach() {}, empty: true });
    }

    export function setDoc(docRef, data) { return Promise.resolve(); }
    export function addDoc(colRef, data) { return Promise.resolve({ id: 'new_id' }); }
    export function updateDoc(docRef, data) { return Promise.resolve(); }
    export function deleteDoc(docRef) { return Promise.resolve(); }
    export function serverTimestamp() { return new Date().toISOString(); }
    export function writeBatch() { 
        return { 
            set: () => {},
            commit: () => Promise.resolve()
        }; 
    }
    export function signInWithEmailAndPassword() { return Promise.resolve({ user: { uid: 'admin_uid' } }); }
    export function createUserWithEmailAndPassword() { return Promise.resolve({ user: { uid: 'new_uid' } }); }
    export function signOut() { return Promise.resolve(); }
    export function onAuthStateChanged(auth, cb) { return () => {}; }
    export function sendPasswordResetEmail() { return Promise.resolve(); }
    export function signInAnonymously() { return Promise.resolve({ user: { uid: 'anon' } }); }
    export function onSnapshot() { return () => {}; }
    export function arrayUnion(...items) { return items; }
    export function initializeAppCheck() { return null; }
    export class ReCaptchaV3Provider {}
`;

const PORT = 8098;

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

        await page.setViewport({ width: 1366, height: 850, deviceScaleFactor: 1 });
        await page.goto(`http://localhost:${PORT}/panel.html`, { waitUntil: 'load' });
        await new Promise(r => setTimeout(r, 1200));

        // Inyectar CSS base para Tailwind offline
        await page.addStyleTag({
            content: `
                #view-internacion, #view-admin {
                    padding: 1.5rem !important;
                    background: #ffffff !important;
                    border-radius: 1rem !important;
                    margin: 1rem auto !important;
                    max-width: 1200px !important;
                    border: 1px solid #e2e8f0 !important;
                }
                #internacion-mapa-grid {
                    display: grid !important;
                    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)) !important;
                    gap: 1.25rem !important;
                    margin-top: 1rem !important;
                }
                .modal { display: none !important; }
                .modal.active {
                    display: flex !important;
                    background: rgba(15, 23, 42, 0.6) !important;
                }
            `
        });

        // =========================================================================
        // PRUEBA 1: SESIÓN DE ENFERMERÍA (Inspección estricta de DOM en view-internacion)
        // =========================================================================
        console.log("-> 1. Probando vista de Internación con rol Enfermería...");
        await page.evaluate(async () => {
            sessionStorage.setItem('hospital_sesion_activa', 'true');
            window.establecerSesionActual({
                uid: 'enf_1',
                rol: 'Enfermería',
                nombre: 'Lic. Matías Valenzuela',
                correo: 'enfermeria@schestakow.ar',
                permisosAdicionales: ['internacion']
            });
            window.switchView('internacion');
            await window.cargarCamasHospital();
        });
        await new Promise(r => setTimeout(r, 800));

        const verificacionEnfermeria = await page.evaluate(() => {
            const viewInternacion = document.getElementById('view-internacion');
            const botonEnInternacion = viewInternacion.querySelector('#btn-admin-config-camas');
            const modalEnInternacion = viewInternacion.querySelector('#modal-config-cama');
            const camasEnGrid = document.getElementById('internacion-mapa-grid')?.children?.length || 0;

            return {
                viewInternacionExiste: !!viewInternacion,
                botonEnInternacionExiste: !!botonEnInternacion,
                modalEnInternacionExiste: !!modalEnInternacion,
                camasOperativasRenderizadas: camasEnGrid > 0
            };
        });

        console.log("   Resultados Inspección DOM Enfermería:", JSON.stringify(verificacionEnfermeria));
        if (verificacionEnfermeria.botonEnInternacionExiste) {
            throw new Error("VIOLACIÓN: El botón #btn-admin-config-camas sigue existiendo dentro del DOM de view-internacion.");
        }
        if (verificacionEnfermeria.modalEnInternacionExiste) {
            throw new Error("VIOLACIÓN: El modal #modal-config-cama sigue existiendo dentro del DOM de view-internacion.");
        }
        if (!verificacionEnfermeria.camasOperativasRenderizadas) {
            throw new Error("ERROR: El mapa de camas operativo no se renderizó para Enfermería.");
        }

        const screenshotEnfermeria = path.join(artifactDir, 'internacion-dom-enfermeria.png');
        await page.screenshot({ path: screenshotEnfermeria });
        console.log(`[Evidencia] Captura Enfermería guardada en: ${screenshotEnfermeria}`);

        // =========================================================================
        // PRUEBA 2: SESIÓN DE RECEPCIÓN (Inspección estricta de DOM en view-internacion)
        // =========================================================================
        console.log("-> 2. Probando vista de Internación con rol Recepción...");
        await page.evaluate(async () => {
            window.establecerSesionActual({
                uid: 'rec_1',
                rol: 'Recepción',
                nombre: 'Ana Morales',
                correo: 'recepcion@schestakow.ar',
                permisosAdicionales: ['internacion']
            });
            window.switchView('internacion');
            await window.cargarCamasHospital();
        });
        await new Promise(r => setTimeout(r, 600));

        const verificacionRecepcion = await page.evaluate(() => {
            const viewInternacion = document.getElementById('view-internacion');
            const botonEnInternacion = viewInternacion.querySelector('#btn-admin-config-camas');
            const modalEnInternacion = viewInternacion.querySelector('#modal-config-cama');

            return {
                botonEnInternacionExiste: !!botonEnInternacion,
                modalEnInternacionExiste: !!modalEnInternacion
            };
        });

        console.log("   Resultados Inspección DOM Recepción:", JSON.stringify(verificacionRecepcion));
        if (verificacionRecepcion.botonEnInternacionExiste || verificacionRecepcion.modalEnInternacionExiste) {
            throw new Error("VIOLACIÓN: Se detectaron elementos de configuración de camas en view-internacion para Recepción.");
        }

        const screenshotRecepcion = path.join(artifactDir, 'internacion-dom-recepcion.png');
        await page.screenshot({ path: screenshotRecepcion });
        console.log(`[Evidencia] Captura Recepción guardada en: ${screenshotRecepcion}`);

        // =========================================================================
        // PRUEBA 3: SESIÓN DE ADMINISTRACIÓN (Verificación en view-admin)
        // =========================================================================
        console.log("-> 3. Probando vista de Administración con rol Administración...");
        await page.evaluate(async () => {
            window.establecerSesionActual({
                uid: 'admin_uid',
                rol: 'Administración',
                nombre: 'Administrador General',
                correo: 'admin@hospital.test'
            });
            window.switchView('admin');
        });
        await new Promise(r => setTimeout(r, 600));

        const verificacionAdmin = await page.evaluate(() => {
            const viewAdmin = document.getElementById('view-admin');
            const botonEnAdmin = viewAdmin.querySelector('#btn-admin-config-camas');
            const modalEnAdmin = viewAdmin.querySelector('#modal-config-cama');

            return {
                viewAdminExiste: !!viewAdmin,
                botonEnAdminExiste: !!botonEnAdmin,
                modalEnAdminExiste: !!modalEnAdmin
            };
        });

        console.log("   Resultados Inspección DOM Administración:", JSON.stringify(verificacionAdmin));
        if (!verificacionAdmin.botonEnAdminExiste) {
            throw new Error("ERROR: El botón #btn-admin-config-camas NO se encuentra dentro de view-admin.");
        }
        if (!verificacionAdmin.modalEnAdminExiste) {
            throw new Error("ERROR: El modal #modal-config-cama NO se encuentra dentro de view-admin.");
        }

        const screenshotAdminCard = path.join(artifactDir, 'admin-card-estructura-camas.png');
        await page.screenshot({ path: screenshotAdminCard });
        console.log(`[Evidencia] Captura Card Admin guardada en: ${screenshotAdminCard}`);

        // =========================================================================
        // PRUEBA 4: ABRIR MODAL Y VERIFICAR ASISTENTE MASIVO DESDE ADMINISTRACIÓN
        // =========================================================================
        console.log("-> 4. Abriendo modal de configuración de camas desde el nuevo botón en Administración...");
        await page.evaluate(async () => {
            await window.abrirModalConfigCamasAdmin();
            window.cambiarTabConfigCamas('masiva');
        });
        await new Promise(r => setTimeout(r, 600));

        // Comprobar que el modal está visible y el asistente calcula duplicados
        const estadoModal = await page.evaluate(() => {
            const modal = document.getElementById('modal-config-cama');
            const esVisible = modal && modal.classList.contains('active');
            const previewEl = document.getElementById('bulk-cama-preview');

            return {
                esVisible,
                previewTexto: previewEl ? previewEl.innerText : ''
            };
        });

        console.log("   Modal abierto correctamente:", estadoModal.esVisible);
        console.log("   Preview del asistente en Admin:", estadoModal.previewTexto.trim().split('\n')[0]);
        if (!estadoModal.esVisible) {
            throw new Error("ERROR: El modal no se visualiza al hacer clic desde Administración.");
        }

        const screenshotModalAdmin = path.join(artifactDir, 'admin-modal-config-cama-abierto.png');
        await page.screenshot({ path: screenshotModalAdmin });
        console.log(`[Evidencia] Captura Modal Admin guardada en: ${screenshotModalAdmin}`);

        console.log("\n===================================================================");
        console.log("✅ TODAS LAS PRUEBAS DE SEGURIDAD Y SEPARACIÓN DE DOM EXITOSAS");
        console.log("===================================================================");

    } catch (err) {
        console.error("❌ Error en prueba:", err);
        process.exitCode = 1;
    } finally {
        if (browser) await browser.close();
        server.close();
        process.exit(process.exitCode || 0);
    }
});
