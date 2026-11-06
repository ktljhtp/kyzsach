import { Router } from 'express';
import { audit, can } from '../auth';
import { one, q, tx } from '../db';
import { a, HttpError, int, need, num, round, str } from '../http';
import { checkTransition, STATUS_NAME } from '../transitions';
import { ensureNormBaseline, markRecalcForNorm, snapshotNorm } from '../versions';

export const normsRouter = Router();

const NORM_LIST = `
  SELECT cr.*, ds."Name" status_name, m."Name" material_name, u."Name" unit_name,
         CASE WHEN cr."PK_Detail" IS NOT NULL THEN 'Подетальная'
              WHEN cr."PK_Assembly_unit" IS NOT NULL THEN 'Специфицированная' ELSE 'Сводная' END kind,
         COALESCE(d."Name", au."Name", fp."Name") target_name,
         COALESCE(cr."PK_Finished_product", au."PK_Finished_product", au2."PK_Finished_product") product_id,
         concat_ws(' ', e."Surname", e."Name") author
  FROM "Consumption_rate" cr
  LEFT JOIN "Document_status" ds ON ds."PK_Document_status" = cr."PK_Document_status"
  LEFT JOIN "Material" m ON m."PK_Material" = cr."PK_Material"
  LEFT JOIN "Units_of_measurement" u ON u."PK_Units_of_measurement" = m."PK_Units_of_measurement"
  LEFT JOIN "Detail" d ON d."PK_Detail" = cr."PK_Detail"
  LEFT JOIN "Assembly_unit" au ON au."PK_Assembly_unit" = cr."PK_Assembly_unit"
  LEFT JOIN "Assembly_unit" au2 ON au2."PK_Assembly_unit" = d."PK_Assembly_unit"
  LEFT JOIN "Finished_product" fp ON fp."PK_Finished_product" = cr."PK_Finished_product"
  LEFT JOIN "Employee" e ON e."PK_Employee" = cr."PK_Employee"`;

normsRouter.get(
  '/norms',
  a(async (req, res) => {
    const where: string[] = [];
    const params: any[] = [];
    const add = (sql: string, v: any) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };
    if (req.query.status) add('cr."PK_Document_status" = ?', req.query.status);
    if (req.query.material) add('cr."PK_Material" = ?', req.query.material);
    if (req.query.product) add('COALESCE(cr."PK_Finished_product", au."PK_Finished_product", au2."PK_Finished_product") = ?', req.query.product);
    if (req.query.kind) {
      const k = String(req.query.kind);
      where.push(k === 'detail' ? 'cr."PK_Detail" IS NOT NULL' : k === 'assembly' ? 'cr."PK_Assembly_unit" IS NOT NULL' : 'cr."PK_Detail" IS NULL AND cr."PK_Assembly_unit" IS NULL');
    }
    res.json(await q(`${NORM_LIST} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY cr."PK_Consumption_rate"`, params));
  }),
);

// расчёт нормы кромки на деталь (показатель 3) — через функцию БД fn_edge_norm
normsRouter.get(
  '/norms/edge-calc',
  a(async (req, res) => {
    const d = need(int(req.query.detail), 'Деталь');
    const m = need(int(req.query.material), 'Кромка');
    const r = await one(
      `SELECT fn_edge_norm($1, $2) AS norm, rt."PK_Edge_banding_consumption_rate" rate_id, rt."Loss_coefficient" loss
       FROM "Material" mm JOIN "Edge_banding_consumption_rate" rt ON rt."PK_Edge_type" = mm."PK_Edge_type"
       WHERE mm."PK_Material" = $2 LIMIT 1`,
      [d, m],
    );
    if (!r || r.norm === null) throw new HttpError(400, 'Для выбранной кромки нет норматива расхода или не задана длина рулона.');
    res.json({ norm: r.norm, rate_id: r.rate_id, loss: r.loss });
  }),
);

const codeFor = (b: any, tgt: string) => str(b.Consumption_code) ?? `Н-${Date.now().toString(36).toUpperCase()}-${tgt}`.slice(0, 20);

