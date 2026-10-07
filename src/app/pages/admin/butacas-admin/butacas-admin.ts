import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { Butaca, Sala, SalasService } from '../../../base/service/salas.service';

@Component({
    selector: 'app-butacas-admin',
    templateUrl: './butacas-admin.html',
    styleUrl: './butacas-admin.scss',
})
export class ButacasAdmin {
    readonly sala = input.required<Sala>();
    readonly bloqueado = input(false);
    private readonly servicio = inject(SalasService);
    readonly butacas = signal<Butaca[]>([]);
    readonly seleccionada = signal<Butaca | null>(null);
    readonly cargando = signal(false);
    readonly guardando = signal(false);
    readonly error = signal('');
    readonly exito = signal('');
    private revision = 0;
    readonly habilitadas = computed(() => this.butacas().filter((b) => b.habilitada).length);
    readonly filas = computed(() => {
        const agrupadas = new Map<string, Butaca[]>();
        for (const butaca of this.butacas()) {
            const fila = agrupadas.get(butaca.fila) ?? [];
            fila.push(butaca);
            agrupadas.set(butaca.fila, fila);
        }
        return [...agrupadas.entries()]
            .map(([nombre, butacas]) => ({
                nombre,
                orden: Math.min(...butacas.map((b) => b.orden_fila)),
                bloques: ['izquierdo', 'central', 'derecho'].map((bloque) =>
                    butacas.filter((b) => b.bloque === bloque).sort((a, b) => a.numero - b.numero),
                ),
            }))
            .sort((a, b) => a.orden - b.orden);
    });

    constructor() {
        effect(() => void this.cargar(this.sala().id));
    }

    async cargar(salaId = this.sala().id): Promise<void> {
        const revision = ++this.revision;
        this.cargando.set(true);
        this.error.set('');
        this.seleccionada.set(null);
        try {
            const butacas = await this.servicio.obtenerButacas(salaId);
            if (revision === this.revision) {
                this.butacas.set(butacas);
            }
        } catch (error) {
            if (revision === this.revision) {
                this.error.set(this.mensaje(error));
            }
        } finally {
            if (revision === this.revision) {
                this.cargando.set(false);
            }
        }
    }

    async cambiarEstado(): Promise<void> {
        const butaca = this.seleccionada();
        if (!butaca || this.guardando() || this.cargando() || this.bloqueado()) {
            return;
        }
        const habilitada = !butaca.habilitada;
        this.guardando.set(true);
        this.error.set('');
        this.exito.set('');
        try {
            await this.servicio.cambiarButaca(butaca.id, habilitada);
            this.butacas.update((butacas) =>
                butacas.map((actual) =>
                    actual.id === butaca.id ? { ...actual, habilitada } : actual,
                ),
            );
            this.seleccionada.set({ ...butaca, habilitada });
            this.exito.set(
                `Butaca ${butaca.fila} ${butaca.numero}: ${habilitada ? 'habilitada' : 'fuera de servicio'}.`,
            );
        } catch (error) {
            this.error.set(this.mensaje(error));
        } finally {
            this.guardando.set(false);
        }
    }

    private mensaje(error: unknown): string {
        return error instanceof Error
            ? error.message
            : typeof error === 'object' && error !== null && 'message' in error
              ? String(error.message)
              : 'No se pudo actualizar el mapa.';
    }
}
