// ==========================================
// COMPONENTE: CALENDARIO HOSPITALARIO INTERACTIVO
// Módulo institucional para reserva de turnos - Hospital Schestakow
// ==========================================

const MESES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const DIAS_SEMANA = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'];

class CalendarioHospitalario {
    constructor(contenedorId = 'contenedor-calendario-hospitalario', inputId = 'input-fecha-paciente') {
        this.contenedorId = contenedorId;
        this.inputId = inputId;

        const hoy = new Date();
        this.hoy = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
        this.mesVisible = this.hoy.getMonth();
        this.anioVisible = this.hoy.getFullYear();
        this.fechaSeleccionada = null; // String 'YYYY-MM-DD'

        // Rango máximo permitido para reserva de turnos (60 días hacia adelante)
        this.fechaMaxima = new Date(this.hoy);
        this.fechaMaxima.setDate(this.fechaMaxima.getDate() + 60);

        this.init();
    }

    init() {
        const input = document.getElementById(this.inputId);
        if (input && input.value) {
            this.fechaSeleccionada = input.value;
            const partes = input.value.split('-');
            if (partes.length === 3) {
                this.anioVisible = parseInt(partes[0], 10);
                this.mesVisible = parseInt(partes[1], 10) - 1;
            }
        }

        this.render();

        // Escuchar cambios externos en el input para sincronizar
        if (input) {
            input.addEventListener('change', () => {
                if (input.value !== this.fechaSeleccionada) {
                    this.fechaSeleccionada = input.value || null;
                    this.render();
                    this.actualizarBanner();
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

        // Evitar retroceder a meses totalmente pasados
        const primerDiaNuevoMes = new Date(nuevoAnio, nuevoMes + 1, 0);
        if (primerDiaNuevoMes < this.hoy) {
            return;
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

    seleccionarFecha(fechaISO) {
        this.fechaSeleccionada = fechaISO;
        const input = document.getElementById(this.inputId);
        if (input) {
            input.value = fechaISO;
            // Disparar evento change para ejecutar validarDiaHabil y generarHorariosPublicos
            const evento = new Event('change', { bubbles: true });
            input.dispatchEvent(evento);
        }

        this.render();
        this.actualizarBanner();

        if (window.actualizarProgresoFormulario) {
            window.actualizarProgresoFormulario();
        }
    }

    deseleccionar() {
        this.fechaSeleccionada = null;
        const input = document.getElementById(this.inputId);
        if (input) {
            input.value = '';
        }
        this.render();
        this.actualizarBanner();
    }

    actualizarBanner() {
        const banner = document.getElementById('banner-fecha-seleccionada');
        const txt = document.getElementById('texto-fecha-seleccionada');
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
            // Capitalizar primera letra
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

        // 0 = Domingo, 1 = Lunes, ..., 6 = Sábado
        // En Argentina la semana comienza el Lunes:
        let diaInicioSemana = primerDiaMes.getDay(); // 0 a 6
        let offsetDias = (diaInicioSemana === 0) ? 6 : diaInicioSemana - 1;

        // Comprobar si se puede retroceder
        const primerDiaMesVisible = new Date(this.anioVisible, this.mesVisible, 1);
        const esMesActual = (this.mesVisible === this.hoy.getMonth() && this.anioVisible === this.hoy.getFullYear());

        let html = `
            <div class="calendario-his select-none">
                <!-- Cabecera de Navegación del Mes -->
                <div class="flex items-center justify-between pb-3 mb-2 border-b border-slate-200">
                    <div class="flex items-center gap-2">
                        <span class="w-2.5 h-2.5 rounded-full bg-[#007a78]"></span>
                        <h3 class="text-sm sm:text-base font-bold text-[#002845] tracking-tight">
                            ${MESES[this.mesVisible]} <span class="text-slate-500 font-medium">${this.anioVisible}</span>
                        </h3>
                    </div>

                    <div class="flex items-center gap-1.5">
                        <button type="button" 
                                onclick="window.calendarioHospitalario.irAHoy()" 
                                class="px-2 py-1 text-[11px] font-semibold text-slate-600 hover:text-[#002845] bg-slate-100 hover:bg-slate-200 rounded transition cursor-pointer"
                                title="Volver al mes actual">
                            Hoy
                        </button>
                        <button type="button" 
                                onclick="window.calendarioHospitalario.cambiarMes(-1)" 
                                ${esMesActual ? 'disabled' : ''} 
                                class="w-7 h-7 flex items-center justify-center rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition cursor-pointer"
                                aria-label="Mes anterior">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>
                        </button>
                        <button type="button" 
                                onclick="window.calendarioHospitalario.cambiarMes(1)" 
                                class="w-7 h-7 flex items-center justify-center rounded border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                                aria-label="Mes siguiente">
                            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                        </button>
                    </div>
                </div>

                <!-- Cabecera de Días de la Semana -->
                <div class="grid grid-cols-7 gap-1 text-center mb-1">
        `;

        DIAS_SEMANA.forEach((dia, idx) => {
            const esFinde = (idx >= 5);
            html += `
                <div class="text-[10px] sm:text-[11px] font-bold py-1 ${esFinde ? 'text-slate-400 bg-slate-50/50 rounded' : 'text-[#002845]'}" title="${esFinde ? 'Fin de semana (no laborable)' : 'Día de atención habitual'}">
                    ${dia}
                </div>
            `;
        });

        html += `</div><!-- Grilla de Celdas de Días --><div class="grid grid-cols-7 gap-1 text-center">`;

        // Espacios vacíos antes del 1° del mes
        for (let i = 0; i < offsetDias; i++) {
            html += `<div class="h-9 sm:h-10"></div>`;
        }

        // Celdas de días del mes
        for (let dia = 1; dia <= totalDias; dia++) {
            const fechaDia = new Date(this.anioVisible, this.mesVisible, dia);
            const diaSemana = fechaDia.getDay(); // 0 = Domingo, 6 = Sábado
            const esFinde = (diaSemana === 0 || diaSemana === 6);
            const esPasado = (fechaDia < this.hoy);
            const esExcedido = (fechaDia > this.fechaMaxima);
            const esHoy = (fechaDia.getTime() === this.hoy.getTime());
            const iso = this.formatearISO(this.anioVisible, this.mesVisible, dia);
            const estaSeleccionado = (this.fechaSeleccionada === iso);

            if (esPasado) {
                // Día anterior a hoy
                html += `
                    <button type="button" disabled 
                            class="w-full h-9 sm:h-10 rounded text-slate-300 text-xs flex items-center justify-center cursor-not-allowed line-through opacity-60">
                        ${dia}
                    </button>
                `;
            } else if (esFinde) {
                // Sábado o Domingo (no laborable en consultorios)
                html += `
                    <button type="button" disabled 
                            title="No laborable para consultorios externos"
                            class="w-full h-9 sm:h-10 rounded bg-slate-50/80 text-slate-400 text-xs flex items-center justify-center cursor-not-allowed border border-dashed border-slate-200">
                        ${dia}
                    </button>
                `;
            } else if (esExcedido) {
                // Fuera del rango de 60 días
                html += `
                    <button type="button" disabled 
                            title="Agenda aún no habilitada"
                            class="w-full h-9 sm:h-10 rounded text-slate-300 text-xs flex items-center justify-center cursor-not-allowed">
                        ${dia}
                    </button>
                `;
            } else if (estaSeleccionado) {
                // Día actualmente seleccionado por el paciente
                html += `
                    <button type="button" 
                            onclick="window.calendarioHospitalario.seleccionarFecha('${iso}')"
                            class="w-full h-9 sm:h-10 rounded-md bg-[#002845] text-white font-bold text-xs sm:text-sm flex flex-col items-center justify-center shadow-md ring-2 ring-[#007a78] border border-[#002845] cursor-pointer scale-[1.02] transition-transform"
                            aria-selected="true"
                            title="Día seleccionado">
                        <span>${dia}</span>
                        ${esHoy ? '<span class="text-[8px] uppercase tracking-wider text-teal-300 -mt-0.5 leading-none">Hoy</span>' : ''}
                    </button>
                `;
            } else {
                // Día hábil disponible para reservar
                html += `
                    <button type="button" 
                            onclick="window.calendarioHospitalario.seleccionarFecha('${iso}')"
                            class="w-full h-9 sm:h-10 rounded-md bg-white hover:bg-teal-50 text-slate-800 hover:text-[#002845] hover:border-[#007a78] border border-slate-200 text-xs sm:text-sm font-semibold flex flex-col items-center justify-center shadow-2xs hover:shadow-sm transition-all cursor-pointer group"
                            aria-selected="false"
                            title="Disponible para reserva">
                        <span class="group-hover:scale-110 transition-transform">${dia}</span>
                        ${esHoy ? '<span class="text-[8px] uppercase tracking-wider text-emerald-600 font-bold -mt-0.5 leading-none">Hoy</span>' : ''}
                    </button>
                `;
            }
        }

        html += `
                </div>

                <!-- Leyenda de Referencias Hospitalarias -->
                <div class="mt-3 pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between text-[11px] text-slate-500 gap-2">
                    <div class="flex items-center gap-3">
                        <span class="inline-flex items-center gap-1">
                            <span class="w-2.5 h-2.5 rounded bg-white border border-slate-300 inline-block"></span>
                            <span>Disponible</span>
                        </span>
                        <span class="inline-flex items-center gap-1">
                            <span class="w-2.5 h-2.5 rounded bg-[#002845] inline-block"></span>
                            <span>Seleccionado</span>
                        </span>
                        <span class="inline-flex items-center gap-1">
                            <span class="w-2.5 h-2.5 rounded bg-slate-100 border border-dashed border-slate-200 inline-block"></span>
                            <span>No laborable</span>
                        </span>
                    </div>
                    <span class="text-[10px] text-slate-400">Atención de Lun a Vie de 07:00 a 13:00 hs</span>
                </div>
            </div>
        `;

        contenedor.innerHTML = html;
    }
}

// Inicialización automática
document.addEventListener("DOMContentLoaded", () => {
    window.calendarioHospitalario = new CalendarioHospitalario();
});

export { CalendarioHospitalario };
