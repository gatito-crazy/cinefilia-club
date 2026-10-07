import { effect, inject, Injectable, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { BeneficiosService, Paquete, Recompensa } from './beneficios.service';

export interface SeleccionCanje {
    recompensa: string;
    tipo: 'entrada' | 'producto' | 'combo' | 'paquete';
    butacas?: string[];
    articuloId: string;
    cantidad: number;
}

export function validarCanje(valor: unknown): SeleccionCanje | null {
    if (!valor || typeof valor !== 'object') {
        return null;
    }
    const c = valor as Partial<SeleccionCanje>;
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (
        c.butacas !== undefined &&
        (!Array.isArray(c.butacas) ||
            c.butacas.length !== c.cantidad ||
            c.butacas.some((id) => typeof id !== 'string' || !uuid.test(id)) ||
            new Set(c.butacas).size !== c.butacas.length)
    ) {
        return null;
    }
    return typeof c.recompensa === 'string' &&
        uuid.test(c.recompensa) &&
        typeof c.articuloId === 'string' &&
        uuid.test(c.articuloId) &&
        ['entrada', 'producto', 'combo', 'paquete'].includes(c.tipo ?? '') &&
        typeof c.cantidad === 'number' &&
        Number.isInteger(c.cantidad) &&
        c.cantidad >= 1 &&
        c.cantidad <= 20
        ? (c as SeleccionCanje)
        : null;
}

export function ajustarCanje(
    canje: SeleccionCanje | null,
    tipo: 'producto' | 'combo',
    id: string,
    cantidad: number
): SeleccionCanje | null {
    if (!canje || canje.tipo !== tipo || canje.articuloId !== id) {
        return canje;
    }
    return cantidad > 0
        ? { ...canje, cantidad: Math.min(canje.cantidad, cantidad) }
        : null;
}

export function validarCanjes(valor: unknown): SeleccionCanje[] {
    if (!Array.isArray(valor)) {
        const unico = validarCanje(valor);
        return unico ? [unico] : [];
    }
    return valor
        .slice(0, 40)
        .map(validarCanje)
        .filter((c): c is SeleccionCanje => c !== null);
}

export function actualizarCanjes(
    actuales: SeleccionCanje[],
    cambio: SeleccionCanje
): SeleccionCanje[] {
    const resto = actuales.filter(
        (c) => !(c.recompensa === cambio.recompensa && c.articuloId === cambio.articuloId)
    );
    return cambio.cantidad > 0 ? [...resto, cambio] : resto;
}

export function unidadesCanje(
    canjes: SeleccionCanje[],
    tipo: string,
    id: string
): number {
    return canjes
        .filter((c) => c.tipo === tipo && c.articuloId === id)
        .reduce((n, c) => n + c.cantidad, 0);
}

@Injectable({ providedIn: 'root' })
export class FidelizacionService {
    readonly auth = inject(AuthService);
    private readonly servicio = inject(BeneficiosService);
    private readonly router = inject(Router);
    readonly puntos = signal<number | null>(null);
    readonly credito = signal<number | null>(null);
    readonly paquetes = signal<Paquete[]>([]);
    readonly recompensas = signal<Recompensa[]>([]);
    readonly cargando = signal(false);
    readonly error = signal('');
    private revision = 0;
    private cuenta: string | null = null;

    constructor() {
        effect(() => {
            const id = this.auth.usuario()?.id ?? null;
            untracked(() => void this.actualizar(id));
        });
        this.router.events.pipe(takeUntilDestroyed()).subscribe((evento) => {
            if (evento instanceof NavigationEnd) {
                void this.actualizar();
            }
        });
    }

    async actualizar(id = this.auth.usuario()?.id ?? null): Promise<void> {
        const revision = ++this.revision;
        if (this.cuenta !== id) {
            this.puntos.set(null);
            this.credito.set(null);
            this.cuenta = id;
        }
        this.cargando.set(true);
        this.error.set('');
        try {
            const [catalogo, billetera] = await Promise.all([
                this.servicio.catalogo(),
                id ? this.servicio.billetera() : Promise.resolve(null)
            ]);
            if (revision !== this.revision) {
                return;
            }
            this.recompensas.set(catalogo.recompensas);
            this.paquetes.set(catalogo.paquetes);
            this.puntos.set(billetera ? Number(billetera.puntos) : null);
            this.credito.set(billetera ? Number(billetera.credito) : null);
        } catch {
            if (revision === this.revision) {
                this.puntos.set(null);
                this.credito.set(null);
                this.error.set('No pudimos consultar tus puntos.');
            }
        } finally {
            if (revision === this.revision) {
                this.cargando.set(false);
            }
        }
    }
}
