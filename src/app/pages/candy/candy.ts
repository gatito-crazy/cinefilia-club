import { DecimalPipe } from '@angular/common';
import {
    Component,
    computed,
    inject,
    OnInit,
    signal
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
    CandyService,
    ComboCandy,
    ProductoCandy
} from '../../base/service/candy.service';
import {
    ArticuloCompra,
    Compra,
    ComprasService
} from '../../base/service/compras.service';
import { SupabaseService } from '../../base/service/supabase.service';
import {
    ComprobantePdfService
} from '../../base/service/comprobante-pdf.service';

interface ArticuloCatalogo {
    clave: string;
    tipo: 'producto' | 'combo';
    id: string;
    nombre: string;
    descripcion: string;
    precio: number;
    imagen_url: string | null;
}

interface SolicitudCandy {
    clave: string;
    usuarioId: string | null;
    articulos: ArticuloCompra[];
    total: number;
}

@Component({
    selector: 'app-candy',
    imports: [DecimalPipe, FormsModule, RouterLink],
    templateUrl: './candy.html',
    styleUrl: './candy.scss'
})
export class Candy implements OnInit {
    private readonly candyService = inject(CandyService);
    private readonly comprasService = inject(ComprasService);
    private readonly supabase = inject(SupabaseService);
    private readonly comprobantePdf = inject(ComprobantePdfService);

    private almacenamiento = '';

    readonly cargando = signal(true);
    readonly procesando = signal(false);
    readonly error = signal('');
    readonly aviso = signal('');

    readonly catalogo = signal<ArticuloCatalogo[]>([]);
    readonly cantidades = signal<Record<string, number>>({});
    readonly busqueda = signal('');

    readonly pendiente = signal<SolicitudCandy | null>(null);
    readonly compra = signal<Compra | null>(null);

    readonly imagenQr = signal('');
    readonly errorQr = signal('');
    readonly preparandoQr = signal(false);
    readonly imagenesFallidas = signal<string[]>([]);
    readonly descargandoPdf = signal(false);
    readonly errorPdf = signal('');

    readonly articulosFiltrados = computed(() => {
        const texto = this.normalizar(this.busqueda());

        return this.catalogo().filter((articulo) =>
            this.normalizar(
                `${articulo.nombre} ${articulo.descripcion}`
            ).includes(texto)
        );
    });

    readonly seleccion = computed(() =>
        this.catalogo()
            .map((articulo) => ({
                ...articulo,
                cantidad: this.cantidades()[articulo.clave] ?? 0
            }))
            .filter((articulo) => articulo.cantidad > 0)
    );

    readonly total = computed(() =>
        this.seleccion().reduce(
            (acumulado, articulo) =>
                acumulado +
                Math.round(articulo.precio * 100) * articulo.cantidad,
            0
        ) / 100
    );

    readonly edicionBloqueada = computed(() =>
        this.cargando() ||
        this.procesando() ||
        this.pendiente() !== null ||
        this.compra() !== null
    );

    async ngOnInit(): Promise<void> {
        await this.cargar();
    }

    async cargar(): Promise<void> {
        if (this.procesando()) {
            return;
        }

        this.cargando.set(true);
        this.error.set('');

        try {
            const usuarioId = await this.obtenerUsuarioId();

            this.almacenamiento =
                `cinefilia-candy-pendiente-${usuarioId ?? 'invitado'}`;

            this.recuperarSolicitud();

            const [categorias, productos, combos] =
                await Promise.all([
                    this.candyService.obtenerCategorias(),
                    this.candyService.obtenerProductos(),
                    this.candyService.obtenerCombos()
                ]);

            const categoriasActivas = new Set(
                categorias
                    .filter((categoria) => categoria.activa)
                    .map((categoria) => categoria.id)
            );

            const productosActivos = productos.filter((producto) =>
                producto.activo &&
                categoriasActivas.has(producto.categoria_id)
            );

            const idsProductos = new Set(
                productosActivos.map((producto) => producto.id)
            );

            const combosActivos = combos.filter((combo) =>
                combo.activo &&
                combo.componentes.length > 0 &&
                combo.componentes.every((componente) =>
                    idsProductos.has(componente.producto_id) &&
                    componente.cantidad > 0
                )
            );

            this.catalogo.set([
                ...productosActivos.map((producto) =>
                    this.convertirArticulo('producto', producto)
                ),
                ...combosActivos.map((combo) =>
                    this.convertirArticulo('combo', combo)
                )
            ]);

            if (this.pendiente()) {
                this.aviso.set(
                    'Hay una compra pendiente de comprobar. Podés consultarla o reintentar la misma solicitud.'
                );
            }
        } catch (error) {
            this.error.set(this.obtenerMensaje(error));
        } finally {
            this.cargando.set(false);
        }
    }

