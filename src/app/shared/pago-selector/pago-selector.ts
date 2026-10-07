import { UbicacionReservada } from '../../base/service/reservas.service';
import { AuthService } from '../../base/service/auth.service';
import { SeleccionCanje } from '../../base/service/fidelizacion.service';
import { DecimalPipe } from '@angular/common';
import { Component, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ArticuloCompra } from '../../base/service/compras.service';
import { Cupon } from '../../base/service/cupones.service';
import {
  BeneficiosService,
  Cotizacion,
  OpcionesCompra,
  opcionesVacias,
  PagoElegido,
  Paquete,
  Recompensa,
  mensajeBeneficio,
} from '../../base/service/beneficios.service';
@Component({
  selector: 'app-pago-selector',
  imports: [DecimalPipe, FormsModule],
  templateUrl: './pago-selector.html',
  styleUrl: './pago-selector.scss',
})
export class PagoSelector {
  private readonly servicio = inject(BeneficiosService);
  readonly auth = inject(AuthService);
  readonly clave = input.required<string>();
  readonly candy = input<ArticuloCompra[]>([]);
  readonly cupones = input<Cupon[]>([]);
  readonly soloCandy = input(false);
  readonly bloqueado = input(false);
  readonly guardado = input<PagoElegido | null>(null);
  readonly canjes = input<SeleccionCanje[]>([]);
  readonly paquete = input<string | null>(null);
  readonly cantidadPaquete = input(1);
  readonly butacas = input<UbicacionReservada[]>([]);
  readonly quitarCanje = output<void>();
  readonly cambio = output<PagoElegido | null>();
  readonly paquetes = signal<Paquete[]>([]);
  readonly recompensas = signal<Recompensa[]>([]);
  readonly saldo = signal({ puntos: 0, credito: 0 });
  readonly cotizacion = signal<Cotizacion | null>(null);
  readonly cargando = signal(false);
  readonly error = signal('');
  opciones: OpcionesCompra = opcionesVacias();
  private revision = 0;
  constructor() {
    void this.catalogo();
    effect(() => {
      const clave = this.clave();
      const candy = this.candy();
      const cupones = this.cupones();
      const solo = this.soloCandy();
      const guardado = this.guardado();
      const canjes = this.canjes();
      const paquete = this.paquete();
      const cantidadPaquete = this.cantidadPaquete();
      const usuario = this.auth.usuario();
      if (guardado) {
        this.opciones = { ...guardado.opciones };
        return;
      }
      if (usuario) {
        this.opciones.email = usuario.email ?? '';
      }
      this.opciones.paquete = paquete;
      // Sin paquete comprado, la API espera la cantidad predeterminada de 1.
      this.opciones.cantidad_paquete = paquete ? cantidadPaquete : 1;
      this.opciones.recompensa = null;
      this.opciones.cantidad_canje = 1;
      this.opciones.canjes = canjes.map((c) => ({
        recompensa: c.recompensa,
        cantidad: c.cantidad,
        butacas: c.butacas,
      }));

      if (clave && !this.bloqueado()) {
        void this.cotizar(clave, candy, cupones, solo);
      }
    });
  }
  private async catalogo(): Promise<void> {
    try {
      const c = await this.servicio.catalogo();
      this.paquetes.set(c.paquetes);
      this.recompensas.set(c.recompensas);
      if (await this.servicio.tieneSesion()) {
        const b = await this.servicio.billetera();
        this.saldo.set({ puntos: Number(b.puntos), credito: Number(b.credito) });
      }
    } catch (e) {
      this.error.set(mensajeBeneficio(e));
    }
  }
  descripcionButaca(id: string): string {
    const butaca = this.butacas().find((b) => b.butaca_id === id);
    return butaca ? `${butaca.fila} · ${butaca.numero}` : 'Entrada reservada';
  }

  tienePaqueteCanje(): boolean {
    return this.canjes().some((c) => c.tipo === 'paquete');
  }

  async cambiarMedio(): Promise<void> {
    if (this.bloqueado() || this.guardado()) return;
    const cotizacion = this.cotizacion();
    if (this.opciones.medio === 'credito' && cotizacion) {
      this.opciones.credito =
        Math.round(Math.min(this.saldo().credito, cotizacion.total) * 100) / 100;
    }
    await this.actualizar();
  }

  async usarCreditoDisponible(): Promise<void> {
    const cotizacion = this.cotizacion();
    if (
      !cotizacion ||
      this.cargando() ||
      this.bloqueado() ||
      this.guardado() ||
      !this.auth.usuario()
    )
      return;
    this.opciones.credito =
      Math.round(Math.min(this.saldo().credito, cotizacion.total) * 100) / 100;
    if (this.opciones.credito === cotizacion.total) {
      this.opciones.medio = 'credito';
    } else if (this.opciones.medio === 'credito') {
      this.opciones.medio = 'tarjeta';
    }
    await this.actualizar();
  }

  async actualizar(): Promise<void> {
    if (this.bloqueado() || this.guardado()) return;
    await this.cotizar(this.clave(), this.candy(), this.cupones(), this.soloCandy());
  }
  private async cotizar(
    clave: string,
    candy: ArticuloCompra[],
    cupones: Cupon[],
    solo: boolean,
  ): Promise<void> {
    const revision = ++this.revision;
    this.cargando.set(true);
    this.cambio.emit(null);
    this.error.set('');
    const opciones = {
      ...this.opciones,
      email: this.auth.usuario()?.email ?? this.opciones.email,
    };
    try {
      const c = await this.servicio.cotizar(clave, candy, cupones, opciones, solo);
      if (revision === this.revision) {
        this.cotizacion.set(c);
        this.cambio.emit({ opciones, huella: c.huella });
      }
    } catch (e) {
      if (revision === this.revision) {
        this.cotizacion.set(null);
        this.error.set(mensajeBeneficio(e));
      }
    } finally {
      if (revision === this.revision) {
        this.cargando.set(false);
      }
    }
  }
}
