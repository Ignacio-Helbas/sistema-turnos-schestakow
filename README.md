# Sistema de Gestión y Turnos Online - Hospital Teodoro J. Schestakow

Sistema web integral para la reserva de turnos de pacientes y gestión clínica-administrativa del Hospital Teodoro J. Schestakow (San Rafael, Mendoza). Desarrollado en conjunto como proyecto académico para la UTN - Facultad Regional San Rafael.

---

## 🛠️ Stack Tecnológico

- **Frontend**: HTML5 semántico, Tailwind CSS (vía CDN), Vanilla JavaScript modular (ES Modules).
- **Backend / BaaS**: Firebase Suite (Proyecto: `sistema-turnos-utn`).
  - **Firebase Authentication**: Inicio de sesión de personal con contraseñas hasheadas y autenticación anónima para pacientes.
  - **Cloud Firestore**: Base de datos NoSQL documental en tiempo real protegida por `firestore.rules` con Custom Claims.
  - **Cloud Functions for Firebase** (Node.js 18): Backend serverless para operaciones críticas (reserva transaccional de turnos, consulta por código, cancelación segura, gestión de usuarios de staff y herramientas de administración).
- **Servicios Adicionales**:
  - **EmailJS**: Notificaciones automáticas por correo de confirmación y cancelación.
  - **SheetJS (xlsx)**: Exportación de agendas de turnos a planillas Excel.

---

## 📁 Estructura del Repositorio

```text
├── index.html                   # Portal público para pacientes (reserva online, consulta y cancelación)
├── login.html                   # Portal de acceso seguro para el personal institucional
├── panel.html                   # Panel interno unificado (Recepción, Consultorio, Administración)
├── firestore.rules              # Reglas de seguridad de Firestore basadas en Custom Claims
├── firebase.json                # Configuración de Hosting, Functions y Firestore
├── PLAN.md                      # Plan de auditoría y seguimiento de problemas priorizados
├── README.md                    # Documentación técnica y guía de despliegue
├── css/
│   └── estilos.css              # Estilos complementarios y animaciones UI
├── img/                         # Isologotipos y fondos de la institución
├── js/
│   ├── firebase-config.js       # Inicialización del SDK de Firebase, Auth, DB y Functions
│   ├── utils.js                 # Modales, alertas, sanitización HTML y notificaciones EmailJS
│   ├── publico.js               # Lógica del portal público y llamadas a Cloud Functions
│   └── admin.js                 # Lógica de Recepción, Consultorio, Administración y Auth Guard
├── functions/
│   ├── package.json             # Dependencias del backend (firebase-admin, firebase-functions)
│   └── index.js                 # Implementación de Cloud Functions callables seguras
└── .github/workflows/
    └── firebase-deploy.yml      # CI/CD automático para despliegue en Firebase
```

---

## 🔒 Arquitectura de Seguridad e Integridad de Datos

1. **Sin credenciales en código cliente**: Todas las contraseñas residen hasheadas en Firebase Auth.
2. **Roles con Custom Claims**:
   - Los roles (`Administración`, `Médico`, `Recepción`) se validan directamente en el token criptográfico mediante `request.auth.token.rol` en `firestore.rules`.
   - Cierre estricto por defecto: Cualquier ruta no especificada en Firestore es denegada (`allow read, write: if false;`).
3. **Aislamiento de Pacientes**:
   - Los pacientes interactúan mediante sesiones anónimas (`signInAnonymously`).
   - Las reservas, búsquedas y cancelaciones se realizan exclusivamente mediante Cloud Functions (`crearTurnoPublico`, `buscarTurnoPorCodigo`, `cancelarTurnoConCodigo`), impidiendo el acceso directo a la colección `turnos`.
4. **Prevención de Duplicados (Race Conditions)**:
   - `crearTurnoPublico` ejecuta una **Transacción de Firestore** que garantiza que no se puedan reservar dos turnos para el mismo médico, fecha y horario simultáneamente.
5. **Funciones Administrativas Protegidas**:
   - `guardarUsuarioAdmin`, `limpiarBaseDeDatos` e `inyectarMedicosDePrueba` operan únicamente como Cloud Functions y verifican el claim `rol === 'Administración'` antes de cualquier modificación.
6. **Desacoplamiento Arquitectónico**:
   - `index.html` expone únicamente la interfaz de pacientes.
   - `panel.html` cuenta con un Auth Guard que redirige automáticamente a `login.html` si no hay una sesión activa y verificada.

---

## 🚀 Despliegue en Firebase

### Requisitos Previos

1. [Node.js](https://nodejs.org/) (versión 18 recomendada).
2. [Firebase CLI](https://firebase.google.com/docs/cli) instalado globalmente:
   ```bash
   npm install -g firebase-tools
   ```
3. Plan **Blaze (Pay as you go)** habilitado en el proyecto de Firebase (requerido por Google Cloud para la ejecución de Cloud Functions con Node.js 18+).

### Paso 1: Autenticación en Firebase CLI

```bash
firebase login
```

### Paso 2: Instalar Dependencias de Backend

```bash
cd functions
npm install
cd ..
```

### Paso 3: Desplegar Reglas de Seguridad y Funciones

```bash
# Desplegar solo reglas de Firestore
firebase deploy --only firestore:rules

# Desplegar backend (Cloud Functions)
firebase deploy --only functions

# Desplegar frontend (Hosting)
firebase deploy --only hosting
```

O desplegar todo simultáneamente:
```bash
firebase deploy
```

---

## ⚙️ Configuración y Restricciones de APIs (Acción Manual Requerida)

### 1. Restricción de Dominio para la API Key de Firebase
1. Ingresá a [Google Cloud Console > Credenciales](https://console.cloud.google.com/apis/credentials?project=sistema-turnos-utn).
2. Seleccioná la clave pública del navegador (`Browser key` / `AIzaSyAghXQKrYy6EJGD5IqEdO4c_E-ntozUmz8`).
3. En **Restricciones de aplicaciones**, seleccioná **Referenciadores HTTP (sitios web)**.
4. Agregá tus dominios autorizados:
   - `https://sistema-turnos-utn.web.app/*`
   - `https://sistema-turnos-utn.firebaseapp.com/*`
   - `http://localhost:*` (para pruebas locales)
5. Guardá los cambios.

### 2. Restricción de Dominio para EmailJS
1. Ingresá al dashboard de [EmailJS](https://dashboard.emailjs.com/) > **Account** > **Security**.
2. Marcá la opción **Allow EmailJS API calls only from these domains**.
3. Agregá tu dominio de producción de Firebase Hosting y tu entorno local.

### 3. Asignación del Primer Administrador (SuperAdmin)
Para inicializar el primer usuario con rol de administración:
1. Creá tu cuenta en Firebase Authentication mediante `login.html` o la consola de Firebase.
2. Asegurate de que exista el documento correspondiente en `/usuarios/{uid}` con `rol: "Administración"`.
3. Al iniciar sesión en el portal, el sistema invocará automáticamente la Cloud Function `asignarRolAdminInicial` para emitir el Custom Claim `rol: "Administración"` en tu token de autenticación.

---

## 💻 Ejecución Local

Para probar el sitio localmente con cualquier servidor estático:
```bash
# Con extensión Live Server en VSCode o mediante npx:
npx serve .
```
Accedé a:
- Portal público: `http://localhost:3000/index.html`
- Acceso staff: `http://localhost:3000/login.html`
- Panel interno: `http://localhost:3000/panel.html`