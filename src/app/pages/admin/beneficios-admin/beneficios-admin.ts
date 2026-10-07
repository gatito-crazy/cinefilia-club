import { DatePipe, DecimalPipe } from '@angular/common';
import {
    Component,
    computed,
    inject,
    input,
    OnInit,
    signal
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
    AdminBeneficios,
    BeneficiosService,
    mensajeBeneficio,
    Recompensa,
    ReporteCine
} from '../../../base/service/beneficios.service';

import {
    FidelizacionService
} from '../../../base/service/fidelizacion.service';

import { CandyAdmin } from '../candy-admin/candy-admin';

@Component({
    selector: 'app-beneficios-admin',
    imports: [
        DatePipe,
        DecimalPipe,
        FormsModule,
        CandyAdmin
    ],
    templateUrl: './beneficios-admin.html',
    styleUrl: './beneficios-admin.scss'
})
export class BeneficiosAdmin implements OnInit {
    readonly seccion = input.required<
        'puntos' | 'credito' | 'paquetes' | 'reportes'
    >();

    readonly titulo = computed(
        () => ({
            puntos: 'Puntos y recompensas',
            credito: 'Crédito y cancelaciones',
            paquetes: 'Combos con entradas',
            reportes: 'Reportes'
        })[this.seccion()]
    );

    private readonly servicio = inject(BeneficiosService);
    private readonly fidelizacion = inject(FidelizacionService);

    readonly datos = signal<AdminBeneficios | null>(null);
    readonly ocupado = signal(false);
    readonly error = signal('');
    readonly exito = signal('');
    readonly reporte = signal<ReporteCine | null>(null);
    readonly periodo = signal<'semanas' | 'meses'>('semanas');

    desde = new Date(
        Date.now() - 30 * 86400000
    ).toISOString().slice(0, 10);

    hasta = new Date().toISOString().slice(0, 10);

    recompensa: Omit<Recompensa, 'id'> & {
        id: string | null;
    } = {
        id: null,
        nombre: '',
        tipo: 'entrada',
        articulo_id: null,
        puntos: 500,
        importe_canje: 0,
        activa: true
    };

    ngOnInit(): void {
        void this.cargar();
    }

    async cargar(): Promise<void> {
        if (this.ocupado()) {
            return;
        }

        this.ocupado.set(true);
        this.error.set('');

        try {
            this.datos.set(await this.servicio.admin());
        } catch (error) {
            this.error.set(mensajeBeneficio(error));
        } finally {
            this.ocupado.set(false);
        }
    }

    private async operar(
        operacion: () => Promise<unknown>,
        mensaje: string
    ): Promise<void> {
        if (this.ocupado()) {
            return;
        }

        this.ocupado.set(true);
        this.error.set('');
        this.exito.set('');

        try {
            await operacion();

            this.exito.set(mensaje);
            this.datos.set(await this.servicio.admin());
        } catch (error) {
            this.error.set(mensajeBeneficio(error));
        } finally {
            this.ocupado.set(false);
        }
    }

    editarRecompensa(recompensa: Recompensa): void {
        if (this.ocupado()) {
            return;
        }

        this.recompensa = { ...recompensa };
    }

    nuevaRecompensa(): void {
        if (this.ocupado()) {
            return;
        }

        this.recompensa = {
            id: null,
            nombre: '',
            tipo: 'entrada',
            articulo_id: null,
            puntos: 500,
            importe_canje: 0,
            activa: true
        };
    }

    cambiarTipo(): void {
        this.recompensa.articulo_id = null;
    }

    async guardarRecompensa(): Promise<void> {
        const importe = Number(this.recompensa.importe_canje);
        const puntos = Number(this.recompensa.puntos);

        if (
            !this.recompensa.nombre.trim() ||
            !Number.isInteger(puntos) ||
            puntos <= 0 ||
            !Number.isFinite(importe) ||
            importe < 0 ||
            Math.abs(
                importe * 100 - Math.round(importe * 100)
            ) > 0.000001 ||
            importe > 9999999999.99 ||
            (
                this.recompensa.tipo !== 'entrada' &&
                !this.recompensa.articulo_id
            )
        ) {
            this.error.set(
                'Completá el nombre, los puntos y el artículo. ' +
                'El importe puede ser 0 para canjear solo con puntos ' +
                'y debe tener hasta dos decimales.'
            );

            return;
        }

        await this.operar(
            () => this.servicio.rpc('cine_guardar_recompensa', {
                p_datos: this.recompensa
            }),
            'Recompensa guardada.'
        );
    }

