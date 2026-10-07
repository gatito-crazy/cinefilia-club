import { VinculacionComprasService } from './vinculacion-compras.service';
import { inject, Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { ArticuloCompra } from './compras.service';
import { Cupon } from './cupones.service';

export interface Recompensa {
  id: string;
  nombre: string;
  tipo: 'entrada' | 'producto' | 'combo' | 'paquete';
  importe_canje: number;
  articulo_id: string | null;
  puntos: number;
  activa: boolean;
}
export interface Paquete {
  descripcion?: string;
  imagen_url?: string | null;
  componentes?: { producto_id: string; cantidad: number }[];
  id: string;
  nombre: string;
  producto_pochoclos: string | null;
  producto_bebida: string | null;
  precio: number;
  activo: boolean;
}
export interface Movimiento {
  id: number;
  concepto: string;
  puntos: number;
  credito: number;
  creado_en: string;
}
export interface Billetera {
  puntos: number;
  credito: number;
  historial: Movimiento[];
}
export interface OpcionesCompra {
  borrador?: boolean;
  canjes?: { recompensa: string; cantidad: number; butacas?: string[] }[];
  paquete: string | null;
  cantidad_paquete?: number;
  recompensa: string | null;
  cantidad_canje: number;
  credito: number;
  medio: 'tarjeta' | 'debito' | 'transferencia' | 'credito';
  resultado: 'aprobado' | 'rechazado';
  email: string;
}
export interface Cotizacion {
  paquete_butacas?: string[];
  cantidad_paquete?: number;
  canjes?: {
    recompensa: string;
    nombre: string;
    tipo: string;
    cantidad: number;
    puntos: number;
    importe: number;
    butacas: string[];
  }[];
  huella: string;
  subtotal: number;
  entradas: number;
  candy_total: number;
  descuento_cupones: number;
  descuento_paquete: number;
  descuento_canje: number;
  total: number;
  credito: number;
  a_pagar: number;
  puntos_canje: number;
  puntos_ganados: number;
  detalle_candy: { nombre: string; cantidad: number; precio: number }[];
}
export interface PagoElegido {
  opciones: OpcionesCompra;
  huella: string;
}
export interface ProximaPelicula {
  id: string;
  nombre: string;
  sinopsis: string;
  imagen_url: string | null;
  fecha_estreno: string;
  alerta: boolean;
  venta: {
    abierta: boolean;
    preventa: boolean;
    precio: number | null;
    inicio: string | null;
    fin: string | null;
  };
}
export interface PeliculaVista {
  id: string;
  nombre: string;
  imagen_url: string | null;
  fechas: string[];
  estrellas: number | null;
  comentario: string | null;
}
export interface PeliculaPreventa {
  id: string;
  nombre: string;
  fecha_estreno: string | null;
  preventa_activa: boolean;
  preventa_inicio: string | null;
  preventa_fin: string | null;
  preventa_precio: number | null;
  preventa_descuento?: number;
}
export interface AdminBeneficios {
  peliculas: PeliculaPreventa[];
  productos: { id: string; nombre: string }[];
  combos: { id: string; nombre: string }[];
  recompensas: Recompensa[];
  paquetes: Paquete[];
  funciones: {
    id: string;
    nombre: string;
    inicio: string;
    activa: boolean;
    cancelada: boolean;
  }[];
  correos: {
    id: string;
    asunto: string;
    estado: string;
    intentos: number;
    ultimo_error: string | null;
  }[];
}

@Injectable({ providedIn: 'root' })
export class BeneficiosService {
  private readonly supabase = inject(SupabaseService);
  private readonly vinculacion = inject(VinculacionComprasService);
  async rpc<T>(nombre: string, parametros: Record<string, unknown> = {}): Promise<T> {
    const { data, error } = await this.supabase.cliente.rpc(nombre, parametros);
    if (error) {
      throw error;
    }
    return data as T;
  }
  catalogo(): Promise<{ recompensas: Recompensa[]; paquetes: Paquete[] }> {
    return this.rpc('cine_beneficios_catalogo');
  }
  async billetera(): Promise<Billetera> {
    await this.vinculacion.vincular();
    return this.rpc('cine_mi_billetera');
  }
  proximamente(): Promise<ProximaPelicula[]> {
    return this.rpc('cine_proximamente');
  }
  async misPeliculas(): Promise<PeliculaVista[]> {
    await this.vinculacion.vincular();
    return this.rpc('cine_mis_peliculas');
  }
  admin(): Promise<AdminBeneficios> {
    return this.rpc('cine_admin_beneficios');
  }
  cotizar(
    clave: string,
    candy: ArticuloCompra[],
    cupones: Cupon[],
    opciones: OpcionesCompra,
    soloCandy: boolean,
  ): Promise<Cotizacion> {
    return this.rpc('cine_cotizar_beneficios', {
      p_clave: clave,
      p_candy: candy,
      p_cupones: cupones.map((c) => ({
        id: c.id,
        porcentaje: c.porcentaje,
        aplica_a: c.aplica_a,
      })),
      p_opciones: opciones,
      p_solo_candy: soloCandy,
    });
  }
  async tieneSesion(): Promise<boolean> {
    const { data, error } = await this.supabase.cliente.auth.getSession();
    if (error) {
      throw error;
    }
    return !!data.session;
  }
}
export function opcionesVacias(): OpcionesCompra {
  return {
    canjes: [],
    paquete: null,
    recompensa: null,
    cantidad_canje: 1,
    credito: 0,
    medio: 'tarjeta',
    resultado: 'aprobado',
    email: '',
  };
}
export function mensajeBeneficio(error: unknown): string {
  return typeof error === 'object' && error !== null && 'message' in error
    ? String(error.message)
    : 'No pudimos completar la operación. Volvé a intentarlo.';
}

export interface ReporteCine {
  dias: {
    fecha: string;
    compras: number;
    facturacion: number;
    descuentos: number;
    credito_utilizado: number;
    entradas: number;
  }[];
  semanas: { periodo: string; nombre: string; entradas: number }[];
  meses: { periodo: string; nombre: string; entradas: number }[];
  candy: { tipo: string; nombre: string; unidades: number; importe_bruto: number }[];
}
