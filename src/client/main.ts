import { get, post } from './api';
import { admin } from './pages/admin';
import { calc } from './pages/calc';
import { dashboard } from './pages/dashboard';
import { docs } from './pages/docs';
import { layouts } from './pages/layouts';
import { materials } from './pages/materials';
import { norms } from './pages/norms';
import { planfact } from './pages/planfact';
import { products } from './pages/products';
import { programs } from './pages/programs';
import { refs } from './pages/refs';
import { current, go, onRoute } from './router';
import { can, invalidate, Me, state } from './state';
import { clear, h, icon, toast } from './ui';

interface Route { key: string; title: string; ic: string; group: string; page: (root: HTMLElement) => Promise<void>; show?: () => boolean }
const ROUTES: Route[] = [
  { key: 'dashboard', title: 'Обзор', ic: 'home', group: '', page: dashboard },
  { key: 'materials', title: 'Материалы', ic: 'layers', group: 'Данные', page: materials },
  { key: 'products', title: 'Изделия', ic: 'cube', group: 'Данные', page: products },
  { key: 'refs', title: 'Справочники', ic: 'book', group: 'Данные', page: refs },
  { key: 'layouts', title: 'Карты раскроя', ic: 'grid', group: 'Нормирование', page: layouts },
  { key: 'norms', title: 'Нормы и согласование', ic: 'docCheck', group: 'Нормирование', page: norms },
  { key: 'calc', title: 'Расчёт норм', ic: 'calc', group: 'Нормирование', page: calc },
  { key: 'programs', title: 'Программы', ic: 'calendar', group: 'Планирование', page: programs },
  { key: 'planfact', title: 'План-факт', ic: 'chart', group: 'Планирование', page: planfact },
  { key: 'docs', title: 'Документы', ic: 'print', group: 'Планирование', page: docs },
  { key: 'admin', title: 'Администрирование', ic: 'shield', group: 'Система', page: admin, show: () => can('admin') },
];

const app = document.getElementById('app')!;

function loginScreen() {
  clear(app);
  const login = h('input', { class: 'input', placeholder: 'Логин', autocomplete: 'username', autocapitalize: 'none', 'aria-label': 'Логин' });
  const pw = h('input', { class: 'input', type: 'password', placeholder: 'Пароль', autocomplete: 'current-password', 'aria-label': 'Пароль' });
  const err = h('div', { class: 'form-error', hidden: true, role: 'alert' });
  const btnEl = h('button', { class: 'btn primary', type: 'submit' }, 'Войти');
  const form = h('form', { class: 'login-card' },
    h('div', { class: 'logo' }, icon('logo')),
    h('div', null, h('h1', null, 'Нормы-М'), h('p', null, 'Нормы расхода материалов на изделие')),
    h('div', { class: 'login-form' }, login, pw),
    err, btnEl,
    h('div', { class: 'demo' }, 'Демо-доступ: ', h('code', null, 'ivanov / pass123'), ' технолог · ', h('code', null, 'petrov / pass456'), ' нормировщик', h('br'),
      h('code', null, 'sidorova / pass789'), ' экономист · ', h('code', null, 'kuznetsova / snab123'), ' снабженец · ', h('code', null, 'admin / admin123')));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.hidden = true;
    btnEl.disabled = true;
    try {
      state.me = await post<Me>('/auth/login', { login: login.value, password: pw.value });
      invalidate();
      shell();
    } catch (ex: any) { err.textContent = ex.message; err.hidden = false; } finally { btnEl.disabled = false; }
  });
  app.append(h('div', { class: 'login' }, form));
  login.focus();
}

let rendering = 0;
function shell() {
  clear(app);
  const me = state.me!;
  const nav = h('nav', { class: 'sidebar', 'aria-label': 'Основное меню' });
  nav.append(h('div', { class: 'brand' }, h('span', { class: 'logo' }, icon('logo')), h('div', null, 'Нормы-М', h('small', null, 'МебельПро'))));
  let group = '';
  const items = new Map<string, HTMLElement>();
  for (const r of ROUTES.filter((x) => !x.show || x.show())) {
    if (r.group !== group) { group = r.group; if (group) nav.append(h('div', { class: 'nav-group' }, group)); }
    const b = h('button', { class: 'nav-item', onclick: () => { go(r.key); appEl.classList.remove('nav-open'); } }, icon(r.ic), r.title);
    items.set(r.key, b);
    nav.append(b);
  }
  const initials = me.fullName.split(' ').slice(0, 2).map((s) => s[0]).join('');
  nav.append(h('div', { class: 'nav-spacer' }),
    h('div', { class: 'me' }, h('div', { class: 'avatar' }, initials), h('div', { class: 'who' }, h('b', null, me.fullName), h('span', null, me.role)),
      h('button', { class: 'btn icon plain', 'aria-label': 'Выйти', title: 'Выйти', onclick: async () => { await post('/auth/logout').catch(() => undefined); state.me = null; invalidate(); loginScreen(); } }, icon('out'))));

  const title = h('span', { class: 'tb-title' });
  const content = h('div', { class: 'page' });
  const main = h('main', { class: 'main', id: 'main' },
    h('div', { class: 'toolbar' }, h('button', { class: 'btn icon plain menu-btn', 'aria-label': 'Меню', onclick: () => appEl.classList.toggle('nav-open') }, icon('menu')), title, h('span', { class: 'grow' })),
    content);
  main.addEventListener('scroll', () => main.classList.toggle('scrolled', main.scrollTop > 24), { passive: true });
  const appEl = h('div', { class: 'app' }, nav, main);
  appEl.addEventListener('click', (e) => { if (appEl.classList.contains('nav-open') && e.target === appEl) appEl.classList.remove('nav-open'); });
  app.append(appEl);

  const render = async () => {
    const my = ++rendering;
    const { route } = current();
    const r = ROUTES.find((x) => x.key === route && (!x.show || x.show())) ?? ROUTES[0];
    for (const [k, el] of items) { if (k === r.key) el.setAttribute('aria-current', 'page'); else el.removeAttribute('aria-current'); }
    title.textContent = r.title;
    document.title = `${r.title} — Нормы-М`;
    const tmp = h('div');
    try { await r.page(tmp); } catch (e: any) { tmp.replaceChildren(h('div', { class: 'empty' }, h('b', null, 'Не удалось загрузить страницу'), e.message)); }
    if (my !== rendering) return;
    content.replaceChildren(...Array.from(tmp.childNodes));
    main.scrollTop = 0;
  };
  onRoute(render);
  render();
}

window.addEventListener('nm:unauthorized', () => { if (state.me) { state.me = null; toast('Сеанс завершён. Войдите снова.', 'err'); loginScreen(); } });

(async () => {
  try { state.me = await get<Me>('/auth/me'); shell(); } catch { loginScreen(); }
})();
