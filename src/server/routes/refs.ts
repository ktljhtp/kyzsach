import { Router } from 'express';
import { audit, can } from '../auth';
import { one, q } from '../db';
import { a, HttpError, int, need, num, str } from '../http';

export const refsRouter = Router();

// ---------- простые справочники ----------
interface Dict {
  table: string;
  pk: string;
  cols: string[];
  ints?: string[];
  perm: string;
  required: string;
}
const D = (table: string, cols: string[], extra: Partial<Dict> = {}): Dict => ({
  table,
  pk: `PK_${table}`,
  cols,
  perm: 'ref:write',
  required: 'Name',
  ...extra,
});
const DICTS: Record<string, Dict> = {
  'material-types': D('Type_material', ['Name', 'Description']),
  units: D('Units_of_measurement', ['Name', 'Description']),
  colors: D('Color_of_material', ['Name', 'Description']),
  textures: D('Material_texture', ['Name', 'Description']),
  'tile-formats': D('Tile_format', ['Name', 'Length', 'Width'], { ints: ['Length', 'Width'] }),
  'edge-types': D('Edge_type', ['Name', 'Thickness', 'Description'], { ints: ['Thickness'] }),
  statuses: D('Document_status', ['Name', 'Description']),
  'job-titles': D('Job_title', ['Name', 'Description'], { perm: 'admin' }),
  subdivisions: D('Subdivision', ['Name', 'Description'], { perm: 'admin' }),
  suppliers: D('Supplier', ['Name', 'INN', 'Phone_number', 'Address']),
};

const dictValues = (d: Dict, body: any) => d.cols.map((c) => (d.ints?.includes(c) ? int(body[c]) : str(body[c])));

for (const [path, d] of Object.entries(DICTS)) {
  refsRouter.get(
    `/dict/${path}`,
    a(async (_req, res) => res.json(await q(`SELECT * FROM "${d.table}" ORDER BY "${d.pk}"`))),
  );
  refsRouter.post(
    `/dict/${path}`,
    can(d.perm),
    a(async (req, res) => {
      need(str(req.body[d.required]), 'Наименование');
      const cols = d.cols.map((c) => `"${c}"`).join(',');
      const ph = d.cols.map((_, i) => `$${i + 1}`).join(',');
      const row = await one(`INSERT INTO "${d.table}" (${cols}) VALUES (${ph}) RETURNING *`, dictValues(d, req.body));
      await audit(req, 'Создание', d.table, String(req.body.Name));
      res.json(row);
    }),
  );
  refsRouter.put(
    `/dict/${path}/:id`,
    can(d.perm),
    a(async (req, res) => {
      need(str(req.body[d.required]), 'Наименование');
      const set = d.cols.map((c, i) => `"${c}" = $${i + 1}`).join(',');
      const row = await one(
        `UPDATE "${d.table}" SET ${set} WHERE "${d.pk}" = $${d.cols.length + 1} RETURNING *`,
        [...dictValues(d, req.body), req.params.id],
      );
      if (!row) throw new HttpError(404, 'Запись не найдена.');
      await audit(req, 'Изменение', d.table, `#${req.params.id}`);
      res.json(row);
    }),
  );
  refsRouter.delete(
    `/dict/${path}/:id`,
    can(d.perm),
    a(async (req, res) => {
      await q(`DELETE FROM "${d.table}" WHERE "${d.pk}" = $1`, [req.params.id]);
      await audit(req, 'Удаление', d.table, `#${req.params.id}`);
      res.json({ ok: true });
    }),
  );
}

