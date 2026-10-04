/**
 * Módulo de Interfaz y Gráficos de Métricas
 * Hospital Teodoro J. Schestakow (UTN FRSR)
 * 
 * Gestiona la renderización de KPIs interactivos, gráficos con Chart.js local,
 * selector de períodos con atajos rápidos, caché en memoria para plan Spark,
 * mapas de calor CSS, tooltips con fórmulas, semáforos accesibles, exportación
 * a Excel con SheetJS y descarga de gráficos en alta resolución.
 */

import {
    CONFIG_UMBRALES,
    evaluarSemaforo,
    filtrarTurnosPorRango,
    calcularMetricasMedico,
    calcularMetricasRecepcion,
    calcularMetricasGenerales,
    compararEntidades
} from './metricas.js';

import {
    db,
    collection,
    query,
    where,
    getDocs,
    limit,
    orderBy
} from './firebase.js';

import {
    mostrarAlerta,
    mostrarExito,
    mostrarToast,
    escaparHTML
} from './ui.js';

// ==========================================
// ESTADO INTERNO Y CACHÉ EN MEMORIA (Plan Spark)
// ==========================================
let cacheTurnos = [];
let cacheUsuariosPersonal = {};
let cacheRangoCargado = { inicio: '', fin: '' };
let cacheCargado = false;

let subvistaActiva = 'general'; // 'general' | 'medico' | 'recepcion' | 'comparador'

// Instancias de Chart.js para evitar memory leaks y superposición de canvas
const chartsInstancias = {};

// ==========================================
// DICCIONARIO DE TOOLTIPS INFORMATIVOS
// ==========================================
export const DICCIONARIO_METRICAS_INFO = {
    ocupacion: {
        titulo: 'Ocupación de Agenda',
        queMide: 'Proporción de la capacidad horaria del hospital o profesional que fue efectivamente reservada con turnos de pacientes.',
        formula: 'Ocupación (%) = (Turnos Asignados ÷ Franjas Horarias Disponibles) × 100',
        comoLeerlo: 'Más alto es mejor. Un valor superior al 75% denota un aprovechamiento eficiente del recurso médico y menor capacidad ociosa.',
        claveSemaforo: 'ocupacion'
    },
    ausentismo: {
        titulo: 'Tasa de Ausentismo (No-Show)',
        queMide: 'Porcentaje de pacientes con turno confirmado que no se presentaron a la consulta ni cancelaron anticipadamente.',
        formula: 'Ausentismo (%) = (Turnos con Estado "Ausente" ÷ Total Turnos Asignados) × 100',
        comoLeerlo: 'Más bajo es mejor. Un ausentismo mayor al 20% genera tiempos muertos que perjudican a otros pacientes en lista de espera.',
        claveSemaforo: 'ausentismo'
    },
    esperaMinutos: {
        titulo: 'Tiempo de Espera Promedio',
        queMide: 'Minutos reales transcurridos desde que el paciente realiza el check-in en Recepción (llegadaEn) hasta que el médico lo llama a consultorio (inicioConsultaEn).',
        formula: 'Espera Promedio = Promedio(inicioConsultaEn − llegadaEn) en minutos',
        comoLeerlo: 'Más bajo es mejor. El estándar de calidad hospitalaria busca un tiempo de espera en sala menor a 20 minutos.',
        claveSemaforo: 'esperaMinutos'
    },
    tasaAtencion: {
        titulo: 'Tasa de Atención Efectiva',
        queMide: 'Porcentaje de turnos asignados que culminaron con una consulta médica asentada y cerrada en historia clínica.',
        formula: 'Atención Efectiva (%) = (Turnos Atendidos ÷ Total Turnos Asignados) × 100',
        comoLeerlo: 'Más alto es mejor. Representa la productividad asistencial neta del servicio.',
        claveSemaforo: 'tasaAtencion'
    },
    turnosWeb: {
        titulo: 'Adopción del Canal Digital Web',
        queMide: 'Proporción de turnos gestionados autónomamente por la ciudadanía a través del portal web sin intermediación de ventanilla.',
        formula: 'Adopción Web (%) = (Turnos Canal Web ÷ Total General de Turnos) × 100',
        comoLeerlo: 'Más alto es mejor. Reduce la congestión en las colas de recepción presencial.',
        claveSemaforo: 'turnosWeb'
    },
    proximoTurno: {
        titulo: 'Tiempo al Próximo Turno Disponible',
        queMide: 'Días promedio de espera requeridos para conseguir una vacante libre en la especialidad seleccionada.',
        formula: 'Demora = Fecha del Primer Turno Libre − Fecha Actual (en días)',
        comoLeerlo: 'Más bajo es mejor. Mide la accesibilidad y saturación de la especialidad.',
        claveSemaforo: null
    },
    calidadCarga: {
        titulo: 'Puntaje de Calidad de Carga',
        queMide: 'Calidad e integridad de los datos ingresados en ventanilla (presencia de email, teléfono válido y ausencia de DNI duplicados el mismo día).',
        formula: 'Calidad = 100 − Penalizaciones por faltantes de contacto y duplicados',
        comoLeerlo: 'Más alto es mejor. Un puntaje > 90% asegura notificaciones fehacientes y sinergia operativa.',
        claveSemaforo: null
    },
    duracionConsulta: {
        titulo: 'Duración Real vs. Programada',
        queMide: 'Contraste entre los minutos efectivos que insumió la atención médica (finConsultaEn − inicioConsultaEn) versus el intervalo modulado.',
        formula: 'Desvío = Duración Real Promedio − Duración Modulada (ej. 15 min)',
        comoLeerlo: 'Un valor cercano a 0 indica apego estricto a la modulación horaria de la agenda.',
        claveSemaforo: null
    }
};

// ==========================================
// CONFIGURACIÓN INSTITUCIONAL DE CHART.JS
// ==========================================
function configurarDefaultsChartJS() {
    if (!window.Chart) return;
    try {
        window.Chart.defaults.font.family = "'Public Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
        window.Chart.defaults.color = '#475569'; // Slate 600
        if (window.Chart.defaults.plugins && window.Chart.defaults.plugins.tooltip) {
            window.Chart.defaults.plugins.tooltip.backgroundColor = '#0f172a'; // Slate 900
            window.Chart.defaults.plugins.tooltip.titleColor = '#ffffff';
            window.Chart.defaults.plugins.tooltip.bodyColor = '#f1f5f9';
            window.Chart.defaults.plugins.tooltip.borderColor = '#334155';
            window.Chart.defaults.plugins.tooltip.borderWidth = 1;
            window.Chart.defaults.plugins.tooltip.padding = 10;
            window.Chart.defaults.plugins.tooltip.cornerRadius = 6;
        }
    } catch (_) {}
}

// ==========================================
// FUNCIÓN PRINCIPAL DE INICIALIZACIÓN
// ==========================================
export async function iniciarModuloMetricasUI(forzarLectura = false) {
    configurarDefaultsChartJS();
    establecerFechasFiltroPorDefecto();
    await cargarDatosMetricasFirestore(forzarLectura);
    actualizarVistaMetricas();
}

/**
 * Establece el rango de fechas inicial: últimos 30 días hasta hoy.
 */
