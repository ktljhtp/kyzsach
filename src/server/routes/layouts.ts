import { Router } from 'express';
import { PoolClient } from 'pg';
import { audit, can } from '../auth';
import { one, q, tx } from '../db';
import { a, HttpError, int, need, round, str } from '../http';
import { checkTransition, STATUS_NAME } from '../transitions';
import { ensureLayoutBaseline, ensureNormBaseline, markRecalcDetail, snapshotLayout, snapshotNorm } from '../versions';

export const layoutsRouter = Router();

const LIST_SQL = `
  SELECT cl.*, m."Name" material_name, tf."Name" format_name, tf."Length" fmt_length, tf."Width" fmt_width,
         ds."Name" status_name, concat_ws(' ', e."Surname", e."Name") author,
         COALESCE((SELECT SUM(p."Length" * p."Width" * p."Quantity") FROM "Cutting_layout_position" p WHERE p."PK_Cutting_layout" = cl."PK_Cutting_layout"), 0) used_area,
         COALESCE((SELECT SUM(p."Quantity") FROM "Cutting_layout_position" p WHERE p."PK_Cutting_layout" = cl."PK_Cutting_layout"), 0)::int parts
  FROM "Cutting_layout" cl
  LEFT JOIN "Material" m ON m."PK_Material" = cl."PK_Material"
  LEFT JOIN "Tile_format" tf ON tf."PK_Tile_format" = cl."PK_Tile_format"
  LEFT JOIN "Document_status" ds ON ds."PK_Document_status" = cl."PK_Document_status"
  LEFT JOIN "Employee" e ON e."PK_Employee" = cl."PK_Employee"`;

const withKim = (r: any) => ({ ...r, kim: r.fmt_length && r.fmt_width ? round((100 * r.used_area) / (r.fmt_length * r.fmt_width), 2) : null });

// Запрос 3: карта раскроя для заданного материала и формата плиты
layoutsRouter.get(
  '/layouts',
  a(async (req, res) => {
    const where: string[] = [];
    const params: any[] = [];
    if (req.query.material) { params.push(req.query.material); where.push(`cl."PK_Material" = $${params.length}`); }
    if (req.query.format) { params.push(req.query.format); where.push(`cl."PK_Tile_format" = $${params.length}`); }
    if (req.query.status) { params.push(req.query.status); where.push(`cl."PK_Document_status" = $${params.length}`); }
    const rows = await q(`${LIST_SQL} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY cl."Card_code"`, params);
    res.json(rows.map(withKim));
  }),
);

layoutsRouter.get(
  '/layouts/:id',
  a(async (req, res) => {
    const head = await one(`${LIST_SQL} WHERE cl."PK_Cutting_layout" = $1`, [req.params.id]);
    if (!head) throw new HttpError(404, 'Карта раскроя не найдена.');
    const positions = await q(
      `SELECT p.*, d."Name" detail_name, d."Cipher" detail_cipher, 1.0 / NULLIF(p."Quantity", 0) norm
       FROM "Cutting_layout_position" p LEFT JOIN "Detail" d ON d."PK_Detail" = p."PK_Detail"
       WHERE p."PK_Cutting_layout" = $1 ORDER BY p."Item_number", p."PK_Cutting_layout_position"`,
      [req.params.id],
    );
    res.json({ ...withKim(head), positions });
  }),
);

interface LayoutBody {
  Card_code: string;
  PK_Material: number;
  PK_Tile_format: number;
  Description_of_the_diagram?: string;
  positions: { PK_Detail: number | null; Length: number; Width: number; Quantity: number; Description?: string }[];
}

function parseBody(b: any): LayoutBody {
  const positions = Array.isArray(b.positions) ? b.positions : [];
  if (!positions.length) throw new HttpError(400, 'Добавьте в карту хотя бы одну деталь.');
  return {
    Card_code: need(str(b.Card_code), 'Код карты'),
    PK_Material: need(int(b.PK_Material), 'Материал'),
    PK_Tile_format: need(int(b.PK_Tile_format), 'Формат плиты'),
    Description_of_the_diagram: str(b.Description_of_the_diagram) ?? undefined,
    positions: positions.map((p: any, i: number) => ({
      PK_Detail: int(p.PK_Detail),
      Length: need(int(p.Length), `Длина (поз. ${i + 1})`),
      Width: need(int(p.Width), `Ширина (поз. ${i + 1})`),
      Quantity: need(int(p.Quantity), `Количество (поз. ${i + 1})`),
      Description: str(p.Description) ?? undefined,
    })),
  };
}

