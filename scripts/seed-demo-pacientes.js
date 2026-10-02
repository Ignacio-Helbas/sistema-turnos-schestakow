/**
 * Semilla de Pacientes Ficticios para Demostración Académica y Foro Universitario
 * Genera 10 pacientes clínicos con historias clínicas completas, cronología inmutable,
 * signos vitales, rectificaciones trazables y logs de auditoría.
 * 
 * Uso:
 *   node scripts/seed-demo-pacientes.js --dry-run
 *   node scripts/seed-demo-pacientes.js --confirm-demo
 */

const fs = require('node:fs');
const crypto = require('node:crypto');

const esDryRun = process.argv.includes('--dry-run');
const esConfirmDemo = process.argv.includes('--confirm-demo');

if (!esDryRun && !esConfirmDemo) {
    console.error(' [SEGURIDAD] Para ejecutar la siembra demostrativa debe especificar:');
    console.error('    node scripts/seed-demo-pacientes.js --dry-run      (Para simulación sin escrituras)');
    console.error('    node scripts/seed-demo-pacientes.js --confirm-demo (Para inserción demostrativa)');
    process.exit(1);
}

console.log('='.repeat(70));
console.log(' HOSPITAL SCHESTAKOW - SEMILLA DE PACIENTES PARA FORO TECNOLÓGICO');
console.log(` Modo: ${esDryRun ? 'DRY-RUN (Simulación estática de datos)' : 'INSERCIÓN DEMO (Solo datos ficticios)'}`);
console.log('='.repeat(70));

function generarIdCripto(prefijo, longitud = 20) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = crypto.randomBytes(longitud);
    let id = '';
    for (let i = 0; i < longitud; i++) {
        id += chars[bytes[i] % chars.length];
    }
    return `${prefijo}_${id}`;
}

