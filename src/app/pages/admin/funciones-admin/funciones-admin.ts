import { DatePipe, DecimalPipe } from '@angular/common';
import {
    Component,
    computed,
    inject,
    OnDestroy,
    OnInit,
    signal
} from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';

import {
    DatosFuncion,
    FormatoFuncion,
    Funcion,
    FuncionesService,
    IdiomaFuncion
} from '../../../base/service/funciones.service';

import {
    Pelicula,
    PeliculasService
} from '../../../base/service/peliculas.service';

import {
    Sala,
    SalasService
} from '../../../base/service/salas.service';

import {
    TarifaFormato,
    TarifasService
} from '../../../base/service/tarifas.service';

interface BorradorFuncion {
    pelicula_id: string;
    sala_id: string;
    inicio: string;
    formato: FormatoFuncion;
    idioma: IdiomaFuncion;
    activa: boolean;
}

interface BorradorTarifa {
    formato: FormatoFuncion;
    precio_estandar: number | null;
    precio_accesible: number | null;
    precio_vip: number | null;
}

interface BorradorProgramacion {
    pelicula_id: string;
    desde: string;
    hasta: string;
    hora: string;
    formato: FormatoFuncion;
    idioma: IdiomaFuncion;
}

interface ResultadoProgramacion {
    inicio: string;
    estado: 'creada' | 'rechazada' | 'sin_comprobar' | 'pendiente';
    sala: string;
    mensaje: string;
}

@Component({
    selector: 'app-funciones-admin',
    imports: [
        FormsModule,
        DatePipe,
        DecimalPipe
    ],
    templateUrl: './funciones-admin.html',
    styleUrl: './funciones-admin.scss'
})
export class FuncionesAdmin implements OnInit, OnDestroy {
    private readonly funcionesService = inject(FuncionesService);
    private readonly peliculasService = inject(PeliculasService);
    private readonly salasService = inject(SalasService);
    private readonly tarifasService = inject(TarifasService);

    private reloj: ReturnType<typeof setInterval> | null = null;

    readonly solapa = signal<'funciones' | 'tarifas'>('funciones');
    readonly salaSeleccionada = signal('');
    readonly mostrarArchivadas = signal(false);

    readonly funciones = signal<Funcion[]>([]);
    readonly peliculas = signal<Pelicula[]>([]);
    readonly salas = signal<Sala[]>([]);
    readonly tarifas = signal<TarifaFormato[]>([]);

    readonly ahora = signal(Date.now());
    readonly cargando = signal(false);
    readonly guardando = signal(false);
    readonly guardandoTarifa = signal(false);
    readonly procesando = signal<string | null>(null);
    readonly editorAbierto = signal(false);

    readonly error = signal('');
    readonly exito = signal('');
    readonly errorFormulario = signal('');
    readonly errorTarifa = signal('');

    readonly formatos: FormatoFuncion[] = [
        '2D',
        '3D',
        '4D',
        '5D'
    ];

    readonly programacionAbierta = signal(false);
    readonly programando = signal(false);
    readonly errorProgramacion = signal('');
    readonly progresoProgramacion = signal('');
    readonly resultadosProgramacion = signal<ResultadoProgramacion[]>([]);

    readonly diasElegidos = signal<number[]>([]);

    readonly diasSemana = [
        { numero: 1, nombre: 'Lunes' },
        { numero: 2, nombre: 'Martes' },
        { numero: 3, nombre: 'Miércoles' },
        { numero: 4, nombre: 'Jueves' },
        { numero: 5, nombre: 'Viernes' },
        { numero: 6, nombre: 'Sábado' },
        { numero: 0, nombre: 'Domingo' }
    ];

    readonly funcionesVisibles = computed(() => {
        const ahora = this.ahora();

        const todas = this.funciones().filter((funcion) =>
            this.mostrarArchivadas() || !funcion.archivada
        );

        const ultimas = new Map<string, Funcion>();

        for (const funcion of todas) {
            if (
                !funcion.activa ||
                new Date(funcion.fin).getTime() > ahora
            ) {
                continue;
            }

            const anterior = ultimas.get(funcion.sala_id);
            const fin = new Date(funcion.fin).getTime();

            if (
                !anterior ||
                fin > new Date(anterior.fin).getTime() ||
                (
                    fin === new Date(anterior.fin).getTime() &&
                    funcion.id.localeCompare(anterior.id) > 0
                )
            ) {
                ultimas.set(funcion.sala_id, funcion);
            }
        }

        return todas
            .filter((funcion) => {
                if (funcion.cancelada) {
                    return true;
                }

                if (new Date(funcion.inicio).getTime() > ahora) {
                    return true;
                }

                if (!funcion.activa) {
                    return false;
                }

                return (
                    new Date(funcion.fin).getTime() > ahora ||
                    ultimas.get(funcion.sala_id)?.id === funcion.id
                );
            })
            .sort((primera, segunda) =>
                new Date(primera.inicio).getTime() -
                new Date(segunda.inicio).getTime()
            );
    });

