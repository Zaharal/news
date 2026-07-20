// Новостной раздел с админкой, пользователями и правами доступа.
// Чистый Node.js, без зависимостей. Запуск: node server.js
// Данные хранятся в JSON-файлах в папке data/

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = 3000;
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const NEWS_FILE = path.join(DATA_DIR, 'news.json');

// ---------- Работа с данными ----------

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

// При первом запуске создаём файлы с данными по умолчанию
function initData() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

  if (!fs.existsSync(USERS_FILE)) {
    writeJson(USERS_FILE, [
      {
        id: 1,
        login: 'admin',
        passwordHash: hashPassword('admin'),
        fio: 'Иванов Иван Иванович',
        email: 'admin@example.com',
        role: 'admin', // admin — управление новостями и пользователями
        registeredAt: new Date().toISOString(),
        lastLoginAt: null
      },
      {
        id: 2,
        login: 'editor',
        passwordHash: hashPassword('editor'),
        fio: 'Петров Пётр Петрович',
        email: 'editor@example.com',
        role: 'editor', // editor — только управление новостями
        registeredAt: new Date().toISOString(),
        lastLoginAt: null
      }
    ]);
  }

  if (!fs.existsSync(NEWS_FILE)) {
    writeJson(NEWS_FILE, [
      {
        id: 1,
        title: 'Первая новость сайта',
        announce: 'Это анонс первой новости. Кликните по заголовку, чтобы прочитать полностью.',
        image: 'https://picsum.photos/seed/news1/800/400',
        content: '<p>Это <b>полный текст</b> первой новости. Его можно отредактировать в закрытом разделе с помощью WYSIWYG-редактора.</p>',
        author: 'Иванов Иван Иванович',
        createdAt: new Date().toISOString()
      },
      {
        id: 2,
        title: 'Вторая новость сайта',
        announce: 'Короткий анонс второй новости для списка на главной странице.',
        image: 'https://picsum.photos/seed/news2/800/400',
        content: '<p>Полный текст второй новости. Здесь может быть <i>любое</i> форматирование: списки, ссылки, заголовки.</p>',
        author: 'Петров Пётр Петрович',
        createdAt: new Date().toISOString()
      }
    ]);
  }
}

function nextId(items) {
  return items.length ? Math.max(...items.map(i => i.id)) + 1 : 1;
}

// ---------- Сессии ----------

// Сессии храним в памяти: sid -> id пользователя
const sessions = {};

function parseCookies(req) {
  const result = {};
  const header = req.headers.cookie || '';
  header.split(';').forEach(pair => {
    const idx = pair.indexOf('=');
    if (idx > -1) result[pair.slice(0, idx).trim()] = decodeURIComponent(pair.slice(idx + 1));
  });
  return result;
}

function getCurrentUser(req) {
  const sid = parseCookies(req).sid;
  if (!sid || !sessions[sid]) return null;
  const users = readJson(USERS_FILE);
  return users.find(u => u.id === sessions[sid]) || null;
}

// ---------- Вспомогательные функции ----------

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function readBody(req, callback) {
  const chunks = [];
  req.on('data', chunk => { chunks.push(chunk); });
  req.on('end', () => {
    const params = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
    const data = {};
    for (const [key, value] of params) data[key] = value;
    callback(data);
  });
}

function send(res, html, status = 200) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(html);
}

function redirect(res, location, cookie) {
  const headers = { Location: location };
  if (cookie) headers['Set-Cookie'] = cookie;
  res.writeHead(302, headers);
  res.end();
}

// ---------- Общий шаблон страницы ----------

