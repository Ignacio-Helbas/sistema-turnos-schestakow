# Guía de Restricción de API Key en Google Cloud Console

**Proyecto:** `sistema-turnos-utn`  
**Clave de API afectada:** `AIzaSyAghXQKrYy6EJGD5IqEdO4c_E-ntozUmz8`  
**Objetivo:** Prevenir el uso de la API Key fuera del dominio oficial del hospital y restringir las APIs de Google Cloud a las estrictamente necesarias.

---

## 1. Contexto de Seguridad
En las aplicaciones web que utilizan Firebase Web SDK, la `apiKey` viaja por diseño en el bundle de JavaScript que se descarga en el navegador del usuario. Aunque esta clave por sí sola no otorga acceso administrativo (el control de acceso lo ejecutan las reglas de Firestore y Firebase Auth), una clave sin restricciones puede ser copiada por terceros para:
- Consumir cuotas del proyecto desde dominios no autorizados.
- Realizar peticiones a APIs de GCP no utilizadas por el sistema (ej. Compute Engine, BigQuery, Maps).

---

## 2. Pasos para Configurar las Restricciones en Google Cloud Console

### Paso 1: Ingresar a la Consola de Credenciales
1. Abrí tu navegador e ingresá a [Google Cloud Console - Credenciales](https://console.cloud.google.com/apis/credentials).
2. En la barra superior, asegurate de tener seleccionado el proyecto **`sistema-turnos-utn`**.

### Paso 2: Localizar la API Key
1. En la tabla **Claves de API** (*API Keys*), buscá la clave cuyo valor comience con `AIzaSyAghXQ...` (habitualmente denominada *"Browser key (auto created by Firebase)"* o similar).
2. Hacé clic sobre el nombre de la clave para abrir su panel de edición.

### Paso 3: Configurar Restricción de Aplicación (HTTP Referrers)
1. En la sección **Restricciones de clave** (*Key restrictions*), seleccioná la opción:
   - **Sitios web (referencias HTTP)** (*Websites / HTTP referrers*).
2. En **Restricciones de sitios web**, hacé clic en **Agregar un elemento** (*Add an item*) y cargá los siguientes orígenes permitidos:
   - `https://sistema-turnos-utn.web.app/*`
   - `https://sistema-turnos-utn.firebaseapp.com/*`
   *(Opcional: Si realizás pruebas locales en tu máquina, podés añadir temporalmente `http://localhost:*` y `http://127.0.0.1:*`)*.

### Paso 4: Configurar Restricción de APIs
1. En la sección **Restricciones de API** (*API restrictions*), seleccioná la opción:
   - **Restringir clave** (*Restrict key*).
2. En el menú desplegable, marcá **únicamente** las siguientes APIs esenciales:
   - ✅ **Identity Toolkit API** *(Necesaria para inicio de sesión, registro y autenticación)*
   - ✅ **Cloud Firestore API** *(Necesaria para consultas y base de datos en tiempo real)*
   - ✅ **Firebase App Check API** *(Necesaria para verificación de integridad de dispositivos en Fase 4)*
   - ✅ **Token Service API** *(Necesaria para refresco de tokens de Firebase Auth)*
3. Dejá desmarcada cualquier otra API que no forme parte del sistema hospitalario.

### Paso 5: Guardar y Verificar
1. Hacé clic en el botón **Guardar** (*Save*) al pie de la página.
2. **Tiempo de propagación:** Los cambios pueden demorar entre 3 y 5 minutos en propagarse globalmente en la infraestructura de Google Cloud.
3. Para verificar: Abrí `https://sistema-turnos-utn.web.app/` en una ventana de incógnito y confirmá que el portal cargue y permita interactuar con normalidad.
