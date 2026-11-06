import { crudView } from '../crud';
import { get } from '../api';
import { lookup } from '../state';
import { badge, Field, fmtDateTime, h, pageHead, segmented, table, card } from '../ui';

export async function admin(root: HTMLElement) {
  const holder = h('div');
  const users = () => crudView<any>({
    endpoint: '/admin/users', idKey: 'PK_Employee', entity: 'пользователь', canWrite: true, wide: true,
    rowLabel: (r) => `${r.Surname} ${r.Name} (${r.Login})`,
    columns: [
      { title: 'ФИО', render: (r) => h('b', null, [r.Surname, r.Name, r.Patronymic].filter(Boolean).join(' ')) },
      { title: 'Логин', render: (r) => r.Login, cls: 'mono' },
      { title: 'Роль', render: (r) => badge(r.job_name ?? '—', 'info') },
      { title: 'Подразделение', render: (r) => r.subdivision_name ?? '—', cls: 'dim' },
      { title: 'Телефон', render: (r) => r.Phone_number ?? '—', cls: 'dim' },
    ],
    toValues: (r) => ({ ...r, Password: '' }),
    fields: async (row) => {
      const [j, s] = await Promise.all([lookup('/dict/job-titles'), lookup('/dict/subdivisions')]);
      return [
        { name: 'Surname', label: 'Фамилия', required: true }, { name: 'Name', label: 'Имя', required: true },
        { name: 'Patronymic', label: 'Отчество' }, { name: 'Phone_number', label: 'Телефон' },
        { name: 'Login', label: 'Логин', required: true },
        { name: 'Password', label: row ? 'Новый пароль' : 'Пароль', type: 'password', required: !row, hint: row ? 'Оставьте пустым, чтобы не менять' : 'Не короче 6 символов' },
        { name: 'PK_Job_title', label: 'Роль', type: 'select', required: true, options: j.map((x: any) => ({ value: x.PK_Job_title, label: x.Name })) },
        { name: 'PK_Subdivision', label: 'Подразделение', type: 'select', options: s.map((x: any) => ({ value: x.PK_Subdivision, label: x.Name })) },
      ] as Field[];
    },
  });
  const simple = (path: string, pk: string, entity: string) => crudView<any>({
    endpoint: path, idKey: pk, entity, canWrite: true, invalidates: [path],
    columns: [{ title: 'Наименование', render: (r) => h('b', null, r.Name) }, { title: 'Описание', render: (r) => r.Description ?? '—', cls: 'dim' }],
    fields: () => [{ name: 'Name', label: 'Наименование', required: true }, { name: 'Description', label: 'Описание', type: 'textarea' }],
  });
  const show = async (key: string) => {
    holder.replaceChildren();
    if (key === 'audit') {
      const rows: any[] = await get('/admin/audit?limit=300');
      holder.append(card(null, table([
        { title: 'Когда', render: (r) => fmtDateTime(r.at), cls: 'dim' },
        { title: 'Кто', render: (r) => r.who ?? '—' },
        { title: 'Действие', render: (r) => badge(r.action, 'info') },
        { title: 'Объект', render: (r) => r.object ?? '—' },
        { title: 'Детали', render: (r) => r.details ?? '', cls: 'dim' },
      ], rows, { empty: 'Журнал пуст' })));
      return;
    }
    const v = key === 'users' ? users() : key === 'roles' ? simple('/dict/job-titles', 'PK_Job_title', 'роль') : simple('/dict/subdivisions', 'PK_Subdivision', 'подразделение');
    holder.append(v.el);
    await v.reload();
  };
  root.append(
    pageHead('Администрирование', 'Пользователи, роли, подразделения и журнал аудита операций с нормами.'),
    h('div', { style: { marginBottom: '14px' } }, segmented([{ value: 'users', label: 'Пользователи' }, { value: 'roles', label: 'Должности' }, { value: 'subs', label: 'Подразделения' }, { value: 'audit', label: 'Журнал аудита' }], 'users', show)),
    holder);
  await show('users');
}
