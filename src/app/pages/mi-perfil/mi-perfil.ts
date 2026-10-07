import { FidelizacionService } from '../../base/service/fidelizacion.service';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  BeneficiosService,
  Billetera,
  PeliculaVista,
  mensajeBeneficio,
} from '../../base/service/beneficios.service';
@Component({
  selector: 'app-mi-perfil',
  imports: [DatePipe, DecimalPipe, FormsModule],
  templateUrl: './mi-perfil.html',
  styleUrl: './mi-perfil.scss',
})
export class MiPerfil implements OnInit {
  private readonly fidelizacion = inject(FidelizacionService);
  private readonly servicio = inject(BeneficiosService);
  readonly seccion = signal<'beneficios' | 'peliculas'>('beneficios');
  readonly billetera = signal<Billetera | null>(null);
  readonly peliculas = signal<PeliculaVista[]>([]);
  readonly error = signal('');
  readonly exito = signal('');
  readonly cargando = signal(false);
  readonly guardando = signal('');
  codigoCompensacion = '';
  async reclamar(): Promise<void> {
    if (this.cargando() || this.guardando()) {
      return;
    }
    this.guardando.set('credito');
    this.error.set('');
    try {
      const importe = await this.servicio.rpc<number>('cine_reclamar_compensacion', {
        p_codigo: this.codigoCompensacion.trim(),
      });
      await this.cargar();
      this.exito.set('Crédito disponible: ARS ' + Number(importe).toFixed(2));
    } catch (e) {
      this.error.set(mensajeBeneficio(e));
    } finally {
      this.guardando.set('');
    }
  }
  estrellas: Record<string, number> = {};
  comentarios: Record<string, string> = {};
  ngOnInit(): void {
    void this.cargar();
  }
  async cargar(): Promise<void> {
    this.cargando.set(true);
    this.error.set('');
    try {
      const [b, p] = await Promise.all([this.servicio.billetera(), this.servicio.misPeliculas()]);
      this.billetera.set(b);
      void this.fidelizacion.actualizar();
      this.peliculas.set(p);
      for (const pelicula of p) {
        this.estrellas[pelicula.id] = pelicula.estrellas ?? 5;
        this.comentarios[pelicula.id] = pelicula.comentario ?? '';
      }
    } catch (e) {
      this.error.set(mensajeBeneficio(e));
    } finally {
      this.cargando.set(false);
    }
  }
  async calificar(p: PeliculaVista): Promise<void> {
    if (this.guardando()) {
      return;
    }
    this.guardando.set(p.id);
    this.error.set('');
    this.exito.set('');
    try {
      await this.servicio.rpc('cine_guardar_resena', {
        p_pelicula: p.id,
        p_estrellas: Number(this.estrellas[p.id]),
        p_comentario: this.comentarios[p.id],
      });
      this.exito.set('Tu reseña se guardó.');
      await this.cargar();
    } catch (e) {
      this.error.set(mensajeBeneficio(e));
    } finally {
      this.guardando.set('');
    }
  }
}
