# Plan de Auditoría y Remediación - Sistema de Turnos Hospital Schestakow

## Estado Actual
- **Fase**: Iniciando Fase 1 (Seguridad).
- **Repositorio**: `sistema-turnos-schestakow`
- **Proyecto Firebase**: `sistema-turnos-utn`
- **Diagnóstico preliminar completado**: Se identificaron 13 problemas priorizados en Seguridad, Integridad de Datos, Arquitectura y Documentación.

---

## Lista de Problemas Encontrados y Plan de Remediación

### Prioridad 1: SEGURIDAD

- [x] **1. Funciones destructivas y de prueba expuestas en el cliente con correo superadmin hardcodeado**
  - **Archivo y Línea**: `js/logica.js` (L153, L1372-L1415, L1417-L1486)
  - **Riesgo**: Crítico. `limpiarBaseDeDatos()` e `inyectarMedicosDePrueba()` están expuestas globalmente en `window`. Cualquier usuario puede invocar desde la consola y borrar colecciones completas en Firestore. Hay validación de superadmin por correo hardcodeado (`nachohelbas@gmail.com`).
  - **Solución**: Mover la lógica de limpieza e inyección a Cloud Functions callable protegidas por rol administrativo (`request.auth.token.rol == 'Administración'`). Eliminar las funciones y el correo hardcodeado del frontend.

- [x] **2. Falta de implementación de Cloud Functions (`functions/index.js`) y configuración en `firebase.json`**
  - **Archivo y Línea**: `functions/` (solo existe `package.json`, falta `index.js`), `firebase.json` (no declara `"functions"`)
  - **Riesgo**: Crítico. El frontend ya invoca callables (`crearTurnoPublico`, `buscarTurnoPorCodigo`, `cancelarTurnoConCodigo`, `guardarUsuarioAdmin`), pero no existen en el backend, dejando el sistema inoperativo o expuesto a fallos.
  - **Solución**: Desarrollar `functions/index.js` con todas las funciones callables requeridas (`crearTurnoPublico`, `buscarTurnoPorCodigo`, `cancelarTurnoConCodigo`, `guardarUsuarioAdmin`, `limpiarBaseDeDatos`, `inyectarMedicosDePrueba`, y `asignarRolAdminInicial`). Configurar `firebase.json` con la sección `functions`.

- [x] **3. Ausencia de Autenticación Anónima para Pacientes en el Portal Público**
  - **Archivo y Línea**: `js/logica.js` (L23, L531-560)
  - **Riesgo**: Alto. Las reservas públicas se realizan sin contexto de autenticación Firebase Auth, lo que impide vincular y controlar turnos por UID de paciente y facilita ataques automatizados / spam.
  - **Solución**: Integrar `signInAnonymously(auth)` en la inicialización pública para que cada paciente opere con un `uid` anónimo seguro que pueda ser verificado en las Cloud Functions y reglas.

- [x] **4. Reglas de Firestore (`firestore.rules`) no usan Custom Claims y realizan lecturas adicionales**
  - **Archivo y Línea**: `firestore.rules` (L11-L37)
  - **Riesgo**: Alto. `hasRole(rol)` valida con `get(/databases/$(database)/documents/usuarios/$(request.auth.uid))` en cada consulta en vez de validar `request.auth.token.rol`.
  - **Solución**: Reescribir `firestore.rules` utilizando `request.auth.token.rol` directamente para validar roles de administración, médico y recepción, manteniendo la regla de cierre por defecto `allow read, write: if false;`.

- [x] **5. Puerta trasera `loginAs(role)` y persistencia insegura de sesión en `localStorage`**
  - **Archivo y Línea**: `js/logica.js` (L347-L352, L370, L375)
  - **Riesgo**: Alto. `loginAs(role)` permite a cualquier usuario cambiar a la vista administrativa o médica desde consola. `sesionHospitalActiva` en `localStorage` se utiliza como única verdad para la interfaz.
  - **Solución**: Eliminar `loginAs(role)`. Gestionar la autenticación exclusivamente a través del SDK de Firebase Auth (`onAuthStateChanged` y `getIdTokenResult()`) para obtener los claims reales antes de permitir acceso a paneles protegidos.

- [x] **6. Gestión insegura de contraseñas de usuarios en el cliente**
  - **Archivo y Línea**: `js/logica.js` (L1053-L1106), `index.html` (L541-L552)
  - **Riesgo**: Alto. El formulario de administración manipula contraseñas temporales en el cliente y las envía en payloads.
  - **Solución**: Centralizar la creación y actualización de usuarios del staff en la Cloud Function `guardarUsuarioAdmin` con `admin.auth().createUser` / `updateUser` y `setCustomUserClaims`, promoviendo el reseteo por email institucional seguro (`sendPasswordResetEmail`).

- [x] **7. Claves de Firebase y EmailJS expuestas sin restricción de dominio**
  - **Archivo y Línea**: `js/firebase-config.js` (L25), `js/logica.js` (L13, L78-81)
  - **Riesgo**: Medio. La clave web de Firebase y las credenciales de EmailJS son accesibles en el código del navegador y podrían usarse desde orígenes no autorizados si no están restringidas en consola.
  - **Solución**: Documentar en "Pendientes del usuario" las instrucciones exactas para restringir la API Key en Google Cloud Console y EmailJS por dominio HTTP Referer.

