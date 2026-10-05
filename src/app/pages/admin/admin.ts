import { DatePipe, JsonPipe } from '@angular/common';
import {
    Component,
    effect,
    inject,
    OnDestroy,
    OnInit,
    signal
} from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import * as QRCode from 'qrcode';

import { AuthService } from '../../base/service/auth.service';
import {
    ActividadPanel,
    CodigoPrueba,
    mensajeOperacion,
    PanelService,
    TipoCodigo,
    UsuarioPanel
} from '../../base/service/panel.service';
import {
    DatosPelicula,
    Pelicula,
    PeliculasService
} from '../../base/service/peliculas.service';
import {
    Genero,
    GenerosService
} from '../../base/service/generos.service';

import { SalasAdmin } from './salas-admin/salas-admin';
import { FuncionesAdmin } from './funciones-admin/funciones-admin';
import { CandyAdmin } from './candy-admin/candy-admin';

@Component({
    selector: 'app-admin',
    imports: [
        FormsModule,
        RouterLink,
        DatePipe,
        JsonPipe,
        SalasAdmin,
        FuncionesAdmin,
        CandyAdmin
    ],
    templateUrl: './admin.html',
    styleUrls: [
        './admin.scss',
        './admin-peliculas.scss'
    ]
})
export class Admin implements OnInit, OnDestroy {
    readonly auth = inject(AuthService);

    private readonly panel = inject(PanelService);
    private readonly router = inject(Router);
    private readonly peliculasService = inject(PeliculasService);
    private readonly generosService = inject(GenerosService);

    readonly seccion = signal<
        'usuarios'
        | 'peliculas'
        | 'salas'
        | 'funciones'
        | 'candy'
        | 'codigos'
        | 'actividad'
    >('usuarios');

    readonly usuarios = signal<UsuarioPanel[]>([]);
    readonly total = signal(0);
    readonly pagina = signal(0);
    readonly cargando = signal(false);
    readonly guardando = signal<string | null>(null);
    readonly errorUsuarios = signal('');
    readonly exitoUsuarios = signal('');

    readonly peliculas = signal<Pelicula[]>([]);
    readonly generos = signal<Genero[]>([]);
    readonly cargandoPeliculas = signal(false);
    readonly guardandoPelicula = signal<string | null>(null);
    readonly errorPeliculas = signal('');
    readonly exitoPeliculas = signal('');

    readonly editorAbierto = signal(false);
    readonly guardandoFormulario = signal(false);
    readonly errorFormulario = signal('');
    readonly vistaPoster = signal('');

    readonly creandoCodigo = signal(false);
    readonly codigoCreado = signal<CodigoPrueba | null>(null);
    readonly imagenQr = signal('');
    readonly errorCodigo = signal('');

    readonly cargandoActividad = signal(false);
    readonly actividad = signal<ActividadPanel[]>([]);
    readonly errorActividad = signal('');

    busqueda = '';
    tipoCodigo: TipoCodigo = 'entrada';
    descripcion = '';

    borrador: DatosPelicula = this.nuevoBorrador();

    private busquedaAplicada = '';
    private archivoPoster: File | null = null;
    private urlTemporalPoster: string | null = null;

    constructor() {
        effect(() => {
            if (this.auth.sesionLista() && !this.auth.usuario()) {
                void this.router.navigateByUrl('/');
            }
        });
    }

    ngOnInit(): void {
        void this.cargarUsuarios(0);
    }

    ngOnDestroy(): void {
        this.liberarVistaPoster();
    }

    async buscar(): Promise<void> {
        if (this.cargando() || this.guardando() !== null) {
            return;
        }

        this.busquedaAplicada = this.busqueda.trim();
        this.exitoUsuarios.set('');

        await this.cargarUsuarios(0);
    }

    async cargarUsuarios(pagina: number): Promise<void> {
        if (this.cargando()) {
            return;
        }

        this.cargando.set(true);
        this.errorUsuarios.set('');

        try {
            const resultado = await this.panel.listarUsuarios(
                this.busquedaAplicada,
                pagina
            );

            this.usuarios.set(resultado.usuarios);
            this.total.set(resultado.total);
            this.pagina.set(pagina);
        } catch (error) {
            this.errorUsuarios.set(this.detallarError(error));
        } finally {
            this.cargando.set(false);
        }
    }

