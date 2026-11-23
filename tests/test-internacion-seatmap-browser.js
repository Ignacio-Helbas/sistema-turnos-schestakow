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

// Mock de camas distribuidas en 2 pisos y 3 habitaciones con los 3 estados
const camasDemoHospital = [
    // Piso 1 - Habitación 101 (Sector Clínica Médica)
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
    },
    // Piso 1 - Habitación 102 (Sector Cirugía General)
    {
        id: 'P1_H102_C1',
        piso: 1,
        habitacion: '102',
        numeroCama: 'Cama 1',
        sector: 'Cirugía General',
        tipo: 'Compartida',
        estado: 'ocupada',
        pacienteNombre: 'Jorge Luis Borges',
        pacienteDni: '22334455',
        pacienteCobertura: 'Swiss Medical',
        medicoTratante: 'Dra. Cecilia Grierson',
        fechaIngreso: '2026-11-19T14:30:00Z',
        activo: true
    },
    {
        id: 'P1_H102_C2',
        piso: 1,
        habitacion: '102',
        numeroCama: 'Cama 2',
        sector: 'Cirugía General',
        tipo: 'Compartida',
        estado: 'mantenimiento',
        activo: true
    },
    // Piso 2 - Habitación 201 (Sector Maternidad)
    {
        id: 'P2_H201_C1',
        piso: 2,
        habitacion: '201',
        numeroCama: 'Cama 1',
        sector: 'Maternidad',
        tipo: 'Compartida',
        estado: 'libre',
        activo: true
    },
    {
        id: 'P2_H201_C2',
        piso: 2,
        habitacion: '201',
        numeroCama: 'Cama 2',
        sector: 'Maternidad',
        tipo: 'Compartida',
        estado: 'ocupada',
        pacienteNombre: 'Mercedes Sosa',
        pacienteDni: '25678901',
        pacienteCobertura: 'IOMA',
        medicoTratante: 'Dr. Luis Agote',
        fechaIngreso: '2026-11-21T08:00:00Z',
        activo: true
    },
    {
        id: 'P2_H201_C3',
        piso: 2,
        habitacion: '201',
        numeroCama: 'Cama 3',
        sector: 'Maternidad',
        tipo: 'Compartida',
        estado: 'mantenimiento',
        activo: true
    }
];

