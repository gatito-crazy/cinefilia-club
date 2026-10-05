import { DatePipe, DecimalPipe } from '@angular/common';
import {
    Component,
    inject,
    OnDestroy,
    OnInit,
    signal
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
    Compra,
    ComprasService
} from '../../base/service/compras.service';

interface QrCompra {
    tipo: 'entrada' | 'candy';
    codigo: string;
    estado: string;
    imagen: string;
}

@Component({
    selector: 'app-mis-compras',
    imports: [DatePipe, DecimalPipe, RouterLink],
    templateUrl: './mis-compras.html',
    styleUrl: './mis-compras.scss'
})
export class MisCompras implements OnInit, OnDestroy {
    private readonly comprasService = inject(ComprasService);

    private destruido = false;
    private consultaQr = 0;

    readonly compras = signal<Compra[]>([]);
    readonly total = signal(0);
    readonly pagina = signal(0);
    readonly invitado = signal(false);
    readonly cargando = signal(false);
    readonly modificando = signal(false);
    readonly error = signal('');
    readonly exito = signal('');

    readonly seleccionada = signal<Compra | null>(null);
    readonly comprobantes = signal<QrCompra[]>([]);
    readonly dibujando = signal(false);
    readonly errorQr = signal('');

    ngOnInit(): void {
        void this.cargar(0);
    }

    ngOnDestroy(): void {
        this.destruido = true;
        ++this.consultaQr;
    }

    async cargar(pagina: number): Promise<void> {
        if (this.cargando()) {
            return;
        }

        this.cargando.set(true);
        this.error.set('');

        try {
            let resultado = await this.comprasService.listar(pagina);

            if (this.destruido) {
                return;
            }

            const ultimaPagina = Math.max(
                0,
                Math.ceil(resultado.total / 10) - 1
            );

            const paginaDestino = Math.min(pagina, ultimaPagina);

            if (paginaDestino !== pagina) {
                resultado = await this.comprasService.listar(
                    paginaDestino
                );
            }

            if (this.destruido) {
                return;
            }

            this.compras.set(resultado.compras);
            this.total.set(resultado.total);
            this.pagina.set(paginaDestino);
            this.invitado.set(resultado.invitado);
            this.cerrarDetalle();
        } catch (error) {
            if (!this.destruido) {
                this.error.set(this.obtenerMensaje(error));
            }
        } finally {
            if (!this.destruido) {
                this.cargando.set(false);
            }
        }
    }

    async ocultar(compra: Compra): Promise<void> {
        if (this.cargando() || this.modificando()) {
            return;
        }

        const confirmado = window.confirm(
            '¿Querés ocultar esta compra de tu historial?\n\n' +
            'Esto no cancela las entradas ni el Candy, no genera ' +
            'un reintegro y sus QR siguen siendo válidos.\n\n' +
            'Descargá los QR antes de continuar si todavía los necesitás.'
        );

        if (!confirmado) {
            return;
        }

        this.modificando.set(true);
        this.error.set('');
        this.exito.set('');

        try {
            await this.comprasService.ocultar(compra.compra_id);

            if (this.destruido) {
                return;
            }

            await this.cargar(this.pagina());

            if (!this.destruido) {
                this.exito.set('La compra se ocultó del historial.');
            }
        } catch (error) {
            if (!this.destruido) {
                this.error.set(this.obtenerMensaje(error));
            }
        } finally {
            if (!this.destruido) {
                this.modificando.set(false);
            }
        }
    }

    async limpiarHistorial(): Promise<void> {
        if (
            this.cargando() ||
            this.modificando() ||
            this.total() === 0
        ) {
            return;
        }

        const confirmado = window.confirm(
            '¿Querés ocultar todas las compras de tu historial?\n\n' +
            'Esto no cancela tus compras ni genera un reintegro. ' +
            'Las entradas y los QR siguen siendo válidos.\n\n' +
            'Descargá los QR que necesites antes de continuar.'
        );

        if (!confirmado) {
            return;
        }

        this.modificando.set(true);
        this.error.set('');
        this.exito.set('');

        try {
            await this.comprasService.limpiarHistorial();

            if (this.destruido) {
                return;
            }

            await this.cargar(0);

            if (!this.destruido) {
                this.exito.set('Se limpió el historial de compras.');
            }
        } catch (error) {
            if (!this.destruido) {
                this.error.set(this.obtenerMensaje(error));
            }
        } finally {
            if (!this.destruido) {
                this.modificando.set(false);
            }
        }
    }

    async ver(compra: Compra): Promise<void> {
        if (this.cargando() || this.modificando()) {
            return;
        }

        const consulta = ++this.consultaQr;

        this.seleccionada.set(compra);
        this.comprobantes.set([]);
        this.errorQr.set('');
        this.dibujando.set(true);

        requestAnimationFrame(() => {
            if (this.destruido || consulta !== this.consultaQr) {
                return;
            }

            const reducirMovimiento = window.matchMedia(
                '(prefers-reduced-motion: reduce)'
            ).matches;

            document.getElementById('detalle-compra')?.scrollIntoView({
                behavior: reducirMovimiento ? 'instant' : 'smooth',
                block: 'start'
            });
        });

        try {
            const modulo = await import('qrcode');
            const QRCode = modulo.default ?? modulo;

            const comprobantes = await Promise.all(
                compra.comprobantes.map(async (qr) => ({
                    ...qr,
                    imagen: await QRCode.toDataURL(qr.codigo, {
                        width: 280,
                        margin: 2,
                        errorCorrectionLevel: 'M'
                    })
                }))
            );

            if (!this.destruido && consulta === this.consultaQr) {
                this.comprobantes.set(comprobantes);
            }
        } catch (error) {
            console.error('Error al dibujar comprobantes:', error);

            if (!this.destruido && consulta === this.consultaQr) {
                this.errorQr.set(
                    'No pudimos dibujar los QR. Volvé a intentarlo.'
                );
            }
        } finally {
            if (!this.destruido && consulta === this.consultaQr) {
                this.dibujando.set(false);
            }
        }
    }

    cerrarDetalle(): void {
        ++this.consultaQr;
        this.seleccionada.set(null);
        this.comprobantes.set([]);
        this.errorQr.set('');
        this.dibujando.set(false);
    }

    private obtenerMensaje(error: unknown): string {
        if (
            typeof error === 'object' &&
            error !== null &&
            'message' in error &&
            typeof error.message === 'string'
        ) {
            return error.message;
        }

        return 'No se pudo completar la operación del historial.';
    }
}