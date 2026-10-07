import { inject, Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';

export type FormatoFuncion = '2D' | '3D' | '4D' | '5D';

export type IdiomaFuncion = 'castellano' | 'subtitulada';

export interface Funcion {
    id: string;
    pelicula_id: string;
    sala_id: string;
    inicio: string;
    fin: string;
    duracion_minutos: number;
    formato: FormatoFuncion;
    idioma: IdiomaFuncion;
    precio_estandar: number;
    precio_accesible: number;
    precio_vip: number;
    activa: boolean;
    cancelada: boolean;
    archivada: boolean;
    creado_en: string;
}

export interface DatosFuncion {
    pelicula_id: string;
    sala_id: string;
    inicio: string;
    formato: FormatoFuncion;
    idioma: IdiomaFuncion;
    activa: boolean;
}

@Injectable({
    providedIn: 'root'
})
export class FuncionesService {
    private readonly supabase = inject(SupabaseService);

    async obtenerTodas(): Promise<Funcion[]> {
        const { data, error } = await this.supabase.cliente
            .from('funciones')
            .select(`
                id,
                pelicula_id,
                sala_id,
                inicio,
                fin,
                duracion_minutos,
                formato,
                idioma,
                precio_estandar,
                precio_accesible,
                precio_vip,
                activa,
                cancelada,
                archivada,
                creado_en
            `)
            .order('inicio', { ascending: false })
            .overrideTypes<Funcion[], { merge: false }>();

        if (error) {
            throw error;
        }

        return data ?? [];
    }

    async guardar(
        funcionId: string | null,
        datos: DatosFuncion
    ): Promise<Funcion> {
        this.validar(datos, funcionId !== null);

        const inicio = new Date(datos.inicio).toISOString();

        if (funcionId === null) {
            const { data, error } = await this.supabase.cliente
                .rpc('cine_crear_funcion_automatica', {
                    p_pelicula: datos.pelicula_id,
                    p_inicio: inicio,
                    p_formato: datos.formato,
                    p_idioma: datos.idioma,
                    p_activa: datos.activa
                })
                .single<Funcion>();

            if (error) {
                throw error;
            }

            return data;
        }

        const { data, error } = await this.supabase.cliente
            .from('funciones')
            .update({
                pelicula_id: datos.pelicula_id,
                sala_id: datos.sala_id,
                inicio,
                formato: datos.formato,
                idioma: datos.idioma,
                activa: datos.activa
            })
            .eq('id', funcionId)
            .select()
            .single<Funcion>();

        if (error) {
            throw error;
        }

        return data;
    }

    async cambiarEstado(
        funcionId: string,
        activa: boolean
    ): Promise<void> {
        const { error } = await this.supabase.cliente
            .from('funciones')
            .update({ activa })
            .eq('id', funcionId)
            .select('id')
            .single();

        if (error) {
            throw error;
        }
    }

    async eliminar(funcionId: string): Promise<void> {
        const { error } = await this.supabase.cliente
            .rpc('cine_cancelar_funcion_credito', {
                p_funcion: funcionId
            });

        if (error) {
            throw error;
        }
    }

    async archivar(
        funcionId: string,
        archivada: boolean
    ): Promise<Funcion> {
        const { data, error } = await this.supabase.cliente
            .rpc('cine_archivar_funcion', {
                p_funcion: funcionId,
                p_archivada: archivada
            });

        if (error) {
            throw error;
        }

        if (!data) {
            throw new Error(
                'No se recibió la función actualizada.'
            );
        }

        return data as Funcion;
    }

    private validar(
        datos: DatosFuncion,
        esEdicion: boolean
    ): void {
        if (!datos.pelicula_id) {
            throw new Error('Seleccioná una película.');
        }

        if (esEdicion && !datos.sala_id) {
            throw new Error('Seleccioná una sala.');
        }

        const fecha = new Date(datos.inicio);

        if (
            !datos.inicio ||
            Number.isNaN(fecha.getTime()) ||
            fecha.getTime() <= Date.now()
        ) {
            throw new Error(
                'Seleccioná una fecha y hora futuras para la función.'
            );
        }

        if (!['2D', '3D', '4D', '5D'].includes(datos.formato)) {
            throw new Error('Seleccioná un formato válido.');
        }

        if (!['castellano', 'subtitulada'].includes(datos.idioma)) {
            throw new Error('Seleccioná un idioma válido.');
        }
    }
}