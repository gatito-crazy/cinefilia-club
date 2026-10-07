import { DatePipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
    BeneficiosService,
    ProximaPelicula,
    mensajeBeneficio
} from '../../base/service/beneficios.service';
@Component({
    selector: 'app-proximamente',
    imports: [DatePipe, RouterLink],
    templateUrl: './proximamente.html',
    styleUrl: './proximamente.scss'
})
export class Proximamente implements OnInit {
    private readonly servicio = inject(BeneficiosService);
    readonly peliculas = signal<ProximaPelicula[]>([]);
    readonly cargando = signal(false);
    readonly ocupada = signal('');
    readonly error = signal('');
    readonly exito = signal('');
    ngOnInit(): void {
        void this.cargar();
    }
    async cargar(): Promise<void> {
        this.cargando.set(true);
        this.error.set('');
        try {
            this.peliculas.set(await this.servicio.proximamente());
        } catch (e) {
            this.error.set(mensajeBeneficio(e));
        } finally {
            this.cargando.set(false);
        }
    }
    async alerta(p: ProximaPelicula): Promise<void> {
        if (this.ocupada()) {
            return;
        }
        this.ocupada.set(p.id);
        this.error.set('');
        this.exito.set('');
        try {
            await this.servicio.rpc('cine_activar_alerta', {
                p_pelicula: p.id,
                p_activa: !p.alerta
            });
            this.exito.set(
                p.alerta
                    ? 'Alerta desactivada.'
                    : 'Te avisaremos por correo cuando haya entradas a la venta.'
            );
            await this.cargar();
        } catch (e) {
            this.error.set(mensajeBeneficio(e));
        } finally {
            this.ocupada.set('');
        }
    }
}
