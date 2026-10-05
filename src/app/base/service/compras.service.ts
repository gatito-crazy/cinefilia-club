import { inject, Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';

export interface ArticuloCompra {
    tipo: 'producto' | 'combo';
    id: string;
    cantidad: number;
}

export interface EntradaCompra {
    id: string;
    butaca_id: string;
    fila: string;
    numero: number;
    tipo: 'estandar' | 'accesible' | 'vip';
    precio: number;
    estado: string;
}

export interface CandyComprado {
    id: string;
    tipo: 'producto' | 'combo';
    nombre: string;
    cantidad: number;
    precio_unitario: number;
    subtotal: number;
    componentes: {
        producto_id: string;
        nombre: string;
        cantidad: number;
    }[];
}

export interface ComprobanteCompra {
    tipo: 'entrada' | 'candy';
    codigo: string;
    estado: string;
}

export interface Compra {
    compra_id: string;
    funcion_id: string | null;
    solo_candy?: boolean;
    estado: 'confirmada' | 'cancelada';
    modalidad: 'prueba' | 'real';
    creado_en: string;
    total_entradas: number;
    total_candy: number;
    total: number;
    funcion: {
        solo_candy?: boolean;
        pelicula_id?: string;
        pelicula_nombre?: string;
        sala_id?: string;
        sala_nombre?: string;
        inicio?: string;
        fin?: string;
        formato?: string;
        idioma?: string;
        edad_minima?: number;
        requiere_adulto?: boolean;
        aviso_edad?: string | null;
    };
    entradas: EntradaCompra[];
    candy: CandyComprado[];
    comprobantes: ComprobanteCompra[];
}

export interface HistorialCompras {
    compras: Compra[];
    total: number;
    invitado: boolean;
}

export interface ControlEdadCompra {
    invitado: boolean;
    edad_minima: number;
    edad: number | null;
    fecha_hoy: string;
    requiere_adulto: boolean;
}

@Injectable({
    providedIn: 'root'
})
export class ComprasService {
    private readonly supabase = inject(SupabaseService);

    private readonly almacenamientoInvitado =
        'cinefilia-compras-invitado';

    private readonly almacenamientoOcultas =
        'cinefilia-compras-invitado-ocultas';

    async obtener(clave: string): Promise<Compra | null> {
        const { data, error } = await this.supabase.cliente
            .rpc('cine_obtener_compra', {
                p_clave: clave
            });

        if (error) {
            throw error;
        }

        return data as Compra | null;
    }

    async confirmar(
        clave: string,
        candy: ArticuloCompra[],
        totalEsperado: number,
        fechaNacimiento: string | null = null
    ): Promise<Compra> {
        const { data, error } = await this.supabase.cliente
            .rpc('cine_confirmar_compra', {
                p_clave: clave,
                p_candy: candy,
                p_total_esperado: totalEsperado,
                p_fecha_nacimiento: fechaNacimiento
            });

        if (error) {
            throw error;
        }

        if (!data || typeof data.compra_id !== 'string') {
            throw new Error(
                'No se recibió el comprobante. Comprobá la compra antes de volver a intentarlo.'
            );
        }

        return data as Compra;
    }

    async confirmarSoloCandy(
        clave: string,
        candy: ArticuloCompra[],
        totalEsperado: number
    ): Promise<Compra> {
        const { data, error } = await this.supabase.cliente
            .rpc('cine_confirmar_compra_candy', {
                p_clave: clave,
                p_candy: candy,
                p_total_esperado: totalEsperado
            });

        if (error) {
            throw error;
        }

        if (
            !data ||
            typeof data.compra_id !== 'string' ||
            data.solo_candy !== true
        ) {
            throw new Error(
                'No se recibió el comprobante de Candy. Comprobá la compra antes de volver a intentarlo.'
            );
        }

        return data as Compra;
    }

    async consultarEdad(funcionId: string): Promise<ControlEdadCompra> {
        const { data, error } = await this.supabase.cliente
            .rpc('cine_consultar_edad_compra', {
                p_funcion: funcionId
            });

        if (error) {
            throw error;
        }

        return data as ControlEdadCompra;
    }

    async guardarAccesoInvitado(clave: string): Promise<void> {
        const { data, error } = await this.supabase.cliente
            .auth.getSession();

        if (error) {
            throw error;
        }

        if (data.session) {
            return;
        }

        const claves = this.leerAccesosInvitado();

        if (!claves.includes(clave)) {
            localStorage.setItem(
                this.almacenamientoInvitado,
                JSON.stringify([...claves, clave])
            );
        }
    }

    async listar(pagina: number): Promise<HistorialCompras> {
        if (!Number.isInteger(pagina) || pagina < 0) {
            throw new Error('La página solicitada no es válida.');
        }

        const { data: sesion, error: errorSesion } =
            await this.supabase.cliente.auth.getSession();

        if (errorSesion) {
            throw errorSesion;
        }

        if (sesion.session) {
            const { data, error } = await this.supabase.cliente
                .rpc('cine_listar_mis_compras', {
                    p_pagina: pagina
                });

            if (error) {
                throw error;
            }

            return {
                compras: data.compras as Compra[],
                total: Number(data.total),
                invitado: false
            };
        }

        const compras = await this.obtenerComprasInvitado();
        const ocultas = new Set(
            this.leerIdentificadores(this.almacenamientoOcultas)
        );

        const visibles = compras.filter(
            (compra) => !ocultas.has(compra.compra_id)
        );

        return {
            compras: visibles.slice(pagina * 10, pagina * 10 + 10),
            total: visibles.length,
            invitado: true
        };
    }

    async ocultar(compraId: string): Promise<void> {
        const { data, error } = await this.supabase.cliente
            .auth.getSession();

        if (error) {
            throw error;
        }

        if (data.session) {
            const { error: errorOperacion } =
                await this.supabase.cliente.rpc(
                    'cine_ocultar_historial_compras',
                    {
                        p_compra: compraId
                    }
                );

            if (errorOperacion) {
                throw errorOperacion;
            }

            return;
        }

        this.guardarOcultasInvitado([compraId]);
    }

    async limpiarHistorial(): Promise<void> {
        const { data, error } = await this.supabase.cliente
            .auth.getSession();

        if (error) {
            throw error;
        }

        if (data.session) {
            const { error: errorOperacion } =
                await this.supabase.cliente.rpc(
                    'cine_ocultar_historial_compras',
                    {
                        p_compra: null
                    }
                );

            if (errorOperacion) {
                throw errorOperacion;
            }

            return;
        }

        const compras = await this.obtenerComprasInvitado();

        this.guardarOcultasInvitado(
            compras.map((compra) => compra.compra_id)
        );
    }

    private async obtenerComprasInvitado(): Promise<Compra[]> {
        const claves = [...this.leerAccesosInvitado()].reverse();

        const resultados = await Promise.all(
            claves.map((clave) => this.obtener(clave))
        );

        return resultados
            .filter((compra): compra is Compra => compra !== null)
            .sort((primera, segunda) =>
                new Date(segunda.creado_en).getTime() -
                new Date(primera.creado_en).getTime()
            );
    }

    private guardarOcultasInvitado(compraIds: string[]): void {
        const actuales = this.leerIdentificadores(
            this.almacenamientoOcultas
        );

        localStorage.setItem(
            this.almacenamientoOcultas,
            JSON.stringify([...new Set([...actuales, ...compraIds])])
        );
    }

    private leerAccesosInvitado(): string[] {
        return this.leerIdentificadores(
            this.almacenamientoInvitado
        );
    }

    private leerIdentificadores(almacenamiento: string): string[] {
        const texto = localStorage.getItem(almacenamiento);

        if (!texto) {
            return [];
        }

        try {
            const datos: unknown = JSON.parse(texto);

            if (!Array.isArray(datos)) {
                return [];
            }

            return [...new Set(
                datos.filter((valor): valor is string =>
                    typeof valor === 'string' &&
                    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(valor)
                )
            )];
        } catch {
            return [];
        }
    }
}