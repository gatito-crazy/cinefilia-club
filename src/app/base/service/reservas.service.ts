import { SeleccionCanje, validarCanjes } from './fidelizacion.service';
import { inject, Injectable } from '@angular/core';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';

export interface UbicacionReservada {
    butaca_id: string;
    fila: string;
    numero: number;
    tipo: 'estandar' | 'accesible' | 'vip';
    precio: number;
}

export interface Reserva {
    reserva_id: string;
    funcion_id: string;
    estado: 'reservada' | 'vencida' | 'cancelada' | 'confirmada';
    vence_en: string;
    servidor_ahora: string;
    total: number;
    butacas: UbicacionReservada[];
}

export interface OcupacionButaca {
    butaca_id: string;
    reserva_id: string | null;
    estado: 'libre' | 'reservada' | 'vendida';
    vence_en: string | null;
}

export interface EstadoOcupacion {
    servidor_ahora: string;
    ocupacion: OcupacionButaca[];
}

export interface SolicitudReserva {
    canjes?: SeleccionCanje[];
    clave: string;
    butacas: string[];
    confirmada: boolean;
}

@Injectable({
    providedIn: 'root'
})
export class ReservasService {
    private readonly supabase = inject(SupabaseService);

    async obtenerOcupacion(funcionId: string): Promise<EstadoOcupacion> {
        const { data, error } = await this.supabase.cliente.rpc(
            'cine_obtener_ocupacion',
            {
                p_funcion: funcionId
            }
        );

        if (error) {
            throw error;
        }

        return data as EstadoOcupacion;
    }

    async reservar(funcionId: string, solicitud: SolicitudReserva): Promise<Reserva> {
        const { data, error } = await this.supabase.cliente.rpc('cine_reservar_butacas', {
            p_funcion: funcionId,
            p_butacas: solicitud.butacas,
            p_clave: solicitud.clave
        });

        if (error) {
            throw error;
        }

        return {
            ...data,
            funcion_id: funcionId,
            estado: 'reservada'
        } as Reserva;
    }

    async obtenerReserva(clave: string): Promise<Reserva | null> {
        const { data, error } = await this.supabase.cliente.rpc('cine_obtener_reserva', {
            p_clave: clave
        });

        if (error) {
            throw error;
        }

        return data as Reserva | null;
    }

    async cancelar(clave: string): Promise<void> {
        const { error } = await this.supabase.cliente.rpc('cine_cancelar_reserva', {
            p_clave: clave
        });

        if (error) {
            throw error;
        }
    }

    escuchar(
        funcionId: string,
        alCambiar: () => void,
        alConectar: (conectado: boolean) => void
    ): RealtimeChannel {
        return this.supabase.cliente
            .channel(`butacas-${funcionId}-${crypto.randomUUID()}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'cine_ocupacion_butacas',
                    filter: `funcion_id=eq.${funcionId}`
                },
                () => alCambiar()
            )
            .subscribe((estado) => {
                alConectar(estado === 'SUBSCRIBED');

                if (estado === 'SUBSCRIBED') {
                    alCambiar();
                }
            });
    }

    async dejarDeEscuchar(canal: RealtimeChannel): Promise<void> {
        await this.supabase.cliente.removeChannel(canal);
    }

    async obtenerClaveAlmacenamiento(funcionId: string): Promise<string> {
        const { data, error } = await this.supabase.cliente.auth.getSession();

        if (error) {
            throw error;
        }

        const usuario = data.session?.user.id ?? 'invitado';

        return `cinefilia-reserva-${usuario}-${funcionId}`;
    }

    leerSolicitud(claveAlmacenamiento: string): SolicitudReserva | null {
        const guardada = sessionStorage.getItem(claveAlmacenamiento);

        if (!guardada) {
            return null;
        }

        try {
            const datos = JSON.parse(guardada) as SolicitudReserva;

            if (
                typeof datos.clave !== 'string' ||
                !Array.isArray(datos.butacas) ||
                !datos.butacas.every((id) => typeof id === 'string')
            ) {
                throw new Error('Solicitud inválida.');
            }

            return {
                clave: datos.clave,
                butacas: datos.butacas,
                confirmada: datos.confirmada === true,
                canjes: validarCanjes(datos.canjes)
            };
        } catch {
            sessionStorage.removeItem(claveAlmacenamiento);
            return null;
        }
    }

    guardarSolicitud(claveAlmacenamiento: string, solicitud: SolicitudReserva): void {
        sessionStorage.setItem(claveAlmacenamiento, JSON.stringify(solicitud));
    }

    quitarSolicitud(claveAlmacenamiento: string): void {
        sessionStorage.removeItem(claveAlmacenamiento);
    }
}
