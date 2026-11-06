import { Router } from 'express';
import { audit, can } from '../auth';
import { one, q, tx } from '../db';
import { a, HttpError, int, need, num, round, str } from '../http';
import { ensureNormBaseline, snapshotNorm } from '../versions';

export const calcRouter = Router();

/** Запрос 1: сводная норма на изделие (+цена и стоимость). Используется и в документах. */
export async function summaryRows(productId: number) {
  const rows = await q(
    `SELECT s.pk_material, m."Material_code" code, s.material_name name, s.norm, u."Name" unit, t."Name" type_name,
            COALESCE(sp.min_price, m."Base_price") price,
            CASE WHEN sp.min_price IS NOT NULL THEN 'поставщик' ELSE 'базовая' END price_source
     FROM fn_summary_norm($1) s
     JOIN "Material" m ON m."PK_Material" = s.pk_material
     LEFT JOIN "Units_of_measurement" u ON u."PK_Units_of_measurement" = m."PK_Units_of_measurement"
     LEFT JOIN "Type_material" t ON t."PK_Type_material" = m."PK_Type_material"
     LEFT JOIN LATERAL (SELECT MIN("Price") min_price FROM "Suppliers_price_for_the_material" WHERE "PK_Material" = m."PK_Material") sp ON TRUE
     ORDER BY m."PK_Type_material", s.material_name`,
    [productId],
  );
  return rows.map((r) => ({
    ...r,
    norm: round(r.norm, 4),
    cost: r.price != null ? round(r.norm * r.price, 2) : null,
  }));
}

calcRouter.get(
  '/calc/summary/:product',
  a(async (req, res) => {
    const pid = Number(req.params.product);
    const product = await one(`SELECT * FROM "Finished_product" WHERE "PK_Finished_product" = $1`, [pid]);
    if (!product) throw new HttpError(404, 'Изделие не найдено.');
    const rows = await summaryRows(pid);
    const stored = await q(
      `SELECT cr."PK_Consumption_rate" id, cr."PK_Material" pk_material, cr."Significance_of_the_norm" value, cr."Version" version,
              cr."Date" date, cr."PK_Document_status" status_id, ds."Name" status_name
       FROM "Consumption_rate" cr JOIN "Document_status" ds ON ds."PK_Document_status" = cr."PK_Document_status"
       WHERE cr."PK_Finished_product" = $1 AND cr."PK_Detail" IS NULL AND cr."PK_Assembly_unit" IS NULL`,
      [pid],
    );
    const byMat = new Map(stored.map((s) => [s.pk_material, s]));
    const kim = await q(
      `SELECT cl."PK_Cutting_layout" id, cl."Card_code" code, m."Name" material_name, k.kim_percent kim
       FROM "Cutting_layout" cl JOIN "Material" m ON m."PK_Material" = cl."PK_Material"
       JOIN v_kim k ON k."PK_Cutting_layout" = cl."PK_Cutting_layout"
       WHERE cl."PK_Document_status" = 3 AND EXISTS (
         SELECT 1 FROM "Cutting_layout_position" p JOIN "Detail" d ON d."PK_Detail" = p."PK_Detail"
         JOIN "Assembly_unit" au ON au."PK_Assembly_unit" = d."PK_Assembly_unit"
         WHERE p."PK_Cutting_layout" = cl."PK_Cutting_layout" AND au."PK_Finished_product" = $1)
       ORDER BY cl."Card_code"`,
      [pid],
    );
    const total = rows.reduce((s, r) => s + (r.cost ?? 0), 0);
    res.json({ product, rows: rows.map((r) => ({ ...r, stored: byMat.get(r.pk_material) ?? null })), kim, total: round(total, 2) });
  }),
);

