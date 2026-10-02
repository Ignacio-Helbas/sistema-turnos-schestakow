/**
 * Módulo de Métricas y Análisis de Rendimiento
 * Hospital Teodoro J. Schestakow (UTN FRSR)
 * 
 * Funciones puras y testeables para el cálculo de indicadores de rendimiento,
 * tiempos operativos, calidad de carga y análisis estadístico.
 * Diseñado como módulo ES puro sin dependencias externas.
 */

// ==========================================
// 1. CONFIGURACIÓN EDITABLE DE UMBRALES (SEMÁFORO)
// ==========================================
export const CONFIG_UMBRALES = {
    ocupacion: {
        verdeMin: 75,      // >= 75%: Óptimo aprovechamiento
        amarilloMin: 50,   // 50% - 74.9%: Alerta / Moderado
        // < 50%: Crítico / Subutilizado
        tipo: 'mayor_es_mejor',
        unidad: '%',
        nombre: 'Ocupación de Agenda',
        descripcion: 'Porcentaje de turnos asignados sobre las franjas horarias disponibles.'
    },
    ausentismo: {
        verdeMax: 10,      // <= 10%: Óptimo
        amarilloMax: 20,   // 10.1% - 20%: Alerta
        // > 20%: Crítico
        tipo: 'menor_es_mejor',
        unidad: '%',
        nombre: 'Tasa de Ausentismo',
        descripcion: 'Porcentaje de turnos donde el paciente no se presentó.'
    },
    esperaMinutos: {
        verdeMax: 15,      // <= 15 min: Óptimo
        amarilloMax: 30,   // 15.1 - 30 min: Aceptable
        // > 30 min: Demora excesiva
        tipo: 'menor_es_mejor',
        unidad: ' min',
        nombre: 'Tiempo de Espera Promedio',
        descripcion: 'Tiempo transcurrido desde el check-in en recepción hasta la atención médica.'
    },
    tasaAtencion: {
        verdeMin: 80,      // >= 80%: Muy bueno
        amarilloMin: 65,   // 65% - 79.9%: Regular
        // < 65%: Bajo
        tipo: 'mayor_es_mejor',
        unidad: '%',
        nombre: 'Tasa de Atención Efectiva',
        descripcion: 'Porcentaje de turnos concretados y atendidos sobre los programados.'
    },
    turnosWeb: {
        verdeMin: 40,      // >= 40%: Excelente adopción digital
        amarilloMin: 20,   // 20% - 39.9%: Adopción moderada
        // < 20%: Baja adopción
        tipo: 'mayor_es_mejor',
        unidad: '%',
        nombre: 'Adopción Canal Web',
        descripcion: 'Porcentaje de turnos autogestionados por pacientes a través de la web.'
    },
    puntualidadInicio: {
        verdeMax: 10,      // <= 10 min de demora respecto al horario asignado
        amarilloMax: 25,
        tipo: 'menor_es_mejor',
        unidad: ' min',
        nombre: 'Desvío de Puntualidad',
        descripcion: 'Demora en minutos entre la hora programada del turno y el llamado a consultorio.'
    }
};

// ==========================================
// 2. HELPERS DE CONVERSIÓN Y FECHAS
// ==========================================

/**
 * Convierte cualquier tipo de timestamp (Firestore Timestamp, Date, string ISO, ms) a milisegundos.
 */
export function extraerMilisegundos(timestamp) {
    if (!timestamp) return null;
    if (typeof timestamp.toMillis === 'function') return timestamp.toMillis();
    if (typeof timestamp.toDate === 'function') return timestamp.toDate().getTime();
    if (timestamp instanceof Date) return isNaN(timestamp.getTime()) ? null : timestamp.getTime();
    if (typeof timestamp === 'number') return isNaN(timestamp) ? null : timestamp;
    if (typeof timestamp.seconds === 'number') {
        return timestamp.seconds * 1000 + Math.floor((timestamp.nanoseconds || 0) / 1000000);
    }
    if (typeof timestamp === 'string') {
        const ms = Date.parse(timestamp);
        return isNaN(ms) ? null : ms;
    }
    return null;
}

/**
 * Convierte un string de hora "HH:mm" y fecha "YYYY-MM-DD" a milisegundos absolutos.
 */
