import { User } from './auth';
import { HttpError } from './http';

// Статусы: 1 Черновик, 2 На согласовании, 3 Утверждён, 4 Архив
const T: Record<number, Record<number, string>> = {
  1: { 2: 'norm:edit' },
  2: { 3: 'norm:approve', 1: 'norm:approve' },
  3: { 4: 'norm:approve' },
  4: { 1: 'norm:approve' },
};

export function checkTransition(user: User, from: number, to: number) {
  const perm = T[from]?.[to];
  if (!perm) throw new HttpError(400, 'Такой переход статуса недопустим.');
  if (!user.perms.includes(perm)) throw new HttpError(403, 'Недостаточно прав для смены статуса.');
}

export const STATUS_NAME: Record<number, string> = { 1: 'Черновик', 2: 'На согласовании', 3: 'Утверждён', 4: 'Архив' };
