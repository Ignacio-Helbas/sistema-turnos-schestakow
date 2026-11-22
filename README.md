# Sistema de Turnos y Gestión Hospitalaria

Plataforma web integral orientada a la digitalización, agilización y ordenamiento del flujo de atención hospitalaria, desde la autogestión de turnos por parte de los pacientes hasta la admisión asistencial en sala de espera, consultorios médicos y panel analítico de gestión.

---

> ### Acceso a la Plataforma
> **[Ingresar a la Plataforma Web](https://ignacio-helbas.github.io/sistema-turnos-schestakow/)**
>
> *Nota: Proyecto de caso de estudio universitario con fines académicos. Los datos presentados son sintéticos y de demostración.*

---

## Visión General del Sistema

La solución articula los distintos puntos de interacción institucional en una experiencia moderna, fluida y en tiempo real:

### 1. Portal Público de Pacientes
- **Autogestión de turnos online:** Reserva asistida por especialidad médica, profesional, fecha y franja horaria disponible.
- **Comprobante digital y Código QR:** Emisión de talón oficial de turno con código de verificación alfanumérico y código QR escaneable para validación instantánea.
- **Consulta y cancelación ágil:** Seguimiento del estado del turno y cancelación inmediata en caso de imprevistos.
- **Directorio de Centros de Salud:** Catálogo informativo georreferenciado con vías de contacto, mapas interactivos y servicios de los centros de salud zonales.

### 2. Módulo de Admisión y Recepción
- **Control de sala de espera en tiempo real:** Registro de arribo y seguimiento de pacientes en espera, confirmados y atendidos.
- **Admisión en mostrador:** Otorgamiento y confirmación de turnos presenciales con validación rápida de datos demográficos y obra social.
- **Reportes de asistencia:** Exportación de planillas de atención diaria en formato de hoja de cálculo para respaldo administrativo.

### 3. Consultorio de Atención Médica
- **Panel clínico especializado:** Gestión de la agenda del día y llamado directo de pacientes desde la sala de espera.
- **Historia Clínica Electrónica:** Registro seguro de evoluciones médicas, antecedentes, alergias, medicación habitual y signos vitales.
- **Gestión de interconsultas:** Solicitud y seguimiento de derivaciones clínicas entre diferentes especialidades hospitalarias.
- **Comprobantes e indicaciones:** Generación de resúmenes de atención médica formateados para el paciente.

### 4. Panel de Gestión y Analítica Institucional
- **Métricas de rendimiento operativo:** Indicadores de demanda por especialidad, ausentismo, tiempos de espera y duración de consulta médica.
- **Semáforos de calidad asistencial:** Monitoreo visual de umbrales de servicio y picos de atención.
- **Trazabilidad y auditoría:** Registro de eventos institucionales para garantizar la transparencia operativa.
- **Administración de personal:** Gestión de profesionales, especialidades y permisos de acceso al sistema.

---

## Tecnologías Principales

- **Frontend:** HTML5 semántico, CSS3, Tailwind CSS y JavaScript Moderno (ES Modules).
- **Diseño Adaptativo:** Experiencia unificada y responsiva tanto en computadoras de escritorio como en smartphones y tablets.
- **Servicios Cloud & Base de Datos:** Firebase (Cloud Firestore y Authentication) para persistencia segura y sincronización de datos en tiempo real.
- **Visualización & Utilidades:** Chart.js para tableros de métricas, SheetJS para reportes operativos y bibliotecas vectoriales para generación de códigos QR.

---

## Puesta en Marcha Local

### Requisitos
- Navegador web moderno (Chrome, Edge, Firefox, Safari).
- Servidor HTTP local (para servir módulos JavaScript con protocolo HTTP/HTTPS).

### Instrucciones
1. **Clonar el repositorio:**
   ```bash
   git clone https://github.com/Ignacio-Helbas/sistema-turnos-schestakow.git
   cd sistema-turnos-schestakow
   ```

2. **Iniciar un servidor local:**
   - *Con Python:*
     ```bash
     python -m http.server 8000
     ```
   - *Con Node.js:*
     ```bash
     npx serve .
     ```
   - *O abriendo la carpeta con Live Server en VS Code.*

3. **Abrir en el navegador:**
   - Portal Público: `http://localhost:8000`
   - Panel Institucional: `http://localhost:8000/panel.html`

### Pruebas Automatizadas
Para ejecutar la suite de pruebas unitarias y de validación:
```bash
npm test
```

---

## Consideraciones Operativas y de Seguridad

### Revocación de Cuentas y Ventana de Expiración de Sesión (Firebase Auth + Firestore)
- Al dar de baja a un usuario desde el Panel de Administración (`eliminarUsuarioAdmin`), el sistema elimina el documento del empleado en Firestore y ejecuta la Cloud Function `administrarUsuarioStaff({ id, eliminar: true })`, la cual invoca `admin.auth().deleteUser(uid)` eliminando la cuenta y sus *refresh tokens*.
- **Ventana de validez del ID Token:** En la arquitectura serverless directa de Firebase (donde el cliente interactúa con Firestore gobernado por `firestore.rules`), las reglas validan la firma criptográfica del JWT en cada solicitud, pero **no** consultan si la cuenta fue revocada en tiempo real. Por consiguiente, si el usuario ya tenía una pestaña abierta con una sesión activa, el **ID token en memoria continúa siendo válido hasta su expiración natural (hasta 1 hora)**.
- **Procedimiento para bajas críticas o inmediatas:** Si el hospital requiere un corte de acceso instantáneo sin esperar la expiración de la hora (p. ej., ante despido con sospecha de conducta maliciosa), la arquitectura requeriría intermediar las operaciones a través de Cloud Functions con `verifyIdToken(token, checkRevoked=true)` o deshabilitar manualmente las reglas de acceso del UID en Firestore.

---

## Checklist de Despliegue a Producción

Antes de la puesta en marcha definitiva en el entorno de producción de Firebase:

1. **Migración Inicial de Custom Claims (Paso Obligatorio Pendiente):**
   - Ejecutar el script de migración una vez desplegada la base real con credenciales administrativas (`GOOGLE_APPLICATION_CREDENTIALS` o Cloud Shell):
     ```bash
     node scripts/migrar-claims-permisos.js
     ```
   - Este paso sincroniza los claims `rol` y `permisosAdicionales` en Firebase Authentication para todos los usuarios preexistentes, evitando la dependencia continua del fallback de lectura en Firestore.
2. **Despliegue de Reglas de Seguridad y Cloud Functions:**
   - Desplegar `firestore.rules` con validación estricta de roles y permisos.
   - Desplegar las funciones en `functions/` incluyendo `administrarUsuarioStaff` y `reservarQuirofano`.
3. **Configuración de App Check y reCAPTCHA v3:**
   - Asegurar el registro de los dominios habilitados en Firebase App Check para proteger los endpoints públicos contra abusos automatizados.

---

## Contexto Académico

- **Autor:** Ignacio Helbas
- **Institución:** Universidad Tecnológica Nacional - Facultad Regional San Rafael (UTN FRSR)
- **Marco:** Caso de estudio e investigación en ingeniería de software aplicada a la modernización de servicios asistenciales en el ámbito de la salud pública.

---

## Licencia

Este proyecto se distribuye bajo los términos de la Licencia MIT. Para más información, consulte el archivo [LICENSE](LICENSE).