    readonly gruposSalas = computed(() => {
        const seleccionada = this.salaSeleccionada();
        const funciones = this.funcionesVisibles();
        const ahora = this.ahora();

        return this.salas()
            .filter((sala) =>
                !seleccionada || sala.id === seleccionada
            )
            .map((sala) => {
                const propias = funciones.filter((funcion) =>
                    funcion.sala_id === sala.id
                );

                const vigentes = propias.filter((funcion) =>
                    !funcion.cancelada && !funcion.archivada
                );

                return {
                    sala,
                    secciones: [
                        {
                            nombre: 'En curso',
                            funciones: vigentes.filter((funcion) =>
                                funcion.activa &&
                                new Date(funcion.inicio).getTime() <= ahora &&
                                new Date(funcion.fin).getTime() > ahora
                            )
                        },
                        {
                            nombre: 'Próximas',
                            funciones: vigentes.filter((funcion) =>
                                new Date(funcion.inicio).getTime() > ahora
                            )
                        },
                        {
                            nombre: 'Última terminada',
                            funciones: vigentes.filter((funcion) =>
                                new Date(funcion.fin).getTime() <= ahora
                            )
                        },
                        {
                            nombre: 'Canceladas',
                            funciones: propias.filter((funcion) =>
                                funcion.cancelada && !funcion.archivada
                            )
                        },
                        {
                            nombre: 'Archivadas',
                            funciones: propias.filter((funcion) =>
                                funcion.archivada
                            )
                        }
                    ].filter((seccion) =>
                        seccion.nombre !== 'Archivadas' ||
                        this.mostrarArchivadas()
                    )
                };
            });
    });

    funcionEditada: string | null = null;
    borrador: BorradorFuncion = this.nuevoBorrador();

    borradorTarifa: BorradorTarifa = {
        formato: '2D',
        precio_estandar: null,
        precio_accesible: null,
        precio_vip: null
    };

    borradorProgramacion: BorradorProgramacion = {
        pelicula_id: '',
        desde: '',
        hasta: '',
        hora: '',
        formato: '2D',
        idioma: 'castellano'
    };

    ngOnInit(): void {
        void this.cargarDatos();

        this.reloj = setInterval(() => {
            this.ahora.set(Date.now());
        }, 1000);
    }

    ngOnDestroy(): void {
        if (this.reloj !== null) {
            clearInterval(this.reloj);
            this.reloj = null;
        }
    }

    ocupado(): boolean {
        return (
            this.cargando() ||
            this.guardando() ||
            this.guardandoTarifa() ||
            this.programando() ||
            this.procesando() !== null
        );
    }

    cambiarSolapa(solapa: 'funciones' | 'tarifas'): void {
        if (
            this.ocupado() ||
            this.editorAbierto() ||
            this.programacionAbierta()
        ) {
            return;
        }

        this.solapa.set(solapa);
        this.error.set('');
        this.exito.set('');

        if (solapa === 'tarifas') {
            this.cargarBorradorTarifa();
        }
    }

    async cargarDatos(): Promise<void> {
        if (this.ocupado()) {
            return;
        }

        this.cargando.set(true);
        this.error.set('');

        try {
            const [funciones, peliculas, salas, tarifas] = await Promise.all([
                this.funcionesService.obtenerTodas(),
                this.peliculasService.obtenerTodas(),
                this.salasService.obtenerTodas(),
                this.tarifasService.obtenerTodas()
            ]);

            this.ahora.set(Date.now());
            this.funciones.set(funciones);
            this.peliculas.set(peliculas);
            this.salas.set(salas);
            this.tarifas.set(tarifas);

            if (this.solapa() === 'tarifas') {
                this.cargarBorradorTarifa();
            }
        } catch (error) {
            console.error(
                'Error al cargar funciones y tarifas:',
                error
            );

            this.error.set(this.obtenerMensaje(error));
        } finally {
            this.cargando.set(false);
        }
    }

