import { DecimalPipe } from '@angular/common';
import {
    Component,
    computed,
    inject,
    OnDestroy,
    OnInit,
    signal
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
    CandyService,
    CategoriaCandy,
    ComboCandy,
    ProductoCandy
} from '../../base/service/candy.service';
import {
    Reserva,
    ReservasService
} from '../../base/service/reservas.service';

interface SeleccionCandy {
    productos: Record<string, number>;
    combos: Record<string, number>;
}

@Component({
    selector: 'app-candy-compra',
    imports: [DecimalPipe, FormsModule, RouterLink],
    templateUrl: './candy-compra.html',
    styleUrl: './candy-compra.scss'
})
export class CandyCompra implements OnInit, OnDestroy {
    private readonly ruta = inject(ActivatedRoute);
    private readonly candyService = inject(CandyService);
    private readonly reservasService = inject(ReservasService);

    private reloj: ReturnType<typeof setInterval> | null = null;
    private destruido = false;
    private comprobando = false;
    private claveReserva = '';
    private claveCarrito = '';
    private diferenciaServidor = 0;
    private ultimoControl = 0;

    readonly funcionId = this.ruta.snapshot.paramMap.get('id') ?? '';

    readonly cargando = signal(true);
    readonly error = signal('');
    readonly errorConexion = signal('');
    readonly reserva = signal<Reserva | null>(null);
    readonly ahora = signal(Date.now());

    readonly categorias = signal<CategoriaCandy[]>([]);
    readonly productos = signal<ProductoCandy[]>([]);
    readonly combos = signal<ComboCandy[]>([]);

    readonly cantidadesProductos = signal<Record<string, number>>({});
    readonly cantidadesCombos = signal<Record<string, number>>({});
    readonly mostrarResumen = signal(false);

    readonly busqueda = signal('');
    readonly categoriaSeleccionada = signal('');
    readonly vista = signal<'todos' | 'productos' | 'combos'>('todos');

    readonly reservaVigente = computed(() => {
        const reserva = this.reserva();

        return !!reserva &&
            reserva.estado === 'reservada' &&
            new Date(reserva.vence_en).getTime() > this.ahora();
    });

    readonly tiempoRestante = computed(() => {
        const vencimiento = this.reserva()?.vence_en;

        const segundos = vencimiento
            ? Math.max(
                0,
                Math.ceil(
                    (new Date(vencimiento).getTime() - this.ahora()) / 1000
                )
            )
            : 0;

        return `${String(Math.floor(segundos / 60)).padStart(2, '0')}:` +
            String(segundos % 60).padStart(2, '0');
    });

    readonly productosFiltrados = computed(() => {
        const texto = this.normalizar(this.busqueda());
        const categoria = this.categoriaSeleccionada();

        return this.productos().filter((producto) =>
            this.normalizar(producto.nombre).includes(texto) &&
            (!categoria || producto.categoria_id === categoria)
        );
    });

    readonly combosFiltrados = computed(() => {
        const texto = this.normalizar(this.busqueda());
        const categoria = this.categoriaSeleccionada();

        return this.combos().filter((combo) =>
            this.normalizar(combo.nombre).includes(texto) &&
            (
                !categoria ||
                combo.componentes.some((componente) =>
                    this.productos().some((producto) =>
                        producto.id === componente.producto_id &&
                        producto.categoria_id === categoria
                    )
                )
            )
        );
    });

    readonly detalleCandy = computed(() => [
        ...this.productos()
            .filter((producto) =>
                (this.cantidadesProductos()[producto.id] ?? 0) > 0
            )
            .map((producto) => ({
                clave: `producto-${producto.id}`,
                nombre: producto.nombre,
                cantidad: this.cantidadesProductos()[producto.id],
                precio: producto.precio
            })),
        ...this.combos()
            .filter((combo) =>
                (this.cantidadesCombos()[combo.id] ?? 0) > 0
            )
            .map((combo) => ({
                clave: `combo-${combo.id}`,
                nombre: combo.nombre,
                cantidad: this.cantidadesCombos()[combo.id],
                precio: combo.precio
            }))
    ]);

    readonly totalCandy = computed(() =>
        this.detalleCandy().reduce(
            (total, item) =>
                total + Math.round(item.precio * 100) * item.cantidad,
            0
        ) / 100
    );

    readonly totalCompra = computed(() =>
        Math.round(
            ((this.reserva()?.total ?? 0) + this.totalCandy()) * 100
        ) / 100
    );

    private readonly alVolver = (): void => {
        if (document.visibilityState === 'visible') {
            this.actualizarReloj();
            void this.comprobarReserva();
        }
    };

    ngOnInit(): void {
        void this.cargar();

        document.addEventListener('visibilitychange', this.alVolver);

        this.reloj = setInterval(() => {
            this.actualizarReloj();

            if (Date.now() - this.ultimoControl >= 5000) {
                this.ultimoControl = Date.now();
                void this.comprobarReserva();
            }
        }, 1000);
    }

    ngOnDestroy(): void {
        this.destruido = true;

        document.removeEventListener('visibilitychange', this.alVolver);

        if (this.reloj !== null) {
            clearInterval(this.reloj);
        }
    }