async function writeLayout(c: PoolClient, id: number | null, b: LayoutBody, empId: number, action: string): Promise<number> {
  const fmt = await one(`SELECT "Length", "Width" FROM "Tile_format" WHERE "PK_Tile_format" = $1`, [b.PK_Tile_format], c);
  const mat = await one(`SELECT "Name", "PK_Type_material" t FROM "Material" WHERE "PK_Material" = $1`, [b.PK_Material], c);
  if (!fmt || !mat) throw new HttpError(400, 'Материал или формат плиты не найдены.');
  if (mat.t !== 1) throw new HttpError(400, 'Карта раскроя составляется только для плитного материала.');

  let used = 0, parts = 0;
  for (const p of b.positions) {
    if (p.Length <= 0 || p.Width <= 0 || p.Quantity <= 0) throw new HttpError(400, 'Размеры и количество должны быть больше нуля.');
    if (Math.min(p.Length, p.Width) > Math.min(fmt.Length, fmt.Width) || Math.max(p.Length, p.Width) > Math.max(fmt.Length, fmt.Width))
      throw new HttpError(400, `Деталь ${p.Length}×${p.Width} не помещается в плиту ${fmt.Length}×${fmt.Width}.`);
    used += p.Length * p.Width * p.Quantity;
    parts += p.Quantity;
  }
  if (used > fmt.Length * fmt.Width) throw new HttpError(400, 'Суммарная площадь деталей больше площади плиты.');
  const kim = round(used / (fmt.Length * fmt.Width), 4);

  const detIds = b.positions.map((p) => p.PK_Detail).filter((x): x is number => !!x);
  if (detIds.length) {
    const bad = await q(
      `SELECT "Name" FROM "Detail" WHERE "PK_Detail" = ANY($1::int[]) AND "PK_Material" IS DISTINCT FROM $2`,
      [detIds, b.PK_Material], c,
    );
    if (bad.length) throw new HttpError(400, `Деталь «${bad[0].Name}» выполнена из другого материала.`);
  }

  if (id) {
    await ensureLayoutBaseline(c, id, empId);
    // нормы, порождённые позициями этой карты, пересоздаются; прежние сохраняются в истории
    const old = await q<{ id: number }>(`SELECT "PK_Consumption_rate" id FROM "Consumption_rate" WHERE "PK_Cutting_layout" = $1 AND "PK_Cutting_layout_position" IS NOT NULL`, [id], c);
    for (const n of old) {
      await ensureNormBaseline(c, n.id, empId);
      await snapshotNorm(c, n.id, 'Удалена при изменении карты раскроя', empId);
    }
    const oldDetails = await q<{ d: number }>(`SELECT "PK_Detail" d FROM "Cutting_layout_position" WHERE "PK_Cutting_layout" = $1 AND "PK_Detail" IS NOT NULL`, [id], c);
    for (const o of oldDetails) await markRecalcDetail(c, o.d);
    await q(`DELETE FROM "Consumption_rate" WHERE "PK_Cutting_layout" = $1 AND "PK_Cutting_layout_position" IS NOT NULL`, [id], c);
    await q(`DELETE FROM "Cutting_layout_position" WHERE "PK_Cutting_layout" = $1`, [id], c);
    await q(
      `UPDATE "Cutting_layout" SET "Card_code"=$1,"Number_of_parts_from_a_single_sheet"=$2,"Material_utilization_factor"=$3,
         "Description_of_the_diagram"=$4,"PK_Document_status"=1,"PK_Material"=$5,"PK_Tile_format"=$6,"PK_Employee"=$7,"Date_of_approval"=NULL
       WHERE "PK_Cutting_layout"=$8`,
      [b.Card_code, parts, kim, b.Description_of_the_diagram ?? null, b.PK_Material, b.PK_Tile_format, empId, id], c,
    );
  } else {
    const r = await one(
      `INSERT INTO "Cutting_layout" ("Card_code","Number_of_parts_from_a_single_sheet","Material_utilization_factor",
         "Description_of_the_diagram","PK_Document_status","PK_Material","PK_Tile_format","PK_Employee")
       VALUES ($1,$2,$3,$4,1,$5,$6,$7) RETURNING "PK_Cutting_layout" id`,
      [b.Card_code, parts, kim, b.Description_of_the_diagram ?? null, b.PK_Material, b.PK_Tile_format, empId], c,
    );
    id = r!.id;
  }

  // позиции + автоматический расчёт подетальных норм: 1 / количество деталей из плиты
  for (const [i, p] of b.positions.entries()) {
    const pos = await one(
      `INSERT INTO "Cutting_layout_position" ("Item_number","Length","Width","Quantity","Description","PK_Cutting_layout","PK_Detail")
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING "PK_Cutting_layout_position" id`,
      [i + 1, p.Length, p.Width, p.Quantity, p.Description ?? null, id, p.PK_Detail], c,
    );
    if (p.PK_Detail) {
      const dn = await one(`SELECT "Name" FROM "Detail" WHERE "PK_Detail" = $1`, [p.PK_Detail], c);
      const nid = await one(
        `INSERT INTO "Consumption_rate" ("Consumption_code","Significance_of_the_norm","Loss_coefficient","Version","Date","Description",
           "PK_Document_status","PK_Detail","PK_Material","PK_Cutting_layout_position","PK_Cutting_layout","PK_Employee")
         VALUES ($1,$2,1.00,'v1.0',CURRENT_DATE,$3,1,$4,$5,$6,$7,$8) RETURNING "PK_Consumption_rate" id`,
        [`ПН-${b.Card_code}-${i + 1}`.slice(0, 20), round(1 / p.Quantity, 6), `Норма ${mat.Name} на «${dn?.Name}» (1/${p.Quantity} листа)`,
         p.PK_Detail, b.PK_Material, pos!.id, id, empId], c,
      );
      await snapshotNorm(c, nid!.id, 'Создана по карте раскроя', empId);
      await markRecalcDetail(c, p.PK_Detail);
    }
  }
  await snapshotLayout(c, id!, action, empId);
  return id!;
}

