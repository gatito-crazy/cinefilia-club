import { SupabaseService } from '../../base/service/supabase.service';
import {
    BeneficiosService,
    Cotizacion,
    opcionesVacias,
} from '../../base/service/beneficios.service';
import { FidelizacionService } from '../../base/service/fidelizacion.service';
import { CanjeArticulo } from '../../shared/canje-articulo/canje-articulo';
import {
    actualizarCanjes,
    unidadesCanje,
    validarCanjes,
    SeleccionCanje,
    validarCanje,
} from '../../base/service/fidelizacion.service';
import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
    CandyService,
    CategoriaCandy,
    ComboCandy,
    ProductoCandy,
} from '../../base/service/candy.service';
import { Reserva, ReservasService } from '../../base/service/reservas.service';

interface SeleccionCandy {
    paquete?: string | null;
    cantidadPaquete?: number;
    productos: Record<string, number>;
    combos: Record<string, number>;
    canje?: SeleccionCanje | null;
    canjes?: SeleccionCanje[];
    productosNormales?: Record<string, number>;
    combosNormales?: Record<string, number>;
}

@Component({
    selector: 'app-candy-compra',
    imports: [DecimalPipe, FormsModule, RouterLink, CanjeArticulo],
    templateUrl: './candy-compra.html',
    styleUrl: './candy-compra.scss',
})
export class CandyCompra implements OnInit, OnDestroy {
    private readonly beneficios = inject(BeneficiosService);
    private readonly fidelizacion = inject(FidelizacionService);
    readonly cotizacionCanje = signal<Cotizacion | null>(null);
    readonly cotizandoCanje = signal(false);
    readonly errorCanje = signal('');
    private revisionCanje = 0;
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

    private readonly supabase = inject(SupabaseService);
    readonly formatoFuncion = signal('');
    readonly paqueteElegido = signal<string | null>(null);
    readonly cantidadPaquete = signal(0);
    readonly paquetes = this.fidelizacion.paquetes;
    readonly funcionId = this.ruta.snapshot.paramMap.get('id') ?? '';

    readonly cargando = signal(true);
    readonly error = signal('');
    readonly errorConexion = signal('');
    readonly reserva = signal<Reserva | null>(null);
    readonly ahora = signal(Date.now());

    readonly categorias = signal<CategoriaCandy[]>([]);
    readonly productos = signal<ProductoCandy[]>([]);
    readonly combos = signal<ComboCandy[]>([]);

    readonly canjesElegidos = signal<SeleccionCanje[]>([]);
    readonly cantidadesProductos = signal<Record<string, number>>({});
    readonly cantidadesCombos = signal<Record<string, number>>({});
    readonly mostrarResumen = signal(false);

    readonly busqueda = signal('');
    readonly categoriaSeleccionada = signal('');
    readonly vista = signal<'todos' | 'productos' | 'combos'>('todos');

    readonly reservaVigente = computed(() => {
        const reserva = this.reserva();

        return (
            !!reserva &&
            reserva.estado === 'reservada' &&
            new Date(reserva.vence_en).getTime() > this.ahora()
        );
    });

    readonly tiempoRestante = computed(() => {
        const vencimiento = this.reserva()?.vence_en;

        const segundos = vencimiento
            ? Math.max(0, Math.ceil((new Date(vencimiento).getTime() - this.ahora()) / 1000))
            : 0;

        return (
            `${String(Math.floor(segundos / 60)).padStart(2, '0')}:` +
            String(segundos % 60).padStart(2, '0')
        );
    });

    readonly productosFiltrados = computed(() => {
        const texto = this.normalizar(this.busqueda());
        const categoria = this.categoriaSeleccionada();

        return this.productos().filter(
            (producto) =>
                this.normalizar(producto.nombre).includes(texto) &&
                (!categoria || producto.categoria_id === categoria),
        );
    });

    readonly combosFiltrados = computed(() => {
        const texto = this.normalizar(this.busqueda());
        const categoria = this.categoriaSeleccionada();

        return this.combos().filter(
            (combo) =>
                this.normalizar(combo.nombre).includes(texto) &&
                (!categoria ||
                    combo.componentes.some((componente) =>
                        this.productos().some(
                            (producto) =>
                                producto.id === componente.producto_id &&
                                producto.categoria_id === categoria,
                        ),
                    )),
        );
    });

