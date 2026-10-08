// ==========================================
// COMPONENTE: CALENDARIO HOSPITALARIO INTERACTIVO
// Módulo institucional para reserva de turnos y agendas - Hospital Schestakow
// Incluye Feriados Nacionales de la República Argentina y soporte Multi-Panel
// ==========================================

const MESES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const DIAS_SEMANA = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'];

/**
 * Feriados Nacionales Inamovibles de la República Argentina (MM-DD)
 */
export const FERIADOS_FIJOS = {
    '01-01': 'Año Nuevo',
    '03-24': 'Día Nacional de la Memoria por la Verdad y la Justicia',
    '04-02': 'Día del Veterano y de los Caídos en Malvinas',
    '05-01': 'Día del Trabajador',
    '05-25': 'Día de la Revolución de Mayo',
    '06-17': 'Paso a la Inmortalidad del Gral. Don Martín Miguel de Güemes',
    '06-20': 'Paso a la Inmortalidad del Gral. Manuel Belgrano',
    '07-09': 'Día de la Independencia',
    '08-17': 'Paso a la Inmortalidad del Gral. José de San Martín',
    '10-12': 'Día del Respeto a la Diversidad Cultural',
    '11-20': 'Día de la Soberanía Nacional',
    '12-08': 'Inmaculada Concepción de María',
    '12-25': 'Navidad'
};

/**
 * Feriados Móviles y Puentes Turísticos de Argentina (YYYY-MM-DD)
 */
export const FERIADOS_MOVILES = {
    // Calendario 2026
    '2026-02-16': 'Carnaval',
    '2026-02-17': 'Carnaval',
    '2026-03-23': 'Feriado Puente Turístico',
    '2026-04-02': 'Jueves Santo / Día de Malvinas',
    '2026-04-03': 'Viernes Santo',
    '2026-07-10': 'Feriado Puente Turístico',
    '2026-08-17': 'Paso a la Inmortalidad del Gral. San Martín',
    '2026-10-12': 'Día del Respeto a la Diversidad Cultural',
    '2026-11-23': 'Día de la Soberanía Nacional (Trasladado)',
    '2026-12-07': 'Feriado Puente Turístico',
    // Calendario 2027
    '2027-02-08': 'Carnaval',
    '2027-02-09': 'Carnaval',
    '2027-03-25': 'Jueves Santo',
    '2027-03-26': 'Viernes Santo'
};

/**
 * Registro global de instancias para manejo dinámico de eventos en el DOM
 */
if (typeof window !== 'undefined') {
    window._calendariosHospitalarios = window._calendariosHospitalarios || {};
}

/**
 * Consulta si una fecha específica (YYYY-MM-DD) es feriado nacional en Argentina
 */
export function obtenerFeriadoNacional(fechaISO) {
    if (!fechaISO) return null;
    if (FERIADOS_MOVILES[fechaISO]) {
        return FERIADOS_MOVILES[fechaISO];
    }
    const mmdd = fechaISO.substring(5); // 'MM-DD'
    if (FERIADOS_FIJOS[mmdd]) {
        return FERIADOS_FIJOS[mmdd];
    }
    return null;
}

class CalendarioHospitalario {
    constructor(contenedorId = 'contenedor-calendario-hospitalario', inputId = 'input-fecha-paciente', opciones = {}) {
        this.contenedorId = contenedorId;
        this.inputId = inputId;
        this.opciones = {
            permitirPasados: false,
            permitirFeriados: false,
            deshabilitarFinesDeSemana: true,
            diasMaximos: 60, // null para sin límite
            mostrarLeyenda: true,
            compacto: false,
            bannerId: null,
            textoBannerId: null,
            textoDisplayId: null,
            popoverId: null,
            onSelect: null,
            ...opciones
        };

        const hoy = new Date();
        this.hoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
        this.mesVisible = this.hoy.getMonth();
        this.anioVisible = this.hoy.getFullYear();
        this.fechaSeleccionada = null; // String 'YYYY-MM-DD'

        // Rango máximo permitido
        if (this.opciones.diasMaximos) {
            this.fechaMaxima = new Date(this.hoy);
            this.fechaMaxima.setDate(this.fechaMaxima.getDate() + this.opciones.diasMaximos);
        } else {
            this.fechaMaxima = null;
        }

        if (typeof window !== 'undefined') {
            window._calendariosHospitalarios = window._calendariosHospitalarios || {};
            window._calendariosHospitalarios[this.contenedorId] = this;

            // Mantener alias global histórico si es el contenedor principal
            if (this.contenedorId === 'contenedor-calendario-hospitalario') {
                window.calendarioHospitalario = this;
            }
        }

        this.init();
    }

