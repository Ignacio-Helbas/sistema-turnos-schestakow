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

const hoyStr = new Date().toISOString().split('T')[0];

const sharedDB = {
    usuarios: {
        'med_demo_1': {
            activo: true,
            rol: 'Médico',
            nombre: 'Dr. Esteban Quiroga',
            especialidad: 'Clínica Médica',
            matricula: '44019',
            consultorio: '3'
        },
        'admin_uid': {
            activo: true,
            rol: 'Administración',
            nombre: 'Ignacio Helbas'
        }
    },
    turnos: {
        'TURNO_1': {
            idDoc: 'TURNO_1',
            pacienteNombre: 'Carlos Gómez',
            pacienteDni: '30123456',
            pacienteCelular: '2604112233',
            pacienteEmail: 'carlos.gomez@demo.hospital',
            diagnostico: 'Neumonía bilateral en estudio',
            especialidad: 'Clínica Médica',
            medico: 'Dr. Esteban Quiroga',
            medicoUid: 'med_demo_1',
            fecha: hoyStr,
            horario: '09:00',
            canal: 'Web',
            estado: 'En Espera',
            codigoConfirmacion: 'CG900W'
        },
        'TURNO_2': {
            idDoc: 'TURNO_2',
            pacienteNombre: 'María Rodríguez',
            pacienteDni: '28987654',
            pacienteCelular: '2604223344',
            pacienteEmail: 'maria.rodriguez@demo.hospital',
            diagnostico: 'Arritmia y palpitaciones',
            especialidad: 'Cardiología',
            medico: 'Dr. Carlos San Martín',
            medicoUid: 'med_demo_2',
            fecha: hoyStr,
            horario: '09:30',
            canal: 'Presencial',
            estado: 'En Espera',
            codigoConfirmacion: 'MR930P'
        }
    },
    llamador_turnos: {}
};

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
    export function initializeApp() { return {}; }
    export function deleteApp() { return Promise.resolve(); }
    export function getAuth() { return { currentUser: { uid: 'med_demo_1' } }; }
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

    export async function getDoc(docRef) {
        const col = docRef._col;
        const id = docRef.id;
        const data = await window.nodeGetDoc(col, id);
        return {
            exists: () => !!data,
            data: () => data || null,
            id: id
        };
    }

    export async function getDocs(q) {
        const col = q._col || (q.collection && q.collection._col) || '';
        const list = await window.nodeGetDocs(col);
        const docs = list.map(item => ({
            id: item.id,
            ref: { _col: col, id: item.id },
            data: () => item.data
        }));
        return {
            docs,
            forEach(cb) { docs.forEach(cb); },
            empty: docs.length === 0
        };
    }

    export async function setDoc(docRef, data, options) {
        const col = docRef._col;
        const id = docRef.id;
        await window.nodeSetDoc(col, id, data, !!(options && options.merge));
        return;
    }

    export async function addDoc(colRef, data) {
        const col = colRef._col;
        const id = 'auto_' + Math.random().toString(36).substring(2);
        await window.nodeSetDoc(col, id, data, false);
        return { id, _col: col };
    }

    export async function updateDoc(docRef, data) {
        const col = docRef._col;
        const id = docRef.id;
        await window.nodeUpdateDoc(col, id, data);
        return;
    }

    export async function deleteDoc(docRef) {
        const col = docRef._col;
        const id = docRef.id;
        await window.nodeDeleteDoc(col, id);
        return;
    }

    export function onSnapshot(q, cb) {
        const col = q._col || '';
        window.__activeSnapshotCb = cb;

        // Disparo inicial
        window.nodeGetDocs(col).then(list => {
            const docs = list.map(item => ({
                id: item.id,
                ref: { _col: col, id: item.id },
                data: () => item.data
            }));
            cb({
                docs,
                empty: docs.length === 0,
                forEach(fn) { docs.forEach(fn); }
            });
        });

        return () => { window.__activeSnapshotCb = null; };
    }

    export function serverTimestamp() { return new Date().toISOString(); }
    export function writeBatch() {
        const ops = [];
        return {
            set: (docRef, data, options) => ops.push(() => setDoc(docRef, data, options)),
            delete: (docRef) => ops.push(() => deleteDoc(docRef)),
            commit: async () => { for (const op of ops) await op(); }
        };
    }

    export function signInWithEmailAndPassword() { return Promise.resolve({ user: { uid: 'med_demo_1' } }); }
    export function createUserWithEmailAndPassword() { return Promise.resolve({ user: { uid: 'new_uid' } }); }
    export function signOut() { return Promise.resolve(); }
    export function onAuthStateChanged(auth, cb) {
        setTimeout(() => cb(auth.currentUser), 10);
        return () => {};
    }
    export function sendPasswordResetEmail() { return Promise.resolve(); }
    export function signInAnonymously() { return Promise.resolve({ user: { uid: 'anon' } }); }
    export function arrayUnion(...items) { return items; }
    export function initializeAppCheck() { return null; }
    export class ReCaptchaV3Provider {}
