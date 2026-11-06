import { download, get } from '../api';
import { current } from '../router';
import { lookup } from '../state';
import { btn, buildForm, clear, Field, fmt, h, icon, MONTHS, pageHead, toast } from '../ui';

export function renderDoc(doc: any): HTMLElement {
  const cell = (c: any, v: any) => {
    if (v === null || v === undefined || v === '') return '';
    if (c.type === 'int') return fmt(v, 0);
    if (c.type === 'num') return fmt(v, c.digits ?? 3);
    if (c.type === 'pct') return (Number(v) > 0 ? '+' : '') + fmt(v, c.digits ?? 1);
    return String(v);
  };
  return h('div', { class: 'paper' },
    h('h2', null, doc.title), doc.subtitle && h('div', { class: 'sub' }, doc.subtitle),
    h('div', { class: 'meta' }, ...doc.meta.map(([k, v]: [string, string]) => h('div', null, `${k}: `, h('b', null, v)))),
    h('table', null,
      h('thead', null, h('tr', null, ...doc.columns.map((c: any) => h('th', null, c.title)))),
      h('tbody', null, ...(doc.rows.length ? doc.rows.map((r: any) => h('tr', { class: r._flag ? 'flag' : '' },
        ...doc.columns.map((c: any) => h('td', { class: c.type && c.type !== 'text' ? 'r' : '' }, cell(c, r[c.key]))))) : [h('tr', null, h('td', { colspan: doc.columns.length, style: { textAlign: 'center', color: '#666' } }, 'Нет данных'))]))),
    ...(doc.footer ?? []).map(([k, v]: [string, string]) => h('div', { class: 'foot' }, `${k}: ${v}`)),
    doc.notes?.length ? h('div', { class: 'notes' }, ...doc.notes.map((n: string) => h('div', null, n))) : null,
    doc.signatures?.length ? h('div', { class: 'sign' }, ...doc.signatures.map((s: string) => h('div', null, `${s}: ____________________   Дата: ______________`))) : null);
}

interface DocType { key: string; title: string; desc: string; color: string; ic: string; fields: () => Promise<Field[]> | Field[]; defaults?: Record<string, any> }

export async function docs(root: HTMLElement) {
  const prodOpts = async () => (await lookup('/products')).map((p: any) => ({ value: p.PK_Finished_product, label: `${p.Cipher} · ${p.Name}` }));
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const types: DocType[] = [
    { key: 'summary-sheet', title: 'Сводная ведомость норм', desc: 'Нормы расхода всех материалов на изделие с КИМ.', color: '#007aff', ic: 'docCheck',
      fields: async () => [{ name: 'product', label: 'Изделие', type: 'select', options: await prodOpts(), required: true }] },
    { key: 'requirements', title: 'План потребности', desc: 'Сколько материалов нужно заказать на программу.', color: '#ff9500', ic: 'calendar',
      fields: async () => [{ name: 'program', label: 'Программа', type: 'select', required: true, options: (await get('/programs')).map((p: any) => ({ value: p.PK_Production_program, label: `${MONTHS[p.Month - 1]} ${p.Year} (${p.Program_code})` })) }] },
    { key: 'limit-card', title: 'Лимитно-заборная карта', desc: 'Лимиты отпуска материалов в цех на партию.', color: '#34c759', ic: 'print',
      fields: async () => [{ name: 'product', label: 'Изделие', type: 'select', options: await prodOpts(), required: true }, { name: 'batch', label: 'Партия, шт.', type: 'number', required: true }, { name: 'workshop', label: 'Цех' }],
      defaults: { batch: 20, workshop: 'Мебельный' } },
    { key: 'costing', title: 'Калькуляция себестоимости', desc: 'Материальная себестоимость изделия по ценам поставщиков.', color: '#5856d6', ic: 'calc',
      fields: async () => [{ name: 'product', label: 'Изделие', type: 'select', options: await prodOpts(), required: true }] },
    { key: 'plan-fact', title: 'План-фактный анализ', desc: 'Отклонения фактического расхода от нормативного.', color: '#ff2d55', ic: 'chart',
      fields: () => [{ name: 'period', label: 'Период', type: 'month', required: true }], defaults: { period: month } },
  ];

  const q = current().params;
  const out = h('div');
  const showCards = () => {
    clear(out);
    out.append(h('div', { class: 'doc-cards' }, ...types.map((t) => h('button', { class: 'doc-card', onclick: () => open(t) },
      h('span', { class: 'ic', style: { background: t.color } }, icon(t.ic)), h('b', null, t.title), h('span', null, t.desc)))));
  };

  async function open(t: DocType, preset: Record<string, any> = {}) {
    clear(out);
    const fields = await t.fields();
    const form = buildForm(fields, { ...(t.defaults ?? {}), ...preset });
    if (!preset.product && !preset.program) {
      const first = fields[0];
      if (first?.type === 'select' && first.options?.length) (form.input(first.name) as HTMLSelectElement).value = String(first.options[0].value);
    }
    const paper = h('div');
    const query = () => {
      const v = form.get();
      return Object.entries(v).filter(([, x]) => x !== null && x !== '').map(([k, x]) => `${k}=${encodeURIComponent(String(x))}`).join('&');
    };
    let last = '';
    const refresh = async () => {
      const qs = query();
      last = qs;
      try {
        const doc = await get(`/docs/${t.key}?${qs}`);
        if (qs !== last) return;
        paper.replaceChildren(renderDoc(doc));
      } catch (e: any) { paper.replaceChildren(h('div', { class: 'empty' }, h('b', null, 'Документ не сформирован'), e.message)); }
    };
    form.el.addEventListener('change', refresh);
    form.el.addEventListener('input', (e) => { if ((e.target as HTMLElement).tagName === 'INPUT') { clearTimeout((refresh as any)._t); (refresh as any)._t = setTimeout(refresh, 350); } });
    out.append(
      h('div', { class: 'no-print', style: { marginBottom: '14px' } }, btn('Все документы', showCards, 'plain')),
      h('div', { class: 'card no-print', style: { marginBottom: '18px' } }, h('div', { class: 'card-body' }, form.el,
        h('div', { class: 'actions', style: { marginTop: '14px' } },
          btn('Скачать Excel', async () => { try { await download(`/docs/${t.key}?${query()}&format=xlsx`); } catch (e: any) { toast(e.message, 'err'); } }, 'primary', 'download'),
          btn('Печать', () => window.print(), '', 'print')))),
      paper);
    await refresh();
  }

  root.append(pageHead('Документы', 'Выходные формы по принятым на предприятии образцам — просмотр, печать и выгрузка в Excel.'), out);
  const start = types.find((t) => t.key === q.get('doc'));
  if (start) await open(start, Object.fromEntries([...q.entries()].filter(([k]) => k !== 'doc')));
  else showCards();
}
