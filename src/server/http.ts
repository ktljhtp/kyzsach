import { NextFunction, Request, RequestHandler, Response } from 'express';

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const a =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  // Ошибки PostgreSQL → понятные сообщения
  switch (err?.code) {
    case '23503':
      return res.status(409).json({
        error: /delete/i.test(err.message) || /still referenced/i.test(err.detail ?? '')
          ? 'Запись используется в других данных — удалить её нельзя.'
          : 'Указана несуществующая связанная запись.',
      });
    case '23505':
      return res.status(409).json({ error: 'Такая запись уже существует.' });
    case '23514':
      return res.status(400).json({ error: 'Значение не прошло проверку.' });
    case '22P02':
    case '22003':
    case '22007':
      return res.status(400).json({ error: 'Некорректное значение в одном из полей.' });
    case '22001':
      return res.status(400).json({ error: 'Слишком длинное значение в одном из полей.' });
  }
  console.error(err);
  res.status(500).json({ error: 'Внутренняя ошибка сервера.' });
}

export const num = (v: any): number | null => {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
export const int = (v: any): number | null => {
  const n = num(v);
  return n === null ? null : Math.trunc(n);
};
export const str = (v: any): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
};
export const need = <T>(v: T | null | undefined, field: string): T => {
  if (v === null || v === undefined) throw new HttpError(400, `Заполните поле «${field}».`);
  return v;
};
export const round = (v: number, d = 4) => {
  const k = 10 ** d;
  return Math.round((v + Number.EPSILON) * k) / k;
};