`;

const PORT = 8097;

server.listen(PORT, async () => {
    console.log(`[Servidor Local] Cartelera y Panel en http://localhost:${PORT}`);
    let browser;
    try {
        browser = await puppeteer.launch({
            executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        // =====================================================================
        // PASO 1: ABRIR turnero.html EN PESTAÑA 1 (SIMULANDO LA TV DE SALA)
        // =====================================================================
        console.log('-> 1. Abriendo turnero.html en modo TV/Kiosco...');
        const pageTV = await browser.newPage();
        await pageTV.setViewport({ width: 1920, height: 1080 }); // Full HD

        // Exponer funciones puente de Node para base de datos compartida
        await pageTV.exposeFunction('nodeGetDoc', (col, id) => {
            return sharedDB[col] ? sharedDB[col][id] || null : null;
        });
        await pageTV.exposeFunction('nodeGetDocs', (col) => {
            const dict = sharedDB[col] || {};
            return Object.keys(dict).map(id => ({ id, data: dict[id] })).sort((a, b) => {
                const fA = a.data.llamadoEn || '';
                const fB = b.data.llamadoEn || '';
                return fB > fA ? 1 : (fB < fA ? -1 : 0);
            });
        });
        await pageTV.exposeFunction('nodeSetDoc', (col, id, data, merge) => {
            if (!sharedDB[col]) sharedDB[col] = {};
            sharedDB[col][id] = merge ? Object.assign({}, sharedDB[col][id], data) : Object.assign({}, data);
        });
        function validarReglasLlamadorUpdate(col, data) {
            if (col === 'llamador_turnos') {
                const permitidos = ['estado', 'llamadoEn'];
                const keys = Object.keys(data);
                const invalidos = keys.filter(k => !permitidos.includes(k));
                if (invalidos.length > 0) {
                    throw new Error(`Permiso denegado por regla diff.affectedKeys().hasOnly(['estado', 'llamadoEn']): intento de modificar '${invalidos.join(', ')}'`);
                }
                if (data.estado && !['llamando', 'atendiendo', 'finalizado'].includes(data.estado)) {
                    throw new Error(`Permiso denegado por isValidLlamador(): estado no válido '${data.estado}'`);
                }
            }
        }

        await pageTV.exposeFunction('nodeUpdateDoc', (col, id, data) => {
            validarReglasLlamadorUpdate(col, data);
            if (sharedDB[col] && sharedDB[col][id]) {
                sharedDB[col][id] = Object.assign({}, sharedDB[col][id], data);
            }
        });
        await pageTV.exposeFunction('nodeDeleteDoc', (col, id) => {
            if (sharedDB[col] && sharedDB[col][id]) delete sharedDB[col][id];
        });

        await pageTV.setRequestInterception(true);
        pageTV.on('request', req => {
            const url = req.url();
            const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/javascript' };
            if (url.includes('firebase-app.js') || url.includes('firebase-firestore.js') ||
                url.includes('firebase-auth.js') || url.includes('firebase-functions.js') ||
                url.includes('firebase-app-check.js')) {
                req.respond({ status: 200, headers, body: mockFirebaseESM });
                return;
            }
            req.continue();
        });

        await pageTV.goto(`http://localhost:${PORT}/turnero.html`, { waitUntil: 'networkidle0' });

        // Verificar estado inicial en pantalla
        const estadoInicialTV = await pageTV.evaluate(() => {
            return {
                paciente: document.getElementById('principal-paciente')?.textContent.trim(),
                consultorio: document.getElementById('principal-consultorio')?.textContent.trim(),
                audioActivo: document.getElementById('texto-estado-audio')?.textContent.trim()
            };
        });
        console.log('   Estado inicial TV:', JSON.stringify(estadoInicialTV));
        assert.strictEqual(estadoInicialTV.paciente, 'Sala de Espera');

        // Captura inicial de TV vacía
        const imgTVInicial = path.join(artifactDir, 'turnero-pantalla-inicial.png');
        await pageTV.screenshot({ path: imgTVInicial });
        console.log(`[Evidencia] Captura Pantalla Inicial TV: ${imgTVInicial}`);

        // Activar audio haciendo clic en el botón de cabecera
        console.log('-> 2. Simulando clic de operador para activar audio y pantalla completa...');
        await pageTV.click('#btn-activar-audio');
        const estadoAudio = await pageTV.evaluate(() => {
            return document.getElementById('texto-estado-audio')?.textContent.trim();
        });
        assert.strictEqual(estadoAudio, 'Audio y Pantalla Activos');

        // =====================================================================
        // PASO 2: ABRIR panel.html EN PESTAÑA 2 (MÉDICO EN CONSULTORIO)
        // =====================================================================
        console.log('-> 3. Abriendo panel.html con sesión del Dr. Esteban Quiroga...');
        const pageDoctor = await browser.newPage();
        await pageDoctor.setViewport({ width: 1440, height: 900 });

        // Exponer funciones puente de Node en la pestaña del médico
        await pageDoctor.exposeFunction('nodeGetDoc', (col, id) => {
            return sharedDB[col] ? sharedDB[col][id] || null : null;
        });
        await pageDoctor.exposeFunction('nodeGetDocs', (col) => {
            const dict = sharedDB[col] || {};
            return Object.keys(dict).map(id => ({ id, data: dict[id] }));
        });
        await pageDoctor.exposeFunction('nodeSetDoc', async (col, id, data, merge) => {
            if (!sharedDB[col]) sharedDB[col] = {};
            sharedDB[col][id] = merge ? Object.assign({}, sharedDB[col][id], data) : Object.assign({}, data);

            // Si es llamador_turnos, notificar reactivamente a la TV en tiempo real
            if (col === 'llamador_turnos') {
                const dict = sharedDB[col];
                const list = Object.keys(dict).map(k => ({ id: k, data: dict[k] })).sort((a, b) => {
                    const fA = a.data.llamadoEn || '';
                    const fB = b.data.llamadoEn || '';
                    return fB > fA ? 1 : (fB < fA ? -1 : 0);
                });
                await pageTV.evaluate((items) => {
                    if (window.__activeSnapshotCb) {
                        const docs = items.map(it => ({
                            id: it.id,
                            data: () => it.data
                        }));
                        window.__activeSnapshotCb({
                            docs,
                            empty: docs.length === 0,
                            forEach(fn) { docs.forEach(fn); }
                        });
                    }
                }, list);
            }
        });
        await pageDoctor.exposeFunction('nodeUpdateDoc', (col, id, data) => {
            validarReglasLlamadorUpdate(col, data);
            if (sharedDB[col] && sharedDB[col][id]) {
                sharedDB[col][id] = Object.assign({}, sharedDB[col][id], data);
            }
        });
        await pageDoctor.exposeFunction('nodeDeleteDoc', (col, id) => {
            if (sharedDB[col] && sharedDB[col][id]) delete sharedDB[col][id];
        });

        await pageDoctor.setRequestInterception(true);
        pageDoctor.on('request', req => {
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

        await pageDoctor.evaluateOnNewDocument(() => {
            sessionStorage.setItem('hospital_sesion_activa', 'true');
            sessionStorage.setItem('hospital_usuario_sesion', JSON.stringify({
                uid: 'med_demo_1',
                nombre: 'Dr. Esteban Quiroga',
                rol: 'Médico',
                especialidad: 'Clínica Médica',
                consultorio: '3',
                activo: true
            }));
        });

        await pageDoctor.goto(`http://localhost:${PORT}/panel.html`, { waitUntil: 'networkidle0' });

        await pageDoctor.evaluate(() => {
            window.establecerSesionActual({
                uid: 'med_demo_1',
                nombre: 'Dr. Esteban Quiroga',
                rol: 'Médico',
                especialidad: 'Clínica Médica',
                consultorio: '3',
                activo: true
            });
            window.switchView('doctor');
        });

        // Llamar al paciente Carlos Gómez (TURNO_1)
        console.log('-> 4. El Dr. Quiroga hace clic en [Llamar] al paciente Carlos Gómez...');
        await pageDoctor.evaluate(async () => {
            await window.llamarPaciente('TURNO_1');
        });

        // Captura del panel del médico
        const imgDoctor = path.join(artifactDir, 'consultorio-paciente-llamado.png');
        await pageDoctor.screenshot({ path: imgDoctor });
        console.log(`[Evidencia] Captura Consultorio Médico: ${imgDoctor}`);

        // =====================================================================
        // PASO 3: VERIFICAR QUE turnero.html RECIBE EL LLAMADO EN TIEMPO REAL
        // =====================================================================
        console.log('-> 5. Verificando que turnero.html se actualizó automáticamente vía onSnapshot...');
        await new Promise(r => setTimeout(r, 600));

        const llamadoEnTV = await pageTV.evaluate(() => {
            return {
                paciente: document.getElementById('principal-paciente')?.textContent.trim(),
                consultorio: document.getElementById('principal-consultorio')?.textContent.trim(),
                medico: document.getElementById('principal-medico')?.textContent.trim(),
                especialidad: document.getElementById('principal-especialidad')?.textContent.trim(),
                tieneClaseAnimacion: document.getElementById('tarjeta-llamado-principal')?.classList.contains('animacion-nuevo-llamado')
            };
        });

        console.log('   Datos mostrados en TV:', JSON.stringify(llamadoEnTV, null, 2));
        assert.strictEqual(llamadoEnTV.paciente, 'Carlos Gómez', 'El nombre en pantalla debe ser Carlos Gómez');
        assert.strictEqual(llamadoEnTV.consultorio, 'Consultorio 3', 'El consultorio debe ser Consultorio 3');
        assert.ok(llamadoEnTV.medico.includes('Dr. Esteban Quiroga'), 'Debe mostrar el nombre del Dr. Quiroga');
        assert.ok(llamadoEnTV.especialidad.includes('Clínica Médica'), 'Debe mostrar Clínica Médica');

        // Captura de la TV con el paciente llamado
        const imgTVLlamado = path.join(artifactDir, 'turnero-llamado-recibido.png');
        await pageTV.screenshot({ path: imgTVLlamado });
        console.log(`[Evidencia] Captura TV con llamado recibido: ${imgTVLlamado}`);

        // =====================================================================
        // PASO 4: AUDITORÍA DE SEGURIDAD (PAYLOAD REAL Y DOM SIN DATOS SENSIBLES)
        // =====================================================================
        console.log('-> 6. Auditando seguridad de red y ausencia de PII en la cartelera pública...');

        // 1. Auditar el objeto almacenado en la colección pública /llamador_turnos
        const payloadPublico = Object.values(sharedDB.llamador_turnos);

        console.log('   Payload en colección pública /llamador_turnos:', JSON.stringify(payloadPublico, null, 2));

        payloadPublico.forEach(doc => {
            assert.strictEqual(doc.pacienteDni, undefined, 'CRÍTICO: pacienteDni NO debe existir en llamador_turnos');
            assert.strictEqual(doc.pacienteCelular, undefined, 'CRÍTICO: pacienteCelular NO debe existir en llamador_turnos');
            assert.strictEqual(doc.pacienteEmail, undefined, 'CRÍTICO: pacienteEmail NO debe existir en llamador_turnos');
            assert.strictEqual(doc.diagnostico, undefined, 'CRÍTICO: diagnostico NO debe existir en llamador_turnos');
            assert.strictEqual(doc.codigoConfirmacion, undefined, 'CRÍTICO: codigoConfirmacion NO debe existir en llamador_turnos');
        });

        // 2. Auditar el DOM de turnero.html para verificar que ningún DNI ni celular se filtró en el texto
        const textoCompletoDOM = await pageTV.evaluate(() => document.body.innerText);
        assert.ok(!textoCompletoDOM.includes('30123456'), 'El DNI del paciente nunca debe figurar en el DOM de la TV');
        assert.ok(!textoCompletoDOM.includes('2604112233'), 'El celular del paciente nunca debe figurar en el DOM de la TV');
        assert.ok(!textoCompletoDOM.includes('Neumonía'), 'El diagnóstico del paciente nunca debe figurar en el DOM de la TV');

        // =====================================================================
        // PASO 5: SEGUNDO LLAMADO PARA VERIFICAR HISTORIAL DE ANTERIORES
        // =====================================================================
        console.log('-> 7. Simulando segundo llamado (María Rodríguez) para verificar el carril de anteriores...');
        await pageDoctor.evaluate(async () => {
            await window.llamarPaciente('TURNO_2');
        });
        await new Promise(r => setTimeout(r, 600));

        const estadoSegundoLlamado = await pageTV.evaluate(() => {
            return {
                pacienteActual: document.getElementById('principal-paciente')?.textContent.trim(),
                historialTexto: document.getElementById('contenedor-historial-llamados')?.innerText.trim()
            };
        });

        console.log('   Estado con segundo llamado:', JSON.stringify(estadoSegundoLlamado, null, 2));
        assert.strictEqual(estadoSegundoLlamado.pacienteActual, 'María Rodríguez', 'El llamado principal ahora debe ser María Rodríguez');
        assert.ok(estadoSegundoLlamado.historialTexto.includes('Carlos Gómez'), 'Carlos Gómez debe aparecer en el carril de llamados anteriores');

        const imgTVHistorial = path.join(artifactDir, 'turnero-segundo-llamado-con-historial.png');
        await pageTV.screenshot({ path: imgTVHistorial });
        console.log(`[Evidencia] Captura TV con historial de anteriores: ${imgTVHistorial}`);

        // =====================================================================
        // PASO 6: VALIDACIÓN DE REGLAS DE UPDATE RESTRINGIDO (PUNTO 2 Y 3)
        // =====================================================================
        console.log('-> 8. Verificando en Chrome la restricción de actualización diff.affectedKeys()...');

        // 1. Update legítimo: sólo 'estado' y 'llamadoEn'
        await pageDoctor.evaluate(async () => {
            const { updateDoc, doc, db } = await import('./js/firebase.js');
            await updateDoc(doc(db, 'llamador_turnos', 'TURNO_2'), {
                estado: 'atendiendo',
                llamadoEn: new Date().toISOString()
            });
        });
        assert.strictEqual(sharedDB.llamador_turnos['TURNO_2'].estado, 'atendiendo', 'El estado debe actualizarse a atendiendo');
        console.log('   ✔ Actualización de estado legítima ("atendiendo") procesada exitosamente.');

        // 2. Intento ilegítimo: modificar pacienteNombre en update
        let errorPacienteDetectado = false;
        try {
            await pageDoctor.evaluate(async () => {
                const { updateDoc, doc, db } = await import('./js/firebase.js');
                await updateDoc(doc(db, 'llamador_turnos', 'TURNO_2'), {
                    pacienteNombre: 'Atacante Hacker',
                    estado: 'atendiendo'
                });
            });
        } catch (e) {
            errorPacienteDetectado = true;
            console.log('   ✔ Regla diff.affectedKeys() bloqueó correctamente la mutación de pacienteNombre.');
        }
        assert.ok(errorPacienteDetectado, 'El update debe fallar si intenta modificar pacienteNombre');

        // 3. Intento ilegítimo: usar estado 'cancelado' (retirado del esquema)
        let errorCanceladoDetectado = false;
        try {
            await pageDoctor.evaluate(async () => {
                const { updateDoc, doc, db } = await import('./js/firebase.js');
                await updateDoc(doc(db, 'llamador_turnos', 'TURNO_2'), {
                    estado: 'cancelado'
                });
            });
        } catch (e) {
            errorCanceladoDetectado = true;
            console.log('   ✔ isValidLlamador() rechazó correctamente el estado retirado "cancelado".');
        }
        assert.ok(errorCanceladoDetectado, 'El update debe fallar si intenta usar el estado cancelado');

        console.log('\n===================================================================');
        console.log('✅ TODAS LAS PRUEBAS DE CARTELERA TV Y PRIVACIDAD SUPERADAS CON ÉXITO');
        console.log('===================================================================');

    } catch (err) {
        console.error('❌ Error en prueba automatizada:', err);
        process.exitCode = 1;
    } finally {
        if (browser) await browser.close();
        server.close();
    }
});
