import { DecimalPipe } from '@angular/common';
import {
    Component,
    inject,
    OnInit,
    signal
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { SupabaseService } from '../../../base/service/supabase.service';

interface CandyDestacado {
    id: string;
    nombre: string;
    descripcion: string;
    precio: number;
    imagen_url: string | null;
    unidades_vendidas: number;
}

@Component({
    selector: 'app-candy-destacados',
    imports: [DecimalPipe, RouterLink],
    templateUrl: './candy-destacados.html',
    styleUrl: './candy-destacados.scss'
})
export class CandyDestacados implements OnInit {
    private readonly supabase = inject(SupabaseService);

    readonly productos = signal<CandyDestacado[]>([]);
    readonly cargando = signal(true);
    readonly error = signal('');
    readonly imagenesFallidas = signal<string[]>([]);

    async ngOnInit(): Promise<void> {
        await this.cargar();
    }

    async cargar(): Promise<void> {
        this.cargando.set(true);
        this.error.set('');

        try {
            const { data, error } = await this.supabase.cliente
                .rpc('cine_top_candy_inicio');

            if (error) {
                throw error;
            }

            if (!Array.isArray(data)) {
                throw new Error(
                    'No se recibió el ranking de Candy.'
                );
            }

            this.productos.set(
                data.map((producto) => ({
                    ...producto,
                    precio: Number(producto.precio),
                    unidades_vendidas: Number(
                        producto.unidades_vendidas
                    )
                })) as CandyDestacado[]
            );
        } catch {
            this.error.set(
                'No pudimos cargar los productos más vendidos.'
            );
        } finally {
            this.cargando.set(false);
        }
    }

    marcarImagenFallida(id: string): void {
        this.imagenesFallidas.update((actuales) =>
            actuales.includes(id)
                ? actuales
                : [...actuales, id]
        );
    }
}