function establecerFechasFiltroPorDefecto() {
    const inputDesde = document.getElementById('metricas-fecha-desde');
    const inputHasta = document.getElementById('metricas-fecha-hasta');

    if (inputDesde && inputHasta && (!inputDesde.value || !inputHasta.value)) {
        const hoy = new Date();
        const hace30Dias = new Date();
        hace30Dias.setDate(hoy.getDate() - 30);

        inputHasta.value = hoy.toISOString().split('T')[0];
        inputDesde.value = hace30Dias.toISOString().split('T')[0];
    }
}

/**
 * Consulta controlada a Firestore con caché en memoria.
 * Evita consumir la cuota diaria del plan Spark al cambiar filtros o gráficos.
 */
async function cargarDatosMetricasFirestore(forzar = false) {
    const inputDesde = document.getElementById('metricas-fecha-desde');
    const inputHasta = document.getElementById('metricas-fecha-hasta');

    const fDesde = inputDesde ? inputDesde.value : '';
    const fHasta = inputHasta ? inputHasta.value : '';

    // Si ya tenemos en caché un rango igual o más amplio y no se fuerza lectura, reutilizar
    if (!forzar && cacheCargado && cacheRangoCargado.inicio && cacheRangoCargado.fin) {
        if (fDesde >= cacheRangoCargado.inicio && fHasta <= cacheRangoCargado.fin) {
            return;
        }
    }

    const skeleton = document.getElementById('metricas-loading-skeleton');
    const contenido = document.getElementById('metricas-contenido-dinamico');
    if (skeleton) skeleton.classList.remove('hidden');
    if (contenido) contenido.classList.add('opacity-50', 'pointer-events-none');

    try {
        // 1. Cargar catálogo de personal/usuarios si está vacío
        if (Object.keys(cacheUsuariosPersonal).length === 0) {
            try {
                const snapUsers = await getDocs(query(collection(db, "usuarios"), limit(100)));
                snapUsers.forEach(docSnap => {
                    cacheUsuariosPersonal[docSnap.id] = docSnap.data();
                });
            } catch (errU) {
                console.warn("Aviso al consultar catálogo de usuarios para métricas:", errU);
            }
        }

        // 2. Consulta por rango de fechas (límite Spark seguro)
        // Amplitud mínima de búsqueda: 45 días hacia atrás para cubrir comparativas
        const limiteInferior = fDesde || new Date(Date.now() - 45 * 86400000).toISOString().split('T')[0];
        const limiteSuperior = fHasta || new Date().toISOString().split('T')[0];

        const qTurnos = query(
            collection(db, "turnos"),
            where("fecha", ">=", limiteInferior),
            where("fecha", "<=", limiteSuperior),
            limit(1000)
        );

        const snapTurnos = await getDocs(qTurnos);
        const turnosLeidos = [];

        snapTurnos.forEach(docSnap => {
            const data = docSnap.data();
            // NUNCA incluir datos personales identificatorios en la memoria de métricas
            turnosLeidos.push({
                id: docSnap.id,
                fecha: data.fecha,
                horario: data.horario,
                especialidad: data.especialidad || 'General',
                medico: data.medico || 'Médico Asignado',
                medicoUid: data.medicoUid || 'sin_uid',
                canal: data.canal || 'Web',
                estado: data.estado || 'Confirmado',
                creadoEn: data.creadoEn,
                creadoPor: data.creadoPor || null,
                llegadaEn: data.llegadaEn || null,
                inicioConsultaEn: data.inicioConsultaEn || null,
                finConsultaEn: data.finConsultaEn || null,
                canceladoPor: data.canceladoPor || null,
                canceladoEn: data.canceladoEn || null,
                reprogramadoDe: data.reprogramadoDe || null,
                // Flags de integridad de contacto sin exponer el dato real
                tieneEmail: Boolean(data.pacienteEmail && data.pacienteEmail.trim().length > 0),
                tieneCelular: Boolean(data.pacienteCelular && data.pacienteCelular.trim().length > 0),
                pacienteDni: data.pacienteDni || '' // Solo para detectar duplicados en memoria
            });
        });

        cacheTurnos = turnosLeidos;
        cacheRangoCargado = { inicio: limiteInferior, fin: limiteSuperior };
        cacheCargado = true;

        actualizarSelectoresFiltro();
    } catch (err) {
        console.error("Error al consultar métricas en Firestore:", err);
        mostrarAlerta("Error de Consulta", "No se pudieron obtener los datos analíticos desde la base de datos.");
    } finally {
        if (skeleton) skeleton.classList.add('hidden');
        if (contenido) contenido.classList.remove('opacity-50', 'pointer-events-none');
    }
}

/**
 * Llena dinámicamente los selectores de filtro de especialidad, médico y recepcionista.
 */
function actualizarSelectoresFiltro() {
    const selEsp = document.getElementById('metricas-filtro-especialidad');
    const selMed = document.getElementById('metricas-filtro-medico');
    const selRecep = document.getElementById('metricas-filtro-recepcionista');
    const selCompA = document.getElementById('comparador-select-a');
    const selCompB = document.getElementById('comparador-select-b');

    const especialidades = new Set();
    const medicos = new Map();
    const recepcionistas = new Map();

    cacheTurnos.forEach(t => {
        if (t.especialidad) especialidades.add(t.especialidad);
        if (t.medico) medicos.set(t.medicoUid || t.medico, t.medico);
        if (t.creadoPor) {
            const u = cacheUsuariosPersonal[t.creadoPor];
            const nombre = u ? (u.nombre || u.correo) : `Personal (${t.creadoPor.slice(0, 6)})`;
            recepcionistas.set(t.creadoPor, nombre);
        }
    });

    if (selEsp) {
        const valActual = selEsp.value;
        let html = '<option value="">Todas las Especialidades</option>';
        Array.from(especialidades).sort().forEach(esp => {
            html += `<option value="${escaparHTML(esp)}">${escaparHTML(esp)}</option>`;
        });
        selEsp.innerHTML = html;
        if (valActual) selEsp.value = valActual;
    }

    if (selMed) {
        const valActual = selMed.value;
        let html = '<option value="">Todos los Profesionales</option>';
        medicos.forEach((nom, uid) => {
            html += `<option value="${escaparHTML(uid)}">${escaparHTML(nom)}</option>`;
        });
        selMed.innerHTML = html;
        if (valActual) selMed.value = valActual;
    }

    if (selRecep) {
        let html = '<option value="">Todo el Personal</option>';
        recepcionistas.forEach((nom, uid) => {
            html += `<option value="${escaparHTML(uid)}">${escaparHTML(nom)}</option>`;
        });
        selRecep.innerHTML = html;
    }

    // Selectores para el Comparador
    if (selCompA && selCompB) {
        let htmlComp = '';
        medicos.forEach((nom, uid) => {
            htmlComp += `<option value="${escaparHTML(uid)}">${escaparHTML(nom)}</option>`;
        });
        selCompA.innerHTML = htmlComp;
        selCompB.innerHTML = htmlComp;
        if (medicos.size >= 2) {
            const keys = Array.from(medicos.keys());
            selCompA.value = keys[0];
            selCompB.value = keys[1];
        }
    }
}

