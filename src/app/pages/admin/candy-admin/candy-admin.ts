import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
    CandyService,
    CategoriaCandy,
    ComboCandy,
    DatosComboCandy,
    DatosProductoCandy,
    ProductoCandy
} from '../../../base/service/candy.service';
import { BeneficiosService, Paquete } from '../../../base/service/beneficios.service';
import { mensajeOperacion } from '../../../base/service/panel.service';

@Component({
    selector: 'app-candy-admin',
    imports: [FormsModule, DecimalPipe],
    templateUrl: './candy-admin.html',
    styleUrl: './candy-admin.scss'
})
export class CandyAdmin implements OnInit, OnDestroy {
    private readonly candy = inject(CandyService);
    readonly tipoCombo = signal<'candy' | 'entrada'>('candy');
    private readonly beneficios = inject(BeneficiosService);
    readonly paquetes = signal<ComboCandy[]>([]);
    readonly combosVisibles = computed(() =>
        this.tipoCombo() === 'entrada' ? this.paquetes() : this.combos()
    );

    private archivoImagen: File | null = null;
    private urlTemporalImagen: string | null = null;
    private destruido = false;

    readonly categorias = signal<CategoriaCandy[]>([]);
    readonly productos = signal<ProductoCandy[]>([]);
    readonly combos = signal<ComboCandy[]>([]);

    readonly cargando = signal(false);
    readonly guardando = signal(false);
    readonly error = signal('');
    readonly exito = signal('');

    readonly editor = signal<'categoria' | 'producto' | 'combo' | null>(null);

    readonly vistaImagen = signal('');

    readonly busqueda = signal('');
    readonly categoriaFiltro = signal('');
    readonly estadoFiltro = signal('todos');

    readonly busquedaComponentes = signal('');

    categoriaEditada: string | null = null;
    productoEditado: string | null = null;
    comboEditado: string | null = null;

    nombreCategoria = '';
    categoriaActiva = true;

    borrador: DatosProductoCandy = this.productoVacio();
    borradorCombo: DatosComboCandy = this.comboVacio();

    readonly productosFiltrados = computed(() => {
        const texto = this.normalizar(this.busqueda());
        const categoriaId = this.categoriaFiltro();
        const estado = this.estadoFiltro();

        return this.productos().filter(
            (producto) =>
                this.normalizar(producto.nombre).includes(texto) &&
                (!categoriaId || producto.categoria_id === categoriaId) &&
                (estado === 'todos' ||
                    (estado === 'activos' && producto.activo) ||
                    (estado === 'inactivos' && !producto.activo))
        );
    });

    readonly productosParaCombo = computed(() => {
        const texto = this.normalizar(this.busquedaComponentes());

        return this.productos().filter((producto) =>
            this.normalizar(producto.nombre).includes(texto)
        );
    });

    ngOnInit(): void {
        void this.cargar();
    }

    ngOnDestroy(): void {
        this.destruido = true;
        this.liberarVistaImagen();
    }

    async cargar(): Promise<void> {
        if (this.cargando() || this.guardando()) {
            return;
        }

        this.cargando.set(true);
        this.error.set('');

        try {
            const [categorias, productos, combos, beneficios] = await Promise.all([
                this.candy.obtenerCategorias(),
                this.candy.obtenerProductos(),
                this.candy.obtenerCombos(),
                this.beneficios.admin()
            ]);

            if (this.destruido) {
                return;
            }

            this.categorias.set(categorias);
            this.productos.set(productos);
            this.combos.set(combos);
            this.paquetes.set(beneficios.paquetes.map((p) => this.convertirPaquete(p)));
        } catch (error) {
            if (!this.destruido) {
                this.error.set(this.mensajeError(error));
            }
        } finally {
            if (!this.destruido) {
                this.cargando.set(false);
            }
        }
    }

    limpiarFiltros(): void {
        this.busqueda.set('');
        this.categoriaFiltro.set('');
        this.estadoFiltro.set('todos');
    }

    nuevaCategoria(): void {
        if (this.ocupado()) {
            return;
        }

        this.categoriaEditada = null;
        this.nombreCategoria = '';
        this.categoriaActiva = true;
        this.abrirEditor('categoria');
    }

    editarCategoria(categoria: CategoriaCandy): void {
        if (this.ocupado()) {
            return;
        }

        this.categoriaEditada = categoria.id;
        this.nombreCategoria = categoria.nombre;
        this.categoriaActiva = categoria.activa;
        this.abrirEditor('categoria');
    }