// ---------- материалы ----------
const MATERIAL_SQL = `
  SELECT m."PK_Material", m."Material_code", m."Name", m."Thickness", m."Sheet_area", m."Roll_length",
         m."Base_price", m."Current_balance", m."PK_Type_material", m."PK_Units_of_measurement",
         m."PK_Color_of_material", m."PK_Material_texture", m."PK_Tile_format", m."PK_Edge_type",
         t."Name" type_name, u."Name" unit_name, c."Name" color_name, x."Name" texture_name,
         f."Name" format_name, e."Name" edge_name,
         (SELECT MIN(sp."Price") FROM "Suppliers_price_for_the_material" sp WHERE sp."PK_Material" = m."PK_Material") min_price
  FROM "Material" m
  LEFT JOIN "Type_material" t ON t."PK_Type_material" = m."PK_Type_material"
  LEFT JOIN "Units_of_measurement" u ON u."PK_Units_of_measurement" = m."PK_Units_of_measurement"
  LEFT JOIN "Color_of_material" c ON c."PK_Color_of_material" = m."PK_Color_of_material"
  LEFT JOIN "Material_texture" x ON x."PK_Material_texture" = m."PK_Material_texture"
  LEFT JOIN "Tile_format" f ON f."PK_Tile_format" = m."PK_Tile_format"
  LEFT JOIN "Edge_type" e ON e."PK_Edge_type" = m."PK_Edge_type"`;

const materialParams = (b: any) => [
  need(str(b.Material_code), 'Код'),
  need(str(b.Name), 'Наименование'),
  int(b.Thickness),
  int(b.Sheet_area),
  int(b.Roll_length),
  num(b.Base_price),
  int(b.Current_balance),
  int(b.PK_Type_material),
  int(b.PK_Units_of_measurement),
  int(b.PK_Color_of_material),
  int(b.PK_Material_texture),
  int(b.PK_Tile_format),
  int(b.PK_Edge_type),
];

refsRouter.get('/materials', a(async (_req, res) => res.json(await q(`${MATERIAL_SQL} ORDER BY m."PK_Material"`))));

refsRouter.post(
  '/materials',
  can('ref:write'),
  a(async (req, res) => {
    const row = await one(
      `INSERT INTO "Material" ("Material_code","Name","Thickness","Sheet_area","Roll_length","Base_price","Current_balance",
         "PK_Type_material","PK_Units_of_measurement","PK_Color_of_material","PK_Material_texture","PK_Tile_format","PK_Edge_type")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING "PK_Material"`,
      materialParams(req.body),
    );
    await audit(req, 'Создание', 'Материал', String(req.body.Material_code));
    res.json(row);
  }),
);

refsRouter.put(
  '/materials/:id',
  can('ref:write'),
  a(async (req, res) => {
    const row = await one(
      `UPDATE "Material" SET "Material_code"=$1,"Name"=$2,"Thickness"=$3,"Sheet_area"=$4,"Roll_length"=$5,"Base_price"=$6,
         "Current_balance"=$7,"PK_Type_material"=$8,"PK_Units_of_measurement"=$9,"PK_Color_of_material"=$10,
         "PK_Material_texture"=$11,"PK_Tile_format"=$12,"PK_Edge_type"=$13
       WHERE "PK_Material"=$14 RETURNING "PK_Material"`,
      [...materialParams(req.body), req.params.id],
    );
    if (!row) throw new HttpError(404, 'Материал не найден.');
    await audit(req, 'Изменение', 'Материал', String(req.body.Material_code));
    res.json(row);
  }),
);

refsRouter.delete(
  '/materials/:id',
  can('ref:write'),
  a(async (req, res) => {
    await q(`DELETE FROM "Material" WHERE "PK_Material" = $1`, [req.params.id]);
    await audit(req, 'Удаление', 'Материал', `#${req.params.id}`);
    res.json({ ok: true });
  }),
);

