import {
  FidelizacionService,
  SeleccionCanje,
  validarCanjes,
} from '../../base/service/fidelizacion.service';
import {
  BeneficiosService,
  opcionesVacias,
  PagoElegido,
} from '../../base/service/beneficios.service';
import { PagoSelector } from '../../shared/pago-selector/pago-selector';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  ArticuloCompra,
  Compra,
  ComprasService,
  ControlEdadCompra,
} from '../../base/service/compras.service';
import { Reserva, ReservasService } from '../../base/service/reservas.service';
import { ComprobantePdfService } from '../../base/service/comprobante-pdf.service';
import {
  calcularResumenCupones,
  comprobarSeleccionCupones,
  Cupon,
  validarCuponesGuardados,
} from '../../base/service/cupones.service';

import { CuponSelector } from '../../shared/cupon-selector/cupon-selector';

interface SolicitudCompra {
  candy: ArticuloCompra[];
  total: number;
  fechaNacimiento: string | null;
  cupones: Cupon[];
  totalEntradas: number;
  totalFinal: number;
  pago: PagoElegido | null;
}
interface CarritoGuardado {
  paquete?: string | null;
  cantidadPaquete?: number;
  canje?: SeleccionCanje | null;
  canjes?: SeleccionCanje[];
  productos: Record<string, number>;
  combos: Record<string, number>;
  total: number;
}

interface QrVisible {
  tipo: 'entrada' | 'candy';
  codigo: string;
  imagen: string;
  estado: string;
}

@Component({
  selector: 'app-confirmar-compra',
  imports: [DatePipe, DecimalPipe, RouterLink, CuponSelector, PagoSelector],
  templateUrl: './confirmar-compra.html',
  styleUrl: './confirmar-compra.scss',
})
export class ConfirmarCompra implements OnInit, OnDestroy {
  private readonly ruta = inject(ActivatedRoute);
  private readonly beneficios = inject(BeneficiosService);
  private readonly reservasService = inject(ReservasService);
  private readonly comprasService = inject(ComprasService);
  private readonly comprobantePdfService = inject(ComprobantePdfService);

  private clave = '';
  get clavePago(): string {
    return this.clave;
  }
  readonly articulosPago = signal<ArticuloCompra[]>([]);
  readonly fidelizacion = inject(FidelizacionService);
  readonly canjesElegidos = signal<SeleccionCanje[]>([]);
  readonly paqueteElegido = signal<string | null>(null);
  readonly cantidadPaquete = signal(1);
  readonly pagoElegido = signal<PagoElegido | null>(null);
  readonly pagoGuardado = signal<PagoElegido | null>(null);
  private claveSolicitud = '';
  private solicitud: SolicitudCompra | null = null;
  private diferenciaServidor = 0;
  private reloj: ReturnType<typeof setInterval> | null = null;
  private destruido = false;

  readonly funcionId = this.ruta.snapshot.paramMap.get('id') ?? '';

  readonly cargando = signal(true);
  readonly confirmando = signal(false);
  readonly comprobando = signal(false);
  readonly resultadoIncierto = signal(false);

  readonly error = signal('');
  readonly errorQr = signal('');
  readonly reserva = signal<Reserva | null>(null);
  readonly compra = signal<Compra | null>(null);
  readonly comprobantes = signal<QrVisible[]>([]);
  readonly totalEsperado = signal(0);
  readonly ahora = signal(Date.now());
  readonly avisoAcceso = signal('');
  readonly cuponesElegidos = signal<Cupon[]>([]);
  readonly subtotalEntradas = signal(0);
  readonly subtotalCandy = computed(
    () =>
      this.subtotalCandyCotizado() ??
      Math.round((this.totalEsperado() - this.subtotalEntradas()) * 100) / 100,
  );
  readonly subtotalCandyCotizado = signal<number | null>(null);

  readonly controlEdad = signal<ControlEdadCompra | null>(null);
  readonly fechaNacimiento = signal('');
  readonly descargandoPdf = signal(false);
  readonly errorPdf = signal('');

