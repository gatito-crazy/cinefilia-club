import { DecimalPipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';

import {
    CuponAdmin,
    CuponesService,
    DatosCupon,
    TipoCupon
} from '../../../base/service/cupones.service';

@Component({
    selector: 'app-cupones-admin',
    imports: [FormsModule, DecimalPipe],
    templateUrl: './cupones-admin.html',
    styleUrl: './cupones-admin.scss'
})
export class CuponesAdmin implements OnInit {
    private readonly servicio = inject(CuponesService);

    readonly cupones = signal<CuponAdmin[]>([]);
    readonly cargando = signal(false);
    readonly guardando = signal(false);
    readonly editorAbierto = signal(false);
    readonly error = signal('');
    readonly exito = signal('');

    readonly diasSemana = [
        { numero: 1, nombre: 'Lunes' },
        { numero: 2, nombre: 'Martes' },
        { numero: 3, nombre: 'Miércoles' },
        { numero: 4, nombre: 'Jueves' },
        { numero: 5, nombre: 'Viernes' },
        { numero: 6, nombre: 'Sábado' },
        { numero: 0, nombre: 'Domingo' }
    ];

    formulario: DatosCupon = this.formularioVacio();

    async ngOnInit(): Promise<void> {
        await this.cargar();
    }

    async cargar(): Promise<void> {
        if (this.cargando() || this.guardando()) {
            return;
        }

        this.cargando.set(true);
        this.error.set('');

        try {
            this.cupones.set(await this.servicio.listarAdmin());
        } catch (error) {
            this.error.set(this.obtenerMensaje(error));
        } finally {
            this.cargando.set(false);
        }
    }

    nuevo(): void {
        if (this.guardando() || this.cargando()) {
            return;
        }

        this.formulario = this.formularioVacio();

        this.error.set('');
        this.exito.set('');
        this.editorAbierto.set(true);
    }

    editar(cupon: CuponAdmin): void {
        if (this.guardando() || this.cargando()) {
            return;
        }

        this.formulario = {
            id: cupon.id,
            codigo: cupon.codigo,
            nombre: cupon.nombre,
            tipo: cupon.tipo,
            porcentaje: Number(cupon.porcentaje),
            activo: cupon.activo,
            beneficio_permanente: cupon.beneficio_permanente,
            acumulable: true,
            dias_permitidos: [...cupon.dias_permitidos],
            edad_minima:
                cupon.tipo === 'mayores_50' ? Math.max(51, cupon.edad_minima) : cupon.edad_minima,
            importe_minimo: Number(cupon.importe_minimo),
            aplica_a: cupon.aplica_a,
            vigente_desde: cupon.vigente_desde,
            vigente_hasta: cupon.vigente_hasta
        };

        this.error.set('');
        this.exito.set('');
        this.editorAbierto.set(true);
    }

    cambiarTipo(tipo: TipoCupon): void {
        if (this.formulario.id) {
            return;
        }

        this.formulario.tipo = tipo;

        if (tipo === 'mayores_50') {
            this.formulario.edad_minima = Math.max(51, this.formulario.edad_minima);
        }
    }

    cambiarDia(numero: number, evento: Event): void {
        if (this.guardando() || this.cargando()) {
            return;
        }

        const marcado = (evento.target as HTMLInputElement).checked;

        const dias = new Set(this.formulario.dias_permitidos);

        if (marcado) {
            dias.add(numero);
        } else {
            dias.delete(numero);
        }

        this.formulario.dias_permitidos = [...dias].sort((a, b) => a - b);
    }

    nombresDias(dias: number[]): string {
        if (dias.length === 0) {
            return 'Todos los días';
        }

        return this.diasSemana
            .filter((dia) => dias.includes(dia.numero))
            .map((dia) => dia.nombre)
            .join(', ');
    }

    cancelar(): void {
        if (!this.guardando()) {
            this.editorAbierto.set(false);
        }
    }

    async guardar(form: NgForm): Promise<void> {
        if (this.guardando() || this.cargando()) {
            return;
        }

        this.error.set('');
        this.exito.set('');

        const porcentaje = Number(this.formulario.porcentaje);

        const codigo = this.formulario.codigo.trim().toUpperCase();

        const nombre = this.formulario.nombre.trim();

        if (
            form.invalid ||
            !/^[A-Z0-9_-]{3,40}$/.test(codigo) ||
            !nombre ||
            nombre.length > 120 ||
            !Number.isFinite(porcentaje) ||
            porcentaje <= 0 ||
            porcentaje > 100 ||
            Math.abs(porcentaje * 100 - Math.round(porcentaje * 100)) > 0.000001
        ) {
            form.control.markAllAsTouched();

            this.error.set(
                'Revisá los campos. El porcentaje debe ser mayor que 0, menor o igual que 100 y tener hasta dos decimales.'
            );

            return;
        }

        const edad = Number(this.formulario.edad_minima);

        const minimo = Number(this.formulario.importe_minimo);

        const desde = this.formulario.vigente_desde || null;
        const hasta = this.formulario.vigente_hasta || null;

        if (
            !Number.isInteger(edad) ||
            edad < 0 ||
            edad > 120 ||
            (this.formulario.tipo === 'mayores_50' && edad < 51) ||
            !Number.isFinite(minimo) ||
            minimo < 0 ||
            minimo > 9999999999.99 ||
            Math.abs(minimo * 100 - Math.round(minimo * 100)) > 0.000001 ||
            (desde !== null && hasta !== null && desde > hasta)
        ) {
            this.error.set('Revisá las restricciones y las fechas de vigencia.');

            return;
        }

        this.guardando.set(true);

        try {
            await this.servicio.guardar({
                ...this.formulario,
                codigo,
                nombre,
                porcentaje,
                edad_minima: edad,
                importe_minimo: minimo,
                vigente_desde: desde,
                vigente_hasta: hasta
            });

            this.editorAbierto.set(false);

            this.exito.set('El cupón se guardó correctamente.');
        } catch (error) {
            this.error.set(this.obtenerMensaje(error));
        } finally {
            this.guardando.set(false);
        }

        if (!this.editorAbierto()) {
            await this.cargar();
        }
    }

    private obtenerMensaje(error: unknown): string {
        if (
            typeof error === 'object' &&
            error !== null &&
            'message' in error &&
            typeof error.message === 'string'
        ) {
            const codigo = 'code' in error ? String(error.code) : '';

            return codigo ? '[' + codigo + '] ' + error.message : error.message;
        }

        return 'No se pudo completar la operación. Intentá nuevamente.';
    }

    private formularioVacio(): DatosCupon {
        return {
            id: null,
            codigo: '',
            nombre: '',
            tipo: 'general',
            porcentaje: 10,
            activo: true,
            beneficio_permanente: false,
            acumulable: true,
            dias_permitidos: [],
            edad_minima: 0,
            importe_minimo: 0,
            aplica_a: 'total',
            vigente_desde: null,
            vigente_hasta: null
        };
    }
}