// Консолидация: процедура БД pr_consolidate_norms + оформление результата как черновика на согласование
calcRouter.post(
  '/calc/consolidate/:product',
  can('norm:consolidate'),
  a(async (req, res) => {
    const pid = Number(req.params.product);
    const n = await tx(async (c) => {
      const old = await q<{ id: number }>(
        `SELECT "PK_Consumption_rate" id FROM "Consumption_rate" WHERE "PK_Finished_product" = $1 AND "PK_Detail" IS NULL AND "PK_Assembly_unit" IS NULL`,
        [pid], c,
      );
      for (const o of old) {
        await ensureNormBaseline(c, o.id, req.user!.id);
        await snapshotNorm(c, o.id, 'Заменена при консолидации', req.user!.id);
      }
      await q(`CALL pr_consolidate_norms($1)`, [pid], c);
      const fresh = await q<{ id: number }>(
        `UPDATE "Consumption_rate" SET "PK_Document_status" = 1, "PK_Employee" = $2
         WHERE "PK_Finished_product" = $1 AND "PK_Detail" IS NULL AND "PK_Assembly_unit" IS NULL AND "Version" = 'auto'
         RETURNING "PK_Consumption_rate" id`,
        [pid, req.user!.id], c,
      );
      for (const f of fresh) await snapshotNorm(c, f.id, 'Консолидация сводной нормы', req.user!.id);
      await q(`UPDATE "Assembly_unit" SET "Needs_recalc" = FALSE WHERE "PK_Finished_product" = $1`, [pid], c);
      await q(`UPDATE "Finished_product" SET "Needs_recalc" = FALSE WHERE "PK_Finished_product" = $1`, [pid], c);
      return fresh.length;
    });
    await audit(req, 'Консолидация', 'Изделие', `#${pid}: норм ${n}`);
    res.json({ count: n });
  }),
);

// Запрос 6: детали без подетальной нормы или карты раскроя
calcRouter.get(
  '/calc/completeness',
  a(async (req, res) => {
    const params: any[] = [];
    let w = '';
    if (req.query.product) { params.push(req.query.product); w = `WHERE au."PK_Finished_product" = $1`; }
    const rows = await q(
      `SELECT * FROM (
         SELECT d."PK_Detail" id, d."Cipher" cipher, d."Name" name, au."Name" unit_name, fp."Name" product_name, fp."Cipher" product_cipher,
                m."Name" material_name, (m."PK_Type_material" = 1) is_sheet,
                EXISTS (SELECT 1 FROM "Cutting_layout_position" p JOIN "Cutting_layout" cl ON cl."PK_Cutting_layout" = p."PK_Cutting_layout"
                        WHERE p."PK_Detail" = d."PK_Detail" AND cl."PK_Document_status" = 3) has_layout,
                EXISTS (SELECT 1 FROM "Consumption_rate" cr WHERE cr."PK_Detail" = d."PK_Detail" AND cr."PK_Document_status" = 3) has_norm
         FROM "Detail" d
         JOIN "Assembly_unit" au ON au."PK_Assembly_unit" = d."PK_Assembly_unit"
         JOIN "Finished_product" fp ON fp."PK_Finished_product" = au."PK_Finished_product"
         LEFT JOIN "Material" m ON m."PK_Material" = d."PK_Material" ${w}) x
       WHERE (x.is_sheet AND NOT x.has_layout) OR NOT x.has_norm
       ORDER BY product_cipher, cipher`,
      params,
    );
    res.json(rows);
  }),
);

// Запрос 2: расчёт потребности на программу (процедура БД pr_calc_requirements)
calcRouter.post(
  '/calc/requirements/:program',
  can('requirements:calc'),
  a(async (req, res) => {
    const pid = Number(req.params.program);
    const p = await one(`SELECT 1 x FROM "Production_program" WHERE "PK_Production_program" = $1`, [pid]);
    if (!p) throw new HttpError(404, 'Программа не найдена.');
    await q(`CALL pr_calc_requirements($1)`, [pid]);
    await audit(req, 'Расчёт потребности', 'Программа', `#${pid}`);
    res.json({ ok: true });
  }),
);

// ---------- расчёт нормы кромки / КИМ «на лету» для интерфейса ----------
calcRouter.get(
  '/calc/kim',
  a(async (req, res) => {
    const f = await one(`SELECT "Length" l, "Width" w FROM "Tile_format" WHERE "PK_Tile_format" = $1`, [need(int(req.query.format), 'Формат')]);
    if (!f) throw new HttpError(404, 'Формат не найден.');
    const used = num(req.query.area) ?? 0;
    res.json({ kim: round((100 * used) / (f.l * f.w), 2), sheet_area_m2: round((f.l * f.w) / 1e6, 3) });
  }),
);