    nombrePelicula(id: string): string {
        return this.peliculas().find(
            (pelicula) => pelicula.id === id
        )?.nombre ?? 'Película no disponible';
    }

    funcionComenzada(funcion: Funcion): boolean {
        return new Date(funcion.inicio).getTime() <= this.ahora();
    }

    estadoTemporal(
        funcion: Funcion
    ): 'Próxima' | 'En curso' | 'Terminada' {
        const ahora = this.ahora();

        if (ahora < new Date(funcion.inicio).getTime()) {
            return 'Próxima';
        }

        return ahora < new Date(funcion.fin).getTime()
            ? 'En curso'
            : 'Terminada';
    }

    inicioMinimo(): string {
        const siguiente =
            Math.floor(this.ahora() / 60000) * 60000 + 60000;

        return this.fechaParaEntrada(
            new Date(siguiente).toISOString()
        );
    }

    fechaMinimaProgramacion(): string {
        return this.fechaParaEntrada(
            new Date(this.ahora()).toISOString()
        ).slice(0, 10);
    }

    finPrevisto(): string | null {
        const pelicula = this.peliculas().find(
            (actual) => actual.id === this.borrador.pelicula_id
        );

        const inicio = this.convertirInicio(this.borrador.inicio);

        if (!pelicula || !inicio) {
            return null;
        }

        const original = this.funciones().find(
            (funcion) => funcion.id === this.funcionEditada
        );

        if (
            original &&
            original.pelicula_id === this.borrador.pelicula_id &&
            new Date(original.inicio).getTime() === inicio.getTime()
        ) {
            return original.fin;
        }

        return new Date(
            inicio.getTime() + pelicula.duracion_minutos * 60000
        ).toISOString();
    }

    preciosFuncion(): TarifaFormato | null {
        return this.tarifaPorFormato(this.borrador.formato);
    }

    tarifaConfigurada(): boolean {
        return this.tarifas().some(
            (tarifa) => tarifa.formato === this.borradorTarifa.formato
        );
    }

    tarifaPorFormato(formato: FormatoFuncion): TarifaFormato | null {
        return this.tarifas().find(
            (tarifa) => tarifa.formato === formato
        ) ?? null;
    }

    editarTarifa(formato: FormatoFuncion): void {
        if (this.ocupado()) {
            return;
        }

        this.borradorTarifa.formato = formato;
        this.cargarBorradorTarifa();
        this.exito.set('');
    }

    nuevaFuncion(): void {
        if (
            this.ocupado() ||
            this.editorAbierto() ||
            this.programacionAbierta()
        ) {
            return;
        }

        this.ahora.set(Date.now());
        this.funcionEditada = null;
        this.borrador = this.nuevoBorrador();
        this.salaSeleccionada.set('');
        this.abrirEditor();
    }

    editarFuncion(funcion: Funcion): void {
        this.ahora.set(Date.now());

        if (
            this.ocupado() ||
            this.editorAbierto() ||
            this.programacionAbierta() ||
            this.funcionComenzada(funcion)
        ) {
            return;
        }

        this.funcionEditada = funcion.id;

        this.borrador = {
            pelicula_id: funcion.pelicula_id,
            sala_id: funcion.sala_id,
            inicio: this.fechaParaEntrada(funcion.inicio),
            formato: funcion.formato,
            idioma: funcion.idioma,
            activa: funcion.activa
        };

        this.abrirEditor();
    }

    cancelar(): void {
        if (this.guardando()) {
            return;
        }

        this.editorAbierto.set(false);
        this.errorFormulario.set('');
        this.funcionEditada = null;
    }

