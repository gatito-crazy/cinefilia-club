import { Injectable } from '@angular/core';
import { Compra } from './compras.service';

@Injectable({
    providedIn: 'root'
})
export class ComprobantePdfService {
    async descargar(compra: Compra): Promise<void> {
        if (compra.estado !== 'confirmada') {
            throw new Error(
                'Solo se pueden descargar comprobantes de compras confirmadas.'
            );
        }

        if (compra.comprobantes.length === 0) {
            throw new Error('La compra no tiene un código QR disponible.');
        }

        const [moduloPdf, moduloQr] = await Promise.all([
            import('jspdf'),
            import('qrcode')
        ]);

        const QRCode = moduloQr.default ?? moduloQr;

        const documento = new moduloPdf.jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4',
            compress: true
        });

        const soloCandy =
            compra.solo_candy === true || compra.funcion.solo_candy === true;

        const tituloCompra = soloCandy
            ? 'Compra de Candy'
            : (compra.funcion.pelicula_nombre ?? 'Compra de entradas');

        const margen = 18;
        const anchoPagina = documento.internal.pageSize.getWidth();
        const altoPagina = documento.internal.pageSize.getHeight();
        const anchoTexto = anchoPagina - margen * 2;
        const limiteInferior = altoPagina - 22;

        let posicionY = 25;

        const moneda = (valor: number): string => {
            return (
                'ARS ' +
                Number(valor).toLocaleString('es-AR', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                })
            );
        };

        const formatearFecha = (valor: string | undefined): string => {
            if (!valor) {
                return 'No disponible';
            }

            const fecha = new Date(valor);

            if (!Number.isFinite(fecha.getTime())) {
                return 'No disponible';
            }

            return fecha.toLocaleString('es-AR', {
                timeZone: 'America/Argentina/Buenos_Aires',
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });
        };

        const asegurarEspacio = (alto: number): void => {
            if (posicionY + alto > limiteInferior) {
                documento.addPage();
                posicionY = 25;
            }
        };

        const escribir = (
            texto: string,
            destacado: boolean = false,
            tamanio: number = 11
        ): void => {
            documento.setFont('helvetica', destacado ? 'bold' : 'normal');

            documento.setFontSize(tamanio);

            const lineas = documento.splitTextToSize(texto, anchoTexto) as string[];

            const altoLinea = tamanio * 0.3528 * 1.4;

            for (const linea of lineas) {
                asegurarEspacio(altoLinea);

                documento.text(linea, margen, posicionY);

                posicionY += altoLinea;
            }

            posicionY += 3;
        };

        const separar = (): void => {
            asegurarEspacio(10);

            documento.setDrawColor(210, 210, 220);

            documento.line(margen, posicionY, anchoPagina - margen, posicionY);

            posicionY += 9;
        };

        const fechaFuncion = soloCandy ? '' : formatearFecha(compra.funcion.inicio);

        documento.setProperties({
            title: 'Comprobante de compra - Cinefilia Club',
            subject: soloCandy ? 'Candy' : 'Entradas y Candy',
            author: 'Cinefilia Club'
        });

        documento.setTextColor(183, 45, 64);
        escribir('CINEFILIA CLUB', true, 22);

        documento.setTextColor(35, 35, 45);
        escribir('Comprobante de compra', true, 14);

        if (compra.modalidad === 'prueba') {
            escribir('COMPRA DE PRUEBA: no se cobró dinero real.', true);
        }

        escribir('Compra: ' + compra.compra_id);

        escribir('Fecha de compra: ' + formatearFecha(compra.creado_en));

        separar();

        escribir(tituloCompra, true, 16);

        if (soloCandy) {
            escribir('Compra de productos y combos sin entradas.');

            escribir('Presentá el QR en el sector Candy para retirar tu compra.');
        } else {
            escribir('Sala: ' + (compra.funcion.sala_nombre ?? 'No disponible'));

            escribir('Fecha y horario: ' + fechaFuncion);

            escribir('Formato: ' + (compra.funcion.formato ?? 'No disponible'));

            const idioma = compra.funcion.idioma;

            escribir(
                'Idioma: ' +
                    (idioma === 'castellano'
                        ? 'Castellano'
                        : idioma === 'subtitulada'
                          ? 'Subtitulada'
                          : (idioma ?? 'No disponible'))
            );

            if ((compra.funcion.edad_minima ?? 0) > 0) {
                escribir('Edad mínima: ' + compra.funcion.edad_minima + ' años.', true);
            }

            if (compra.funcion.requiere_adulto) {
                escribir(
                    'Para esta película se requiere acompañamiento de un adulto.',
                    true
                );
            }

            separar();

            escribir('ENTRADAS', true, 14);

            for (const entrada of compra.entradas) {
                const tipo =
                    entrada.tipo === 'vip'
                        ? 'VIP'
                        : entrada.tipo === 'accesible'
                          ? 'Accesible'
                          : 'Estándar';

                escribir(
                    'Fila ' +
                        entrada.fila +
                        ' - Butaca ' +
                        entrada.numero +
                        ' - ' +
                        tipo +
                        ' - ' +
                        moneda(entrada.precio)
                );
            }
        }

        if (compra.candy.length > 0) {
            separar();

            escribir('CANDY', true, 14);

            for (const item of compra.candy) {
                escribir(
                    item.cantidad + ' x ' + item.nombre + ' - ' + moneda(item.subtotal),
                    true
                );

                if (item.tipo === 'combo') {
                    for (const producto of item.componentes) {
                        escribir(
                            '    ' +
                                producto.cantidad * item.cantidad +
                                ' x ' +
                                producto.nombre
                        );
                    }
                }
            }
        }

        separar();

        if (!soloCandy) {
            escribir('Subtotal entradas: ' + moneda(compra.total_entradas));
        }

        if (soloCandy || compra.candy.length > 0) {
            escribir('Subtotal Candy: ' + moneda(compra.total_candy));
        }

        const cupones = compra.cupones ?? (compra.cupon ? [compra.cupon] : []);

        if (cupones.length > 0) {
            escribir('Subtotal: ' + moneda(compra.total_entradas + compra.total_candy));

            for (const cupon of cupones) {
                const destino =
                    cupon.aplica_a === 'entradas'
                        ? 'solo entradas'
                        : cupon.aplica_a === 'candy'
                          ? 'solo Candy'
                          : 'toda la compra';

                escribir(
                    'Cupón ' +
                        cupon.codigo +
                        ' (' +
                        cupon.porcentaje +
                        '%; ' +
                        destino +
                        ')'
                );
            }

            escribir('Descuento total: -' + moneda(compra.descuento ?? 0));
        }

        if (compra.beneficios?.descuento_paquete) {
            escribir(
                'Beneficio combo con entrada: -' +
                    moneda(compra.beneficios.descuento_paquete)
            );
        }
        if (compra.beneficios?.descuento_canje) {
            escribir('Canje de puntos: -' + moneda(compra.beneficios.descuento_canje));
        }
        for (const canje of compra.beneficios?.canjes ?? []) {
            escribir(
                canje.cantidad +
                    ' x ' +
                    canje.nombre +
                    ': ' +
                    canje.puntos +
                    ' puntos + ' +
                    moneda(canje.importe)
            );
        }
        escribir('TOTAL: ' + moneda(compra.total), true, 15);
        if (compra.pago?.medio) {
            escribir('Medio de pago de prueba: ' + compra.pago.medio);
            escribir('Crédito utilizado: ' + moneda(compra.pago.credito));
            escribir('Importe del pago: ' + moneda(compra.pago.importe));
        }

        /*
         * Si entradas y Candy comparten código,
         * se dibuja una única imagen QR.
         */
        const codigos = [
            ...new Set(compra.comprobantes.map((comprobante) => comprobante.codigo))
        ];

        for (const codigo of codigos) {
            documento.addPage();
            posicionY = 25;

            escribir('COMPROBANTE QR', true, 18);
            escribir(tituloCompra, true, 14);

            if (soloCandy) {
                escribir('Presentá este QR para retirar tu compra de Candy.');
            } else {
                escribir(
                    (compra.funcion.sala_nombre ?? 'Sala no disponible') +
                        ' - ' +
                        fechaFuncion
                );
            }

            if (compra.modalidad === 'prueba') {
                escribir('Compra de prueba: no se cobró dinero real.', true);
            }

            const imagen = await QRCode.toDataURL(codigo, {
                width: 600,
                margin: 4,
                errorCorrectionLevel: 'M'
            });

            const tamanioQr = 85;

            asegurarEspacio(tamanioQr + 10);

            documento.addImage(
                imagen,
                'PNG',
                (anchoPagina - tamanioQr) / 2,
                posicionY,
                tamanioQr,
                tamanioQr
            );

            posicionY += tamanioQr + 10;

            escribir('Código: ' + codigo);
            escribir('Compra: ' + compra.compra_id);

            separar();

            const comprobantes = compra.comprobantes.filter(
                (comprobante) => comprobante.codigo === codigo
            );

            for (const comprobante of comprobantes) {
                const sector =
                    comprobante.tipo === 'entrada'
                        ? 'Ingreso al cine'
                        : 'Retiro de Candy';

                const estado =
                    comprobante.estado === 'utilizado'
                        ? 'Utilizado'
                        : comprobante.estado === 'cancelado'
                          ? 'Cancelado'
                          : 'Pendiente';

                escribir(sector + ': ' + estado, true);
            }

            escribir(
                soloCandy
                    ? 'Este comprobante corresponde al retiro de Candy.'
                    : 'Presentá este QR en el sector correspondiente. ' +
                          'Cada sector registra su validación por separado.'
            );

            escribir(
                'Los estados corresponden al momento de generar ' +
                    'este documento. La validez se comprueba en el sistema.'
            );
        }

        const paginas = documento.getNumberOfPages();

        for (let pagina = 1; pagina <= paginas; pagina++) {
            documento.setPage(pagina);
            documento.setFont('helvetica', 'normal');
            documento.setFontSize(9);
            documento.setTextColor(110, 110, 120);

            documento.text(
                'Cinefilia Club - Página ' + pagina + ' de ' + paginas,
                margen,
                altoPagina - 10
            );
        }

        documento.save('cinefilia-' + compra.compra_id + '.pdf');
    }
}
