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
const PORT = 8096;

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

// Mock Firebase ESM donde la cuenta de Auth existe pero NO tiene documento en /usuarios/{uid}
const mockFirebaseESM = `
    let authUser = null;
    let authListener = null;

    export function initializeApp() { return {}; }
    export function deleteApp() { return Promise.resolve(); }
    export const app = {};
    export const db = {};
    export const auth = {
        get currentUser() { return authUser; }
    };
    export const functionsInstancia = {};

    export function getAuth() { return auth; }
    export function getFirestore() { return db; }
    export function getFunctions() { return functionsInstancia; }
    export function httpsCallable() { return () => Promise.resolve({ data: {} }); }

    export function signInWithEmailAndPassword(a, email, pass) {
        authUser = {
            uid: 'usr_despedido_99',
            email: email,
            displayName: null,
            isAnonymous: false,
            getIdTokenResult: () => Promise.resolve({ claims: {} })
        };
        if (authListener) {
            setTimeout(() => authListener(authUser), 10);
        }
        return Promise.resolve({ user: authUser });
    }

    export function signOut() {
        authUser = null;
        if (authListener) {
            setTimeout(() => authListener(null), 10);
        }
        return Promise.resolve();
    }

    export function onAuthStateChanged(a, cb) {
        authListener = cb;
        setTimeout(() => cb(authUser), 10);
        return () => { authListener = null; };
    }

    export function collection(db, col) { return { _col: col }; }
    export function doc(db, col, id) { return { _col: col, id }; }
    export function query(colRef) { return colRef; }
    export function where() { return {}; }
    export function orderBy() { return {}; }
    export function limit() { return {}; }
    export function startAfter() { return {}; }
    export function setDoc() { return Promise.resolve(); }
    export function addDoc() { return Promise.resolve({ id: 'doc_' + Math.random() }); }
    export function updateDoc() { return Promise.resolve(); }
    export function deleteDoc() { return Promise.resolve(); }
    export function serverTimestamp() { return new Date().toISOString(); }
    export function writeBatch() { return { set() {}, commit() { return Promise.resolve(); } }; }
    export function sendPasswordResetEmail() { return Promise.resolve(); }
    export function crearCuentaAuthSecundaria() { return Promise.resolve('uid_secundaria_' + Date.now()); }

    // CLAVE DE LA PRUEBA: El documento en /usuarios/{uid} NO EXISTE (exists() === false)
    export function getDoc(docRef) {
        console.log('[Mock getDoc] consultando:', docRef._col, docRef.id);
        return Promise.resolve({
            exists: () => false,
            data: () => undefined
        });
    }

    export function getDocs() {
        return Promise.resolve({ docs: [], forEach() {}, empty: true });
    }
`;

server.listen(PORT, async () => {
    console.log(`[Servidor Local] Iniciado en http://localhost:${PORT}`);
    let browser = null;

    try {
        const chromePaths = [
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Users\\nacho\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'
        ];
        const executablePath = chromePaths.find(p => fs.existsSync(p));
        if (!executablePath) {
            throw new Error('Google Chrome no encontrado en rutas estándar.');
        }

        browser = await puppeteer.launch({
            executablePath,
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();
        const logs = [];
        const alertsCaptured = [];

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
        });

        // 1. Cargar panel.html en Desktop (1280x850)
        console.log("-> 1. Cargando panel.html en Chrome...");
        await page.setViewport({ width: 1280, height: 850, deviceScaleFactor: 1 });
        await page.goto(`http://localhost:${PORT}/panel.html`, { waitUntil: 'load' });
        await new Promise(r => setTimeout(r, 1000));

        await page.addStyleTag({
            content: `
                .card-his { background: #ffffff !important; border-radius: 1rem !important; border: 1px solid #e2e8f0 !important; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1) !important; }
                .modal { display: none !important; position: fixed !important; inset: 0 !important; z-index: 50 !important; align-items: center !important; justify-content: center !important; }
                .modal.active { display: flex !important; }
                .modal-content { background: #ffffff !important; border-radius: 0.75rem !important; padding: 1.5rem !important; max-width: 450px !important; width: 90% !important; border: 1px solid #cbd5e1 !important; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.15) !important; }
                svg { max-width: 24px !important; max-height: 24px !important; }
                .btn-his-primary { background: #002845 !important; color: #ffffff !important; border-radius: 0.5rem !important; }
            `
        });

        // 2. Intentar iniciar sesión con cuenta huérfana (existe en Auth pero sin doc en /usuarios)
        console.log("-> 2. Ingresando credenciales de cuenta sin perfil en Firestore...");
        await page.type('#login-user', 'despedido@hospital.ar');
        await page.type('#login-pass', 'password123');

        // Hacer clic en Ingresar al Sistema
        console.log("-> 3. Ejecutando intento de login...");
        await page.click('#btn-login');

        // Esperar a que el flujo de autenticación y getDoc se completen
        await new Promise(r => setTimeout(r, 1500));

        // 3. Inspeccionar el estado de la aplicación
        const estadoPostLogin = await page.evaluate(() => {
            const modalAlerta = document.getElementById('modal-alerta');
            const tituloAlerta = document.getElementById('alerta-titulo')?.textContent || '';
            const msgAlerta = document.getElementById('alerta-mensaje')?.textContent || '';
            const alertaVisible = modalAlerta && modalAlerta.classList.contains('active');

            const viewLogin = document.getElementById('view-login');
            const viewReception = document.getElementById('view-reception');
            const sesionActiva = sessionStorage.getItem('hospital_sesion_activa');

            return {
                alertaVisible,
                tituloAlerta,
                msgAlerta,
                loginViewActive: viewLogin && viewLogin.classList.contains('active'),
                receptionViewActive: viewReception && viewReception.classList.contains('active'),
                sesionEnStorage: sesionActiva,
                sesionActualEnMemoria: window.obtenerSesionActual ? window.obtenerSesionActual() : null
            };
        });

        console.log("-> 4. Verificación del estado en Chrome:", estadoPostLogin);

        // Guardar captura de evidencia
        const evidenceDir = 'C:\\Users\\nacho\\.gemini\\antigravity\\brain\\176137f8-6556-4815-aa6e-5ff31c52522c\\browser_evidence';
        fs.mkdirSync(evidenceDir, { recursive: true });
        const screenshotPath = path.join(evidenceDir, 'login-rechazo-cuenta-huerfana.png');
        await page.screenshot({ path: screenshotPath, fullPage: false });
        console.log(`-> 5. Captura guardada en: ${screenshotPath}`);

        // Verificaciones formales
        const exitoRechazo = 
            estadoPostLogin.loginViewActive === true &&
            estadoPostLogin.receptionViewActive === false &&
            estadoPostLogin.sesionEnStorage === null &&
            estadoPostLogin.sesionActualEnMemoria === null;

        if (exitoRechazo) {
            console.log("\n✔ PRUEBA SATISFACTORIA: La cuenta sin perfil Firestore fue 100% RECHAZADA.");
            console.log("  - No recibió rol Recepción.");
            console.log("  - Permaneció en la pantalla de login.");
            console.log("  - La sesión en memoria y sessionStorage quedó nula.");
        } else {
            console.error("\n❌ FALLO DE SEGURIDAD: La cuenta pudo ingresar o no fue bloqueada correctamente:", estadoPostLogin);
            process.exit(1);
        }

    } catch (err) {
        console.error("Fallo durante la prueba Puppeteer de Login Rejection:", err);
        process.exit(1);
    } finally {
        if (browser) await browser.close();
        server.close();
        process.exit(0);
    }
});
