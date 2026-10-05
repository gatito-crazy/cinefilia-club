import { DatePipe } from '@angular/common';
import {
    Component,
    effect,
    ElementRef,
    inject,
    OnDestroy,
    OnInit,
    signal,
    viewChild
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type { IScannerControls } from '@zxing/browser';
import { AuthService } from '../../base/service/auth.service';
import {
    mensajeOperacion,
    PanelService,
    TipoCodigo,
    ValidacionCodigo
} from '../../base/service/panel.service';

@Component({
    selector: 'app-empleado',
    imports: [FormsModule, DatePipe, RouterLink],
    templateUrl: './empleado.html',
    styleUrl: './empleado.scss'
})
export class Empleado implements OnInit, OnDestroy {
    private readonly panel = inject(PanelService);
    private readonly auth = inject(AuthService);
    private readonly router = inject(Router);

    private readonly video =
        viewChild<ElementRef<HTMLVideoElement>>('video');

    private controles: IScannerControls | null = null;
    private intentoCamara = 0;
    private destruido = false;

    readonly validando = signal(false);
    readonly iniciandoCamara = signal(false);
    readonly camaraActiva = signal(false);

    readonly error = signal('');
    readonly errorCamara = signal('');
    readonly avisoCamara = signal('');
    readonly resultado = signal<ValidacionCodigo | null>(null);
    readonly esAdmin = signal(false);

    tipo: TipoCodigo = 'entrada';
    codigo = '';

    constructor() {
        effect(() => {
            if (this.auth.sesionLista() && !this.auth.usuario()) {
                this.esAdmin.set(false);
                this.detenerCamara();

                void this.router.navigateByUrl('/');
            }
        });
    }

    ngOnInit(): void {
        void this.comprobarRol();
    }

    private async comprobarRol(): Promise<void> {
        try {
            const rol = await this.auth.obtenerRol();

            if (!this.destruido) {
                this.esAdmin.set(
                    rol === 'admin' && this.auth.usuario() !== null
                );
            }
        } catch (error) {
            console.error('No se pudo comprobar el rol:', error);

            if (!this.destruido) {
                this.esAdmin.set(false);
            }
        }
    }

    async validar(): Promise<void> {
        if (this.validando() || !this.codigo.trim()) {
            return;
        }

        this.detenerCamara();
        this.validando.set(true);
        this.error.set('');
        this.resultado.set(null);
        this.avisoCamara.set('');

        try {
            const resultado = await this.panel.validarCodigo(
                this.codigo,
                this.tipo
            );

            if (!this.destruido) {
                this.resultado.set(resultado);
                this.codigo = '';
            }
        } catch (error) {
            console.error('Error al validar el código:', error);

            if (!this.destruido) {
                this.error.set(mensajeOperacion(error));
            }
        } finally {
            if (!this.destruido) {
                this.validando.set(false);
            }
        }
    }

    async iniciarCamara(): Promise<void> {
        if (
            this.iniciandoCamara() ||
            this.camaraActiva() ||
            this.validando()
        ) {
            return;
        }

        if (!navigator.mediaDevices?.getUserMedia) {
            this.errorCamara.set(
                'La cámara requiere HTTPS o localhost y un navegador compatible. Podés ingresar el código a mano.'
            );
            return;
        }

        const elementoVideo = this.video()?.nativeElement;

        if (!elementoVideo) {
            return;
        }

        const intento = ++this.intentoCamara;
        let capturado = false;

        this.iniciandoCamara.set(true);
        this.errorCamara.set('');
        this.avisoCamara.set('');

        try {
            const { BrowserQRCodeReader } = await import('@zxing/browser');

            if (this.destruido || intento !== this.intentoCamara) {
                return;
            }

            const lector = new BrowserQRCodeReader();

            const controles = await lector.decodeFromConstraints(
                {
                    audio: false,
                    video: {
                        facingMode: {
                            ideal: 'environment'
                        }
                    }
                },
                elementoVideo,
                (resultado, _error, control) => {
                    if (!resultado || capturado) {
                        return;
                    }

                    if (
                        this.destruido ||
                        intento !== this.intentoCamara
                    ) {
                        control.stop();
                        return;
                    }

                    capturado = true;

                    control.stop();
                    this.detenerCamara();

                    this.codigo = resultado.getText().trim();
                    this.resultado.set(null);
                    this.error.set('');

                    this.avisoCamara.set(
                        'QR leído. Revisá el sector y presioná Validar para registrar el ingreso o la entrega.'
                    );
                }
            );

            if (
                this.destruido ||
                intento !== this.intentoCamara ||
                capturado
            ) {
                controles.stop();
            } else {
                this.controles = controles;
                this.camaraActiva.set(true);
            }
        } catch (error) {
            console.error('Error al abrir la cámara:', error);

            if (!this.destruido && intento === this.intentoCamara) {
                this.errorCamara.set(
                    'No se pudo abrir la cámara. Revisá el permiso del navegador o ingresá el código a mano.'
                );

                this.detenerCamara();
            }
        } finally {
            if (intento === this.intentoCamara) {
                this.iniciandoCamara.set(false);
            }
        }
    }

    detenerCamara(): void {
        ++this.intentoCamara;

        this.controles?.stop();
        this.controles = null;

        this.camaraActiva.set(false);
        this.iniciandoCamara.set(false);
    }

    limpiarResultado(): void {
        this.resultado.set(null);
        this.error.set('');
        this.avisoCamara.set('');
    }

    ngOnDestroy(): void {
        this.destruido = true;
        this.detenerCamara();
    }
}