function layout(title, content, user) {
  let nav = '<a href="/">Новости</a>';
  if (user) {
    nav += '<a href="/panel">Управление новостями</a>';
    if (user.role === 'admin') nav += '<a href="/users">Пользователи</a>';
    nav += `<span class="who">${escapeHtml(user.fio)}</span><a href="/logout">Выйти</a>`;
  } else {
    nav += '<a href="/login">Войти</a>';
  }
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <header><nav>${nav}</nav></header>
  <main>${content}</main>
</body>
</html>`;
}

// ---------- Страницы публичной части ----------

function pageNewsList(user) {
  const news = readJson(NEWS_FILE).slice().reverse();
  const cards = news.map(n => `
    <article class="card">
      <img src="${escapeHtml(n.image)}" alt="" class="preview">
      <div class="card-body">
        <h2><a href="/news?id=${n.id}">${escapeHtml(n.title)}</a></h2>
        <p>${escapeHtml(n.announce)}</p>
      </div>
    </article>`).join('');
  return layout('Новости', `<h1>Новости</h1><div class="cards">${cards || '<p>Новостей пока нет.</p>'}</div>`, user);
}

function pageNewsDetail(id, user) {
  const item = readJson(NEWS_FILE).find(n => n.id === id);
  if (!item) return null;
  return layout(item.title, `
    <p><a href="/">&larr; Вернуться к списку новостей</a></p>
    <article class="detail">
      <h1>${escapeHtml(item.title)}</h1>
      <p class="meta">Автор: ${escapeHtml(item.author)} &middot; ${formatDate(item.createdAt)}</p>
      <img src="${escapeHtml(item.image)}" alt="" class="detail-img">
      <div class="content">${item.content}</div>
    </article>
    <p><a href="/">&larr; Вернуться к списку новостей</a></p>`, user);
}

// ---------- Страницы авторизации ----------

function pageLogin(error) {
  return layout('Вход', `
    <h1>Вход</h1>
    ${error ? `<p class="error">${escapeHtml(error)}</p>` : ''}
    <form method="POST" action="/login" class="form">
      <label>Логин <input name="login" required></label>
      <label>Пароль <input type="password" name="password" required></label>
      <button type="submit">Войти</button>
    </form>`, null);
}

// ---------- Закрытая часть: управление новостями ----------

// Панель инструментов WYSIWYG-редактора (contenteditable + execCommand)
function wysiwygScript() {
  return `<script>
    function cmd(name, value) {
      document.getElementById('editor').focus();
      document.execCommand(name, false, value || null);
    }
    function insertLink() {
      var url = prompt('Адрес ссылки:', 'https://');
      if (url) cmd('createLink', url);
    }
    // Перед отправкой формы копируем HTML из редактора в скрытое поле
    document.querySelector('form.form').addEventListener('submit', function () {
      document.getElementById('content-field').value = document.getElementById('editor').innerHTML;
    });
  </script>`;
}

function newsForm(action, item) {
  item = item || { title: '', announce: '', image: '', content: '' };
  return `
    <form method="POST" action="${action}" class="form">
      <label>Заголовок <input name="title" required value="${escapeHtml(item.title)}"></label>
      <label>Анонс <textarea name="announce" rows="3" required>${escapeHtml(item.announce)}</textarea></label>
      <label>Ссылка на картинку <input name="image" value="${escapeHtml(item.image)}" placeholder="https://..."></label>
      <label>Полный текст</label>
      <div class="toolbar">
        <button type="button" onclick="cmd('bold')"><b>Ж</b></button>
        <button type="button" onclick="cmd('italic')"><i>К</i></button>
        <button type="button" onclick="cmd('underline')"><u>Ч</u></button>
        <button type="button" onclick="cmd('formatBlock','h2')">Заголовок</button>
        <button type="button" onclick="cmd('insertUnorderedList')">Список</button>
        <button type="button" onclick="insertLink()">Ссылка</button>
        <button type="button" onclick="cmd('removeFormat')">Очистить</button>
      </div>
      <div id="editor" class="editor" contenteditable="true">${item.content}</div>
      <input type="hidden" name="content" id="content-field">
      <button type="submit">Сохранить</button>
    </form>
    ${wysiwygScript()}`;
}

function pagePanel(user) {
  const news = readJson(NEWS_FILE).slice().reverse();
  const rows = news.map(n => `
    <tr>
      <td>${n.id}</td>
      <td><a href="/news?id=${n.id}">${escapeHtml(n.title)}</a></td>
      <td>${escapeHtml(n.author)}</td>
      <td>${formatDate(n.createdAt)}</td>
      <td class="actions">
        <a href="/panel/edit?id=${n.id}">Редактировать</a>
        <form method="POST" action="/panel/delete" onsubmit="return confirm('Удалить новость?')">
          <input type="hidden" name="id" value="${n.id}">
          <button type="submit" class="danger">Удалить</button>
        </form>
      </td>
    </tr>`).join('');
  return layout('Управление новостями', `
    <h1>Управление новостями</h1>
    <p><a href="/panel/add" class="btn">+ Добавить новость</a></p>
    <table>
      <tr><th>ID</th><th>Заголовок</th><th>Автор</th><th>Дата</th><th>Действия</th></tr>
      ${rows || '<tr><td colspan="5">Новостей нет.</td></tr>'}
    </table>`, user);
}

// ---------- Административная часть: управление пользователями ----------

function userForm(action, item, isEdit) {
  item = item || { login: '', fio: '', email: '', role: 'editor' };
  return `
    <form method="POST" action="${action}" class="form">
      <label>Логин <input name="login" required value="${escapeHtml(item.login)}"></label>
      <label>Пароль <input type="password" name="password" ${isEdit ? 'placeholder="Оставьте пустым, чтобы не менять"' : 'required'}></label>
      <label>ФИО <input name="fio" required value="${escapeHtml(item.fio)}"></label>
      <label>Имейл <input type="email" name="email" required value="${escapeHtml(item.email)}"></label>
      <label>Права доступа
        <select name="role">
          <option value="editor" ${item.role === 'editor' ? 'selected' : ''}>Только закрытый раздел (новости)</option>
          <option value="admin" ${item.role === 'admin' ? 'selected' : ''}>Новости + управление пользователями</option>
        </select>
      </label>
      <button type="submit">Сохранить</button>
    </form>`;
}

function pageUsers(user, error) {
  const users = readJson(USERS_FILE);
  const roleName = r => r === 'admin' ? 'Администратор' : 'Редактор';
  const rows = users.map(u => `
    <tr>
      <td>${u.id}</td>
      <td>${escapeHtml(u.login)}</td>
      <td>${escapeHtml(u.fio)}</td>
      <td>${escapeHtml(u.email)}</td>
      <td>${roleName(u.role)}</td>
      <td>${formatDate(u.registeredAt)}</td>
      <td>${formatDate(u.lastLoginAt)}</td>
      <td class="actions">
        <a href="/users/edit?id=${u.id}">Изменить</a>
        <form method="POST" action="/users/delete" onsubmit="return confirm('Удалить пользователя?')">
          <input type="hidden" name="id" value="${u.id}">
          <button type="submit" class="danger">Удалить</button>
        </form>
      </td>
    </tr>`).join('');
  return layout('Пользователи', `
    <h1>Пользователи</h1>
    ${error ? `<p class="error">${escapeHtml(error)}</p>` : ''}
    <p><a href="/users/add" class="btn">+ Добавить пользователя</a></p>
    <table>
      <tr><th>ID</th><th>Логин</th><th>ФИО</th><th>Имейл</th><th>Права</th><th>Дата регистрации</th><th>Последний вход</th><th>Действия</th></tr>
      ${rows}
    </table>`, user);
}

// ---------- Маршрутизация ----------

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const route = req.method + ' ' + url.pathname;
  const user = getCurrentUser(req);

  // CSS отдаём как статический файл
  if (route === 'GET /style.css') {
    res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' });
    res.end(fs.readFileSync(path.join(__dirname, 'style.css')));
    return;
  }

  // --- Публичная часть ---
  if (route === 'GET /') return send(res, pageNewsList(user));

  if (route === 'GET /news') {
    const page = pageNewsDetail(Number(url.searchParams.get('id')), user);
    if (!page) return send(res, layout('Не найдено', '<h1>Новость не найдена</h1><p><a href="/">На главную</a></p>', user), 404);
    return send(res, page);
  }

  // --- Авторизация ---
  if (route === 'GET /login') return send(res, pageLogin());

  if (route === 'POST /login') {
    return readBody(req, data => {
      const users = readJson(USERS_FILE);
      const found = users.find(u => u.login === data.login && u.passwordHash === hashPassword(data.password || ''));
      if (!found) return send(res, pageLogin('Неверный логин или пароль'), 401);
      // Обновляем дату последней авторизации
      found.lastLoginAt = new Date().toISOString();
      writeJson(USERS_FILE, users);
      const sid = crypto.randomBytes(16).toString('hex');
      sessions[sid] = found.id;
      redirect(res, '/panel', `sid=${sid}; HttpOnly; Path=/`);
    });
  }

  if (route === 'GET /logout') {
    const sid = parseCookies(req).sid;
    if (sid) delete sessions[sid];
    return redirect(res, '/', 'sid=; Path=/; Max-Age=0');
  }

  // --- Дальше всё требует авторизации ---
  if (!user) return redirect(res, '/login');

  // --- Закрытая часть: новости ---
  if (route === 'GET /panel') return send(res, pagePanel(user));

  if (route === 'GET /panel/add') {
    return send(res, layout('Добавить новость', '<h1>Добавить новость</h1>' + newsForm('/panel/add'), user));
  }

  if (route === 'POST /panel/add') {
    return readBody(req, data => {
      const news = readJson(NEWS_FILE);
      news.push({
        id: nextId(news),
        title: data.title,
        announce: data.announce,
        image: data.image || 'https://picsum.photos/800/400',
        content: data.content,
        author: user.fio,
        createdAt: new Date().toISOString()
      });
      writeJson(NEWS_FILE, news);
      redirect(res, '/panel');
    });
  }

  if (route === 'GET /panel/edit') {
    const item = readJson(NEWS_FILE).find(n => n.id === Number(url.searchParams.get('id')));
    if (!item) return redirect(res, '/panel');
    return send(res, layout('Редактировать новость', '<h1>Редактировать новость</h1>' + newsForm('/panel/edit?id=' + item.id, item), user));
  }

  if (route === 'POST /panel/edit') {
    return readBody(req, data => {
      const news = readJson(NEWS_FILE);
      const item = news.find(n => n.id === Number(url.searchParams.get('id')));
      if (item) {
        item.title = data.title;
        item.announce = data.announce;
        item.image = data.image;
        item.content = data.content;
        writeJson(NEWS_FILE, news);
      }
      redirect(res, '/panel');
    });
  }

  if (route === 'POST /panel/delete') {
    return readBody(req, data => {
      const news = readJson(NEWS_FILE).filter(n => n.id !== Number(data.id));
      writeJson(NEWS_FILE, news);
      redirect(res, '/panel');
    });
  }

  // --- Административная часть: пользователи (только для роли admin) ---
  if (url.pathname.startsWith('/users') && user.role !== 'admin') {
    return send(res, layout('Нет доступа', '<h1>Нет доступа</h1><p>Управление пользователями доступно только администратору.</p>', user), 403);
  }

  if (route === 'GET /users') return send(res, pageUsers(user));

  if (route === 'GET /users/add') {
    return send(res, layout('Добавить пользователя', '<h1>Добавить пользователя</h1>' + userForm('/users/add', null, false), user));
  }

  if (route === 'POST /users/add') {
    return readBody(req, data => {
      const users = readJson(USERS_FILE);
      if (users.some(u => u.login === data.login)) {
        return send(res, pageUsers(user, 'Пользователь с таким логином уже существует'));
      }
      users.push({
        id: nextId(users),
        login: data.login,
        passwordHash: hashPassword(data.password),
        fio: data.fio,
        email: data.email,
        role: data.role === 'admin' ? 'admin' : 'editor',
        registeredAt: new Date().toISOString(),
        lastLoginAt: null
      });
      writeJson(USERS_FILE, users);
      redirect(res, '/users');
    });
  }

  if (route === 'GET /users/edit') {
    const item = readJson(USERS_FILE).find(u => u.id === Number(url.searchParams.get('id')));
    if (!item) return redirect(res, '/users');
    return send(res, layout('Изменить пользователя', '<h1>Изменить пользователя</h1>' + userForm('/users/edit?id=' + item.id, item, true), user));
  }

  if (route === 'POST /users/edit') {
    return readBody(req, data => {
      const users = readJson(USERS_FILE);
      const item = users.find(u => u.id === Number(url.searchParams.get('id')));
      if (item) {
        item.login = data.login;
        item.fio = data.fio;
        item.email = data.email;
        item.role = data.role === 'admin' ? 'admin' : 'editor';
        if (data.password) item.passwordHash = hashPassword(data.password); // пустой пароль = не менять
        writeJson(USERS_FILE, users);
      }
      redirect(res, '/users');
    });
  }

  if (route === 'POST /users/delete') {
    return readBody(req, data => {
      const id = Number(data.id);
      if (id === user.id) return send(res, pageUsers(user, 'Нельзя удалить самого себя'));
      writeJson(USERS_FILE, readJson(USERS_FILE).filter(u => u.id !== id));
      redirect(res, '/users');
    });
  }

  send(res, layout('Не найдено', '<h1>404 — страница не найдена</h1><p><a href="/">На главную</a></p>', user), 404);
});

initData();
server.listen(PORT, () => {
  console.log('Сервер запущен: http://localhost:' + PORT);
  console.log('Вход для администратора: admin / admin');
  console.log('Вход для редактора:      editor / editor');
});
