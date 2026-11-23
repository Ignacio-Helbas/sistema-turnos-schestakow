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
const artifactDir = 'C:\\Users\\nacho\\.gemini\\antigravity\\brain\\176137f8-6556-4815-aa6e-5ff31c52522c\\browser_evidence';
if (!fs.existsSync(artifactDir)) {
    fs.mkdirSync(artifactDir, { recursive: true });
}

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
    window.__mockCamas = [];
    window.__mockUsuarios = {
        'admin_uid': {
            activo: true,
            rol: 'Administración',
            nombre: 'Administrador General',
            email: 'admin@hospital.test'
        }
    };

    export function initializeApp() { return {}; }
    export function deleteApp() { return Promise.resolve(); }
    export function getAuth() { 
        return { 
            currentUser: { uid: 'admin_uid', email: 'admin@hospital.test' } 
        }; 
    }
    export function getFirestore() { return {}; }
    export function getFunctions() { return {}; }
    export function httpsCallable() { return () => Promise.resolve({ data: {} }); }
    export function collection(db, nombre) { return { _col: nombre }; }
    export function doc(db, col, id) { 
        return { 
            _col: col, 
            id: id || 'doc_' + Math.random().toString(36).substring(2, 7) 
        }; 
    }
    export function query(colRef, ...conditions) { return { _col: colRef._col, conditions }; }
    export function where(campo, op, valor) { return { campo, op, valor }; }
    export function orderBy(campo, dir) { return { campo, dir }; }
    export function limit() { return {}; }
    export function startAfter() { return {}; }
    
    export function getDoc(docRef) {
        if (docRef._col === 'usuarios') {
            const u = window.__mockUsuarios[docRef.id];
            return Promise.resolve({
                exists: () => !!u,
                data: () => u || null
            });
        }
        if (docRef._col === 'camas') {
            const c = window.__mockCamas.find(x => x.id === docRef.id);
            return Promise.resolve({
                exists: () => !!c,
                data: () => c || null
            });
        }
        return Promise.resolve({ exists: () => false, data: () => null });
    }

    export function getDocs(q) {
        const col = q._col || (q.collection && q.collection._col) || '';
        if (col === 'camas') {
            const docs = window.__mockCamas.map(c => ({ 
                id: c.id, 
                data: () => c 
            }));
            return Promise.resolve({
                docs,
                forEach(cb) { docs.forEach(cb); },
                empty: docs.length === 0
            });
        }
        return Promise.resolve({ docs: [], forEach() {}, empty: true });
    }

    export function setDoc(docRef, data) {
        if (docRef._col === 'camas') {
            const idx = window.__mockCamas.findIndex(x => x.id === docRef.id);
            const camaData = { id: docRef.id, ...data };
            if (idx >= 0) window.__mockCamas[idx] = camaData;
            else window.__mockCamas.push(camaData);
        }
        return Promise.resolve();
    }
    export function addDoc(colRef, data) { return Promise.resolve({ id: 'new_id' }); }
    export function updateDoc(docRef, data) { 
        if (docRef._col === 'camas') {
            const item = window.__mockCamas.find(x => x.id === docRef.id);
            if (item) Object.assign(item, data);
        }
        return Promise.resolve(); 
    }
    export function deleteDoc(docRef) { return Promise.resolve(); }
    export function serverTimestamp() { return new Date().toISOString(); }
    export function writeBatch() { 
        const pendingOps = [];
        return { 
            set: (ref, data) => { pendingOps.push({ ref, data }); },
            commit: () => {
                pendingOps.forEach(op => {
                    if (op.ref._col === 'camas') {
                        const idx = window.__mockCamas.findIndex(x => x.id === op.ref.id);
                        const itemData = { id: op.ref.id, ...op.data };
                        if (idx >= 0) window.__mockCamas[idx] = itemData;
                        else window.__mockCamas.push(itemData);
                    }
                });
                return Promise.resolve();
            }
        }; 
    }
    export function signInWithEmailAndPassword() { return Promise.resolve({ user: { uid: 'admin_uid' } }); }
    export function createUserWithEmailAndPassword() { return Promise.resolve({ user: { uid: 'new_uid' } }); }
    export function signOut() { return Promise.resolve(); }
    export function onAuthStateChanged(auth, cb) { 
        setTimeout(() => cb({ uid: 'admin_uid', email: 'admin@hospital.test' }), 10);
        return () => {}; 
    }
    export function sendPasswordResetEmail() { return Promise.resolve(); }
    export function signInAnonymously() { return Promise.resolve({ user: { uid: 'anon' } }); }
    export function onSnapshot() { return () => {}; }
    export function arrayUnion(...items) { return items; }
    export function initializeAppCheck() { return null; }
    export class ReCaptchaV3Provider {}