function target(b: any) {
  const d = int(b.PK_Detail), au = int(b.PK_Assembly_unit), fp = int(b.PK_Finished_product);
  const cnt = [d, au, fp].filter((x) => x !== null).length;
  if (cnt !== 1) throw new HttpError(400, 'Выберите ровно один объект нормы: деталь, сборочную единицу или изделие.');
  return { d, au, fp, tag: d ? 'Д' : au ? 'СЕ' : 'И' };
}

normsRouter.post(
  '/norms',
  can('norm:edit'),
  a(async (req, res) => {
    const b = req.body;
    const t = target(b);
    const id = await tx(async (c) => {
      const r = await one(
        `INSERT INTO "Consumption_rate" ("Consumption_code","Significance_of_the_norm","Loss_coefficient","Version","Date","Description",
           "PK_Document_status","PK_Detail","PK_Assembly_unit","PK_Finished_product","PK_Material","PK_Edge_banding_consumption_rate","PK_Employee")
         VALUES ($1,$2,$3,'v1.0',CURRENT_DATE,$4,1,$5,$6,$7,$8,$9,$10) RETURNING "PK_Consumption_rate" id`,
        [codeFor(b, t.tag), need(num(b.Significance_of_the_norm), 'Значение нормы'), num(b.Loss_coefficient) ?? 1, str(b.Description),
         t.d, t.au, t.fp, need(int(b.PK_Material), 'Материал'), int(b.PK_Edge_banding_consumption_rate), req.user!.id],
        c,
      );
      await snapshotNorm(c, r!.id, 'Создание', req.user!.id);
      await markRecalcForNorm(c, r!.id);
      return r!.id;
    });
    await audit(req, 'Создание', 'Норма', `#${id}`);
    res.json({ id });
  }),
);

async function loadEditable(id: number) {
  const cur = await one(`SELECT * FROM "Consumption_rate" WHERE "PK_Consumption_rate" = $1`, [id]);
  if (!cur) throw new HttpError(404, 'Норма не найдена.');
  if (cur.PK_Cutting_layout_position) throw new HttpError(400, 'Эта норма рассчитана по карте раскроя — измените карту раскроя.');
  return cur;
}

normsRouter.put(
  '/norms/:id',
  can('norm:edit'),
  a(async (req, res) => {
    const id = Number(req.params.id);
    const b = req.body;
    await loadEditable(id);
    await tx(async (c) => {
      await ensureNormBaseline(c, id, req.user!.id);
      await markRecalcForNorm(c, id);
      await q(
        `UPDATE "Consumption_rate" SET "Significance_of_the_norm"=$1,"Loss_coefficient"=$2,"Description"=$3,"PK_Material"=$4,
           "PK_Edge_banding_consumption_rate"=$5,"Consumption_code"=COALESCE($6,"Consumption_code"),"PK_Document_status"=1,"Date"=CURRENT_DATE,"PK_Employee"=$7
         WHERE "PK_Consumption_rate"=$8`,
        [need(num(b.Significance_of_the_norm), 'Значение нормы'), num(b.Loss_coefficient) ?? 1, str(b.Description), need(int(b.PK_Material), 'Материал'),
         int(b.PK_Edge_banding_consumption_rate), str(b.Consumption_code), req.user!.id, id],
        c,
      );
      await snapshotNorm(c, id, 'Изменение (возврат в черновик)', req.user!.id);
    });
    await audit(req, 'Изменение', 'Норма', `#${id}`);
    res.json({ ok: true });
  }),
);

normsRouter.delete(
  '/norms/:id',
  can('norm:edit'),
  a(async (req, res) => {
    const id = Number(req.params.id);
    const cur = await loadEditable(id);
    if (![1, 4].includes(cur.PK_Document_status)) throw new HttpError(409, 'Удалять можно только черновики и архивные нормы.');
    await tx(async (c) => {
      await ensureNormBaseline(c, id, req.user!.id);
      await snapshotNorm(c, id, 'Удалена', req.user!.id);
      await q(`DELETE FROM "Consumption_rate" WHERE "PK_Consumption_rate" = $1`, [id], c);
    });
    await audit(req, 'Удаление', 'Норма', `#${id}`);
    res.json({ ok: true });
  }),
);

