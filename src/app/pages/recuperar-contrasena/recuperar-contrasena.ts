import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../base/service/auth.service';

@Component({
  selector: 'app-recuperar-contrasena',
  imports: [FormsModule, RouterLink],
  templateUrl: './recuperar-contrasena.html',
  styleUrl: './recuperar-contrasena.scss',
})
export class RecuperarContrasena implements OnInit {
  private readonly auth = inject(AuthService);
  readonly restablecer = inject(ActivatedRoute).snapshot.data['restablecer'] === true;
  readonly comprobando = signal(this.restablecer);
  readonly enlaceValido = signal(false);
  readonly enviando = signal(false);
  readonly error = signal('');
  readonly exito = signal('');
  readonly mostrar = signal(false);
  readonly patronPassword = '^(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])(?=.*[^A-Za-z0-9\\s])\\S+$';
  email = '';
  password = '';
  confirmarPassword = '';

  async ngOnInit(): Promise<void> {
    if (!this.restablecer) return;
    const fragmento = new URLSearchParams(window.location.hash.slice(1));
    const consulta = new URLSearchParams(window.location.search);
    try {
      if (fragmento.has('error') || consulta.has('error')) {
        throw new Error('El enlace no es válido o venció. Solicitá uno nuevo.');
      }
      await this.auth.comprobarRecuperacion();
      this.enlaceValido.set(true);
    } catch {
      this.error.set('El enlace no es válido o venció. Solicitá uno nuevo.');
    } finally {
      this.comprobando.set(false);
    }
  }

  async enviar(formulario: NgForm): Promise<void> {
    if (this.enviando() || this.comprobando() || this.exito()) return;
    formulario.form.markAllAsTouched();
    this.error.set('');
    if (formulario.invalid) {
      this.error.set(
        this.restablecer
          ? 'Revisá la contraseña y completá los dos campos.'
          : 'Ingresá un correo electrónico válido.',
      );
      return;
    }
    if (this.restablecer && (!this.enlaceValido() || this.password !== this.confirmarPassword)) {
      this.error.set(
        this.enlaceValido() ? 'Las contraseñas no coinciden.' : 'Solicitá un enlace nuevo.',
      );
      return;
    }
    this.enviando.set(true);
    try {
      if (this.restablecer) {
        await this.auth.restablecerPassword(this.password);
        this.password = '';
        this.confirmarPassword = '';
        this.mostrar.set(false);
        this.enlaceValido.set(false);
        this.exito.set('Tu contraseña fue actualizada. Ya podés usar la nueva para ingresar.');
      } else {
        await this.auth.solicitarRecuperacion(this.email);
        this.exito.set(
          'Si existe una cuenta con ese correo, recibirás un enlace para cambiar tu contraseña. Revisá también la carpeta de spam.',
        );
      }
    } catch (error) {
      const codigo =
        typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
      this.error.set(
        codigo === 'over_email_send_rate_limit' || codigo === 'over_request_rate_limit'
          ? 'Se hicieron demasiadas solicitudes. Esperá unos minutos y volvé a intentar.'
          : codigo === 'same_password'
            ? 'Elegí una contraseña distinta de la anterior.'
            : this.restablecer
              ? 'No se pudo cambiar la contraseña. Revisá los requisitos o solicitá un enlace nuevo.'
              : 'No se pudo enviar el correo. Esperá unos minutos y volvé a intentar.',
      );
    } finally {
      this.enviando.set(false);
    }
  }
}