layoutsRouter.post(
  '/layouts',
  can('norm:edit'),
  a(async (req, res) => {
    const b = parseBody(req.body);
    const id = await tx((c) => writeLayout(c, null, b, req.user!.id, 'Создание'));
    await audit(req, 'Создание', 'Карта раскроя', b.Card_code);
    res.json({ id });
  }),
);

layoutsRouter.put(
  '/layouts/:id',
  can('norm:edit'),
  a(async (req, res) => {
    const b = parseBody(req.body);
    await tx((c) => writeLayout(c, Number(req.params.id), b, req.user!.id, 'Изменение'));
    await audit(req, 'Изменение', 'Карта раскроя', `${b.Card_code} (возврат в черновик)`);
    res.json({ ok: true });
  }),
);

layoutsRouter.delete(
  '/layouts/:id',
  can('norm:edit'),
  a(async (req, res) => {
    await tx(async (c) => {
      const ds = await q<{ d: number }>(`SELECT "PK_Detail" d FROM "Cutting_layout_position" WHERE "PK_Cutting_layout" = $1 AND "PK_Detail" IS NOT NULL`, [req.params.id], c);
      for (const d of ds) await markRecalcDetail(c, d.d);
      await q(`DELETE FROM "Consumption_rate" WHERE "PK_Cutting_layout" = $1`, [req.params.id], c);
      await q(`DELETE FROM "Cutting_layout" WHERE "PK_Cutting_layout" = $1`, [req.params.id], c);
    });
    await audit(req, 'Удаление', 'Карта раскроя', `#${req.params.id}`);
    res.json({ ok: true });
  }),
);

