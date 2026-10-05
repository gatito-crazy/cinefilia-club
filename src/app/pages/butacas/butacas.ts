import { DatePipe, DecimalPipe } from '@angular/common';
import {
    Component,
    computed,
    inject,
    OnDestroy,
    OnInit,
    signal
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { RealtimeChannel } from '@supabase/supabase-js';
import {
    CarteleraFuncionesService,
    FuncionCartelera
} from '../../base/service/cartelera-funciones.service';
import {
    Butaca,
    SalasService
} from '../../base/service/salas.service';
import { PeliculasService } from '../../base/service/peliculas.service';
import {
    OcupacionButaca,
    Reserva,
    ReservasService,
    SolicitudReserva
} from '../../base/service/reservas.service';

@Component({
    selector: 'app-butacas',
    imports: [DatePipe, DecimalPipe, RouterLink],
    templateUrl: './butacas.html',
    styleUrl: './butacas.scss'
})
export class Butacas implements OnInit, OnDestroy {
    private readonly ruta = inject(ActivatedRoute);
    private readonly funcionesService = inject(CarteleraFuncionesService);
    private readonly salasService = inject(SalasService);
    private readonly peliculasService = inject(PeliculasService);
    private readonly reservasService = inject(ReservasService);

    private reloj: ReturnType<typeof setInterval> | null = null;
    private canal: RealtimeChannel | null = null;
    private destruido = false;
    private sincronizacionPendiente = false;
    private funcionId = '';
    private claveAlmacenamiento = '';
    private solicitud: SolicitudReserva | null = null;
    private diferenciaServidor = 0;
    private ultimoControl = 0;

    readonly cargando = signal(true);
    readonly sincronizando = signal(false);
    readonly reservando = signal(false);
    readonly cancelando = signal(false);
    readonly conexionEnVivo = signal(false);
    readonly resultadoIncierto = signal(false);
    readonly funcionDisponible = signal(true);

    readonly error = signal('');
    readonly errorOperacion = signal('');
    readonly errorSincronizacion = signal('');
    readonly aviso = signal('');

    readonly funcion = signal<FuncionCartelera | null>(null);
    readonly nombrePelicula = signal('');
    readonly butacas = signal<Butaca[]>([]);
    readonly seleccionadas = signal<string[]>([]);
    readonly ocupacion = signal<OcupacionButaca[]>([]);
    readonly reserva = signal<Reserva | null>(null);
    readonly ahora = signal(Date.now());

    readonly ventaCerrada = computed(() => {
        const funcion = this.funcion();

        return !funcion ||
            !this.funcionDisponible() ||
            new Date(funcion.inicio).getTime() <= this.ahora();
    });

    readonly reservaVigente = computed(() => {
        const reserva = this.reserva();

        return !!reserva &&
            reserva.estado === 'reservada' &&
            new Date(reserva.vence_en).getTime() > this.ahora() &&
            !this.ventaCerrada();
    });

    readonly tiempoRestante = computed(() => {
        const reserva = this.reserva();

        if (!reserva) {
            return '00:00';
        }

        const segundos = Math.max(
            0,
            Math.ceil(
                (new Date(reserva.vence_en).getTime() - this.ahora()) / 1000
            )
        );

        const minutos = Math.floor(segundos / 60);
        const resto = segundos % 60;

        return `${String(minutos).padStart(2, '0')}:` +
            String(resto).padStart(2, '0');
    });

    readonly ocupacionPorId = computed(() =>
        new Map(
            this.ocupacion().map((actual) => [
                actual.butaca_id,
                actual
            ])
        )
    );

    readonly filas = computed(() => {
        const agrupadas = new Map<string, Butaca[]>();

        for (const butaca of this.butacas()) {
            const fila = agrupadas.get(butaca.fila) ?? [];
            fila.push(butaca);
            agrupadas.set(butaca.fila, fila);
        }

        return [...agrupadas.entries()]
            .map(([nombre, butacas]) => {
                const ordenadas = [...butacas].sort(
                    (primera, segunda) => primera.numero - segunda.numero
                );

                return {
                    nombre,
                    orden: ordenadas[0].orden_fila,
                    bloques: [
                        {
                            nombre: 'Izquierdo',
                            butacas: ordenadas.filter(
                                (butaca) => butaca.bloque === 'izquierdo'
                            )
                        },
                        {
                            nombre: 'Central',
                            butacas: ordenadas.filter(
                                (butaca) => butaca.bloque === 'central'
                            )
                        },
                        {
                            nombre: 'Derecho',
                            butacas: ordenadas.filter(
                                (butaca) => butaca.bloque === 'derecho'
                            )
                        }
                    ]
                };
            })
            .sort((primera, segunda) => primera.orden - segunda.orden);
    });

    readonly detalleSeleccion = computed(() => {
        const ids = new Set(this.seleccionadas());

        return this.butacas()
            .filter((butaca) => ids.has(butaca.id))
            .sort((primera, segunda) =>
                primera.orden_fila - segunda.orden_fila ||
                primera.numero - segunda.numero
            );
    });

    readonly total = computed(() => {
        if (this.reservaVigente()) {
            return this.reserva()?.total ?? 0;
        }

        return this.detalleSeleccion().reduce(
            (acumulado, butaca) => acumulado + this.precioButaca(butaca),
            0
        );
    });

    readonly tieneVip = computed(() =>
        this.detalleSeleccion().some((butaca) => butaca.tipo === 'vip')
    );

    private readonly alVolver = (): void => {
        if (document.visibilityState === 'visible') {
            this.actualizarReloj();
            void this.sincronizar();
        }
    };

    ngOnInit(): void {
        void this.cargar();

        document.addEventListener('visibilitychange', this.alVolver);

        this.reloj = setInterval(() => {
            this.actualizarReloj();
            this.comprobarVencimiento();

            if (Date.now() - this.ultimoControl >= 5000) {
                this.ultimoControl = Date.now();
                void this.sincronizar();
            }
        }, 1000);
    }

    ngOnDestroy(): void {
        this.destruido = true;

        document.removeEventListener('visibilitychange', this.alVolver);

        if (this.reloj !== null) {
            clearInterval(this.reloj);
            this.reloj = null;
        }

        if (this.canal) {
            void this.reservasService.dejarDeEscuchar(this.canal);
            this.canal = null;
        }
    }

    async cargar(): Promise<void> {
        if (this.reservando() || this.cancelando()) {
            return;
        }

        this.cargando.set(true);
        this.error.set('');
        this.errorOperacion.set('');
        this.aviso.set('');

        try {
            this.funcionId = this.ruta.snapshot.paramMap.get('id') ?? '';

            if (!this.funcionId) {
                throw new Error('No se indicó una función.');
            }

            const funcion = await this.funcionesService
                .obtenerDisponible(this.funcionId);

            if (!funcion) {
                throw new Error(
                    'Esta función ya no está disponible para elegir entradas.'
                );
            }

            const [butacas, peliculas, claveAlmacenamiento] =
                await Promise.all([
                    this.salasService.obtenerButacas(funcion.sala_id),
                    this.peliculasService.obtenerActivas(),
                    this.reservasService.obtenerClaveAlmacenamiento(
                        this.funcionId
                    )
                ]);

            const pelicula = peliculas.find(
                (actual) => actual.id === funcion.pelicula_id
            );

            if (!pelicula) {
                throw new Error('La película ya no está disponible.');
            }

            if (this.destruido) {
                return;
            }

            this.funcion.set(funcion);
            this.funcionDisponible.set(true);
            this.nombrePelicula.set(pelicula.nombre);
            this.butacas.set(butacas);
            this.claveAlmacenamiento = claveAlmacenamiento;

            this.solicitud = this.reservasService.leerSolicitud(
                this.claveAlmacenamiento
            );

            this.reserva.set(null);
            this.resultadoIncierto.set(!!this.solicitud);
            this.seleccionadas.set(this.solicitud?.butacas ?? []);

            if (!this.canal) {
                this.canal = this.reservasService.escuchar(
                    this.funcionId,
                    () => void this.sincronizar(),
                    (conectado) => {
                        if (!this.destruido) {
                            this.conexionEnVivo.set(conectado);
                        }
                    }
                );
            }
        } catch (error) {
            if (!this.destruido) {
                console.error('Error al cargar las butacas:', error);
                this.error.set(this.obtenerMensaje(error));
            }
        } finally {
            if (!this.destruido) {
                this.cargando.set(false);
            }
        }

        if (!this.error() && !this.destruido) {
            await this.sincronizar();
        }
    }

    async sincronizar(): Promise<void> {
        if (
            this.destruido ||
            this.cargando() ||
            this.error() ||
            !this.funcionId
        ) {
            return;
        }

        if (
            this.sincronizando() ||
            this.reservando() ||
            this.cancelando()
        ) {
            this.sincronizacionPendiente = true;
            return;
        }

        this.sincronizando.set(true);
        this.sincronizacionPendiente = false;

        try {
            const solicitud = this.solicitud;

            const [estado, reserva, funcion] = await Promise.all([
                this.reservasService.obtenerOcupacion(this.funcionId),
                solicitud
                    ? this.reservasService.obtenerReserva(solicitud.clave)
                    : Promise.resolve(null),
                this.funcionesService.obtenerDisponible(this.funcionId)
            ]);

            if (this.destruido) {
                return;
            }

            this.ajustarReloj(estado.servidor_ahora);
            this.ocupacion.set(estado.ocupacion);
            this.funcionDisponible.set(funcion !== null);

            if (funcion) {
                this.funcion.set(funcion);
            }

            if (solicitud && this.solicitud?.clave === solicitud.clave) {
                if (reserva) {
                    this.aplicarReserva(reserva);
                } else if (solicitud.confirmada) {
                    this.olvidarReserva();
                    this.aviso.set('La reserva ya no está disponible.');
                } else {
                    this.resultadoIncierto.set(true);
                }
            }

            this.errorSincronizacion.set('');
            this.comprobarVencimiento();
            this.retirarSeleccionOcupada();
        } catch (error) {
            if (!this.destruido) {
                console.error('Error al actualizar la ocupación:', error);

                this.errorSincronizacion.set(
                    'No pudimos actualizar la disponibilidad. Revisá la conexión.'
                );
            }
        } finally {
            this.sincronizando.set(false);
        }

        if (this.sincronizacionPendiente && !this.destruido) {
            this.sincronizacionPendiente = false;
            void this.sincronizar();
        }
    }

    estadoButaca(
        butaca: Butaca
    ): 'libre' | 'propia' | 'reservada' | 'vendida' {
        const reserva = this.reserva();

        if (
            this.reservaVigente() &&
            reserva?.butacas.some(
                (actual) => actual.butaca_id === butaca.id
            )
        ) {
            return 'propia';
        }

        const ocupacion = this.ocupacionPorId().get(butaca.id);

        if (ocupacion?.estado === 'vendida') {
            return 'vendida';
        }

        if (
            ocupacion?.estado === 'reservada' &&
            ocupacion.vence_en &&
            new Date(ocupacion.vence_en).getTime() > this.ahora()
        ) {
            return 'reservada';
        }

        return 'libre';
    }

    butacaBloqueada(butaca: Butaca): boolean {
        return this.ventaCerrada() ||
            this.reservando() ||
            this.cancelando() ||
            this.resultadoIncierto() ||
            this.reservaVigente() ||
            this.estadoButaca(butaca) !== 'libre';
    }

    alternarButaca(butaca: Butaca): void {
        this.actualizarReloj();

        if (this.butacaBloqueada(butaca)) {
            return;
        }

        this.aviso.set('');
        this.errorOperacion.set('');

        if (
            !this.seleccionadas().includes(butaca.id) &&
            this.seleccionadas().length >= 20
        ) {
            this.aviso.set(
                'Podés seleccionar hasta 20 ubicaciones por compra.'
            );
            return;
        }

        this.seleccionadas.update((actuales) =>
            actuales.includes(butaca.id)
                ? actuales.filter((id) => id !== butaca.id)
                : [...actuales, butaca.id]
        );

        if (
            butaca.tipo === 'accesible' &&
            this.seleccionadas().includes(butaca.id)
        ) {
            this.aviso.set(
                'Seleccionaste una ubicación accesible destinada a personas con discapacidad.'
            );
        }
    }

    limpiarSeleccion(): void {
        if (
            this.reservaVigente() ||
            this.resultadoIncierto() ||
            this.reservando() ||
            this.cancelando()
        ) {
            return;
        }

        this.seleccionadas.set([]);
        this.aviso.set('');
    }

    async continuar(): Promise<void> {
        if (
            this.reservando() ||
            this.cancelando() ||
            this.sincronizando() ||
            this.reservaVigente() ||
            this.ventaCerrada()
        ) {
            return;
        }

        this.errorOperacion.set('');

        try {
            if (!this.solicitud) {
                if (this.seleccionadas().length === 0) {
                    return;
                }

                const solicitud: SolicitudReserva = {
                    clave: crypto.randomUUID(),
                    butacas: [...this.seleccionadas()],
                    confirmada: false
                };

                // Se guarda antes de enviar para poder recuperar
                // la misma solicitud si la respuesta se pierde.
                this.reservasService.guardarSolicitud(
                    this.claveAlmacenamiento,
                    solicitud
                );

                this.solicitud = solicitud;
            }
        } catch {
            this.errorOperacion.set(
                'El navegador no pudo guardar la solicitud. Revisá que permita el almacenamiento del sitio.'
            );
            return;
        }

        const solicitud = this.solicitud;

        if (!solicitud) {
            return;
        }

        this.reservando.set(true);
        this.resultadoIncierto.set(true);

        try {
            const reserva = await this.reservasService.reservar(
                this.funcionId,
                solicitud
            );

            solicitud.confirmada = true;

            this.reservasService.guardarSolicitud(
                this.claveAlmacenamiento,
                solicitud
            );

            if (!this.destruido) {
                this.aplicarReserva(reserva);
                this.aviso.set(
                    'Tus ubicaciones quedaron reservadas. El plazo incluye candy y la confirmación de compra.'
                );
            }
        } catch (error) {
            if (!this.destruido) {
                const codigo = typeof error === 'object' &&
                    error !== null &&
                    'code' in error
                        ? String(error.code)
                        : '';

                if (/^[0-9A-Z]{5}$/.test(codigo)) {
                    this.olvidarReserva(false);
                    this.errorOperacion.set(this.obtenerMensaje(error));
                } else {
                    this.resultadoIncierto.set(true);

                    this.errorOperacion.set(
                        'No pudimos comprobar la respuesta. Presioná Comprobar reserva: se usará la misma solicitud y no se reiniciará el plazo.'
                    );
                }
            }
        } finally {
            this.reservando.set(false);
        }

        if (!this.destruido) {
            await this.sincronizar();
        }
    }

    async cancelarReserva(): Promise<void> {
        const solicitud = this.solicitud;

        if (
            !solicitud ||
            this.reservando() ||
            this.cancelando() ||
            this.sincronizando()
        ) {
            return;
        }

        this.cancelando.set(true);
        this.errorOperacion.set('');

        try {
            await this.reservasService.cancelar(solicitud.clave);

            if (!this.destruido) {
                this.olvidarReserva();
                this.aviso.set(
                    'La reserva fue cancelada. Las ubicaciones volvieron a estar disponibles.'
                );
            }
        } catch (error) {
            if (!this.destruido) {
                this.errorOperacion.set(this.obtenerMensaje(error));
            }
        } finally {
            this.cancelando.set(false);
        }

        if (!this.destruido) {
            await this.sincronizar();
        }
    }

    precioButaca(butaca: Butaca): number {
        const reservado = this.reservaVigente()
            ? this.reserva()?.butacas.find(
                (actual) => actual.butaca_id === butaca.id
            )
            : null;

        if (reservado) {
            return reservado.precio;
        }

        const funcion = this.funcion();

        if (!funcion) {
            return 0;
        }

        if (butaca.tipo === 'vip') {
            return funcion.precio_vip;
        }

        return butaca.tipo === 'accesible'
            ? funcion.precio_accesible
            : funcion.precio_estandar;
    }

    nombreTipo(butaca: Butaca): string {
        if (butaca.tipo === 'vip') {
            return 'VIP';
        }

        return butaca.tipo === 'accesible'
            ? 'Accesible'
            : 'Estándar';
    }

    etiquetaButaca(butaca: Butaca): string {
        const estado = this.estadoButaca(butaca);

        const descripcion = estado === 'propia'
            ? 'reservada para vos'
            : estado === 'reservada'
                ? 'reservada por otro comprador'
                : estado === 'vendida'
                    ? 'vendida'
                    : this.seleccionadas().includes(butaca.id)
                        ? 'seleccionada'
                        : 'disponible';

        return `Fila ${butaca.fila}, ubicación ${butaca.numero}, ` +
            `${this.nombreTipo(butaca)}, ` +
            `${this.precioButaca(butaca)} pesos, ${descripcion}`;
    }

    private aplicarReserva(reserva: Reserva): void {
        this.ajustarReloj(reserva.servidor_ahora);

        if (
            reserva.estado !== 'reservada' ||
            new Date(reserva.vence_en).getTime() <= this.ahora()
        ) {
            this.olvidarReserva();

            this.aviso.set(
                reserva.estado === 'confirmada'
                    ? 'La reserva ya fue confirmada.'
                    : 'La reserva terminó. Volvé a elegir tus ubicaciones.'
            );
            return;
        }

        this.reserva.set(reserva);
        this.resultadoIncierto.set(false);
        this.seleccionadas.set(
            reserva.butacas.map((butaca) => butaca.butaca_id)
        );

        if (this.solicitud && !this.solicitud.confirmada) {
            this.solicitud.confirmada = true;

            this.reservasService.guardarSolicitud(
                this.claveAlmacenamiento,
                this.solicitud
            );
        }
    }

    private retirarSeleccionOcupada(): void {
        if (
            this.reservaVigente() ||
            this.resultadoIncierto() ||
            this.reservando()
        ) {
            return;
        }

        const retiradas = this.detalleSeleccion().filter(
            (butaca) => this.estadoButaca(butaca) !== 'libre'
        );

        if (retiradas.length > 0) {
            const ids = new Set(retiradas.map((butaca) => butaca.id));

            this.seleccionadas.update((actuales) =>
                actuales.filter((id) => !ids.has(id))
            );

            this.aviso.set(
                'Estas ubicaciones ya no están disponibles: ' +
                retiradas.map(
                    (butaca) => `${butaca.fila}${butaca.numero}`
                ).join(', ') +
                '. Elegí otras.'
            );
        }

        if (this.ventaCerrada()) {
            this.seleccionadas.set([]);
        }
    }

    private comprobarVencimiento(): void {
        const reserva = this.reserva();

        if (
            reserva &&
            (
                new Date(reserva.vence_en).getTime() <= this.ahora() ||
                this.ventaCerrada()
            )
        ) {
            this.olvidarReserva();

            this.aviso.set(
                'Terminó el plazo de tu reserva. Volvé a elegir las ubicaciones si la función sigue disponible.'
            );
        }
    }

    private olvidarReserva(limpiarSeleccion = true): void {
        this.reserva.set(null);
        this.solicitud = null;
        this.resultadoIncierto.set(false);

        if (this.claveAlmacenamiento) {
            this.reservasService.quitarSolicitud(
                this.claveAlmacenamiento
            );
        }

        if (limpiarSeleccion) {
            this.seleccionadas.set([]);
        }
    }

    private ajustarReloj(fechaServidor: string): void {
        const servidor = new Date(fechaServidor).getTime();

        if (Number.isFinite(servidor)) {
            this.diferenciaServidor = servidor - Date.now();
        }

        this.actualizarReloj();
    }

    private actualizarReloj(): void {
        this.ahora.set(Date.now() + this.diferenciaServidor);
    }

    private obtenerMensaje(error: unknown): string {
        if (
            typeof error === 'object' &&
            error !== null &&
            'message' in error &&
            typeof error.message === 'string'
        ) {
            return error.message;
        }

        return 'No se pudo completar la operación. Revisá la conexión.';
    }
}