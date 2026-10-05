import { inject, Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Genero } from './generos.service';

export interface Pelicula {
    id: string;
    nombre: string;
    sinopsis: string;
    duracion_minutos: number;
    imagen_url: string | null;
    edad_minima: number;
    fecha_estreno: string | null;
    activa: boolean;
    generos: Genero[];
}

export interface DatosPelicula {
    id: string | null;
    nombre: string;
    sinopsis: string;
    duracion_minutos: number;
    imagen_url: string | null;
    edad_minima: number;
    fecha_estreno: string | null;
    activa: boolean;
    generos: string[];
}

@Injectable({
    providedIn: 'root'
})
export class PeliculasService {
    private readonly supabase = inject(SupabaseService);

    async obtenerActivas(): Promise<Pelicula[]> {
        const { data, error } = await this.supabase.cliente
            .from('peliculas')
            .select(`
                id,
                nombre,
                sinopsis,
                duracion_minutos,
                imagen_url,
                edad_minima,
                fecha_estreno,
                activa,
                generos (id, nombre)
            `)
            .eq('activa', true)
            .order('nombre')
            .overrideTypes<Pelicula[], { merge: false }>();

        if (error) {
            throw error;
        }

        return data ?? [];
    }

    async obtenerTodas(): Promise<Pelicula[]> {
        const { data, error } = await this.supabase.cliente
            .rpc('cine_listar_peliculas_admin');

        if (error) {
            throw error;
        }

        if (!Array.isArray(data)) {
            throw new Error(
                'El listado de películas no tiene el formato esperado.'
            );
        }

        return data as Pelicula[];
    }

    async cambiarEstado(
        peliculaId: string,
        activa: boolean
    ): Promise<void> {
        const { error } = await this.supabase.cliente
            .rpc('cine_cambiar_estado_pelicula', {
                p_pelicula: peliculaId,
                p_activa: activa
            });

        if (error) {
            throw error;
        }
    }

    async guardar(datos: DatosPelicula): Promise<string> {
        const { data, error } = await this.supabase.cliente
            .rpc('cine_guardar_pelicula', {
                p_id: datos.id,
                p_nombre: datos.nombre.trim(),
                p_sinopsis: datos.sinopsis.trim(),
                p_duracion: datos.duracion_minutos,
                p_imagen_url: datos.imagen_url,
                p_edad_minima: datos.edad_minima,
                p_fecha_estreno: datos.fecha_estreno,
                p_activa: datos.activa,
                p_generos: datos.generos
            });

        if (error) {
            throw error;
        }

        if (typeof data !== 'string') {
            throw new Error(
                'No se recibió la identificación de la película guardada. Actualizá el listado antes de reintentar.'
            );
        }

        return data;
    }

    async eliminar(peliculaId: string): Promise<void> {
        const { error } = await this.supabase.cliente
            .rpc('cine_eliminar_pelicula', {
                p_pelicula: peliculaId
            });

        if (error) {
            throw error;
        }
    }

    async subirPoster(archivo: File): Promise<string> {
        const extensiones: Record<string, string> = {
            'image/jpeg': 'jpg',
            'image/png': 'png',
            'image/webp': 'webp'
        };

        const extension = extensiones[archivo.type];

        if (!extension) {
            throw new Error(
                'El póster debe ser una imagen JPG, PNG o WEBP.'
            );
        }

        if (archivo.size === 0 || archivo.size > 5 * 1024 * 1024) {
            throw new Error(
                'La imagen debe pesar como máximo 5 MB y no estar vacía.'
            );
        }

        const ruta = `gestion/${crypto.randomUUID()}.${extension}`;

        const { error } = await this.supabase.cliente.storage
            .from('posters')
            .upload(ruta, archivo, {
                contentType: archivo.type,
                cacheControl: '3600',
                upsert: false
            });

        if (error) {
            throw error;
        }

        const { data } = this.supabase.cliente.storage
            .from('posters')
            .getPublicUrl(ruta);

        return data.publicUrl;
    }
}