    readonly detalleCandy = computed(() => [
        ...this.productos()
            .filter((producto) => (this.cantidadesTotales('producto')[producto.id] ?? 0) > 0)
            .map((producto) => ({
                clave: `producto-${producto.id}`,
                nombre: producto.nombre,
                cantidad: this.cantidadesTotales('producto')[producto.id],
                precio: producto.precio,
            })),
        ...this.combos()
            .filter((combo) => (this.cantidadesTotales('combo')[combo.id] ?? 0) > 0)
            .map((combo) => ({
                clave: `combo-${combo.id}`,
                nombre: combo.nombre,
                cantidad: this.cantidadesTotales('combo')[combo.id],
                precio: combo.precio,
            })),
    ]);

    readonly detalleCandyResumen = computed(() => {
        const cotizacion = this.cotizacionCanje();
        return cotizacion
            ? cotizacion.detalle_candy.map((item, posicion) => ({
                  clave: String(posicion),
                  nombre: item.nombre,
                  cantidad: item.cantidad,
                  precio: item.precio,
              }))
            : this.detalleCandy();
    });
    readonly totalCandyResumen = computed(
        () => this.cotizacionCanje()?.candy_total ?? this.totalCandy(),
    );
    readonly subtotalResumen = computed(
        () => this.cotizacionCanje()?.subtotal ?? this.totalCompra(),
    );

    readonly totalCandy = computed(
        () =>
            this.detalleCandy().reduce(
                (total, item) => total + Math.round(item.precio * 100) * item.cantidad,
                0,
            ) / 100,
    );

    readonly totalCompra = computed(
        () => Math.round(((this.reserva()?.total ?? 0) + this.totalCandy()) * 100) / 100,
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

            const { data: funcion, error: errorFuncion } = await this.supabase.cliente
                .from('funciones')
                .select('formato')
                .eq('id', this.funcionId)
                .single();
            if (errorFuncion) {
                throw errorFuncion;
            }
            this.formatoFuncion.set(funcion.formato);
            const almacenamiento = await this.reservasService.obtenerClaveAlmacenamiento(
                this.funcionId,
            );

            const solicitud = this.reservasService.leerSolicitud(almacenamiento);

            if (!solicitud) {
                throw new Error('Primero elegí tus butacas y creá una reserva.');
            }

            this.canjesElegidos.set(validarCanjes(solicitud.canjes));
            this.claveReserva = solicitud.clave;
            this.claveCarrito = `${almacenamiento}-candy-${solicitud.clave}`;

            const [reserva, categorias, productos, combos] = await Promise.all([
                this.reservasService.obtenerReserva(this.claveReserva),
                this.candyService.obtenerCategorias(),
                this.candyService.obtenerProductos(),
                this.candyService.obtenerCombos(),
            ]);

            if (this.destruido) {
                return;
            }

            if (!reserva || reserva.funcion_id !== this.funcionId) {
                throw new Error('La reserva ya no está disponible.');
            }

            const categoriasActivas = categorias.filter((categoria) => categoria.activa);

            const idsCategorias = new Set(categoriasActivas.map((categoria) => categoria.id));

            const productosActivos = productos.filter(
                (producto) => producto.activo && idsCategorias.has(producto.categoria_id),
            );

            const idsProductos = new Set(productosActivos.map((producto) => producto.id));

            const combosActivos = combos.filter(
                (combo) =>
                    combo.activo &&
                    combo.componentes.length > 0 &&
                    combo.componentes.every((componente) =>
                        idsProductos.has(componente.producto_id),
                    ),
            );

            this.categorias.set(categoriasActivas);
            this.productos.set(productosActivos);
            this.combos.set(combosActivos);
            this.aplicarReserva(reserva);
            this.recuperarCarrito();
            void this.cotizarCanje();
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
        if (this.destruido || this.cargando() || this.comprobando || !this.claveReserva) {
            return;
        }

        this.comprobando = true;

        try {
            const reserva = await this.reservasService.obtenerReserva(this.claveReserva);

            if (!this.destruido) {
                this.aplicarReserva(reserva);
                this.errorConexion.set('');
            }
        } catch {
            if (!this.destruido) {
                this.errorConexion.set('No pudimos comprobar la reserva. Revisá la conexión.');
            }
        } finally {
            this.comprobando = false;
        }
    }

    cambiarCantidad(tipo: 'producto' | 'combo', id: string, valor: number): void {
        if (
            !this.reservaVigente() ||
            !Number.isInteger(valor) ||
            valor < 0 ||
            valor + unidadesCanje(this.canjesElegidos(), tipo, id) > 20
        ) {
            return;
        }

        const cantidades = tipo === 'producto' ? this.cantidadesProductos : this.cantidadesCombos;

        cantidades.update((actuales) => ({
            ...actuales,
            [id]: valor,
        }));

        this.guardarCarrito();
    }