    async cambiarRol(usuario: UsuarioPanel): Promise<void> {
        if (this.usuarioProtegidoOcupado(usuario)) {
            return;
        }

        const rol = usuario.rol === 'cliente' ? 'empleado' : 'cliente';
        const nombre = this.nombreCompleto(usuario);

        if (!window.confirm(`¿Querés cambiar a ${nombre} al rol ${rol}?`)) {
            return;
        }

        this.guardando.set(usuario.id);
        this.exitoUsuarios.set('');
        this.errorUsuarios.set('');

        try {
            await this.panel.cambiarRol(usuario.id, rol);

            this.exitoUsuarios.set(
                `El rol de ${nombre} ahora es ${rol}.`
            );

            await this.cargarUsuarios(this.pagina());
        } catch (error) {
            this.errorUsuarios.set(this.detallarError(error));
        } finally {
            this.guardando.set(null);
        }
    }

    async cambiarEstado(usuario: UsuarioPanel): Promise<void> {
        if (this.usuarioProtegidoOcupado(usuario)) {
            return;
        }

        const nombre = this.nombreCompleto(usuario);
        const nuevoEstado = !usuario.activo;
        const accion = nuevoEstado ? 'reactivar' : 'desactivar';

        if (!window.confirm(`¿Querés ${accion} la cuenta de ${nombre}?`)) {
            return;
        }

        this.guardando.set(usuario.id);
        this.errorUsuarios.set('');
        this.exitoUsuarios.set('');

        try {
            await this.panel.cambiarEstado(usuario.id, nuevoEstado);

            this.exitoUsuarios.set(
                `La cuenta de ${nombre} quedó ${
                    nuevoEstado ? 'activa' : 'desactivada'
                }.`
            );

            await this.cargarUsuarios(this.pagina());
        } catch (error) {
            console.error(
                'Error al cambiar el estado de la cuenta:',
                error
            );

            this.errorUsuarios.set(this.detallarError(error));
        } finally {
            this.guardando.set(null);
        }
    }

    async eliminarUsuario(usuario: UsuarioPanel): Promise<void> {
        if (this.usuarioProtegidoOcupado(usuario)) {
            return;
        }

        const nombre = this.nombreCompleto(usuario);

        const confirmacion = window.prompt(
            `Vas a eliminar definitivamente la cuenta de ${nombre}.\n\n` +
            'Esta acción no se puede deshacer.\n\n' +
            'Escribí ELIMINAR para confirmar:'
        );

        if (confirmacion !== 'ELIMINAR') {
            return;
        }

        this.guardando.set(usuario.id);
        this.errorUsuarios.set('');
        this.exitoUsuarios.set('');

        try {
            await this.panel.eliminarUsuario(usuario.id);

            const paginaActual = this.pagina();

            const paginaDestino =
                this.usuarios().length === 1 && paginaActual > 0
                    ? paginaActual - 1
                    : paginaActual;

            this.exitoUsuarios.set(
                `La cuenta de ${nombre} fue eliminada definitivamente.`
            );

            await this.cargarUsuarios(paginaDestino);
        } catch (error) {
            console.error('Error al eliminar la cuenta:', error);

            const mensaje = this.detallarError(error);

            await this.cargarUsuarios(this.pagina());

            this.errorUsuarios.set(mensaje);
        } finally {
            this.guardando.set(null);
        }
    }

    async crearCodigo(): Promise<void> {
        if (this.creandoCodigo() || !this.descripcion.trim()) {
            return;
        }

        this.creandoCodigo.set(true);
        this.errorCodigo.set('');
        this.codigoCreado.set(null);
        this.imagenQr.set('');

        try {
            const codigo = await this.panel.emitirCodigo(
                this.tipoCodigo,
                this.descripcion
            );

            this.codigoCreado.set(codigo);

            try {
                this.imagenQr.set(
                    await QRCode.toDataURL(codigo.codigo, {
                        width: 260,
                        margin: 2,
                        errorCorrectionLevel: 'M'
                    })
                );
            } catch {
                this.errorCodigo.set(
                    'El código se creó, pero no se pudo dibujar el QR. Usá el código escrito.'
                );
            }
        } catch (error) {
            this.errorCodigo.set(this.detallarError(error));
        } finally {
            this.creandoCodigo.set(false);
        }
    }

    async abrirActividad(): Promise<void> {
        this.seccion.set('actividad');

        await this.cargarActividad();
    }

    async cargarActividad(): Promise<void> {
        if (this.cargandoActividad()) {
            return;
        }

        this.cargandoActividad.set(true);
        this.errorActividad.set('');

        try {
            this.actividad.set(await this.panel.listarActividad());
        } catch (error) {
            this.errorActividad.set(this.detallarError(error));
        } finally {
            this.cargandoActividad.set(false);
        }
    }

