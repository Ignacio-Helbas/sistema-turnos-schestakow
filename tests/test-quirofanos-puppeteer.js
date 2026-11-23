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

const PORT = 8092;

server.listen(PORT, async () => {
    console.log(`Servidor local iniciado en http://localhost:${PORT}`);
    let browser;
    try {
        browser = await puppeteer.launch({
            executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        const page = await browser.newPage();
        const logs = [];
        const errors = [];

        await page.evaluateOnNewDocument(() => {
            window.tailwind = { config: {} };
        });

        page.on('console', msg => {
            const text = msg.text();
            logs.push(`[${msg.type()}] ${text}`);
            if (msg.type() === 'error') {
                errors.push(`Console Error: ${text}`);
            }
        });

        page.on('pageerror', err => {
            errors.push(`Page Error: ${err.message}\n${err.stack}`);
        });

        await page.goto(`http://localhost:${PORT}/panel.html`, { waitUntil: 'domcontentloaded' });
        await new Promise(r => setTimeout(r, 1500));

        console.log("Página panel.html cargada en Chrome.");
        console.log(`Errores iniciales detectados: ${errors.length}`);

        // Verificamos estado de módulos
        const modulos = await page.evaluate(() => {
            return {
                quirofanos: typeof window.inicializarModuloQuirofanos === 'function',
                abrirModal: typeof window.abrirModalNuevaReservaQuirofano === 'function',
                guardarReserva: typeof window.guardarReservaQuirofano === 'function',
                auth: typeof window.establecerSesionActual === 'function'
            };
        });
        console.log("Módulos expuestos en window:", modulos);

    } catch (err) {
        console.error("Fallo general Puppeteer:", err);
    } finally {
        if (browser) await browser.close();
        server.close();
    }
});