export function convertirFechaHoraAMilisegundos(fechaStr, horaStr) {
    if (!fechaStr || !horaStr) return null;
    const partesFecha = fechaStr.split('-');
    const partesHora = horaStr.split(':');
    if (partesFecha.length !== 3 || partesHora.length !== 2) return null;
    const anio = parseInt(partesFecha[0], 10);
    const mes = parseInt(partesFecha[1], 10) - 1;
    const dia = parseInt(partesFecha[2], 10);
    const hora = parseInt(partesHora[0], 10);
    const minuto = parseInt(partesHora[1], 10);
    if (isNaN(anio) || isNaN(mes) || isNaN(dia) || isNaN(hora) || isNaN(minuto)) return null;
    const d = new Date(anio, mes, dia, hora, minuto, 0, 0);
    return d.getTime();
}

/**
 * Evalúa un valor numérico contra los umbrales configurados y retorna estado semafórico accesible.
 */
export function evaluarSemaforo(valor, claveMetrica) {
    if (valor === null || valor === undefined || typeof valor !== 'number' || isNaN(valor)) {
        return {
            estado: 'sin_datos',
            color: 'slate',
            textoAccesible: 'Sin datos suficientes',
            etiqueta: 'Sin datos',
            valorFormateado: 'Sin datos suficientes',
            claseBadge: 'bg-slate-100 text-slate-700 border border-slate-300'
        };
    }

    const cfg = CONFIG_UMBRALES[claveMetrica];
    if (!cfg) {
        return {
            estado: 'info',
            color: 'blue',
            textoAccesible: 'Informativo',
            etiqueta: 'Info',
            valorFormateado: valor.toFixed(1),
            claseBadge: 'bg-blue-50 text-blue-800 border border-blue-200'
        };
    }

    const valorRedondeado = valor.toFixed(1);

    if (cfg.tipo === 'mayor_es_mejor') {
        if (valor >= cfg.verdeMin) {
            return {
                estado: 'optimo',
                color: 'emerald',
                textoAccesible: 'Óptimo (Verde)',
                etiqueta: 'Óptimo',
                valorFormateado: `${valorRedondeado}${cfg.unidad}`,
                claseBadge: 'bg-emerald-50 text-emerald-800 border border-emerald-300'
            };
        }
        if (valor >= cfg.amarilloMin) {
            return {
                estado: 'alerta',
                color: 'amber',
                textoAccesible: 'Alerta / Moderado (Amarillo)',
                etiqueta: 'Atención',
                valorFormateado: `${valorRedondeado}${cfg.unidad}`,
                claseBadge: 'bg-amber-50 text-amber-800 border border-amber-300'
            };
        }
        return {
            estado: 'critico',
            color: 'rose',
            textoAccesible: 'Crítico (Rojo)',
            etiqueta: 'Crítico',
            valorFormateado: `${valorRedondeado}${cfg.unidad}`,
            claseBadge: 'bg-rose-50 text-rose-800 border border-rose-300'
        };
    } else {
        if (valor <= cfg.verdeMax) {
            return {
                estado: 'optimo',
                color: 'emerald',
                textoAccesible: 'Óptimo (Verde)',
                etiqueta: 'Óptimo',
                valorFormateado: `${valorRedondeado}${cfg.unidad}`,
                claseBadge: 'bg-emerald-50 text-emerald-800 border border-emerald-300'
            };
        }
        if (valor <= cfg.amarilloMax) {
            return {
                estado: 'alerta',
                color: 'amber',
                textoAccesible: 'Alerta / Moderado (Amarillo)',
                etiqueta: 'Atención',
                valorFormateado: `${valorRedondeado}${cfg.unidad}`,
                claseBadge: 'bg-amber-50 text-amber-800 border border-amber-300'
            };
        }
        return {
            estado: 'critico',
            color: 'rose',
            textoAccesible: 'Crítico (Rojo)',
            etiqueta: 'Crítico',
            valorFormateado: `${valorRedondeado}${cfg.unidad}`,
            claseBadge: 'bg-rose-50 text-rose-800 border border-rose-300'
        };
    }
}

/**
 * Filtra un conjunto de turnos por rango de fechas (YYYY-MM-DD) y filtros opcionales.
 */
export function filtrarTurnosPorRango(turnos = [], fechaInicio = '', fechaFin = '', filtros = {}) {
    if (!Array.isArray(turnos)) return [];
    return turnos.filter(t => {
        if (!t || typeof t !== 'object') return false;
        if (fechaInicio && t.fecha && t.fecha < fechaInicio) return false;
        if (fechaFin && t.fecha && t.fecha > fechaFin) return false;
        if (filtros.especialidad && t.especialidad !== filtros.especialidad) return false;
        if (filtros.medico && t.medico !== filtros.medico && t.medicoUid !== filtros.medico) return false;
        if (filtros.canal && t.canal !== filtros.canal) return false;
        if (filtros.creadoPor && t.creadoPor !== filtros.creadoPor) return false;
        return true;
    });
}

