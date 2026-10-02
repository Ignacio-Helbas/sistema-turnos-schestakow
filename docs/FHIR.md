# Mapeo a Estándares de Interoperabilidad HL7® FHIR® R4

El modelo de datos de Historia Clínica Electrónica del **Hospital Teodoro J. Schestakow** fue estructurado para facilitar la interoperabilidad con sistemas nacionales e internacionales mediante la correspondencia semántica con el estándar **HL7 FHIR Release 4 (R4)**.

---

## 1. Mapeo Demográfico: Recurso `Patient`

Colección Firestore origen: `pacientes/{pacienteId}`

| Campo Firestore | Atributo FHIR R4 | Tipo / Codificación | Ejemplo / Valor |
|---|---|---|---|
| `id` | `Patient.id` | `id` | `PAC_DEMO_i9PhAMACSFwMNHunyIox` |
| `dni` | `Patient.identifier` | `Identifier` (system: `http://midemo.gob.ar/dni`) | `"12345678"` |
| `nombre` | `Patient.name.given` | `string[]` | `["Juan", "Carlos"]` |
| `apellido` | `Patient.name.family` | `string` | `"Mendoza"` |
| `fechaNacimiento`| `Patient.birthDate` | `date` (YYYY-MM-DD) | `"1965-04-12"` |
| `sexo` | `Patient.gender` | `code` (`male` \| `female` \| `other` \| `unknown`) | `"male"` |
| `contacto.celular`| `Patient.telecom` | `ContactPoint` (system: `phone`, use: `mobile`) | `"2604112233"` |
| `contacto.email` | `Patient.telecom` | `ContactPoint` (system: `email`) | `"jcmendoza@demo.ar"` |
| `esDemo` | `Patient.meta.tag` | `Coding` (system: `demo-status`, code: `fictitious`) | `true` |

### Ejemplo en JSON FHIR R4:
```json
{
  "resourceType": "Patient",
  "id": "PAC_DEMO_i9PhAMACSFwMNHunyIox",
  "identifier": [{
    "system": "http://midemo.gob.ar/dni",
    "value": "12345678"
  }],
  "active": true,
  "name": [{
    "family": "Mendoza",
    "given": ["Juan", "Carlos"]
  }],
  "gender": "male",
  "birthDate": "1965-04-12",
  "telecom": [
    { "system": "phone", "value": "2604112233", "use": "mobile" },
    { "system": "email", "value": "jcmendoza@demo.ar" }
  ]
}
```

---

## 2. Mapeo de Encuentro / Consulta: Recurso `Encounter`

Colección Firestore origen: `pacientes/{pacienteId}/consultas/{consultaId}`

| Campo Firestore | Atributo FHIR R4 | Tipo / Codificación | Descripción |
|---|---|---|---|
| `id` | `Encounter.id` | `id` | Identificador único de consulta inmutable |
| `pacienteId` | `Encounter.subject` | `Reference(Patient/{id})` | Referencia al paciente atendido |
| `medicoUid` | `Encounter.participant.individual` | `Reference(Practitioner/{uid})` | Profesional médico actuante |
| `fecha` | `Encounter.period.start` | `dateTime` (ISO-8601) | Momento exacto del registro |
| `motivo` | `Encounter.reasonCode.text` | `CodeableConcept` | Motivo manifestado por el paciente |
| `diagnostico` | `Encounter.diagnosis.condition` | `Reference(Condition)` | Diagnóstico arribado en el encuentro |
| `evolucion` | `Encounter.text.div` / `ClinicalImpression` | `Narrative` / `Resource` | Examen físico y evolución médica |
| `corrige` | `Encounter.partOf` / `relatesTo` | `Reference(Encounter/{id})` | Enlace a la consulta previa rectificada |

---

## 3. Resumen Clínico Permanente

Colección Firestore origen: `pacientes/{pacienteId}/clinico/resumen`

### A. Alergias: Recurso `AllergyIntolerance`
- `AllergyIntolerance.clinicalStatus`: `active`
- `AllergyIntolerance.verificationStatus`: `confirmed`
- `AllergyIntolerance.patient`: `Reference(Patient/{pacienteId})`
- `AllergyIntolerance.note`: Texto libre de `alergias` (ej: *"Penicilina - edema de glotis"*).

### B. Antecedentes Patológicos: Recurso `Condition`
- `Condition.clinicalStatus`: `active` / `resolved`
- `Condition.category`: `problem-list-item`
- `Condition.patient`: `Reference(Patient/{pacienteId})`
- `Condition.note`: Texto libre de `antecedentes` (ej: *"HTA diagnosticada en 2015"*).

### C. Medicación Activa: Recurso `MedicationStatement`
- `MedicationStatement.status`: `active`
- `MedicationStatement.subject`: `Reference(Patient/{pacienteId})`
- `MedicationStatement.dosage.text`: Texto de `medicacion` (ej: *"Enalapril 10mg c/12hs"*).

---

## 4. Signos Vitales y Parámetros: Recurso `Observation`

Sub-objeto Firestore: `consultas/{id}.signosVitales`

Todos los signos vitales se modelan como perfiles estándar FHIR Vital Signs con códigos terminológicos del sistema internacional **LOINC®**:

| Signo Vital | Código LOINC | Nombre Estándar LOINC | Unidad UCUM |
|---|---|---|---|
| Presión Sistólica (`ta`) | `8480-6` | Systolic blood pressure | `mm[Hg]` |
| Presión Diastólica (`ta`) | `8462-4` | Diastolic blood pressure | `mm[Hg]` |
| Frecuencia Cardíaca (`fc`) | `8867-4` | Heart rate | `/min` |
| Temperatura Corporal (`temp`) | `8310-5` | Body temperature | `Cel` |
| Saturación de Oxígeno (`sat`) | `2708-6` | Oxygen saturation in Arterial blood | `%` |
| Peso Corporal (`peso`) | `29463-7` | Body weight | `kg` |
| Talla / Altura (`talla`) | `8302-2` | Body height | `cm` |

### Ejemplo en JSON FHIR R4 (Panel de Presión Arterial):
```json
{
  "resourceType": "Observation",
  "status": "final",
  "category": [{
    "coding": [{
      "system": "http://terminology.hl7.org/CodeSystem/observation-category",
      "code": "vital-signs"
    }]
  }],
  "code": {
    "coding": [{
      "system": "http://loinc.org",
      "code": "85354-9",
      "display": "Blood pressure panel"
    }]
  },
  "subject": { "reference": "Patient/PAC_DEMO_i9PhAMACSFwMNHunyIox" },
  "component": [
    {
      "code": { "coding": [{ "system": "http://loinc.org", "code": "8480-6", "display": "Systolic" }] },
      "valueQuantity": { "value": 130, "unit": "mmHg", "system": "http://unitsofmeasure.org", "code": "mm[Hg]" }
    },
    {
      "code": { "coding": [{ "system": "http://loinc.org", "code": "8462-4", "display": "Diastolic" }] },
      "valueQuantity": { "value": 85, "unit": "mmHg", "system": "http://unitsofmeasure.org", "code": "mm[Hg]" }
    }
  ]
}
```