    async guardarCategoria(): Promise<void> {
        if (this.ocupado()) {
            return;
        }

        this.iniciarGuardado();

        try {
            const categoria = await this.candy.guardarCategoria(
                this.categoriaEditada,
                this.nombreCategoria,
                this.categoriaActiva
            );

            if (this.destruido) {
                return;
            }

            this.categorias.update((actuales) =>
                this.ordenarPorNombre([
                    ...actuales.filter((actual) => actual.id !== categoria.id),
                    categoria
                ])
            );

            this.terminarEditor('La categoría se guardó correctamente.');
        } catch (error) {
            this.mostrarError(error);
        } finally {
            this.finalizarGuardado();
        }
    }

    nuevoProducto(): void {
        if (this.ocupado()) {
            return;
        }

        this.productoEditado = null;
        this.borrador = this.productoVacio();
        this.abrirEditor('producto');
    }

    editarProducto(producto: ProductoCandy): void {
        if (this.ocupado()) {
            return;
        }

        this.productoEditado = producto.id;

        this.borrador = {
            categoria_id: producto.categoria_id,
            nombre: producto.nombre,
            descripcion: producto.descripcion,
            precio: producto.precio,
            imagen_url: producto.imagen_url,
            activo: producto.activo
        };

        this.abrirEditor('producto', producto.imagen_url);
    }

    async guardarProducto(): Promise<void> {
        if (this.ocupado()) {
            return;
        }

        this.iniciarGuardado();

        try {
            this.candy.validarProducto(this.borrador);

            if (this.archivoImagen) {
                this.borrador.imagen_url = await this.subirImagenSeleccionada();
            }

            if (this.destruido) {
                return;
            }

            const producto = await this.candy.guardarProducto(
                this.productoEditado,
                this.borrador
            );

            if (this.destruido) {
                return;
            }

            this.productos.update((actuales) =>
                this.ordenarPorNombre([
                    ...actuales.filter((actual) => actual.id !== producto.id),
                    producto
                ])
            );

            this.terminarEditor('El producto se guardó correctamente.');
        } catch (error) {
            this.mostrarError(error);
        } finally {
            this.finalizarGuardado();
        }
    }

    async cambiarEstado(producto: ProductoCandy): Promise<void> {
        if (this.ocupado()) {
            return;
        }

        const activo = !producto.activo;
        const accion = activo ? 'activar' : 'desactivar';

        if (!window.confirm(`¿Querés ${accion} ${producto.nombre}?`)) {
            return;
        }

        this.iniciarGuardado();

        try {
            await this.candy.cambiarEstadoProducto(producto.id, activo);

            if (this.destruido) {
                return;
            }

            this.productos.update((actuales) =>
                actuales.map((actual) =>
                    actual.id === producto.id ? { ...actual, activo } : actual
                )
            );

            this.exito.set(`El producto quedó ${activo ? 'activo' : 'desactivado'}.`);
        } catch (error) {
            this.mostrarError(error);
        } finally {
            this.finalizarGuardado();
        }
    }

    nuevoCombo(): void {
        if (this.ocupado()) {
            return;
        }

        this.comboEditado = null;
        this.borradorCombo = {
            ...this.comboVacio(),
            incluye_entrada: this.tipoCombo() === 'entrada'
        };
        this.busquedaComponentes.set('');
        this.abrirEditor('combo');
    }

    crearVersionConEntrada(combo: ComboCandy): void {
        if (this.ocupado() || this.editor() !== null) {
            return;
        }
        this.comboEditado = null;
        this.tipoCombo.set('entrada');
        this.borradorCombo = {
            incluye_entrada: true,
            nombre: combo.nombre.slice(0, 110) + ' + entrada',
            descripcion: combo.descripcion,
            precio: 0,
            imagen_url: combo.imagen_url,
            activo: combo.activo,
            componentes: combo.componentes.map((c) => ({ ...c }))
        };
        this.busquedaComponentes.set('');
        this.abrirEditor('combo', combo.imagen_url);
    }

    editarCombo(combo: ComboCandy): void {
        if (this.ocupado()) {
            return;
        }

        this.comboEditado = combo.id;

        this.borradorCombo = {
            incluye_entrada: !!combo.incluye_entrada,
            nombre: combo.nombre,
            descripcion: combo.descripcion,
            precio: combo.precio,
            imagen_url: combo.imagen_url,
            activo: combo.activo,
            componentes: combo.componentes.map((componente) => ({ ...componente }))
        };

        this.busquedaComponentes.set('');
        this.abrirEditor('combo', combo.imagen_url);
    }