// ==========================================
// 3. CÁLCULO DE MÉTRICAS MÉDICAS
// ==========================================

/**
 * Calcula los indicadores operativos para un profesional médico específico o global.
 */
export function calcularMetricasMedico(turnos = [], franjasDisponibles = null, duracionEstimadaMinutos = 15) {
    if (!Array.isArray(turnos) || turnos.length === 0) {
        return {
            totalTurnos: 0,
            asignados: 0,
            atendidos: 0,
            ausentes: 0,
            cancelados: 0,
            ocupacionPct: null,
            ausentismoPct: null,
            tasaAtencionPct: null,
            tiempoEsperaPromedioMin: null,
            duracionRealPromedioMin: null,
            duracionProgramadaMin: duracionEstimadaMinutos,
            diferenciaDuracionMin: null,
            puntualidadDesvioMin: null,
            pacientesPorHora: null,
            ausenciasMedico: 0,
            porcentajeEvolucionCerrada: null,
            diasTrabajados: 0,
            seriePorDia: []
        };
    }

    let atendidos = 0;
    let ausentes = 0;
    let cancelados = 0;
    let canceladosPorMedico = 0;
    let evolucionesCerradas = 0;

    let sumaEsperaMs = 0;
    let cuentaEspera = 0;

    let sumaDuracionMs = 0;
    let cuentaDuracion = 0;

    let sumaPuntualidadMs = 0;
    let cuentaPuntualidad = 0;

    const agrupadoPorDia = {};

    turnos.forEach(t => {
        const est = t.estado || '';
        const esAtendido = est === 'Atendido';
        const esAusente = est === 'Ausente';
        const esCancelado = est.includes('Cancelado');

        if (esAtendido) atendidos++;
        else if (esAusente) ausentes++;
        else if (esCancelado) {
            cancelados++;
            if (t.canceladoPor === 'medico' || (t.estado && t.estado.toLowerCase().includes('emergencia'))) {
                canceladosPorMedico++;
            }
        }

        // Tiempos de espera: inicioConsultaEn - llegadaEn
        const msLlegada = extraerMilisegundos(t.llegadaEn);
        const msInicio = extraerMilisegundos(t.inicioConsultaEn);
        const msFin = extraerMilisegundos(t.finConsultaEn);

        if (msLlegada !== null && msInicio !== null && msInicio >= msLlegada) {
            const esperaMs = msInicio - msLlegada;
            // Descartar anomalías > 4 horas para no distorsionar promedios
            if (esperaMs <= 4 * 60 * 60 * 1000) {
                sumaEsperaMs += esperaMs;
                cuentaEspera++;
            }
        }

        // Duración real de consulta: finConsultaEn - inicioConsultaEn
        if (msInicio !== null && msFin !== null && msFin >= msInicio) {
            const duracionMs = msFin - msInicio;
            if (duracionMs <= 3 * 60 * 60 * 1000) {
                sumaDuracionMs += duracionMs;
                cuentaDuracion++;
            }
        }

        // Puntualidad: inicioConsultaEn vs fecha + horario programado
        if (msInicio !== null && t.fecha && t.horario && t.horario !== 'Pendiente') {
            const msProgramado = convertirFechaHoraAMilisegundos(t.fecha, t.horario);
            if (msProgramado !== null) {
                const desvioMs = msInicio - msProgramado;
                // Considerar desvíos entre -30 min y +180 min
                if (desvioMs >= -30 * 60 * 1000 && desvioMs <= 3 * 60 * 60 * 1000) {
                    sumaPuntualidadMs += Math.max(0, desvioMs);
                    cuentaPuntualidad++;
                }
            }
        }

        // Evolución cerrada (finConsultaEn presente)
        if (esAtendido && msFin !== null) {
            evolucionesCerradas++;
        }

        // Agrupación por día
        const f = t.fecha || 'Sin fecha';
        if (!agrupadoPorDia[f]) {
            agrupadoPorDia[f] = { fecha: f, asignados: 0, atendidos: 0, ausentes: 0, cancelados: 0 };
        }
        agrupadoPorDia[f].asignados++;
        if (esAtendido) agrupadoPorDia[f].atendidos++;
        if (esAusente) agrupadoPorDia[f].ausentes++;
        if (esCancelado) agrupadoPorDia[f].cancelados++;
    });

    const asignados = turnos.length;
    const diasTrabajados = Object.keys(agrupadoPorDia).length;

    // Indicadores con resguardo de división por cero
    const ausentismoPct = asignados > 0 ? (ausentes / asignados) * 100 : null;
    const tasaAtencionPct = asignados > 0 ? (atendidos / asignados) * 100 : null;

    let ocupacionPct = null;
    if (typeof franjasDisponibles === 'number' && franjasDisponibles > 0) {
        ocupacionPct = Math.min(100, (asignados / franjasDisponibles) * 100);
    } else if (asignados > 0) {
        // Si no se informan franjas teóricas, estimar según la capacidad observada
        ocupacionPct = Math.min(100, (asignados / Math.max(asignados, diasTrabajados * 16)) * 100);
    }

    const tiempoEsperaPromedioMin = cuentaEspera > 0 ? (sumaEsperaMs / cuentaEspera) / 60000 : null;
    const duracionRealPromedioMin = cuentaDuracion > 0 ? (sumaDuracionMs / cuentaDuracion) / 60000 : null;
    const diferenciaDuracionMin = duracionRealPromedioMin !== null 
        ? duracionRealPromedioMin - duracionEstimadaMinutos 
        : null;

    const puntualidadDesvioMin = cuentaPuntualidad > 0 ? (sumaPuntualidadMs / cuentaPuntualidad) / 60000 : null;

    // Pacientes por hora atendidos
    let pacientesPorHora = null;
    if (duracionRealPromedioMin !== null && duracionRealPromedioMin > 0) {
        pacientesPorHora = 60 / duracionRealPromedioMin;
    } else if (diasTrabajados > 0 && atendidos > 0) {
        pacientesPorHora = atendidos / (diasTrabajados * 4); // Estimando jornada típica de 4 horas
    }

    const porcentajeEvolucionCerrada = atendidos > 0 ? (evolucionesCerradas / atendidos) * 100 : null;

    const seriePorDia = Object.values(agrupadoPorDia).sort((a, b) => a.fecha.localeCompare(b.fecha));

    return {
        totalTurnos: turnos.length,
        asignados,
        atendidos,
        ausentes,
        cancelados,
        ocupacionPct,
        ausentismoPct,
        tasaAtencionPct,
        tiempoEsperaPromedioMin,
        duracionRealPromedioMin,
        duracionProgramadaMin: duracionEstimadaMinutos,
        diferenciaDuracionMin,
        puntualidadDesvioMin,
        pacientesPorHora,
        ausenciasMedico: canceladosPorMedico,
        porcentajeEvolucionCerrada,
        diasTrabajados,
        seriePorDia
    };
}

