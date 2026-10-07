import {
  BeneficiosService,
  ProximaPelicula,
  mensajeBeneficio,
} from '../../base/service/beneficios.service';
import { AuthService } from '../../base/service/auth.service';
import { DatePipe, DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { Component, computed, effect, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  CarteleraFuncionesService,
  FuncionCartelera,
} from '../../base/service/cartelera-funciones.service';
import { Genero, GenerosService } from '../../base/service/generos.service';
import { Pelicula, PeliculasService } from '../../base/service/peliculas.service';

@Component({
  selector: 'app-cartelera',
  imports: [DatePipe, DecimalPipe, NgTemplateOutlet, RouterLink],
  templateUrl: './cartelera.html',
  styleUrl: './cartelera.scss',
})
export class Cartelera implements OnInit, OnDestroy {
  readonly auth = inject(AuthService);

  private readonly beneficios = inject(BeneficiosService);
  private readonly ruta = inject(ActivatedRoute);
  private readonly peliculasService = inject(PeliculasService);
  private readonly generosService = inject(GenerosService);
  private readonly funcionesService = inject(CarteleraFuncionesService);

  private destruido = false;
  private consultaProximas = 0;
  private consultaFunciones = 0;
  private reloj: ReturnType<typeof setInterval> | null = null;

  readonly comentariosAbiertos = signal(false);
  readonly errorResenas = signal('');

  readonly resenas = signal<{
    promedio: number;
    cantidad: number;
    resenas: {
      estrellas: number;
      comentario: string;
      fecha: string;
    }[];
  } | null>(null);

  readonly peliculas = signal<Pelicula[]>([]);
  readonly generos = signal<Genero[]>([]);
  readonly cargando = signal(true);
  readonly mensajeError = signal('');

  readonly busqueda = signal('');
  readonly generoSeleccionado = signal('');

  readonly proximas = signal<ProximaPelicula[]>([]);
  readonly errorProximas = signal('');
  readonly procesandoAlerta = signal(false);
  readonly errorAlerta = signal('');
  readonly exitoAlerta = signal('');
  readonly cargandoAlertas = signal(false);

  readonly peliculaSeleccionada = signal<Pelicula | null>(null);
  readonly funciones = signal<FuncionCartelera[]>([]);
  readonly cargandoFunciones = signal(false);
  readonly errorFunciones = signal('');

  readonly peliculasFiltradas = computed(() => {
    const texto = this.normalizar(this.busqueda().trim());
    const generoId = this.generoSeleccionado();

    return this.peliculas().filter((pelicula) => {
      const coincideNombre = this.normalizar(pelicula.nombre).includes(texto);

      const coincideGenero =
        generoId === '' || pelicula.generos.some((genero) => genero.id === generoId);

      return coincideNombre && coincideGenero;
    });
  });

  readonly secciones = computed(() => {
    const ids = new Set(this.proximas().map((pelicula) => pelicula.id));

    const filtradas = this.peliculasFiltradas();

    return [
      {
        id: 'en-cartelera',
        titulo: 'En cartelera',
        descripcion: 'Películas estrenadas y otros títulos activos.',
        peliculas: filtradas.filter((pelicula) => !ids.has(pelicula.id)),
      },
      {
        id: 'proximamente',
        titulo: 'Próximamente',
        descripcion:
          'Estrenos de las próximas seis semanas. Consultá sus funciones o activá un aviso por correo.',
        peliculas: filtradas.filter((pelicula) => ids.has(pelicula.id)),
      },
    ];
  });

  readonly alertaActivada = computed(() => {
    const id = this.peliculaSeleccionada()?.id;

    return this.proximas().some((pelicula) => pelicula.id === id && pelicula.alerta);
  });

  readonly seleccionEsProxima = computed(() => {
    const id = this.peliculaSeleccionada()?.id;

    return this.proximas().some((pelicula) => pelicula.id === id);
  });

  constructor() {
    effect(() => {
      const lista = this.auth.sesionLista();

      this.auth.usuario()?.id;

      if (lista) {
        this.errorAlerta.set('');
        this.exitoAlerta.set('');

        void this.cargarProximas();
      }
    });
  }

  ngOnInit(): void {
    void this.cargarDatos();

    this.reloj = setInterval(() => {
      this.retirarFuncionesComenzadas();
    }, 1000);
  }

  ngOnDestroy(): void {
    this.destruido = true;

    ++this.consultaProximas;
    ++this.consultaFunciones;

    if (this.reloj !== null) {
      clearInterval(this.reloj);
      this.reloj = null;
    }
  }

  async cargarProximas(): Promise<void> {
    const consulta = ++this.consultaProximas;

    this.cargandoAlertas.set(true);
    this.errorProximas.set('');

    try {
      const peliculas = await this.beneficios.proximamente();

      if (!this.destruido && consulta === this.consultaProximas) {
        this.proximas.set(peliculas);
      }
    } catch (error) {
      if (!this.destruido && consulta === this.consultaProximas) {
        this.errorProximas.set(mensajeBeneficio(error));
      }
    } finally {
      if (!this.destruido && consulta === this.consultaProximas) {
        this.cargandoAlertas.set(false);
      }
    }
  }

  async cambiarAlerta(): Promise<void> {
    const pelicula = this.peliculaSeleccionada();
    const usuario = this.auth.usuario();

    if (
      !pelicula ||
      !this.seleccionEsProxima() ||
      this.procesandoAlerta() ||
      this.cargandoAlertas()
    ) {
      return;
    }

    this.errorAlerta.set('');
    this.exitoAlerta.set('');

    if (!usuario) {
      this.errorAlerta.set(
        'Iniciá sesión desde Mi cuenta para activar el aviso. Usaremos el correo registrado en tu perfil.',
      );

      return;
    }

    const activa = !this.alertaActivada();

    this.procesandoAlerta.set(true);

    try {
      await this.beneficios.rpc('cine_activar_alerta', {
        p_pelicula: pelicula.id,
        p_activa: activa,
      });

      if (this.destruido || this.auth.usuario()?.id !== usuario.id) {
        return;
      }

      this.proximas.update((actuales) =>
        actuales.map((actual) =>
          actual.id === pelicula.id
            ? {
                ...actual,
                alerta: activa,
              }
            : actual,
        ),
      );

      if (this.peliculaSeleccionada()?.id === pelicula.id) {
        this.exitoAlerta.set(
          activa
            ? 'Aviso activado. Te enviaremos un correo cuando haya entradas disponibles para comprar.'
            : 'El aviso por correo fue cancelado.',
        );
      }
    } catch (error) {
      if (
        !this.destruido &&
        this.auth.usuario()?.id === usuario.id &&
        this.peliculaSeleccionada()?.id === pelicula.id
      ) {
        this.errorAlerta.set(mensajeBeneficio(error));
      }
    } finally {
      if (!this.destruido) {
        this.procesandoAlerta.set(false);
      }
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

    this.comentariosAbiertos.set(false);
    const consulta = this.verFunciones(pelicula);
    const numeroConsulta = this.consultaFunciones;

    requestAnimationFrame(() => {
      if (numeroConsulta !== this.consultaFunciones) {
        return;
      }

      const esMovil = window.matchMedia('(max-width: 600px)').matches;

      const destino = esMovil ? `horarios-movil-${pelicula.id}` : 'horarios-pc';

      const reducirMovimiento = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      document.getElementById(destino)?.scrollIntoView({
        behavior: reducirMovimiento ? 'instant' : 'smooth',
        block: 'start',
      });
    });

    await consulta;
  }

  async abrirResenas(pelicula: Pelicula): Promise<void> {
    this.comentariosAbiertos.set(true);
    const carga = this.verFunciones(pelicula);
    const numeroConsulta = this.consultaFunciones;
    requestAnimationFrame(() => {
      if (numeroConsulta !== this.consultaFunciones || this.destruido) return;
      const movil = window.matchMedia('(max-width: 600px)').matches;
      const destino = movil ? `resenas-movil-${pelicula.id}` : 'resenas-pc';
      const elemento = document.getElementById(destino);
      elemento?.focus({ preventScroll: true });
      elemento?.scrollIntoView({
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'instant'
          : 'smooth',
        block: 'start',
      });
    });
    await carga;
  }

  async verFunciones(pelicula: Pelicula): Promise<void> {
    const consulta = ++this.consultaFunciones;

    this.errorAlerta.set('');
    this.exitoAlerta.set('');
    this.peliculaSeleccionada.set(pelicula);
    this.resenas.set(null);
    this.errorResenas.set('');
    this.funciones.set([]);
    this.errorFunciones.set('');
    this.cargandoFunciones.set(true);

    try {
      const [horarios, opiniones] = await Promise.allSettled([
        this.funcionesService.obtenerDisponibles(pelicula.id),
        this.beneficios.rpc<{
          promedio: number;
          cantidad: number;
          resenas: {
            estrellas: number;
            comentario: string;
            fecha: string;
          }[];
        }>('cine_resenas_pelicula', {
          p_pelicula: pelicula.id,
        }),
      ]);

      if (consulta !== this.consultaFunciones) {
        return;
      }

      if (opiniones.status === 'fulfilled') {
        this.resenas.set(opiniones.value);
      } else {
        this.errorResenas.set('No se pudieron cargar las reseñas. Intentá nuevamente.');
      }

      if (horarios.status === 'rejected') {
        throw horarios.reason;
      }

      this.funciones.set(
        horarios.value.filter((funcion) => new Date(funcion.inicio).getTime() > Date.now()),
      );
    } catch (error) {
      if (consulta !== this.consultaFunciones) {
        return;
      }

      console.error('Error al consultar las funciones:', error);

      this.errorFunciones.set('No se pudieron cargar los horarios. Intentá nuevamente.');
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

    this.errorAlerta.set('');
    this.exitoAlerta.set('');
    this.resenas.set(null);
    this.peliculaSeleccionada.set(null);
    this.funciones.set([]);
    this.errorFunciones.set('');
    this.cargandoFunciones.set(false);
  }

  private async cargarDatos(): Promise<void> {
    try {
      const [peliculas, generos] = await Promise.all([
        this.peliculasService.obtenerActivas(),
        this.generosService.obtenerTodos(),
      ]);

      if (this.destruido) {
        return;
      }

      await this.cargarProximas();

      if (this.destruido) {
        return;
      }

      this.peliculas.set(peliculas);
      this.generos.set(generos);

      const seleccion = peliculas.find(
        (pelicula) => pelicula.id === this.ruta.snapshot.queryParamMap.get('pelicula'),
      );

      if (seleccion) {
        await this.alternarFunciones(seleccion);
      }
    } catch (error) {
      console.error('Error al cargar la cartelera:', error);

      this.mensajeError.set('No se pudo cargar la cartelera. Intentá nuevamente.');
    } finally {
      this.cargando.set(false);
    }
  }

  private retirarFuncionesComenzadas(): void {
    const ahora = Date.now();
    const actuales = this.funciones();

    const disponibles = actuales.filter((funcion) => new Date(funcion.inicio).getTime() > ahora);

    if (disponibles.length !== actuales.length) {
      this.funciones.set(disponibles);
    }
  }

  private normalizar(texto: string): string {
    return texto
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }
}
