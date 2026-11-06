import { Db, one, q } from './db';

// ---------- пометка «требуется перерасчёт» ----------
export async function markRecalcAssembly(c: Db, assemblyId: number | null) {
  if (!assemblyId) return;
  const rows = await q<{ id: number; prod: number | null }>(
    `WITH RECURSIVE up AS (
       SELECT "PK_Assembly_unit", "FK_PK_Assembly_unit", "PK_Finished_product"
       FROM "Assembly_unit" WHERE "PK_Assembly_unit" = $1
       UNION
       SELECT a."PK_Assembly_unit", a."FK_PK_Assembly_unit", a."PK_Finished_product"
       FROM "Assembly_unit" a JOIN up ON a."PK_Assembly_unit" = up."FK_PK_Assembly_unit")
     SELECT "PK_Assembly_unit" id, "PK_Finished_product" prod FROM up`,
    [assemblyId],
    c,
  );
  if (!rows.length) return;
  await q(`UPDATE "Assembly_unit" SET "Needs_recalc" = TRUE WHERE "PK_Assembly_unit" = ANY($1::int[])`, [rows.map((r) => r.id)], c);
  const prods = [...new Set(rows.map((r) => r.prod).filter((x): x is number => !!x))];
  if (prods.length) await q(`UPDATE "Finished_product" SET "Needs_recalc" = TRUE WHERE "PK_Finished_product" = ANY($1::int[])`, [prods], c);
}

export async function markRecalcDetail(c: Db, detailId: number | null) {
  if (!detailId) return;
  const d = await one<{ au: number | null }>(`SELECT "PK_Assembly_unit" au FROM "Detail" WHERE "PK_Detail" = $1`, [detailId], c);
  await markRecalcAssembly(c, d?.au ?? null);
}

export async function markRecalcProduct(c: Db, productId: number | null) {
  if (!productId) return;
  await q(`UPDATE "Finished_product" SET "Needs_recalc" = TRUE WHERE "PK_Finished_product" = $1`, [productId], c);
}

export async function markRecalcForNorm(c: Db, normId: number) {
  const n = await one(
    `SELECT "PK_Detail" d, "PK_Assembly_unit" a, "PK_Finished_product" p FROM "Consumption_rate" WHERE "PK_Consumption_rate" = $1`,
    [normId],
    c,
  );
  if (!n) return;
  if (n.d) await markRecalcDetail(c, n.d);
  else if (n.a) await markRecalcAssembly(c, n.a);
  // сводные нормы пересчитываются консолидацией, помечать их не нужно
}

// ---------- версии норм ----------
const NORM_SQL = `
  SELECT to_jsonb(cr) AS snap,
         COALESCE(cr."PK_Finished_product", au."PK_Finished_product", au2."PK_Finished_product") AS prod
  FROM "Consumption_rate" cr
  LEFT JOIN "Assembly_unit" au ON au."PK_Assembly_unit" = cr."PK_Assembly_unit"
  LEFT JOIN "Detail" d ON d."PK_Detail" = cr."PK_Detail"
  LEFT JOIN "Assembly_unit" au2 ON au2."PK_Assembly_unit" = d."PK_Assembly_unit"
  WHERE cr."PK_Consumption_rate" = $1`;

async function nextNo(c: Db, entity: string, id: number): Promise<number> {
  const r = await one<{ n: number }>(
    `SELECT COALESCE(MAX("Version_no"), 0) + 1 AS n FROM "Norm_version" WHERE "Entity" = $1 AND "Entity_id" = $2`,
    [entity, id],
    c,
  );
  return r!.n;
}

export async function snapshotNorm(c: Db, id: number, action: string, empId: number | null): Promise<number | null> {
  const r = await one(NORM_SQL, [id], c);
  if (!r) return null;
  const no = await nextNo(c, 'norm', id);
  await q(
    `INSERT INTO "Norm_version" ("Entity","Entity_id","Version_no","Action","Snapshot","PK_Employee","PK_Finished_product")
     VALUES ('norm',$1,$2,$3,$4,$5,$6)`,
    [id, no, action, JSON.stringify(r.snap), empId, r.prod],
    c,
  );
  await q(`UPDATE "Consumption_rate" SET "Version" = $1 WHERE "PK_Consumption_rate" = $2`, [`v${no}.0`, id], c);
  return no;
}

/** Если у нормы ещё нет истории — сохраняем текущее состояние как исходную версию. */
export async function ensureNormBaseline(c: Db, id: number, empId: number | null) {
  const r = await one<{ n: number }>(`SELECT COUNT(*)::int n FROM "Norm_version" WHERE "Entity" = 'norm' AND "Entity_id" = $1`, [id], c);
  if (r && r.n === 0) {
    const row = await one(NORM_SQL, [id], c);
    if (!row) return;
    await q(
      `INSERT INTO "Norm_version" ("Entity","Entity_id","Version_no","Action","Snapshot","PK_Employee","PK_Finished_product","Changed_at")
       VALUES ('norm',$1,1,'Исходная версия',$2,$3,$4, COALESCE(($2::jsonb->>'Date')::timestamp, now()))`,
      [id, JSON.stringify(row.snap), (row.snap as any).PK_Employee ?? empId, row.prod],
      c,
    );
  }
}

// ---------- версии карт раскроя ----------
async function layoutSnapshot(c: Db, id: number) {
  return one(
    `SELECT to_jsonb(cl) || jsonb_build_object('positions',
              COALESCE((SELECT jsonb_agg(to_jsonb(p) ORDER BY p."Item_number", p."PK_Cutting_layout_position")
                        FROM "Cutting_layout_position" p WHERE p."PK_Cutting_layout" = cl."PK_Cutting_layout"), '[]'::jsonb)) AS snap,
            (SELECT d_au."PK_Finished_product"
               FROM "Cutting_layout_position" p
               JOIN "Detail" d ON d."PK_Detail" = p."PK_Detail"
               JOIN "Assembly_unit" d_au ON d_au."PK_Assembly_unit" = d."PK_Assembly_unit"
              WHERE p."PK_Cutting_layout" = cl."PK_Cutting_layout" LIMIT 1) AS prod
     FROM "Cutting_layout" cl WHERE cl."PK_Cutting_layout" = $1`,
    [id],
    c,
  );
}

export async function snapshotLayout(c: Db, id: number, action: string, empId: number | null) {
  const r = await layoutSnapshot(c, id);
  if (!r) return;
  const no = await nextNo(c, 'layout', id);
  await q(
    `INSERT INTO "Norm_version" ("Entity","Entity_id","Version_no","Action","Snapshot","PK_Employee","PK_Finished_product")
     VALUES ('layout',$1,$2,$3,$4,$5,$6)`,
    [id, no, action, JSON.stringify(r.snap), empId, r.prod],
    c,
  );
}

export async function ensureLayoutBaseline(c: Db, id: number, empId: number | null) {
  const r = await one<{ n: number }>(`SELECT COUNT(*)::int n FROM "Norm_version" WHERE "Entity" = 'layout' AND "Entity_id" = $1`, [id], c);
  if (r && r.n === 0) await snapshotLayout(c, id, 'Исходная версия', empId);
}