    init() {
        const input = document.getElementById(this.inputId);
        if (input) {
            input._calendarioHospitalario = this;
            if (input.value) {
                this.establecerFecha(input.value, false);
            }
        }

        this.render();
        this.actualizarBanner();
        this.actualizarDisplayTexto();

        // Escuchar cambios externos en el input para sincronizar
        if (input) {
            input.addEventListener('change', () => {
                if (input.value !== this.fechaSeleccionada) {
                    this.establecerFecha(input.value || null, false);
                }
            });
        }
    }

    cambiarMes(delta) {
        let nuevoMes = this.mesVisible + delta;
        let nuevoAnio = this.anioVisible;

        if (nuevoMes < 0) {
            nuevoMes = 11;
            nuevoAnio--;
        } else if (nuevoMes > 11) {
            nuevoMes = 0;
            nuevoAnio++;
        }

        // Si no se permiten pasados, evitar navegar a meses donde todos los días ya pasaron
        if (!this.opciones.permitirPasados) {
            const primerDiaNuevoMes = new Date(nuevoAnio, nuevoMes + 1, 0);
            if (primerDiaNuevoMes < this.hoy) {
                return;
            }
        }

        this.mesVisible = nuevoMes;
        this.anioVisible = nuevoAnio;
        this.render();
    }

    irAHoy() {
        this.mesVisible = this.hoy.getMonth();
        this.anioVisible = this.hoy.getFullYear();
        this.render();
    }

    formatearISO(anio, mes, dia) {
        const m = String(mes + 1).padStart(2, '0');
        const d = String(dia).padStart(2, '0');
        return `${anio}-${m}-${d}`;
    }

    obtenerFeriado(fechaISO) {
        return obtenerFeriadoNacional(fechaISO);
    }

    establecerFecha(fechaISO, dispararEvento = true) {
        this.fechaSeleccionada = fechaISO || null;
        if (fechaISO) {
            const partes = fechaISO.split('-');
            if (partes.length === 3) {
                this.anioVisible = parseInt(partes[0], 10);
                this.mesVisible = parseInt(partes[1], 10) - 1;
            }
        }

        const input = document.getElementById(this.inputId);
        if (input && input.value !== (fechaISO || '')) {
            input.value = fechaISO || '';
            if (dispararEvento) {
                const evento = new Event('change', { bubbles: true });
                input.dispatchEvent(evento);
            }
        }

        this.render();
        this.actualizarBanner();
        this.actualizarDisplayTexto();
    }

    seleccionarFecha(fechaISO) {
        // Bloqueo preventivo de feriados
        if (!this.opciones.permitirFeriados) {
            const nombreFeriado = this.obtenerFeriado(fechaISO);
            if (nombreFeriado) {
                if (typeof window !== 'undefined' && window.mostrarAlerta) {
                    window.mostrarAlerta("Feriado Nacional", `El día seleccionado es feriado (${nombreFeriado}). Los consultorios externos no atienden; sólo funciona la Guardia de Emergencias.`);
                } else if (typeof alert !== 'undefined') {
                    alert(`El día seleccionado es feriado (${nombreFeriado}).`);
                }
                return;
            }
        }

        this.establecerFecha(fechaISO, true);

        if (this.opciones.onSelect && typeof this.opciones.onSelect === 'function') {
            this.opciones.onSelect(fechaISO);
        }

        // Cerrar popover automáticamente si aplica
        if (this.opciones.popoverId) {
            const popover = document.getElementById(this.opciones.popoverId);
            if (popover) {
                popover.classList.add('hidden');
            }
        }

        if (typeof window !== 'undefined' && window.actualizarProgresoFormulario) {
            window.actualizarProgresoFormulario();
        }
    }

