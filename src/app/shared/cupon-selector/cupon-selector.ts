import { DecimalPipe } from '@angular/common';

import { Component, computed, inject, input, OnInit, output, signal } from '@angular/core';

import {
    calcularResumenCupones,
    Cupon,
    CuponesService,
    motivoCupon
} from '../../base/service/cupones.service';

@Component({
    selector: 'app-cupon-selector',
    imports: [DecimalPipe],
    templateUrl: './cupon-selector.html',
    styleUrl: './cupon-selector.scss'
})
export class CuponSelector implements OnInit {
    private readonly servicio = inject(CuponesService);

    readonly entradas = input(0);
    readonly candy = input(0);
    readonly elegidos = input<Cupon[]>([]);
    readonly bloqueado = input(false);

    readonly cambio = output<Cupon[]>();

    readonly cupones = signal<Cupon[]>([]);
    readonly cargando = signal(false);
    readonly error = signal('');
    readonly aviso = signal('');

    readonly resumen = computed(() =>
        calcularResumenCupones(this.entradas(), this.candy(), this.elegidos())
    );

    async ngOnInit(): Promise<void> {
        await this.cargar();
    }

    async cargar(): Promise<void> {
        if (this.cargando() || this.bloqueado()) {
            return;
        }

        this.cargando.set(true);
        this.error.set('');
        this.aviso.set('');

        try {
            const cupones = await this.servicio.disponibles();

            this.cupones.set(cupones);

            if (!this.bloqueado()) {
                const actuales = this.elegidos().flatMap((elegido) => {
                    const actual = cupones.find((cupon) => cupon.id === elegido.id);

                    return actual && !this.motivo(actual) ? [actual] : [];
                });

                this.cambio.emit(actuales);
            }
        } catch {
            this.error.set(
                'No pudimos consultar los cupones. Podés reintentar o continuar sin descuento.'
            );
        } finally {
            this.cargando.set(false);
        }
    }

    seleccionado(cupon: Cupon): boolean {
        return this.elegidos().some((elegido) => elegido.id === cupon.id);
    }

    motivo(cupon: Cupon): string {
        return motivoCupon(cupon, this.entradas(), this.candy());
    }

    destino(cupon: Cupon): string {
        return cupon.aplica_a === 'entradas'
            ? 'Solo entradas'
            : cupon.aplica_a === 'candy'
              ? 'Solo Candy'
              : 'Toda la compra';
    }

    seleccionar(cupon: Cupon, evento: Event): void {
        if (this.bloqueado() || this.cargando()) {
            return;
        }

        this.aviso.set('');

        const input = evento.target as HTMLInputElement;
        const marcado = input.checked;

        const restantes = this.elegidos().filter((actual) => actual.id !== cupon.id);

        if (!marcado) {
            this.cambio.emit(restantes);
            return;
        }

        const motivo = this.motivo(cupon);

        if (motivo) {
            input.checked = false;
            this.aviso.set(motivo);
            return;
        }

        if (restantes.length >= 20) {
            input.checked = false;

            this.aviso.set('Podés seleccionar hasta 20 cupones.');

            return;
        }

        this.cambio.emit([...restantes, cupon]);
    }

    quitarTodos(): void {
        if (!this.bloqueado() && !this.cargando()) {
            this.cambio.emit([]);
            this.aviso.set('');
        }
    }
}