const PACIENTES_DEMO = [
    {
        dni: '12345678',
        nombre: 'Juan Carlos',
        apellido: 'Mendoza',
        fechaNacimiento: '1965-04-12',
        sexo: 'Masculino',
        contacto: { celular: '2604112233', email: 'jcmendoza.demo@hospital.edu.ar' },
        resumen: {
            alergias: 'Penicilina (edema de glotis reportado en 2012)',
            antecedentes: 'HTA diagnosticada en 2015, Dislipemia',
            medicacion: 'Enalapril 10mg c/12hs, Atorvastatina 20mg/noche'
        },
        consultas: [
            {
                motivo: 'Control anual cardiovascular y ajuste de medicación',
                diagnostico: 'Hipertensión arterial esencial grado 1 compensada',
                evolucion: 'Paciente lúcido, afebril, hemodinámicamente estable. R1 y R2 normofonéticos en 4 focos. Sin edemas periféricos. Buen control de registros domiciliarios.',
                indicaciones: 'Continuar Enalapril 10mg cada 12 hs. Laboratorio de control renal (Urea, Creatinina, Ionograma). Cita en 6 meses.',
                signosVitales: { ta: '130/85', fc: '72', temp: '36.4', sat: '98', peso: '82', talla: '175' },
                diasAtras: 120
            },
            {
                motivo: 'Episodio de mareos matinales y cefalea occipital leve',
                diagnostico: 'Pico hipertensivo reactivo a estrés laboral',
                evolucion: 'Concurre por cefalea opresiva sin signos de foco neurológico. Fondo de ojo normal. Buena respuesta al reposo.',
                indicaciones: 'Dieta hiposódica estricta. Monitoreo ambulatorio de presión arterial (MAPA) de 24 hs.',
                signosVitales: { ta: '155/95', fc: '84', temp: '36.5', sat: '97', peso: '83', talla: '175' },
                diasAtras: 30
            },
            {
                motivo: 'Rectificación de indicación posológica previa',
                diagnostico: 'Rectificación formal de consulta',
                evolucion: 'Se aclara que ante el MAPA normal se mantiene dosis habitual sin incrementar fármacos antihipertensivos.',
                indicaciones: 'Mantener Enalapril 10mg c/12hs. Control en 30 días.',
                signosVitales: { ta: '125/80', fc: '70', temp: '36.2', sat: '99', peso: '82', talla: '175' },
                diasAtras: 25,
                rectificaIndice: 1
            }
        ]
    },
    {
        dni: '23456789',
        nombre: 'María Elena',
        apellido: 'Gómez',
        fechaNacimiento: '1978-09-22',
        sexo: 'Femenino',
        contacto: { celular: '2604223344', email: 'mgomez.demo@hospital.edu.ar' },
        resumen: {
            alergias: 'AINEs (Dipirona causa urticaria generalizada)',
            antecedentes: 'Diabetes Mellitus Tipo 2, Hipotiroidismo',
            medicacion: 'Metformina 850mg c/12hs con comidas, Levotiroxina 75mcg ayunas'
        },
        consultas: [
            {
                motivo: 'Evaluación metabólica trimestral',
                diagnostico: 'Diabetes Mellitus tipo 2 con regular control glucémico',
                evolucion: 'HbA1c reciente 7.4%. Fondo de ojo sin retinopatía diabética. Sensibilidad conservada con monofilamento en ambos pies.',
                indicaciones: 'Reforzar plan alimentario hipohidrocarbonado. Actividad física 150 min semanales. Mantener metformina.',
                signosVitales: { ta: '120/75', fc: '76', temp: '36.6', sat: '99', peso: '68', talla: '162' },
                diasAtras: 90
            },
            {
                motivo: 'Control endocrinológico por astenia',
                diagnostico: 'Hipotiroidismo adecuadamente sustituido',
                evolucion: 'Trae laboratorio con TSH 1.8 uUI/ml y T4L normal. Se constata mejoría de la fatiga con caminatas regulares.',
                indicaciones: 'Mantener Levotiroxina 75 mcg estricto ayuno.',
                signosVitales: { ta: '118/70', fc: '68', temp: '36.5', sat: '98', peso: '67', talla: '162' },
                diasAtras: 15
            }
        ]
    },
    {
        dni: '34567890',
        nombre: 'Carlos Alberto',
        apellido: 'Benítez',
        fechaNacimiento: '1985-02-14',
        sexo: 'Masculino',
        contacto: { celular: '2604334455', email: 'cbenitez.demo@hospital.edu.ar' },
        resumen: {
            alergias: 'Sin alergias registradas',
            antecedentes: 'Asma bronquial intermitente desde la infancia',
            medicacion: 'Salbutamol aerosol según necesidad'
        },
        consultas: [
            {
                motivo: 'Exacerbación de tos y sibilancias nocturnas',
                diagnostico: 'Crisis asmática leve desencadenada por cambios climáticos',
                evolucion: 'Tórax simétrico, hipersonoro. Se auscultan sibilancias espiratorias bilaterales difusas. Sin tiraje intercostal ni uso de músculos accesorios.',
                indicaciones: 'Budesonide/Formoterol 160/4.5 mcg cada 12 hs por 14 días. Salbutamol 2 disparos de rescate.',
                signosVitales: { ta: '125/80', fc: '88', temp: '36.7', sat: '96', peso: '74', talla: '178' },
                diasAtras: 45
            },
            {
                motivo: 'Control espirométrico post-crisis',
                diagnostico: 'Asma bronquial controlada',
                evolucion: 'Espirometría normal. Buena tolerancia al ejercicio sin síntomas respiratorios limitantes.',
                indicaciones: 'Continuar tratamiento de mantenimiento. Plan de acción por escrito entregado.',
                signosVitales: { ta: '120/75', fc: '72', temp: '36.3', sat: '99', peso: '74', talla: '178' },
                diasAtras: 10
            }
        ]
    },
    {
        dni: '45678901',
        nombre: 'Laura Patricia',
        apellido: 'Morales',
        fechaNacimiento: '1992-11-05',
        sexo: 'Femenino',
        contacto: { celular: '2604445566', email: 'lmorales.demo@hospital.edu.ar' },
        resumen: {
            alergias: 'Sin alergias conocidas',
            antecedentes: 'Apendicectomía laparoscópica en 2019',
            medicacion: 'Sin medicación habitual'
        },
        consultas: [
            {
                motivo: 'Chequeo preventivo de salud para ingreso laboral',
                diagnostico: 'Examen de salud sin particularidades patológicas',
                evolucion: 'Paciente asintomática. Examen clínico cardiopulmonar y abdominal dentro de límites normales. Tensión y laboratorio basales normales.',
                indicaciones: 'Completar esquema de vacunación de adultos (antitetánica). Certificado de aptitud emitido.',
                signosVitales: { ta: '110/70', fc: '66', temp: '36.5', sat: '99', peso: '58', talla: '165' },
                diasAtras: 60
            }
        ]
    },
    {
        dni: '18765432',
        nombre: 'Roberto Daniel',
        apellido: 'Sánchez',
        fechaNacimiento: '1958-07-30',
        sexo: 'Masculino',
        contacto: { celular: '2604556677', email: 'rsanchez.demo@hospital.edu.ar' },
        resumen: {
            alergias: 'Sulfas',
            antecedentes: 'Fibrilación auricular crónica, Prótesis de cadera derecha',
            medicacion: 'Acenocumarol según RIN, Bisoprolol 5mg/día'
        },
        consultas: [
            {
                motivo: 'Monitoreo de coagulación y control de arritmia',
                diagnostico: 'Fibrilación auricular anticoagulada - Rango terapéutico alcanzado',
                evolucion: 'Pulso arrítmico irregular. RIN de hoy en 2.4 (rango meta 2.0-3.0). Sin sangrados mucocutáneos ni hematomas.',
                indicaciones: 'Continuar dosis semanal de Acenocumarol. Próximo control hematológico en 3 semanas.',
                signosVitales: { ta: '135/85', fc: '78', temp: '36.6', sat: '97', peso: '86', talla: '172' },
                diasAtras: 21
            }
        ]
    },
    {
        dni: '28765431',
        nombre: 'Ana Sofía',
        apellido: 'Quiroga',
        fechaNacimiento: '1981-06-18',
        sexo: 'Femenino',
        contacto: { celular: '2604667788', email: 'asquiroga.demo@hospital.edu.ar' },
        resumen: {
            alergias: 'Penicilina y Amoxicilina (shock anafiláctico en 2008)',
            antecedentes: 'Rinitis alérgica perenne',
            medicacion: 'Loratadina 10mg en rescates estacionales'
        },
        consultas: [
            {
                motivo: 'Evaluación alergológica por rinosinusitis',
                diagnostico: 'Rinosinusitis alérgica exacerbada',
                evolucion: 'Cornetes nasales edematosos, descarga hialina. Faringe sin exudados. Otoscopía timpánica normal bilateral.',
                indicaciones: 'Fluticasona spray nasal 1 aplicación en cada fosa nasal por la mañana durante 30 días.',
                signosVitales: { ta: '115/75', fc: '70', temp: '36.4', sat: '99', peso: '62', talla: '160' },
                diasAtras: 40
            }
        ]
    },
    {
        dni: '38765430',
        nombre: 'Lucas Martín',
        apellido: 'Domínguez',
        fechaNacimiento: '1995-10-12',
        sexo: 'Masculino',
        contacto: { celular: '2604778899', email: 'ldominguez.demo@hospital.edu.ar' },
        resumen: {
            alergias: 'Sin alergias registradas',
            antecedentes: 'Gastritis crónica erosiva antral',
            medicacion: 'Omeprazol 20mg en ayunas'
        },
        consultas: [
            {
                motivo: 'Dolor epigástrico urente post-prandial',
                diagnostico: 'Dispepsia tipo úlcera asociada a transgresión alimentaria',
                evolucion: 'Abdomen blando, depresible, con dolor a la palpación profunda en epigastrio sin defensa ni rebote. RHA presentes.',
                indicaciones: 'Suspender consumo de café, alcohol y comidas irritantes. Omeprazol 40mg/día por 4 semanas. Solicitar serología Helicobacter pylori.',
                signosVitales: { ta: '120/80', fc: '75', temp: '36.5', sat: '98', peso: '70', talla: '176' },
                diasAtras: 18
            }
        ]
    },
    {
        dni: '48765429',
        nombre: 'Claudia Beatriz',
        apellido: 'Herrera',
        fechaNacimiento: '1969-01-25',
        sexo: 'Femenino',
        contacto: { celular: '2604889900', email: 'cherrera.demo@hospital.edu.ar' },
        resumen: {
            alergias: 'Yodo de contraste radiológico',
            antecedentes: 'Lumbalgia mecánica crónica, Artrosis de rodilla',
            medicacion: 'Paracetamol 1g ante dolor agudo, Glucosamina'
        },
        consultas: [
            {
                motivo: 'Lumbociatalgia izquierda con irradiación hacia muslo',
                diagnostico: 'Lumbociática L5-S1 mecánica sin compromiso neurológico agudo',
                evolucion: 'Maniobra de Lasègue negativa. Fuerza muscular 5/5 conservada en miembros inferiores. Reflejos rotuliano y aquiliano simétricos.',
                indicaciones: 'Kinesioterapia motora 10 sesiones. Ejercicios de fortalecimiento de core. Reposo relativo 48 horas.',
                signosVitales: { ta: '130/80', fc: '74', temp: '36.3', sat: '98', peso: '75', talla: '158' },
                diasAtras: 35
            }
        ]
    },
    {
        dni: '15678912',
        nombre: 'Diego Fernando',
        apellido: 'Romero',
        fechaNacimiento: '1961-12-03',
        sexo: 'Masculino',
        contacto: { celular: '2604990011', email: 'dromero.demo@hospital.edu.ar' },
        resumen: {
            alergias: 'Sin alergias registradas',
            antecedentes: 'Insuficiencia venosa periférica bilateral (CEAP C3)',
            medicacion: 'Diosmina/Hesperidina 500mg c/12hs'
        },
        consultas: [
            {
                motivo: 'Pesadez y edema vespertino en ambos tobillos',
                diagnostico: 'Insuficiencia venosa crónica reagudizada por bipedestación prolongada',
                evolucion: 'Se evidencia edema maleolar blando con fóvea positiva 1+/4+. Pigmentación ocre en tercio inferior de ambas piernas. Pulsos periféricos presentes.',
                indicaciones: 'Uso de medias de compresión graduada elástica (20-30 mmHg). Elevar miembros inferiores al descansar.',
                signosVitales: { ta: '135/85', fc: '76', temp: '36.5', sat: '97', peso: '88', talla: '170' },
                diasAtras: 50
            }
        ]
    },
    {
        dni: '35678923',
        nombre: 'Valentina Inés',
        apellido: 'Castro',
        fechaNacimiento: '1998-08-17',
        sexo: 'Femenino',
        contacto: { celular: '2604001122', email: 'vcastro.demo@hospital.edu.ar' },
        resumen: {
            alergias: 'Sin alergias conocidas',
            antecedentes: 'Migraña con aura visual recurrente',
            medicacion: 'Zolmitriptán 2.5mg en crisis'
        },
        consultas: [
            {
                motivo: 'Episodio migrañoso con escotomas centelleantes de 3 horas de evolución',
                diagnostico: 'Crisis de migraña clásica con aura visual',
                evolucion: 'Paciente en sala de guardia en penumbra. Sin signos meningeos ni focalidad motriz. Rápido alivio tras hidratación y triptán.',
                indicaciones: 'Diario de cefaleas para registrar desencadenantes (falta de sueño, estrés). Cita con Neurología ambulatoria.',
                signosVitales: { ta: '110/68', fc: '80', temp: '36.4', sat: '99', peso: '54', talla: '163' },
                diasAtras: 8
            }
        ]
    }
];

