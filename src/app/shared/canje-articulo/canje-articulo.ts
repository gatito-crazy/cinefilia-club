import { Component, computed, inject, input, output } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Recompensa } from '../../base/service/beneficios.service';
import { FidelizacionService, SeleccionCanje } from '../../base/service/fidelizacion.service';

@Component({
  selector: 'app-canje-articulo',
  imports: [DecimalPipe],
  templateUrl: './canje-articulo.html',
  host: { '[class.compacto]': 'compacto()' },
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }
      article {
        box-sizing: border-box;
        height: 100%;
        display: flex;
        flex-direction: column;
        gap: 1rem;
        padding: 1.25rem;
        border: 1px solid #d6ad52;
        border-radius: 1rem;
        background: #201b2c;
        color: #fff;
      }
      img {
        width: 100%;
        height: 180px;
        object-fit: contain;
        border-radius: 0.75rem;
      }
      h3,
      p {
        margin: 0;
        line-height: 1.5;
      }
      .etiqueta {
        color: #f5ca67;
        font-weight: 700;
      }
      .cantidad {
        margin-top: auto;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
      }
      button {
        min-width: 46px;
        min-height: 46px;
        border: 1px solid #d6ad52;
        border-radius: 0.65rem;
        background: #7a3c24;
        color: white;
        font: inherit;
        cursor: pointer;
      }
      button:disabled {
        opacity: 0.45;
        cursor: default;
      }
      @media (max-width: 600px) {
        article {
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          align-content: start;
          gap: 0.5rem 0.75rem;
          padding: 1rem;
        }
        article:has(> img) {
          grid-template-columns: 80px minmax(0, 1fr);
        }
        img {
          grid-column: 1;
          grid-row: 1 / span 3;
          width: 80px;
          height: 80px;
        }
        article:has(> img) > .etiqueta,
        article:has(> img) > h3,
        article:has(> img) > p:not(.etiqueta) {
          grid-column: 2;
        }
        h3 {
          font-size: 1.05rem;
          overflow-wrap: anywhere;
        }
        p {
          font-size: 0.9rem;
          line-height: 1.45;
        }
        article > strong,
        .cantidad {
          grid-column: 1 / -1;
        }
        .cantidad {
          margin-top: 0.25rem;
          gap: 0.5rem;
        }
      }
      :host(.compacto) {
        height: auto;
      }
      :host(.compacto) article {
        height: auto;
        display: flex;
        gap: 0.5rem;
        padding: 0.25rem 0.875rem 0.875rem;
        border: 0;
        border-radius: 0;
      }
      :host(.compacto) h3 {
        font-size: 0.95rem;
      }
      :host(.compacto) .etiqueta,
      :host(.compacto) p {
        font-size: 0.8rem;
        line-height: 1.4;
      }
      :host(.compacto) strong {
        font-size: 0.9rem;
        line-height: 1.4;
      }
      :host(.compacto) .cantidad {
        justify-content: flex-start;
        gap: 0.75rem;
      }
      button:focus-visible {
        outline: 2px solid #f5ca67;
        outline-offset: 3px;
      }
    `,
  ],
})
export class CanjeArticulo {
  readonly compacto = input(false);
  readonly fidelizacion = inject(FidelizacionService);
  readonly recompensa = input.required<Recompensa>();
  readonly cantidadNormal = input(0);
  readonly limite = input(20);
  readonly nombre = input('');
  readonly imagen = input<string | null>(null);
  readonly descripcion = input('');
  readonly elegidos = input<SeleccionCanje[]>([]);
  readonly bloqueado = input(false);
  readonly cambio = output<SeleccionCanje>();
  readonly cantidad = computed(
    () => this.elegidos().find((c) => c.recompensa === this.recompensa().id)?.cantidad ?? 0,
  );
  readonly puntosUsados = computed(() =>
    this.elegidos().reduce(
      (n, c) =>
        n +
        c.cantidad *
          Number(this.fidelizacion.recompensas().find((r) => r.id === c.recompensa)?.puntos ?? 0),
      0,
    ),
  );
  readonly puedeAgregar = computed(
    () =>
      !this.bloqueado() &&
      !this.fidelizacion.cargando() &&
      !!this.fidelizacion.auth.usuario() &&
      this.cantidad() < this.limite() &&
      this.cantidadNormal() +
        this.elegidos()
          .filter(
            (c) =>
              c.tipo === this.recompensa().tipo && c.articuloId === this.recompensa().articulo_id,
          )
          .reduce((n, c) => n + c.cantidad, 0) <
        20 &&
      this.puntosUsados() + Number(this.recompensa().puntos) <= (this.fidelizacion.puntos() ?? -1),
  );

  cambiar(delta: number): void {
    if (this.bloqueado() || (delta > 0 && !this.puedeAgregar()) || this.cantidad() + delta < 0) {
      return;
    }
    const r = this.recompensa();
    this.cambio.emit({
      recompensa: r.id,
      tipo: r.tipo,
      articuloId: r.articulo_id!,
      cantidad: this.cantidad() + delta,
    });
  }
}