    cambiarCantidad(clave: string, cantidad: number): void {
        if (
            this.edicionBloqueada() ||
            !Number.isInteger(cantidad) ||
            cantidad < 0 ||
            cantidad > 20
        ) {
            return;
        }

        this.cantidades.update((actuales) => ({
            ...actuales,
            [clave]: cantidad
        }));
    }

    marcarImagenFallida(clave: string): void {
        this.imagenesFallidas.update((actuales) =>
            actuales.includes(clave)
                ? actuales
                : [...actuales, clave]
        );
    }

    async confirmar(): Promise<void> {
        if (
            this.cargando() ||
            this.procesando() ||
            this.compra()
        ) {
            return;
        }

        this.procesando.set(true);
        this.error.set('');
        this.aviso.set('');

        let solicitud = this.pendiente();

        try {
            const usuarioId = await this.obtenerUsuarioId();

            if (solicitud && solicitud.usuarioId !== usuarioId) {
                throw new Error(
                    'La sesión cambió. Volvé a la cuenta con la que comenzaste esta compra.'
                );
            }

            if (!solicitud) {
                if (this.total() <= 0) {
                    throw new Error(
                        'Elegí al menos un producto o combo.'
                    );
                }

                if (this.seleccion().length > 100) {
                    throw new Error(
                        'Podés comprar hasta 100 artículos diferentes.'
                    );
                }

                solicitud = {
                    clave: crypto.randomUUID(),
                    usuarioId,
                    articulos: this.seleccion().map((articulo) => ({
                        tipo: articulo.tipo,
                        id: articulo.id,
                        cantidad: articulo.cantidad
                    })),
                    total: this.total()
                };

                this.almacenamiento =
                    `cinefilia-candy-pendiente-${usuarioId ?? 'invitado'}`;

                sessionStorage.setItem(
                    this.almacenamiento,
                    JSON.stringify(solicitud)
                );

                this.pendiente.set(solicitud);
            }

            await this.comprasService.guardarAccesoInvitado(
                solicitud.clave
            );

            const compra = await this.comprasService.confirmarSoloCandy(
                solicitud.clave,
                solicitud.articulos,
                solicitud.total
            );

            await this.aplicarCompra(compra);
        } catch (error) {
            this.error.set(this.obtenerMensaje(error));

            if (this.esRechazoConfirmado(error)) {
                this.descartarSolicitudRechazada();

                this.aviso.set(
                    'La base de datos rechazó la operación. Revisá el catálogo antes de confirmar nuevamente.'
                );
            } else if (this.pendiente()) {
                this.aviso.set(
                    'Todavía no pudimos confirmar el resultado. Comprobá la compra o reintentá la misma solicitud.'
                );
            }
        } finally {
            this.procesando.set(false);
        }
    }

    async comprobarCompra(): Promise<void> {
        const solicitud = this.pendiente();

        if (!solicitud || this.procesando()) {
            return;
        }

        this.procesando.set(true);
        this.error.set('');
        this.aviso.set('');

        try {
            const usuarioId = await this.obtenerUsuarioId();

            if (usuarioId !== solicitud.usuarioId) {
                throw new Error(
                    'Volvé a la cuenta con la que comenzaste esta compra.'
                );
            }

            const compra = await this.comprasService.obtener(
                solicitud.clave
            );

            if (compra) {
                if (!compra.solo_candy) {
                    throw new Error(
                        'El comprobante recibido no corresponde a una compra de Candy.'
                    );
                }

                await this.aplicarCompra(compra);
            } else {
                this.aviso.set(
                    'Todavía no aparece una compra confirmada. Podés reintentar la misma solicitud.'
                );
            }
        } catch (error) {
            this.error.set(this.obtenerMensaje(error));
        } finally {
            this.procesando.set(false);
        }
    }

