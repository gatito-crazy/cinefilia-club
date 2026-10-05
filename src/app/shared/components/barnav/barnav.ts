import {
    Component,
    computed,
    ElementRef,
    inject,
    signal,
    viewChild
} from '@angular/core';

import { FormsModule } from '@angular/forms';

import {
    Router,
    RouterLink,
    RouterLinkActive
} from '@angular/router';

import {
    AuthService,
    CorreoPendienteError
} from '../../../base/service/auth.service';

@Component({
    selector: 'app-barnav',
    imports: [
        RouterLink,
        RouterLinkActive,
        FormsModule
    ],
    templateUrl: './barnav.html',
    styleUrl: './barnav.scss'
})
export class Barnav {
    readonly auth = inject(AuthService);

    private readonly router = inject(Router);

    private readonly ventana =
        viewChild<ElementRef<HTMLDialogElement>>('ventana');

    readonly nombreUsuario = computed(() => {
        const datos = this.auth.usuario()?.user_metadata;

        const nombre = typeof datos?.['nombre'] === 'string'
            ? datos['nombre'].trim()
            : '';

        const apellido = typeof datos?.['apellido'] === 'string'
            ? datos['apellido'].trim()
            : '';

        return [nombre, apellido]
            .filter(Boolean)
            .join(' ') || 'Mi cuenta';
    });

    readonly enviando = signal(false);
    readonly cerrando = signal(false);
    readonly abriendoPanel = signal(false);

    readonly mensajeError = signal('');
    readonly errorSalida = signal('');

    readonly mostrarPassword = signal(false);
    readonly correoConfirmacion = signal('');
    readonly reenviandoConfirmacion = signal(false);
    readonly mensajeReenvio = signal('');

    recordarme = false;
    email = '';
    password = '';

    async abrirDesdeLogo(evento: MouseEvent): Promise<void> {
        evento.preventDefault();

        if (this.abriendoPanel()) {
            return;
        }

        this.abriendoPanel.set(true);

        try {
            const rol = await this.auth.obtenerRol();

            let destino = '/';

            if (rol === 'admin') {
                destino = '/admin';
            } else if (rol === 'empleado') {
                destino = '/empleado';
            }

            await this.router.navigateByUrl(destino);
        } catch (error) {
            console.error(
                'No se pudo comprobar el acceso desde el logo:',
                error
            );

            await this.router.navigateByUrl('/');
        } finally {
            this.abriendoPanel.set(false);
        }
    }

    abrirLogin(): void {
        this.mensajeError.set('');
        this.correoConfirmacion.set('');
        this.mensajeReenvio.set('');

        this.ventana()?.nativeElement.showModal();
    }

    cerrarLogin(): void {
        this.ventana()?.nativeElement.close();
        this.limpiarPassword();
    }

    limpiarPassword(): void {
        this.password = '';
        this.mostrarPassword.set(false);
    }

    async ingresar(): Promise<void> {
        if (
            this.enviando() ||
            this.reenviandoConfirmacion()
        ) {
            return;
        }

        this.enviando.set(true);
        this.mensajeError.set('');
        this.correoConfirmacion.set('');
        this.mensajeReenvio.set('');

        let destino: string | null = null;
        let sesionIniciada = false;

        try {
            await this.auth.iniciarSesion(
                this.email,
                this.password,
                this.recordarme
            );

            sesionIniciada = true;

            const rol = await this.auth.obtenerRol();

            if (rol === null) {
                throw new Error(
                    'No se encontró una sesión activa.'
                );
            }

            const rutaActual = this.router.url
                .split(/[?#]/)[0];

            if (rutaActual === '/registro') {
                destino = '/';
            }
        } catch (error) {
            console.error(
                'Error al ingresar:',
                error
            );

            if (error instanceof CorreoPendienteError) {
                this.correoConfirmacion.set(
                    this.email.trim().toLowerCase()
                );

                this.mensajeError.set(error.message);

                return;
            }

            const mensajeCuenta =
                'Tu cuenta está desactivada. Contactanos para ' +
                'reactivarla si crees que fue un error.';

            if (
                error instanceof Error &&
                error.message === mensajeCuenta
            ) {
                this.mensajeError.set(mensajeCuenta);
            } else {
                this.mensajeError.set(
                    sesionIniciada
                        ? 'La sesión se inició, pero no pudimos ' +
                          'comprobar el rol de tu cuenta. ' +
                          'Intentá nuevamente.'
                        : 'No se pudo ingresar. Revisá tus datos ' +
                          'y que hayas confirmado el correo.'
                );
            }

            return;
        } finally {
            this.enviando.set(false);
        }

        this.cerrarLogin();

        if (destino !== null) {
            await this.router.navigateByUrl(destino);
        }
    }

    async salir(): Promise<void> {
        if (this.cerrando()) {
            return;
        }

        this.cerrando.set(true);
        this.errorSalida.set('');

        try {
            await this.auth.cerrarSesion();

            const rutaActual = this.router.url
                .split(/[?#]/)[0];

            if (
                rutaActual === '/admin' ||
                rutaActual.startsWith('/admin/') ||
                rutaActual === '/empleado' ||
                rutaActual.startsWith('/empleado/')
            ) {
                await this.router.navigateByUrl('/');
            }
        } catch (error) {
            console.error(
                'Error al cerrar sesión:',
                error
            );

            this.errorSalida.set(
                'No se pudo completar el cierre de sesión.'
            );
        } finally {
            this.cerrando.set(false);
        }
    }

    async reenviarCorreo(): Promise<void> {
        const email = this.correoConfirmacion();

        if (
            !email ||
            this.reenviandoConfirmacion() ||
            this.enviando()
        ) {
            return;
        }

        this.reenviandoConfirmacion.set(true);
        this.mensajeReenvio.set('');

        try {
            const mensaje = await this.auth
                .reenviarConfirmacion(email);

            this.mensajeReenvio.set(mensaje);
        } catch (error) {
            this.mensajeReenvio.set(
                error instanceof Error
                    ? error.message
                    : 'No se pudo solicitar el reenvío.'
            );
        } finally {
            this.reenviandoConfirmacion.set(false);
        }
    }
}