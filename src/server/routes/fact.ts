import express, { Router } from 'express';
import ExcelJS from 'exceljs';
import { audit, can } from '../auth';
import { one, q, tx } from '../db';
import { a, HttpError, int, need, num, str } from '../http';

export const factRouter = Router();

export const periodDate = (p: any): string => {
  const m = /^(\d{4})-(\d{2})/.exec(String(p ?? ''));
  if (!m) throw new HttpError(400, 'Укажите период в формате ГГГГ-ММ.');
  return `${m[1]}-${m[2]}-01`;
};

factRouter.get(
  '/fact',
  a(async (req, res) => {
    const p = periodDate(req.query.period);
    const outputs = await q(
      `SELECT o."PK_Actual_output" id, o."Quantity" quantity, o."PK_Finished_product", f."Cipher" cipher, f."Name" product_name
       FROM "Actual_output" o JOIN "Finished_product" f ON f."PK_Finished_product" = o."PK_Finished_product"
       WHERE o."Period" = $1 ORDER BY f."Cipher"`,
      [p],
    );
    const consumption = await q(
      `SELECT c."PK_Actual_consumption" id, c."Quantity" quantity, c."Workshop" workshop, c."Reason" reason, c."PK_Finished_product", c."PK_Material",
              f."Cipher" cipher, f."Name" product_name, m."Name" material_name, m."Material_code" code, u."Name" unit_name
       FROM "Actual_consumption" c
       JOIN "Finished_product" f ON f."PK_Finished_product" = c."PK_Finished_product"
       JOIN "Material" m ON m."PK_Material" = c."PK_Material"
       LEFT JOIN "Units_of_measurement" u ON u."PK_Units_of_measurement" = m."PK_Units_of_measurement"
       WHERE c."Period" = $1 ORDER BY f."Cipher", m."Name"`,
      [p],
    );
    res.json({ outputs, consumption });
  }),
);

factRouter.put(
  '/fact/output',
  can('fact:edit'),
  a(async (req, res) => {
    const b = req.body;
    const qty = need(num(b.Quantity), 'Количество');
    if (qty < 0) throw new HttpError(400, 'Количество не может быть отрицательным.');
    await q(
      `INSERT INTO "Actual_output" ("Period","Quantity","PK_Finished_product") VALUES ($1,$2,$3)
       ON CONFLICT ("Period","PK_Finished_product") DO UPDATE SET "Quantity" = EXCLUDED."Quantity"`,
      [periodDate(b.period), qty, need(int(b.PK_Finished_product), 'Изделие')],
    );
    await audit(req, 'Факт: выпуск', 'Изделие', `#${b.PK_Finished_product} ${b.period}: ${qty}`);
    res.json({ ok: true });
  }),
);
factRouter.delete(
  '/fact/output/:id',
  can('fact:edit'),
  a(async (req, res) => {
    await q(`DELETE FROM "Actual_output" WHERE "PK_Actual_output" = $1`, [req.params.id]);
    res.json({ ok: true });
  }),
);

factRouter.post(
  '/fact/consumption',
  can('fact:edit'),
  a(async (req, res) => {
    const b = req.body;
    const qty = need(num(b.Quantity), 'Списано');
    if (qty < 0) throw new HttpError(400, 'Количество не может быть отрицательным.');
    await q(
      `INSERT INTO "Actual_consumption" ("Period","Quantity","Workshop","Reason","PK_Finished_product","PK_Material") VALUES ($1,$2,$3,$4,$5,$6)`,
      [periodDate(b.period), qty, str(b.Workshop), str(b.Reason), need(int(b.PK_Finished_product), 'Изделие'), need(int(b.PK_Material), 'Материал')],
    );
    await audit(req, 'Факт: расход', 'Материал', `#${b.PK_Material} ${b.period}: ${qty}`);
    res.json({ ok: true });
  }),
);
factRouter.put(
  '/fact/consumption/:id',
  can('fact:edit'),
  a(async (req, res) => {
    const qty = need(num(req.body.Quantity), 'Списано');
    await q(`UPDATE "Actual_consumption" SET "Quantity"=$1,"Workshop"=$2,"Reason"=$3 WHERE "PK_Actual_consumption"=$4`, [qty, str(req.body.Workshop), str(req.body.Reason), req.params.id]);
    res.json({ ok: true });
  }),
);
factRouter.delete(
  '/fact/consumption/:id',
  can('fact:edit'),
  a(async (req, res) => {
    await q(`DELETE FROM "Actual_consumption" WHERE "PK_Actual_consumption" = $1`, [req.params.id]);
    res.json({ ok: true });
  }),
);