    async guardar(formulario: NgForm): Promise<void> {
        if (this.ocupado()) {
            return;
        }

        this.ahora.set(Date.now());
        formulario.form.markAllAsTouched();
        this.errorFormulario.set('');

        const original = this.funciones().find(
            (funcion) => funcion.id === this.funcionEditada
        );

        if (original && this.funcionComenzada(original)) {
            this.errorFormulario.set(
                'Esta función ya comenzó y no puede editarse.'
            );

            return;
        }

        const inicio = this.convertirInicio(this.borrador.inicio);

        if (!inicio || inicio.getTime() <= Date.now()) {
            this.errorFormulario.set(
                'Seleccioná una fecha y hora futuras.'
            );

            return;
        }

        if (formulario.invalid) {
            this.errorFormulario.set(
                'Completá todos los campos obligatorios.'
            );

            return;
        }

        if (!this.preciosFuncion()) {
            this.errorFormulario.set(
                'Primero configurá las tarifas generales de este formato en Tarifas.'
            );

            return;
        }

        const datos: DatosFuncion = {
            ...this.borrador,
            inicio: inicio.toISOString()
        };

        const esNueva = this.funcionEditada === null;
        let guardada = false;

        this.guardando.set(true);
        this.error.set('');
        this.exito.set('');

        try {
            const funcion = await this.funcionesService.guardar(
                this.funcionEditada,
                datos
            );

            guardada = true;

            const sala = this.salas().find(
                (actual) => actual.id === funcion.sala_id
            );

            this.exito.set(
                esNueva
                    ? `Función creada. Sala asignada: ${
                        sala?.nombre ?? funcion.sala_id
                    }.`
                    : 'Los cambios fueron guardados.'
            );
        } catch (error) {
            console.error(
                'Error al guardar la función:',
                error
            );

            this.errorFormulario.set(this.obtenerMensaje(error));
        } finally {
            this.guardando.set(false);
        }

        if (guardada) {
            this.cancelar();
            await this.cargarDatos();
        }
    }

    async cambiarEstado(funcion: Funcion): Promise<void> {
        if (
            this.ocupado() ||
            this.editorAbierto() ||
            this.programacionAbierta()
        ) {
            return;
        }

        this.ahora.set(Date.now());

        if (!funcion.activa && this.funcionComenzada(funcion)) {
            this.error.set(
                'No podés reactivar una función que ya comenzó.'
            );

            return;
        }

        const activa = !funcion.activa;

        if (
            !window.confirm(
                activa
                    ? '¿Querés activar esta función?'
                    : '¿Cancelar esta función? Se compensarán las compras con crédito y se enviarán avisos por correo.'
            )
        ) {
            return;
        }

        this.ahora.set(Date.now());

        if (activa && this.funcionComenzada(funcion)) {
            this.error.set(
                'No podés reactivar una función que ya comenzó.'
            );

            return;
        }

        this.procesando.set(funcion.id);
        this.error.set('');
        this.exito.set('');

        try {
            await this.funcionesService.cambiarEstado(
                funcion.id,
                activa
            );

            this.funciones.update((funciones) =>
                funciones.map((actual) =>
                    actual.id === funcion.id
                        ? {
                            ...actual,
                            activa,
                            cancelada: !activa
                        }
                        : actual
                )
            );

            this.exito.set(
                activa
                    ? 'La función quedó activa.'
                    : 'La función quedó cancelada. Se registraron las compensaciones y los avisos.'
            );
        } catch (error) {
            this.error.set(this.obtenerMensaje(error));
        } finally {
            this.procesando.set(null);
        }
    }

    async cambiarArchivo(funcion: Funcion): Promise<void> {
        if (
            this.ocupado() ||
            this.editorAbierto() ||
            this.programacionAbierta()
        ) {
            return;
        }

        if (!funcion.cancelada || funcion.activa) {
            this.error.set(
                'Solo se pueden archivar funciones canceladas.'
            );

            return;
        }

        const archivada = !funcion.archivada;

        this.procesando.set(funcion.id);
        this.error.set('');
        this.exito.set('');

        try {
            const actualizada = await this.funcionesService.archivar(
                funcion.id,
                archivada
            );

            this.funciones.update((actuales) =>
                actuales.map((actual) =>
                    actual.id === actualizada.id
                        ? actualizada
                        : actual
                )
            );

            this.exito.set(
                archivada
                    ? 'La función se ocultó del listado. Conserva su historial.'
                    : 'La función vuelve a mostrarse y continúa cancelada.'
            );
        } catch (error) {
            this.error.set(this.obtenerMensaje(error));
        } finally {
            this.procesando.set(null);
        }
    }

