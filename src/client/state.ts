import { get } from './api';

export interface Me {
  id: number;
  login: string;
  fullName: string;
  role: string;
  subdivision: string | null;
  perms: string[];
}

export const state: { me: Me | null } = { me: null };
export const can = (perm: string) => !!state.me?.perms.includes(perm);

// небольшой кэш справочников для выпадающих списков
const cache = new Map<string, Promise<any[]>>();
export function lookup<T = any>(path: string): Promise<T[]> {
  if (!cache.has(path)) cache.set(path, get(path).catch((e) => { cache.delete(path); throw e; }));
  return cache.get(path)!;
}
export const invalidate = (...prefixes: string[]) => {
  for (const k of [...cache.keys()]) if (!prefixes.length || prefixes.some((p) => k.startsWith(p))) cache.delete(k);
};