    async abrirPeliculas(): Promise<void> {
        this.seccion.set('peliculas');

        if (!this.peliculasOcupadas()) {
            await this.cargarPeliculas();
        }
    }

    async cargarPeliculas(): Promise<void> {
        if (this.cargandoPeliculas()) {
            return;
        }

        this.cargandoPeliculas.set(true);
        this.errorPeliculas.set('');

        try {
            const [peliculas, generos] = await Promise.all([
                this.peliculasService.obtenerTodas(),
                this.generosService.obtenerTodos()
            ]);

            this.peliculas.set(peliculas);
            this.generos.set(generos);
        } catch (error) {
            console.error('Error al cargar las películas:', error);

            this.errorPeliculas.set(this.detallarError(error));
        } finally {
            this.cargandoPeliculas.set(false);
        }
    }

    peliculasOcupadas(): boolean {
        return this.cargandoPeliculas()
            || this.guardandoPelicula() !== null
            || this.guardandoFormulario();
    }

    nuevaPelicula(): void {
        if (this.peliculasOcupadas() || this.editorAbierto()) {
            return;
        }

        this.borrador = this.nuevoBorrador();
        this.prepararEditor();
    }

    editarPelicula(pelicula: Pelicula): void {
        if (this.peliculasOcupadas() || this.editorAbierto()) {
            return;
        }

        this.borrador = {
            id: pelicula.id,
            nombre: pelicula.nombre,
            sinopsis: pelicula.sinopsis,
            duracion_minutos: pelicula.duracion_minutos,
            imagen_url: pelicula.imagen_url,
            edad_minima: pelicula.edad_minima,
            fecha_estreno: pelicula.fecha_estreno,
            activa: pelicula.activa,
            generos: pelicula.generos.map((genero) => genero.id)
        };

        this.prepararEditor();
    }

    cancelarEdicion(): void {
        if (this.guardandoFormulario()) {
            return;
        }

        this.editorAbierto.set(false);
        this.archivoPoster = null;
        this.liberarVistaPoster();
        this.vistaPoster.set('');
        this.errorFormulario.set('');
    }

    seleccionarGenero(generoId: string): void {
        if (this.guardandoFormulario()) {
            return;
        }

        const seleccionados = this.borrador.generos;

        this.borrador.generos = seleccionados.includes(generoId)
            ? seleccionados.filter((id) => id !== generoId)
            : [...seleccionados, generoId];
    }

    seleccionarPoster(evento: Event): void {
        if (this.guardandoFormulario()) {
            return;
        }

        const entrada = evento.target as HTMLInputElement;
        const archivo = entrada.files?.[0];

        if (!archivo) {
            return;
        }

        this.errorFormulario.set('');

        const tipos = [
            'image/jpeg',
            'image/png',
            'image/webp'
        ];

        if (
            !tipos.includes(archivo.type)
            || archivo.size === 0
            || archivo.size > 5 * 1024 * 1024
        ) {
            entrada.value = '';

            this.errorFormulario.set(
                'Elegí una imagen JPG, PNG o WEBP de hasta 5 MB.'
            );

            return;
        }

        this.liberarVistaPoster();
        this.archivoPoster = archivo;
        this.urlTemporalPoster = URL.createObjectURL(archivo);
        this.vistaPoster.set(this.urlTemporalPoster);
    }

    async guardarPelicula(formulario: NgForm): Promise<void> {
        if (this.peliculasOcupadas()) {
            return;
        }

        formulario.form.markAllAsTouched();
        this.errorFormulario.set('');

        if (
            formulario.invalid
            || !this.borrador.nombre.trim()
            || !this.borrador.sinopsis.trim()
            || !Number.isInteger(this.borrador.duracion_minutos)
            || !Number.isInteger(this.borrador.edad_minima)
            || this.borrador.generos.length === 0
        ) {
            this.errorFormulario.set(
                'Completá los campos obligatorios, usá números enteros y seleccioná al menos un género.'
            );

            return;
        }

        this.guardandoFormulario.set(true);
        this.errorPeliculas.set('');
        this.exitoPeliculas.set('');

        const esNueva = this.borrador.id === null;
        let guardada = false;

        try {
            if (this.archivoPoster) {
                const url = await this.peliculasService.subirPoster(
                    this.archivoPoster
                );

                this.borrador.imagen_url = url;
                this.archivoPoster = null;
                this.liberarVistaPoster();
                this.vistaPoster.set(url);
            }

            await this.peliculasService.guardar({
                ...this.borrador,
                fecha_estreno: this.borrador.fecha_estreno || null
            });

            guardada = true;

            this.exitoPeliculas.set(
                esNueva
                    ? 'La película fue creada correctamente.'
                    : 'Los cambios de la película fueron guardados.'
            );
        } catch (error) {
            console.error('Error al guardar la película:', error);

            this.errorFormulario.set(this.detallarError(error));
        } finally {
            this.guardandoFormulario.set(false);
        }

        if (guardada) {
            this.cancelarEdicion();

            await this.cargarPeliculas();
        }
    }

