# Sistema Hospitalario y Gestión de Turnos Online - Hospital Teodoro J. Schestakow

Sistema integral de reserva de turnos para pacientes, gestión administrativa y **Historia Clínica Electrónica (HCE)** inmutable y trazable (conforme a la Ley 26.529 de Derechos del Paciente) del **Hospital Teodoro J. Schestakow** (San Rafael, Mendoza).

Desarrollado como prototipo para el **Foro Tecnológico de Ingeniería, Innovación y Desarrollo** (UTN - Facultad Regional San Rafael), optimizado al 100% para operar con servicios gratuitos en **Firebase Spark**.

---

## 🛠️ Stack Tecnológico

- **Frontend**: HTML5 semántico, Tailwind CSS (vía CDN), Vanilla JavaScript modular (ES Modules).
- **Base de Datos y Seguridad**: **Firebase Cloud Firestore** (Spark Plan).
  - Reglas de seguridad estrictas `firestore.rules` con modelo *Deny by Default*.
  - Colección de disponibilidad sin colisiones (`disponibilidad/{slotId}`).
  - Catálogo público desacoplado (`medicos_publicos/{uid}`).
- **Autenticación**: **Firebase Authentication**.
  - Personal institucional con email/contraseña y control de roles por perfil verificado (`usuarios/{uid}`).
  - Cierre automático de sesión tras 15 minutos de inactividad médica.
- **Historia Clínica e Interoperabilidad**:
  - Almacenamiento desacoplado e inmutable en `pacientes/{pacienteId}/consultas/{consultaId}`.
  - Esquema de rectificación firmado sin mutación histórica.
  - Mapeo semántico al estándar internacional **HL7® FHIR® R4** ([ver especificación](docs/FHIR.md)).
  - Documentación de arquitectura clínica y legal ([ver arquitectura](docs/HISTORIA_CLINICA.md)).
- **Servicios Adicionales Gratuitos**:
  - **EmailJS**: Notificaciones automáticas por correo de confirmación y cancelación.
  - **SheetJS (xlsx)**: Exportación de planillas de turnos para recepción.

---

## 📁 Estructura del Repositorio

```text
├── index.html                   # Portal público para pacientes (reserva online, consulta y cancelación)
├── panel.html                   # Portal institucional con login y vistas por rol (Recepción, Consultorio, Admin)
├── firestore.rules              # Reglas de seguridad declarativas con RBAC e inmutabilidad estricta
├── firebase.json                # Configuración de Hosting con cabeceras de seguridad CSP y lista de exclusión
├── PLAN.md                      # Plan de auditoría y seguimiento de tareas
├── README.md                    # Documentación técnica general
├── package.json                 # Dependencias y suites de testing local (Node.js test runner)
├── css/
│   └── estilos.css              # Animaciones, estilos de interfaz y reglas @media print para HCE
├── img/                         # Isologotipos y recursos visuales
├── js/
│   ├── firebase-config.js       # Inicialización del SDK de Firebase, Auth y Firestore
│   ├── utils.js                 # Modales, alertas, sanitización y notificaciones
│   ├── publico.js               # Lógica del portal de turnos para pacientes
│   └── admin.js                 # Lógica médica, Historia Clínica inmutable, Recepción y Administración
├── docs/
│   ├── HISTORIA_CLINICA.md      # Arquitectura de datos clínicos, diagrama Mermaid y matriz RBAC
│   └── FHIR.md                  # Mapeo a recursos estándar HL7 FHIR Release 4
├── scripts/
│   ├── migrar-historias.js      # Script idempotente para migrar evoluciones históricas de turnos a HCE
│   └── seed-demo-pacientes.js   # Generador de 10 pacientes ficticios con consultas y rectificaciones
├── tests/
│   └── firestore-rules.test.js  # Pruebas automatizadas de reglas de seguridad Firestore
└── .github/workflows/
    ├── test-rules.yml           # CI en GitHub Actions con Firebase Firestore Emulator (Java 17)
    └── firebase-deploy.yml      # CD automático en Firebase Hosting
```

---

## 🔒 Arquitectura de Seguridad y Confidencialidad Médica

1. **Denegar por Defecto (`firestore.rules`)**:
   - Todo documento o subcolección no autorizada expresamente tiene `allow read, write: if false;`.
2. **Acceso de Pacientes Impredecible**:
   - No hay listado público de turnos. El paciente accede a su comprobante únicamente si conoce el ID largo criptográfico (`crypto.getRandomValues`, 20+ caracteres).
3. **Reserva sin Colisiones**:
   - Los turnos se asocian a un slot determinista `disponibilidad/{medicoUid_fecha_hora}` mediante transacciones atómicas `writeBatch`.
4. **Intangibilidad de la Historia Clínica (Ley 26.529)**:
   - Las consultas médicas en `pacientes/{pacienteId}/consultas/{consultaId}` tienen `allow update: if false;` y `allow delete: if false;`.
   - Las enmiendas o correcciones se asientan como nuevas consultas con `corrige: idOriginal`.
5. **Acceso de Emergencia ("Romper el Vidrio")**:
   - Un médico puede habilitar el acceso a un paciente no agendado justificando el motivo en el modal de emergencia. Dicha acción genera automáticamente un pase de acceso y un registro inmutable en `auditoria/{id}`.
6. **Desconexión por Inactividad**:
   - Cierre automático de sesión médica tras 15 minutos sin interacción del usuario.

---

## 🧪 Pruebas Automatizadas y Simulación

### 1. Ejecutar Pruebas Estáticas de Reglas
```bash
npm test
```

### 2. Simular Siembra de Pacientes Ficticios (Dry-Run)
```bash
node scripts/seed-demo-pacientes.js --dry-run
```

### 3. Verificar Script de Migración Histórica
```bash
node scripts/migrar-historias.js --dry-run
```

---

## 🚀 Despliegue en Firebase Hosting (Spark Plan)

1. Autenticarse en Firebase CLI:
   ```bash
   npx firebase login
   ```
2. Desplegar reglas y portal estático:
   ```bash
   npx firebase deploy --only firestore:rules,hosting
   ```