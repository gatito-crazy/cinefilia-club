import { inject, Injectable } from '@angular/core';

import { SupabaseService } from './supabase.service';

export type TipoCupon = 'primera_compra' | 'mayores_50' | 'general';

export type AplicacionCupon = 'total' | 'entradas' | 'candy';

export interface Cupon {
    id: string;
    codigo: string;
    nombre: string;
    tipo: TipoCupon;
    porcentaje: number;
    aplica_a: AplicacionCupon;
    acumulable: boolean;
    beneficio_permanente: boolean;
    importe_minimo: number;
    edad_minima: number;
    dias_permitidos: number[];
    vigente_desde: string | null;
    vigente_hasta: string | null;
}

export interface CuponAdmin extends Cupon {
    activo: boolean;
    creado_en: string;
}

export interface DatosCupon {
    id: string | null;
    codigo: string;
    nombre: string;
    tipo: TipoCupon;
    porcentaje: number;
    activo: boolean;
    beneficio_permanente: boolean;
    acumulable: boolean;
    dias_permitidos: number[];
    edad_minima: number;
    importe_minimo: number;
    aplica_a: AplicacionCupon;
    vigente_desde: string | null;
    vigente_hasta: string | null;
}

export function calcularResumenCupones(
    entradas: number,
    candy: number,
    cupones: Cupon[]
): {
    descuento: number;
    total: number;
} {
    const porcentaje = (destino: 'entradas' | 'candy'): number =>
        Math.min(
            10000,
            cupones.reduce(
                (suma, cupon) =>
                    suma +
                    (cupon.aplica_a === 'total' || cupon.aplica_a === destino
                        ? Math.round(cupon.porcentaje * 100)
                        : 0),
                0
            )
        ) / 100;

    const descontar = (importe: number, valor: number): number =>
        Number(
            (BigInt(Math.round(importe * 100)) * BigInt(Math.round(valor * 100)) + 5000n) / 10000n
        );

    const descuento =
        descontar(entradas, porcentaje('entradas')) + descontar(candy, porcentaje('candy'));

    const subtotal = Math.round(entradas * 100) + Math.round(candy * 100);

    return {
        descuento: descuento / 100,
        total: (subtotal - descuento) / 100
    };
}

export function motivoCupon(cupon: Cupon, entradas: number, candy: number): string {
    const base =
        cupon.aplica_a === 'entradas'
            ? entradas
            : cupon.aplica_a === 'candy'
              ? candy
              : entradas + candy;

    if (base <= 0) {
        return 'No hay artículos a los que aplicar este cupón.';
    }

    if (Math.round(base * 100) < Math.round(cupon.importe_minimo * 100)) {
        return 'No alcanzás el importe mínimo para este cupón.';
    }

    return '';
}

export function validarCuponesGuardados(datos: unknown): Cupon[] {
    if (datos === null || datos === undefined) {
        return [];
    }

    const lista = Array.isArray(datos) ? datos : [datos];

    const ids = new Set<string>();

    if (lista.length > 20) {
        throw new Error('La selección guardada contiene demasiados cupones.');
    }

    return lista.map((dato) => {
        if (
            typeof dato !== 'object' ||
            dato === null ||
            typeof dato.id !== 'string' ||
            !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(dato.id) ||
            ids.has(dato.id.toLowerCase()) ||
            typeof dato.codigo !== 'string' ||
            typeof dato.nombre !== 'string' ||
            !['primera_compra', 'mayores_50', 'general'].includes(dato.tipo) ||
            typeof dato.porcentaje !== 'number' ||
            !Number.isFinite(dato.porcentaje) ||
            dato.porcentaje <= 0 ||
            dato.porcentaje > 100 ||
            !['total', 'entradas', 'candy'].includes(dato.aplica_a ?? 'total')
        ) {
            throw new Error('Un cupón de la solicitud guardada no es válido.');
        }

        ids.add(dato.id.toLowerCase());

        return {
            ...dato,
            aplica_a: dato.aplica_a ?? 'total',
            acumulable: dato.acumulable === true,
            beneficio_permanente: dato.beneficio_permanente === true,
            importe_minimo: Number(dato.importe_minimo ?? 0),
            edad_minima: Number(dato.edad_minima ?? 0),
            dias_permitidos: dato.dias_permitidos ?? [],
            vigente_desde: dato.vigente_desde ?? null,
            vigente_hasta: dato.vigente_hasta ?? null
        } as Cupon;
    });
}

export function comprobarSeleccionCupones(cupones: Cupon[], entradas: number, candy: number): void {
    for (const cupon of cupones) {
        const motivo = motivoCupon(cupon, entradas, candy);

        if (motivo) {
            throw new Error(cupon.codigo + ': ' + motivo);
        }
    }
}

@Injectable({
    providedIn: 'root'
})
export class CuponesService {
    private readonly supabase = inject(SupabaseService);

    async disponibles(): Promise<Cupon[]> {
        const { data, error } = await this.supabase.cliente.rpc('cine_cupones_disponibles');

        if (error) {
            throw error;
        }

        return (data ?? []) as Cupon[];
    }

    async listarAdmin(): Promise<CuponAdmin[]> {
        const { data, error } = await this.supabase.cliente.rpc('cine_listar_cupones_admin');

        if (error) {
            throw error;
        }

        return (data ?? []) as CuponAdmin[];
    }

    async guardar(cupon: DatosCupon): Promise<string> {
        const { data, error } = await this.supabase.cliente.rpc('cine_guardar_cupon_configurado', {
            p_id: cupon.id,
            p_codigo: cupon.codigo.trim().toUpperCase(),
            p_nombre: cupon.nombre.trim(),
            p_tipo: cupon.tipo,
            p_porcentaje: cupon.porcentaje,
            p_activo: cupon.activo,
            p_beneficio_permanente: cupon.beneficio_permanente,
            p_edad_minima: cupon.edad_minima,
            p_importe_minimo: cupon.importe_minimo,
            p_aplica_a: cupon.aplica_a,
            p_vigente_desde: cupon.vigente_desde || null,
            p_vigente_hasta: cupon.vigente_hasta || null,
            p_acumulable: true,
            p_dias_permitidos: [...cupon.dias_permitidos].sort((a, b) => a - b)
        });

        if (error) {
            throw error;
        }

        return data as string;
    }
}