    async eliminarFuncion(funcion: Funcion): Promise<void> {
        if (
            this.ocupado() ||
            this.editorAbierto() ||
            this.programacionAbierta()
        ) {
            return;
        }

        this.ahora.set(Date.now());

        if (this.funcionComenzada(funcion)) {
            this.error.set(
                'No podés eliminar una función que ya comenzó.'
            );

            return;
        }

        const pelicula = this.nombrePelicula(funcion.pelicula_id);

        const sala = this.salas().find(
            (actual) => actual.id === funcion.sala_id
        )?.nombre ?? 'Sala';

        const fecha = new Intl.DateTimeFormat('es-AR', {
            timeZone: 'America/Argentina/Buenos_Aires',
            dateStyle: 'short',
            timeStyle: 'short'
        }).format(new Date(funcion.inicio));

        const confirmado = window.confirm(
            `¿Querés cancelar esta función?\n\n` +
            `${pelicula}\n${sala}\n${fecha}\n\n` +
            'Se cancelarán las compras, se compensará a los clientes y se enviarán avisos por correo. Se conservará el historial.'
        );

        if (!confirmado) {
            return;
        }

        this.procesando.set(funcion.id);
        this.error.set('');
        this.exito.set('');

        try {
            await this.funcionesService.eliminar(funcion.id);

            this.funciones.update((actuales) =>
                actuales.map((actual) =>
                    actual.id === funcion.id
                        ? {
                            ...actual,
                            activa: false,
                            cancelada: true
                        }
                        : actual
                )
            );

            this.exito.set(
                'La función fue cancelada. Se registraron las compensaciones y los avisos.'
            );
        } catch (error) {
            console.error(
                'Error al eliminar la función:',
                error
            );

            this.error.set(this.obtenerMensaje(error));
        } finally {
            this.procesando.set(null);
        }
    }

    abrirProgramacion(): void {
        if (
            this.ocupado() ||
            this.editorAbierto() ||
            this.programacionAbierta()
        ) {
            return;
        }

        this.ahora.set(Date.now());

        const fecha = this.fechaMinimaProgramacion();

        this.borradorProgramacion = {
            pelicula_id: '',
            desde: fecha,
            hasta: fecha,
            hora: '',
            formato: '2D',
            idioma: 'castellano'
        };

        this.diasElegidos.set([]);
        this.resultadosProgramacion.set([]);
        this.errorProgramacion.set('');
        this.progresoProgramacion.set('');
        this.error.set('');
        this.exito.set('');
        this.salaSeleccionada.set('');
        this.programacionAbierta.set(true);
    }

    cerrarProgramacion(): void {
        if (this.programando()) {
            return;
        }

        this.programacionAbierta.set(false);
    }

    cambiarDia(
        numero: number,
        seleccionado: boolean
    ): void {
        if (this.programando()) {
            return;
        }

        this.diasElegidos.update((actuales) =>
            seleccionado
                ? [...new Set([...actuales, numero])]
                : actuales.filter((actual) => actual !== numero)
        );
    }

