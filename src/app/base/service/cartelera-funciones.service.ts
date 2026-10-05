import { inject, Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';

export interface FuncionCartelera {
    id: string;
    pelicula_id: string;
    sala_id: string;
    inicio: string;
    fin: string;
    formato: string;
    idioma: string;
    precio_estandar: number;
    precio_accesible: number;
    precio_vip: number;
    sala: {
        nombre: string;
        activa: boolean;
    };
}

@Injectable({
    providedIn: 'root'
})
export class CarteleraFuncionesService {
    private readonly supabase = inject(SupabaseService);

    async obtenerDisponibles(
        peliculaId: string
    ): Promise<FuncionCartelera[]> {
        const { data, error } = await this.supabase.cliente
            .from('funciones')
            .select(`
                id,
                pelicula_id,
                sala_id,
                inicio,
                fin,
                formato,
                idioma,
                precio_estandar,
                precio_accesible,
                precio_vip,
                sala:salas!inner (
                    nombre,
                    activa
                )
            `)
            .eq('pelicula_id', peliculaId)
            .eq('activa', true)
            .eq('sala.activa', true)
            .gt('inicio', new Date().toISOString())
            .order('inicio')
            .overrideTypes<FuncionCartelera[], { merge: false }>();

        if (error) {
            throw error;
        }

        return data ?? [];
    }

    async obtenerDisponible(
        funcionId: string
    ): Promise<FuncionCartelera | null> {
        const { data, error } = await this.supabase.cliente
            .from('funciones')
            .select(`
                id,
                pelicula_id,
                sala_id,
                inicio,
                fin,
                formato,
                idioma,
                precio_estandar,
                precio_accesible,
                precio_vip,
                sala:salas!inner (
                    nombre,
                    activa
                )
            `)
            .eq('id', funcionId)
            .eq('activa', true)
            .eq('sala.activa', true)
            .gt('inicio', new Date().toISOString())
            .maybeSingle<FuncionCartelera>();

        if (error) {
            throw error;
        }

        return data;
    }
}