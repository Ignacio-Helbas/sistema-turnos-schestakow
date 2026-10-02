# Informe de Seguridad - Medición "ANTES" (Baseline de Seguridad)
**Proyecto:** Sistema de Turnos y Gestión Hospitalaria - Schestakow  
**Fecha de Evaluación:** 2 de Octubre de 2026  
**Entorno de Ejecución:** Windows 11 / PowerShell / Node.js v24.21.0 / Git v2.54.0  
**URL Desplegada (Producción):** `https://sistema-turnos-utn.web.app/`  
**Metodología y Guía:** [Anthropic-Cybersecurity-Skills](https://github.com/mukul975/Anthropic-Cybersecurity-Skills) (Skills aplicados: `implementing-secret-scanning-with-gitleaks`, `testing-for-broken-access-control`, `testing-for-xss-vulnerabilities`, `performing-security-headers-audit`, `securing-github-actions-workflows`)

---

## 1. Resumen Ejecutivo
Como parte del proceso de auditoría AppSec y DevSecOps previo a la presentación universitaria, se realizó una medición exhaustiva del estado de seguridad del repositorio ("ANTES") sin modificar el código funcional existente. 

Se analizaron cinco vectores fundamentales:
1. **Detección de Secretos:** Escaneo estático en working tree y en el historial completo de Git.
2. **Cadena de Suministro y Dependencias:** Inventario de CDNs, verificación de SRI (Subresource Integrity) y estado de dependencias npm.
3. **Cabeceras HTTP y Content Security Policy (CSP):** Auditoría pasiva sobre la URL desplegada en Firebase Hosting.
4. **Reglas de Firestore:** Ejecución de la suite de pruebas automatizadas y diseño de matriz de casos de abuso.
5. **Revisión de Código Estática (SAST):** Análisis de vulnerabilidades de XSS (DOM/Stored), control de acceso en frontend y persistencia de sesiones.

---

## 2. Análisis de Secretos (Gitleaks v8.30.1)

### 2.1. Escaneo del Árbol de Trabajo Actual (`Working Tree`)
- **Comando ejecutado:** `gitleaks dir --no-git -v --report-format json --report-path docs/seguridad/antes/gitleaks-working-tree.json .`
- **Resultados:** 1 hallazgo detectado.
- **Detalle del Hallazgo:**
  - **Archivo:** `js/firebase-config.js` (Línea 38)
  - **Regla:** `gcp-api-key`
  - **Valor detectado (Redactado):** `AIzaSy…`
  - **Contexto:** Clave de API de Firebase (`firebaseConfig.apiKey`).

### 2.2. Escaneo del Historial Completo de Git
- **Comando ejecutado:** `gitleaks git --log-opts="--all" -v --report-format json --report-path docs/seguridad/antes/gitleaks-history.json`
- **Resultados:** 7 hallazgos detectados en el historial histórico de commits.
- **Detalle de Commits:**
  1. `0fcc273ff4ef25f60c8b0a652a6ea567ba4aff37` (`README.md:115`) - Clave GCP `AIzaSy…`
  2. `ba65df30a721dd52a047d4a4075b89b0f5a90eec` (`js/firebase-config.js:35`) - Clave GCP `AIzaSy…`
  3. `fb4783dbfea29e1689ce9a5767cbc22e7008c0f5` (`PLAN.md:104`) - Clave GCP `AIzaSy…`
  4. `de7a4cfc500635c8c743bba48ae10f4816588f65` (`js/firebase-config.js:25`) - Clave GCP `AIzaSy…`
  5. `ee95f6679921c76c2d3500367b3ecbac85bb0d0d` (`js/logica.js:13`) - Clave GCP `AIzaSy…`
  6. `e33fc678cf7ce4eae3b3e94b1ab1f15b73901884` (`js/logica.js:11`) - Clave GCP `AIzaSy…`
  7. `51660534ccb67f34ca1274797a4bd0218288cc95` (`index.html:540`) - Clave GCP `AIzaSy…`

### 2.3. Contraseñas Históricas en el Repositorio
- **Commit analizado:** `77cbd2fcbbbe0b71eeef84564bf50137351ad88b`
- **Hallazgo:** En la función `crearCuentaMaestra()` se incluyó históricamente la contraseña `'123'` en texto claro para la creación del usuario maestro (`nachohelbas@gmail.com`). Aunque el código fue eliminado en commits posteriores, el valor permanece en el historial inmutable de Git.
- **Riesgo:** Si esa contraseña o variante similar sigue activa en Firebase Authentication, cualquier persona con acceso al repo podría autenticarse.

### 2.4. Evaluación de Riesgo y Plan de Rotación
1. **Clave GCP Browser (`AIzaSy…`):** En las arquitecturas cliente de Firebase, la `apiKey` identifica el proyecto ante Google Cloud y viaja en el cliente web por diseño. **Sin embargo**, para mitigar abusos (cuotas no autorizadas o uso fuera del dominio), se debe aplicar restricción de aplicación en Google Cloud Console:
   - Restricción de HTTP referrer: `https://sistema-turnos-utn.web.app/*` y `http://localhost:*`.
   - Restricción de APIs habilitadas: limitar exclusivamente a *Identity Toolkit API* (Firebase Auth) y *Cloud Firestore API*.
2. **Rotación de Credenciales de Usuario:**
   - Forzar reinicio de contraseña inmediato en Firebase Auth Console para el usuario `nachohelbas@gmail.com` y cualquier cuenta de prueba que haya utilizado contraseñas débiles o documentadas.
3. **Service Account en CI/CD:**
   - Verificar en GitHub Secrets que `FIREBASE_SERVICE_ACCOUNT` tenga permisos mínimos (rol *Firebase Hosting Admin* / *Cloud Runtime Config Admin* en lugar de *Owner* o *Editor* del proyecto GCP).

---

## 3. Cadena de Suministro y Dependencias

### 3.1. Inventario de Recursos Externos (CDN) en Archivos HTML
Se inspeccionaron todos los documentos HTML (`index.html`, `panel.html`). Evidencia guardada en `docs/seguridad/antes/inventario-cdn.json`.

| Archivo | Recurso CDN | Versión | Subresource Integrity (SRI) | Riesgo de Cadena de Suministro |
| :--- | :--- | :--- | :--- | :--- |
| `index.html:9` | `https://cdn.tailwindcss.com` | No versionada (latest/JIT) | **NO (Falta `integrity`)** | **Alto:** Script ejecutado sin fijar versión ni hash. Un compromiso en el CDN permite XSS global en la raíz. |
| `index.html:12` | `https://cdn.jsdelivr.net/npm/@emailjs/browser@3/dist/email.min.js` | `@3` (versión flotante) | **NO (Falta `integrity`)** | **Medio:** Script de mensajería sin hash criptográfico. |
| `panel.html:9` | `https://cdn.tailwindcss.com` | No versionada (latest/JIT) | **NO (Falta `integrity`)** | **Alto:** Script en panel de administración sin SRI. |
| `panel.html:12` | `https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js` | `xlsx-latest` (mutable) | **NO (Falta `integrity`)** | **Alto:** Uso explícito de `-latest`. Una versión comprometida o incompatible impacta directamente la exportación médica. |

> **Observación positiva:** La librería Chart.js ya fue descargada localmente a `/vendor/chart.umd.min.js` sin depender de CDN externo, siguiendo las mejores prácticas de endurecimiento.

### 3.2. Diagnóstico de `npm audit`
- **Raíz (`package.json`):** Solo contiene devDependency `@firebase/rules-unit-testing: ^3.0.3`.
  - Al ejecutar `npm audit`, devolvió el código `ENOLOCK` debido a la ausencia de `package-lock.json`. Esto significa que las versiones exactas de las subdependencias transitivas no están bloqueadas criptográficamente.
- **Backend (`functions/package.json`):** Contiene `firebase-admin: ^11.11.0` y `firebase-functions: ^4.3.1`.
  - También carece de `package-lock.json`, lo que genera riesgo de derivación de versiones (*dependency drift*).

---

## 4. Cabeceras HTTP y Content Security Policy (CSP)

### 4.1. Análisis Pasivo contra Producción
Se capturaron las cabeceras emitidas por Firebase Hosting contra `https://sistema-turnos-utn.web.app/` (evidencia en `docs/seguridad/antes/headers-produccion.txt`).

```http
HTTP/1.1 200 OK
Strict-Transport-Security: max-age=31556926; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
Content-Security-Policy: default-src 'self'; script-src 'self' https://cdn.tailwindcss.com https://cdn.jsdelivr.net https://cdn.sheetjs.com https://www.gstatic.com 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://*.cloudfunctions.net wss://*.firebaseio.com https://api.emailjs.com; frame-src 'self' https://www.google.com; frame-ancestors 'none'
```

### 4.2. Matriz de Evaluación de Cabeceras

| Cabecera | Estado | Evaluación |
| :--- | :--- | :--- |
| **Strict-Transport-Security (HSTS)** |  Presente | Excelente configuración (`max-age=31556926; includeSubDomains; preload`). Fuerza HTTPS durante 1 año. |
| **X-Content-Type-Options** |  Presente | Configurado en `nosniff`, previene ataques de MIME-sniffing. |
| **X-Frame-Options** |  Presente | Configurado en `DENY`, previene Clickjacking en navegadores antiguos. |
| **Referrer-Policy** |  Presente | `strict-origin-when-cross-origin`, no filtra rutas completas hacia orígenes externos. |
| **Permissions-Policy** |  Presente | Bloquea cámara, micrófono y geolocalización de forma explícita. |
| **Content-Security-Policy (CSP)** | ⚠️ Parcial / Débil | Contiene protecciones válidas (`frame-ancestors 'none'`, orígenes declarados), pero presenta **dos debilidades críticas**: |
| - *script-src 'unsafe-inline'* | ❌ Vulnerabilidad | Permite la ejecución de scripts en línea, anulando en gran medida la mitigación de ataques XSS que brinda la CSP. |
| - *connect-src con comodines* | ⚠️ Amplitud excesiva | El uso de `https://*.googleapis.com` y `https://*.firebaseio.com` es excesivamente amplio. |

### 4.3. Estado de Escaneo OWASP ZAP (Baseline)
- **Herramienta evaluada:** Docker Engine para ejecución de `owasp/zap2docker-stable:latest`.
- **Estado en el entorno local:** El binario Docker CLI está instalado en Windows (`Docker version 29.8.1`), pero el demonio Docker Desktop no se encontraba en ejecución activa durante la prueba.
- **Comando verificado para ejecución futura (sin intrusión):**
  ```bash
  docker run -v ${PWD}:/zap/wrk/:rw -t ghcr.io/zaproxy/zaproxy:stable zap-baseline.py -t https://sistema-turnos-utn.web.app/ -r zap-report.html
  ```

---

## 5. Auditoría de Reglas de Firestore (`firestore.rules`)

### 5.1. Resultados de la Suite de Pruebas Existente
Se ejecutaron los tests unitarios con Node.js Test Runner:
```bash
node --test tests/firestore-rules.test.js tests/metricas.test.js
```
- **Total de pruebas ejecutadas:** 11 pruebas.
- **Pruebas superadas:** 11 / 11 (100% de éxito).
- **Tiempo de ejecución:** 246 ms.
- Evidencia registrada en `docs/seguridad/antes/test-results.txt`.

### 5.2. Brechas de Seguridad Detectadas en las Reglas Actuales y Casos de Abuso Propuestos

A partir del análisis estático guiado por el skill `testing-for-broken-access-control`, se identificaron 4 riesgos en `firestore.rules`:

1. **Abuso 1: Lectura de PII de turnos por atacantes anónimos (`/turnos/{turnoId}`)**
   - *Línea 121:* `allow get: if ... || (!isSignedIn() && turnoId.size() >= 16);`
   - *Riesgo:* Cualquier usuario no autenticado que obtenga o adivine un `turnoId` puede leer directamente el documento completo de Firestore, exponiendo `pacienteNombre`, `pacienteDni`, `pacienteCelular` y `pacienteEmail`.
   - *Caso de prueba a agregar:* Usuario anónimo intenta leer un turno y debe recibir denegación si no demuestra posesión de un token o código de validación.

2. **Abuso 2: Auto-asignación de Rol SuperAdmin al crear perfil (`/usuarios/{uid}`)**
   - *Línea 47-48:* `allow create: if isStaff() && (isSuperAdmin() || request.auth.uid == uid);`
   - *Riesgo:* Cualquier usuario autenticado (médico, recepcionista o cuenta creada vía email) puede hacer `create` en `/usuarios/{uid}` asignándose a sí mismo `{ rol: "Administración" }`. Debido a que `getUserRol()` lee el campo `rol` del documento propio, esto escala inmediatamente los privilegios del usuario a `isSuperAdmin()`.
   - *Caso de prueba a agregar:* Usuario autenticado sin rol intenta crear su propio perfil con `rol: "Administración"` -> DEBE SER RECHAZADO.

3. **Abuso 3: Modificación cruzada de turnos entre médicos (`/turnos/{turnoId}`)**
   - *Líneas 120, 125:* Los médicos solo pueden listar turnos donde `medicoUid == request.auth.uid`. Sin embargo, en `isValidTurnoStaffCreate()`, la regla no exige estrictamente que `request.resource.data.medicoUid == request.auth.uid` cuando el creador es médico.
   - *Caso de prueba a agregar:* Médico A intenta crear o actualizar un turno asignado al Médico B -> DEBE SER RECHAZADO.

4. **Abuso 4: Recepción intentando listar colección sensible `/usuarios`**
   - *Línea 46:* `allow list: if isSuperAdmin();`
   - *Estado:* Correctamente restringido en la regla, pero requiere test automatizado para verificar que un usuario con rol 'Recepción' reciba `permission-denied` al intentar listar la colección `/usuarios`.

---

## 6. Revisión de Código Estática (SAST)

Se escanearon los archivos `js/*.js` y `*.html` en busca de sumideros XSS (`innerHTML`, `document.write`), control de acceso basado únicamente en frontend y datos sensibles en cliente. Evidencia completa en `docs/seguridad/antes/code-review-raw.json` (61 ocurrencias analizadas).

| ID | Archivo:Línea | Severidad | Tipo | Evidencia / Patrón | Corrección Sugerida | Estado |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **VULN-01** | `js/admin.js:2616-2660` | **Alta** | **DOM XSS en Impresión** | `printWin.document.write(...)` interpola directamente variables del turno (`c.pacienteNombre`, `c.pacienteDni`, `c.medico`, `c.motivoCitacion`) sin sanitizar con `escaparHTML()`. | Envolver todas las variables inyectadas en `escaparHTML()` o construir el documento mediante DOM APIs seguros (`createElement`, `textContent`). | **CONFIRMADO** |
| **VULN-02** | `js/admin.js:157-175` | **Alta** | **Control de Acceso Client-Side** | `if (user.email.toLowerCase() === "nachohelbas@gmail.com") { rol = "Administración"; ... setDoc(...) }`. La lógica de escalación a SuperAdmin está hardcodeada en el cliente JS. | Los roles deben ser gestionados exclusivamente mediante Firebase Custom Claims o validados estrictamente en reglas de backend sin depender de la lógica del bundle frontend. | **CONFIRMADO** |
| **VULN-03** | `js/publico.js:406` | **Media** | **Manejadores Inline en HTML** | `res.innerHTML = '<button onclick="abrirModalElegirHorarioCitacion(\'${snap.id}\')"...>'`. Requiere `'unsafe-inline'` en CSP. | Utilizar delegación de eventos (`addEventListener`) y pasar el ID mediante atributos `data-id` leídos en el evento. | **CONFIRMADO** |
| **VULN-04** | `js/admin.js:133-140` | **Media** | **Control de Sesión Frontend Bypassable** | `sessionStorage.getItem('hospital_sesion_activa') !== 'true'`. Si bien cierra sesión en el cliente, la seguridad real depende de que Firestore aplique las reglas. Manipular `sessionStorage` no debe permitir ver datos si las reglas son sólidas. | Mantener las reglas de Firestore como barrera primaria de autorización y evitar confiar en estados volátiles del navegador para seguridad lógica. | **CONFIRMADO** |
| **VULN-05** | Múltiples en `js/admin.js` (52 sitios) | **Baja / Informativa** | **Uso Extensivo de `innerHTML`** | Múltiples renderizados de tablas y modales usan `innerHTML`. La mayoría aplica `escaparHTML()`, pero la superficie de ataque es amplia. | Migrar progresivamente a plantillas declarativas seguras o utilidades que fuercen codificación contextual. | **HIPÓTESIS** |

---

## 7. Conclusión de la Medición "ANTES"
El sistema cuenta con cimientos sólidos de seguridad (HSTS activado, suite de pruebas de reglas con 11 tests pasando, Chart.js desacoplado de CDNs, y uso generalizado de `escaparHTML()`). No obstante, la medición "ANTES" expone vulnerabilidades concretas en:
1. Cadena de suministro de CDNs (falta de SRI en Tailwind, SheetJS y EmailJS).
2. Clave de GCP presente en el historial de Git (requiere restricciones de referrer y API).
3. DOM XSS en el talón de impresión médica (`document.write`).
4. Vulnerabilidad de escalación de privilegios en la creación de documentos de usuario en Firestore.
5. Regla de CSP debilitada por `'unsafe-inline'`.

Este informe sirve como línea base cuantitativa y cualitativa para implementar el pipeline de DevSecOps (Fase 3) y monitorear la mejora en la medición "DESPUÉS".