// ==========================================
// 4. CÁLCULO DE MÉTRICAS DE RECEPCIÓN
// ==========================================

/**
 * Calcula los indicadores operativos para el personal de Recepción y calidad de datos.
 */
export function calcularMetricasRecepcion(turnos = [], mapaUsuarios = {}) {
    if (!Array.isArray(turnos) || turnos.length === 0) {
        return {
            totalTurnos: 0,
            turnosPorPersona: [],
            mixCanal: { web: 0, presencial: 0, consultorio: 0, total: 0, webPct: null, presencialPct: null },
            ausentismoPorCanal: { webPct: null, presencialPct: null },
            tasaCancelacionPct: null,
            cancelacionesPorActor: { paciente: 0, recepcion: 0, medico: 0, sinEspecificar: 0, total: 0 },
            tiempoCheckInPromedioMin: null,
            calidadCarga: {
                sinEmail: 0,
                sinEmailPct: null,
                sinCelular: 0,
                sinCelularPct: null,
                dnisDuplicados: 0,
                puntajeCalidadPct: null
            }
        };
    }

    const conteoPorPersona = {};
    const canales = { Web: 0, Presencial: 0, Consultorio: 0, Otros: 0 };
    const ausentesPorCanal = { Web: 0, Presencial: 0 };
    const canceladosPorActor = { paciente: 0, recepcion: 0, medico: 0, sinEspecificar: 0 };

    let totalCancelados = 0;
    let turnosSinEmail = 0;
    let turnosSinCelular = 0;

    let sumaCheckInMs = 0;
    let cuentaCheckIn = 0;

    const dnisVistosDiaEsp = new Set();
    let dnisDuplicados = 0;

    turnos.forEach(t => {
        // Creador
        const creador = t.creadoPor || 'web_o_desconocido';
        const canal = t.canal || (t.creadoPor ? 'Presencial' : 'Web');
        const est = t.estado || '';
        const esAusente = est === 'Ausente';
        const esCancelado = est.includes('Cancelado');

        if (creador !== 'web_o_desconocido') {
            conteoPorPersona[creador] = (conteoPorPersona[creador] || 0) + 1;
        }

        // Mix de canales
        if (canal === 'Web') canales.Web++;
        else if (canal === 'Presencial') canales.Presencial++;
        else if (canal === 'Consultorio') canales.Consultorio++;
        else canales.Otros++;

        // Ausentismo por canal
        if (esAusente) {
            if (canal === 'Web') ausentesPorCanal.Web++;
            else if (canal === 'Presencial') ausentesPorCanal.Presencial++;
        }

        // Cancelaciones y quién cancela
        if (esCancelado) {
            totalCancelados++;
            const actor = (t.canceladoPor || '').toLowerCase();
            if (actor === 'paciente') canceladosPorActor.paciente++;
            else if (actor === 'recepcion') canceladosPorActor.recepcion++;
            else if (actor === 'medico') canceladosPorActor.medico++;
            else canceladosPorActor.sinEspecificar++;
        }

        // Tiempo de check-in respecto a hora de turno
        const msLlegada = extraerMilisegundos(t.llegadaEn);
        if (msLlegada !== null && t.fecha && t.horario && t.horario !== 'Pendiente') {
            const msProgramado = convertirFechaHoraAMilisegundos(t.fecha, t.horario);
            if (msProgramado !== null) {
                // Minutos de anticipación o retraso (positivo = llegó antes, negativo = llegó tarde)
                const difMs = msProgramado - msLlegada;
                if (Math.abs(difMs) <= 3 * 60 * 60 * 1000) {
                    sumaCheckInMs += difMs;
                    cuentaCheckIn++;
                }
            }
        }

        // Calidad de carga: sólo evaluar en turnos creados presencialmente
        if (canal === 'Presencial') {
            if (!t.pacienteEmail || t.pacienteEmail.trim() === '') turnosSinEmail++;
            if (!t.pacienteCelular || t.pacienteCelular.trim() === '') turnosSinCelular++;
        }

        // DNI duplicado el mismo día para la misma especialidad
        if (t.pacienteDni && t.fecha && t.especialidad) {
            const claveDuplicado = `${t.fecha}_${t.especialidad}_${t.pacienteDni}`;
            if (dnisVistosDiaEsp.has(claveDuplicado)) {
                dnisDuplicados++;
            } else {
                dnisVistosDiaEsp.add(claveDuplicado);
            }
        }
    });

    const totalTurnos = turnos.length;
    const totalPresenciales = canales.Presencial;

    const webPct = totalTurnos > 0 ? (canales.Web / totalTurnos) * 100 : null;
    const presencialPct = totalTurnos > 0 ? (canales.Presencial / totalTurnos) * 100 : null;

    const ausentismoWebPct = canales.Web > 0 ? (ausentesPorCanal.Web / canales.Web) * 100 : null;
    const ausentismoPresencialPct = canales.Presencial > 0 ? (ausentesPorCanal.Presencial / canales.Presencial) * 100 : null;

    const tasaCancelacionPct = totalTurnos > 0 ? (totalCancelados / totalTurnos) * 100 : null;
    const tiempoCheckInPromedioMin = cuentaCheckIn > 0 ? (sumaCheckInMs / cuentaCheckIn) / 60000 : null;

    const sinEmailPct = totalPresenciales > 0 ? (turnosSinEmail / totalPresenciales) * 100 : null;
    const sinCelularPct = totalPresenciales > 0 ? (turnosSinCelular / totalPresenciales) * 100 : null;

    // Puntaje de calidad: parte de 100, descuenta penalizaciones por faltantes o duplicados
    let puntajeCalidadPct = 100;
    if (sinEmailPct !== null) puntajeCalidadPct -= (sinEmailPct * 0.4);
    if (sinCelularPct !== null) puntajeCalidadPct -= (sinCelularPct * 0.4);
    if (totalTurnos > 0) puntajeCalidadPct -= Math.min(20, (dnisDuplicados / totalTurnos) * 100 * 0.5);
    puntajeCalidadPct = Math.max(0, Math.min(100, puntajeCalidadPct));

    const turnosPorPersona = Object.entries(conteoPorPersona).map(([uid, cantidad]) => {
        const u = mapaUsuarios[uid] || {};
        return {
            uid,
            nombre: u.nombre || u.correo || `Personal (${uid.slice(0, 6)})`,
            cantidad,
            porcentaje: totalTurnos > 0 ? (cantidad / totalTurnos) * 100 : 0
        };
    }).sort((a, b) => b.cantidad - a.cantidad);

    return {
        totalTurnos,
        turnosPorPersona,
        mixCanal: {
            web: canales.Web,
            presencial: canales.Presencial,
            consultorio: canales.Consultorio,
            total: totalTurnos,
            webPct,
            presencialPct
        },
        ausentismoPorCanal: {
            webPct: ausentismoWebPct,
            presencialPct: ausentismoPresencialPct
        },
        tasaCancelacionPct,
        cancelacionesPorActor: {
            ...canceladosPorActor,
            total: totalCancelados
        },
        tiempoCheckInPromedioMin,
        calidadCarga: {
            sinEmail: turnosSinEmail,
            sinEmailPct,
            sinCelular: turnosSinCelular,
            sinCelularPct,
            dnisDuplicados,
            puntajeCalidadPct: totalPresenciales > 0 ? puntajeCalidadPct : null
        }
    };
}