    elegirCanje(canje: SeleccionCanje): void {
        if (!this.reservaVigente() || this.cargando()) {
            return;
        }
        if (canje.tipo === 'paquete') {
            this.paqueteElegido.set(null);
            this.cantidadPaquete.set(0);
            this.canjesElegidos.update((actuales) =>
                actuales.filter(
                    (actual) => actual.tipo !== 'paquete' || actual.recompensa === canje.recompensa,
                ),
            );
        }
        this.canjesElegidos.update((c) => actualizarCanjes(c, canje));
        this.guardarCarrito();
    }

    recompensasArticulo(tipo: string, id: string) {
        return this.fidelizacion
            .recompensas()
            .filter((r) => r.activa && r.tipo === tipo && r.articulo_id === id);
    }

    private async cotizarCanje(): Promise<void> {
        const revision = ++this.revisionCanje;
        const canjes = this.canjesElegidos();
        this.cotizacionCanje.set(null);
        this.errorCanje.set('');
        this.cotizandoCanje.set(false);
        if ((!canjes.length && !this.paqueteElegido()) || !this.claveReserva) {
            return;
        }
        this.cotizandoCanje.set(true);
        try {
            const candy = [
                ...Object.entries(this.cantidadesTotales('producto')).map(([id, cantidad]) => ({
                    tipo: 'producto' as const,
                    id,
                    cantidad,
                })),
                ...Object.entries(this.cantidadesTotales('combo')).map(([id, cantidad]) => ({
                    tipo: 'combo' as const,
                    id,
                    cantidad,
                })),
            ].filter((a) => a.cantidad > 0);
            const cotizacion = await this.beneficios.cotizar(
                this.claveReserva,
                candy,
                [],
                {
                    ...opcionesVacias(),
                    borrador: true,
                    paquete: this.paqueteElegido(),
                    cantidad_paquete: this.cantidadPaquete() || 1,
                    canjes: canjes.map((c) => ({
                        recompensa: c.recompensa,
                        cantidad: c.cantidad,
                        butacas: c.butacas,
                    })),
                    email: this.fidelizacion.auth.usuario()?.email ?? '',
                },
                false,
            );
            if (!this.destruido && revision === this.revisionCanje) {
                this.cotizacionCanje.set(cotizacion);
            }
        } catch (error) {
            if (!this.destruido && revision === this.revisionCanje) {
                this.errorCanje.set(this.obtenerMensaje(error));
            }
        } finally {
            if (!this.destruido && revision === this.revisionCanje) {
                this.cotizandoCanje.set(false);
            }
        }
    }

    async revisarCompra(): Promise<void> {
        await this.comprobarReserva();

        if (this.reservaVigente() && !this.errorConexion()) {
            this.guardarCarrito();
            await this.cotizarCanje();

            if (!this.errorConexion() && !this.errorCanje()) {
                this.mostrarResumen.set(true);
            }
        }
    }

