import { Component, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { AuthService, CorreoPendienteError } from '../../base/service/auth.service';

function validarRegistro(control: AbstractControl): ValidationErrors | null {
    const errores: ValidationErrors = {};

    const password = control.get('password')?.value;
    const confirmacion = control.get('confirmarPassword')?.value;

    if (password !== confirmacion) {
        errores['passwordsDistintas'] = true;
    }

    if (control.get('color_ojos')?.value === 'otros') {
        const otroColor = String(control.get('otro_color')?.value ?? '').trim();

        const normalizado = otroColor
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase();

        const coloresIncluidos =
            /\b(marron(?:es)?|castan[oa]s?|azul(?:es)?|celestes?|verdes?)\b/;

        if (!otroColor) {
            errores['otroColorRequerido'] = true;
        } else if (
            otroColor.length > 40 ||
            !/^[\p{L}\s-]+$/u.test(otroColor)
        ) {
            errores['otroColorInvalido'] = true;
        } else if (coloresIncluidos.test(normalizado)) {
            errores['colorRepetido'] = true;
        }
    }

    return Object.keys(errores).length > 0 ? errores : null;
}

@Component({
    selector: 'app-registro',
    imports: [ReactiveFormsModule],
    templateUrl: './registro.html',
    styleUrl: './registro.scss'
})
export class Registro {
    private readonly fb = inject(FormBuilder);
    private readonly auth = inject(AuthService);
    readonly enviando = signal(false);
    readonly mensajeError = signal('');
    readonly mensajeExito = signal('');
    readonly mostrarPassword = signal(false);
    readonly mostrarConfirmacion = signal(false);
    readonly tiposSangre = [
        'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'
    ];
    readonly fechaMaxima = this.obtenerFechaActual();
    readonly correoConfirmacion = signal('');
    readonly reenviandoConfirmacion = signal(false);
    readonly mensajeReenvio = signal('');
    readonly formulario = this.fb.nonNullable.group(
        {
            nombre: ['', [Validators.required, Validators.pattern(/\S/)]],
            apellido: ['', [Validators.required, Validators.pattern(/\S/)]],
            email: ['', [Validators.required, Validators.email]],
            password: [
                '',
                [
                    Validators.required,
                    Validators.minLength(8),
                    Validators.maxLength(16),
                    Validators.pattern(
                        /^(?=.*[A-Z])(?=.*[a-z])(?=.*[0-9])(?=.*[^A-Za-z0-9\s])\S+$/
                    )
                ]
            ],
            confirmarPassword: ['', Validators.required],
            fecha_nacimiento: ['', Validators.required],
            tipo_sangre: ['', Validators.required],
            color_ojos: ['', Validators.required],
            otro_color: [''],
            dias_vacaciones: this.fb.control<number | null>(
                null,
                [
                    Validators.required,
                    Validators.min(0),
                    Validators.max(35),
                    Validators.pattern(/^\d+$/)
                ]
            )
        },
        {
            validators: validarRegistro
        }
    );

    async registrar(): Promise<void> {
        if (this.enviando() || this.reenviandoConfirmacion()) {
            return;
        }

        this.mensajeError.set('');
        this.mensajeExito.set('');
        this.correoConfirmacion.set('');
        this.mensajeReenvio.set('');
        this.formulario.markAllAsTouched();

        if (this.formulario.invalid) {
            this.mensajeError.set(
                'Revisá los campos indicados y completá todos los datos.'
            );
            return;
        }

        const datos = this.formulario.getRawValue();

        if (datos.dias_vacaciones === null) {
            this.mensajeError.set(
                'Ingresá tus días de vacaciones por año. Si no tenés, ingresá 0.'
            );
            return;
        }

        if (datos.fecha_nacimiento > this.fechaMaxima) {
            this.mensajeError.set(
                'La fecha de nacimiento no puede ser futura.'
            );
            return;
        }

        const colorOjos = datos.color_ojos === 'otros'
            ? datos.otro_color.trim()
            : datos.color_ojos;

        this.enviando.set(true);

        try {
            const resultado = await this.auth.registrar({
                nombre: datos.nombre,
                apellido: datos.apellido,
                email: datos.email,
                password: datos.password,
                fecha_nacimiento: datos.fecha_nacimiento,
                tipo_sangre: datos.tipo_sangre,
                color_ojos: colorOjos,
                dias_vacaciones: datos.dias_vacaciones
            });

            if (!resultado.session) {
                this.correoConfirmacion.set(
                    datos.email.trim().toLowerCase()
                );
            }

            this.mensajeExito.set(
                resultado.session
                    ? 'Registro completado. Tu sesión está iniciada.'
                    : 'Solicitud enviada. Revisá tu correo para confirmar la cuenta.'
            );

            this.formulario.reset();
            this.mostrarPassword.set(false);
            this.mostrarConfirmacion.set(false);
        } catch (error) {
            console.error('Error al registrar:', error);

            if (error instanceof CorreoPendienteError) {
                this.correoConfirmacion.set(
                    datos.email.trim().toLowerCase()
                );

                this.mensajeError.set(
                    'Ya tenés un registro pendiente con este correo. Confirmalo para poder iniciar sesión.'
                );
            } else {
                this.mensajeError.set(
                    error instanceof Error
                        ? error.message
                        : 'No se pudo completar el registro.'
                );
            }
        } finally {
            this.enviando.set(false);
        }
    }

    private obtenerFechaActual(): string {
        const fecha = new Date();
        const anio = fecha.getFullYear();
        const mes = String(fecha.getMonth() + 1).padStart(2, '0');
        const dia = String(fecha.getDate()).padStart(2, '0');

        return `${anio}-${mes}-${dia}`;
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
            const mensaje = await this.auth.reenviarConfirmacion(email);

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