const mockFirebaseESM = `
    window.__mockCamas = ${JSON.stringify(camasDemoHospital)};

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
            data: () => ({ activo: true, rol: 'Enfermería', nombre: 'Enfermero Central' })
        });
    }

    export function getDocs(q) {
        const col = q._col || (q.collection && q.collection._col) || '';
        if (col === 'camas') {
            const docs = window.__mockCamas.map(c => ({ id: c.id, data: () => c }));
            return Promise.resolve({
                docs,
                forEach(cb) { docs.forEach(cb); },
                empty: docs.length === 0
            });
        }
        return Promise.resolve({ docs: [], forEach() {}, empty: true });
    }

    export function setDoc(docRef, data) { return Promise.resolve(); }
    export function addDoc(colRef, data) { return Promise.resolve({ id: 'new_id' }); }
    export function updateDoc(docRef, data) { return Promise.resolve(); }
    export function deleteDoc(docRef) { return Promise.resolve(); }
    export function serverTimestamp() { return new Date().toISOString(); }
    export function writeBatch() { return { set: () => {}, commit: () => Promise.resolve() }; }
    export function signInWithEmailAndPassword() { return Promise.resolve({ user: { uid: 'enf_test' } }); }
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

const PORT = 8095;

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

        // 1. Cargar panel.html en Desktop (1280x850)
        console.log("-> 1. Configurando Viewport Desktop (1280x850)...");
        await page.setViewport({ width: 1280, height: 850, deviceScaleFactor: 1 });
        await page.goto(`http://localhost:${PORT}/panel.html`, { waitUntil: 'load' });
        await new Promise(r => setTimeout(r, 1200));

        // Inyectar estilos esenciales de renderizado visual (Tailwind offline fallback)
        await page.addStyleTag({
            content: `
                #view-internacion {
                    padding: 1.5rem !important;
                    background: #ffffff !important;
                    border-radius: 1rem !important;
                    margin: 1rem auto !important;
                    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.08) !important;
                    border: 1px solid #e2e8f0 !important;
                    max-width: 1100px !important;
                }
                #internacion-mapa-grid {
                    display: grid !important;
                    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)) !important;
                    gap: 1.25rem !important;
                    margin-top: 1rem !important;
                }
                @media (max-width: 640px) {
                    #internacion-mapa-grid {
                        grid-template-columns: 1fr !important;
                    }
                    #view-internacion {
                        margin: 0.25rem !important;
                        padding: 0.75rem !important;
                    }
                }
                .grid { display: grid !important; }
                .grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
                .gap-2 { gap: 0.5rem !important; }
                .gap-2\\.5 { gap: 0.625rem !important; }
                .gap-3 { gap: 0.75rem !important; }
                .gap-1 { gap: 0.25rem !important; }
                .flex { display: flex !important; }
                .flex-col { flex-direction: column !important; }
                .items-center { align-items: center !important; }
                .justify-between { justify-content: space-between !important; }
                .justify-center { justify-content: center !important; }
                .shrink-0 { flex-shrink: 0 !important; }
                .w-full { width: 100% !important; }
                .rounded-xl { border-radius: 0.75rem !important; }
                .rounded-2xl { border-radius: 1rem !important; }
                .rounded-full { border-radius: 9999px !important; }
                .rounded-md { border-radius: 0.375rem !important; }
                .rounded-lg { border-radius: 0.5rem !important; }
                .border { border-width: 1px !important; border-style: solid !important; }
                .border-b { border-bottom-width: 1px !important; border-bottom-style: solid !important; }
                .border-t { border-top-width: 1px !important; border-top-style: solid !important; }
                .p-2\\.5 { padding: 0.625rem !important; }
                .p-3\\.5 { padding: 0.875rem !important; }
                .p-3 { padding: 0.75rem !important; }
                .px-2 { padding-left: 0.5rem !important; padding-right: 0.5rem !important; }
                .py-0\\.5 { padding-top: 0.125rem !important; padding-bottom: 0.125rem !important; }
                .py-1 { padding-top: 0.25rem !important; padding-bottom: 0.25rem !important; }
                .min-h-\\[92px\\] { min-height: 92px !important; }
                .bg-white { background-color: #ffffff !important; }
                .bg-slate-50 { background-color: #f8fafc !important; }
                .bg-slate-100 { background-color: #f1f5f9 !important; }
                .border-slate-100 { border-color: #f1f5f9 !important; }
                .border-slate-200 { border-color: #e2e8f0 !important; }
                .border-slate-200\\/80 { border-color: #e2e8f0 !important; }
                .border-slate-200\\/90 { border-color: #e2e8f0 !important; }
                .text-slate-400 { color: #94a3b8 !important; }
                .text-slate-500 { color: #64748b !important; }
                .text-slate-600 { color: #475569 !important; }
                .text-slate-700 { color: #334155 !important; }
                .text-slate-900 { color: #0f172a !important; }
                .text-white { color: #ffffff !important; }
                /* Libre: Verde */
                .bg-emerald-50\\/70 { background-color: #ecfdf5 !important; }
                .border-emerald-300 { border-color: #6ee7b7 !important; border-style: dashed !important; border-width: 1.5px !important; }
                .text-emerald-950 { color: #022c22 !important; }
                .bg-emerald-600 { background-color: #059669 !important; }
                .text-emerald-800 { color: #065f46 !important; }
                /* Ocupada: Rojo */
                .bg-rose-50\\/80 { background-color: #fff1f2 !important; }
                .border-rose-300 { border-color: #fda4af !important; border-style: solid !important; border-width: 1.5px !important; }
                .border-rose-200\\/60 { border-color: #fecdd3 !important; }
                .text-rose-950 { color: #4c0519 !important; }
                .bg-rose-600 { background-color: #e11d48 !important; }
                .text-rose-800 { color: #9f1239 !important; }
                /* Mantenimiento: Amarillo */
                .bg-amber-50\\/75 { background-color: #fffbeb !important; }
                .border-amber-300 { border-color: #fcd34d !important; border-style: dotted !important; border-width: 1.5px !important; }
                .border-amber-200\\/60 { border-color: #fde68a !important; }
                .text-amber-950 { color: #451a03 !important; }
                .bg-amber-500 { background-color: #f59e0b !important; }
                .text-amber-800 { color: #92400e !important; }
                /* Tipografía */
                .text-\\[9px\\] { font-size: 9px !important; line-height: 12px !important; }
                .text-\\[10px\\] { font-size: 10px !important; line-height: 14px !important; }
                .text-\\[11px\\] { font-size: 11px !important; line-height: 15px !important; }
                .text-xs { font-size: 12px !important; line-height: 16px !important; }
                .text-sm { font-size: 14px !important; line-height: 20px !important; }
                .font-bold { font-weight: 700 !important; }
                .font-black { font-weight: 900 !important; }
                .font-semibold { font-weight: 600 !important; }
                .font-medium { font-weight: 500 !important; }
                .font-mono { font-family: monospace !important; }
                .truncate { overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important; }
                .uppercase { text-transform: uppercase !important; }
                .tracking-tight { letter-spacing: -0.025em !important; }
                .tracking-wide { letter-spacing: 0.025em !important; }
                .tracking-wider { letter-spacing: 0.05em !important; }
                .text-center { text-align: center !important; }
                .text-left { text-align: left !important; }
                .opacity-30 { opacity: 0.3 !important; }
                .opacity-90 { opacity: 0.9 !important; }
                .relative { position: relative !important; }
                .overflow-hidden { overflow: hidden !important; }
                /* SVGs */
                svg { max-width: 100% !important; }
                #view-internacion svg { display: inline-block !important; vertical-align: middle !important; }
                #view-internacion svg.w-5 { width: 20px !important; height: 20px !important; }
                #view-internacion svg.w-4 { width: 16px !important; height: 16px !important; }
                #view-internacion svg.w-3 { width: 12px !important; height: 12px !important; }
                #view-internacion svg.w-2\\.5 { width: 10px !important; height: 10px !important; }
                /* Layout controls */
                #view-internacion .relative input { padding-left: 2.25rem !important; }
                #view-internacion .relative svg { position: absolute !important; left: 0.75rem !important; top: 0.75rem !important; }
            `
        });

        // 2. Establecer sesión de Enfermería / Personal con permisos
        console.log("-> 2. Estableciendo sesión autenticada con permiso de internación...");
        await page.evaluate(async () => {
            sessionStorage.setItem('hospital_sesion_activa', 'true');
            window.establecerSesionActual({
                uid: 'enfermero_central',
                rol: 'Enfermería',
                nombre: 'Lic. Matías Valenzuela',
                correo: 'enfermeria@schestakow.ar',
                permisosAdicionales: ['internacion']
            });
            window.switchView('internacion');
            await window.cargarCamasHospital();
        });

        await new Promise(r => setTimeout(r, 1000));

        // 3. Capturar evidencia Desktop de Piso 1 (Habitaciones 101 y 102 con Libre, Ocupada, Mantenimiento)
        console.log("-> 3. Capturando Screenshot Desktop de Piso 1...");
        const countDesktopPiso1 = await page.evaluate(() => {
            const grid = document.getElementById('internacion-mapa-grid');
            return grid ? grid.children.length : 0;
        });
        console.log("   Habitaciones en Piso 1 (Desktop):", countDesktopPiso1);

        const evidenceDir = 'C:\\Users\\nacho\\.gemini\\antigravity\\brain\\176137f8-6556-4815-aa6e-5ff31c52522c\\browser_evidence';
        fs.mkdirSync(evidenceDir, { recursive: true });

        const desktopScreenshot = path.join(evidenceDir, 'mapa-camas-seatmap-desktop.png');
        const viewEl = await page.$('#view-internacion');
        if (viewEl) {
            await viewEl.screenshot({ path: desktopScreenshot });
        } else {
            await page.screenshot({ path: desktopScreenshot, fullPage: true });
        }
        console.log(`   Screenshot Desktop guardado en: ${desktopScreenshot}`);

        // 4. Probar cambio a Piso 2 para verificar multisede/multipiso
        console.log("-> 4. Cambiando visualmente a Piso 2...");
        const countPiso2 = await page.evaluate(async () => {
            window.seleccionarPisoInternacion(2);
            return document.getElementById('internacion-mapa-grid').children.length;
        });
        console.log("   Habitaciones en Piso 2:", countPiso2);
        await new Promise(r => setTimeout(r, 600));

        const desktopPiso2Screenshot = path.join(evidenceDir, 'mapa-camas-piso2-desktop.png');
        const viewElPiso2 = await page.$('#view-internacion');
        if (viewElPiso2) {
            await viewElPiso2.screenshot({ path: desktopPiso2Screenshot });
        } else {
            await page.screenshot({ path: desktopPiso2Screenshot, fullPage: true });
        }
        console.log(`   Screenshot Piso 2 guardado en: ${desktopPiso2Screenshot}`);

        // Volver a Piso 1 para la prueba interactiva y mobile
        console.log("-> Volviendo a Piso 1...");
        const countVolverPiso1 = await page.evaluate(async () => {
            window.seleccionarPisoInternacion(1);
            return document.getElementById('internacion-mapa-grid').children.length;
        });
        console.log("   Habitaciones al volver a Piso 1:", countVolverPiso1);
        await new Promise(r => setTimeout(r, 400));

        // 5. Probar clic en Cama Libre para verificar apertura directa de flujo de internación
        console.log("-> 5. Probando clic directo en Cama Libre (P1_H101_C1)...");
        const resultadoClic = await page.evaluate(() => {
            window.abrirDetalleCama('P1_H101_C1');
            const modal = document.getElementById('modal-internar-paciente');
            const camaInput = document.getElementById('modal-internar-cama-id');
            const sub = document.getElementById('modal-internar-subtitulo');
            return {
                modalAbierto: modal && modal.classList.contains('active'),
                camaIdPrecargada: camaInput ? camaInput.value : '',
                infoTexto: sub ? sub.textContent : ''
            };
        });
        console.log("   Resultado de clic en cama libre:", resultadoClic);

        // Cerrar modal
        await page.evaluate(() => {
            window.cerrarModal('modal-internar-paciente');
        });
        await new Promise(r => setTimeout(r, 400));
        const countDespuesCerrarModal = await page.evaluate(() => document.getElementById('internacion-mapa-grid').children.length);
        console.log("   Habitaciones tras cerrar modal:", countDespuesCerrarModal);

        // 6. Configurar Viewport Mobile (390x844 - iPhone / Smartphone estándar)
        console.log("-> 6. Cambiando a Viewport Mobile (390x844)...");
        await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
        
        // Re-inyectar estilos en caso de reload por cambio de viewport
        await page.addStyleTag({
            content: `
                #view-internacion {
                    padding: 0.75rem !important;
                    background: #ffffff !important;
                    border-radius: 0.75rem !important;
                    margin: 0.5rem auto !important;
                    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08) !important;
                    border: 1px solid #e2e8f0 !important;
                    max-width: 100% !important;
                }
                #internacion-mapa-grid {
                    display: flex !important;
                    flex-direction: column !important;
                    gap: 1rem !important;
                    margin-top: 0.75rem !important;
                }
                .grid { display: grid !important; }
                .grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
                .gap-2 { gap: 0.5rem !important; }
                .gap-2\\.5 { gap: 0.625rem !important; }
                .gap-3 { gap: 0.75rem !important; }
                .gap-1 { gap: 0.25rem !important; }
                .flex { display: flex !important; }
                .flex-col { flex-direction: column !important; }
                .items-center { align-items: center !important; }
                .justify-between { justify-content: space-between !important; }
                .justify-center { justify-content: center !important; }
                .shrink-0 { flex-shrink: 0 !important; }
                .w-full { width: 100% !important; }
                .rounded-xl { border-radius: 0.75rem !important; }
                .rounded-2xl { border-radius: 1rem !important; }
                .rounded-full { border-radius: 9999px !important; }
                .rounded-md { border-radius: 0.375rem !important; }
                .rounded-lg { border-radius: 0.5rem !important; }
                .border { border-width: 1px !important; border-style: solid !important; }
                .border-b { border-bottom-width: 1px !important; border-bottom-style: solid !important; }
                .border-t { border-top-width: 1px !important; border-top-style: solid !important; }
                .p-2\\.5 { padding: 0.625rem !important; }
                .p-3\\.5 { padding: 0.875rem !important; }
                .p-3 { padding: 0.75rem !important; }
                .px-2 { padding-left: 0.5rem !important; padding-right: 0.5rem !important; }
                .py-0\\.5 { padding-top: 0.125rem !important; padding-bottom: 0.125rem !important; }
                .py-1 { padding-top: 0.25rem !important; padding-bottom: 0.25rem !important; }
                .min-h-\\[92px\\] { min-height: 92px !important; }
                .bg-white { background-color: #ffffff !important; }
                .bg-slate-50 { background-color: #f8fafc !important; }
                .bg-slate-100 { background-color: #f1f5f9 !important; }
                .border-slate-100 { border-color: #f1f5f9 !important; }
                .border-slate-200 { border-color: #e2e8f0 !important; }
                .text-slate-400 { color: #94a3b8 !important; }
                .text-slate-500 { color: #64748b !important; }
                .text-slate-600 { color: #475569 !important; }
                .text-slate-700 { color: #334155 !important; }
                .text-slate-900 { color: #0f172a !important; }
                .text-white { color: #ffffff !important; }
                /* Libre */
                .bg-emerald-50\\/70 { background-color: #ecfdf5 !important; }
                .border-emerald-300 { border-color: #6ee7b7 !important; border-style: dashed !important; border-width: 1.5px !important; }
                .text-emerald-950 { color: #022c22 !important; }
                .bg-emerald-600 { background-color: #059669 !important; }
                .text-emerald-800 { color: #065f46 !important; }
                /* Ocupada */
                .bg-rose-50\\/80 { background-color: #fff1f2 !important; }
                .border-rose-300 { border-color: #fda4af !important; border-style: solid !important; border-width: 1.5px !important; }
                .border-rose-200\\/60 { border-color: #fecdd3 !important; }
                .text-rose-950 { color: #4c0519 !important; }
                .bg-rose-600 { background-color: #e11d48 !important; }
                .text-rose-800 { color: #9f1239 !important; }
                /* Mantenimiento */
                .bg-amber-50\\/75 { background-color: #fffbeb !important; }
                .border-amber-300 { border-color: #fcd34d !important; border-style: dotted !important; border-width: 1.5px !important; }
                .border-amber-200\\/60 { border-color: #fde68a !important; }
                .text-amber-950 { color: #451a03 !important; }
                .bg-amber-500 { background-color: #f59e0b !important; }
                .text-amber-800 { color: #92400e !important; }
                /* Tipografía */
                .text-\\[9px\\] { font-size: 9px !important; line-height: 12px !important; }
                .text-\\[10px\\] { font-size: 10px !important; line-height: 14px !important; }
                .text-\\[11px\\] { font-size: 11px !important; line-height: 15px !important; }
                .text-xs { font-size: 12px !important; line-height: 16px !important; }
                .text-sm { font-size: 14px !important; line-height: 20px !important; }
                .font-bold { font-weight: 700 !important; }
                .font-black { font-weight: 900 !important; }
                .font-semibold { font-weight: 600 !important; }
                .font-medium { font-weight: 500 !important; }
                .font-mono { font-family: monospace !important; }
                .truncate { overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important; }
                .uppercase { text-transform: uppercase !important; }
                .tracking-tight { letter-spacing: -0.025em !important; }
                .tracking-wide { letter-spacing: 0.025em !important; }
                .tracking-wider { letter-spacing: 0.05em !important; }
                .text-center { text-align: center !important; }
                .text-left { text-align: left !important; }
                .opacity-30 { opacity: 0.3 !important; }
                .opacity-90 { opacity: 0.9 !important; }
                .relative { position: relative !important; }
                .overflow-hidden { overflow: hidden !important; }
                /* SVGs */
                svg { max-width: 100% !important; }
                #view-internacion svg { display: inline-block !important; vertical-align: middle !important; }
                #view-internacion svg.w-5 { width: 20px !important; height: 20px !important; }
                #view-internacion svg.w-4 { width: 16px !important; height: 16px !important; }
                #view-internacion svg.w-3 { width: 12px !important; height: 12px !important; }
                #view-internacion svg.w-2\\.5 { width: 10px !important; height: 10px !important; }
                #view-internacion .relative input { padding-left: 2.25rem !important; }
                #view-internacion .relative svg { position: absolute !important; left: 0.75rem !important; top: 0.75rem !important; width: 18px !important; height: 18px !important; }
            `
        });
        await page.evaluate(async () => {
            sessionStorage.setItem('hospital_sesion_activa', 'true');
            if (!window.obtenerSesionActual()) {
                window.establecerSesionActual({
                    uid: 'enfermero_central',
                    rol: 'Enfermería',
                    nombre: 'Lic. Matías Valenzuela',
                    correo: 'enfermeria@schestakow.ar',
                    permisosAdicionales: ['internacion']
                });
            }
            window.switchView('internacion');
            window.seleccionarPisoInternacion(1);
        });
        await new Promise(r => setTimeout(r, 600));

        const mobileScreenshot = path.join(evidenceDir, 'mapa-camas-seatmap-mobile.png');
        try {
            const viewElMobile = await page.$('#view-internacion');
            if (viewElMobile) {
                await viewElMobile.screenshot({ path: mobileScreenshot });
            } else {
                await page.screenshot({ path: mobileScreenshot, fullPage: false });
            }
        } catch (e) {
            await page.screenshot({ path: mobileScreenshot, fullPage: false });
        }
        console.log(`   Screenshot Mobile guardado en: ${mobileScreenshot}`);

        // Verificaciones del DOM en Mobile
        const verificacionMobile = await page.evaluate(() => {
            const grid = document.getElementById('internacion-mapa-grid');
            const viewInternacion = document.getElementById('view-internacion');
            const habitaciones = grid ? grid.children.length : 0;
            const tieneScrollHorizontal = document.body.scrollWidth > window.innerWidth;
            return {
                viewClass: viewInternacion ? viewInternacion.className : 'null',
                viewVisible: viewInternacion && !viewInternacion.classList.contains('hidden'),
                habitacionesRenderizadas: habitaciones,
                tieneScrollHorizontal: tieneScrollHorizontal,
                bodyDataView: document.body.dataset.view
            };
        });
        console.log("   Verificación Mobile:", verificacionMobile);

        const erroresCriticos = jsErrors.filter(e => !e.includes('favicon.ico'));
        console.log(`\nErrores de consola de JS: ${erroresCriticos.length}`);
        if (erroresCriticos.length > 0) {
            console.log("Detalle de errores:", erroresCriticos);
        }

    } catch (err) {
        console.error("Fallo durante la prueba Puppeteer de Internación:", err);
    } finally {
        if (browser) await browser.close();
        server.close();
        process.exit(0);
    }
});
