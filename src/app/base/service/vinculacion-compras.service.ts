import { inject, Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';

@Injectable({ providedIn: 'root' })
export class VinculacionComprasService {
  private readonly supabase = inject(SupabaseService);
  private pendiente: { cuenta: string; tarea: Promise<void> } | null = null;

  async vincular(): Promise<void> {
    const { data, error } = await this.supabase.cliente.auth.getSession();
    if (error) {
      throw error;
    }
    const usuario = data.session?.user;
    if (!usuario?.email_confirmed_at) {
      return;
    }
    const cuenta = `${usuario.id}:${usuario.email ?? ''}`;
    if (this.pendiente?.cuenta === cuenta) {
      return this.pendiente.tarea;
    }
    const tarea = this.ejecutar();
    this.pendiente = { cuenta, tarea };
    try {
      await tarea;
    } finally {
      if (this.pendiente?.tarea === tarea) {
        this.pendiente = null;
      }
    }
  }

  private async ejecutar(): Promise<void> {
    // La base determina el usuario y verifica el correo confirmado.
    // No se envían identificadores de cuentas ni correos desde el cliente.
    const { error } = await this.supabase.cliente.rpc('cine_vincular_compras_invitado');
    if (error) {
      throw error;
    }
  }
}