    deseleccionar() {
        this.establecerFecha(null, true);
    }

    sincronizarConInput() {
        const input = document.getElementById(this.inputId);
        if (input) {
            this.establecerFecha(input.value || null, false);
        }
    }

    actualizarDisplayTexto() {
        if (!this.opciones.textoDisplayId) return;
        const display = document.getElementById(this.opciones.textoDisplayId);
        if (!display) return;

        if (!this.fechaSeleccionada) {
            display.textContent = 'Seleccionar fecha...';
            return;
        }

        const partes = this.fechaSeleccionada.split('-');
        if (partes.length === 3) {
            const anio = parseInt(partes[0], 10);
            const mes = parseInt(partes[1], 10) - 1;
            const dia = parseInt(partes[2], 10);
            const fechaObj = new Date(anio, mes, dia);
            const opciones = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' };
            let formateada = fechaObj.toLocaleDateString('es-AR', opciones);
            formateada = formateada.charAt(0).toUpperCase() + formateada.slice(1);
            display.textContent = formateada;
        }
    }

    actualizarBanner() {
        const bannerId = this.opciones.bannerId || 'banner-fecha-seleccionada';
        const txtId = this.opciones.textoBannerId || 'texto-fecha-seleccionada';
        const banner = document.getElementById(bannerId);
        const txt = document.getElementById(txtId);
        if (!banner || !txt) return;

        if (!this.fechaSeleccionada) {
            banner.classList.add('hidden');
            txt.textContent = '--';
            return;
        }

        const partes = this.fechaSeleccionada.split('-');
        if (partes.length === 3) {
            const anio = parseInt(partes[0], 10);
            const mes = parseInt(partes[1], 10) - 1;
            const dia = parseInt(partes[2], 10);
            const fechaObj = new Date(anio, mes, dia);
            const opciones = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
            const formateada = fechaObj.toLocaleDateString('es-AR', opciones);
            txt.textContent = formateada.charAt(0).toUpperCase() + formateada.slice(1);
            banner.classList.remove('hidden');
        }
    }

