# Sistema de Turnos y Gestión Hospitalaria - Hospital Teodoro J. Schestakow

Plataforma web para autogestión de turnos médicos, admisión hospitalaria, historias clínicas inmutables y analítica operativa.

---

> ### 🏥 Acceso al Sistema en Vivo
> **[Ingresar a la Plataforma Web (GitHub Pages)](https://ignacio-helbas.github.io/sistema-turnos-schestakow/)**
>
> *Aviso: Este es un proyecto universitario experimental con fines académicos. Por favor, no ingrese datos personales ni de salud reales.*

---

## Captura de Pantalla

[COMPLETAR: Insertar imagen o GIF demostrativo de la pantalla principal, por ejemplo: `![Pantalla Principal](docs/capturas/inicio.png)`]

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
- **Historia Clínica Electrónica inmutable:** Cumplimiento de trazabilidad legal donde las consultas no pueden modificarse ni eliminarse; las rectificaciones se registran como enmiendas vinculadas a la consulta original.
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

### 3. Ejecutar las pruebas automatizadas
Para validar las reglas de seguridad y los cálculos del módulo de métricas:
```bash
npm test
```

---

## Estado del Proyecto y Próximos Pasos

- **Estado actual:** Prototipo completo, funcional y probado para presentación en el Foro Tecnológico de Innovación y Desarrollo.
- **Próximos pasos:** [COMPLETAR: Detallar futuras mejoras previstas, por ejemplo: integración con sistemas hospitalarios existentes o turnos para estudios complementarios].

---

## Autoría y Contexto Académico

- **Autor:** Ignacio Helbas - [COMPLETAR: Carrera / Especialidad / Contacto]
- **Institución:** Universidad Tecnológica Nacional - Facultad Regional San Rafael (UTN FRSR)
- **Ámbito:** [COMPLETAR: Cátedra, Proyecto Final o Foro Tecnológico de Ingeniería, Innovación y Desarrollo]

---

## Licencia

Este proyecto se distribuye bajo los términos de la Licencia MIT. Para más detalles, consulte el archivo [LICENSE](LICENSE).
