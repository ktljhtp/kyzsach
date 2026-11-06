import { Router } from 'express';
import { audit, can } from '../auth';
import { one, q, tx } from '../db';
import { a, HttpError, int, need, str } from '../http';
import { markRecalcAssembly, markRecalcDetail } from '../versions';

export const productsRouter = Router();

productsRouter.get(
  '/products',
  a(async (_req, res) =>
    res.json(
      await q(
        `SELECT p.*, (SELECT COUNT(*)::int FROM "Assembly_unit" au WHERE au."PK_Finished_product" = p."PK_Finished_product") units,
                (SELECT COUNT(*)::int FROM "Detail" d JOIN "Assembly_unit" au ON au."PK_Assembly_unit" = d."PK_Assembly_unit"
                  WHERE au."PK_Finished_product" = p."PK_Finished_product") details
         FROM "Finished_product" p ORDER BY p."PK_Finished_product"`,
      ),
    ),
  ),
);

productsRouter.post(
  '/products',
  can('ref:write'),
  a(async (req, res) => {
    const b = req.body;
    const row = await one(
      `INSERT INTO "Finished_product" ("Cipher","Name","Description","Creation_date")
       VALUES ($1,$2,$3,COALESCE($4::date, CURRENT_DATE)) RETURNING *`,
      [need(str(b.Cipher), 'Шифр'), need(str(b.Name), 'Наименование'), str(b.Description), str(b.Creation_date)],
    );
    await audit(req, 'Создание', 'Изделие', String(b.Cipher));
    res.json(row);
  }),
);
productsRouter.put(
  '/products/:id',
  can('ref:write'),
  a(async (req, res) => {
    const b = req.body;
    const row = await one(
      `UPDATE "Finished_product" SET "Cipher"=$1,"Name"=$2,"Description"=$3 WHERE "PK_Finished_product"=$4 RETURNING *`,
      [need(str(b.Cipher), 'Шифр'), need(str(b.Name), 'Наименование'), str(b.Description), req.params.id],
    );
    if (!row) throw new HttpError(404, 'Изделие не найдено.');
    await audit(req, 'Изменение', 'Изделие', String(b.Cipher));
    res.json(row);
  }),
);
productsRouter.delete(
  '/products/:id',
  can('ref:write'),
  a(async (req, res) => {
    await q(`DELETE FROM "Finished_product" WHERE "PK_Finished_product" = $1`, [req.params.id]);
    await audit(req, 'Удаление', 'Изделие', `#${req.params.id}`);
    res.json({ ok: true });
  }),
);

// ---------- дерево входимости: изделие → сборочные единицы → детали ----------
productsRouter.get(
  '/products/:id/tree',
  a(async (req, res) => {
    const product = await one(`SELECT * FROM "Finished_product" WHERE "PK_Finished_product" = $1`, [req.params.id]);
    if (!product) throw new HttpError(404, 'Изделие не найдено.');
    const units = await q(`SELECT * FROM "Assembly_unit" WHERE "PK_Finished_product" = $1 ORDER BY "PK_Assembly_unit"`, [req.params.id]);
    const details = await q(
      `SELECT d.*, m."Name" material_name FROM "Detail" d
       LEFT JOIN "Material" m ON m."PK_Material" = d."PK_Material"
       WHERE d."PK_Assembly_unit" = ANY($1::int[]) ORDER BY d."PK_Detail"`,
      [units.map((u) => u.PK_Assembly_unit)],
    );
    const byId = new Map<number, any>(units.map((u) => [u.PK_Assembly_unit, { ...u, children: [], details: [] }]));
    const roots: any[] = [];
    for (const u of byId.values()) {
      const parent = u.FK_PK_Assembly_unit ? byId.get(u.FK_PK_Assembly_unit) : null;
      (parent ? parent.children : roots).push(u);
    }
    for (const d of details) byId.get(d.PK_Assembly_unit)?.details.push(d);
    res.json({ product, units: roots });
  }),
);

// ---------- сборочные единицы ----------
const areaCm2 = (l: number | null, w: number | null) => (l && w ? Math.round((l * w) / 100) : null);

