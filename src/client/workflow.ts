import { get, post } from './api';
import { can, invalidate } from './state';
import { badge, confirmBox, fmt, fmtDateTime, h, openSheet, SheetHandle, statusBadge, toast } from './ui';

export const STATUS: Record<number, string> = { 1: 'Черновик', 2: 'На согласовании', 3: 'Утверждён', 4: 'Архив' };

export interface Transition { to: number; label: string; perm: string; primary?: boolean; danger?: boolean }
export function transitionsFrom(status: number): Transition[] {
  const all: Record<number, Transition[]> = {
    1: [{ to: 2, label: 'Отправить на согласование', perm: 'norm:edit', primary: true }],
    2: [{ to: 3, label: 'Утвердить', perm: 'norm:approve', primary: true }, { to: 1, label: 'Вернуть в черновик', perm: 'norm:approve' }],
    3: [{ to: 4, label: 'В архив', perm: 'norm:approve' }],
    4: [{ to: 1, label: 'Вернуть в работу', perm: 'norm:approve' }],
  };
  return (all[status] ?? []).filter((t) => can(t.perm));
}

/** Лист «История версий» для нормы или карты раскроя с возможностью вернуться к версии. */
export async function historySheet(entity: 'norm' | 'layout', id: number, title: string, onChanged?: () => void) {
  const rows: any[] = await get(`/versions?entity=${entity}&id=${id}`);
  const body = h('div', { class: 'card', style: { boxShadow: 'none' } });
  let sh: SheetHandle;
  rows.forEach((v, i) => {
    const s = v.snapshot ?? {};
    const detail = entity === 'norm'
      ? `Значение ${fmt(s.Significance_of_the_norm, 6)} · коэф. ${fmt(s.Loss_coefficient, 3)}`
      : `${(s.positions ?? []).length} поз. · КИМ ${fmt((s.Material_utilization_factor ?? 0) * 100, 1)}%`;
    body.append(h('div', { class: 'list-row' },
      h('div', { class: 'grow' },
        h('b', null, `Версия ${v.version_no}`, ' ', statusBadge(s.PK_Document_status ?? 1, STATUS[s.PK_Document_status] ?? '—')),
        h('div', { class: 'sub' }, `${v.action} · ${v.author ?? '—'} · ${fmtDateTime(v.changed_at)}`),
        h('div', { class: 'sub' }, detail)),
      can('norm:approve') && i > 0 && h('button', { class: 'btn sm', onclick: async () => {
        if (!(await confirmBox(`Вернуться к версии ${v.version_no}?`, 'Текущее состояние сохранится в истории, а восстановленная версия станет черновиком.', 'Вернуться', false))) return;
        try {
          await post(`/${entity === 'norm' ? 'norms' : 'layouts'}/${id}/restore`, { versionId: v.id });
          invalidate();
          toast('Версия восстановлена как черновик');
          sh.close();
          onChanged?.();
        } catch (e: any) { toast(e.message, 'err'); }
      } }, 'Вернуться')));
  });
  if (!rows.length) body.append(h('div', { class: 'empty' }, h('b', null, 'История пуста'), 'Версии появятся после первого изменения.'));
  sh = openSheet({ title: `История версий — ${title}`, body, wide: true });
}

/** История изменений по изделию (запрос 5): нормы и карты раскроя вместе. */
export async function productHistorySheet(productId: number, title: string) {
  const rows: any[] = await get(`/versions?product=${productId}`);
  const body = h('div', { class: 'card', style: { boxShadow: 'none' } });
  for (const v of rows)
    body.append(h('div', { class: 'list-row' },
      h('div', { class: 'grow' }, h('b', null, v.label ?? '—', ' ', badge(v.entity === 'norm' ? 'Норма' : 'Карта раскроя', 'info'), ' ', badge('v' + v.version_no)),
        h('div', { class: 'sub' }, `${v.action} · ${v.author ?? '—'}`)),
      h('span', { class: 'sub' }, fmtDateTime(v.changed_at))));
  if (!rows.length) body.append(h('div', { class: 'empty' }, h('b', null, 'Изменений не найдено'), ''));
  openSheet({ title: `История изменений — ${title}`, body, wide: true });
}