    render() {
        const contenedor = document.getElementById(this.contenedorId);
        if (!contenedor) return;

        const primerDiaMes = new Date(this.anioVisible, this.mesVisible, 1);
        const ultimoDiaMes = new Date(this.anioVisible, this.mesVisible + 1, 0);
        const totalDias = ultimoDiaMes.getDate();

        // 0 = Domingo, 1 = Lunes, ..., 6 = Sábado (En Argentina la semana empieza en Lunes)
        let diaInicioSemana = primerDiaMes.getDay();
        let offsetDias = (diaInicioSemana === 0) ? 6 : diaInicioSemana - 1;

        const esMesActual = (this.mesVisible === this.hoy.getMonth() && this.anioVisible === this.hoy.getFullYear());
        const esCompacto = this.opciones.compacto;
        const instanciaKey = this.contenedorId;

        const celdaHeight = esCompacto ? 'h-7 sm:h-8' : 'h-9 sm:h-10';
        const fontSizeDia = esCompacto ? 'text-[11px] sm:text-xs' : 'text-xs sm:text-sm';

        let html = `
            <div class="calendario-his select-none">
                <!-- Cabecera de Navegación del Mes -->
                <div class="flex items-center justify-between pb-2.5 mb-2 border-b border-slate-200">
                    <div class="flex items-center gap-2">
                        <span class="w-2.5 h-2.5 rounded-full bg-[#007a78]"></span>
                        <h3 class="${esCompacto ? 'text-xs sm:text-sm' : 'text-sm sm:text-base'} font-bold text-[#002845] tracking-tight">
                            ${MESES[this.mesVisible]} <span class="text-slate-500 font-medium">${this.anioVisible}</span>
                        </h3>
                    </div>

                    <div class="flex items-center gap-1.5">
                        <button type="button" 
                                onclick="window._calendariosHospitalarios['${instanciaKey}'].irAHoy()" 
                                class="px-2 py-0.5 text-[10px] sm:text-[11px] font-semibold text-slate-600 hover:text-[#002845] bg-slate-100 hover:bg-slate-200 rounded transition cursor-pointer"
                                title="Volver al mes actual">
                            Hoy
                        </button>
                        <button type="button" 
                                onclick="window._calendariosHospitalarios['${instanciaKey}'].cambiarMes(-1)" 
                                ${(!this.opciones.permitirPasados && esMesActual) ? 'disabled' : ''} 
                                class="w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                                aria-label="Mes anterior">
                            <svg class="w-3 h-3 sm:w-3.5 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>
                        </button>
                        <button type="button" 
                                onclick="window._calendariosHospitalarios['${instanciaKey}'].cambiarMes(1)" 
                                class="w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                                aria-label="Mes siguiente">
                            <svg class="w-3 h-3 sm:w-3.5 sm:h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                        </button>
                    </div>
                </div>

                <!-- Cabecera de Días de la Semana -->
                <div class="grid grid-cols-7 gap-1 text-center mb-1">
        `;

        DIAS_SEMANA.forEach((dia, idx) => {
            const esFinde = (idx >= 5);
            html += `
                <div class="text-[9px] sm:text-[10px] font-bold py-0.5 ${esFinde ? 'text-slate-400 bg-slate-50/50 rounded' : 'text-[#002845]'}" title="${esFinde ? 'Fin de semana (no laborable)' : 'Día de atención habitual'}">
                    ${dia}
                </div>
            `;
        });

        html += `</div><!-- Grilla de Celdas de Días --><div class="grid grid-cols-7 gap-1 text-center">`;

        // Espacios vacíos antes del 1° del mes
        for (let i = 0; i < offsetDias; i++) {
            html += `<div class="${celdaHeight}"></div>`;
        }

        // Celdas de días del mes
        for (let dia = 1; dia <= totalDias; dia++) {
            const fechaDia = new Date(this.anioVisible, this.mesVisible, dia);
            const diaSemana = fechaDia.getDay(); // 0 = Domingo, 6 = Sábado
            const esFinde = (diaSemana === 0 || diaSemana === 6);
            const esPasado = (!this.opciones.permitirPasados && fechaDia < this.hoy);
            const esExcedido = (this.fechaMaxima && fechaDia > this.fechaMaxima);
            const esHoy = (fechaDia.getTime() === this.hoy.getTime());
            const iso = this.formatearISO(this.anioVisible, this.mesVisible, dia);
            const estaSeleccionado = (this.fechaSeleccionada === iso);
            const nombreFeriado = this.obtenerFeriado(iso);

            if (nombreFeriado) {
                // FERIADO NACIONAL: Destacado en rojo institucional
                html += `
                    <button type="button" ${!this.opciones.permitirFeriados ? 'disabled aria-disabled="true"' : `onclick="window._calendariosHospitalarios['${instanciaKey}'].seleccionarFecha('${iso}')"`}
                            title="Feriado Nacional: ${nombreFeriado} (Consultorios externos cerrados - Guardia activa)"
                            class="w-full ${celdaHeight} rounded-md bg-rose-50 text-rose-700 border border-rose-300 ${fontSizeDia} font-bold flex flex-col items-center justify-center ${!this.opciones.permitirFeriados ? 'cursor-not-allowed shadow-2xs' : 'cursor-pointer hover:bg-rose-100'} group relative">
                        <span>${dia}</span>
                        <span class="w-1.5 h-1.5 rounded-full bg-rose-500 -mt-0.5" title="${nombreFeriado}"></span>
                    </button>
                `;
            } else if (esPasado) {
                // Día anterior a hoy
                html += `
                    <button type="button" disabled 
                            class="w-full ${celdaHeight} rounded text-slate-300 text-xs flex items-center justify-center cursor-not-allowed line-through opacity-60">
                        ${dia}
                    </button>
                `;
            } else if (this.opciones.deshabilitarFinesDeSemana && esFinde) {
                // Sábado o Domingo (no laborable en consultorios)
                html += `
                    <button type="button" disabled 
                            title="No laborable para consultorios externos"
                            class="w-full ${celdaHeight} rounded bg-slate-50/80 text-slate-400 text-xs flex items-center justify-center cursor-not-allowed border border-dashed border-slate-200">
                        ${dia}
                    </button>
                `;
            } else if (esExcedido) {
                // Fuera del rango de días máximos
                html += `
                    <button type="button" disabled 
                            title="Agenda aún no habilitada"
                            class="w-full ${celdaHeight} rounded text-slate-300 text-xs flex items-center justify-center cursor-not-allowed">
                        ${dia}
                    </button>
                `;
            } else if (estaSeleccionado) {
                // Día actualmente seleccionado
                html += `
                    <button type="button" 
                            onclick="window._calendariosHospitalarios['${instanciaKey}'].seleccionarFecha('${iso}')"
                            class="w-full ${celdaHeight} rounded-md bg-[#002845] text-white font-bold ${fontSizeDia} flex flex-col items-center justify-center shadow-md ring-2 ring-[#007a78] border border-[#002845] cursor-pointer scale-[1.02] transition-transform"
                            aria-selected="true"
                            title="Día seleccionado">
                        <span>${dia}</span>
                        ${esHoy ? '<span class="text-[7px] sm:text-[8px] uppercase tracking-wider text-teal-300 -mt-0.5 leading-none">Hoy</span>' : ''}
                    </button>
                `;
            } else {
                // Día hábil disponible
                html += `
                    <button type="button" 
                            onclick="window._calendariosHospitalarios['${instanciaKey}'].seleccionarFecha('${iso}')"
                            class="w-full ${celdaHeight} rounded-md bg-white hover:bg-teal-50 text-slate-800 hover:text-[#002845] hover:border-[#007a78] border border-slate-200 ${fontSizeDia} font-semibold flex flex-col items-center justify-center shadow-2xs hover:shadow-sm transition-all cursor-pointer group"
                            aria-selected="false"
                            title="Disponible para reserva">
                        <span class="group-hover:scale-110 transition-transform">${dia}</span>
                        ${esHoy ? '<span class="text-[7px] sm:text-[8px] uppercase tracking-wider text-emerald-600 font-bold -mt-0.5 leading-none">Hoy</span>' : ''}
                    </button>
                `;
            }
        }

        html += `</div>`;

        // Leyenda institucional
        if (this.opciones.mostrarLeyenda) {
            html += `
                <div class="mt-2.5 pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between text-[10px] sm:text-[11px] text-slate-500 gap-1.5">
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="inline-flex items-center gap-1">
                            <span class="w-2 h-2 rounded bg-white border border-slate-300 inline-block"></span>
                            <span>Disponible</span>
                        </span>
                        <span class="inline-flex items-center gap-1">
                            <span class="w-2 h-2 rounded bg-[#002845] inline-block"></span>
                            <span>Seleccionado</span>
                        </span>
                        <span class="inline-flex items-center gap-1">
                            <span class="w-2 h-2 rounded bg-rose-100 border border-rose-300 inline-block"></span>
                            <span class="text-rose-700 font-semibold">Feriado</span>
                        </span>
                        <span class="inline-flex items-center gap-1">
                            <span class="w-2 h-2 rounded bg-slate-100 border border-dashed border-slate-200 inline-block"></span>
                            <span>No laborable</span>
                        </span>
                    </div>
                    <span class="text-[9px] sm:text-[10px] text-slate-400">Atención: Lun a Vie (07:00 a 13:00)</span>
                </div>
            `;
        }

        html += `</div>`;

        contenedor.innerHTML = html;
    }
}

