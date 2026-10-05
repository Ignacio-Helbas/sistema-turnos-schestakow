# Plan de Auditoría y Remediación - Sistema Hospitalario Schestakow

## Estado General del Proyecto
- **Rama Activa**: `feature/historia-clinica`
- **Proyecto Firebase**: `sistema-turnos-utn` (Plan Spark - 100% Gratuito)
- **Estado de Ejecución**: Completado íntegramente. Todos los requerimientos de seguridad, arquitectura, integridad de datos e historia clínica inmutable están implementados y verificados.

---

## 1. Auditoría Inicial y Remediación Base (Completada)

- [x] **1. Eliminación de credenciales y correos hardcodeados**: Eliminado `nachohelbas@gmail.com` de código y reglas.
- [x] **2. Reglas de Firestore denegar por defecto**: Implementado `allow read, write: if false;` en raíz.
- [x] **3. Desacoplamiento de colección pública**: Creada `medicos_publicos/{uid}` con solo nombre, especialidad y estado activo.
- [x] **4. Aislamiento de consultas públicas de turnos**: El paciente solo accede por ID criptográfico (`crypto.getRandomValues`, 20+ caracteres); denegado el listado público.
- [x] **5. Validación estricta de esquema en `turnos`**: Reglas validan campos exactos y prohíben datos clínicos en el turno.
- [x] **6. Prevención de reservas duplicadas (Zero-Collision)**: Slot determinista en `disponibilidad/{slotId}`.
- [x] **7. Arquitectura modular**: Separación clara de `index.html` (portal de turnos para pacientes) y `panel.html` (portal de gestión hospitalaria y login).
- [x] **8. División de JavaScript**: Desacoplado en `firebase-config.js`, `publico.js`, `admin.js` y `utils.js`.

---

## 2. Historia Clínica Electrónica (Ley 26.529) - Completada

- [x] **Fase 0 - Diagnóstico y Cierre Mínimo**:
  - Modelo de amenazas documentado.
  - Reglas de Firestore con cierre estricto antes de manipular datos de salud.
- [x] **Fase 1 - Modelo de Datos y Reglas de HCE**:
  - `pacientes/{pacienteId}`: Datos demográficos con ID criptográfico (nunca el DNI).
  - `pacientes_por_dni/{dni}`: Índice determinista de unicidad.
  - `pacientes/{pacienteId}/clinico/resumen`: Alergias, antecedentes y medicación activa.
  - `pacientes/{pacienteId}/consultas/{consultaId}`: **Inmutable** (`allow update: if false; allow delete: if false;`).
  - `pacientes/{pacienteId}/acceso/{medicoUid}`: Permisos de lectura otorgados al profesional.
  - `auditoria/{id}`: Log append-only para trazabilidad de aperturas, consultas y accesos.
  - Script idempotente de migración: `scripts/migrar-historias.js`.
- [x] **Fase 2 - Interfaz de Usuario y Controlador Clínico**:
  - Buscador de pacientes por DNI y ficha demográfica activa en `panel.html`.
  - Resumen clínico permanente (Alergias, Antecedentes, Medicación) con modal de edición justificada.
  - Formulario de consulta inmutable con signos vitales (TA, FC, Temp, Sat, Peso, Talla).
  - Cronología médica descendente con soporte para **rectificaciones inmutables** vinculadas (`corrige: consultaId`).
  - Modal y flujo de **Acceso de Emergencia** ("Romper el vidrio") con justificación obligatoria en auditoría.
  - Exportación e impresión médica formateada con estilos `@media print` en `css/estilos.css`.
  - Temporizador de cierre de sesión automático tras 15 minutos de inactividad médica.
- [x] **Fase 3 - Datos Demostrativos y Documentación de Estándares**:
  - Generador de datos demostrativos: `scripts/seed-demo-pacientes.js` (10 pacientes ficticios con 14 consultas).
  - Documentación de arquitectura clínica: `docs/HISTORIA_CLINICA.md` con diagrama de entidad-relación Mermaid y matriz RBAC.
  - Mapeo a estándares de interoperabilidad de salud: `docs/FHIR.md` (HL7 FHIR Release 4).
- [x] **Fase 4 - Seguridad en Hosting y Reglas de Exclusión**:
  - Cabeceras de seguridad CSP, X-Frame-Options, X-Content-Type-Options y Referrer-Policy en `firebase.json`.
  - Exclusión de scripts internos, documentación y suites de testing en el despliegue estático de Hosting.

---

## 3. Verificación Automatizada

- [x] Pruebas estáticas de reglas de Firestore: `npm test` (pasa 100%).
- [x] CI en GitHub Actions: `.github/workflows/test-rules.yml` con Firebase Firestore Emulator en Ubuntu con Java 17.
- [x] Verificación de sintaxis JavaScript: `node -c js/admin.js`, `node -c scripts/seed-demo-pacientes.js`.