  readonly reservaVigente = computed(() => {
    const reserva = this.reserva();

    return (
      !!reserva &&
      reserva.estado === 'reservada' &&
      new Date(reserva.vence_en).getTime() > this.ahora()
    );
  });

  readonly tiempoRestante = computed(() => {
    const venceEn = this.reserva()?.vence_en;

    const segundos = venceEn
      ? Math.max(0, Math.ceil((new Date(venceEn).getTime() - this.ahora()) / 1000))
      : 0;

    return (
      `${String(Math.floor(segundos / 60)).padStart(2, '0')}:` +
      String(segundos % 60).padStart(2, '0')
    );
  });

  readonly edadComprador = computed(() => {
    const control = this.controlEdad();

    if (!control) {
      return null;
    }

    if (!control.invitado) {
      return control.edad;
    }

    return this.calcularEdad(this.fechaNacimiento(), control.fecha_hoy);
  });

  readonly mensajeEdad = computed(() => {
    const control = this.controlEdad();

    if (!control) {
      return 'No se pudo comprobar la restricción de edad.';
    }

    const edad = this.edadComprador();

    if (edad === null) {
      return control.invitado
        ? 'Ingresá una fecha de nacimiento válida, que no sea futura.'
        : 'No se pudo comprobar la fecha de nacimiento de tu perfil.';
    }

    if (edad < control.edad_minima) {
      return (
        `Esta película requiere tener al menos ` +
        `${control.edad_minima} años. No podés comprar estas entradas.`
      );
    }

    return '';
  });

  readonly edadPermitida = computed(() => this.controlEdad() !== null && this.mensajeEdad() === '');

  ngOnInit(): void {
    void this.cargar();

    this.reloj = setInterval(() => {
      this.ahora.set(Date.now() + this.diferenciaServidor);
    }, 1000);
  }

  ngOnDestroy(): void {
    this.destruido = true;

    if (this.reloj !== null) {
      clearInterval(this.reloj);
      this.reloj = null;
    }
  }