    async programarFunciones(formulario: NgForm): Promise<void> {
        if (
            this.ocupado() ||
            this.resultadosProgramacion().length > 0
        ) {
            return;
        }

        formulario.form.markAllAsTouched();
        this.errorProgramacion.set('');

        if (
            formulario.invalid ||
            this.diasElegidos().length === 0
        ) {
            this.errorProgramacion.set(
                'Completá los campos y elegí al menos un día de la semana.'
            );

            return;
        }

        const datos = { ...this.borradorProgramacion };

        const pelicula = this.peliculas().find(
            (actual) => actual.id === datos.pelicula_id
        );

        if (!pelicula?.activa) {
            this.errorProgramacion.set(
                'Elegí una película activa.'
            );

            return;
        }

        if (!this.tarifaPorFormato(datos.formato)) {
            this.errorProgramacion.set(
                'Primero configurá las tarifas de este formato.'
            );

            return;
        }

        let fechas: string[];

        try {
            fechas = this.generarFechasProgramacion();
        } catch (error) {
            this.errorProgramacion.set(this.obtenerMensaje(error));
            return;
        }

        if (
            !window.confirm(
                `Se intentarán crear ${fechas.length} funciones de ${
                    pelicula.nombre
                }, con sala automática. ¿Continuar?`
            )
        ) {
            return;
        }

        this.programando.set(true);
        this.exito.set('');
        this.error.set('');

        try {
            for (let indice = 0; indice < fechas.length; indice++) {
                const inicio = fechas[indice];

                this.progresoProgramacion.set(
                    `Procesando ${indice + 1} de ${fechas.length}…`
                );

                try {
                    const funcion = await this.funcionesService.guardar(
                        null,
                        {
                            pelicula_id: datos.pelicula_id,
                            sala_id: '',
                            inicio,
                            formato: datos.formato,
                            idioma: datos.idioma,
                            activa: true
                        }
                    );

                    const sala = this.salas().find(
                        (actual) => actual.id === funcion.sala_id
                    );

                    this.funciones.update((actuales) => [
                        funcion,
                        ...actuales.filter(
                            (actual) => actual.id !== funcion.id
                        )
                    ]);

                    this.resultadosProgramacion.update((actuales) => [
                        ...actuales,
                        {
                            inicio,
                            estado: 'creada',
                            sala: sala?.nombre ?? funcion.sala_id,
                            mensaje: 'Función creada.'
                        }
                    ]);
                } catch (error) {
                    const codigo =
                        typeof error === 'object' &&
                        error !== null &&
                        'code' in error
                            ? String(error.code)
                            : '';

                    // Estos errores confirman que la base rechazó
                    // la operación y no creó esa función.
                    const rechazoConfirmado =
                        /^[0-9A-Z]{5}$/.test(codigo);

                    this.resultadosProgramacion.update((actuales) => [
                        ...actuales,
                        {
                            inicio,
                            estado: rechazoConfirmado
                                ? 'rechazada'
                                : 'sin_comprobar',
                            sala: '',
                            mensaje: rechazoConfirmado
                                ? this.obtenerMensaje(error)
                                : 'No se pudo comprobar el resultado. Actualizá el listado antes de volver a crear esta fecha.'
                        }
                    ]);

                    if (!rechazoConfirmado) {
                        this.resultadosProgramacion.update((actuales) => [
                            ...actuales,
                            ...fechas.slice(indice + 1).map(
                                (fecha): ResultadoProgramacion => ({
                                    inicio: fecha,
                                    estado: 'pendiente',
                                    sala: '',
                                    mensaje: 'No se intentó crear esta función.'
                                })
                            )
                        ]);

                        this.errorProgramacion.set(
                            'La programación se detuvo porque no pudimos comprobar una respuesta del servidor.'
                        );

                        break;
                    }
                }
            }
        } finally {
            this.programando.set(false);
            this.progresoProgramacion.set('');
            this.ahora.set(Date.now());
        }

        const resultados = this.resultadosProgramacion();

        const creadas = resultados.filter(
            (actual) => actual.estado === 'creada'
        ).length;

        const rechazadas = resultados.filter(
            (actual) => actual.estado === 'rechazada'
        ).length;

        this.exito.set(
            `Programación finalizada: ${creadas} creadas y ${
                rechazadas
            } rechazadas. Revisá el detalle de cada fecha.`
        );

        await this.cargarDatos();
    }

    cargarBorradorTarifa(): void {
        const tarifa = this.tarifas().find(
            (actual) => actual.formato === this.borradorTarifa.formato
        );

        this.borradorTarifa.precio_estandar =
            tarifa?.precio_estandar ?? null;

        this.borradorTarifa.precio_accesible =
            tarifa?.precio_accesible ?? null;

        this.borradorTarifa.precio_vip =
            tarifa?.precio_vip ?? null;

        this.errorTarifa.set('');
    }

    async guardarTarifa(formulario: NgForm): Promise<void> {
        if (this.ocupado()) {
            return;
        }

        formulario.form.markAllAsTouched();
        this.errorTarifa.set('');
        this.exito.set('');

        const {
            formato,
            precio_estandar,
            precio_accesible,
            precio_vip
        } = this.borradorTarifa;

        if (
            formulario.invalid ||
            precio_estandar === null ||
            precio_accesible === null ||
            precio_vip === null
        ) {
            this.errorTarifa.set(
                'Completá el formato y los precios.'
            );

            return;
        }

        this.guardandoTarifa.set(true);

        try {
            await this.tarifasService.guardar({
                formato,
                precio_estandar,
                precio_accesible,
                precio_vip
            });

            this.tarifas.update((actuales) => [
                ...actuales.filter(
                    (actual) => actual.formato !== formato
                ),
                {
                    formato,
                    precio_estandar,
                    precio_accesible,
                    precio_vip,
                    actualizado_en: new Date().toISOString()
                }
            ]);

            this.exito.set(
                'Tarifa guardada. Se actualizaron las funciones futuras de este formato en todas las salas.'
            );

            try {
                const [tarifas, funciones] = await Promise.all([
                    this.tarifasService.obtenerTodas(),
                    this.funcionesService.obtenerTodas()
                ]);

                this.tarifas.set(tarifas);
                this.funciones.set(funciones);
                this.ahora.set(Date.now());
                this.cargarBorradorTarifa();
            } catch (error) {
                console.error(
                    'Error al actualizar los listados:',
                    error
                );

                this.errorTarifa.set(
                    'Los cambios se guardaron, pero no pudimos actualizar los listados. Presioná Actualizar.'
                );
            }
        } catch (error) {
            this.errorTarifa.set(this.obtenerMensaje(error));
        } finally {
            this.guardandoTarifa.set(false);
        }
    }

