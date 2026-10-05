import {
    DatePipe,
    DecimalPipe,
    NgTemplateOutlet
} from '@angular/common';
import {
    Component,
    computed,
    inject,
    OnDestroy,
    OnInit,
    signal
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
    CarteleraFuncionesService,
    FuncionCartelera
} from '../../base/service/cartelera-funciones.service';
import {
    Genero,
    GenerosService
} from '../../base/service/generos.service';
import {
    Pelicula,
    PeliculasService
} from '../../base/service/peliculas.service';

@Component({
    selector: 'app-cartelera',
    imports: [DatePipe, DecimalPipe, NgTemplateOutlet, RouterLink],
    templateUrl: './cartelera.html',
    styleUrl: './cartelera.scss'
})
export class Cartelera implements OnInit, OnDestroy {
    private readonly peliculasService = inject(PeliculasService);
    private readonly generosService = inject(GenerosService);
    private readonly funcionesService = inject(CarteleraFuncionesService);

    private consultaFunciones = 0;
    private reloj: ReturnType<typeof setInterval> | null = null;

    readonly peliculas = signal<Pelicula[]>([]);
    readonly generos = signal<Genero[]>([]);
    readonly cargando = signal(true);
    readonly mensajeError = signal('');

    readonly busqueda = signal('');
    readonly generoSeleccionado = signal('');

    readonly peliculaSeleccionada = signal<Pelicula | null>(null);
    readonly funciones = signal<FuncionCartelera[]>([]);
    readonly cargandoFunciones = signal(false);
    readonly errorFunciones = signal('');

    readonly peliculasFiltradas = computed(() => {
        const texto = this.normalizar(this.busqueda().trim());
        const generoId = this.generoSeleccionado();

        return this.peliculas().filter((pelicula) => {
            const coincideNombre = this.normalizar(pelicula.nombre)
                .includes(texto);

            const coincideGenero =
                generoId === '' ||
                pelicula.generos.some((genero) => genero.id === generoId);

            return coincideNombre && coincideGenero;
        });
    });

    ngOnInit(): void {
        void this.cargarDatos();

        this.reloj = setInterval(() => {
            this.retirarFuncionesComenzadas();
        }, 1000);
    }

    ngOnDestroy(): void {
        ++this.consultaFunciones;

        if (this.reloj !== null) {
            clearInterval(this.reloj);
            this.reloj = null;
        }
    }

    private async cargarDatos(): Promise<void> {
        try {
            const [peliculas, generos] = await Promise.all([
                this.peliculasService.obtenerActivas(),
                this.generosService.obtenerTodos()
            ]);

            this.peliculas.set(peliculas);
            this.generos.set(generos);
        } catch (error) {
            console.error('Error al cargar la cartelera:', error);

            this.mensajeError.set(
                'No se pudo cargar la cartelera. Intentá nuevamente.'
            );
        } finally {
            this.cargando.set(false);
        }
    }

    private retirarFuncionesComenzadas(): void {
        const ahora = Date.now();
        const actuales = this.funciones();

        const disponibles = actuales.filter((funcion) =>
            new Date(funcion.inicio).getTime() > ahora
        );

        if (disponibles.length !== actuales.length) {
            this.funciones.set(disponibles);
        }
    }

    limpiarFiltros(): void {
        this.busqueda.set('');
        this.generoSeleccionado.set('');
    }

    async alternarFunciones(pelicula: Pelicula): Promise<void> {
        if (this.peliculaSeleccionada()?.id === pelicula.id) {
            this.cerrarFunciones();
            return;
        }

        const consulta = this.verFunciones(pelicula);
        const numeroConsulta = this.consultaFunciones;

        requestAnimationFrame(() => {
            if (numeroConsulta !== this.consultaFunciones) {
                return;
            }

            const esMovil = window.matchMedia(
                '(max-width: 600px)'
            ).matches;

            const destino = esMovil
                ? `horarios-movil-${pelicula.id}`
                : 'horarios-pc';

            const reducirMovimiento = window.matchMedia(
                '(prefers-reduced-motion: reduce)'
            ).matches;

            document.getElementById(destino)?.scrollIntoView({
                behavior: reducirMovimiento ? 'instant' : 'smooth',
                block: 'start'
            });
        });

        await consulta;
    }

    async verFunciones(pelicula: Pelicula): Promise<void> {
        const consulta = ++this.consultaFunciones;

        this.peliculaSeleccionada.set(pelicula);
        this.funciones.set([]);
        this.errorFunciones.set('');
        this.cargandoFunciones.set(true);

        try {
            const funciones = await this.funcionesService
                .obtenerDisponibles(pelicula.id);

            if (consulta !== this.consultaFunciones) {
                return;
            }

            this.funciones.set(
                funciones.filter((funcion) =>
                    new Date(funcion.inicio).getTime() > Date.now()
                )
            );
        } catch (error) {
            if (consulta !== this.consultaFunciones) {
                return;
            }

            console.error('Error al consultar las funciones:', error);

            this.errorFunciones.set(
                'No se pudieron cargar los horarios. Intentá nuevamente.'
            );
        } finally {
            if (consulta === this.consultaFunciones) {
                this.cargandoFunciones.set(false);
            }
        }
    }

    async reintentarFunciones(): Promise<void> {
        const pelicula = this.peliculaSeleccionada();

        if (pelicula && !this.cargandoFunciones()) {
            await this.verFunciones(pelicula);
        }
    }

    cerrarFunciones(): void {
        ++this.consultaFunciones;

        this.peliculaSeleccionada.set(null);
        this.funciones.set([]);
        this.errorFunciones.set('');
        this.cargandoFunciones.set(false);
    }

    private normalizar(texto: string): string {
        return texto
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase();
    }
}