  async cargar(): Promise<void> {
    if (this.confirmando() || this.comprobando()) {
      return;
    }

    this.cargando.set(true);
    this.error.set('');
    this.controlEdad.set(null);
    this.solicitud = null;

    try {
      const almacenamiento = await this.reservasService.obtenerClaveAlmacenamiento(this.funcionId);

      const reservaGuardada = this.reservasService.leerSolicitud(almacenamiento);

      if (!reservaGuardada) {
        throw new Error('No encontramos la reserva en este navegador.');
      }

      this.clave = reservaGuardada.clave;

      const claveCarrito = `${almacenamiento}-candy-${this.clave}`;

      this.claveSolicitud = `${claveCarrito}-confirmacion`;

      const compra = await this.comprasService.obtener(this.clave);

      if (this.destruido) {
        return;
      }

      if (compra) {
        await this.mostrarCompra(compra);
        return;
      }

      const reserva = await this.reservasService.obtenerReserva(this.clave);

      if (this.destruido) {
        return;
      }

      this.aplicarReserva(reserva);

      const pendiente = sessionStorage.getItem(this.claveSolicitud);

      if (pendiente) {
        this.solicitud = this.validarSolicitud(JSON.parse(pendiente));

        this.fechaNacimiento.set(this.solicitud.fechaNacimiento ?? '');

        this.resultadoIncierto.set(true);
      } else {
        const texto = sessionStorage.getItem(claveCarrito);

        if (!texto) {
          throw new Error('Volvé al Candy y revisá el resumen de compra.');
        }

        const carrito = JSON.parse(texto) as CarritoGuardado;
        this.paqueteElegido.set(typeof carrito.paquete === 'string' ? carrito.paquete : null);
        this.cantidadPaquete.set(this.paqueteElegido() ? (carrito.cantidadPaquete ?? 1) : 1);
        this.canjesElegidos.set(validarCanjes(carrito.canjes ?? carrito.canje));
        const candy: ArticuloCompra[] = [];

        for (const [id, cantidad] of Object.entries(carrito.productos ?? {})) {
          if (cantidad > 0) {
            candy.push({
              tipo: 'producto',
              id,
              cantidad,
            });
          }
        }

        for (const [id, cantidad] of Object.entries(carrito.combos ?? {})) {
          if (cantidad > 0) {
            candy.push({
              tipo: 'combo',
              id,
              cantidad,
            });
          }
        }

        this.solicitud = this.validarSolicitud({
          candy,
          total: carrito.total,
          totalEntradas: reserva?.total ?? 0,
          fechaNacimiento: null,
          cupones: [],
          totalFinal: carrito.total,
        });

        this.resultadoIncierto.set(false);
      }

      this.articulosPago.set(this.solicitud.candy);
      this.subtotalCandyCotizado.set(null);
      if (
        !this.resultadoIncierto() &&
        (this.paqueteElegido() || this.canjesElegidos().some((c) => c.tipo === 'paquete'))
      ) {
        const cotizacion = await this.beneficios.cotizar(
          this.clave,
          this.solicitud.candy,
          [],
          {
            ...opcionesVacias(),
            borrador: true,
            paquete: this.paqueteElegido(),
            cantidad_paquete: this.cantidadPaquete(),
            canjes: this.canjesElegidos().map((c) => ({
              recompensa: c.recompensa,
              cantidad: c.cantidad,
              butacas: c.butacas,
            })),
            email: this.fidelizacion.auth.usuario()?.email ?? '',
          },
          false,
        );
        if (this.destruido) {
          return;
        }
        this.subtotalCandyCotizado.set(Number(cotizacion.candy_total));
      }
      this.pagoGuardado.set(this.resultadoIncierto() ? this.solicitud.pago : null);
      this.pagoElegido.set(this.solicitud.pago);
      this.cuponesElegidos.set(this.solicitud.cupones);

      this.totalEsperado.set(this.solicitud.total);

      this.subtotalEntradas.set(this.solicitud.totalEntradas);

      if (!this.reservaVigente()) {
        this.error.set('La reserva ya terminó. Si enviaste una confirmación, comprobá la compra.');
        return;
      }

      const control = await this.comprasService.consultarEdad(this.funcionId);

      if (!this.destruido) {
        this.controlEdad.set(control);
      }
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

  async confirmar(): Promise<void> {
    if (
      this.cargando() ||
      this.confirmando() ||
      this.comprobando() ||
      this.compra() ||
      !this.solicitud ||
      !this.reservaVigente()
    ) {
      return;
    }

    this.error.set('');

    if (!this.resultadoIncierto() && !this.pagoElegido()) {
      this.error.set('Comprobá el resumen de pago antes de confirmar.');
      return;
    }

    if (!this.edadPermitida()) {
      this.error.set(this.mensajeEdad());
      return;
    }

    const fechaNacimiento = this.controlEdad()?.invitado ? this.fechaNacimiento() : null;

    // Una solicitud de resultado incierto conserva sus datos.
    // Permite completar la fecha de solicitudes anteriores a este cambio.
    if (!this.resultadoIncierto() || !this.solicitud.fechaNacimiento) {
      this.solicitud = {
        ...this.solicitud,
        fechaNacimiento,
      };
    }

    if (!this.resultadoIncierto()) {
      try {
        comprobarSeleccionCupones(
          this.cuponesElegidos(),
          this.solicitud.totalEntradas,
          this.subtotalCandy(),
        );
      } catch (error) {
        this.error.set(this.obtenerMensaje(error));

        return;
      }

      this.solicitud = {
        ...this.solicitud,
        pago: this.pagoElegido(),
        cupones: this.cuponesElegidos(),
        totalFinal: calcularResumenCupones(
          this.solicitud.totalEntradas,
          this.solicitud.total - this.solicitud.totalEntradas,
          this.cuponesElegidos(),
        ).total,
      };
    }

    const solicitud = this.solicitud;

    this.confirmando.set(true);

    try {
      sessionStorage.setItem(this.claveSolicitud, JSON.stringify(solicitud));
    } catch {
      this.error.set('El navegador no pudo guardar la solicitud de compra.');
      this.confirmando.set(false);
      return;
    }

    this.resultadoIncierto.set(true);

    try {
      const compra = await this.comprasService.confirmar(
        this.clave,
        solicitud.candy,
        solicitud.total,
        solicitud.fechaNacimiento,
        solicitud.cupones,
        solicitud.totalFinal,
        solicitud.pago,
      );

      if (!this.destruido) {
        await this.mostrarCompra(compra);
      }
    } catch (error) {
      if (!this.destruido) {
        const codigo =
          typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';

        if (/^[0-9A-Z]{5}$/.test(codigo)) {
          this.resultadoIncierto.set(false);

          try {
            sessionStorage.removeItem(this.claveSolicitud);
          } catch {
            // No modifica la respuesta del servidor.
          }

          this.error.set(this.obtenerMensaje(error));
        } else {
          this.error.set(
            'No pudimos comprobar la respuesta. Presioná Comprobar compra antes de volver a intentarlo.',
          );
        }
      }
    } finally {
      if (!this.destruido) {
        this.confirmando.set(false);
      }
    }
  }

  async comprobarCompra(): Promise<void> {
    if (!this.clave || this.confirmando() || this.comprobando()) {
      return;
    }

    this.comprobando.set(true);
    this.error.set('');

    try {
      const compra = await this.comprasService.obtener(this.clave);

      if (this.destruido) {
        return;
      }

      if (compra) {
        await this.mostrarCompra(compra);
      } else {
        const reserva = await this.reservasService.obtenerReserva(this.clave);

        if (this.destruido) {
          return;
        }

        this.aplicarReserva(reserva);

        if (this.reservaVigente()) {
          const control = await this.comprasService.consultarEdad(this.funcionId);

          if (this.destruido) {
            return;
          }

          this.controlEdad.set(control);
        }

        this.error.set(
          this.reservaVigente()
            ? 'Todavía no aparece una compra. Podés reintentar la misma solicitud sin duplicarla.'
            : 'No aparece una compra y la reserva ya terminó.',
        );
      }
    } catch (error) {
      if (!this.destruido) {
        this.error.set(this.obtenerMensaje(error));
      }
    } finally {
      if (!this.destruido) {
        this.comprobando.set(false);
      }
    }
  }

  async descargarPdf(): Promise<void> {
    const compra = this.compra();

    if (!compra || compra.estado !== 'confirmada' || this.descargandoPdf()) {
      return;
    }

    this.descargandoPdf.set(true);
    this.errorPdf.set('');

    try {
      await this.comprobantePdfService.descargar(compra);
    } catch (error) {
      console.error('No se pudo descargar el PDF:', error);

      if (!this.destruido) {
        this.errorPdf.set(
          'No pudimos generar el PDF. ' + 'Tu compra sigue guardada. Volvé a intentarlo.',
        );
      }
    } finally {
      if (!this.destruido) {
        this.descargandoPdf.set(false);
      }
    }
  }

  async generarQr(): Promise<void> {
    const compra = this.compra();

    if (!compra) {
      return;
    }

    this.errorQr.set('');

    try {
      const modulo = await import('qrcode');
      const QRCode = modulo.default ?? modulo;

      const comprobantes = await Promise.all(
        compra.comprobantes.map(async (comprobante) => ({
          ...comprobante,
          imagen: await QRCode.toDataURL(comprobante.codigo, {
            width: 280,
            margin: 2,
            errorCorrectionLevel: 'M',
          }),
        })),
      );

      if (!this.destruido) {
        this.comprobantes.set(comprobantes);
      }
    } catch (error) {
      console.error('Error al dibujar los QR:', error);

      if (!this.destruido) {
        this.errorQr.set(
          'La compra está guardada, pero no pudimos dibujar los QR. Podés volver a intentarlo.',
        );
      }
    }
  }

  private async mostrarCompra(compra: Compra): Promise<void> {
    void this.fidelizacion.actualizar();
    this.compra.set(compra);
    this.resultadoIncierto.set(false);
    this.error.set('');
    this.avisoAcceso.set('');

    try {
      sessionStorage.removeItem(this.claveSolicitud);
    } catch {
      // No afecta la compra confirmada.
    }

    try {
      await this.comprasService.guardarAccesoInvitado(this.clave);
    } catch (error) {
      console.error('Error al guardar acceso a la compra:', error);

      if (!this.destruido) {
        this.avisoAcceso.set(
          'La compra está guardada, pero no pudimos conservar su acceso en este navegador. Descargá los QR antes de salir.',
        );
      }
    }

    if (!this.destruido) {
      await this.generarQr();
    }
  }

  private aplicarReserva(reserva: Reserva | null): void {
    this.reserva.set(reserva);

    if (reserva) {
      const servidor = new Date(reserva.servidor_ahora).getTime();

      if (Number.isFinite(servidor)) {
        this.diferenciaServidor = servidor - Date.now();
      }
    }

    this.ahora.set(Date.now() + this.diferenciaServidor);
  }

  private calcularEdad(fechaNacimiento: string, fechaHoy: string): number | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaNacimiento) || !/^\d{4}-\d{2}-\d{2}$/.test(fechaHoy)) {
      return null;
    }