    cantidadEnCombo(productoId: string): number {
        return (
            this.borradorCombo.componentes.find(
                (componente) => componente.producto_id === productoId
            )?.cantidad ?? 0
        );
    }

    cambiarCantidad(productoId: string, valor: unknown): void {
        if (this.guardando()) {
            return;
        }

        const cantidad = Number(valor);

        if (
            !Number.isInteger(cantidad) ||
            cantidad < 0 ||
            cantidad > (this.borradorCombo.incluye_entrada ? 20 : 100)
        ) {
            this.error.set(
                this.borradorCombo.incluye_entrada
                    ? 'Usá una cantidad entre 0 y 20. Cero quita el producto.'
                    : 'Usá una cantidad entre 0 y 100. Cero quita el producto.'
            );
            return;
        }

        this.error.set('');

        const componentes = this.borradorCombo.componentes.filter(
            (componente) => componente.producto_id !== productoId
        );

        if (cantidad > 0) {
            componentes.push({
                producto_id: productoId,
                cantidad
            });
        }

        this.borradorCombo.componentes = componentes;
    }

    async guardarCombo(): Promise<void> {
        if (this.ocupado()) {
            return;
        }

        this.iniciarGuardado();

        try {
            this.candy.validarCombo(this.borradorCombo);

            if (this.archivoImagen) {
                this.borradorCombo.imagen_url = await this.subirImagenSeleccionada();
            }

            if (this.destruido) {
                return;
            }

            const id = await this.candy.guardarCombo(
                this.comboEditado,
                this.borradorCombo
            );

            if (this.destruido) {
                return;
            }

            // Conserva el ID para evitar crear otro si falla la recarga.
            this.comboEditado = id;
            this.tipoCombo.set(this.borradorCombo.incluye_entrada ? 'entrada' : 'candy');
            this.terminarEditor('El combo se guardó correctamente.');

            await this.actualizarCombosGuardados();
        } catch (error) {
            this.mostrarError(error);
        } finally {
            this.finalizarGuardado();
        }
    }

    async cambiarEstadoCombo(combo: ComboCandy): Promise<void> {
        if (this.ocupado()) {
            return;
        }

        const activo = !combo.activo;
        const accion = activo ? 'activar' : 'desactivar';

        if (!window.confirm(`¿Querés ${accion} ${combo.nombre}?`)) {
            return;
        }

        this.iniciarGuardado();

        try {
            await this.candy.guardarCombo(combo.id, {
                incluye_entrada: !!combo.incluye_entrada,
                nombre: combo.nombre,
                descripcion: combo.descripcion,
                precio: combo.precio,
                imagen_url: combo.imagen_url,
                activo,
                componentes: combo.componentes
            });

            if (this.destruido) {
                return;
            }

            const listado = combo.incluye_entrada ? this.paquetes : this.combos;
            listado.update((actuales) =>
                actuales.map((actual) =>
                    actual.id === combo.id ? { ...actual, activo } : actual
                )
            );

            this.exito.set(`El combo quedó ${activo ? 'activo' : 'desactivado'}.`);
        } catch (error) {
            this.mostrarError(error);
        } finally {
            this.finalizarGuardado();
        }
    }

    comboDisponible(combo: ComboCandy): boolean {
        return (
            combo.activo &&
            combo.componentes.length > 0 &&
            combo.componentes.every((componente) => {
                const producto = this.productos().find(
                    (actual) => actual.id === componente.producto_id
                );

                return (
                    !!producto &&
                    producto.activo &&
                    this.categoriaEstaActiva(producto.categoria_id)
                );
            })
        );
    }

    nombreDeProducto(productoId: string): string {
        return (
            this.productos().find((producto) => producto.id === productoId)?.nombre ??
            'Producto no disponible'
        );
    }

    nombreDeCategoria(categoriaId: string): string {
        return (
            this.categorias().find((categoria) => categoria.id === categoriaId)?.nombre ??
            'Sin categoría'
        );
    }

    categoriaEstaActiva(categoriaId: string): boolean {
        return this.categorias().some(
            (categoria) => categoria.id === categoriaId && categoria.activa
        );
    }

