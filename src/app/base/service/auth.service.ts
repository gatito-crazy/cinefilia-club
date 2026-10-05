import { DestroyRef, inject, Injectable, signal } from '@angular/core';
import { FunctionsHttpError, User } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';


export type RolUsuario = 'cliente' | 'empleado' | 'admin';
export class CorreoPendienteError extends Error {
    constructor() {
        super('Todavía no confirmaste tu correo. Confirmalo para poder iniciar sesión.');
        this.name = 'CorreoPendienteError';
    }
}
export interface DatosRegistro {
    nombre: string;
    apellido: string;
    email: string;
    password: string;
    fecha_nacimiento: string;
    tipo_sangre: string;
    color_ojos: string;
    dias_vacaciones: number;
}

@Injectable({
    providedIn: 'root'
})
export class AuthService {
    private readonly supabase = inject(SupabaseService);
    private readonly destroyRef = inject(DestroyRef);

    private readonly usuarioActual = signal<User | null>(null);
    private readonly sesionComprobada = signal(false);

    readonly usuario = this.usuarioActual.asReadonly();
    readonly sesionLista = this.sesionComprobada.asReadonly();

    constructor() {
        const { data } = this.supabase.cliente.auth.onAuthStateChange(
            (_evento, sesion) => {
                this.usuarioActual.set(sesion?.user ?? null);
                this.sesionComprobada.set(true);
            }
        );

        this.destroyRef.onDestroy(() => {
            data.subscription.unsubscribe();
        });
    }

    async registrar(datos: DatosRegistro) {
        if (
            !Number.isInteger(datos.dias_vacaciones) ||
            datos.dias_vacaciones < 0 ||
            datos.dias_vacaciones > 35
        ) {
            throw new Error(
                'Los días de vacaciones deben ser un número entero entre 0 y 35.'
            );
        }

        const email = datos.email.trim().toLowerCase();

        const {
            data: comprobacion,
            error: errorComprobacion
        } = await this.supabase.cliente.functions.invoke(
            'consultar-registro',
            {
                body: {
                    email
                }
            }
        );

        if (errorComprobacion) {
            if (errorComprobacion instanceof FunctionsHttpError) {
                const respuesta = await errorComprobacion.context
                    .json()
                    .catch(() => null);

                if (typeof respuesta?.error === 'string') {
                    throw new Error(respuesta.error);
                }
            }

            throw new Error(
                'No se pudo comprobar el registro. Intentá nuevamente.'
            );
        }

        if (comprobacion?.estado === 'pendiente') {
            throw new CorreoPendienteError();
        }

        if (comprobacion?.estado === 'confirmado') {
            throw new Error(
                'Ya existe una cuenta con este correo. Iniciá sesión con tu contraseña.'
            );
        }

        if (comprobacion?.estado !== 'nuevo') {
            throw new Error(
                'No se pudo comprobar el estado del registro.'
            );
        }

        const { data, error } = await this.supabase.cliente.auth.signUp({
            email,
            password: datos.password,
            options: {
                emailRedirectTo: 'https://cinefilia-club-3d7d7.web.app/',
                data: {
                    nombre: datos.nombre.trim(),
                    apellido: datos.apellido.trim(),
                    fecha_nacimiento: datos.fecha_nacimiento,
                    tipo_sangre: datos.tipo_sangre,
                    color_ojos: datos.color_ojos.trim(),
                    dias_vacaciones: datos.dias_vacaciones
                }
            }
        });

        if (error) {
            throw error;
        }

        return data;
    }

    async iniciarSesion(
        email: string,
        password: string,
        recordarme: boolean = false
    ): Promise<void> {
        this.supabase.configurarRecordatorio(recordarme);

        const { error } = await this.supabase.cliente.auth.signInWithPassword({
            email: email.trim(),
            password
        });

        if (error) {
            if (error.code === 'email_not_confirmed') {
                throw new CorreoPendienteError();
            }

            throw error;
        }
        await this.obtenerRol();
    }

    async reenviarConfirmacion(email: string): Promise<string> {
        const { data, error } = await this.supabase.cliente.functions.invoke(
            'reenviar-confirmacion',
            {
                body: {
                    email: email.trim().toLowerCase()
                }
            }
        );

        if (error) {
            if (error instanceof FunctionsHttpError) {
                const respuesta = await error.context
                    .json()
                    .catch(() => null);

                if (typeof respuesta?.error === 'string') {
                    throw new Error(respuesta.error);
                }
            }

            throw new Error(
                'No se pudo conectar con la función de reenvío.'
            );
        }

        if (
            data?.ok !== true ||
            typeof data?.mensaje !== 'string'
        ) {
            throw new Error(
                'No se pudo confirmar la solicitud de reenvío.'
            );
        }

        return data.mensaje;
    }

    async cerrarSesion(): Promise<void> {
        const { error } = await this.supabase.cliente.auth.signOut({
            scope: 'local'
        });

        if (error) {
            throw error;
        }
    }

    async obtenerRol(): Promise<RolUsuario | null> {
        const {
            data: datosSesion,
            error: errorSesion
        } = await this.supabase.cliente.auth.getSession();

        if (errorSesion) {
            throw errorSesion;
        }

        const usuario = datosSesion.session?.user;

        if (!usuario) {
            return null;
        }

        const { data: perfil, error } = await this.supabase.cliente
            .from('perfiles')
            .select('rol, activo')
            .eq('id', usuario.id)
            .maybeSingle();

        if (error) {
            throw error;
        }

        if (!perfil || !perfil.activo) {
            await this.cerrarSesion();

            throw new Error(
                'Tu cuenta está desactivada. Contactanos para reactivarla si crees que fue un error.'
            );
        }

        switch (perfil.rol) {
            case 'cliente':
            case 'empleado':
            case 'admin':
                return perfil.rol;

            default:
                throw new Error('La cuenta no tiene un rol válido.');
        }
    }
}