import { Router } from 'express';
import { audit, can } from '../auth';
import { one, q, tx } from '../db';
import { a, HttpError, int, need, num, str } from '../http';

export const programsRouter = Router();

const LIST = `
  SELECT pp.*, ds."Name" status_name, concat_ws(' ', e."Surname", e."Name") author,
         (SELECT COUNT(*)::int FROM "Production_program_item" i WHERE i."PK_Production_program" = pp."PK_Production_program") items,
         (SELECT COUNT(*)::int FROM "Material_requirements" r WHERE r."PK_Production_program" = pp."PK_Production_program") calculated
  FROM "Production_program" pp
  LEFT JOIN "Document_status" ds ON ds."PK_Document_status" = pp."PK_Document_status"
  LEFT JOIN "Employee" e ON e."PK_Employee" = pp."PK_Employee"`;

programsRouter.get('/programs', a(async (_req, res) => res.json(await q(`${LIST} ORDER BY pp."Year" DESC, pp."Month" DESC`))));

programsRouter.get(
  '/programs/:id',
  a(async (req, res) => {
    const p = await one(`${LIST} WHERE pp."PK_Production_program" = $1`, [req.params.id]);
    if (!p) throw new HttpError(404, 'Программа не найдена.');
    const items = await q(
      `SELECT i.*, f."Cipher" cipher, f."Name" product_name FROM "Production_program_item" i
       JOIN "Finished_product" f ON f."PK_Finished_product" = i."PK_Finished_product"
       WHERE i."PK_Production_program" = $1 ORDER BY i."PK_Production_program_item"`,
      [req.params.id],
    );
    res.json({ ...p, itemsList: items });
  }),
);

programsRouter.get(
  '/programs/:id/requirements',
  a(async (req, res) => {
    res.json(
      await q(
        `SELECT r.*, m."Material_code" code, m."Name" material_name, u."Name" unit_name
         FROM "Material_requirements" r JOIN "Material" m ON m."PK_Material" = r."PK_Material"
         LEFT JOIN "Units_of_measurement" u ON u."PK_Units_of_measurement" = m."PK_Units_of_measurement"
         WHERE r."PK_Production_program" = $1 ORDER BY m."PK_Type_material", m."Name"`,
        [req.params.id],
      ),
    );
  }),
);

const prog = (b: any) => {
  const year = need(int(b.Year), 'Год'), month = need(int(b.Month), 'Месяц');
  if (month < 1 || month > 12) throw new HttpError(400, 'Месяц — от 1 до 12.');
  return [str(b.Program_code) ?? `ПП-${year}-${String(month).padStart(2, '0')}`, year, month, str(b.Description), int(b.PK_Document_status) ?? 1];
};

programsRouter.post(
  '/programs',
  can('program:edit'),
  a(async (req, res) => {
    const row = await one(
      `INSERT INTO "Production_program" ("Program_code","Year","Month","Description","PK_Document_status","Generation_date","PK_Employee")
       VALUES ($1,$2,$3,$4,$5,CURRENT_DATE,$6) RETURNING "PK_Production_program" id`,
      [...prog(req.body), req.user!.id],
    );
    await audit(req, 'Создание', 'Производственная программа', String(prog(req.body)[0]));
    res.json(row);
  }),
);
programsRouter.put(
  '/programs/:id',
  can('program:edit'),
  a(async (req, res) => {
    await q(
      `UPDATE "Production_program" SET "Program_code"=$1,"Year"=$2,"Month"=$3,"Description"=$4,"PK_Document_status"=$5 WHERE "PK_Production_program"=$6`,
      [...prog(req.body), req.params.id],
    );
    await audit(req, 'Изменение', 'Производственная программа', `#${req.params.id}`);
    res.json({ ok: true });
  }),
);
programsRouter.delete(
  '/programs/:id',
  can('program:edit'),
  a(async (req, res) => {
    await q(`DELETE FROM "Production_program" WHERE "PK_Production_program" = $1`, [req.params.id]);
    await audit(req, 'Удаление', 'Производственная программа', `#${req.params.id}`);
    res.json({ ok: true });
  }),
);

// позиции программы: изменение плана делает ранее рассчитанную потребность неактуальной → удаляем её
const dropRequirements = (c: any, id: any) => q(`DELETE FROM "Material_requirements" WHERE "PK_Production_program" = $1`, [id], c);

programsRouter.post(
  '/programs/:id/items',
  can('program:edit'),
  a(async (req, res) => {
    const plan = need(num(req.body.Release_plan), 'План выпуска');
    if (plan <= 0) throw new HttpError(400, 'План выпуска должен быть больше нуля.');
    await tx(async (c) => {
      await q(
        `INSERT INTO "Production_program_item" ("Release_plan","Note","PK_Production_program","PK_Finished_product") VALUES ($1,$2,$3,$4)`,
        [plan, str(req.body.Note), req.params.id, need(int(req.body.PK_Finished_product), 'Изделие')], c,
      );
      await dropRequirements(c, req.params.id);
    });
    res.json({ ok: true });
  }),
);
programsRouter.put(
  '/program-items/:id',
  can('program:edit'),
  a(async (req, res) => {
    const plan = need(num(req.body.Release_plan), 'План выпуска');
    if (plan <= 0) throw new HttpError(400, 'План выпуска должен быть больше нуля.');
    await tx(async (c) => {
      const r = await one(`UPDATE "Production_program_item" SET "Release_plan"=$1,"Note"=$2 WHERE "PK_Production_program_item"=$3 RETURNING "PK_Production_program" p`, [plan, str(req.body.Note), req.params.id], c);
      if (r) await dropRequirements(c, r.p);
    });
    res.json({ ok: true });
  }),
);
programsRouter.delete(
  '/program-items/:id',
  can('program:edit'),
  a(async (req, res) => {
    await tx(async (c) => {
      const r = await one(`DELETE FROM "Production_program_item" WHERE "PK_Production_program_item"=$1 RETURNING "PK_Production_program" p`, [req.params.id], c);
      if (r) await dropRequirements(c, r.p);
    });
    res.json({ ok: true });
  }),
);
