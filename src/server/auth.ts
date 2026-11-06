import crypto from 'node:crypto';
import { NextFunction, Request, Response } from 'express';
import { one, q } from './db';
import { HttpError } from './http';

const SECRET = process.env.SESSION_SECRET || 'dev-secret';
const COOKIE = 'nm_sid';
const TTL_MS = 12 * 60 * 60 * 1000;

export interface User {
  id: number;
  login: string;
  fullName: string;
  role: string;
  subdivision: string | null;
  perms: string[];
}

// Права по ролям (по таблице ролей из ТЗ)
export const PERMS: Record<string, string[]> = {
  'ref:write': ['Технолог', 'Администратор'],
  'norm:edit': ['Технолог', 'Нормировщик', 'Администратор'],
  'norm:consolidate': ['Нормировщик', 'Администратор'],
  'norm:approve': ['Нормировщик', 'Администратор'],
  'program:edit': ['Экономист', 'Администратор'],
  'fact:edit': ['Экономист', 'Администратор'],
  'requirements:calc': ['Экономист', 'Нормировщик', 'Администратор'],
  admin: ['Администратор'],
};

export const permsFor = (role: string) => Object.keys(PERMS).filter((p) => PERMS[p].includes(role));

// ---- пароли: scrypt; старые открытые пароли из BDScript.sql обновляются при входе
export function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(12).toString('hex');
  const h = crypto.scryptSync(pw, salt, 32).toString('hex');
  return `scrypt$${salt}$${h}`;
}
export function checkPassword(pw: string, stored: string | null): boolean {
  if (!stored) return false;
  if (stored.startsWith('scrypt$')) {
    const [, salt, h] = stored.split('$');
    const calc = crypto.scryptSync(pw, salt, 32);
    const exp = Buffer.from(h, 'hex');
    return exp.length === calc.length && crypto.timingSafeEqual(exp, calc);
  }
  const a = Buffer.from(pw);
  const b = Buffer.from(stored);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---- подписанная cookie-сессия
const sign = (p: string) => crypto.createHmac('sha256', SECRET).update(p).digest('base64url');

export function setSession(res: Response, userId: number) {
  const payload = Buffer.from(JSON.stringify({ id: userId, exp: Date.now() + TTL_MS })).toString('base64url');
  res.cookie(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: TTL_MS,
    secure: process.env.COOKIE_SECURE === '1',
  });
}
export const clearSession = (res: Response) => res.clearCookie(COOKIE);

function readCookie(req: Request, name: string): string | null {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

export async function loadUser(id: number): Promise<User | null> {
  const r = await one(
    `SELECT e."PK_Employee" id, e."Login" login,
            concat_ws(' ', e."Surname", e."Name", e."Patronymic") full_name,
            j."Name" role, s."Name" subdivision
     FROM "Employee" e
     LEFT JOIN "Job_title" j ON j."PK_Job_title" = e."PK_Job_title"
     LEFT JOIN "Subdivision" s ON s."PK_Subdivision" = e."PK_Subdivision"
     WHERE e."PK_Employee" = $1`,
    [id],
  );
  if (!r) return null;
  return { id: r.id, login: r.login, fullName: r.full_name, role: r.role ?? '', subdivision: r.subdivision, perms: permsFor(r.role ?? '') };
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: User;
  }
}

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const c = readCookie(req, COOKIE);
    if (c) {
      const [payload, sig] = c.split('.');
      if (payload && sig && sign(payload) === sig) {
        const { id, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
        if (exp > Date.now()) req.user = (await loadUser(id)) ?? undefined;
      }
    }
    next();
  } catch (e) {
    next(e);
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(new HttpError(401, 'Требуется вход в систему.'));
  next();
}

export const can = (perm: string) => (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user) return next(new HttpError(401, 'Требуется вход в систему.'));
  if (!req.user.perms.includes(perm)) return next(new HttpError(403, 'Недостаточно прав для этой операции.'));
  next();
};

export async function audit(req: Request, action: string, object: string, details?: string) {
  await q(`INSERT INTO "Audit_log" ("Action","Object","Details","PK_Employee") VALUES ($1,$2,$3,$4)`, [
    action,
    object,
    details ?? null,
    req.user?.id ?? null,
  ]).catch(() => undefined);
}

export async function upgradePassword(id: number, pw: string) {
  await q(`UPDATE "Employee" SET "Password" = $1 WHERE "PK_Employee" = $2`, [hashPassword(pw), id]);
}
