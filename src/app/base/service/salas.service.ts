import { inject, Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';

export type TipoButaca = 'estandar' | 'accesible' | 'vip';

export type BloqueButaca = 'izquierdo' | 'central' | 'derecho';

export interface Sala {
    id: string;
    nombre: string;
    filas: number;
    butacas_por_fila: number;
    activa: boolean;
    creado_en: string;
}

export interface DatosSala {
    nombre: string;
    activa: boolean;
}

export interface Butaca {
    id: string;
    sala_id: string;
    fila: string;
    numero: number;
    bloque: BloqueButaca;
    tipo: TipoButaca;
    orden_fila: number;
    habilitada: boolean;
}

@Injectable({
    providedIn: 'root',
})
export class SalasService {
    private readonly supabase = inject(SupabaseService);

    private readonly comparadorNombres = new Intl.Collator('es', {
        numeric: true,
        sensitivity: 'base',
    });

    async obtenerTodas(): Promise<Sala[]> {
        const { data, error } = await this.supabase.cliente
            .from('salas')
            .select(
                `
                id,
                nombre,
                filas,
                butacas_por_fila,
                activa,
                creado_en
            `,
            )
            .overrideTypes<Sala[], { merge: false }>();

        if (error) {
            throw error;
        }

        return this.ordenarSalas(data ?? []);
    }

    async obtenerActivas(): Promise<Sala[]> {
        const { data, error } = await this.supabase.cliente
            .from('salas')
            .select(
                `
                id,
                nombre,
                filas,
                butacas_por_fila,
                activa,
                creado_en
            `,
            )
            .eq('activa', true)
            .overrideTypes<Sala[], { merge: false }>();

        if (error) {
            throw error;
        }

        return this.ordenarSalas(data ?? []);
    }

    async obtenerButacas(salaId: string): Promise<Butaca[]> {
        const { data, error } = await this.supabase.cliente
            .from('butacas')
            .select(
                `
                id,
                sala_id,
                fila,
                numero,
                bloque,
                tipo,
                orden_fila,
                habilitada
            `,
            )
            .eq('sala_id', salaId)
            .order('orden_fila')
            .order('numero')
            .overrideTypes<Butaca[], { merge: false }>();

        if (error) {
            throw error;
        }

        return data ?? [];
    }

    async guardar(salaId: string | null, datos: DatosSala): Promise<Sala> {
        const nombre = datos.nombre.trim();

        if (nombre.length === 0 || nombre.length > 80) {
            throw new Error('El nombre de la sala debe tener entre 1 y 80 caracteres.');
        }

        const valores: DatosSala = {
            nombre,
            activa: datos.activa,
        };

        if (salaId === null) {
            const { data, error } = await this.supabase.cliente
                .from('salas')
                .insert(valores)
                .select(
                    `
                    id,
                    nombre,
                    filas,
                    butacas_por_fila,
                    activa,
                    creado_en
                `,
                )
                .single<Sala>();

            if (error) {
                throw error;
            }

            return data;
        }

        const { data, error } = await this.supabase.cliente
            .from('salas')
            .update(valores)
            .eq('id', salaId)
            .select(
                `
                id,
                nombre,
                filas,
                butacas_por_fila,
                activa,
                creado_en
            `,
            )
            .single<Sala>();

        if (error) {
            throw error;
        }

        return data;
    }

    async cambiarEstado(salaId: string, activa: boolean): Promise<void> {
        const { error } = await this.supabase.cliente
            .from('salas')
            .update({ activa })
            .eq('id', salaId)
            .select('id')
            .single();

        if (error) {
            throw error;
        }
    }

    async eliminar(salaId: string): Promise<void> {
        const { error } = await this.supabase.cliente.rpc('cine_eliminar_sala', {
            p_sala: salaId,
        });

        if (error) {
            throw error;
        }
    }

    async normalizarDistribucion(salaId: string): Promise<void> {
        const { error } = await this.supabase.cliente.rpc('cine_normalizar_distribucion_admin', {
            p_sala: salaId,
        });
        if (error) {
            throw error;
        }
    }

    async cambiarButaca(butacaId: string, habilitada: boolean): Promise<void> {
        const { error } = await this.supabase.cliente.rpc('cine_cambiar_butaca_admin', {
            p_butaca: butacaId,
            p_habilitada: habilitada,
        });
        if (error) {
            throw error;
        }
    }

    private ordenarSalas(salas: Sala[]): Sala[] {
        return [...salas].sort((primera, segunda) =>
            this.comparadorNombres.compare(primera.nombre, segunda.nombre),
        );
    }
}