`;

const PORT = 8097;

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

        console.log("-> 1. Configurando Viewport Desktop (1366x850)...");
        await page.setViewport({ width: 1366, height: 850, deviceScaleFactor: 1 });
        await page.goto(`http://localhost:${PORT}/panel.html`, { waitUntil: 'load' });
        await new Promise(r => setTimeout(r, 1200));

        // Estilos visuales esenciales para Tailwind offline
        await page.addStyleTag({
            content: `
                #view-internacion {
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
                .modal.modal-overlay {
                    background: rgba(15, 23, 42, 0.6) !important;
                    display: flex !important;
                }
                .modal.hidden {
                    display: none !important;
                }
                .grid { display: grid !important; }
                .grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
                .gap-2 { gap: 0.5rem !important; }
                .gap-2\\.5 { gap: 0.625rem !important; }
                .gap-3 { gap: 0.75rem !important; }
                .flex { display: flex !important; }
                .flex-col { flex-direction: column !important; }
                .items-center { align-items: center !important; }
                .justify-between { justify-content: space-between !important; }
                .justify-center { justify-content: center !important; }
                .shrink-0 { flex-shrink: 0 !important; }
                .w-full { width: 100% !important; }
                .rounded-xl { border-radius: 0.75rem !important; }
                .rounded-lg { border-radius: 0.5rem !important; }
                .border { border-width: 1px !important; border-style: solid !important; }
                .p-2\\.5 { padding: 0.625rem !important; }
                .p-3\\.5 { padding: 0.875rem !important; }
                .p-3 { padding: 0.75rem !important; }
                .p-4 { padding: 1rem !important; }
                .bg-white { background-color: #ffffff !important; }
                .bg-slate-50 { background-color: #f8fafc !important; }
                .bg-slate-100 { background-color: #f1f5f9 !important; }
                .border-slate-200 { border-color: #e2e8f0 !important; }
                .bg-emerald-50\\/70, .bg-emerald-50 { background-color: #ecfdf5 !important; }
                .border-emerald-300, .border-emerald-200 { border-color: #6ee7b7 !important; border-style: solid !important; }
                .text-emerald-950, .text-emerald-800 { color: #022c22 !important; }
                .bg-emerald-600 { background-color: #059669 !important; }
                .bg-indigo-50\\/40, .bg-indigo-50 { background-color: #eef2ff !important; }
                .border-indigo-200, .border-indigo-100 { border-color: #c7d2fe !important; }
                .text-indigo-950, .text-indigo-800 { color: #1e1b4b !important; }
                .bg-indigo-600 { background-color: #4f46e5 !important; }
                .btn-his-primary {
                    background: #4f46e5 !important;
                    color: #ffffff !important;
                    border-radius: 0.5rem !important;
                    padding: 0.375rem 1rem !important;
                }
            `
        });

        // 2. Establecer sesión SuperAdmin y abrir vista de internación
        console.log("-> 2. Estableciendo sesión SuperAdmin y abriendo módulo de internación...");
        await page.evaluate(async () => {
            sessionStorage.setItem('hospital_sesion_activa', 'true');
            window.establecerSesionActual({
                uid: 'admin_uid',
                email: 'admin@hospital.test',
                rol: 'Administración',
                nombre: 'Administrador General'
            });
            window.switchView('internacion');
            await window.cargarCamasHospital();
        });
        await new Promise(r => setTimeout(r, 800));

        // 3. Abrir Modal de Configuración y pasar al Asistente Masivo
        console.log("-> 3. Abriendo Asistente Masivo de Estructura...");
        await page.evaluate(async () => {
            await window.abrirModalConfigCamasAdmin();
            window.cambiarTabConfigCamas('masiva');
        });
        await new Promise(r => setTimeout(r, 600));

        // 4. Configurar Piso 1: 4 habitaciones, 2 camas por habitación (8 camas), Clínica Médica
        console.log("-> 4. Configurando Piso 1 (4 habitaciones, 2 camas c/u = 8 camas)...");
        await page.evaluate(() => {
            document.getElementById('bulk-cama-piso').value = '1';
            document.getElementById('bulk-cama-habs').value = '4';
            document.getElementById('bulk-cama-por-hab').value = '2';
            document.getElementById('bulk-cama-sector').value = 'Clínica Médica';
            document.getElementById('bulk-cama-tipo').value = 'Compartida';
            window.actualizarPreviewCamasMasivas();
        });
        await new Promise(r => setTimeout(r, 600));

        // Verificar el contenido del preview en vivo
        const previewPiso1Text = await page.evaluate(() => {
            const el = document.getElementById('bulk-cama-preview');
            return el ? el.innerText : '';
        });
        console.log("=== PREVIEW PISO 1 ===");
        console.log(previewPiso1Text);

        const screenshotPiso1Preview = path.join(artifactDir, 'asistente-preview-piso1.png');
        await page.screenshot({ path: screenshotPiso1Preview });
        console.log(`[Evidencia] Captura guardada en: ${screenshotPiso1Preview}`);

        // 5. Confirmar y Generar Piso 1 en Batch
        console.log("-> 5. Ejecutando Carga Masiva en Batch para Piso 1...");
        page.evaluate(() => {
            window.ejecutarCargaMasivaCamasAdmin();
        });
        await new Promise(r => setTimeout(r, 400));
        await page.evaluate(() => {
            const btnConfirm = document.getElementById('btn-confirm-aceptar');
            if (btnConfirm) btnConfirm.click();
        });
        await new Promise(r => setTimeout(r, 1200));

        // Verificar camas generadas en memoria
        const cantCamasPiso1 = await page.evaluate(() => {
            return window.__mockCamas.filter(c => c.piso === 1).length;
        });
        console.log(`-> Camas generadas en Piso 1: ${cantCamasPiso1} (esperadas: 8)`);
        if (cantCamasPiso1 !== 8) {
            throw new Error(`Se esperaban 8 camas en Piso 1, se obtuvieron ${cantCamasPiso1}`);
        }

        // 6. Prueba de Duplicados: Re-ejecutar asistente sobre Piso 1
        console.log("-> 6. Probando detección y omisión de duplicados (Re-ejecución sobre Piso 1)...");
        await page.evaluate(() => {
            window.actualizarPreviewCamasMasivas();
        });
        await new Promise(r => setTimeout(r, 600));

        const previewDuplicados = await page.evaluate(() => {
            const el = document.getElementById('bulk-cama-preview');
            const btn = document.getElementById('btn-ejecutar-bulk-camas');
            return {
                text: el ? el.innerText : '',
                btnDisabled: btn ? btn.disabled : false
            };
        });
        console.log("=== PREVIEW DUPLICADOS DETECTADOS ===");
        console.log(previewDuplicados.text);
        console.log("Botón deshabilitado por duplicados:", previewDuplicados.btnDisabled);

        const screenshotDuplicados = path.join(artifactDir, 'asistente-duplicados-detectados.png');
        await page.screenshot({ path: screenshotDuplicados });
        console.log(`[Evidencia] Captura guardada en: ${screenshotDuplicados}`);

        // Intentar ejecutar la carga masiva duplicada para asegurar que no crea nada
        await page.evaluate(async () => {
            await window.ejecutarCargaMasivaCamasAdmin();
        });
        await new Promise(r => setTimeout(r, 500));
        const cantCamasPiso1Post = await page.evaluate(() => {
            return window.__mockCamas.filter(c => c.piso === 1).length;
        });
        console.log(`-> Camas en Piso 1 tras intento de duplicación: ${cantCamasPiso1Post} (debe ser exactamente 8)`);
        if (cantCamasPiso1Post !== 8) {
            throw new Error(`Fallo en omisión de duplicados: hay ${cantCamasPiso1Post} camas`);
        }

        // 7. Configurar Piso 2: 3 habitaciones, 3 camas por habitación (9 camas), Cirugía General
        console.log("-> 7. Configurando Piso 2 (3 habitaciones, 3 camas c/u = 9 camas)...");
        await page.evaluate(() => {
            document.getElementById('bulk-cama-piso').value = '2';
            document.getElementById('bulk-cama-habs').value = '3';
            document.getElementById('bulk-cama-por-hab').value = '3';
            document.getElementById('bulk-cama-sector').value = 'Cirugía General';
            document.getElementById('bulk-cama-tipo').value = 'Compartida';
            window.actualizarPreviewCamasMasivas();
        });
        await new Promise(r => setTimeout(r, 600));

        const previewPiso2Text = await page.evaluate(() => {
            const el = document.getElementById('bulk-cama-preview');
            return el ? el.innerText : '';
        });
        console.log("=== PREVIEW PISO 2 ===");
        console.log(previewPiso2Text);

        const screenshotPiso2Preview = path.join(artifactDir, 'asistente-preview-piso2.png');
        await page.screenshot({ path: screenshotPiso2Preview });
        console.log(`[Evidencia] Captura guardada en: ${screenshotPiso2Preview}`);

        // Ejecutar Carga Masiva Piso 2
        console.log("-> 8. Ejecutando Carga Masiva en Batch para Piso 2...");
        page.evaluate(() => {
            window.ejecutarCargaMasivaCamasAdmin();
        });
        await new Promise(r => setTimeout(r, 400));
        await page.evaluate(() => {
            const btnConfirm = document.getElementById('btn-confirm-aceptar');
            if (btnConfirm) btnConfirm.click();
        });
        await new Promise(r => setTimeout(r, 1200));

        const totalCamasHospital = await page.evaluate(() => {
            return {
                total: window.__mockCamas.length,
                piso1: window.__mockCamas.filter(c => c.piso === 1).length,
                piso2: window.__mockCamas.filter(c => c.piso === 2).length
            };
        });
        console.log("-> Estado final de camas en hospital:", JSON.stringify(totalCamasHospital));
        if (totalCamasHospital.total !== 17 || totalCamasHospital.piso1 !== 8 || totalCamasHospital.piso2 !== 9) {
            throw new Error(`Discrepancia en camas generadas: ${JSON.stringify(totalCamasHospital)}`);
        }

        // 8. Visualización en el Mapa de Camas
        console.log("-> 9. Cerrando modal y capturando Mapa de Camas Piso 1...");
        await page.evaluate(() => {
            window.cerrarModal('modal-config-cama');
            window.seleccionarPisoInternacion(1);
        });
        await new Promise(r => setTimeout(r, 800));

        const screenshotMapaPiso1 = path.join(artifactDir, 'mapa-camas-piso1-generado.png');
        const viewEl = await page.$('#view-internacion');
        if (viewEl) {
            await viewEl.screenshot({ path: screenshotMapaPiso1 });
        } else {
            await page.screenshot({ path: screenshotMapaPiso1 });
        }
        console.log(`[Evidencia] Captura guardada en: ${screenshotMapaPiso1}`);

        console.log("-> 10. Seleccionando y capturando Mapa de Camas Piso 2...");
        await page.evaluate(() => {
            window.seleccionarPisoInternacion(2);
        });
        await new Promise(r => setTimeout(r, 800));

        const screenshotMapaPiso2 = path.join(artifactDir, 'mapa-camas-piso2-generado.png');
        if (viewEl) {
            await viewEl.screenshot({ path: screenshotMapaPiso2 });
        } else {
            await page.screenshot({ path: screenshotMapaPiso2 });
        }
        console.log(`[Evidencia] Captura guardada en: ${screenshotMapaPiso2}`);

        console.log("\n=======================================================");
        console.log("✅ TODAS LAS PRUEBAS DE CARGA MASIVA Y PREVIEW EXITOSAS");
        console.log("=======================================================");

        if (jsErrors.length > 0) {
            console.warn("Advertencias JS detectadas:", jsErrors);
        }

    } catch (err) {
        console.error("❌ Error en prueba de navegador:", err);
        process.exitCode = 1;
    } finally {
        if (browser) await browser.close();
        server.close();
        process.exit(process.exitCode || 0);
    }
});