normsRouter.post(
  '/norms/:id/status',
  can('norm:edit'),
  a(async (req, res) => {
    const id = Number(req.params.id);
    const to = need(int(req.body.to), 'Статус');
    await tx(async (c) => {
      const cur = await one(`SELECT "PK_Document_status" s, "Consumption_code" code, "PK_Cutting_layout_position" pos FROM "Consumption_rate" WHERE "PK_Consumption_rate" = $1 FOR UPDATE`, [id], c);
      if (!cur) throw new HttpError(404, 'Норма не найдена.');
      if (cur.pos) throw new HttpError(400, 'Статус нормы по карте раскроя меняется вместе со статусом карты.');
      checkTransition(req.user!, cur.s, to);
      await ensureNormBaseline(c, id, req.user!.id);
      await q(`UPDATE "Consumption_rate" SET "PK_Document_status"=$1, "Date"=CURRENT_DATE WHERE "PK_Consumption_rate"=$2`, [to, id], c);
      await snapshotNorm(c, id, `Статус: ${STATUS_NAME[cur.s]} → ${STATUS_NAME[to]}`, req.user!.id);
      await markRecalcForNorm(c, id);
      await audit(req, 'Статус нормы', cur.code, `${STATUS_NAME[cur.s]} → ${STATUS_NAME[to]}`);
    });
    res.json({ ok: true });
  }),
);

// ---------- история версий (нормы и карты раскроя) ----------
// ?entity=norm&id=…  — версии одной нормы/карты;  ?product=…  — все изменения по изделию (запрос 5)
normsRouter.get(
  '/versions',
  a(async (req, res) => {
    const where: string[] = [];
    const params: any[] = [];
    if (req.query.entity && req.query.id) {
      params.push(req.query.entity, req.query.id);
      where.push(`v."Entity" = $1 AND v."Entity_id" = $2`);
    }
    if (req.query.product) { params.push(req.query.product); where.push(`v."PK_Finished_product" = $${params.length}`); }
    if (!where.length) throw new HttpError(400, 'Укажите норму, карту или изделие.');
    res.json(
      await q(
        `SELECT v."PK_Norm_version" id, v."Entity" entity, v."Entity_id" entity_id, v."Version_no" version_no, v."Action" action,
                v."Changed_at" changed_at, concat_ws(' ', e."Surname", e."Name") author, v."Snapshot" snapshot,
                COALESCE(v."Snapshot"->>'Consumption_code', v."Snapshot"->>'Card_code') label
         FROM "Norm_version" v LEFT JOIN "Employee" e ON e."PK_Employee" = v."PK_Employee"
         WHERE ${where.join(' AND ')} ORDER BY v."Changed_at" DESC, v."PK_Norm_version" DESC LIMIT 300`,
        params,
      ),
    );
  }),
);

normsRouter.post(
  '/norms/:id/restore',
  can('norm:approve'),
  a(async (req, res) => {
    const id = Number(req.params.id);
    const v = await one(`SELECT * FROM "Norm_version" WHERE "PK_Norm_version" = $1 AND "Entity" = 'norm' AND "Entity_id" = $2`, [req.body.versionId, id]);
    if (!v) throw new HttpError(404, 'Версия не найдена.');
    await loadEditable(id);
    const s = v.Snapshot;
    await tx(async (c) => {
      await ensureNormBaseline(c, id, req.user!.id);
      await q(
        `UPDATE "Consumption_rate" SET "Significance_of_the_norm"=$1,"Loss_coefficient"=$2,"Description"=$3,"PK_Material"=$4,
           "PK_Edge_banding_consumption_rate"=$5,"PK_Document_status"=1,"Date"=CURRENT_DATE WHERE "PK_Consumption_rate"=$6`,
        [s.Significance_of_the_norm, s.Loss_coefficient, s.Description, s.PK_Material, s.PK_Edge_banding_consumption_rate, id],
        c,
      );
      await snapshotNorm(c, id, `Восстановление версии ${v.Version_no}`, req.user!.id);
      await markRecalcForNorm(c, id);
    });
    await audit(req, 'Восстановление', 'Норма', `#${id}: версия ${v.Version_no}`);
    res.json({ ok: true, value: round(Number(s.Significance_of_the_norm), 6) });
  }),
);