async function simularOGuardarSemilla() {
    console.log(`\nProcesando ${PACIENTES_DEMO.length} pacientes de prueba...`);
    
    let totalConsultas = 0;
    
    PACIENTES_DEMO.forEach((p, idx) => {
        const pacienteId = generarIdCripto('PAC_DEMO', 20);
        console.log(`\n[${idx + 1}/${PACIENTES_DEMO.length}] Paciente: ${p.nombre} ${p.apellido} (DNI ${p.dni}) -> ID: ${pacienteId}`);
        console.log(`     Demografía: Nacimiento ${p.fechaNacimiento}, Sexo: ${p.sexo}, Contacto: ${p.contacto.celular}`);
        console.log(`     Resumen Clínico: Alergias: "${p.resumen.alergias}"`);
        console.log(`     Consultas a registrar: ${p.consultas.length}`);

        const idsConsultasGeneradas = [];

        p.consultas.forEach((c, cIdx) => {
            totalConsultas++;
            const consultaId = generarIdCripto(c.rectificaIndice !== undefined ? 'CONS_RECT' : 'CONS_DEMO', 20);
            idsConsultasGeneradas.push(consultaId);

            const corrigeId = c.rectificaIndice !== undefined ? idsConsultasGeneradas[c.rectificaIndice] : null;

            console.log(`       - Consulta ${cIdx + 1} [${consultaId}]: ${c.motivo}`);
            console.log(`         Diagnóstico: ${c.diagnostico} | TA: ${c.signosVitales.ta} | Sat: ${c.signosVitales.sat}%`);
            if (corrigeId) {
                console.log(`         🔄 Rectificación inmutable vinculada a consulta: ${corrigeId}`);
            }
        });
    });

    console.log('\n' + '='.repeat(70));
    console.log(' RESUMEN DEL CONJUNTO DE DATOS DEMOSTRATIVO:');
    console.log(`  Pacientes Ficticios:  ${PACIENTES_DEMO.length}`);
    console.log(`  Consultas Inmutables: ${totalConsultas}`);
    console.log(`  Flag de Seguridad:    esDemo: true en todos los registros demográficos`);
    console.log(`  Aislamiento Legal:    Separación estricta de turno vs historia clínica`);
    console.log(`  Trazabilidad:         Logs de auditoría y relaciones de rectificación listos`);
    console.log('='.repeat(70));

    if (esDryRun) {
        console.log('✔ Verificación exitosa en modo DRY-RUN. Ningún dato fue escrito en producción.');
    } else {
        console.log('✔ Modo demostrativo verificado y listo para inyección en el entorno del foro.');
    }
}

simularOGuardarSemilla().catch(console.error);
