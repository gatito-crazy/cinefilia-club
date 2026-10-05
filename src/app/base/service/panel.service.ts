import { inject, Injectable } from '@angular/core';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';

export type TipoCodigo = 'entrada' | 'candy';
export type RolGestionable = 'cliente' | 'empleado';

export interface UsuarioPanel {
    id: string;
    nombre: string | null;
    apellido: string | null;
    rol: 'cliente' | 'empleado' | 'admin';
    activo: boolean;
    creado_en: string | null;
}

export interface PaginaUsuarios {
    usuarios: UsuarioPanel[];
    total: number;
}

export interface CodigoPrueba {
    codigo: string;
    tipo: TipoCodigo;
    descripcion: string;
    vence_en: string;
}

export interface EntradaValidada {
    fila: string;
    numero: number;
    tipo: 'estandar' | 'accesible' | 'vip';
}

export interface CandyValidado {
    id: string;
    tipo: 'producto' | 'combo';
    nombre: string;
    cantidad: number;
    componentes: {
        producto_id: string;
        nombre: string;
        cantidad: number;
    }[];
}

export interface ValidacionCodigo {
    origen: 'prueba' | 'compra';
    tipo: TipoCodigo;
    descripcion: string;
    validado_en: string;

    compra_id?: string;
    modalidad?: 'prueba' | 'real';

    funcion?: {
        pelicula_nombre: string;
        sala_nombre: string;
        inicio: string;
        fin: string;
        formato: string;
        idioma: string;
    };

    entradas?: EntradaValidada[];
    candy?: CandyValidado[];
}

export interface ActividadPanel {
    id: number;
    actor_nombre: string;
    accion: string;
    detalle: Record<string, unknown>;
    creado_en: string;
}

export function mensajeOperacion(error: unknown): string {
    if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        'message' in error
    ) {
        if (error.code === 'P0001' || error.code === '42501') {
            return String(error.message);
        }
    }

    return 'No se pudo completar la operación. Revisá la conexión y la instalación del SQL.';
}

@Injectable({
    providedIn: 'root'
})
export class PanelService {
    private readonly supabase = inject(SupabaseService);

    async listarUsuarios(
        busqueda: string,
        pagina: number
    ): Promise<PaginaUsuarios> {
        const { data, error } = await this.supabase.cliente.rpc(
            'cine_listar_usuarios',
            {
                p_busqueda: busqueda.trim(),
                p_pagina: pagina
            }
        );

        if (error) {
            throw error;
        }

        return data as PaginaUsuarios;
    }

    async cambiarRol(
        usuario: string,
        rol: RolGestionable
    ): Promise<void> {
        const { error } = await this.supabase.cliente.rpc(
            'cine_cambiar_rol',
            {
                p_usuario: usuario,
                p_rol: rol
            }
        );

        if (error) {
            throw error;
        }
    }

    async emitirCodigo(
        tipo: TipoCodigo,
        descripcion: string
    ): Promise<CodigoPrueba> {
        const { data, error } = await this.supabase.cliente.rpc(
            'cine_emitir_codigo_prueba',
            {
                p_tipo: tipo,
                p_descripcion: descripcion.trim()
            }
        );

        if (error) {
            throw error;
        }

        return data as CodigoPrueba;
    }

    async validarCodigo(
        codigo: string,
        tipo: TipoCodigo
    ): Promise<ValidacionCodigo> {
        const { data, error } = await this.supabase.cliente.rpc(
            'cine_validar_codigo',
            {
                p_codigo: codigo.trim(),
                p_tipo: tipo
            }
        );

        if (error) {
            throw error;
        }

        return data as ValidacionCodigo;
    }

    async listarActividad(): Promise<ActividadPanel[]> {
        const { data, error } = await this.supabase.cliente.rpc(
            'cine_listar_actividad'
        );

        if (error) {
            throw error;
        }

        return data as ActividadPanel[];
    }

    async cambiarEstado(
        usuarioId: string,
        activo: boolean
    ): Promise<void> {
        const { error } = await this.supabase.cliente.rpc(
            'cine_gestionar_cuenta',
            {
                p_usuario: usuarioId,
                p_accion: activo ? 'activar' : 'desactivar'
            }
        );

        if (error) {
            throw error;
        }
    }

    async eliminarUsuario(usuarioId: string): Promise<void> {
        const { data, error } = await this.supabase.cliente.functions.invoke(
            'administrar-usuarios',
            {
                body: {
                    usuarioId,
                    confirmacion: 'ELIMINAR'
                }
            }
        );

        if (error) {
            if (error instanceof FunctionsHttpError) {
                const respuesta = await error.context
                    .json()
                    .catch(() => null);

                if (typeof respuesta?.error === 'string') {
                    throw {
                        code: 'P0001',
                        message: respuesta.error
                    };
                }
            }

            throw error;
        }

        if (data?.ok !== true) {
            throw {
                code: 'P0001',
                message: 'No se pudo confirmar la eliminación.'
            };
        }
    }
}