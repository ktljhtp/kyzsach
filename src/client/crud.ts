import { del, get, post, put } from './api';
import { invalidate } from './state';
import { btn, clear, Col, confirmBox, Field, formSheet, h, iconBtn, searchBox, table, toast } from './ui';

export interface CrudCfg<T = any> {
  endpoint: string;
  idKey: string;
  entity: string; // «материал», «поставщик» …
  title?: string;
  columns: Col<T>[];
  fields: (row?: T) => Promise<Field[]> | Field[];
  canWrite: boolean;
  toValues?: (row: T) => Record<string, any>;
  filter?: (row: T) => boolean;
  rowLabel?: (row: T) => string;
  invalidates?: string[];
  headExtra?: Node[];
  wide?: boolean;
  emptyHint?: string;
  load?: () => Promise<T[]>;
  genderF?: boolean; // «новая» / «новый»
}

export function crudView<T extends Record<string, any>>(cfg: CrudCfg<T>) {
  let rows: T[] = [];
  let q = '';
  const body = h('div');
  const draw = () => {
    clear(body);
    const list = rows.filter((r) => (!cfg.filter || cfg.filter(r)) && (!q || JSON.stringify(Object.values(r)).toLowerCase().includes(q)));
    const cols: Col<T>[] = [...cfg.columns];
    if (cfg.canWrite)
      cols.push({
        title: '', align: 'r', width: '84px',
        render: (r) => h('div', { class: 'row-actions' },
          iconBtn('pencil', 'Изменить', () => openForm(r)),
          iconBtn('trash', 'Удалить', async () => {
            if (!(await confirmBox('Удалить запись?', cfg.rowLabel?.(r) ?? 'Действие нельзя отменить.'))) return;
            try { await del(`${cfg.endpoint}/${r[cfg.idKey]}`); toast('Удалено'); changed(); await reload(); } catch (e: any) { toast(e.message, 'err'); }
          }, 'danger')),
      });
    body.appendChild(table(cols, list, { empty: q ? 'Ничего не найдено' : 'Пока пусто', emptyHint: q ? 'Измените запрос.' : cfg.emptyHint ?? (cfg.canWrite ? 'Добавьте первую запись.' : '') }));
  };
  const changed = () => invalidate(...(cfg.invalidates ?? []));
  const openForm = async (row?: T) => {
    const fields = await cfg.fields(row);
    formSheet({
      title: row ? `Изменить: ${cfg.entity}` : `Добавить: ${cfg.entity}`,
      fields, wide: cfg.wide,
      values: row ? (cfg.toValues ? cfg.toValues(row) : row) : {},
      onSubmit: async (v) => {
        if (row) await put(`${cfg.endpoint}/${row[cfg.idKey]}`, v);
        else await post(cfg.endpoint, v);
        toast('Сохранено');
        changed();
        await reload();
      },
    });
  };
  const reload = async () => {
    rows = cfg.load ? await cfg.load() : await get<T[]>(cfg.endpoint);
    draw();
  };
  const actions: Node[] = [searchBox((s) => { q = s; draw(); }), ...(cfg.headExtra ?? [])];
  if (cfg.canWrite) actions.push(btn('Добавить', () => openForm(), 'primary', 'plus'));
  const head = h('div', { class: 'card-head' }, cfg.title ? h('h2', null, cfg.title) : h('span'), h('div', { class: 'actions' }, ...actions));
  const el = h('section', { class: 'card' }, head, body);
  return { el, reload };
}
