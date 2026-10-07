// Genera un .xlsx con celdas de texto y números, sin macros ni fórmulas.
// Los archivos internos usan ZIP sin compresión (método 0 de OpenXML).
const encoder = new TextEncoder();
const xml = (valor: unknown): string =>
    String(valor ?? '')
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
const columna = (indice: number): string => {
    let texto = '';
    for (let n = indice + 1; n > 0; n = Math.floor((n - 1) / 26)) {
        texto = String.fromCharCode(65 + ((n - 1) % 26)) + texto;
    }
    return texto;
};
function crc32(datos: Uint8Array): number {
    let crc = 0xffffffff;
    for (const byte of datos) {
        crc ^= byte;
        for (let i = 0; i < 8; i++) {
            crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
        }
    }
    return (crc ^ 0xffffffff) >>> 0;
}
function zip(archivos: Record<string, string>): Uint8Array {
    const partes: Uint8Array[] = [];
    const centrales: Uint8Array[] = [];
    let offset = 0;
    for (const [ruta, contenido] of Object.entries(archivos)) {
        const nombre = encoder.encode(ruta);
        const datos = encoder.encode(contenido);
        const crc = crc32(datos);
        const local = new Uint8Array(30 + nombre.length);
        const l = new DataView(local.buffer);
        l.setUint32(0, 0x04034b50, true);
        l.setUint16(4, 20, true);
        l.setUint16(6, 0x0800, true);
        l.setUint16(12, 33, true);
        l.setUint32(14, crc, true);
        l.setUint32(18, datos.length, true);
        l.setUint32(22, datos.length, true);
        l.setUint16(26, nombre.length, true);
        local.set(nombre, 30);
        const central = new Uint8Array(46 + nombre.length);
        const c = new DataView(central.buffer);
        c.setUint32(0, 0x02014b50, true);
        c.setUint16(4, 20, true);
        c.setUint16(6, 20, true);
        c.setUint16(8, 0x0800, true);
        c.setUint16(14, 33, true);
        c.setUint32(16, crc, true);
        c.setUint32(20, datos.length, true);
        c.setUint32(24, datos.length, true);
        c.setUint16(28, nombre.length, true);
        c.setUint32(42, offset, true);
        central.set(nombre, 46);
        partes.push(local, datos);
        centrales.push(central);
        offset += local.length + datos.length;
    }
    const tamanoCentral = centrales.reduce((s, c) => s + c.length, 0);
    const fin = new Uint8Array(22);
    const e = new DataView(fin.buffer);
    e.setUint32(0, 0x06054b50, true);
    e.setUint16(8, centrales.length, true);
    e.setUint16(10, centrales.length, true);
    e.setUint32(12, tamanoCentral, true);
    e.setUint32(16, offset, true);
    const resultado = new Uint8Array(offset + tamanoCentral + fin.length);
    let posicion = 0;
    for (const p of [...partes, ...centrales, fin]) {
        resultado.set(p, posicion);
        posicion += p.length;
    }
    return resultado;
}
export function crearExcel(
    hojas: { nombre: string; filas: Record<string, unknown>[] }[],
): Uint8Array {
    const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
    const relacion = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    const archivos: Record<string, string> = {
        '_rels/.rels': `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${relacion}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    };
    const tipos = [
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
        '<Default Extension="xml" ContentType="application/xml"/>',
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
    ];
    const sheets: string[] = [];
    const relaciones: string[] = [];
    hojas.forEach((hoja, indice) => {
        const numero = indice + 1;
        const claves = [...new Set(hoja.filas.flatMap((f) => Object.keys(f)))];
        const filas = [claves, ...hoja.filas.map((f) => claves.map((k) => f[k]))];
        const datos = filas
            .map(
                (fila, i) =>
                    `<row r="${i + 1}">${fila
                        .map((v, j) => {
                            const ref = columna(j) + (i + 1);
                            return typeof v === 'number' && Number.isFinite(v)
                                ? `<c r="${ref}" t="n"><v>${v}</v></c>`
                                : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(v)}</t></is></c>`;
                        })
                        .join('')}</row>`,
            )
            .join('');
        archivos[`xl/worksheets/sheet${numero}.xml`] =
            `<worksheet xmlns="${ns}"><sheetData>${datos}</sheetData></worksheet>`;
        tipos.push(
            `<Override PartName="/xl/worksheets/sheet${numero}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
        );
        sheets.push(`<sheet name="${xml(hoja.nombre)}" sheetId="${numero}" r:id="rId${numero}"/>`);
        relaciones.push(
            `<Relationship Id="rId${numero}" Type="${relacion}/worksheet" Target="worksheets/sheet${numero}.xml"/>`,
        );
    });
    archivos['[Content_Types].xml'] =
        `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${tipos.join('')}</Types>`;
    archivos['xl/workbook.xml'] =
        `<workbook xmlns="${ns}" xmlns:r="${relacion}"><sheets>${sheets.join('')}</sheets></workbook>`;
    archivos['xl/_rels/workbook.xml.rels'] =
        `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relaciones.join('')}</Relationships>`;
    return zip(archivos);
}