        async prepararQr(): Promise<void> {
        const codigo = this.compra()?.comprobantes.find(
            (comprobante) => comprobante.tipo === 'candy'
        )?.codigo;

        if (this.preparandoQr()) {
            return;
        }

        if (!codigo) {
            this.errorQr.set(
                'La compra está confirmada, pero no se recibió el código para retirar el Candy.'
            );

            return;
        }

        this.preparandoQr.set(true);
        this.errorQr.set('');

        try {
            const modulo = await import('qrcode');
            const QRCode = modulo.default ?? modulo;

            const imagen = await QRCode.toDataURL(
                codigo,
                {
                    width: 280,
                    margin: 2,
                    errorCorrectionLevel: 'M'
                }
            );

            this.imagenQr.set(imagen);
        } catch (error) {
            console.error(
                'No se pudo generar el QR de Candy:',
                error
            );

            this.errorQr.set(
                'La compra está confirmada, pero no pudimos dibujar el QR. Podés volver a intentarlo.'
            );
        } finally {
            this.preparandoQr.set(false);
        }
    }

    nuevaCompra(): void {
        if (this.procesando() || this.pendiente() || this.descargandoPdf()) {
            return;
        }

        this.compra.set(null);
        this.imagenQr.set('');
        this.errorQr.set('');
        this.cantidades.set({});
        this.error.set('');
        this.aviso.set('');
        this.errorPdf.set('');

        void this.cargar();
    }

    private async aplicarCompra(compra: Compra): Promise<void> {
        this.compra.set(compra);
        this.pendiente.set(null);
        this.aviso.set('');

        try {
            sessionStorage.removeItem(this.almacenamiento);
        } catch {
            this.aviso.set(
                'La compra está confirmada. No pudimos limpiar el intento guardado en este navegador.'
            );
        }

        await this.prepararQr();
    }

    private recuperarSolicitud(): void {
        const texto = sessionStorage.getItem(this.almacenamiento);

        if (!texto) {
            return;
        }

        const datos: SolicitudCandy = JSON.parse(texto);

        if (
            !datos ||
            typeof datos.clave !== 'string' ||
            !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(datos.clave) ||
            (
                datos.usuarioId !== null &&
                typeof datos.usuarioId !== 'string'
            ) ||
            !Number.isFinite(datos.total) ||
            datos.total <= 0 ||
            !Array.isArray(datos.articulos) ||
            datos.articulos.length === 0 ||
            datos.articulos.length > 100 ||
            datos.articulos.some((articulo) =>
                !articulo ||
                !['producto', 'combo'].includes(articulo.tipo) ||
                typeof articulo.id !== 'string' ||
                !Number.isInteger(articulo.cantidad) ||
                articulo.cantidad < 1 ||
                articulo.cantidad > 20
            )
        ) {
            throw new Error(
                'La solicitud guardada no es válida. No se enviará una compra nueva automáticamente.'
            );
        }

        this.pendiente.set(datos);

        this.cantidades.set(
            Object.fromEntries(
                datos.articulos.map((articulo) => [
                    `${articulo.tipo}-${articulo.id}`,
                    articulo.cantidad
                ])
            )
        );
    }

    async descargarPdf(): Promise<void> {
        const compra = this.compra();

        if (!compra || this.descargandoPdf()) {
            return;
        }

        this.descargandoPdf.set(true);
        this.errorPdf.set('');

        try {
            await this.comprobantePdf.descargar(compra);
        } catch (error) {
            console.error(
                'No se pudo descargar el comprobante de Candy:',
                error
            );

            this.errorPdf.set(
                'No pudimos generar el PDF. Podés volver a intentarlo.'
            );
        } finally {
            this.descargandoPdf.set(false);
        }
    }

    private descartarSolicitudRechazada(): void {
        try {
            sessionStorage.removeItem(this.almacenamiento);
            this.pendiente.set(null);
        } catch {
            this.aviso.set(
                'No pudimos limpiar la solicitud rechazada.'
            );
        }
    }

    private esRechazoConfirmado(error: unknown): boolean {
        return typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            (
                error.code === 'P0001' ||
                error.code === '23514' ||
                error.code === '22023' ||
                error.code === '22P02'
            );
    }

    private async obtenerUsuarioId(): Promise<string | null> {
        const { data, error } = await this.supabase.cliente
            .auth.getSession();

        if (error) {
            throw error;
        }

        return data.session?.user.id ?? null;
    }

    private convertirArticulo(
        tipo: 'producto' | 'combo',
        articulo: ProductoCandy | ComboCandy
    ): ArticuloCatalogo {
        return {
            clave: `${tipo}-${articulo.id}`,
            tipo,
            id: articulo.id,
            nombre: articulo.nombre,
            descripcion: articulo.descripcion,
            precio: Number(articulo.precio),
            imagen_url: articulo.imagen_url
        };
    }

    private normalizar(texto: string): string {
        return texto.trim()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase();
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

        return 'No pudimos completar la operación. Intentá nuevamente.';
    }
}