    private generarFechasProgramacion(): string[] {
        const { desde, hasta, hora } = this.borradorProgramacion;

        const inicioRango = this.convertirInicio(
            `${desde}T00:00`
        );

        const finRango = this.convertirInicio(
            `${hasta}T00:00`
        );

        if (!inicioRango || !finRango || desde > hasta) {
            throw new Error(
                'Indicá un rango de fechas válido.'
            );
        }

        const cantidadDias =
            Math.round(
                (finRango.getTime() - inicioRango.getTime()) / 86400000
            ) + 1;

        if (cantidadDias > 90) {
            throw new Error(
                'Elegí un rango de hasta 90 días por programación.'
            );
        }

        const fechas: string[] = [];
        const dias = new Set(this.diasElegidos());

        for (let indice = 0; indice < cantidadDias; indice++) {
            const fecha = new Date(
                inicioRango.getTime() + indice * 86400000
            );

            // El rango representa días de Argentina.
            const fechaLocal = this.fechaParaEntrada(
                fecha.toISOString()
            ).slice(0, 10);

            const diaSemana = new Date(
                `${fechaLocal}T12:00:00Z`
            ).getUTCDay();

            if (!dias.has(diaSemana)) {
                continue;
            }

            const inicio = this.convertirInicio(
                `${fechaLocal}T${hora}`
            );

            if (!inicio || inicio.getTime() <= Date.now()) {
                throw new Error(
                    'Todas las fechas seleccionadas deben tener un horario futuro.'
                );
            }

            fechas.push(inicio.toISOString());
        }

        if (fechas.length === 0) {
            throw new Error(
                'El rango no contiene los días de la semana seleccionados.'
            );
        }

        if (fechas.length > 60) {
            throw new Error(
                'Podés crear hasta 60 funciones por programación. Reducí el rango o los días seleccionados.'
            );
        }

        return fechas;
    }

    private nuevoBorrador(): BorradorFuncion {
        return {
            pelicula_id: '',
            sala_id: '',
            inicio: '',
            formato: '2D',
            idioma: 'castellano',
            activa: true
        };
    }

    private abrirEditor(): void {
        this.errorFormulario.set('');
        this.error.set('');
        this.exito.set('');
        this.editorAbierto.set(true);
    }

    private convertirInicio(valor: string): Date | null {
        if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(valor)) {
            return null;
        }

        const fecha = new Date(`${valor}:00-03:00`);

        if (Number.isNaN(fecha.getTime())) {
            return null;
        }

        return this.fechaParaEntrada(fecha.toISOString()) === valor
            ? fecha
            : null;
    }

    private fechaParaEntrada(valor: string): string {
        const partes = new Intl.DateTimeFormat('en-GB', {
            timeZone: 'America/Argentina/Buenos_Aires',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23'
        }).formatToParts(new Date(valor));

        const obtener = (tipo: string): string =>
            partes.find(
                (parte) => parte.type === tipo
            )?.value ?? '';

        return (
            `${obtener('year')}-${obtener('month')}-${obtener('day')}` +
            `T${obtener('hour')}:${obtener('minute')}`
        );
    }

    private obtenerMensaje(error: unknown): string {
        if (typeof error === 'object' && error !== null) {
            const detalle = error as {
                message?: string;
            };

            if (
                typeof detalle.message === 'string' &&
                detalle.message
            ) {
                return detalle.message;
            }
        }

        return 'No se pudo completar la operación. Intentá nuevamente.';
    }
}