# Prototipo de demostración académica: sistema de turnos y gestión hospitalaria (caso de estudio)

Plataforma web para autogestión de turnos médicos, admisión hospitalaria, registro clínico protegido contra edición por reglas de seguridad y analítica operativa.

---

> ### Acceso al Sistema 
> **[Ingresar a la Plataforma Web (GitHub Pages)](https://ignacio-helbas.github.io/sistema-turnos-schestakow/)**
>
> *Aviso: Este es un proyecto universitario experimental con fines académicos. Por favor, no ingrese datos personales ni de salud reales.*

---

## Captura de Pantalla



---

## Funcionalidades por Perfil

El sistema cuenta con interfaces adaptadas a los distintos roles operativos de la institución:

### 1. Portal Público de Pacientes (`index.html`)
- **Reserva de turnos online:** Selección guiada por especialidad médica, profesional, fecha y horario disponible.
- **Identificador de turno:** Generación de un código único para preservar la privacidad del paciente sin exponer listados públicos.
- **Consulta y cancelación:** Consulta del estado de turnos agendados y cancelación inmediata mediante el código de turno.
- **Notificaciones automáticas:** Confirmación y comprobante enviados por correo electrónico.

### 2. Módulo de Recepción (`panel.html`)
- **Admisión en sala de espera:** Registro de llegada y cambio de estado del paciente en tiempo real.
- **Filtros rápidos:** Visualización segmentada por estado (Todos, En Sala, Confirmados, Atendidos).
- **Asignación de turnos presenciales:** Registro en ventanilla con validación de datos demográficos, DNI y obra social.
- **Exportación de planillas:** Descarga del listado diario en formato Excel (`.xlsx`) para respaldo operativo.

### 3. Módulo de Consultorio Médico (`panel.html`)
- **Llamado de pacientes:** Notificación visual y atención de pacientes en espera.
- **Registro de atención clínica:** Carga de motivo de consulta, diagnóstico, tratamiento y registro de signos vitales (presión arterial, frecuencia cardíaca, temperatura, saturación, peso y talla).
- **Historia Clínica Electrónica:** Registro clínico protegido contra edición por reglas de seguridad donde las consultas no pueden modificarse ni eliminarse desde la aplicación; las rectificaciones se registran como enmiendas vinculadas a la consulta original.
- **Ficha clínica del paciente:** Consulta de antecedentes, alergias y medicación habitual.
- **Acceso de emergencia:** Mecanismo de apertura excepcional de historia clínica con justificación obligatoria y registro de auditoría.
- **Impresión médica:** Generación de comprobante impreso formateado para el paciente.

### 4. Módulo de Administración y Métricas (`panel.html`)
- **Panel de control institucional:** Monitoreo global de la actividad del hospital.
- **Métricas de rendimiento:** Gráficos estadísticos de demanda por especialidad, ausentismo, tiempos de espera y tiempos de consulta médica.
- **Semáforos de calidad:** Indicadores visuales de demoras y volumen de atención según umbrales predefinidos.
- **Gestión de personal:** Alta, baja y administración de usuarios institucionales y asignación de roles.
- **Herramientas de demostración:** Controles para inyección de datos del foro universitario, catálogo de médicos de prueba y reinicio seguro del entorno de simulación.

---

## Tecnologías Utilizadas

- **Frontend:** HTML5 semántico, CSS3, Tailwind CSS (vía CDN), Vanilla JavaScript modular (ES Modules).
- **Tipografías:** Public Sans e IBM Plex Sans para lectura de interfaz; IBM Plex Mono para códigos y datos numéricos tabulares.
- **Base de Datos y Seguridad:** Google Firebase Cloud Firestore (Plan Spark) con reglas de seguridad declarativas bajo el principio de *Denegar por Defecto*.
- **Autenticación:** Firebase Authentication (correo y contraseña, gestión de roles en Firestore y cierre automático por inactividad tras 15 minutos).
- **Librerías auxiliares:**
  - `Chart.js` (alojada localmente en `/vendor/` para funcionamiento seguro e independiente de CDN).
  - `SheetJS` para generación y descarga de planillas Excel.
  - `EmailJS` para el despacho de correos electrónicos informativos.
- **Calidad y Pruebas:** Node.js Test Runner para pruebas automatizadas de reglas de Firestore y algoritmos de métricas.

---

## Estructura del Proyecto

```text
├── index.html               # Portal público para pacientes (solicitud y consulta de turnos)
├── panel.html               # Panel institucional con login y vistas según rol
├── login.html               # Redirección complementaria al panel institucional
├── firestore.rules          # Reglas de seguridad y control de acceso en Firestore
├── firebase.json            # Configuración de despliegue y cabeceras de seguridad
├── package.json             # Scripts de prueba y configuración del entorno de pruebas
├── LICENSE                  # Licencia de código abierto MIT
├── .gitignore               # Exclusiones de archivos del sistema y dependencias
├── css/
│   └── estilos.css          # Estilos institucionales, variables tipográficas y reglas de impresión
├── js/
│   ├── firebase-config.js   # Inicialización y configuración de Firebase
│   ├── firebase.js          # Control de autenticación y sesiones
│   ├── publico.js           # Lógica del portal público de pacientes
│   ├── panel.js             # Orquestador principal del panel y control de vistas
│   ├── recepcion.js         # Operatoria de recepción y sala de espera
│   ├── consultorio.js       # Atención médica e Historia Clínica Electrónica
│   ├── admin.js             # Gestión institucional y personal
│   ├── metricas.js          # Cálculos estadísticos y algoritmos de rendimiento
│   ├── metricas-ui.js       # Gráficos con Chart.js
│   ├── ui.js                # Modales, alertas y notificaciones
│   └── utils.js             # Utilidades de formato y sanitización
├── vendor/
│   └── chart.umd.min.js     # Librería Chart.js alojada localmente
├── img/                     # Recursos gráficos e imágenes del hospital
├── docs/                    # Documentación técnica, legal y clínica (FHIR, HCE, PLAN)
├── tests/                   # Pruebas automatizadas de reglas y métricas
└── archivo/                 # Respaldos de código y material histórico
```

---

## Cómo Probar el Proyecto en Local

### 1. Clonar el repositorio
```bash
git clone https://github.com/Ignacio-Helbas/sistema-turnos-schestakow.git
cd sistema-turnos-schestakow
```

### 2. Ejecutar la aplicación web
Al ser una aplicación web estática modular con módulos JavaScript (`type="module"`), debe servirse a través de un servidor HTTP local (por restricciones de seguridad del navegador con el protocolo `file://`):

- **Opción A (VS Code):** Abrir la carpeta y utilizar la extensión **Live Server**.
- **Opción B (Python):**
  ```bash
  python -m http.server 8000
  ```
- **Opción C (Node.js):**
  ```bash
  npx serve .
  ```
Abrir en el navegador: `http://localhost:8000` (o el puerto indicado).

### 3. Modo Demostración Institucional (Foro Académico)
Para habilitar las herramientas de demostración e inyección de datos de prueba (generación de turnos históricos, médicos ficticios y limpieza de datos simulados) en el panel de control administrativo, acceda con el rol de **Administración** añadiendo el parámetro `?dev=1` en la URL:
```text
http://localhost:8000/panel.html?dev=1
```
*(Sin el parámetro `?dev=1`, los botones de inyección y reinicio permanecen ocultos para mantener la interfaz operativa limpia).*

### 4. Ejecutar las pruebas automatizadas
Para validar las reglas de seguridad y los cálculos del módulo de métricas:
```bash
npm test
```

---

## Estado del Proyecto y Próximos Pasos

- **Estado actual:** Prototipo funcional de demostración académica, con pruebas automatizadas parciales.
- **Próximos pasos:** [Integración con sistemas hospitalarios existentes o turnos para estudios complementarios].

## Alcance y Limitaciones

> [!IMPORTANT]
> **Aviso de Prototipo Demostrativo Académico:**
> 1. Este proyecto es un **prototipo experimental desarrollado exclusivamente con fines educativos** para el Foro Tecnológico de la Universidad Tecnológica Nacional (Facultad Regional San Rafael).
> 2. El Hospital Teodoro J. Schestakow se toma como **caso de estudio arquitectónico y de interfaz**; **no es una plataforma oficial ni autorizada** de dicha institución sanitaria ni del Ministerio de Salud.
> 3. **No está validado clínica, técnica ni legalmente** para su uso con pacientes reales, historias clínicas vivas ni emergencias médicas.
> 4. Todos los datos incluidos en el repositorio, pruebas y generadores de simulación son **estrictamente sintéticos y ficticios**.
> 
> **Cobertura actual de pruebas automatizadas:**
> - **Qué cubren las pruebas actuales:** Análisis estático de sintaxis y directivas de seguridad en `firestore.rules`, algoritmos de cálculo de métricas de espera y consulta clínica (sin valores NaN), sanitización y filtrado de centros de salud, generación y auto-verificación de códigos Base62 / códigos QR, y componente interactivo del calendario hospitalario con feriados nacionales.
> - **Qué NO cubren las pruebas actuales:** Pruebas dinámicas contra el emulador en vivo de Firebase (requieren entorno con Java JRE y Firebase CLI), pruebas end-to-end de interfaz con navegador, pruebas de carga concurrente y validación de interoperabilidad con historias clínicas oficiales.

### Limitaciones conocidas del prototipo

1. **Lectura de consultas clínicas por Administración:** En el prototipo, el perfil con rol `Administración` cuenta con permisos de lectura sobre las consultas de historia clínica mediante una vista explícita de supervisión académica. En un sistema hospitalario en producción, el personal administrativo no debe tener acceso a las evoluciones clínicas de los pacientes.
2. **Liberación de slots de disponibilidad por clientes anónimos:** La colección `/disponibilidad` permite el borrado de documentos de slots por usuarios no autenticados para posibilitar la liberación de horarios cuando el paciente cancela un turno desde el navegador sin intermediación de un backend. En producción, la reserva y cancelación deben gestionarse mediante Cloud Functions (Firebase Admin SDK) o App Check.
3. **Consulta de turnos por ID de documento:** El portal público permite la lectura puntual de un documento en `/turnos/{turnoId}` sin autenticación previa siempre que se proporcione el ID del turno (empleado para comprobante y cancelación). En un entorno asistencial definitivo, se requiere validar identidad del paciente (ej. autenticación, clave ciudadana o tokens de un solo uso).
4. **Identificadores didácticos en simulación:** Los scripts de prueba y botones de demostración para el foro generan registros con identificadores predecibles (prefijo `TURNO_DEMO_` y pacientes sintéticos) que no deben coexistir con información operativa real.
5. **Fallback de rol en cliente para usuarios sin asignación:** En la capa cliente (`js/firebase.js`), si un usuario autenticado carece de perfil en `/usuarios` o de custom claim, el frontend asume por defecto `"Recepción"` en su estado local de sesión. Aunque las reglas de seguridad de Firestore bloquean cualquier escritura o lectura restringida al verificar contra el documento real o claim en el servidor, en la interfaz visual dicho usuario observaría la vista de mostrador con denegaciones de permisos en sus operaciones.
6. **Validación de rol en registros de auditoría:** Las reglas de seguridad de la colección `/auditoria` comprueban estrictamente que `actorUid` coincida con el usuario autenticado (`request.auth.uid`), pero no contrastan que el campo descriptivo `actorRol` coincida de forma unívoca con el rol almacenado en el perfil. En una arquitectura sin servidor de backend intermedio, un cliente autenticado podría teóricamente escribir un rol informativo discordante en su propio registro de auditoría, si bien su UID real e inalterable queda siempre asentado con marca de tiempo del servidor.

---

## Autoría y Contexto Académico

- **Autor:** Ignacio Helbas - [Carrera: Ingenieria / Especialidad: Electromecanica / Contacto: nachohelbas@gmail.com]
- **Institución:** Universidad Tecnológica Nacional - Facultad Regional San Rafael (UTN FRSR)
- **Ámbito:** [Foro Tecnológico de Ingeniería, Innovación y Desarrollo]

---

## Licencia

Este proyecto se distribuye bajo los términos de la Licencia MIT. Para más detalles, consulte el archivo [LICENSE](LICENSE).
