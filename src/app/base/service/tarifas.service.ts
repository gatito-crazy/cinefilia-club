import { inject, Injectable } from '@angular/core';
import type { FormatoFuncion } from './funciones.service';
import { SupabaseService } from './supabase.service';

export interface TarifaFormato {
    formato: FormatoFuncion;
    precio_estandar: number;
    precio_accesible: number;
    precio_vip: number;
    actualizado_en: string;
}

export interface DatosTarifa {
    formato: FormatoFuncion;
    precio_estandar: number;
    precio_accesible: number;
    precio_vip: number;
}

@Injectable({
    providedIn: 'root'
})
export class TarifasService {
    private readonly supabase = inject(SupabaseService);

    async obtenerTodas(): Promise<TarifaFormato[]> {
        const { data, error } = await this.supabase.cliente
            .from('tarifas_formatos')
            .select(`
                formato,
                precio_estandar,
                precio_accesible,
                precio_vip,
                actualizado_en
            `)
            .order('formato')
            .overrideTypes<TarifaFormato[], { merge: false }>();

        if (error) {
            throw error;
        }

        return data ?? [];
    }

    async guardar(datos: DatosTarifa): Promise<void> {
        this.validar(datos);

        const { error } = await this.supabase.cliente
            .rpc('cine_guardar_tarifa_formato', {
                p_formato: datos.formato,
                p_estandar: datos.precio_estandar,
                p_accesible: datos.precio_accesible,
                p_vip: datos.precio_vip
            });

        if (error) {
            throw error;
        }
    }

    private validar(datos: DatosTarifa): void {
        if (!['2D', '3D', '4D', '5D'].includes(datos.formato)) {
            throw new Error('Seleccioná un formato válido.');
        }

        const precios = [
            datos.precio_estandar,
            datos.precio_accesible,
            datos.precio_vip
        ];

        if (
            precios.some((precio) =>
                !Number.isFinite(precio) ||
                precio <= 0 ||
                precio > 9999999999.99 ||
                Math.abs(
                    precio * 100 - Math.round(precio * 100)
                ) > 0.00001
            )
        ) {
            throw new Error(
                'Ingresá precios positivos de hasta dos decimales y dentro del límite permitido.'
            );
        }

        if (datos.precio_vip <= datos.precio_estandar) {
            throw new Error(
                'El precio VIP debe ser mayor al precio estándar.'
            );
        }
    }
}