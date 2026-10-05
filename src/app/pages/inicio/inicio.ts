import {
    Component,
    DestroyRef,
    inject,
    OnInit,
    signal
} from '@angular/core';

import { RouterLink } from '@angular/router';

import {
    InicioService,
    PeliculaDestacada
} from '../../base/service/inicio.service';

import {
    CandyDestacados
} from '../../shared/components/candy-destacados/candy-destacados';

@Component({
    imports: [RouterLink, CandyDestacados],
    selector: 'app-inicio',
    styleUrl: './inicio.scss',
    templateUrl: './inicio.html'
})
export class Inicio implements OnInit {
    private readonly inicio = inject(InicioService);
    private readonly destroyRef = inject(DestroyRef);

    readonly peliculas = signal<PeliculaDestacada[]>([]);
    readonly cargando = signal(true);
    readonly error = signal('');
    readonly imagenesFallidas = signal<string[]>([]);

    async ngOnInit(): Promise<void> {
        await this.cargarRanking();
    }

    async cargarRanking(): Promise<void> {
        this.cargando.set(true);
        this.error.set('');

        try {
            const peliculas = await this.inicio
                .obtenerMasVendidas();

            if (!this.destroyRef.destroyed) {
                this.peliculas.set(peliculas);
            }
        } catch (error) {
            console.error(
                'No se pudo cargar el ranking:',
                error
            );

            if (!this.destroyRef.destroyed) {
                this.error.set(
                    'No pudimos cargar las películas más vendidas. ' +
                    'Podés seguir explorando la cartelera.'
                );
            }
        } finally {
            if (!this.destroyRef.destroyed) {
                this.cargando.set(false);
            }
        }
    }

    marcarImagenFallida(id: string): void {
        this.imagenesFallidas.update((ids) => {
            return ids.includes(id)
                ? ids
                : [...ids, id];
        });
    }
}