// причина перерасхода — по паре «изделие + материал» за период
factRouter.put(
  '/fact/reason',
  can('fact:edit'),
  a(async (req, res) => {
    const b = req.body;
    const n = await q(
      `UPDATE "Actual_consumption" SET "Reason" = $1 WHERE "Period" = $2 AND "PK_Finished_product" = $3 AND "PK_Material" = $4 RETURNING 1`,
      [str(b.Reason), periodDate(b.period), need(int(b.PK_Finished_product), 'Изделие'), need(int(b.PK_Material), 'Материал')],
    );
    if (!n.length) throw new HttpError(400, 'Нет данных о фактическом расходе по этой позиции.');
    res.json({ ok: true });
  }),
);

// ---------- импорт факта из Excel: Шифр | Материал (код или наименование) | Списано | Цех ----------
const cellText = (v: any): string => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    if ('result' in v) return cellText((v as any).result);
    if ('text' in v) return String((v as any).text).trim();
    if ('richText' in v) return (v as any).richText.map((r: any) => r.text).join('').trim();
  }
  return String(v).trim();
};

factRouter.post(
  '/fact/import',
  can('fact:edit'),
  express.raw({ type: '*/*', limit: '10mb' }),
  a(async (req, res) => {
    const period = periodDate(req.query.period);
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw new HttpError(400, 'Файл не получен.');
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(req.body as any);
    } catch {
      throw new HttpError(400, 'Не удалось прочитать файл. Нужен Excel (.xlsx).');
    }
    const ws = wb.worksheets[0];
    if (!ws) throw new HttpError(400, 'В файле нет листов.');

    // определяем колонки по заголовкам; иначе — по порядку
    const head = ws.getRow(1);
    let cCipher = 1, cMat = 2, cQty = 3, cShop = 4;
    head.eachCell((cell, i) => {
      const t = cellText(cell.value).toLowerCase();
      if (/шифр/.test(t)) cCipher = i;
      else if (/материал|код/.test(t)) cMat = i;
      else if (/списан|колич|расход/.test(t)) cQty = i;
      else if (/цех/.test(t)) cShop = i;
    });

    const products = await q(`SELECT "PK_Finished_product" id, lower("Cipher") c FROM "Finished_product"`);
    const mats = await q(`SELECT "PK_Material" id, lower("Material_code") c, lower("Name") n FROM "Material"`);
    const errors: string[] = [];
    const rows: { p: number; m: number; qty: number; shop: string | null }[] = [];

    ws.eachRow((row, rn) => {
      if (rn === 1) return;
      const cipher = cellText(row.getCell(cCipher).value).toLowerCase();
      const mat = cellText(row.getCell(cMat).value).toLowerCase();
      const qty = Number(String(cellText(row.getCell(cQty).value)).replace(',', '.'));
      if (!cipher && !mat) return;
      const p = products.find((x) => x.c === cipher);
      const m = mats.find((x) => x.c === mat || x.n === mat);
      if (!p) return void errors.push(`Строка ${rn}: изделие «${cipher}» не найдено`);
      if (!m) return void errors.push(`Строка ${rn}: материал «${mat}» не найден`);
      if (!Number.isFinite(qty) || qty < 0) return void errors.push(`Строка ${rn}: некорректное количество`);
      rows.push({ p: p.id, m: m.id, qty, shop: str(cellText(row.getCell(cShop).value)) });
    });

    if (rows.length) {
      await tx(async (c) => {
        for (const r of rows)
          await q(`INSERT INTO "Actual_consumption" ("Period","Quantity","Workshop","PK_Finished_product","PK_Material") VALUES ($1,$2,$3,$4,$5)`, [period, r.qty, r.shop, r.p, r.m], c);
      });
    }
    await audit(req, 'Импорт факта', 'Расход материалов', `${period}: ${rows.length} строк, ошибок ${errors.length}`);
    res.json({ imported: rows.length, errors: errors.slice(0, 20), errorCount: errors.length });
  }),
);