// ---------- цены поставщиков ----------
refsRouter.get(
  '/prices',
  a(async (_req, res) =>
    res.json(
      await q(
        `SELECT sp."PK_Suppliers_price_for_the_material" id, sp."Price", sp."As-of_date" as_of, sp."Note",
                sp."PK_Supplier", sp."PK_Material", s."Name" supplier_name, m."Name" material_name, m."Material_code"
         FROM "Suppliers_price_for_the_material" sp
         JOIN "Supplier" s ON s."PK_Supplier" = sp."PK_Supplier"
         JOIN "Material" m ON m."PK_Material" = sp."PK_Material"
         ORDER BY m."Name", sp."Price"`,
      ),
    ),
  ),
);
refsRouter.post(
  '/prices',
  can('ref:write'),
  a(async (req, res) => {
    const b = req.body;
    const row = await one(
      `INSERT INTO "Suppliers_price_for_the_material" ("Price","As-of_date","Note","PK_Supplier","PK_Material")
       VALUES ($1, COALESCE($2::date, CURRENT_DATE), $3, $4, $5) RETURNING "PK_Suppliers_price_for_the_material" id`,
      [need(num(b.Price), 'Цена'), str(b.as_of), str(b.Note), need(int(b.PK_Supplier), 'Поставщик'), need(int(b.PK_Material), 'Материал')],
    );
    await audit(req, 'Создание', 'Цена поставщика', `материал #${b.PK_Material}`);
    res.json(row);
  }),
);
refsRouter.put(
  '/prices/:id',
  can('ref:write'),
  a(async (req, res) => {
    const b = req.body;
    await q(
      `UPDATE "Suppliers_price_for_the_material" SET "Price"=$1, "As-of_date"=COALESCE($2::date,"As-of_date"), "Note"=$3
       WHERE "PK_Suppliers_price_for_the_material"=$4`,
      [need(num(b.Price), 'Цена'), str(b.as_of), str(b.Note), req.params.id],
    );
    res.json({ ok: true });
  }),
);
refsRouter.delete(
  '/prices/:id',
  can('ref:write'),
  a(async (req, res) => {
    await q(`DELETE FROM "Suppliers_price_for_the_material" WHERE "PK_Suppliers_price_for_the_material" = $1`, [req.params.id]);
    res.json({ ok: true });
  }),
);

// ---------- нормы расхода кромки (справочник 4) ----------
refsRouter.get(
  '/edge-rates',
  a(async (_req, res) =>
    res.json(
      await q(
        `SELECT r.*, t."Name" edge_name FROM "Edge_banding_consumption_rate" r
         LEFT JOIN "Edge_type" t ON t."PK_Edge_type" = r."PK_Edge_type" ORDER BY r."PK_Edge_banding_consumption_rate"`,
      ),
    ),
  ),
);
const edgeParams = (b: any) => [
  need(num(b.Roll_consumption_per_linear_meter_of_edge), 'Расход на 1 пог. м'),
  need(num(b.Loss_coefficient), 'Коэффициент потерь'),
  str(b.Description),
  need(int(b.PK_Edge_type), 'Тип кромки'),
];
refsRouter.post(
  '/edge-rates',
  can('ref:write'),
  a(async (req, res) => {
    res.json(
      await one(
        `INSERT INTO "Edge_banding_consumption_rate" ("Roll_consumption_per_linear_meter_of_edge","Loss_coefficient","Description","PK_Edge_type")
         VALUES ($1,$2,$3,$4) RETURNING *`,
        edgeParams(req.body),
      ),
    );
  }),
);
refsRouter.put(
  '/edge-rates/:id',
  can('ref:write'),
  a(async (req, res) => {
    res.json(
      await one(
        `UPDATE "Edge_banding_consumption_rate" SET "Roll_consumption_per_linear_meter_of_edge"=$1,"Loss_coefficient"=$2,"Description"=$3,"PK_Edge_type"=$4
         WHERE "PK_Edge_banding_consumption_rate"=$5 RETURNING *`,
        [...edgeParams(req.body), req.params.id],
      ),
    );
  }),
);
refsRouter.delete(
  '/edge-rates/:id',
  can('ref:write'),
  a(async (req, res) => {
    await q(`DELETE FROM "Edge_banding_consumption_rate" WHERE "PK_Edge_banding_consumption_rate" = $1`, [req.params.id]);
    res.json({ ok: true });
  }),
);