// ==========================================
// RENDERIZADO GENERAL Y CONTROL DE SUB-VISTAS
// ==========================================
export function actualizarVistaMetricas() {
    const inputDesde = document.getElementById('metricas-fecha-desde');
    const inputHasta = document.getElementById('metricas-fecha-hasta');
    const selEsp = document.getElementById('metricas-filtro-especialidad');
    const selMed = document.getElementById('metricas-filtro-medico');
    const selRecep = document.getElementById('metricas-filtro-recepcionista');

    const fDesde = inputDesde ? inputDesde.value : '';
    const fHasta = inputHasta ? inputHasta.value : '';
    const espFiltro = selEsp ? selEsp.value : '';
    const medFiltro = selMed ? selMed.value : '';
    const recepFiltro = selRecep ? selRecep.value : '';

    // Filtrar los turnos en memoria del período actual
    const turnosFiltrados = filtrarTurnosPorRango(cacheTurnos, fDesde, fHasta, {
        especialidad: espFiltro,
        medico: medFiltro,
        creadoPor: recepFiltro
    });

    // Calcular período anterior equivalente para comparativas
    const difDias = fDesde && fHasta 
        ? Math.max(1, Math.round((Date.parse(fHasta) - Date.parse(fDesde)) / 86400000)) 
        : 30;
    
    const fechaPrevHasta = new Date(Date.parse(fDesde) - 86400000).toISOString().split('T')[0];
    const fechaPrevDesde = new Date(Date.parse(fechaPrevHasta) - difDias * 86400000).toISOString().split('T')[0];

    const turnosPrevios = filtrarTurnosPorRango(cacheTurnos, fechaPrevDesde, fechaPrevHasta, {
        especialidad: espFiltro,
        medico: medFiltro,
        creadoPor: recepFiltro
    });

    // Control de estado vacío
    const vacioContainer = document.getElementById('metricas-estado-vacio');
    const vistasContainer = document.getElementById('metricas-vistas-container');

    if (turnosFiltrados.length === 0) {
        if (vacioContainer) vacioContainer.classList.remove('hidden');
        if (vistasContainer) vistasContainer.classList.add('hidden');
        return;
    } else {
        if (vacioContainer) vacioContainer.classList.add('hidden');
        if (vistasContainer) vistasContainer.classList.remove('hidden');
    }

    if (subvistaActiva === 'general') {
        renderizarSubvistaGeneral(turnosFiltrados, turnosPrevios, fHasta);
    } else if (subvistaActiva === 'medico') {
        renderizarSubvistaMedico(turnosFiltrados, medFiltro);
    } else if (subvistaActiva === 'recepcion') {
        renderizarSubvistaRecepcion(turnosFiltrados, recepFiltro);
    } else if (subvistaActiva === 'comparador') {
        renderizarSubvistaComparador(turnosFiltrados);
    }
}

/**
 * Cambia la sub-vista activa de la pestaña de Métricas.
 */
export function cambiarSubvistaMetricas(vista) {
    subvistaActiva = vista;
    document.querySelectorAll('.btn-subvista-metricas').forEach(b => {
        b.classList.remove('active', 'bg-slate-900', 'bg-neutral-900', 'text-white', 'shadow-xs');
        b.classList.add('bg-white', 'text-slate-600', 'hover:bg-slate-100');
    });

    const btn = document.getElementById(`btn-subvista-${vista}`);
    if (btn) {
        btn.classList.add('active', 'bg-slate-900', 'text-white', 'shadow-xs');
        btn.classList.remove('bg-white', 'text-slate-600', 'hover:bg-slate-100');
    }

    document.querySelectorAll('.subvista-panel-metricas').forEach(p => p.classList.add('hidden'));
    const panel = document.getElementById(`panel-subvista-${vista}`);
    if (panel) panel.classList.remove('hidden');

    actualizarVistaMetricas();
}

/**
 * Atajos de rango de fechas: Hoy, 7 días, 30 días, Este mes.
 */
export function aplicarFiltroAtajoFecha(tipo) {
    const inputDesde = document.getElementById('metricas-fecha-desde');
    const inputHasta = document.getElementById('metricas-fecha-hasta');
    if (!inputDesde || !inputHasta) return;

    const hoy = new Date();
    const hoyStr = hoy.toISOString().split('T')[0];

    document.querySelectorAll('.btn-atajo-fecha').forEach(b => {
        b.classList.remove('bg-slate-900', 'bg-teal-700', 'text-white', 'border-slate-900', 'border-teal-800');
        b.classList.add('bg-white', 'text-slate-700', 'border-slate-300');
    });

    const btn = document.getElementById(`btn-atajo-${tipo}`);
    if (btn) {
        btn.classList.add('bg-slate-900', 'text-white', 'border-slate-900');
        btn.classList.remove('bg-white', 'text-slate-700', 'border-slate-300');
    }

    if (tipo === 'hoy') {
        inputDesde.value = hoyStr;
        inputHasta.value = hoyStr;
    } else if (tipo === '7dias') {
        const d = new Date(Date.now() - 7 * 86400000);
        inputDesde.value = d.toISOString().split('T')[0];
        inputHasta.value = hoyStr;
    } else if (tipo === '30dias') {
        const d = new Date(Date.now() - 30 * 86400000);
        inputDesde.value = d.toISOString().split('T')[0];
        inputHasta.value = hoyStr;
    } else if (tipo === 'mes') {
        const primerDia = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
        inputDesde.value = primerDia.toISOString().split('T')[0];
        inputHasta.value = hoyStr;
    }

    cargarDatosMetricasFirestore(false).then(() => {
        actualizarVistaMetricas();
    });
}

// ==========================================
// 1. SUB-VISTA: GENERAL E INSTITUCIONAL
// ==========================================
function renderizarSubvistaGeneral(turnosActuales, turnosPrevios, fechaCorte) {
    const mg = calcularMetricasGenerales(turnosActuales, turnosPrevios, fechaCorte);

    // 1. Render de Tarjetas KPI
    renderizarTarjetasKPIGeneral(mg);

    // 2. Conclusiones automáticas en lenguaje natural
    const boxConclusiones = document.getElementById('metricas-conclusiones-texto');
    if (boxConclusiones) {
        if (mg.conclusionesAutomaticas.length > 0) {
            boxConclusiones.innerHTML = mg.conclusionesAutomaticas.map(c => `
                <li class="flex items-start gap-2">
                    <span class="text-teal-600 font-bold">•</span>
                    <span>${escaparHTML(c)}</span>
                </li>
            `).join('');
        } else {
            boxConclusiones.innerHTML = '<li>Datos de operación estables dentro de los parámetros esperados.</li>';
        }
    }

    // 3. Gráfico de Líneas: Evolución de Turnos por Día
    renderizarGraficoEvolucionDiaria(mg.serieTendencia);

    // 4. Gráfico de Dona: Mix de Canales
    renderizarGraficoMixCanales(mg.mixCanal);

    // 5. Gráficos de Barras Horizontales: Rankings por Especialidad
    renderizarGraficoRankings(mg.rankings);

    // 6. Mapa de Calor (Heatmap) CSS: Día de la semana x Franja Horaria
    renderizarMapaCalorCSS(mg.mapaCalor);
}