    async cargar(): Promise<void> {
        if (this.comprobando) {
            return;
        }

        this.cargando.set(true);
        this.error.set('');

        try {
            if (!this.funcionId) {
                throw new Error('No se indicó una función.');
            }

            const almacenamiento = await this.reservasService
                .obtenerClaveAlmacenamiento(this.funcionId);

            const solicitud = this.reservasService
                .leerSolicitud(almacenamiento);

            if (!solicitud) {
                throw new Error(
                    'Primero elegí tus butacas y creá una reserva.'
                );
            }

            this.claveReserva = solicitud.clave;
            this.claveCarrito = `${almacenamiento}-candy-${solicitud.clave}`;

            const [reserva, categorias, productos, combos] =
                await Promise.all([
                    this.reservasService.obtenerReserva(
                        this.claveReserva
                    ),
                    this.candyService.obtenerCategorias(),
                    this.candyService.obtenerProductos(),
                    this.candyService.obtenerCombos()
                ]);

            if (this.destruido) {
                return;
            }

            if (!reserva || reserva.funcion_id !== this.funcionId) {
                throw new Error('La reserva ya no está disponible.');
            }

            const categoriasActivas = categorias.filter(
                (categoria) => categoria.activa
            );

            const idsCategorias = new Set(
                categoriasActivas.map((categoria) => categoria.id)
            );

            const productosActivos = productos.filter((producto) =>
                producto.activo &&
                idsCategorias.has(producto.categoria_id)
            );

            const idsProductos = new Set(
                productosActivos.map((producto) => producto.id)
            );

            const combosActivos = combos.filter((combo) =>
                combo.activo &&
                combo.componentes.length > 0 &&
                combo.componentes.every((componente) =>
                    idsProductos.has(componente.producto_id)
                )
            );

            this.categorias.set(categoriasActivas);
            this.productos.set(productosActivos);
            this.combos.set(combosActivos);
            this.aplicarReserva(reserva);
            this.recuperarCarrito();
            this.errorConexion.set('');
        } catch (error) {
            if (!this.destruido) {
                this.error.set(this.obtenerMensaje(error));
            }
        } finally {
            if (!this.destruido) {
                this.cargando.set(false);
            }
        }
    }

    async comprobarReserva(): Promise<void> {
        if (
            this.destruido ||
            this.cargando() ||
            this.comprobando ||
            !this.claveReserva
        ) {
            return;
        }

        this.comprobando = true;

        try {
            const reserva = await this.reservasService
                .obtenerReserva(this.claveReserva);

            if (!this.destruido) {
                this.aplicarReserva(reserva);
                this.errorConexion.set('');
            }
        } catch {
            if (!this.destruido) {
                this.errorConexion.set(
                    'No pudimos comprobar la reserva. Revisá la conexión.'
                );
            }
        } finally {
            this.comprobando = false;
        }
    }

    cambiarCantidad(
        tipo: 'producto' | 'combo',
        id: string,
        valor: number
    ): void {
        if (
            !this.reservaVigente() ||
            !Number.isInteger(valor) ||
            valor < 0 ||
            valor > 20
        ) {
            return;
        }

        const cantidades = tipo === 'producto'
            ? this.cantidadesProductos
            : this.cantidadesCombos;

        cantidades.update((actuales) => ({
            ...actuales,
            [id]: valor
        }));

        this.guardarCarrito();
    }

    async revisarCompra(): Promise<void> {
        await this.comprobarReserva();

        if (this.reservaVigente() && !this.errorConexion()) {
            this.guardarCarrito();

            if (!this.errorConexion()) {
                this.mostrarResumen.set(true);
            }
        }
    }

    nombreProducto(id: string): string {
        return this.productos().find(
            (producto) => producto.id === id
        )?.nombre ?? 'Producto';
    }

    private aplicarReserva(reserva: Reserva | null): void {
        this.reserva.set(reserva);

        if (reserva) {
            const servidor = new Date(reserva.servidor_ahora).getTime();

            if (Number.isFinite(servidor)) {
                this.diferenciaServidor = servidor - Date.now();
            }
        }

        this.actualizarReloj();
    }

    private actualizarReloj(): void {
        this.ahora.set(Date.now() + this.diferenciaServidor);
    }

    private guardarCarrito(): void {
        try {
            sessionStorage.setItem(
                this.claveCarrito,
                JSON.stringify({
                    productos: this.cantidadesProductos(),
                    combos: this.cantidadesCombos(),
                    total: this.totalCompra()
                })
            );
        } catch {
            this.errorConexion.set(
                'No pudimos guardar el Candy en este navegador.'
            );
        }
    }

    private recuperarCarrito(): void {
        try {
            const texto = sessionStorage.getItem(this.claveCarrito);

            if (!texto) {
                return;
            }

            const datos = JSON.parse(texto) as SeleccionCandy;

            const recuperar = (
                cantidades: Record<string, number> | undefined,
                ids: string[]
            ): Record<string, number> => {
                const resultado: Record<string, number> = {};

                for (const id of ids) {
                    const cantidad = cantidades?.[id];

                    if (
                        typeof cantidad === 'number' &&
                        Number.isInteger(cantidad) &&
                        cantidad > 0 &&
                        cantidad <= 20
                    ) {
                        resultado[id] = cantidad;
                    }
                }

                return resultado;
            };

            this.cantidadesProductos.set(
                recuperar(
                    datos.productos,
                    this.productos().map((producto) => producto.id)
                )
            );

            this.cantidadesCombos.set(
                recuperar(
                    datos.combos,
                    this.combos().map((combo) => combo.id)
                )
            );
        } catch {
            sessionStorage.removeItem(this.claveCarrito);
        }
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

        return 'No se pudo cargar el Candy. Intentá nuevamente.';
    }
}