/**
 * Función para inicializar los calendarios específicos del panel administrativo/médico
 */
export function inicializarCalendariosPanel() {
    // 1. Calendario de Recepción (Selector desplegable popover)
    if (document.getElementById('contenedor-calendario-recepcion') && document.getElementById('input-fecha-recepcion')) {
        window.calendarioRecepcion = new CalendarioHospitalario(
            'contenedor-calendario-recepcion',
            'input-fecha-recepcion',
            {
                compacto: true,
                popoverId: 'popover-calendario-recepcion',
                textoDisplayId: 'texto-fecha-recepcion-display',
                onSelect: (fechaISO) => {
                    const btn = document.getElementById('btn-selector-fecha-recepcion');
                    if (btn) btn.focus();
                }
            }
        );

        // Preseleccionar hoy si el input está vacío
        const inputRec = document.getElementById('input-fecha-recepcion');
        if (inputRec && !inputRec.value) {
            const hoy = new Date();
            const y = hoy.getFullYear();
            const m = String(hoy.getMonth() + 1).padStart(2, '0');
            const d = String(hoy.getDate()).padStart(2, '0');
            const fechaHoy = `${y}-${m}-${d}`;
            // Si hoy no es fin de semana ni feriado, preasignarlo para agilidad de la recepción
            if (hoy.getDay() !== 0 && hoy.getDay() !== 6 && !obtenerFeriadoNacional(fechaHoy)) {
                window.calendarioRecepcion.establecerFecha(fechaHoy, false);
            }
        }
    }

    // 2. Calendario de Consultorio (Modal de Próxima Consulta / Citación)
    if (document.getElementById('contenedor-calendario-consultorio') && document.getElementById('prox-consulta-fecha')) {
        window.calendarioConsultorio = new CalendarioHospitalario(
            'contenedor-calendario-consultorio',
            'prox-consulta-fecha',
            {
                compacto: true,
                textoDisplayId: 'display-fecha-prox-consulta',
                onSelect: (fechaISO) => {
                    const elFecha = document.getElementById('prox-consulta-fecha');
                    if (elFecha && typeof window.cambioFechaProximaConsulta === 'function') {
                        window.cambioFechaProximaConsulta(elFecha);
                    }
                }
            }
        );
    }
}