productsRouter.post(
  '/assemblies',
  can('ref:write'),
  a(async (req, res) => {
    const b = req.body;
    const l = int(b.Length), w = int(b.Width);
    const row = await one(
      `INSERT INTO "Assembly_unit" ("Cipher","Name","Length","Width","Height","Square","Number_of_occurrences","Description","PK_Finished_product","FK_PK_Assembly_unit","Needs_recalc")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,TRUE) RETURNING *`,
      [need(str(b.Cipher), 'Шифр'), need(str(b.Name), 'Наименование'), l, w, int(b.Height), int(b.Square) ?? areaCm2(l, w),
       int(b.Number_of_occurrences) ?? 1, str(b.Description), need(int(b.PK_Finished_product), 'Изделие'), int(b.FK_PK_Assembly_unit)],
    );
    await q(`UPDATE "Finished_product" SET "Needs_recalc" = TRUE WHERE "PK_Finished_product" = $1`, [row!.PK_Finished_product]);
    await audit(req, 'Создание', 'Сборочная единица', String(b.Cipher));
    res.json(row);
  }),
);
productsRouter.put(
  '/assemblies/:id',
  can('ref:write'),
  a(async (req, res) => {
    const b = req.body;
    const id = Number(req.params.id);
    if (int(b.FK_PK_Assembly_unit) === id) throw new HttpError(400, 'Узел не может входить сам в себя.');
    const l = int(b.Length), w = int(b.Width);
    await tx(async (c) => {
      const row = await one(
        `UPDATE "Assembly_unit" SET "Cipher"=$1,"Name"=$2,"Length"=$3,"Width"=$4,"Height"=$5,"Square"=$6,
           "Number_of_occurrences"=$7,"Description"=$8,"FK_PK_Assembly_unit"=$9 WHERE "PK_Assembly_unit"=$10 RETURNING "PK_Assembly_unit"`,
        [need(str(b.Cipher), 'Шифр'), need(str(b.Name), 'Наименование'), l, w, int(b.Height), int(b.Square) ?? areaCm2(l, w),
         int(b.Number_of_occurrences) ?? 1, str(b.Description), int(b.FK_PK_Assembly_unit), id],
        c,
      );
      if (!row) throw new HttpError(404, 'Сборочная единица не найдена.');
      await markRecalcAssembly(c, id);
    });
    await audit(req, 'Изменение', 'Сборочная единица', String(b.Cipher));
    res.json({ ok: true });
  }),
);
productsRouter.delete(
  '/assemblies/:id',
  can('ref:write'),
  a(async (req, res) => {
    await q(`DELETE FROM "Assembly_unit" WHERE "PK_Assembly_unit" = $1`, [req.params.id]);
    await audit(req, 'Удаление', 'Сборочная единица', `#${req.params.id}`);
    res.json({ ok: true });
  }),
);

// ---------- детали ----------
const detailParams = (b: any) => {
  const l = int(b.Length), w = int(b.Width);
  return [
    need(str(b.Cipher), 'Шифр'), need(str(b.Name), 'Наименование'), l, w, int(b.Height),
    int(b.Square) ?? areaCm2(l, w), int(b.Length_of_edges_to_be_veneered) ?? 0,
    int(b.Number_of_occurrences) ?? 1, str(b.Description),
    need(int(b.PK_Assembly_unit), 'Сборочная единица'), need(int(b.PK_Material), 'Материал'),
  ];
};
productsRouter.post(
  '/details',
  can('ref:write'),
  a(async (req, res) => {
    const row = await tx(async (c) => {
      const r = await one(
        `INSERT INTO "Detail" ("Cipher","Name","Length","Width","Height","Square","Length_of_edges_to_be_veneered",
           "Number_of_occurrences","Description","PK_Assembly_unit","PK_Material","Creation_date")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,CURRENT_DATE) RETURNING *`,
        detailParams(req.body),
        c,
      );
      await markRecalcDetail(c, r!.PK_Detail);
      return r;
    });
    await audit(req, 'Создание', 'Деталь', String(req.body.Cipher));
    res.json(row);
  }),
);
productsRouter.put(
  '/details/:id',
  can('ref:write'),
  a(async (req, res) => {
    await tx(async (c) => {
      const r = await one(
        `UPDATE "Detail" SET "Cipher"=$1,"Name"=$2,"Length"=$3,"Width"=$4,"Height"=$5,"Square"=$6,"Length_of_edges_to_be_veneered"=$7,
           "Number_of_occurrences"=$8,"Description"=$9,"PK_Assembly_unit"=$10,"PK_Material"=$11 WHERE "PK_Detail"=$12 RETURNING "PK_Detail"`,
        [...detailParams(req.body), req.params.id],
        c,
      );
      if (!r) throw new HttpError(404, 'Деталь не найдена.');
      await markRecalcDetail(c, Number(req.params.id)); // размеры изменились — вышестоящие узлы требуют перерасчёта
    });
    await audit(req, 'Изменение', 'Деталь', `${req.body.Cipher}: узлы помечены на перерасчёт`);
    res.json({ ok: true });
  }),
);
productsRouter.delete(
  '/details/:id',
  can('ref:write'),
  a(async (req, res) => {
    await tx(async (c) => {
      await markRecalcDetail(c, Number(req.params.id));
      await q(`DELETE FROM "Detail" WHERE "PK_Detail" = $1`, [req.params.id], c);
    });
    await audit(req, 'Удаление', 'Деталь', `#${req.params.id}`);
    res.json({ ok: true });
  }),
);

// плоские списки для выпадающих списков интерфейса
productsRouter.get(
  '/details',
  a(async (_req, res) =>
    res.json(
      await q(
        `SELECT d.*, au."Name" assembly_name, au."PK_Finished_product", f."Cipher" product_cipher, m."Name" material_name, m."PK_Type_material" type_id
         FROM "Detail" d JOIN "Assembly_unit" au ON au."PK_Assembly_unit" = d."PK_Assembly_unit"
         JOIN "Finished_product" f ON f."PK_Finished_product" = au."PK_Finished_product"
         LEFT JOIN "Material" m ON m."PK_Material" = d."PK_Material" ORDER BY f."Cipher", d."PK_Detail"`,
      ),
    ),
  ),
);
productsRouter.get(
  '/assemblies',
  a(async (_req, res) =>
    res.json(
      await q(
        `SELECT au.*, f."Cipher" product_cipher FROM "Assembly_unit" au JOIN "Finished_product" f ON f."PK_Finished_product" = au."PK_Finished_product" ORDER BY f."Cipher", au."PK_Assembly_unit"`,
      ),
    ),
  ),
);