---

### Prioridad 2: INTEGRIDAD DE DATOS

- [x] **8. Concurrencia y riesgo de turnos duplicados (Race conditions)**
  - **Archivo y Línea**: `js/logica.js` (L517-L560), `functions/index.js`
  - **Riesgo**: Alto. Si dos pacientes intentan reservar el mismo profesional, fecha y horario simultáneamente, pueden generarse turnos duplicados.
  - **Solución**: Ejecutar la creación de turnos dentro de transacciones de Firestore (`transaction.get` y `transaction.set`) en `crearTurnoPublico` para asegurar unicidad absoluta de médico + fecha + horario.

- [x] **9. Validación insuficiente de entradas y formatos**
  - **Archivo y Línea**: `js/logica.js` (L523-L530), `functions/index.js`
  - **Riesgo**: Medio. Posibilidad de ingresar datos con formatos inválidos (DNI no numérico, fechas en fines de semana o pasadas, nombres vacíos o excesivamente largos).
  - **Solución**: Validar estrictamente en cliente y en las Cloud Functions: formato numérico y longitud de DNI y teléfono, formato de email, y que la fecha corresponda a días hábiles futuros.

- [x] **10. Manejo de errores de red y estados asíncronos**
  - **Archivo y Línea**: `js/logica.js` (diversas llamadas async)
  - **Riesgo**: Bajo/Medio. Falta de feedback al usuario si la red se corta durante una llamada a Firebase.
  - **Solución**: Implementar feedback visual de carga y manejo robusto de excepciones de red con alertas amigables en todos los flujos.

---

### Prioridad 3: ARQUITECTURA

- [x] **11. Monolito HTML: index.html contiene todas las vistas en un solo archivo**
  - **Archivo y Línea**: `index.html` (L73-L343)
  - **Riesgo**: Medio. Expone la estructura del panel de administración y recepción a cualquier paciente en internet.
  - **Solución**: Desacoplar en 3 páginas HTML con idéntico diseño Tailwind:
    1. `index.html`: Portal público de turnos.
    2. `login.html`: Pantalla de inicio de sesión para el personal de salud.
    3. `panel.html`: Panel interno de gestión (Recepción, Consultorio, Administración) protegido por guard de sesión.

- [x] **12. Monolito JavaScript: `logica.js` monolítico de 1500 líneas**
  - **Archivo y Línea**: `js/logica.js`
  - **Riesgo**: Medio. Dificultad para mantener, auditar y testear. Contaminación del scope global `window`.
  - **Solución**: Reorganizar en módulos ES limpios:
    - `js/firebase-config.js`: Configuración de Firebase, Auth, Firestore y Functions.
    - `js/utils.js`: Notificaciones, modales, sanitización y formateo.
    - `js/publico.js`: Lógica del portal de pacientes.
    - `js/admin.js`: Lógica del panel interno para Recepción, Médicos y Administración.

---

### Prioridad 4: DOCUMENTACIÓN

- [ ] **13. Documentación inexistente (README.md vacío)**
  - **Archivo y Línea**: `README.md` (27 bytes)
  - **Riesgo**: Bajo/Operativo. Impide que otros desarrolladores o evaluadores puedan desplegar y operar el sistema.
  - **Solución**: Crear un `README.md` detallado con arquitectura, variables de entorno, proceso de deploy de Hosting/Rules/Functions y configuración de roles con Custom Claims.

---

## Pendientes del Usuario (Requieren tu acción en consolas)
1. **Restricción de API Key de Firebase**:
   - Ir a [Google Cloud Console > Credenciales](https://console.cloud.google.com/apis/credentials?project=sistema-turnos-utn).
   - Editar la clave `AIzaSyAghXQKrYy6EJGD5IqEdO4c_E-ntozUmz8`.
   - Restringir por "Referenciadores HTTP" a tu dominio (ej. `sistema-turnos-utn.firebaseapp.com`, `sistema-turnos-utn.web.app` y `localhost` para pruebas locales).
2. **Restricción de EmailJS**:
   - Ir al dashboard de EmailJS > Account > Security.
   - Habilitar "Allow EmailJS API calls only from these domains" y agregar tus dominios de producción y desarrollo.
3. **Despliegue de Cloud Functions**:
   - Asegurarse de tener el plan "Blaze" (Pay as you go) habilitado en Firebase para poder desplegar Cloud Functions de Node.js.
   - Ejecutar `firebase deploy --only functions` una vez commiteado el código.

---

## Próximo Paso Exacto
- Ejecutar el Problema 2 y 1: Crear `functions/index.js` con las Cloud Functions callables seguras (`crearTurnoPublico`, `buscarTurnoPorCodigo`, `cancelarTurnoConCodigo`, `guardarUsuarioAdmin`, `limpiarBaseDeDatos`, `inyectarMedicosDePrueba`), configurar `firebase.json` para soportar `functions`, y remover las funciones destructivas del cliente.