    seleccionarImagen(evento: Event): void {
        if (this.guardando()) {
            return;
        }

        const entrada = evento.target as HTMLInputElement;
        const archivo = entrada.files?.[0];

        if (!archivo) {
            return;
        }

        try {
            this.candy.validarImagen(archivo);
            const url = URL.createObjectURL(archivo);

            this.liberarVistaImagen();
            this.archivoImagen = archivo;
            this.urlTemporalImagen = url;
            this.vistaImagen.set(url);
            this.error.set('');
        } catch (error) {
            this.mostrarError(error);
        } finally {
            entrada.value = '';
        }
    }

    cerrarEditor(): void {
        if (this.guardando()) {
            return;
        }

        this.editor.set(null);
        this.limpiarImagen();
        this.error.set('');
    }

    ocupado(): boolean {
        return this.cargando() || this.guardando();
    }

    private abrirEditor(
        tipo: 'categoria' | 'producto' | 'combo',
        imagen: string | null = null
    ): void {
        this.limpiarImagen();
        this.vistaImagen.set(imagen ?? '');
        this.error.set('');
        this.exito.set('');
        this.editor.set(tipo);
    }

    private terminarEditor(mensaje: string): void {
        this.editor.set(null);
        this.limpiarImagen();
        this.exito.set(mensaje);
    }

    private async subirImagenSeleccionada(): Promise<string> {
        const archivo = this.archivoImagen;

        if (!archivo) {
            throw new Error('No se seleccionó una imagen.');
        }

        const url = await this.candy.subirImagen(archivo);

        this.archivoImagen = null;
        this.liberarVistaImagen();

        if (!this.destruido) {
            this.vistaImagen.set(url);
        }

        return url;
    }

    private async actualizarCombosGuardados(): Promise<void> {
        try {
            const [combos, beneficios] = await Promise.all([
                this.candy.obtenerCombos(),
                this.beneficios.admin()
            ]);

            if (!this.destruido) {
                this.combos.set(combos);
                this.paquetes.set(
                    beneficios.paquetes.map((p) => this.convertirPaquete(p))
                );
            }
        } catch {
            if (!this.destruido) {
                this.error.set(
                    'El combo se guardó, pero no pudimos actualizar el listado. Presioná Actualizar.'
                );
            }
        }
    }

    private iniciarGuardado(): void {
        this.guardando.set(true);
        this.error.set('');
        this.exito.set('');
    }

    private finalizarGuardado(): void {
        if (!this.destruido) {
            this.guardando.set(false);
        }
    }

    private mostrarError(error: unknown): void {
        if (!this.destruido) {
            console.error('Error en Candy:', error);
            this.error.set(this.mensajeError(error));
        }
    }

    private mensajeError(error: unknown): string {
        if (error instanceof Error) {
            return error.message;
        }

        if (typeof error === 'object' && error !== null) {
            const mensaje = (error as { message?: unknown }).message;

            if (typeof mensaje === 'string' && mensaje) {
                return mensaje;
            }
        }

        return mensajeOperacion(error);
    }

    private liberarVistaImagen(): void {
        if (this.urlTemporalImagen) {
            URL.revokeObjectURL(this.urlTemporalImagen);
            this.urlTemporalImagen = null;
        }
    }

    private limpiarImagen(): void {
        this.archivoImagen = null;
        this.liberarVistaImagen();
        this.vistaImagen.set('');
    }

    private normalizar(texto: string): string {
        return texto
            .trim()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase();
    }

    private ordenarPorNombre<T extends { nombre: string }>(elementos: T[]): T[] {
        return elementos.sort((primero, segundo) =>
            primero.nombre.localeCompare(segundo.nombre, 'es', {
                numeric: true,
                sensitivity: 'base'
            })
        );
    }

    private productoVacio(): DatosProductoCandy {
        return {
            categoria_id: '',
            nombre: '',
            descripcion: '',
            precio: 0,
            imagen_url: null,
            activo: true
        };
    }

    private convertirPaquete(paquete: Paquete): ComboCandy {
        return {
            id: paquete.id,
            incluye_entrada: true,
            nombre: paquete.nombre,
            descripcion: paquete.descripcion ?? '',
            imagen_url: paquete.imagen_url ?? null,
            precio: Number(paquete.precio),
            activo: paquete.activo,
            creado_en: '',
            componentes:
                paquete.componentes ??
                [paquete.producto_pochoclos, paquete.producto_bebida]
                    .filter((id): id is string => !!id)
                    .map((producto_id) => ({ producto_id, cantidad: 1 }))
        };
    }

    private comboVacio(): DatosComboCandy {
        return {
            nombre: '',
            descripcion: '',
            precio: 0,
            imagen_url: null,
            activo: true,
            componentes: []
        };
    }
}