// ==========================================
// 5. CÁLCULO DE MÉTRICAS GENERALES E INSTITUCIONALES
// ==========================================

/**
 * Calcula los indicadores agregados a nivel hospitalario con comparativa de período previo.
 */
export function calcularMetricasGenerales(turnosActuales = [], turnosAnteriores = [], fechaCorte = '') {
    const totalActuales = Array.isArray(turnosActuales) ? turnosActuales.length : 0;
    const metricasMedicas = calcularMetricasMedico(turnosActuales);
    const metricasRecepcion = calcularMetricasRecepcion(turnosActuales);

    // Métricas del período anterior para calcular variación
    const metricasPrevias = Array.isArray(turnosAnteriores) && turnosAnteriores.length > 0
        ? {
            medicas: calcularMetricasMedico(turnosAnteriores),
            recepcion: calcularMetricasRecepcion(turnosAnteriores)
        }
        : null;

    // Cálculo de variaciones porcentuales o en puntos porcentuales
    function calcVariacion(valActual, valPrevio, esPuntos = true) {
        if (valActual === null || valPrevio === null || valActual === undefined || valPrevio === undefined) return null;
        if (esPuntos) {
            return Number((valActual - valPrevio).toFixed(1));
        }
        if (valPrevio === 0) return null;
        return Number((((valActual - valPrevio) / valPrevio) * 100).toFixed(1));
    }

    const variaciones = {
        ocupacion: metricasPrevias ? calcVariacion(metricasMedicas.ocupacionPct, metricasPrevias.medicas.ocupacionPct) : null,
        ausentismo: metricasPrevias ? calcVariacion(metricasMedicas.ausentismoPct, metricasPrevias.medicas.ausentismoPct) : null,
        esperaMinutos: metricasPrevias ? calcVariacion(metricasMedicas.tiempoEsperaPromedioMin, metricasPrevias.medicas.tiempoEsperaPromedioMin, true) : null,
        tasaAtencion: metricasPrevias ? calcVariacion(metricasMedicas.tasaAtencionPct, metricasPrevias.medicas.tasaAtencionPct) : null,
        turnosWeb: metricasPrevias ? calcVariacion(metricasRecepcion.mixCanal.webPct, metricasPrevias.recepcion.mixCanal.webPct) : null
    };

    // Rankings por especialidad
    const especialidadesMap = {};
    if (Array.isArray(turnosActuales)) {
        turnosActuales.forEach(t => {
            const esp = t.especialidad || 'General';
            if (!especialidadesMap[esp]) {
                especialidadesMap[esp] = { especialidad: esp, total: 0, atendidos: 0, ausentes: 0, cancelados: 0 };
            }
            especialidadesMap[esp].total++;
            if (t.estado === 'Atendido') especialidadesMap[esp].atendidos++;
            else if (t.estado === 'Ausente') especialidadesMap[esp].ausentes++;
            else if (t.estado && t.estado.includes('Cancelado')) especialidadesMap[esp].cancelados++;
        });
    }

    const rankingEspecialidades = Object.values(especialidadesMap).map(e => {
        const ausentismoPct = e.total > 0 ? (e.ausentes / e.total) * 100 : 0;
        const ocupacionPct = e.total > 0 ? Math.min(100, (e.total / Math.max(e.total, 20)) * 100) : 0;
        return {
            ...e,
            ausentismoPct: Number(ausentismoPct.toFixed(1)),
            ocupacionPct: Number(ocupacionPct.toFixed(1))
        };
    });

    const rankingAusentismo = [...rankingEspecialidades].sort((a, b) => b.ausentismoPct - a.ausentismoPct);
    const rankingOcupacion = [...rankingEspecialidades].sort((a, b) => b.ocupacionPct - a.ocupacionPct);

    // Mapa de calor: Día de semana (0=Dom a 6=Sáb) x Franja horaria (07:00 a 13:00)
    const DIAS_NOMBRES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const FRANJAS = ['07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00'];

    const mapaCalor = {};
    for (let d = 1; d <= 5; d++) { // Lunes a Viernes
        mapaCalor[d] = {};
        FRANJAS.forEach(f => {
            mapaCalor[d][f] = 0;
        });
    }

    let maxDensidadHora = 0;
    if (Array.isArray(turnosActuales)) {
        turnosActuales.forEach(t => {
            if (t.fecha && t.horario) {
                const partesF = t.fecha.split('-');
                if (partesF.length === 3) {
                    const diaSemana = new Date(parseInt(partesF[0], 10), parseInt(partesF[1], 10) - 1, parseInt(partesF[2], 10)).getDay();
                    const horaBase = `${t.horario.split(':')[0]}:00`;
                    if (mapaCalor[diaSemana] && mapaCalor[diaSemana][horaBase] !== undefined) {
                        mapaCalor[diaSemana][horaBase]++;
                        if (mapaCalor[diaSemana][horaBase] > maxDensidadHora) {
                            maxDensidadHora = mapaCalor[diaSemana][horaBase];
                        }
                    }
                }
            }
        });
    }

    // Tiempo promedio al próximo turno disponible por especialidad
    const hoyReferencia = fechaCorte || new Date().toISOString().split('T')[0];
    const diasAlProximoTurno = {};
    if (Array.isArray(turnosActuales)) {
        turnosActuales.forEach(t => {
            if (t.fecha && t.fecha >= hoyReferencia && t.estado && !t.estado.includes('Cancelado')) {
                const esp = t.especialidad || 'General';
                const difDias = Math.max(0, Math.round((Date.parse(t.fecha) - Date.parse(hoyReferencia)) / (24 * 3600 * 1000)));
                if (diasAlProximoTurno[esp] === undefined || difDias < diasAlProximoTurno[esp]) {
                    diasAlProximoTurno[esp] = difDias;
                }
            }
        });
    }

    // Generar frases de conclusión automática para interpretación ejecutiva
    const conclusiones = [];
    if (metricasMedicas.ausentismoPct !== null) {
        if (variaciones.ausentismo !== null) {
            const sentido = variaciones.ausentismo > 0 ? 'subió' : 'bajó';
            const adverbio = Math.abs(variaciones.ausentismo) > 3 ? 'significativamente' : 'moderadamente';
            conclusiones.push(`El ausentismo ${sentido} ${Math.abs(variaciones.ausentismo)} puntos respecto del período anterior (${adverbio}).`);
        } else {
            conclusiones.push(`El ausentismo global se sitúa en un ${metricasMedicas.ausentismoPct.toFixed(1)}%.`);
        }
    }

    if (metricasMedicas.tiempoEsperaPromedioMin !== null) {
        if (metricasMedicas.tiempoEsperaPromedioMin <= 15) {
            conclusiones.push(`El tiempo de espera en sala es ágil (${metricasMedicas.tiempoEsperaPromedioMin.toFixed(0)} min en promedio).`);
        } else if (metricasMedicas.tiempoEsperaPromedioMin > 30) {
            conclusiones.push(`Se observan demoras en sala de espera superiores al estándar recomendado (> 30 min).`);
        }
    }

    if (metricasRecepcion.mixCanal.webPct !== null) {
        if (metricasRecepcion.mixCanal.webPct >= 40) {
            conclusiones.push(`Alta adopción digital: el ${metricasRecepcion.mixCanal.webPct.toFixed(1)}% de las reservas provino de la web institucional.`);
        } else {
            conclusiones.push(`Oportunidad de digitalización: el ${((100 - metricasRecepcion.mixCanal.webPct)).toFixed(1)}% aún gestiona turnos de forma presencial.`);
        }
    }

    return {
        totalTurnos: totalActuales,
        kpis: {
            ocupacion: {
                valor: metricasMedicas.ocupacionPct,
                variacion: variaciones.ocupacion,
                semaforo: evaluarSemaforo(metricasMedicas.ocupacionPct, 'ocupacion')
            },
            ausentismo: {
                valor: metricasMedicas.ausentismoPct,
                variacion: variaciones.ausentismo,
                semaforo: evaluarSemaforo(metricasMedicas.ausentismoPct, 'ausentismo')
            },
            esperaMinutos: {
                valor: metricasMedicas.tiempoEsperaPromedioMin,
                variacion: variaciones.esperaMinutos,
                semaforo: evaluarSemaforo(metricasMedicas.tiempoEsperaPromedioMin, 'esperaMinutos')
            },
            tasaAtencion: {
                valor: metricasMedicas.tasaAtencionPct,
                variacion: variaciones.tasaAtencion,
                semaforo: evaluarSemaforo(metricasMedicas.tasaAtencionPct, 'tasaAtencion')
            },
            turnosWeb: {
                valor: metricasRecepcion.mixCanal.webPct,
                variacion: variaciones.turnosWeb,
                semaforo: evaluarSemaforo(metricasRecepcion.mixCanal.webPct, 'turnosWeb')
            }
        },
        rankings: {
            ausentismo: rankingAusentismo,
            ocupacion: rankingOcupacion
        },
        mapaCalor: {
            dias: [1, 2, 3, 4, 5],
            nombresDias: DIAS_NOMBRES,
            franjas: FRANJAS,
            matriz: mapaCalor,
            maxDensidad: maxDensidadHora
        },
        diasAlProximoTurno,
        serieTendencia: metricasMedicas.seriePorDia,
        mixCanal: metricasRecepcion.mixCanal,
        conclusionesAutomaticas: conclusiones
    };
}

