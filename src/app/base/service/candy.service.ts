import { inject, Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';

export interface CategoriaCandy {
    id: string;
    nombre: string;
    activa: boolean;
    creado_en: string;
}

export interface ProductoCandy {
    id: string;
    categoria_id: string;
    nombre: string;
    descripcion: string;
    precio: number;
    imagen_url: string | null;
    activo: boolean;
    creado_en: string;
}

export interface ComponenteComboCandy {
    producto_id: string;
    cantidad: number;
}

export interface ComboCandy {
    id: string;
    nombre: string;
    descripcion: string;
    precio: number;
    imagen_url: string | null;
    activo: boolean;
    creado_en: string;
    componentes: ComponenteComboCandy[];
}

export interface DatosProductoCandy {
    categoria_id: string;
    nombre: string;
    descripcion: string;
    precio: number;
    imagen_url: string | null;
    activo: boolean;
}

export interface DatosComboCandy {
    nombre: string;
    descripcion: string;
    precio: number;
    imagen_url: string | null;
    activo: boolean;
    componentes: ComponenteComboCandy[];
}

@Injectable({
    providedIn: 'root'
})
export class CandyService {
    private readonly supabase = inject(SupabaseService);

    async obtenerCategorias(): Promise<CategoriaCandy[]> {
        const { data, error } = await this.supabase.cliente
            .from('candy_categorias')
            .select('id, nombre, activa, creado_en')
            .order('nombre')
            .overrideTypes<CategoriaCandy[], { merge: false }>();

        if (error) {
            throw error;
        }

        return data ?? [];
    }

    async obtenerProductos(): Promise<ProductoCandy[]> {
        const { data, error } = await this.supabase.cliente
            .from('candy_productos')
            .select(`
                id, categoria_id, nombre, descripcion,
                precio, imagen_url, activo, creado_en
            `)
            .order('nombre')
            .overrideTypes<ProductoCandy[], { merge: false }>();

        if (error) {
            throw error;
        }

        return data ?? [];
    }

    async obtenerCombos(): Promise<ComboCandy[]> {
        const { data, error } = await this.supabase.cliente
            .from('candy_combos')
            .select(`
                id, nombre, descripcion, precio,
                imagen_url, activo, creado_en,
                componentes:candy_combo_productos (
                    producto_id, cantidad
                )
            `)
            .order('nombre')
            .overrideTypes<ComboCandy[], { merge: false }>();

        if (error) {
            throw error;
        }

        return data ?? [];
    }

    async guardarCategoria(
        categoriaId: string | null,
        nombre: string,
        activa: boolean
    ): Promise<CategoriaCandy> {
        const nombreLimpio = nombre.trim();

        if (!nombreLimpio || nombreLimpio.length > 80) {
            throw new Error(
                'El nombre de la categoría debe tener entre 1 y 80 caracteres.'
            );
        }

        const valores = { nombre: nombreLimpio, activa };

        const consulta = categoriaId === null
            ? this.supabase.cliente
                .from('candy_categorias')
                .insert(valores)
            : this.supabase.cliente
                .from('candy_categorias')
                .update(valores)
                .eq('id', categoriaId);

        const { data, error } = await consulta
            .select('id, nombre, activa, creado_en')
            .single<CategoriaCandy>();

        if (error) {
            throw error;
        }

        return data;
    }

    async guardarProducto(
        productoId: string | null,
        datos: DatosProductoCandy
    ): Promise<ProductoCandy> {
        this.validarProducto(datos);

        const valores: DatosProductoCandy = {
            ...datos,
            nombre: datos.nombre.trim(),
            descripcion: datos.descripcion.trim(),
            imagen_url: datos.imagen_url?.trim() || null
        };

        const consulta = productoId === null
            ? this.supabase.cliente
                .from('candy_productos')
                .insert(valores)
            : this.supabase.cliente
                .from('candy_productos')
                .update(valores)
                .eq('id', productoId);

        const { data, error } = await consulta
            .select(`
                id, categoria_id, nombre, descripcion,
                precio, imagen_url, activo, creado_en
            `)
            .single<ProductoCandy>();

        if (error) {
            throw error;
        }

        return data;
    }

    async cambiarEstadoProducto(
        productoId: string,
        activo: boolean
    ): Promise<void> {
        const { error } = await this.supabase.cliente
            .from('candy_productos')
            .update({ activo })
            .eq('id', productoId)
            .select('id')
            .single();

        if (error) {
            throw error;
        }
    }

    async guardarCombo(
        comboId: string | null,
        datos: DatosComboCandy
    ): Promise<string> {
        this.validarCombo(datos);

        const { data, error } = await this.supabase.cliente
            .rpc('cine_guardar_combo', {
                p_id: comboId,
                p_nombre: datos.nombre.trim(),
                p_descripcion: datos.descripcion.trim(),
                p_precio: datos.precio,
                p_imagen_url: datos.imagen_url?.trim() || null,
                p_activo: datos.activo,
                p_componentes: datos.componentes
            });

        if (error) {
            throw error;
        }

        if (typeof data !== 'string') {
            throw new Error(
                'No se recibió la identificación del combo. Actualizá el catálogo antes de reintentar.'
            );
        }

        return data;
    }

    validarImagen(archivo: File): void {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(archivo.type)) {
            throw new Error('Elegí una imagen JPG, PNG o WEBP.');
        }

        if (archivo.size === 0 || archivo.size > 5 * 1024 * 1024) {
            throw new Error(
                'La imagen debe pesar como máximo 5 MB y no estar vacía.'
            );
        }
    }

    async subirImagen(archivo: File): Promise<string> {
        this.validarImagen(archivo);

        const extensiones: Record<string, string> = {
            'image/jpeg': 'jpg',
            'image/png': 'png',
            'image/webp': 'webp'
        };

        const ruta =
            `gestion/${crypto.randomUUID()}.${extensiones[archivo.type]}`;

        const { error } = await this.supabase.cliente.storage
            .from('candy-imagenes')
            .upload(ruta, archivo, {
                contentType: archivo.type,
                cacheControl: '3600',
                upsert: false
            });

        if (error) {
            throw error;
        }

        const { data } = this.supabase.cliente.storage
            .from('candy-imagenes')
            .getPublicUrl(ruta);

        return data.publicUrl;
    }

    validarProducto(datos: DatosProductoCandy): void {
        if (!datos.categoria_id) {
            throw new Error('Seleccioná una categoría.');
        }

        this.validarDatosGenerales(datos);
    }

    validarCombo(datos: DatosComboCandy): void {
        this.validarDatosGenerales(datos);

        if (
            datos.componentes.length === 0 ||
            datos.componentes.length > 50
        ) {
            throw new Error(
                'Seleccioná entre 1 y 50 productos diferentes para el combo.'
            );
        }

        const ids = new Set<string>();

        for (const componente of datos.componentes) {
            if (
                !componente.producto_id ||
                ids.has(componente.producto_id)
            ) {
                throw new Error(
                    'La composición contiene un producto inválido o repetido.'
                );
            }

            if (
                !Number.isInteger(componente.cantidad) ||
                componente.cantidad < 1 ||
                componente.cantidad > 100
            ) {
                throw new Error(
                    'Las cantidades deben ser enteros entre 1 y 100.'
                );
            }

            ids.add(componente.producto_id);
        }
    }

    private validarDatosGenerales(datos: {
        nombre: string;
        descripcion: string;
        precio: number;
        imagen_url: string | null;
    }): void {
        const nombre = datos.nombre.trim();

        if (!nombre || nombre.length > 120) {
            throw new Error(
                'El nombre debe tener entre 1 y 120 caracteres.'
            );
        }

        if (datos.descripcion.trim().length > 1500) {
            throw new Error(
                'La descripción no puede superar los 1500 caracteres.'
            );
        }

        if (
            !Number.isFinite(datos.precio) ||
            datos.precio <= 0 ||
            datos.precio > 9999999999.99
        ) {
            throw new Error('Ingresá un precio válido mayor a cero.');
        }

        if (
            Math.abs(
                datos.precio * 100 - Math.round(datos.precio * 100)
            ) > 0.0001
        ) {
            throw new Error('El precio puede tener hasta dos decimales.');
        }

        const imagen = datos.imagen_url?.trim();

        if (imagen) {
            try {
                const url = new URL(imagen);

                if (
                    url.protocol !== 'https:' ||
                    imagen.length > 2048 ||
                    /\s/.test(imagen)
                ) {
                    throw new Error();
                }
            } catch {
                throw new Error(
                    'La imagen debe tener una dirección HTTPS válida.'
                );
            }
        }
    }
}