function renderizarTarjetasKPIGeneral(mg) {
    const kpis = [
        {
            clave: 'ocupacion',
            titulo: 'Ocupación de Agenda',
            valor: mg.kpis.ocupacion.valor,
            unidad: '%',
            variacion: mg.kpis.ocupacion.variacion,
            semaforo: mg.kpis.ocupacion.semaforo,
            icono: `<svg class="w-4 h-4 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>`
        },
        {
            clave: 'ausentismo',
            titulo: 'Tasa de Ausentismo',
            valor: mg.kpis.ausentismo.valor,
            unidad: '%',
            variacion: mg.kpis.ausentismo.variacion,
            semaforo: mg.kpis.ausentismo.semaforo,
            icono: `<svg class="w-4 h-4 text-amber-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"></path></svg>`
        },
        {
            clave: 'esperaMinutos',
            titulo: 'Espera en Sala Promedio',
            valor: mg.kpis.esperaMinutos.valor,
            unidad: ' min',
            variacion: mg.kpis.esperaMinutos.variacion,
            semaforo: mg.kpis.esperaMinutos.semaforo,
            icono: `<svg class="w-4 h-4 text-blue-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`
        },
        {
            clave: 'tasaAtencion',
            titulo: 'Atención Efectiva',
            valor: mg.kpis.tasaAtencion.valor,
            unidad: '%',
            variacion: mg.kpis.tasaAtencion.variacion,
            semaforo: mg.kpis.tasaAtencion.semaforo,
            icono: `<svg class="w-4 h-4 text-emerald-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`
        },
        {
            clave: 'turnosWeb',
            titulo: 'Adopción Canal Web',
            valor: mg.kpis.turnosWeb.valor,
            unidad: '%',
            variacion: mg.kpis.turnosWeb.variacion,
            semaforo: mg.kpis.turnosWeb.semaforo,
            icono: `<svg class="w-4 h-4 text-sky-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"></path></svg>`
        }
    ];

    const container = document.getElementById('metricas-kpi-grid');
    if (!container) return;

    container.innerHTML = kpis.map(k => {
        const valStr = k.valor !== null ? `${k.valor.toFixed(1)}${k.unidad}` : 'Sin datos';
        
        let variacionHtml = '<span class="text-[11px] text-slate-400">Sin período previo</span>';
        if (k.variacion !== null) {
            const esMejora = (k.clave === 'ausentismo' || k.clave === 'esperaMinutos') 
                ? k.variacion < 0 
                : k.variacion > 0;
            const flecha = k.variacion > 0 ? '▲' : '▼';
            const colorVar = esMejora ? 'text-emerald-800 bg-emerald-50 border-emerald-200' : 'text-rose-800 bg-rose-50 border-rose-200';
            variacionHtml = `<span class="inline-flex items-center gap-0.5 text-[11px] font-bold font-mono px-1.5 py-0.5 rounded border ${colorVar}">
                ${flecha} ${Math.abs(k.variacion)} pts
            </span> <span class="text-[11px] text-slate-500 ml-1">vs ant.</span>`;
        }

        return `
            <div class="card-his bg-white/95 backdrop-blur p-4 shadow-xs flex flex-col justify-between hover:shadow-sm transition">
                <div>
                    <div class="flex items-center justify-between gap-2 mb-2">
                        <div class="flex items-center gap-1.5">
                            <span class="p-1.5 bg-slate-100 rounded-md">${k.icono}</span>
                            <span class="text-xs font-bold uppercase tracking-wider text-slate-600">${k.titulo}</span>
                        </div>
                        <button onclick="window.mostrarInfoMetrica('${k.clave}')" class="text-slate-400 hover:text-slate-800 transition p-0.5" title="Ver explicación y fórmula">
                            <span class="inline-flex items-center justify-center w-4 h-4 rounded-full border border-slate-300 font-bold text-[10px]">i</span>
                        </button>
                    </div>

                    <div class="flex items-baseline justify-between mt-2">
                        <span class="text-2xl sm:text-3xl font-extrabold text-slate-900 font-mono tracking-tight">${valStr}</span>
                    </div>

                    <div class="mt-2.5">
                        <span class="badge-his text-[11px] ${k.semaforo.claseBadge}" title="${k.semaforo.textoAccesible}">
                            ${k.semaforo.etiqueta} • ${k.semaforo.textoAccesible}
                        </span>
                    </div>
                </div>

                <div class="pt-3 mt-3 border-t border-slate-100 flex items-center justify-between">
                    ${variacionHtml}
                </div>
            </div>
        `;
    }).join('');
}

// ------------------------------------------
// Gráfico 1: Evolución Temporal Diaria (Líneas)
// ------------------------------------------
function renderizarGraficoEvolucionDiaria(seriePorDia = []) {
    const canvas = document.getElementById('chart-evolucion-diaria');
    if (!canvas || !window.Chart) return;

    if (chartsInstancias.evolucion) {
        chartsInstancias.evolucion.destroy();
    }

    const etiquetas = seriePorDia.map(s => s.fecha.slice(5)); // 'MM-DD'
    const datosAsignados = seriePorDia.map(s => s.asignados);
    const datosAtendidos = seriePorDia.map(s => s.atendidos);
    const datosAusentes = seriePorDia.map(s => s.ausentes);

    chartsInstancias.evolucion = new window.Chart(canvas, {
        type: 'line',
        data: {
            labels: etiquetas,
            datasets: [
                {
                    label: 'Asignados',
                    data: datosAsignados,
                    borderColor: '#0284c7', // Sky 600
                    backgroundColor: 'rgba(2, 132, 199, 0.06)',
                    fill: true,
                    tension: 0.3,
                    borderWidth: 2,
                    pointRadius: 2.5,
                    pointHoverRadius: 5
                },
                {
                    label: 'Atendidos',
                    data: datosAtendidos,
                    borderColor: '#0f766e', // Teal 700
                    backgroundColor: 'rgba(15, 118, 110, 0.04)',
                    borderWidth: 2,
                    tension: 0.3,
                    pointRadius: 2.5,
                    pointHoverRadius: 5
                },
                {
                    label: 'Ausentes',
                    data: datosAusentes,
                    borderColor: '#b45309', // Amber 700
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    borderDash: [4, 4],
                    tension: 0.3,
                    pointRadius: 2.5,
                    pointHoverRadius: 5
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false
            },
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        boxWidth: 12,
                        padding: 14,
                        font: { weight: 'bold', size: 11 }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: '#f1f5f9' },
                    ticks: { color: '#64748b', font: { size: 10 } }
                },
                y: {
                    beginAtZero: true,
                    grid: { color: '#f1f5f9' },
                    ticks: { precision: 0, color: '#64748b', font: { size: 10 } }
                }
            }
        }
    });
}

