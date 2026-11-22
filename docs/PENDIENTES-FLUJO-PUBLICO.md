# Pendientes de Revisión: Flujo Público de Turnos y Hardening

Este documento registra los cambios desacoplados del commit de Internación y Quirófanos (`feature/internacion-quirofanos`), para ser auditados, probados en Chrome real y desplegados en una sesión dedicada exclusivamente al flujo público de reservas.

---

## 1. Portal Público (`index.html`)

### A) Desacople del SDK de EmailJS
- **Archivo:** `index.html` (encabezado)
- **Cambio:** Remover la etiqueta `<script>` que carga la librería cliente de EmailJS:
  ```html
  <!-- EmailJS CDN -->
  <script type="text/javascript" src="https://cdn.jsdelivr.net/npm/@emailjs/browser@3/dist/email.min.js"></script>
  ```
- **Motivo:** El despacho de correos se traslada íntegramente al backend mediante la Cloud Function `enviarNotificacionTurno`, eliminando librerías innecesarias del frontend.

### B) Normalización de saltos de línea (CRLF/LF)
- **Problema detectado:** En entornos Windows, el archivo acumuló caracteres `\r\r\n` generando líneas vacías duplicadas (de 848 líneas originales a 1691 líneas).
- **Acción requerida:** Formatear con saltos LF limpios y verificar que los estilos de impresión `@media print` sigan aislando correctamente el comprobante hospitalario.

---

## 2. Lógica del Portal Público (`js/publico.js`)

### A) Protección Anti-Bot (Honeypot)
- **Ubicación:** `confirmarTurnoFirebase()`
- **Código a auditar:**
  ```javascript
  const campoTrampa = document.getElementById('campo-verificacion-seguridad');
  if (campoTrampa && campoTrampa.value.trim() !== '') {
      console.warn("Detección Anti-Bot: Campo trampa honeypot completado.");
      mostrarAlerta("Turno Registrado", "Su solicitud fue recibida y se encuentra en proceso de validación sanitaria.");
      return;
  }
  ```
- **Verificación:** Probar que los usuarios legítimos no vean ni completen el campo trampa y que bots automatizados queden neutralizados silenciosamente.

### B) Rate Limiting en Cliente
- **Ubicación:** Previo a `confirmarTurnoFirebase()`
- **Código a auditar:**
  ```javascript
  const RATE_LIMIT_TURNOS_KEY = 'hospital_rate_limit_turnos';

  function verificarRateLimitTurnos() {
      try {
          const ahora = Date.now();
          const ventanaMs = 5 * 60 * 1000; // 5 minutos
          const maxIntentos = 3;
          const registros = JSON.parse(sessionStorage.getItem(RATE_LIMIT_TURNOS_KEY) || '[]');
          const recientes = registros.filter(ts => (ahora - ts) < ventanaMs);

          if (recientes.length >= maxIntentos) {
              const espera = Math.ceil((ventanaMs - (ahora - recientes[0])) / 1000);
              return { bloqueado: true, esperaSegundos: espera > 0 ? espera : 1 };
          }

          recientes.push(ahora);
          sessionStorage.setItem(RATE_LIMIT_TURNOS_KEY, JSON.stringify(recientes));
          return { bloqueado: false, esperaSegundos: 0 };
      } catch (_) {
          return { bloqueado: false, esperaSegundos: 0 };
      }
  }
  ```

### C) Trazabilidad de `turnoId` en Colección `/disponibilidad`
- **Ubicación:** Al crear el slot determinista en `confirmarTurnoFirebase()` y `confirmarHorarioCitacionPaciente()`
- **Cambio:** Agregar `turnoId: turnoId` y `turnoId: citaId` al objeto guardado en `disponibilidad/{slotId}`.
- **Motivo de seguridad:** Requerido por la regla de Firestore `isSlotLiberablePorPaciente()` para verificar atómicamente con `getAfter()` que el slot solo sea eliminable por el paciente que canceló el turno correspondiente.

---

## 3. Utilidades de Notificación (`js/ui.js`)

- **Cambio:** Despacho seguro de correos vía Cloud Function en lugar de SDK cliente:
  ```javascript
  import { functionsInstancia, httpsCallable } from "./firebase.js";

  export async function enviarCorreoNotificacion(templateId, templateParams) {
      if (!templateParams || !templateParams.email_destino) return;
      try {
          const fnEnviar = httpsCallable(functionsInstancia, 'enviarNotificacionTurno');
          await fnEnviar({ templateId, templateParams });
      } catch (e) {
          console.warn("Aviso: Notificación por correo diferida o no disponible:", e.message || e);
      }
  }
  ```
- **Verificación:** Probar que la Cloud Function `enviarNotificacionTurno` responda correctamente en Firebase sin fallar ante ausencia de claves de EmailJS en staging/demo.

---

## 4. Pipeline de Seguridad (`.github/workflows/seguridad.yml`)

- **Cambio:** Remover `|| true` de los pasos de auditoría de paquetes:
  ```yaml
  - name: Auditoría de dependencias (Root)
    run: |
      npm i --package-lock-only --legacy-peer-deps
      npm audit --audit-level=high

  - name: Auditoría de dependencias (Cloud Functions)
    run: |
      cd functions
      npm i --package-lock-only --legacy-peer-deps
      npm audit --audit-level=high
  ```
- **Verificación:** Correr `npm audit --audit-level=high` previamente en local para confirmar que no existan vulnerabilidades altas que rompan el CI.

---

## 5. Limpieza de Archivos Obsoletos (`archivo/legacy/`)

- `archivo/legacy/admin.js` y `archivo/legacy/utils.js` son respaldos históricos anteriores a la modularización de la aplicación.
- Se debe ejecutar `git rm -r --cached archivo/` en una sesión de mantenimiento general para desvincularlos definitivamente del árbol de Git, respetando la regla existente en `.gitignore`.