    async eliminarRecompensa(
        recompensa: Recompensa
    ): Promise<void> {
        if (this.ocupado()) {
            return;
        }

        const confirmacion = window.confirm(
            `¿Eliminar la recompensa "${recompensa.nombre}"?\n\n` +
            'Dejará de estar disponible para nuevos canjes. ' +
            'Las compras anteriores conservarán su historial.'
        );

        if (!confirmacion) {
            return;
        }

        let eliminada = false;

        await this.operar(
            async () => {
                await this.servicio.rpc(
                    'cine_eliminar_recompensa',
                    {
                        p_recompensa: recompensa.id
                    }
                );

                eliminada = true;

                await this.fidelizacion.actualizar();
            },
            'Recompensa eliminada.'
        );

        if (
            eliminada &&
            this.recompensa.id === recompensa.id
        ) {
            this.nuevaRecompensa();
        }
    }

    async cancelar(id: string): Promise<void> {
        const confirmacion = window.confirm(
            '¿Cancelar esta función? Se cancelarán sus compras ' +
            'sin uso, se liberarán las butacas y se acreditará ' +
            'el importe en las cuentas. Los avisos se enviarán ' +
            'por correo.'
        );

        if (!confirmacion) {
            return;
        }

        await this.operar(
            () => this.servicio.rpc(
                'cine_cancelar_funcion_credito',
                {
                    p_funcion: id
                }
            ),
            'Función cancelada; compensaciones y avisos registrados.'
        );
    }

    async cargarReporte(): Promise<void> {
        await this.operar(
            async () => {
                const reporte = await this.servicio.rpc<ReporteCine>(
                    'cine_reporte_beneficios',
                    {
                        p_desde: this.desde,
                        p_hasta: this.hasta
                    }
                );

                this.reporte.set(reporte);
            },
            'Reporte actualizado.'
        );
    }

    barras(): {
        periodo: string;
        nombre: string;
        entradas: number;
    }[] {
        return this.reporte()?.[this.periodo()] ?? [];
    }

    ancho(valor: number): number {
        const maximo = Math.max(
            1,
            ...this.barras().map(
                (barra) => Number(barra.entradas)
            )
        );

        return (Number(valor) / maximo) * 100;
    }

    async exportarPdf(): Promise<void> {
        const reporte = this.reporte();

        if (!reporte) {
            return;
        }

        try {
            const { jsPDF } = await import('jspdf');
            const pdf = new jsPDF();

            let posicion = 20;

            const linea = (texto: string): void => {
                for (
                    const fila of pdf.splitTextToSize(texto, 175)
                ) {
                    if (posicion > 275) {
                        pdf.addPage();
                        posicion = 20;
                    }

                    pdf.text(String(fila), 15, posicion);
                    posicion += 7;
                }
            };

            pdf.setFontSize(12);

            linea('Cinefilia Club — Reporte de facturación');
            linea(this.desde + ' a ' + this.hasta);

            for (const dia of reporte.dias) {
                linea(
                    dia.fecha +
                    ' | ARS ' +
                    Number(dia.facturacion).toFixed(2) +
                    ' | ' +
                    dia.entradas +
                    ' entradas'
                );
            }

            linea('Candy más vendido');

            for (const articulo of reporte.candy) {
                linea(
                    articulo.nombre +
                    ' (' +
                    articulo.tipo +
                    '): ' +
                    articulo.unidades +
                    ' unidades'
                );
            }

            linea('Películas vistas por semana');

            for (const semana of reporte.semanas) {
                linea(
                    semana.periodo +
                    ' | ' +
                    semana.nombre +
                    ' | ' +
                    semana.entradas
                );
            }

            linea('Películas vistas por mes');

            for (const mes of reporte.meses) {
                linea(
                    mes.periodo +
                    ' | ' +
                    mes.nombre +
                    ' | ' +
                    mes.entradas
                );
            }

            pdf.save('cine-facturacion.pdf');
        } catch (error) {
            this.error.set(mensajeBeneficio(error));
        }
    }

    async exportarExcel(): Promise<void> {
        const reporte = this.reporte();

        if (!reporte) {
            return;
        }

        try {
            const { crearExcel } = await import(
                '../../../base/service/excel'
            );

            const bytes = crearExcel([
                {
                    nombre: 'Facturacion',
                    filas: reporte.dias
                },
                {
                    nombre: 'Candy',
                    filas: reporte.candy
                },
                {
                    nombre: 'Semanas',
                    filas: reporte.semanas
                },
                {
                    nombre: 'Meses',
                    filas: reporte.meses
                }
            ]);

            const url = URL.createObjectURL(
                new Blob(
                    [new Uint8Array(bytes).buffer],
                    {
                        type:
                            'application/vnd.openxmlformats-officedocument.' +
                            'spreadsheetml.sheet'
                    }
                )
            );

            const enlace = document.createElement('a');

            enlace.href = url;
            enlace.download = 'cine-facturacion.xlsx';
            enlace.click();

            setTimeout(
                () => URL.revokeObjectURL(url),
                1000
            );
        } catch (error) {
            this.error.set(mensajeBeneficio(error));
        }
    }
}