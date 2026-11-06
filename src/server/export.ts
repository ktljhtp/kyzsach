import ExcelJS from 'exceljs';

export interface DocColumn {
  key: string;
  title: string;
  type?: 'text' | 'num' | 'int' | 'pct';
  digits?: number;
  width?: number;
}
export interface DocDef {
  type: string;
  title: string;
  subtitle?: string;
  filename: string;
  meta: [string, string][];
  columns: DocColumn[];
  rows: Record<string, any>[];
  footer?: [string, string][];
  notes?: string[];
  signatures?: string[];
}

export async function docToXlsx(doc: DocDef): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ИС «Нормы-М»';
  const ws = wb.addWorksheet(doc.title.slice(0, 31));
  const cols = doc.columns.length;
  const merge = (r: number) => cols > 1 && ws.mergeCells(r, 1, r, cols);

  let r = 1;
  ws.getCell(r, 1).value = doc.title.toUpperCase();
  ws.getCell(r, 1).font = { bold: true, size: 14 };
  ws.getCell(r, 1).alignment = { horizontal: 'center' };
  merge(r++);
  if (doc.subtitle) {
    ws.getCell(r, 1).value = doc.subtitle;
    ws.getCell(r, 1).alignment = { horizontal: 'center' };
    merge(r++);
  }
  r++;
  for (const [k, v] of doc.meta) {
    ws.getCell(r, 1).value = `${k}: ${v}`;
    merge(r++);
  }
  r++;

  const headRow = ws.getRow(r++);
  doc.columns.forEach((c, i) => {
    const cell = headRow.getCell(i + 1);
    cell.value = c.title;
    cell.font = { bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFF4' } };
    cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  });

  for (const row of doc.rows) {
    const xr = ws.getRow(r++);
    doc.columns.forEach((c, i) => {
      const cell = xr.getCell(i + 1);
      const v = row[c.key];
      cell.value = v === undefined ? null : v;
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
      if (c.type && c.type !== 'text') {
        cell.alignment = { horizontal: 'right' };
        const d = c.type === 'int' ? 0 : c.digits ?? (c.type === 'pct' ? 1 : 3);
        cell.numFmt = d ? `#,##0.${'0'.repeat(d)}` : '#,##0';
      } else cell.alignment = { wrapText: true, vertical: 'top' };
      if (row._flag && c.key === doc.columns[doc.columns.length - 1].key) cell.font = { color: { argb: 'FFC62828' }, bold: true };
    });
  }

  if (doc.footer?.length) {
    r++;
    for (const [k, v] of doc.footer) {
      ws.getCell(r, 1).value = `${k}: ${v}`;
      ws.getCell(r, 1).font = { bold: true };
      merge(r++);
    }
  }
  if (doc.notes?.length) {
    r++;
    for (const n of doc.notes) {
      ws.getCell(r, 1).value = n;
      ws.getCell(r, 1).font = { italic: true };
      merge(r++);
    }
  }
  if (doc.signatures?.length) {
    r++;
    for (const s of doc.signatures) {
      ws.getCell(r, 1).value = `${s}: ____________   Дата: ____________`;
      merge(r++);
    }
  }

  doc.columns.forEach((c, i) => {
    ws.getColumn(i + 1).width = c.width ?? (c.type && c.type !== 'text' ? 16 : i === 0 ? 14 : 30);
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}
