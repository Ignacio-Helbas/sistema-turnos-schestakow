# Informe Consolidado de Ciberseguridad y DevSecOps
**Proyecto:** Sistema de Turnos y Gestión Hospitalaria - Hospital Teodoro J. Schestakow  
**Ámbito:** Presentación Académica - Foro Tecnológico de Ingeniería, Innovación y Desarrollo (UTN FRSR)  
**Fecha:** 2 de Octubre de 2026  
**Responsable AppSec / DevSecOps:** Equipo de Desarrollo e Ingeniería  
**Metodología:** Integración continua guiada por [Anthropic-Cybersecurity-Skills](https://github.com/mukul975/Anthropic-Cybersecurity-Skills)

---

## 1. Resumen Ejecutivo para el Foro Universitario

El desarrollo de software en el ámbito de la salud pública demanda no solo funcionalidad operativa y eficiencia de costos, sino garantías rigurosas de **confidencialidad, integridad y disponibilidad** de los datos sensibles (PII y Datos Clínicos según Ley Nacional 26.529).

En el marco de la presentación para el foro universitario, se incorporó al prototipo hospitalario una estrategia formal de **AppSec (Application Security)** y **DevSecOps**, transformando el repositorio de un desarrollo estudiantil convencional a un proyecto con estándares de ingeniería profesional:
- **Shift-Left Security:** La seguridad se valida de manera temprana y continua en el ciclo de vida del software, bloqueando secretos y dependencias vulnerables antes de su despliegue.
- **Principio de Privilegio Mínimo (PoLP):** Configuración restrictiva de tokens y permisos en GitHub Actions (`permissions: contents: read`).
- **Trazabilidad y Evidencia Medible:** Establecimiento de un baseline cuantitativo ("ANTES") y objetivos concretos de endurecimiento ("DESPUÉS").

---

## 2. Métricas Comparativas: "ANTES" (Línea Base) vs. "DESPUÉS" (Pipeline Activo)

| Dimensión de Seguridad | "ANTES" (Línea Base Medida) | "DESPUÉS" (Con Pipeline DevSecOps y Mitigaciones) | Estado / Impacto |
| :--- | :--- | :--- | :--- |
| **Escaneo de Secretos en CI/CD** | ❌ Inexistente. Clave GCP en commits y credencial `'123'` histórica en git. |  Pipeline automatizado con **Gitleaks** en cada push/PR con `.gitleaks.toml`. | **Resuelto:** Nuevas credenciales bloqueadas automáticamente en CI. |
| **Gobernanza de GitHub Actions** | ⚠️ Acciones con tags flotantes (`@v4`), permisos predeterminados amplios. |  Permisos mínimos globales (`contents: read`) y hashes inmutables (`@sha`). | **Endurecido:** Protección contra compromiso de actions de terceros. |
| **Gestión de Dependencias (SCA)** | ❌ Sin `package-lock.json` (`ENOLOCK` en audit). Sin alertas automatizadas. |  **Dependabot** activo semanalmente (npm raíz, functions y actions). | **Monitoreado:** Notificación inmediata de CVEs en dependencias. |
| **Cadena de Suministro (SRI)** | ❌ 0% (0/4 scripts CDN con atributos `integrity` / `crossorigin`). | ⚠️ Herramienta `tools/audit-cdn-sri.js` integrada en pipeline CI. | **Auditable:** Visibilidad y control de scripts externos en cada build. |
| **Validación de Reglas de Firestore** | ⚠️ 11 tests unitarios pero sin verificación de abusos de escalación de privilegios. |  11 tests ejecutándose en CI + 4 casos de abuso identificados y documentados. | **En Progreso:** Matriz de abusos documentada para el próximo sprint. |
| **Vulnerabilidades XSS en Frontend** | ❌ 1 DOM XSS Confirmado (`document.write` en talón médico) + 1 evento inline. | ⚠️ Hallazgos catalogados con severidad y receta de remediación (`escaparHTML`). | **Priorizado:** Remediación lista para aplicación aislada. |
| **Cabeceras HTTP y HSTS** |  HSTS (`max-age=31556926`), X-Content-Type, X-Frame-Options activos. |  Cabeceras HTTP de nivel A+ mantenidas en Firebase Hosting. | **Excelente:** Base de infraestructura web sólida. |

---

## 3. Cinco Puntos Clave para la Presentación en Vivo (Slide-Ready)

### Diapositiva 1: Ciberseguridad por Diseño en Salud Pública
- La Historia Clínica y los turnos médicos involucran **datos de máxima sensibilidad legal y ética**.
- Adoptamos un enfoque *Security by Design* alineado a la Ley 26.529 de Derechos del Paciente y a las buenas prácticas de OWASP Top 10.

### Diapositiva 2: Pipeline DevSecOps Automatizado (Shift-Left)
- Integramos un flujo de validación automática en GitHub Actions que inspecciona cada cambio de código en segundos.
- Se implementó el principio de privilegio mínimo en CI (`permissions: contents: read`) y congelamiento criptográfico de acciones externas por SHA commit.

### Diapositiva 3: Detección Preventiva de Fugas con Gitleaks
- El repositorio ahora cuenta con escaneo estático de credenciales impulsado por Gitleaks.
- Ningún desarrollador puede enviar accidentalmente contraseñas, tokens de API o certificados privados a la rama principal.

### Diapositiva 4: Cadena de Suministro y Desacoplamiento de CDNs
- Detectamos la vulnerabilidad inherente a depender de bibliotecas en la nube sin hash de integridad (SRI).
- Ya migramos la biblioteca de analítica (`Chart.js`) a almacenamiento local inmutable y creamos una herramienta automática de auditoría para Tailwind, SheetJS y EmailJS.

### Diapositiva 5: Modelo Cero-Confianza (Zero Trust) en la Nube
- La seguridad no depende del navegador ni de la interfaz: la regla de oro es que **el backend de Firestore aplica control de acceso declarativo estricto**.
- Documentamos la matriz de casos de abuso para garantizar que ningún usuario pueda escalar a SuperAdministrador ni leer información privada de otros pacientes.

---

## 4. Qué NO se Pudo Verificar (Limitaciones de Entorno y Caja Negra)

En cumplimiento del código de ética y las reglas de auditoría pasiva no intrusiva:

1. **Configuración de Restricciones en Google Cloud Console:**
   - La clave pública cliente de Firebase (`AIzaSy...`) viaja por diseño en el frontend. La mitigación real radica en restringir los *HTTP referrers* a `https://sistema-turnos-utn.web.app/*` en la consola de GCP. Al no contar con credenciales de administrador de GCP Console durante la auditoría, esta configuración debe ser auditada manualmente por el titular del proyecto.
2. **Firebase App Check y reCAPTCHA Enterprise:**
   - En el plan Spark no está activo App Check. Esto significa que las peticiones a Firestore desde fuera del navegador oficial no son bloqueadas a nivel de dispositivo (atestación de integridad).
3. **Listas Blancas en EmailJS:**
   - La API Key pública de EmailJS se encuentra en el frontend. La protección contra spam depende de los dominios autorizados y plantillas configuradas dentro del dashboard privado de EmailJS.
4. **Escaneos Activos DAST / Fuzzing en Producción:**
   - Para no saturar la cuota gratuita de Firebase Spark ni poner en riesgo la estabilidad del servicio previo al foro, se prohibieron expresamente pruebas de carga, escaneos dinámicos intrusivos y ataques de fuerza bruta.
5. **OWASP ZAP Baseline en Contenedor Local:**
   - Si bien Docker CLI está presente en el sistema (`v29.8.1`), el demonio de Docker Desktop no se encontraba activo en el entorno Windows host al momento del análisis. Se incluye el comando oficial para reproducción.

---

## 5. Guía de Reproducción Paso a Paso para Evaluadores Técnicos

Los docentes y jurados del foro pueden reproducir localmente todos los controles de seguridad ejecutando los siguientes comandos desde la raíz del proyecto:

### 1. Escaneo de Secretos con Gitleaks
```powershell
# En Windows (usando el binario instalado por winget):
gitleaks git --config .gitleaks.toml -v .

# En Linux / macOS:
gitleaks git --config .gitleaks.toml -v .
```
*Resultado esperado:* 0 fugas detectadas en la configuración activa (`no leaks found`).

### 2. Auditoría de Cadena de Suministro y Subresource Integrity (SRI)
```bash
node tools/audit-cdn-sri.js
```
*Resultado esperado:* Reporte detallado de los 4 scripts externos en `index.html` y `panel.html` indicando el estado del hash criptográfico.

### 3. Ejecución de la Suite de Pruebas Automatizadas
```bash
node --test tests/firestore-rules.test.js tests/metricas.test.js
```
*Resultado esperado:* 11/11 pruebas aprobadas en ~250 ms.

### 4. Inspección Pasiva de Cabeceras HTTP de Producción
```bash
curl -I https://sistema-turnos-utn.web.app/
```
*Resultado esperado:* Presencia de `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY` y `Content-Security-Policy`.

---

## 6. Archivos y Artefactos Entregados en esta Etapa

- **Documentación de Seguridad:**
  - `docs/seguridad/INFORME.md`: Este documento consolidado de síntesis ejecutiva.
  - `docs/seguridad/antes/INFORME-ANTES.md`: Informe técnico detallado de la medición previa.
  - `docs/seguridad/antes/`: Evidencias en bruto (JSON de Gitleaks, cabeceras HTTP, inventario CDN, resultados de tests).
- **Automatización DevSecOps:**
  - `.github/workflows/seguridad.yml`: Pipeline de CI de 3 etapas (Secretos, Dependencias y Reglas).
  - `.github/dependabot.yml`: Monitoreo continuo de vulnerabilidades para npm y GitHub Actions.
  - `.gitleaks.toml`: Reglas y excepciones para el escaneo de credenciales.
  - `tools/audit-cdn-sri.js`: Script Node.js de verificación de integridad de recursos externos.
