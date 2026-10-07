import { inject, Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';

export interface Genero {
    id: string;
    nombre: string;
}

@Injectable({
    providedIn: 'root'
})
export class GenerosService {
    private readonly supabase = inject(SupabaseService);

    async obtenerTodos(): Promise<Genero[]> {
        const { data, error } = await this.supabase.cliente
            .from('generos')
            .select('id, nombre')
            .order('nombre');

        if (error) {
            throw error;
        }

        return data ?? [];
    }

    async crear(nombre: string): Promise<Genero> {
        const normalizado = nombre
            .trim()
            .replace(/\s+/g, ' ');

        if (!normalizado || normalizado.length > 80) {
            throw new Error(
                'El género debe tener entre 1 y 80 caracteres.'
            );
        }

        const { data, error } = await this.supabase.cliente
            .rpc('cine_crear_genero', {
                p_nombre: normalizado
            });

        if (error) {
            throw error;
        }

        if (
            !data ||
            typeof data.id !== 'string' ||
            typeof data.nombre !== 'string'
        ) {
            throw new Error(
                'No se recibió el género guardado.'
            );
        }

        return data as Genero;
    }
}