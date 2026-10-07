import { ButacasAdmin } from '../butacas-admin/butacas-admin';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { Butaca, DatosSala, Sala, SalasService } from '../../../base/service/salas.service';

export interface ResumenSala {
    capacidad: number;
    estandar: number;
    accesibles: number;
    vip: number;
}

@Component({
    selector: 'app-salas-admin',
    imports: [FormsModule, ButacasAdmin],
    templateUrl: './salas-admin.html',
    styleUrl: './salas-admin.scss',
})
export class SalasAdmin implements OnInit {
    private readonly salasService = inject(SalasService);

    readonly salas = signal<Sala[]>([]);
    readonly salaMapa = signal<Sala | null>(null);
    readonly resumenes = signal<Record<string, ResumenSala>>({});
    readonly cargando = signal(false);
    readonly guardando = signal(false);
    readonly procesandoSala = signal<string | null>(null);

    readonly error = signal('');
    readonly exito = signal('');
    readonly errorFormulario = signal('');
    readonly editorAbierto = signal(false);

    salaEditada: string | null = null;

    borrador: DatosSala = {
        nombre: '',
        activa: true,
    };

    ngOnInit(): void {
        void this.cargarSalas();
    }

    ocupado(): boolean {
        return this.cargando() || this.guardando() || this.procesandoSala() !== null;
    }

    async cargarSalas(): Promise<void> {
        if (this.ocupado()) {
            return;
        }

        this.cargando.set(true);
        this.error.set('');

        try {
            const salas = await this.salasService.obtenerTodas();

            const resultados = await Promise.all(
                salas.map(async (sala) => {
                    const butacas = await this.salasService.obtenerButacas(sala.id);

                    return {
                        id: sala.id,
                        resumen: this.resumirButacas(butacas),
                    };
                }),
            );

            const resumenes: Record<string, ResumenSala> = {};

            for (const resultado of resultados) {
                resumenes[resultado.id] = resultado.resumen;
            }

            this.salas.set(salas);
            this.resumenes.set(resumenes);
        } catch (error) {
            console.error('Error al cargar las salas:', error);
            this.error.set(this.obtenerMensaje(error));
        } finally {
            this.cargando.set(false);
        }
    }

    nuevaSala(): void {
        if (this.ocupado() || this.editorAbierto()) {
            return;
        }

        this.salaEditada = null;

        this.borrador = {
            nombre: '',
            activa: true,
        };

        this.errorFormulario.set('');
        this.error.set('');
        this.exito.set('');
        this.editorAbierto.set(true);
    }

    editarSala(sala: Sala): void {
        if (this.ocupado() || this.editorAbierto()) {
            return;
        }

        this.salaEditada = sala.id;

        this.borrador = {
            nombre: sala.nombre,
            activa: sala.activa,
        };

        this.errorFormulario.set('');
        this.error.set('');
        this.exito.set('');
        this.editorAbierto.set(true);
    }

    cancelar(): void {
        if (this.guardando()) {
            return;
        }

        this.editorAbierto.set(false);
        this.errorFormulario.set('');
        this.salaEditada = null;
    }

    async guardar(formulario: NgForm): Promise<void> {
        if (this.ocupado()) {
            return;
        }

        formulario.form.markAllAsTouched();
        this.errorFormulario.set('');

        if (formulario.invalid || !this.borrador.nombre.trim()) {
            this.errorFormulario.set('Ingresá un nombre para la sala, de hasta 80 caracteres.');
            return;
        }

        const esNueva = this.salaEditada === null;

        this.guardando.set(true);
        this.error.set('');
        this.exito.set('');

        let guardada = false;

        try {
            await this.salasService.guardar(this.salaEditada, this.borrador);

            guardada = true;

            this.exito.set(
                esNueva
                    ? 'Sala creada. Sus 518 butacas se generaron automáticamente.'
                    : 'Los cambios de la sala fueron guardados.',
            );
        } catch (error) {
            console.error('Error al guardar la sala:', error);
            this.errorFormulario.set(this.obtenerMensaje(error));
        } finally {
            this.guardando.set(false);
        }

        if (guardada) {
            this.cancelar();
            await this.cargarSalas();
        }
    }

    async cambiarEstado(sala: Sala): Promise<void> {
        if (this.ocupado() || this.editorAbierto()) {
            return;
        }

        const nuevaActiva = !sala.activa;
        const accion = nuevaActiva ? 'activar' : 'desactivar';

        if (!window.confirm(`¿Querés ${accion} "${sala.nombre}"?`)) {
            return;
        }

        this.procesandoSala.set(sala.id);
        this.error.set('');
        this.exito.set('');

        try {
            await this.salasService.cambiarEstado(sala.id, nuevaActiva);

            this.salas.update((salas) =>
                salas.map((actual) =>
                    actual.id === sala.id ? { ...actual, activa: nuevaActiva } : actual,
                ),
            );

            this.exito.set(`"${sala.nombre}" quedó ${nuevaActiva ? 'activa' : 'desactivada'}.`);
        } catch (error) {
            console.error('Error al cambiar el estado de la sala:', error);
            this.error.set(this.obtenerMensaje(error));
        } finally {
            this.procesandoSala.set(null);
        }
    }

    async eliminarSala(sala: Sala): Promise<void> {
        if (this.ocupado() || this.editorAbierto()) {
            return;
        }

        const confirmacion = window.prompt(
            `Vas a eliminar definitivamente "${sala.nombre}" ` +
                'y todas sus butacas.\n\n' +
                'Esta acción no se puede deshacer.\n\n' +
                'Escribí ELIMINAR para confirmar:',
        );

        if (confirmacion !== 'ELIMINAR') {
            return;
        }

        this.procesandoSala.set(sala.id);
        this.error.set('');
        this.exito.set('');

        try {
            await this.salasService.eliminar(sala.id);

            this.salas.update((salas) => salas.filter((actual) => actual.id !== sala.id));

            this.resumenes.update((actuales) => {
                const restantes = { ...actuales };
                delete restantes[sala.id];
                return restantes;
            });

            this.exito.set(`"${sala.nombre}" y sus butacas fueron eliminadas.`);
        } catch (error) {
            console.error('Error al eliminar la sala:', error);
            this.error.set(this.obtenerMensaje(error));
        } finally {
            this.procesandoSala.set(null);
        }
    }

    private resumirButacas(butacas: Butaca[]): ResumenSala {
        return {
            capacidad: butacas.length,
            estandar: butacas.filter((butaca) => butaca.tipo === 'estandar').length,
            accesibles: butacas.filter((butaca) => butaca.tipo === 'accesible').length,
            vip: butacas.filter((butaca) => butaca.tipo === 'vip').length,
        };
    }

    private obtenerMensaje(error: unknown): string {
        if (typeof error === 'object' && error !== null) {
            const detalle = error as {
                code?: string;
                message?: string;
            };

            if (detalle.code === '23505') {
                return 'Ya existe una sala con ese nombre. Elegí otro.';
            }

            if (detalle.message) {
                return detalle.message;
            }
        }

        return 'No se pudo completar la operación. Intentá nuevamente.';
    }
}