// ==========================================
// 6. COMPARADOR BIDIRECCIONAL (MÉDICOS O PERÍODOS)
// ==========================================

/**
 * Compara dos conjuntos de métricas lado a lado para la herramienta de contraste del panel.
 */
export function compararEntidades(metricasA, metricasB, nombreA = 'Entidad A', nombreB = 'Entidad B') {
    if (!metricasA || !metricasB) return null;

    function dif(a, b) {
        if (a === null || b === null || a === undefined || b === undefined) return null;
        return Number((a - b).toFixed(1));
    }

    return {
        nombreA,
        nombreB,
        comparaciones: [
            {
                indicador: 'Ocupación de Agenda',
                valorA: metricasA.ocupacionPct !== null && metricasA.ocupacionPct !== undefined ? `${metricasA.ocupacionPct.toFixed(1)}%` : 'Sin datos',
                valorB: metricasB.ocupacionPct !== null && metricasB.ocupacionPct !== undefined ? `${metricasB.ocupacionPct.toFixed(1)}%` : 'Sin datos',
                diferencia: dif(metricasA.ocupacionPct, metricasB.ocupacionPct),
                semaforoA: evaluarSemaforo(metricasA.ocupacionPct, 'ocupacion'),
                semaforoB: evaluarSemaforo(metricasB.ocupacionPct, 'ocupacion')
            },
            {
                indicador: 'Tasa de Ausentismo',
                valorA: metricasA.ausentismoPct !== null && metricasA.ausentismoPct !== undefined ? `${metricasA.ausentismoPct.toFixed(1)}%` : 'Sin datos',
                valorB: metricasB.ausentismoPct !== null && metricasB.ausentismoPct !== undefined ? `${metricasB.ausentismoPct.toFixed(1)}%` : 'Sin datos',
                diferencia: dif(metricasA.ausentismoPct, metricasB.ausentismoPct),
                semaforoA: evaluarSemaforo(metricasA.ausentismoPct, 'ausentismo'),
                semaforoB: evaluarSemaforo(metricasB.ausentismoPct, 'ausentismo')
            },
            {
                indicador: 'Tiempo de Espera Promedio',
                valorA: metricasA.tiempoEsperaPromedioMin !== null && metricasA.tiempoEsperaPromedioMin !== undefined ? `${metricasA.tiempoEsperaPromedioMin.toFixed(0)} min` : 'Sin datos',
                valorB: metricasB.tiempoEsperaPromedioMin !== null && metricasB.tiempoEsperaPromedioMin !== undefined ? `${metricasB.tiempoEsperaPromedioMin.toFixed(0)} min` : 'Sin datos',
                diferencia: dif(metricasA.tiempoEsperaPromedioMin, metricasB.tiempoEsperaPromedioMin),
                semaforoA: evaluarSemaforo(metricasA.tiempoEsperaPromedioMin, 'esperaMinutos'),
                semaforoB: evaluarSemaforo(metricasB.tiempoEsperaPromedioMin, 'esperaMinutos')
            },
            {
                indicador: 'Tasa de Atención Efectiva',
                valorA: metricasA.tasaAtencionPct !== null && metricasA.tasaAtencionPct !== undefined ? `${metricasA.tasaAtencionPct.toFixed(1)}%` : 'Sin datos',
                valorB: metricasB.tasaAtencionPct !== null && metricasB.tasaAtencionPct !== undefined ? `${metricasB.tasaAtencionPct.toFixed(1)}%` : 'Sin datos',
                diferencia: dif(metricasA.tasaAtencionPct, metricasB.tasaAtencionPct),
                semaforoA: evaluarSemaforo(metricasA.tasaAtencionPct, 'tasaAtencion'),
                semaforoB: evaluarSemaforo(metricasB.tasaAtencionPct, 'tasaAtencion')
            }
        ]
    };
}