/**
 * Toggle del popover de fecha en Recepción
 */
export function toggleCalendarioRecepcion(forzarEstado = null) {
    const popover = document.getElementById('popover-calendario-recepcion');
    if (!popover) return;

    if (forzarEstado !== null) {
        if (forzarEstado) popover.classList.remove('hidden');
        else popover.classList.add('hidden');
        return;
    }

    popover.classList.toggle('hidden');
}

// Cerrar popovers al hacer click fuera
if (typeof document !== 'undefined') {
    document.addEventListener('click', (e) => {
        const popover = document.getElementById('popover-calendario-recepcion');
        const btn = document.getElementById('btn-selector-fecha-recepcion');
        if (popover && !popover.classList.contains('hidden')) {
            if (!popover.contains(e.target) && !btn?.contains(e.target)) {
                popover.classList.add('hidden');
            }
        }
    });
}

// Exponer funciones en window para invocación desde HTML
if (typeof window !== 'undefined') {
    window.inicializarCalendariosPanel = inicializarCalendariosPanel;
    window.toggleCalendarioRecepcion = toggleCalendarioRecepcion;
}

// Inicialización automática según el DOM cargado
if (typeof document !== 'undefined') {
    document.addEventListener("DOMContentLoaded", () => {
        // En index.html (Portal Público)
        if (document.getElementById('contenedor-calendario-hospitalario')) {
            window.calendarioHospitalario = new CalendarioHospitalario();
        }

        // En panel.html (Recepción y Consultorio)
        if (document.getElementById('contenedor-calendario-recepcion') || document.getElementById('contenedor-calendario-consultorio')) {
            inicializarCalendariosPanel();
        }
    });
}

export { CalendarioHospitalario };
