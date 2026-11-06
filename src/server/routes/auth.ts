import { Router } from 'express';
import { audit, checkPassword, clearSession, loadUser, requireAuth, setSession, upgradePassword } from '../auth';
import { one } from '../db';
import { a, HttpError } from '../http';

export const authRouter = Router();

authRouter.post(
  '/login',
  a(async (req, res) => {
    const login = String(req.body?.login ?? '').trim();
    const password = String(req.body?.password ?? '');
    const row = await one(`SELECT "PK_Employee" id, "Password" pw FROM "Employee" WHERE lower("Login") = lower($1)`, [login]);
    if (!row || !checkPassword(password, row.pw)) throw new HttpError(401, 'Неверный логин или пароль.');
    if (!String(row.pw).startsWith('scrypt$')) await upgradePassword(row.id, password);
    setSession(res, row.id);
    const user = await loadUser(row.id);
    req.user = user ?? undefined;
    await audit(req, 'Вход', 'Сессия');
    res.json(user);
  }),
);

authRouter.post('/logout', (_req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, (req, res) => res.json(req.user));
