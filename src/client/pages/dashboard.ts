import { get } from '../api';
import { go } from '../router';
import { state } from '../state';
import { badge, btn, card, fmtDateTime, h, icon, MONTHS, pageHead } from '../ui';

export async function dashboard(root: HTMLElement) {
  const d = await get('/dashboard');
  const first = state.me?.fullName.split(' ')[1] ?? '';
  root.append(pageHead('Обзор', first ? `Здравствуйте, ${first}. Вот что происходит с нормами сегодня.` : undefined));

  const tile = (n: number, label: string, ic: string, color: string, to: string) =>
    h('button', { class: 'tile', onclick: () => go(to) }, h('span', { class: 'ic', style: { background: color } }, icon(ic)), h('b', null, String(n)), h('span', null, label));
  root.append(h('div', { class: 'tiles' },
    tile(d.counts.materials, 'материалов', 'layers', '#ff9500', 'materials'),
    tile(d.counts.products, 'изделий', 'cube', '#007aff', 'products'),
    tile(d.counts.details, 'деталей в составе', 'grid', '#5856d6', 'products'),
    tile(d.counts.layouts, 'карт раскроя', 'grid', '#34c759', 'layouts')));

  const total = d.norms.reduce((s: number, x: any) => s + x.n, 0) || 1;
  const colors: Record<number, string> = { 1: '#8e8e93', 2: '#ff9500', 3: '#34c759', 4: '#636366' };
  root.append(h('div', { class: 'section-title' }, ''));
  root.append(card('Нормы по статусам', h('div', { class: 'card-body' },
    h('div', { class: 'bar', role: 'img', 'aria-label': 'Распределение норм по статусам' },
      ...d.norms.filter((x: any) => x.n).map((x: any) => h('i', { style: { width: `${(x.n / total) * 100}%`, background: colors[x.id] }, title: `${x.name}: ${x.n}` }))),
    h('div', { class: 'legend' }, ...d.norms.map((x: any) => h('span', null, h('span', { class: 'dot', style: { background: colors[x.id] } }), x.name + ' ', h('b', null, String(x.n))))),
  ), { actions: [btn('Все нормы', () => go('norms'))] }));

  const pend = d.pending.length
    ? d.pending.map((p: any) => h('div', { class: 'list-row click', onclick: () => go(p.kind === 'norm' ? 'norms' : 'layouts') },
        h('div', { class: 'grow' }, h('b', null, p.label), h('div', { class: 'sub' }, p.description ?? '')), badge(p.kind === 'norm' ? 'Норма' : 'Карта раскроя', 's2')))
    : [h('div', { class: 'empty' }, h('b', null, 'Всё согласовано'), 'Документов на согласовании нет.')];
  const recalc = d.recalc.length
    ? d.recalc.map((p: any) => h('div', { class: 'list-row click', onclick: () => go('calc', { product: p.id }) },
        h('div', { class: 'grow' }, h('b', null, p.cipher), h('div', { class: 'sub' }, p.name)), badge('Нужен перерасчёт', 'warn')))
    : [h('div', { class: 'empty' }, h('b', null, 'Всё актуально'), 'Сводные нормы пересчитаны.')];
  root.append(h('div', { class: 'grid2', style: { marginTop: '18px' } },
    card('На согласовании', pend), card('Требуют перерасчёта', recalc)));

  const rec = d.recent.map((r: any) => h('div', { class: 'list-row' },
    h('div', { class: 'grow' }, h('b', null, r.label ?? '—'), h('div', { class: 'sub' }, `${r.action} · ${r.author ?? '—'}`)),
    h('span', { class: 'sub' }, fmtDateTime(r.at))));
  const prog = d.program
    ? h('div', { class: 'card-body' },
        h('p', null, h('b', null, d.program.code), ` — ${MONTHS[d.program.Month - 1]} ${d.program.Year}`),
        h('p', { class: 'sub', style: { margin: '6px 0 12px', color: 'var(--label-2)' } }, d.program.calculated ? 'Потребность в материалах рассчитана.' : 'Потребность ещё не рассчитана.'),
        btn('Открыть программы', () => go('programs'), 'primary'))
    : h('div', { class: 'empty' }, h('b', null, 'Программ пока нет'), '');
  root.append(h('div', { class: 'grid2', style: { marginTop: '18px' } },
    card('Последние изменения', rec.length ? rec : [h('div', { class: 'empty' }, h('b', null, 'Изменений ещё не было'), '')]),
    card('Производственная программа', prog)));
}