    async cambiarEstadoPelicula(pelicula: Pelicula): Promise<void> {
        if (this.peliculasOcupadas() || this.editorAbierto()) {
            return;
        }

        const nuevaActiva = !pelicula.activa;
        const accion = nuevaActiva ? 'activar' : 'desactivar';

        if (!window.confirm(`¿Querés ${accion} "${pelicula.nombre}"?`)) {
            return;
        }

        this.guardandoPelicula.set(pelicula.id);
        this.errorPeliculas.set('');
        this.exitoPeliculas.set('');

        try {
            await this.peliculasService.cambiarEstado(
                pelicula.id,
                nuevaActiva
            );

            this.peliculas.update((peliculas) =>
                peliculas.map((actual) =>
                    actual.id === pelicula.id
                        ? { ...actual, activa: nuevaActiva }
                        : actual
                )
            );

            this.exitoPeliculas.set(
                nuevaActiva
                    ? `"${pelicula.nombre}" ahora aparece en la cartelera.`
                    : `"${pelicula.nombre}" dejó de aparecer en la cartelera.`
            );
        } catch (error) {
            console.error(
                'Error al cambiar el estado de la película:',
                error
            );

            this.errorPeliculas.set(this.detallarError(error));
        } finally {
            this.guardandoPelicula.set(null);
        }
    }

    async eliminarPelicula(pelicula: Pelicula): Promise<void> {
        if (this.peliculasOcupadas() || this.editorAbierto()) {
            return;
        }

        const confirmacion = window.prompt(
            `Vas a eliminar definitivamente "${pelicula.nombre}".\n\n` +
            'Esta acción no se puede deshacer.\n\n' +
            'Escribí ELIMINAR para confirmar:'
        );

        if (confirmacion !== 'ELIMINAR') {
            return;
        }

        this.guardandoPelicula.set(pelicula.id);
        this.errorPeliculas.set('');
        this.exitoPeliculas.set('');

        try {
            await this.peliculasService.eliminar(pelicula.id);

            this.peliculas.update((peliculas) =>
                peliculas.filter((actual) => actual.id !== pelicula.id)
            );

            this.exitoPeliculas.set(
                `"${pelicula.nombre}" fue eliminada correctamente.`
            );
        } catch (error) {
            console.error('Error al eliminar la película:', error);

            this.errorPeliculas.set(this.detallarError(error));
        } finally {
            this.guardandoPelicula.set(null);
        }
    }

    private nuevoBorrador(): DatosPelicula {
        return {
            id: null,
            nombre: '',
            sinopsis: '',
            duracion_minutos: 90,
            imagen_url: null,
            edad_minima: 0,
            fecha_estreno: null,
            activa: false,
            generos: []
        };
    }

    private prepararEditor(): void {
        this.archivoPoster = null;
        this.liberarVistaPoster();
        this.vistaPoster.set(this.borrador.imagen_url ?? '');
        this.errorFormulario.set('');
        this.errorPeliculas.set('');
        this.exitoPeliculas.set('');
        this.editorAbierto.set(true);
    }

    private liberarVistaPoster(): void {
        if (this.urlTemporalPoster) {
            URL.revokeObjectURL(this.urlTemporalPoster);
            this.urlTemporalPoster = null;
        }
    }

    private usuarioProtegidoOcupado(usuario: UsuarioPanel): boolean {
        return this.guardando() !== null
            || this.cargando()
            || usuario.rol === 'admin'
            || usuario.id === this.auth.usuario()?.id;
    }

    private nombreCompleto(usuario: UsuarioPanel): string {
        return [usuario.nombre, usuario.apellido]
            .filter(Boolean)
            .join(' ') || 'este usuario';
    }

    private detallarError(error: unknown): string {
        if (error instanceof Error) {
            return error.message;
        }

        if (typeof error === 'object' && error !== null) {
            const detalle = error as {
                code?: string;
                message?: string;
                details?: string;
                hint?: string;
            };

            const mensaje = [
                detalle.code ? `Código: ${detalle.code}` : '',
                detalle.message,
                detalle.details,
                detalle.hint
            ]
                .filter(Boolean)
                .join(' — ');

            if (mensaje) {
                return mensaje;
            }
        }

        return mensajeOperacion(error);
    }
}