    const fecha = new Date(`${fechaNacimiento}T00:00:00Z`);

    if (
      !Number.isFinite(fecha.getTime()) ||
      fecha.toISOString().slice(0, 10) !== fechaNacimiento ||
      fechaNacimiento > fechaHoy
    ) {
      return null;
    }

    const [anio, mes, dia] = fechaNacimiento.split('-').map(Number);
    const [anioHoy, mesHoy, diaHoy] = fechaHoy.split('-').map(Number);

    let edad = anioHoy - anio;

    if (mesHoy < mes || (mesHoy === mes && diaHoy < dia)) {
      --edad;
    }

    return edad;
  }

  private validarSolicitud(datos: unknown): SolicitudCompra {
    if (
      typeof datos !== 'object' ||
      datos === null ||
      !('total' in datos) ||
      !('candy' in datos) ||
      typeof datos.total !== 'number' ||
      !Number.isFinite(datos.total) ||
      datos.total <= 0 ||
      !Array.isArray(datos.candy)
    ) {
      throw new Error('Volvé al Candy y revisá nuevamente el resumen.');
    }

    const candy: ArticuloCompra[] = [];

    for (const item of datos.candy) {
      if (
        typeof item !== 'object' ||
        item === null ||
        !['producto', 'combo'].includes(item.tipo) ||
        typeof item.id !== 'string' ||
        !Number.isInteger(item.cantidad) ||
        item.cantidad < 1 ||
        item.cantidad > 20
      ) {
        throw new Error('La selección de Candy no es válida.');
      }

      candy.push({
        tipo: item.tipo,
        id: item.id,
        cantidad: item.cantidad,
      });
    }

    const fechaNacimiento = 'fechaNacimiento' in datos ? datos.fechaNacimiento : null;

    if (fechaNacimiento !== null && typeof fechaNacimiento !== 'string') {
      throw new Error('La fecha de nacimiento guardada no es válida.');
    }

    const cupones = validarCuponesGuardados(
      'cupones' in datos ? datos.cupones : 'cupon' in datos ? datos.cupon : null,
    );

    const totalEntradas =
      'totalEntradas' in datos ? datos.totalEntradas : (this.reserva()?.total ?? datos.total);

    if (
      typeof totalEntradas !== 'number' ||
      !Number.isFinite(totalEntradas) ||
      totalEntradas < 0 ||
      totalEntradas > datos.total
    ) {
      throw new Error('El subtotal de entradas guardado no es válido.');
    }

    const calculado = calcularResumenCupones(
      totalEntradas,
      datos.total - totalEntradas,
      cupones,
    ).total;

    const totalFinal = 'totalFinal' in datos ? datos.totalFinal : calculado;

    if (
      typeof totalFinal !== 'number' ||
      !Number.isFinite(totalFinal) ||
      totalFinal !== calculado
    ) {
      throw new Error('El total guardado con descuento no es válido.');
    }

    return {
      candy,
      total: datos.total,
      totalEntradas,
      fechaNacimiento,
      cupones,
      totalFinal,
      pago: 'pago' in datos ? (datos.pago as PagoElegido | null) : null,
    };
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

    return 'No se pudo completar la operación. Revisá la conexión.';
  }
}
