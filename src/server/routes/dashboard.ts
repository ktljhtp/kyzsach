import { Router } from 'express';
import { q, one } from '../db';
import { a } from '../http';

export const dashboardRouter = Router();

dashboardRouter.get(
  '/dashboard',
  a(async (_req, res) => {
    const counts = await one(
      `SELECT (SELECT COUNT(*)::int FROM "Material") materials,
              (SELECT COUNT(*)::int FROM "Finished_product") products,
              (SELECT COUNT(*)::int FROM "Detail") details,
              (SELECT COUNT(*)::int FROM "Cutting_layout") layouts`,
    );
    const norms = await q(
      `SELECT ds."PK_Document_status" id, ds."Name" name, COUNT(cr.*)::int n FROM "Document_status" ds
       LEFT JOIN "Consumption_rate" cr ON cr."PK_Document_status" = ds."PK_Document_status" GROUP BY ds."PK_Document_status", ds."Name" ORDER BY ds."PK_Document_status"`,
    );
    const recalc = await q(`SELECT "PK_Finished_product" id, "Cipher" cipher, "Name" name FROM "Finished_product" WHERE "Needs_recalc" ORDER BY "Cipher"`);
    const pending = await q(
      `SELECT 'norm' kind, cr."PK_Consumption_rate" id, cr."Consumption_code" label, cr."Description" description
       FROM "Consumption_rate" cr WHERE cr."PK_Document_status" = 2
       UNION ALL SELECT 'layout', cl."PK_Cutting_layout", cl."Card_code", cl."Description_of_the_diagram" FROM "Cutting_layout" cl WHERE cl."PK_Document_status" = 2
       LIMIT 20`,
    );
    const recent = await q(
      `SELECT v."Entity" entity, v."Action" action, v."Changed_at" at, COALESCE(v."Snapshot"->>'Consumption_code', v."Snapshot"->>'Card_code') label,
              concat_ws(' ', e."Surname", e."Name") author
       FROM "Norm_version" v LEFT JOIN "Employee" e ON e."PK_Employee" = v."PK_Employee" ORDER BY v."PK_Norm_version" DESC LIMIT 8`,
    );
    const program = await one(
      `SELECT pp."PK_Production_program" id, pp."Program_code" code, pp."Year", pp."Month",
              (SELECT COUNT(*)::int FROM "Material_requirements" r WHERE r."PK_Production_program" = pp."PK_Production_program") calculated
       FROM "Production_program" pp ORDER BY pp."Year" DESC, pp."Month" DESC LIMIT 1`,
    );
    res.json({ counts, norms, recalc, pending, recent, program });
  }),
);