    nombreProducto(id: string): string {
        return this.productos().find((producto) => producto.id === id)?.nombre ?? 'Producto';
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

    cantidadesTotales(tipo: 'producto' | 'combo'): Record<string, number> {
        const cantidades = {
            ...(tipo === 'producto' ? this.cantidadesProductos() : this.cantidadesCombos()),
        };
        for (const c of this.canjesElegidos().filter((c) => c.tipo === tipo)) {
            cantidades[c.articuloId] = (cantidades[c.articuloId] ?? 0) + c.cantidad;
        }
        return cantidades;
    }

    paquetesFiltrados() {
        const texto = this.normalizar(this.busqueda());
        const categoria = this.categoriaSeleccionada();
        return this.paquetes().filter(
            (paquete) =>
                this.normalizar(paquete.nombre).includes(texto) &&
                (!categoria ||
                    (paquete.componentes ?? []).some((componente) =>
                        this.productos().some(
                            (producto) =>
                                producto.id === componente.producto_id &&
                                producto.categoria_id === categoria,
                        ),
                    )),
        );
    }

    limitePaquetes(): number {
        return Math.min(20, (this.reserva()?.butacas.length ?? 0) - this.canjesEntradas());
    }

    cambiarPaquete(id: string, delta: number): void {
        if (!this.reservaVigente() || this.cargando()) {
            return;
        }
        const cantidad = (this.paqueteElegido() === id ? this.cantidadPaquete() : 0) + delta;
        if (
            !Number.isInteger(cantidad) ||
            cantidad < 0 ||
            cantidad > this.limitePaquetes() ||
            !this.paquetes().some((paquete) => paquete.id === id)
        ) {
            return;
        }
        this.canjesElegidos.update((canjes) => canjes.filter((canje) => canje.tipo !== 'paquete'));
        this.paqueteElegido.set(cantidad > 0 ? id : null);
        this.cantidadPaquete.set(cantidad);
        this.guardarCarrito();
    }

    limitePaquetesCanje(recompensa: string): number {
        if (
            this.paqueteElegido() ||
            this.canjesElegidos().some(
                (canje) => canje.tipo === 'paquete' && canje.recompensa !== recompensa,
            )
        ) {
            return 0;
        }
        return Math.min(
            20,
            (this.reserva()?.butacas.filter((butaca) => butaca.tipo !== 'vip').length ?? 0) -
                this.canjesEntradas(),
        );
    }

    canjesEntradas(): number {
        return this.canjesElegidos()
            .filter((c) => c.tipo === 'entrada')
            .reduce((n, c) => n + c.cantidad, 0);
    }

    describirPaquete(id: string | null): string {
        const paquete = this.fidelizacion.paquetes().find((p) => p.id === id);
        const productos =
            paquete?.componentes
                ?.map((c) => `${c.cantidad} × ${this.nombreProducto(c.producto_id)}`)
                .join(', ') ?? '';
        return `${paquete?.descripcion ?? ''} Incluye una entrada${productos ? ': ' + productos : ' y los productos del combo'}. El canje por puntos requiere una función 2D y una butaca no VIP.`.trim();
    }

    imagenPaquete(id: string | null): string | null {
        return this.fidelizacion.paquetes().find((p) => p.id === id)?.imagen_url ?? null;
    }

    recompensasPaquetes() {
        if (this.formatoFuncion() !== '2D') {
            return [];
        }
        return this.fidelizacion
            .recompensas()
            .filter(
                (r) =>
                    r.activa &&
                    r.tipo === 'paquete' &&
                    this.fidelizacion.paquetes().some((p) => p.id === r.articulo_id),
            );
    }

    private guardarCarrito(): void {
        void this.cotizarCanje();
        try {
            sessionStorage.setItem(
                this.claveCarrito,
                JSON.stringify({
                    productos: this.cantidadesTotales('producto'),
                    productosNormales: this.cantidadesProductos(),
                    combos: this.cantidadesTotales('combo'),
                    combosNormales: this.cantidadesCombos(),
                    total: this.totalCompra(),
                    canjes: this.canjesElegidos(),
                    paquete: this.paqueteElegido(),
                    cantidadPaquete: this.cantidadPaquete(),
                }),
            );
        } catch {
            this.errorConexion.set('No pudimos guardar el Candy en este navegador.');
        }
    }

    private recuperarCarrito(): void {
        try {
            const texto = sessionStorage.getItem(this.claveCarrito);

            if (!texto) {
                return;
            }

            const datos = JSON.parse(texto) as SeleccionCandy;
            if (
                typeof datos.paquete === 'string' &&
                /^[0-9a-f-]{36}$/i.test(datos.paquete) &&
                Number.isInteger(datos.cantidadPaquete) &&
                (datos.cantidadPaquete ?? 0) > 0 &&
                (datos.cantidadPaquete ?? 0) <= this.limitePaquetes()
            ) {
                this.paqueteElegido.set(datos.paquete);
                this.cantidadPaquete.set(datos.cantidadPaquete!);
            }

            const recuperar = (
                cantidades: Record<string, number> | undefined,
                ids: string[],
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
                    datos.productosNormales ?? datos.productos,
                    this.productos().map((producto) => producto.id),
                ),
            );

            this.cantidadesCombos.set(
                recuperar(
                    datos.combosNormales ?? datos.combos,
                    this.combos().map((combo) => combo.id),
                ),
            );
            const anteriores = validarCanjes(datos.canjes ?? datos.canje).filter(
                (c) => c.tipo !== 'entrada',
            );
            this.canjesElegidos.update((c) => [
                ...c.filter((x) => x.tipo === 'entrada'),
                ...anteriores,
            ]);
            if (!datos.productosNormales && !datos.combosNormales) {
                for (const c of anteriores) {
                    if (c.tipo === 'producto' || c.tipo === 'combo') {
                        const cantidades =
                            c.tipo === 'producto'
                                ? this.cantidadesProductos
                                : this.cantidadesCombos;
                        cantidades.update((actual) => ({
                            ...actual,
                            [c.articuloId]: Math.max(0, (actual[c.articuloId] ?? 0) - c.cantidad),
                        }));
                    }
                }
            }
        } catch {
            sessionStorage.removeItem(this.claveCarrito);
        }
    }

    private normalizar(texto: string): string {
        return texto
            .trim()
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