// ------------------------------------------
// Gráfico 2: Mix de Canales (Dona)
// ------------------------------------------
function renderizarGraficoMixCanales(mixCanal) {
    const canvas = document.getElementById('chart-mix-canales');
    if (!canvas || !window.Chart) return;

    if (chartsInstancias.canales) {
        chartsInstancias.canales.destroy();
    }

    const labels = ['Portal Web', 'Presencial Ventanilla', 'Consultorio'];
    const valores = [mixCanal.web || 0, mixCanal.presencial || 0, mixCanal.consultorio || 0];

    chartsInstancias.canales = new window.Chart(canvas, {
        type: 'doughnut',
        data: {
            labels,
            datasets: [{
                data: valores,
                backgroundColor: ['#0f766e', '#1e3a8a', '#475569'], // Teal 700, Blue 900, Slate 600
                borderColor: '#ffffff',
                borderWidth: 2,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        boxWidth: 12,
                        padding: 12,
                        font: { weight: 'bold', size: 11 }
                    }
                }
            },
            cutout: '70%'
        }
    });
}

// ------------------------------------------
// Gráfico 3: Rankings por Especialidad (Barras Horizontales)
// ------------------------------------------
function renderizarGraficoRankings(rankings) {
    const canvasAus = document.getElementById('chart-ranking-ausentismo');
    const canvasOcup = document.getElementById('chart-ranking-ocupacion');
    if (!window.Chart) return;

    if (canvasAus) {
        if (chartsInstancias.rankingAus) chartsInstancias.rankingAus.destroy();
        const topAus = (rankings.ausentismo || []).slice(0, 5);
        chartsInstancias.rankingAus = new window.Chart(canvasAus, {
            type: 'bar',
            data: {
                labels: topAus.map(r => r.especialidad),
                datasets: [{
                    label: 'Ausentismo %',
                    data: topAus.map(r => r.ausentismoPct),
                    backgroundColor: '#b45309', // Amber 700
                    borderRadius: 4
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: {
                        beginAtZero: true,
                        max: 100,
                        grid: { color: '#f1f5f9' },
                        ticks: { callback: v => `${v}%`, color: '#64748b', font: { size: 10 } }
                    },
                    y: {
                        grid: { display: false },
                        ticks: { color: '#334155', font: { size: 11, weight: 'bold' } }
                    }
                }
            }
        });
    }

    if (canvasOcup) {
        if (chartsInstancias.rankingOcup) chartsInstancias.rankingOcup.destroy();
        const topOcup = (rankings.ocupacion || []).slice(0, 5);
        chartsInstancias.rankingOcup = new window.Chart(canvasOcup, {
            type: 'bar',
            data: {
                labels: topOcup.map(r => r.especialidad),
                datasets: [{
                    label: 'Ocupación %',
                    data: topOcup.map(r => r.ocupacionPct),
                    backgroundColor: '#0f766e', // Teal 700
                    borderRadius: 4
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: {
                        beginAtZero: true,
                        max: 100,
                        grid: { color: '#f1f5f9' },
                        ticks: { callback: v => `${v}%`, color: '#64748b', font: { size: 10 } }
                    },
                    y: {
                        grid: { display: false },
                        ticks: { color: '#334155', font: { size: 11, weight: 'bold' } }
                    }
                }
            }
        });
    }
}

// ------------------------------------------
// Mapa de Calor (Heatmap) CSS: Día x Hora
// ------------------------------------------
function renderizarMapaCalorCSS(mapaCalor) {
    const contenedor = document.getElementById('heatmap-grid-container');
    if (!contenedor) return;

    const max = Math.max(1, mapaCalor.maxDensidad || 1);
    const nombresDias = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];

    let html = `
        <div class="overflow-x-auto">
            <table class="w-full text-center border-collapse text-xs">
                <thead>
                    <tr>
                        <th class="p-2 text-left text-slate-500 font-bold">Día / Hora</th>
                        ${mapaCalor.franjas.map(f => `<th class="p-2 text-slate-600 font-bold">${f}</th>`).join('')}
                    </tr>
                </thead>
                <tbody>
    `;

    [1, 2, 3, 4, 5].forEach(d => {
        html += `
            <tr class="border-t border-slate-100">
                <td class="p-2.5 text-left font-bold text-slate-700 bg-slate-50/70 whitespace-nowrap">${nombresDias[d - 1]}</td>
        `;
        mapaCalor.franjas.forEach(f => {
            const count = mapaCalor.matriz[d] ? (mapaCalor.matriz[d][f] || 0) : 0;
            const ratio = count / max;
            
            // Escala de color de verde suave a teal intenso
            let bgEstilo = 'background-color: #f8fafc; color: #94a3b8;';
            if (count > 0) {
                if (ratio < 0.25) bgEstilo = 'background-color: #ccfbf1; color: #0f766e; font-weight: bold;';
                else if (ratio < 0.6) bgEstilo = 'background-color: #5eead4; color: #115e59; font-weight: bold;';
                else if (ratio < 0.85) bgEstilo = 'background-color: #14b8a6; color: #ffffff; font-weight: bold;';
                else bgEstilo = 'background-color: #0f766e; color: #ffffff; font-weight: bold;';
            }

            html += `
                <td class="p-2 border border-slate-100 transition hover:scale-105 cursor-default relative group" style="${bgEstilo}" title="${nombresDias[d - 1]} ${f} hs: ${count} turno(s)">
                    <span class="font-mono">${count}</span>
                </td>
            `;
        });
        html += '</tr>';
    });

    html += `
                </tbody>
            </table>
        </div>
    `;

    contenedor.innerHTML = html;
}

// ==========================================
// 2. SUB-VISTA: POR MÉDICO
// ==========================================
function renderizarSubvistaMedico(turnosFiltrados, medicoUidFiltro) {
    const selMed = document.getElementById('metricas-filtro-medico');
    const medUid = medicoUidFiltro || (selMed ? selMed.value : '');

    // Si no hay médico seleccionado, elegir el primero disponible
    let turnosDelMedico = turnosFiltrados;
    let nombreMedico = 'Seleccione un Profesional';

    if (medUid) {
        turnosDelMedico = turnosFiltrados.filter(t => t.medicoUid === medUid || t.medico === medUid);
        if (turnosDelMedico.length > 0) {
            nombreMedico = turnosDelMedico[0].medico;
        }
    } else if (turnosFiltrados.length > 0) {
        const primerMedUid = turnosFiltrados[0].medicoUid;
        nombreMedico = turnosFiltrados[0].medico;
        turnosDelMedico = turnosFiltrados.filter(t => t.medicoUid === primerMedUid);
        if (selMed) selMed.value = primerMedUid;
    }

    const mm = calcularMetricasMedico(turnosDelMedico);
    const espMedico = turnosDelMedico.length > 0 ? turnosDelMedico[0].especialidad : 'General';
    const turnosEspecialidad = turnosFiltrados.filter(t => t.especialidad === espMedico);
    const mmEspecialidad = calcularMetricasMedico(turnosEspecialidad);

    const tituloMed = document.getElementById('metricas-medico-nombre-titulo');
    if (tituloMed) tituloMed.innerText = `${nombreMedico} (${espMedico})`;

    // Render de KPIs propios del médico
    const kpisMedContainer = document.getElementById('metricas-medico-kpis');
    if (kpisMedContainer) {
        const semOcup = evaluarSemaforo(mm.ocupacionPct, 'ocupacion');
        const semAus = evaluarSemaforo(mm.ausentismoPct, 'ausentismo');
        const semEsp = evaluarSemaforo(mm.tiempoEsperaPromedioMin, 'esperaMinutos');

        kpisMedContainer.innerHTML = `
            <div class="card-his bg-white/95 backdrop-blur p-4 shadow-xs">
                <span class="text-xs font-bold uppercase tracking-wider text-slate-500">Ocupación Agenda</span>
                <p class="text-2xl font-extrabold text-slate-900 mt-1 font-mono tracking-tight">${mm.ocupacionPct !== null ? mm.ocupacionPct.toFixed(1) + '%' : 'Sin datos'}</p>
                <div class="mt-2">
                    <span class="badge-his text-[11px] ${semOcup.claseBadge}" title="${semOcup.textoAccesible}">
                        ${semOcup.etiqueta} • ${semOcup.textoAccesible}
                    </span>
                </div>
            </div>
            <div class="card-his bg-white/95 backdrop-blur p-4 shadow-xs">
                <span class="text-xs font-bold uppercase tracking-wider text-slate-500">Tasa Ausentismo</span>
                <p class="text-2xl font-extrabold text-slate-900 mt-1 font-mono tracking-tight">${mm.ausentismoPct !== null ? mm.ausentismoPct.toFixed(1) + '%' : 'Sin datos'}</p>
                <div class="mt-2">
                    <span class="badge-his text-[11px] ${semAus.claseBadge}" title="${semAus.textoAccesible}">
                        ${semAus.etiqueta} • ${semAus.textoAccesible}
                    </span>
                </div>
            </div>
            <div class="card-his bg-white/95 backdrop-blur p-4 shadow-xs">
                <span class="text-xs font-bold uppercase tracking-wider text-slate-500">Espera Promedio</span>
                <p class="text-2xl font-extrabold text-slate-900 mt-1 font-mono tracking-tight">${mm.tiempoEsperaPromedioMin !== null ? mm.tiempoEsperaPromedioMin.toFixed(0) + ' min' : 'Sin datos'}</p>
                <div class="mt-2">
                    <span class="badge-his text-[11px] ${semEsp.claseBadge}" title="${semEsp.textoAccesible}">
                        ${semEsp.etiqueta} • ${semEsp.textoAccesible}
                    </span>
                </div>
            </div>
            <div class="card-his bg-white/95 backdrop-blur p-4 shadow-xs">
                <span class="text-xs font-bold uppercase tracking-wider text-slate-500">Consultas Cerradas</span>
                <p class="text-2xl font-extrabold text-slate-900 mt-1 font-mono tracking-tight">${mm.porcentajeEvolucionCerrada !== null ? mm.porcentajeEvolucionCerrada.toFixed(1) + '%' : 'Sin datos'}</p>
                <span class="text-[11px] text-slate-500 inline-block mt-2 font-medium">${mm.atendidos} pacientes atendidos</span>
            </div>
        `;
    }

    // Gráfico 1 Médico: Duración Real vs Programada
    const canvasDuracion = document.getElementById('chart-medico-duracion');
    if (canvasDuracion && window.Chart) {
        if (chartsInstancias.medicoDuracion) chartsInstancias.medicoDuracion.destroy();
        chartsInstancias.medicoDuracion = new window.Chart(canvasDuracion, {
            type: 'bar',
            data: {
                labels: ['Minutos por Consulta'],
                datasets: [
                    {
                        label: 'Duración Real Promedio',
                        data: [mm.duracionRealPromedioMin || 0],
                        backgroundColor: '#0f766e',
                        borderRadius: 4
                    },
                    {
                        label: 'Duración Programada (Modulación)',
                        data: [mm.duracionProgramadaMin || 15],
                        backgroundColor: '#94a3b8',
                        borderRadius: 4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { boxWidth: 12, padding: 12, font: { weight: 'bold', size: 11 } }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { color: '#334155', font: { weight: 'bold' } }
                    },
                    y: {
                        beginAtZero: true,
                        grid: { color: '#f1f5f9' },
                        ticks: { callback: v => `${v} min`, color: '#64748b', font: { size: 10 } }
                    }
                }
            }
        });
    }

    // Gráfico 2 Médico: Comparativa contra Promedio de Especialidad
    const canvasComp = document.getElementById('chart-medico-comparativa');
    if (canvasComp && window.Chart) {
        if (chartsInstancias.medicoComp) chartsInstancias.medicoComp.destroy();
        chartsInstancias.medicoComp = new window.Chart(canvasComp, {
            type: 'bar',
            data: {
                labels: ['Ocupación (%)', 'Ausentismo (%)', 'Atención Efectiva (%)'],
                datasets: [
                    {
                        label: nombreMedico,
                        data: [mm.ocupacionPct || 0, mm.ausentismoPct || 0, mm.tasaAtencionPct || 0],
                        backgroundColor: '#0284c7',
                        borderRadius: 4
                    },
                    {
                        label: `Promedio Especialidad (${espMedico})`,
                        data: [mmEspecialidad.ocupacionPct || 0, mmEspecialidad.ausentismoPct || 0, mmEspecialidad.tasaAtencionPct || 0],
                        backgroundColor: '#cbd5e1',
                        borderRadius: 4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { boxWidth: 12, padding: 12, font: { weight: 'bold', size: 11 } }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { color: '#334155', font: { weight: 'bold' } }
                    },
                    y: {
                        beginAtZero: true,
                        max: 100,
                        grid: { color: '#f1f5f9' },
                        ticks: { callback: v => `${v}%`, color: '#64748b', font: { size: 10 } }
                    }
                }
            }
        });
    }
}

// ==========================================
// 3. SUB-VISTA: POR RECEPCIÓN Y OPERADORES
// ==========================================
function renderizarSubvistaRecepcion(turnosFiltrados, operadorUidFiltro) {
    const mr = calcularMetricasRecepcion(turnosFiltrados, cacheUsuariosPersonal);

    const kpisRecepContainer = document.getElementById('metricas-recepcion-kpis');
    if (kpisRecepContainer) {
        kpisRecepContainer.innerHTML = `
            <div class="card-his bg-white/95 backdrop-blur p-4 shadow-xs">
                <span class="text-xs font-bold uppercase tracking-wider text-slate-500">Puntaje Calidad de Carga</span>
                <p class="text-2xl font-extrabold text-slate-900 mt-1 font-mono tracking-tight">${mr.calidadCarga.puntajeCalidadPct !== null ? mr.calidadCarga.puntajeCalidadPct.toFixed(0) + ' / 100' : 'Sin datos'}</p>
                <span class="text-[11px] text-slate-500 font-medium inline-block mt-2">DNI duplicados: ${mr.calidadCarga.dnisDuplicados}</span>
            </div>
            <div class="card-his bg-white/95 backdrop-blur p-4 shadow-xs">
                <span class="text-xs font-bold uppercase tracking-wider text-slate-500">Sin Correo Electrónico</span>
                <p class="text-2xl font-extrabold text-slate-900 mt-1 font-mono tracking-tight">${mr.calidadCarga.sinEmailPct !== null ? mr.calidadCarga.sinEmailPct.toFixed(1) + '%' : '0%'}</p>
                <span class="text-[11px] text-slate-500 font-medium inline-block mt-2">${mr.calidadCarga.sinEmail} turnos presenciales</span>
            </div>
            <div class="card-his bg-white/95 backdrop-blur p-4 shadow-xs">
                <span class="text-xs font-bold uppercase tracking-wider text-slate-500">Tasa de Cancelación</span>
                <p class="text-2xl font-extrabold text-slate-900 mt-1 font-mono tracking-tight">${mr.tasaCancelacionPct !== null ? mr.tasaCancelacionPct.toFixed(1) + '%' : '0%'}</p>
                <span class="text-[11px] text-slate-500 font-medium inline-block mt-2">Total cancelados: ${mr.cancelacionesPorActor.total}</span>
            </div>
            <div class="card-his bg-white/95 backdrop-blur p-4 shadow-xs">
                <span class="text-xs font-bold uppercase tracking-wider text-slate-500">Puntualidad Check-In</span>
                <p class="text-2xl font-extrabold text-slate-900 mt-1 font-mono tracking-tight">${mr.tiempoCheckInPromedioMin !== null ? Math.abs(mr.tiempoCheckInPromedioMin).toFixed(0) + ' min ' + (mr.tiempoCheckInPromedioMin >= 0 ? 'antes' : 'tarde') : 'En horario'}</p>
                <span class="text-[11px] text-slate-500 font-medium inline-block mt-2">Anticipación media</span>
            </div>
        `;
    }

    // Gráfico de Turnos por Operador / Persona
    const canvasPersonas = document.getElementById('chart-recepcion-personas');
    if (canvasPersonas && window.Chart) {
        if (chartsInstancias.recepPersonas) chartsInstancias.recepPersonas.destroy();
        chartsInstancias.recepPersonas = new window.Chart(canvasPersonas, {
            type: 'bar',
            data: {
                labels: mr.turnosPorPersona.map(p => p.nombre),
                datasets: [{
                    label: 'Turnos Asignados',
                    data: mr.turnosPorPersona.map(p => p.cantidad),
                    backgroundColor: '#0f766e',
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { color: '#334155', font: { size: 10, weight: 'bold' } }
                    },
                    y: {
                        beginAtZero: true,
                        grid: { color: '#f1f5f9' },
                        ticks: { precision: 0, color: '#64748b', font: { size: 10 } }
                    }
                }
            }
        });
    }

    // Gráfico de Torta: Cancelaciones por Actor
    const canvasCancel = document.getElementById('chart-recepcion-cancelaciones');
    if (canvasCancel && window.Chart) {
        if (chartsInstancias.recepCancel) chartsInstancias.recepCancel.destroy();
        chartsInstancias.recepCancel = new window.Chart(canvasCancel, {
            type: 'pie',
            data: {
                labels: ['Paciente', 'Recepción', 'Médico', 'Otros'],
                datasets: [{
                    data: [
                        mr.cancelacionesPorActor.paciente,
                        mr.cancelacionesPorActor.recepcion,
                        mr.cancelacionesPorActor.medico,
                        mr.cancelacionesPorActor.sinEspecificar
                    ],
                    backgroundColor: ['#0284c7', '#e11d48', '#d97706', '#94a3b8'], // Sky 600, Rose 600, Amber 600, Slate 400
                    borderColor: '#ffffff',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { boxWidth: 12, padding: 12, font: { weight: 'bold', size: 11 } }
                    }
                }
            }
        });
    }
}

// ==========================================
// 4. SUB-VISTA: COMPARADOR DE ENTIDADES
// ==========================================
function renderizarSubvistaComparador(turnosFiltrados) {
    const selA = document.getElementById('comparador-select-a');
    const selB = document.getElementById('comparador-select-b');
    if (!selA || !selB) return;

    const uidA = selA.value;
    const uidB = selB.value;

    const turnosA = turnosFiltrados.filter(t => t.medicoUid === uidA || t.medico === uidA);
    const turnosB = turnosFiltrados.filter(t => t.medicoUid === uidB || t.medico === uidB);

    const nomA = selA.options[selA.selectedIndex]?.text || 'Profesional A';
    const nomB = selB.options[selB.selectedIndex]?.text || 'Profesional B';

    const mA = calcularMetricasMedico(turnosA);
    const mB = calcularMetricasMedico(turnosB);

    const comparativa = compararEntidades(mA, mB, nomA, nomB);
    const tablaTbody = document.getElementById('comparador-tbody');

    if (tablaTbody && comparativa) {
        tablaTbody.innerHTML = comparativa.comparaciones.map(c => `
            <tr class="hover:bg-slate-50/80 transition border-b border-slate-100">
                <td class="p-3 font-bold text-slate-800">${escaparHTML(c.indicador)}</td>
                <td class="p-3 text-center">
                    <span class="font-extrabold text-slate-900 font-mono">${c.valorA}</span>
                    <span class="badge-his text-[10px] ${c.semaforoA.claseBadge} ml-2">${c.semaforoA.etiqueta}</span>
                </td>
                <td class="p-3 text-center">
                    <span class="font-extrabold text-slate-900 font-mono">${c.valorB}</span>
                    <span class="badge-his text-[10px] ${c.semaforoB.claseBadge} ml-2">${c.semaforoB.etiqueta}</span>
                </td>
                <td class="p-3 text-center font-mono font-bold ${c.diferencia !== null && c.diferencia > 0 ? 'text-teal-700' : 'text-slate-600'}">
                    ${c.diferencia !== null ? (c.diferencia > 0 ? `+${c.diferencia}` : c.diferencia) : 'N/D'}
                </td>
            </tr>
        `).join('');
    }
}

// ==========================================
// MODAL / TOOLTIP INFORMATIVO INTERACTIVO
// ==========================================
export function mostrarInfoMetrica(clave) {
    const info = DICCIONARIO_METRICAS_INFO[clave];
    if (!info) return;

    const modal = document.getElementById('modal-metrica-info');
    const titulo = document.getElementById('modal-metrica-titulo');
    const queMide = document.getElementById('modal-metrica-quemide');
    const formula = document.getElementById('modal-metrica-formula');
    const comoLeer = document.getElementById('modal-metrica-comoleer');
    const umbralTexto = document.getElementById('modal-metrica-umbrales');

    if (titulo) titulo.innerText = info.titulo;
    if (queMide) queMide.innerText = info.queMide;
    if (formula) formula.innerText = info.formula;
    if (comoLeer) comoLeer.innerText = info.comoLeerlo;

    if (umbralTexto && info.claveSemaforo && CONFIG_UMBRALES[info.claveSemaforo]) {
        const u = CONFIG_UMBRALES[info.claveSemaforo];
        if (u.tipo === 'mayor_es_mejor') {
            umbralTexto.innerText = `Óptimo: ≥ ${u.verdeMin}${u.unidad} | Alerta: ${u.amarilloMin} a ${u.verdeMin - 0.1}${u.unidad} | Crítico: < ${u.amarilloMin}${u.unidad}`;
        } else {
            umbralTexto.innerText = `Óptimo: ≤ ${u.verdeMax}${u.unidad} | Alerta: ${u.verdeMax + 0.1} a ${u.amarilloMax}${u.unidad} | Crítico: > ${u.amarilloMax}${u.unidad}`;
        }
    } else if (umbralTexto) {
        umbralTexto.innerText = 'Indicador descriptivo continuo sin umbral prefijado.';
    }

    if (modal) {
        modal.classList.add('active');
        modal.classList.remove('hidden');
    }
}

export function cerrarModalInfoMetrica() {
    const modal = document.getElementById('modal-metrica-info');
    if (modal) {
        modal.classList.remove('active');
        modal.classList.add('hidden');
    }
}

// ==========================================
// DESCARGA DE GRÁFICO COMO IMAGEN (toBlob)
// ==========================================
export function descargarGraficoImagen(canvasId, nombreArchivo = 'grafico-schestakow') {
    const canvas = document.getElementById(canvasId);
    if (!canvas) {
        mostrarAlerta("Error", "No se encontró el elemento del gráfico para exportar.");
        return;
    }

    try {
        canvas.toBlob((blob) => {
            if (!blob) {
                mostrarAlerta("Error", "No se pudo generar la imagen del gráfico.");
                return;
            }
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${nombreArchivo}-${new Date().toISOString().split('T')[0]}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            mostrarToast("El gráfico se descargó en alta resolución.", "exito");
            mostrarExito("Imagen Descargada", "El gráfico se descargó en alta resolución.");
        }, 'image/png', 1.0);
    } catch (e) {
        console.error("Error al exportar gráfico a imagen:", e);
        mostrarAlerta("Error", "Fallo al exportar el gráfico.");
    }
}

// ==========================================
// EXPORTACIÓN DE MÉTRICAS A EXCEL (SheetJS)
// ==========================================
export function exportarMetricasAExcel() {
    if (!window.XLSX) {
        mostrarAlerta("Librería no disponible", "La biblioteca de exportación a Excel no está disponible.");
        return;
    }

    const inputDesde = document.getElementById('metricas-fecha-desde');
    const inputHasta = document.getElementById('metricas-fecha-hasta');
    const fDesde = inputDesde ? inputDesde.value : '';
    const fHasta = inputHasta ? inputHasta.value : '';

    const turnosActuales = filtrarTurnosPorRango(cacheTurnos, fDesde, fHasta);
    if (turnosActuales.length === 0) {
        mostrarAlerta("Sin Datos", "No hay métricas para exportar en el rango de fechas seleccionado.");
        return;
    }

    const mg = calcularMetricasGenerales(turnosActuales, [], fHasta);
    const mr = calcularMetricasRecepcion(turnosActuales, cacheUsuariosPersonal);

    // Hoja 1: Resumen General
    const datosResumen = [
        ["HOSPITAL TEODORO J. SCHESTAKOW - REPORTE DE GESTIÓN Y RENDIMIENTO"],
        ["Período Analizado:", `Desde ${fDesde || 'Inicio'} hasta ${fHasta || 'Hoy'}`],
        ["Fecha de Generación:", new Date().toLocaleString('es-AR')],
        [],
        ["INDICADOR", "VALOR", "EVALUACIÓN SEMAFÓRICA"],
        ["Ocupación de Agenda", mg.kpis.ocupacion.valor !== null ? `${mg.kpis.ocupacion.valor.toFixed(1)}%` : "N/D", mg.kpis.ocupacion.semaforo.textoAccesible],
        ["Tasa de Ausentismo", mg.kpis.ausentismo.valor !== null ? `${mg.kpis.ausentismo.valor.toFixed(1)}%` : "N/D", mg.kpis.ausentismo.semaforo.textoAccesible],
        ["Tiempo de Espera en Sala", mg.kpis.esperaMinutos.valor !== null ? `${mg.kpis.esperaMinutos.valor.toFixed(1)} min` : "N/D", mg.kpis.esperaMinutos.semaforo.textoAccesible],
        ["Tasa de Atención Efectiva", mg.kpis.tasaAtencion.valor !== null ? `${mg.kpis.tasaAtencion.valor.toFixed(1)}%` : "N/D", mg.kpis.tasaAtencion.semaforo.textoAccesible],
        ["Adopción Canal Web", mg.kpis.turnosWeb.valor !== null ? `${mg.kpis.turnosWeb.valor.toFixed(1)}%` : "N/D", mg.kpis.turnosWeb.semaforo.textoAccesible],
        ["Volumen Total de Turnos", mg.totalTurnos, "Total registros período"]
    ];

    // Hoja 2: Especialidades
    const datosEspecialidades = [
        ["ESPECIALIDAD", "VOLUMEN ASIGNADO", "ATENDIDOS", "AUSENTES", "CANCELADOS", "AUSENTISMO (%)", "OCUPACIÓN (%)"]
    ];
    (mg.rankings.ausentismo || []).forEach(esp => {
        datosEspecialidades.push([
            esp.especialidad,
            esp.total,
            esp.atendidos,
            esp.ausentes,
            esp.cancelados,
            esp.ausentismoPct,
            esp.ocupacionPct
        ]);
    });

    // Hoja 3: Carga por Personal de Recepción
    const datosPersonal = [
        ["PERSONAL / OPERADOR", "TURNOS ASIGNADOS", "PARTICIPACIÓN (%)"]
    ];
    (mr.turnosPorPersona || []).forEach(p => {
        datosPersonal.push([
            p.nombre,
            p.cantidad,
            Number(p.porcentaje.toFixed(1))
        ]);
    });

    const wb = window.XLSX.utils.book_new();
    const wsResumen = window.XLSX.utils.aoa_to_sheet(datosResumen);
    const wsEspecialidades = window.XLSX.utils.aoa_to_sheet(datosEspecialidades);
    const wsPersonal = window.XLSX.utils.aoa_to_sheet(datosPersonal);

    window.XLSX.utils.book_append_sheet(wb, wsResumen, "Resumen General");
    window.XLSX.utils.book_append_sheet(wb, wsEspecialidades, "Especialidades");
    window.XLSX.utils.book_append_sheet(wb, wsPersonal, "Personal Recepción");

    window.XLSX.writeFile(wb, `Reporte-Metricas-Schestakow-${fHasta || 'Hoy'}.xlsx`);
    mostrarToast("Informe de métricas exportado exitosamente a Excel.", "exito");
    mostrarExito("Excel Exportado", "El informe con todas las métricas agregadas fue generado exitosamente.");
}

// Exposición en objeto window para handlers inline de HTML
window.cambiarSubvistaMetricas = cambiarSubvistaMetricas;
window.aplicarFiltroAtajoFecha = aplicarFiltroAtajoFecha;
window.actualizarVistaMetricas = actualizarVistaMetricas;
window.mostrarInfoMetrica = mostrarInfoMetrica;
window.cerrarModalInfoMetrica = cerrarModalInfoMetrica;
window.descargarGraficoImagen = descargarGraficoImagen;
window.exportarMetricasAExcel = exportarMetricasAExcel;
window.iniciarModuloMetricasUI = iniciarModuloMetricasUI;
