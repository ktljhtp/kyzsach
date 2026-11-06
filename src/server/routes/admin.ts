import { Router } from 'express';
import { audit, can, hashPassword } from '../auth';
import { q } from '../db';
import { a, HttpError, int, need, str } from '../http';

export const adminRouter = Router();
adminRouter.use(can('admin'));

adminRouter.get(
  '/users',
  a(async (_req, res) =>
    res.json(
      await q(
        `SELECT e."PK_Employee", e."Surname", e."Name", e."Patronymic", e."Login", e."Phone_number", e."PK_Job_title", e."PK_Subdivision",
                j."Name" job_name, s."Name" subdivision_name
         FROM "Employee" e LEFT JOIN "Job_title" j ON j."PK_Job_title" = e."PK_Job_title"
         LEFT JOIN "Subdivision" s ON s."PK_Subdivision" = e."PK_Subdivision" ORDER BY e."PK_Employee"`,
      ),
    ),
  ),
);

const checkPw = (p: string | null) => {
  if (p && p.length < 6) throw new HttpError(400, 'Пароль — не короче 6 символов.');
  return p;
};

adminRouter.post(
  '/users',
  a(async (req, res) => {
    const b = req.body;
    const pw = checkPw(str(b.Password));
    if (!pw) throw new HttpError(400, 'Задайте пароль.');
    await q(
      `INSERT INTO "Employee" ("Surname","Name","Patronymic","Login","Password","Phone_number","PK_Job_title","PK_Subdivision") VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [need(str(b.Surname), 'Фамилия'), need(str(b.Name), 'Имя'), str(b.Patronymic), need(str(b.Login), 'Логин'), hashPassword(pw), str(b.Phone_number), need(int(b.PK_Job_title), 'Должность'), int(b.PK_Subdivision)],
    );
    await audit(req, 'Создание', 'Пользователь', String(b.Login));
    res.json({ ok: true });
  }),
);
adminRouter.put(
  '/users/:id',
  a(async (req, res) => {
    const b = req.body;
    const pw = checkPw(str(b.Password));
    await q(
      `UPDATE "Employee" SET "Surname"=$1,"Name"=$2,"Patronymic"=$3,"Login"=$4,"Phone_number"=$5,"PK_Job_title"=$6,"PK_Subdivision"=$7,
         "Password" = COALESCE($8, "Password") WHERE "PK_Employee"=$9`,
      [need(str(b.Surname), 'Фамилия'), need(str(b.Name), 'Имя'), str(b.Patronymic), need(str(b.Login), 'Логин'), str(b.Phone_number), need(int(b.PK_Job_title), 'Должность'), int(b.PK_Subdivision), pw ? hashPassword(pw) : null, req.params.id],
    );
    await audit(req, 'Изменение', 'Пользователь', String(b.Login));
    res.json({ ok: true });
  }),
);
adminRouter.delete(
  '/users/:id',
  a(async (req, res) => {
    if (Number(req.params.id) === req.user!.id) throw new HttpError(400, 'Нельзя удалить самого себя.');
    await q(`DELETE FROM "Employee" WHERE "PK_Employee" = $1`, [req.params.id]);
    await audit(req, 'Удаление', 'Пользователь', `#${req.params.id}`);
    res.json({ ok: true });
  }),
);

adminRouter.get(
  '/audit',
  a(async (req, res) => {
    const lim = Math.min(Number(req.query.limit) || 200, 1000);
    res.json(
      await q(
        `SELECT l."PK_Audit_log" id, l."At" at, l."Action" action, l."Object" object, l."Details" details, concat_ws(' ', e."Surname", e."Name") who
         FROM "Audit_log" l LEFT JOIN "Employee" e ON e."PK_Employee" = l."PK_Employee" ORDER BY l."PK_Audit_log" DESC LIMIT $1`,
        [lim],
      ),
    );
  }),
);
