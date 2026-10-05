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
}