// смена статуса карты: статусы порождённых норм меняются вместе с ней
layoutsRouter.post(
  '/layouts/:id/status',
  can('norm:edit'),
  a(async (req, res) => {
    const id = Number(req.params.id);
    const to = need(int(req.body.to), 'Статус');
    await tx(async (c) => {
      const cur = await one(`SELECT "PK_Document_status" s, "Card_code" code FROM "Cutting_layout" WHERE "PK_Cutting_layout" = $1 FOR UPDATE`, [id], c);
      if (!cur) throw new HttpError(404, 'Карта раскроя не найдена.');
      checkTransition(req.user!, cur.s, to);
      if (to === 3) {
        const dup = await one(
          `SELECT cl."Card_code", d."Name" FROM "Cutting_layout_position" p
           JOIN "Cutting_layout" cl ON cl."PK_Cutting_layout" = p."PK_Cutting_layout" AND cl."PK_Document_status" = 3 AND cl."PK_Cutting_layout" <> $1
           JOIN "Detail" d ON d."PK_Detail" = p."PK_Detail"
           WHERE p."PK_Detail" IN (SELECT "PK_Detail" FROM "Cutting_layout_position" WHERE "PK_Cutting_layout" = $1 AND "PK_Detail" IS NOT NULL) LIMIT 1`,
          [id], c,
        );
        if (dup) throw new HttpError(409, `Деталь «${dup.Name}» уже раскроена в утверждённой карте ${dup.Card_code}. Переведите её в архив.`);
      }
      await ensureLayoutBaseline(c, id, req.user!.id);
      await q(`UPDATE "Cutting_layout" SET "PK_Document_status"=$1, "Date_of_approval" = CASE WHEN $1 = 3 THEN CURRENT_DATE ELSE "Date_of_approval" END WHERE "PK_Cutting_layout"=$2`, [to, id], c);
      const norms = await q<{ id: number }>(`SELECT "PK_Consumption_rate" id FROM "Consumption_rate" WHERE "PK_Cutting_layout" = $1 AND "PK_Cutting_layout_position" IS NOT NULL`, [id], c);
      for (const n of norms) {
        await ensureNormBaseline(c, n.id, req.user!.id);
        await q(`UPDATE "Consumption_rate" SET "PK_Document_status"=$1, "Date"=CURRENT_DATE WHERE "PK_Consumption_rate"=$2`, [to, n.id], c);
        await snapshotNorm(c, n.id, `Статус карты: ${STATUS_NAME[cur.s]} → ${STATUS_NAME[to]}`, req.user!.id);
      }
      await snapshotLayout(c, id, `Статус: ${STATUS_NAME[cur.s]} → ${STATUS_NAME[to]}`, req.user!.id);
      const ds = await q<{ d: number }>(`SELECT "PK_Detail" d FROM "Cutting_layout_position" WHERE "PK_Cutting_layout" = $1 AND "PK_Detail" IS NOT NULL`, [id], c);
      for (const d of ds) await markRecalcDetail(c, d.d);
      await audit(req, 'Статус карты', cur.code, `${STATUS_NAME[cur.s]} → ${STATUS_NAME[to]}`);
    });
    res.json({ ok: true });
  }),
);

// возврат к предыдущей версии карты
layoutsRouter.post(
  '/layouts/:id/restore',
  can('norm:approve'),
  a(async (req, res) => {
    const id = Number(req.params.id);
    const v = await one(`SELECT * FROM "Norm_version" WHERE "PK_Norm_version" = $1 AND "Entity" = 'layout' AND "Entity_id" = $2`, [req.body.versionId, id]);
    if (!v) throw new HttpError(404, 'Версия не найдена.');
    const s = v.Snapshot;
    const b = parseBody({ ...s, positions: s.positions });
    await tx((c) => writeLayout(c, id, b, req.user!.id, `Восстановление версии ${v.Version_no}`));
    await audit(req, 'Восстановление', 'Карта раскроя', `${b.Card_code}: версия ${v.Version_no}`);
    res.json({ ok: true });
  }),
);
