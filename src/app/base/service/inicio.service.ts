import { inject, Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';

export interface PeliculaDestacada {
    id: string;
    nombre: string;
    sinopsis: string;
    duracion_minutos: number;
    imagen_url: string | null;
    entradas_vendidas: number;
}

@Injectable({
    providedIn: 'root'
})
export class InicioService {
    private readonly supabase = inject(SupabaseService);

    async obtenerMasVendidas(): Promise<PeliculaDestacada[]> {
        const { data, error } = await this.supabase.cliente
            .rpc('cine_top_peliculas_inicio');

        if (error) {
            throw error;
        }

        if (!Array.isArray(data)) {
            throw new Error(
                'No se recibió el ranking de películas.'
            );
        }

        return data as PeliculaDestacada[];
    }
}