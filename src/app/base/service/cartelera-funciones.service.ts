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
    preventa?: boolean;
    preventa_descuento?: number;
    sala: {
        nombre: string;
        activa: boolean;
    };
}

@Injectable({
    providedIn: 'root',
})
export class CarteleraFuncionesService {
    private readonly supabase = inject(SupabaseService);

    async obtenerDisponibles(peliculaId: string): Promise<FuncionCartelera[]> {
        const { data, error } = await this.supabase.cliente
            .from('funciones')
            .select(
                `
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
            `,
            )
            .eq('pelicula_id', peliculaId)
            .eq('activa', true)
            .eq('cancelada', false)
            .eq('sala.activa', true)
            .gt('inicio', new Date().toISOString())
            .order('inicio')
            .overrideTypes<FuncionCartelera[], { merge: false }>();

        if (error) {
            throw error;
        }

        const venta = await this.venta(peliculaId);
        return venta.abierta ? (data ?? []).map((f) => this.aplicarPrecio(f, venta)) : [];
    }

    async obtenerDisponible(funcionId: string): Promise<FuncionCartelera | null> {
        const { data, error } = await this.supabase.cliente
            .from('funciones')
            .select(
                `
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
            `,
            )
            .eq('id', funcionId)
            .eq('activa', true)
            .eq('cancelada', false)
            .eq('sala.activa', true)
            .gt('inicio', new Date().toISOString())
            .maybeSingle<FuncionCartelera>();

        if (error) {
            throw error;
        }

        if (!data) {
            return null;
        }
        const venta = await this.venta(data.pelicula_id);
        return venta.abierta ? this.aplicarPrecio(data, venta) : null;
    }
    private async venta(pelicula: string): Promise<{
        abierta: boolean;
        preventa: boolean;
        precio: number | null;
        descuento?: number;
    }> {
        const { data, error } = await this.supabase.cliente.rpc('cine_venta_pelicula', {
            p_pelicula: pelicula,
        });
        if (error) {
            throw error;
        }
        return data;
    }
    private aplicarPrecio(
        f: FuncionCartelera,
        venta: { preventa: boolean; precio: number | null; descuento?: number },
    ): FuncionCartelera {
        if (!venta.preventa) {
            return f;
        }
        const factor = 1 - Number(venta.descuento ?? 10) / 100;
        const redondear = (n: number): number => Math.round(n * 100) / 100;
        return {
            ...f,
            preventa: true,
            preventa_descuento: Number(venta.descuento ?? 10),
            precio_estandar: redondear(Number(f.precio_estandar) * factor),
            precio_accesible: redondear(Number(f.precio_accesible) * factor),
            precio_vip: Number(f.precio_vip),
        };
    }
}
