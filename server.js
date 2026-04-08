const express = require('express');
const { Database } = require('@sqlitecloud/drivers');
const crypto = require('crypto');

const app = express();
const DB_PATH = 'sqlitecloud://caztna8tdk.g6.sqlite.cloud:8860/auth.sqlitecloud?apikey=N6YMF32veuPbXjP2rYvgVpbEj5nfS0YdxjyeJUD3JCA';

let db;

// 初始化数据库
async function initDB() {
  db = new Database(DB_PATH);

  // 创建表
  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    content TEXT NOT NULL,
    image TEXT,
    likes INTEGER DEFAULT 0,
    gifts TEXT DEFAULT '[]',
    author_key TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id INTEGER NOT NULL,
    username TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS foods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    content TEXT NOT NULL,
    date TEXT,
    likes INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS food_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    food_id INTEGER NOT NULL,
    username TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS travels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    content TEXT NOT NULL,
    date TEXT,
    likes INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS travel_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    travel_id INTEGER NOT NULL,
    username TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    content TEXT NOT NULL,
    date TEXT,
    likes INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS goal_comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    goal_id INTEGER NOT NULL,
    username TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    image TEXT NOT NULL,
    note TEXT,
    username TEXT,
    message_date TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS calendar_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    title TEXT NOT NULL,
    event_date TEXT NOT NULL,
    note TEXT,
    calendar_type TEXT DEFAULT '公历',
    repeat_type TEXT DEFAULT '不重复',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  console.log('数据库初始化完成');
}

// 查询函数
function runQuery(sql, params = []) {
  try {
    const stmt = db.prepare(sql);
    if (params.length > 0) stmt.bind(params);
    stmt.run();
    stmt.free();
    return true;
  } catch (e) {
    console.error('执行错误:', e.message);
    return false;
  }
}

function getAll(sql, params = []) {
  try {
    const stmt = db.prepare(sql);
    if (params.length > 0) stmt.bind(params);
    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.get());
    }
    stmt.free();
    return rows;
  } catch (e) {
    console.error('查询错误:', e.message);
    return [];
  }
}

function getOne(sql, params = []) {
  const rows = getAll(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

// 中间件
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// 留言API
app.get('/api/messages', (req, res) => {
  const messages = getAll('SELECT * FROM messages ORDER BY created_at DESC');
  const columns = ['id', 'username', 'content', 'image', 'likes', 'gifts', 'author_key', 'created_at', 'comment_count'];
  const result = messages.map(row => {
    const obj = {};
    columns.forEach((col, i) => obj[col] = row[i]);
    // 获取评论数
    const commentCount = getOne('SELECT COUNT(*) as count FROM comments WHERE message_id = ?', [obj.id]);
    obj.comment_count = commentCount ? commentCount[0] : 0;
    return obj;
  });
  res.json(result);
});

app.post('/api/messages', (req, res) => {
  const { username, content, image } = req.body;
  if (!username || !content) return res.status(400).json({ error: '请填写昵称和内容' });

  const createdAt = new Date().toISOString();
  runQuery('INSERT INTO messages (username, content, image, created_at) VALUES (?, ?, ?, ?)', [username, content, image || null, createdAt]);

  const lastId = getOne('SELECT last_insert_rowid() as id');
  const newMessage = getOne('SELECT * FROM messages WHERE id = ?', [lastId[0]]);
  const columns = ['id', 'username', 'content', 'image', 'likes', 'gifts', 'author_key', 'created_at'];
  const obj = {};
  columns.forEach((col, i) => obj[col] = newMessage[i]);
  obj.comment_count = 0;

  // 如果有图片，添加到照片墙
  if (image) {
    runQuery('INSERT INTO photos (image, username, message_date) VALUES (?, ?, ?)', [image, username, createdAt.split('T')[0]]);
  }

  res.json(obj);
});

app.delete('/api/messages/:id', (req, res) => {
  const { id } = req.params;
  const { username } = req.body;

  const msg = getOne('SELECT username, image FROM messages WHERE id = ?', [id]);
  if (!msg) return res.status(404).json({ error: '留言不存在' });

  if (msg[0] !== username) return res.status(403).json({ error: '你只能删除自己的留言' });

  runQuery('DELETE FROM comments WHERE message_id = ?', [id]);
  runQuery('DELETE FROM messages WHERE id = ?', [id]);

  // 删除照片墙中对应的照片
  if (msg[1]) {
    runQuery('DELETE FROM photos WHERE image = ?', [msg[1]]);
  }

  res.json({ success: true });
});

app.put('/api/messages/:id', (req, res) => {
  const { id } = req.params;
  const { content, username } = req.body;

  const msg = getOne('SELECT username FROM messages WHERE id = ?', [id]);
  if (!msg) return res.status(404).json({ error: '留言不存在' });
  if (msg[0] !== username) return res.status(403).json({ error: '你只能编辑自己的留言' });

  runQuery('UPDATE messages SET content = ? WHERE id = ?', [content, id]);
  const updated = getOne('SELECT * FROM messages WHERE id = ?', [id]);
  const columns = ['id', 'username', 'content', 'image', 'likes', 'gifts', 'author_key', 'created_at'];
  const obj = {};
  columns.forEach((col, i) => obj[col] = updated[i]);
  res.json(obj);
});

// 点赞API
app.post('/api/messages/:id/like', (req, res) => {
  const { id } = req.params;
  runQuery('UPDATE messages SET likes = likes + 1 WHERE id = ?', [id]);
  const msg = getOne('SELECT likes FROM messages WHERE id = ?', [id]);
  res.json({ likes: msg[0] });
});

app.delete('/api/messages/:id/like', (req, res) => {
  const { id } = req.params;
  runQuery('UPDATE messages SET likes = likes - 1 WHERE id = ? AND likes > 0', [id]);
  const msg = getOne('SELECT likes FROM messages WHERE id = ?', [id]);
  res.json({ likes: msg[0] });
});

// 送礼API
app.post('/api/messages/:id/gift', (req, res) => {
  const { id } = req.params;
  const { giftType, sender } = req.body;

  const msg = getOne('SELECT gifts FROM messages WHERE id = ?', [id]);
  let gifts = [];
  try { gifts = msg[0] ? JSON.parse(msg[0]) : []; } catch(e) { gifts = []; }

  gifts.push({ type: giftType, sender });
  runQuery('UPDATE messages SET gifts = ? WHERE id = ?', [JSON.stringify(gifts), id]);

  res.json({ gifts });
});

// 评论API
app.get('/api/messages/:id/comments', (req, res) => {
  const { id } = req.params;
  const comments = getAll('SELECT * FROM comments WHERE message_id = ? ORDER BY created_at ASC', [id]);
  const columns = ['id', 'message_id', 'username', 'content', 'created_at'];
  res.json(comments.map(row => {
    const obj = {};
    columns.forEach((col, i) => obj[col] = row[i]);
    return obj;
  }));
});

app.post('/api/messages/:id/comments', (req, res) => {
  const { id } = req.params;
  const { username, content } = req.body;
  if (!username || !content) return res.status(400).json({ error: '请填写昵称和内容' });

  const createdAt = new Date().toISOString();
  runQuery('INSERT INTO comments (message_id, username, content, created_at) VALUES (?, ?, ?, ?)', [id, username, content, createdAt]);

  const lastId = getOne('SELECT last_insert_rowid() as id');
  const newComment = getOne('SELECT * FROM comments WHERE id = ?', [lastId[0]]);
  const columns = ['id', 'message_id', 'username', 'content', 'created_at'];
  const obj = {};
  columns.forEach((col, i) => obj[col] = newComment[i]);
  res.json(obj);
});

app.delete('/api/comments/:id', (req, res) => {
  const { id } = req.params;
  const { username } = req.body;

  const comment = getOne('SELECT username FROM comments WHERE id = ?', [id]);
  if (!comment) return res.status(404).json({ error: '评论不存在' });

  if (username && comment[0] !== username) return res.status(403).json({ error: '你只能删除自己的评论' });

  runQuery('DELETE FROM comments WHERE id = ?', [id]);
  res.json({ success: true });
});

// 想吃的东西API
app.get('/api/foods', (req, res) => {
  const foods = getAll('SELECT * FROM foods ORDER BY created_at DESC');
  const columns = ['id', 'username', 'content', 'date', 'likes', 'created_at', 'comment_count'];
  const result = foods.map(row => {
    const obj = {};
    columns.slice(0, -1).forEach((col, i) => obj[col] = row[i]);
    const commentCount = getOne('SELECT COUNT(*) as count FROM food_comments WHERE food_id = ?', [obj.id]);
    obj.comment_count = commentCount ? commentCount[0] : 0;
    return obj;
  });
  res.json(result);
});

app.post('/api/foods', (req, res) => {
  const { username, content, date } = req.body;
  if (!username || !content) return res.status(400).json({ error: '请填写昵称和内容' });

  const createdAt = new Date().toISOString();
  runQuery('INSERT INTO foods (username, content, date, created_at) VALUES (?, ?, ?, ?)', [username, content, date || null, createdAt]);

  const lastId = getOne('SELECT last_insert_rowid() as id');
  const newFood = getOne('SELECT * FROM foods WHERE id = ?', [lastId[0]]);
  const columns = ['id', 'username', 'content', 'date', 'likes', 'created_at'];
  const obj = {};
  columns.forEach((col, i) => obj[col] = newFood[i]);
  obj.comment_count = 0;
  res.json(obj);
});

app.delete('/api/foods/:id', (req, res) => {
  const { id } = req.params;
  const { username } = req.body;

  const food = getOne('SELECT username FROM foods WHERE id = ?', [id]);
  if (!food) return res.status(404).json({ error: '不存在' });
  if (food[0] !== username) return res.status(403).json({ error: '只能删除自己的' });

  runQuery('DELETE FROM food_comments WHERE food_id = ?', [id]);
  runQuery('DELETE FROM foods WHERE id = ?', [id]);
  res.json({ success: true });
});

app.post('/api/foods/:id/like', (req, res) => {
  const { id } = req.params;
  runQuery('UPDATE foods SET likes = likes + 1 WHERE id = ?', [id]);
  const food = getOne('SELECT likes FROM foods WHERE id = ?', [id]);
  res.json({ likes: food[0] });
});

// 食品评论
app.get('/api/foods/:id/comments', (req, res) => {
  const { id } = req.params;
  const comments = getAll('SELECT * FROM food_comments WHERE food_id = ? ORDER BY created_at ASC', [id]);
  const columns = ['id', 'food_id', 'username', 'content', 'created_at'];
  res.json(comments.map(row => {
    const obj = {};
    columns.forEach((col, i) => obj[col] = row[i]);
    return obj;
  }));
});

app.post('/api/foods/:id/comments', (req, res) => {
  const { id } = req.params;
  const { username, content } = req.body;
  if (!username || !content) return res.status(400).json({ error: '请填写内容' });

  const createdAt = new Date().toISOString();
  runQuery('INSERT INTO food_comments (food_id, username, content, created_at) VALUES (?, ?, ?, ?)', [id, username, content, createdAt]);

  const lastId = getOne('SELECT last_insert_rowid() as id');
  const newComment = getOne('SELECT * FROM food_comments WHERE id = ?', [lastId[0]]);
  const columns = ['id', 'food_id', 'username', 'content', 'created_at'];
  const obj = {};
  columns.forEach((col, i) => obj[col] = newComment[i]);
  res.json(obj);
});

app.delete('/api/food-comments/:id', (req, res) => {
  const { id } = req.params;
  const { username } = req.body;
  const comment = getOne('SELECT username FROM food_comments WHERE id = ?', [id]);
  if (!comment) return res.status(404).json({ error: '不存在' });
  if (username && comment[0] !== username) return res.status(403).json({ error: '只能删除自己的' });
  runQuery('DELETE FROM food_comments WHERE id = ?', [id]);
  res.json({ success: true });
});

// 想去的旅游地方API
app.get('/api/travels', (req, res) => {
  const travels = getAll('SELECT * FROM travels ORDER BY created_at DESC');
  const columns = ['id', 'username', 'content', 'date', 'likes', 'created_at', 'comment_count'];
  const result = travels.map(row => {
    const obj = {};
    columns.slice(0, -1).forEach((col, i) => obj[col] = row[i]);
    const commentCount = getOne('SELECT COUNT(*) as count FROM travel_comments WHERE travel_id = ?', [obj.id]);
    obj.comment_count = commentCount ? commentCount[0] : 0;
    return obj;
  });
  res.json(result);
});

app.post('/api/travels', (req, res) => {
  const { username, content, date } = req.body;
  if (!username || !content) return res.status(400).json({ error: '请填写昵称和内容' });

  const createdAt = new Date().toISOString();
  runQuery('INSERT INTO travels (username, content, date, created_at) VALUES (?, ?, ?, ?)', [username, content, date || null, createdAt]);

  const lastId = getOne('SELECT last_insert_rowid() as id');
  const newTravel = getOne('SELECT * FROM travels WHERE id = ?', [lastId[0]]);
  const columns = ['id', 'username', 'content', 'date', 'likes', 'created_at'];
  const obj = {};
  columns.forEach((col, i) => obj[col] = newTravel[i]);
  obj.comment_count = 0;
  res.json(obj);
});

app.delete('/api/travels/:id', (req, res) => {
  const { id } = req.params;
  const { username } = req.body;

  const travel = getOne('SELECT username FROM travels WHERE id = ?', [id]);
  if (!travel) return res.status(404).json({ error: '不存在' });
  if (travel[0] !== username) return res.status(403).json({ error: '只能删除自己的' });

  runQuery('DELETE FROM travel_comments WHERE travel_id = ?', [id]);
  runQuery('DELETE FROM travels WHERE id = ?', [id]);
  res.json({ success: true });
});

app.post('/api/travels/:id/like', (req, res) => {
  const { id } = req.params;
  runQuery('UPDATE travels SET likes = likes + 1 WHERE id = ?', [id]);
  const travel = getOne('SELECT likes FROM travels WHERE id = ?', [id]);
  res.json({ likes: travel[0] });
});

// 旅游评论
app.get('/api/travels/:id/comments', (req, res) => {
  const { id } = req.params;
  const comments = getAll('SELECT * FROM travel_comments WHERE travel_id = ? ORDER BY created_at ASC', [id]);
  const columns = ['id', 'travel_id', 'username', 'content', 'created_at'];
  res.json(comments.map(row => {
    const obj = {};
    columns.forEach((col, i) => obj[col] = row[i]);
    return obj;
  }));
});

app.post('/api/travels/:id/comments', (req, res) => {
  const { id } = req.params;
  const { username, content } = req.body;
  if (!username || !content) return res.status(400).json({ error: '请填写内容' });

  const createdAt = new Date().toISOString();
  runQuery('INSERT INTO travel_comments (travel_id, username, content, created_at) VALUES (?, ?, ?, ?)', [id, username, content, createdAt]);

  const lastId = getOne('SELECT last_insert_rowid() as id');
  const newComment = getOne('SELECT * FROM travel_comments WHERE id = ?', [lastId[0]]);
  const columns = ['id', 'travel_id', 'username', 'content', 'created_at'];
  const obj = {};
  columns.forEach((col, i) => obj[col] = newComment[i]);
  res.json(obj);
});

app.delete('/api/travel-comments/:id', (req, res) => {
  const { id } = req.params;
  const { username } = req.body;
  const comment = getOne('SELECT username FROM travel_comments WHERE id = ?', [id]);
  if (!comment) return res.status(404).json({ error: '不存在' });
  if (username && comment[0] !== username) return res.status(403).json({ error: '只能删除自己的' });
  runQuery('DELETE FROM travel_comments WHERE id = ?', [id]);
  res.json({ success: true });
});

// 目标API
app.get('/api/goals', (req, res) => {
  const goals = getAll('SELECT * FROM goals ORDER BY created_at DESC');
  const columns = ['id', 'username', 'content', 'date', 'likes', 'created_at', 'comment_count'];
  const result = goals.map(row => {
    const obj = {};
    columns.slice(0, -1).forEach((col, i) => obj[col] = row[i]);
    const commentCount = getOne('SELECT COUNT(*) as count FROM goal_comments WHERE goal_id = ?', [obj.id]);
    obj.comment_count = commentCount ? commentCount[0] : 0;
    return obj;
  });
  res.json(result);
});

app.post('/api/goals', (req, res) => {
  const { username, content, date } = req.body;
  if (!username || !content) return res.status(400).json({ error: '请填写昵称和内容' });

  const createdAt = new Date().toISOString();
  runQuery('INSERT INTO goals (username, content, date, created_at) VALUES (?, ?, ?, ?)', [username, content, date || null, createdAt]);

  const lastId = getOne('SELECT last_insert_rowid() as id');
  const newGoal = getOne('SELECT * FROM goals WHERE id = ?', [lastId[0]]);
  const columns = ['id', 'username', 'content', 'date', 'likes', 'created_at'];
  const obj = {};
  columns.forEach((col, i) => obj[col] = newGoal[i]);
  obj.comment_count = 0;
  res.json(obj);
});

app.delete('/api/goals/:id', (req, res) => {
  const { id } = req.params;
  const { username } = req.body;

  const goal = getOne('SELECT username FROM goals WHERE id = ?', [id]);
  if (!goal) return res.status(404).json({ error: '不存在' });
  if (goal[0] !== username) return res.status(403).json({ error: '只能删除自己的' });

  runQuery('DELETE FROM goal_comments WHERE goal_id = ?', [id]);
  runQuery('DELETE FROM goals WHERE id = ?', [id]);
  res.json({ success: true });
});

app.post('/api/goals/:id/like', (req, res) => {
  const { id } = req.params;
  runQuery('UPDATE goals SET likes = likes + 1 WHERE id = ?', [id]);
  const goal = getOne('SELECT likes FROM goals WHERE id = ?', [id]);
  res.json({ likes: goal[0] });
});

// 目标评论
app.get('/api/goals/:id/comments', (req, res) => {
  const { id } = req.params;
  const comments = getAll('SELECT * FROM goal_comments WHERE goal_id = ? ORDER BY created_at ASC', [id]);
  const columns = ['id', 'goal_id', 'username', 'content', 'created_at'];
  res.json(comments.map(row => {
    const obj = {};
    columns.forEach((col, i) => obj[col] = row[i]);
    return obj;
  }));
});

app.post('/api/goals/:id/comments', (req, res) => {
  const { id } = req.params;
  const { username, content } = req.body;
  if (!username || !content) return res.status(400).json({ error: '请填写内容' });

  const createdAt = new Date().toISOString();
  runQuery('INSERT INTO goal_comments (goal_id, username, content, created_at) VALUES (?, ?, ?, ?)', [id, username, content, createdAt]);

  const lastId = getOne('SELECT last_insert_rowid() as id');
  const newComment = getOne('SELECT * FROM goal_comments WHERE id = ?', [lastId[0]]);
  const columns = ['id', 'goal_id', 'username', 'content', 'created_at'];
  const obj = {};
  columns.forEach((col, i) => obj[col] = newComment[i]);
  res.json(obj);
});

app.delete('/api/goal-comments/:id', (req, res) => {
  const { id } = req.params;
  const { username } = req.body;
  const comment = getOne('SELECT username FROM goal_comments WHERE id = ?', [id]);
  if (!comment) return res.status(404).json({ error: '不存在' });
  if (username && comment[0] !== username) return res.status(403).json({ error: '只能删除自己的' });
  runQuery('DELETE FROM goal_comments WHERE id = ?', [id]);
  res.json({ success: true });
});

// 照片墙API
app.get('/api/photos', (req, res) => {
  const photos = getAll('SELECT * FROM photos ORDER BY created_at DESC');
  const columns = ['id', 'image', 'note', 'username', 'message_date', 'created_at'];
  res.json(photos.map(row => {
    const obj = {};
    columns.forEach((col, i) => obj[col] = row[i]);
    return obj;
  }));
});

app.delete('/api/photos/:id', (req, res) => {
  const { id } = req.params;
  runQuery('DELETE FROM photos WHERE id = ?', [id]);
  res.json({ success: true });
});

// 日历事件API
app.get('/api/calendar/events', (req, res) => {
  const events = getAll('SELECT * FROM calendar_events ORDER BY event_date ASC');
  const columns = ['id', 'username', 'title', 'event_date', 'note', 'calendar_type', 'repeat_type', 'created_at'];
  res.json(events.map(row => {
    const obj = {};
    columns.forEach((col, i) => obj[col] = row[i]);
    return obj;
  }));
});

app.post('/api/calendar/events', (req, res) => {
  const { username, title, event_date, note, calendar_type, repeat_type } = req.body;
  if (!username || !title || !event_date) return res.status(400).json({ error: '请填写完整信息' });

  const createdAt = new Date().toISOString();
  runQuery('INSERT INTO calendar_events (username, title, event_date, note, calendar_type, repeat_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [username, title, event_date, note || null, calendar_type || '公历', repeat_type || '不重复', createdAt]);

  const lastId = getOne('SELECT last_insert_rowid() as id');
  const newEvent = getOne('SELECT * FROM calendar_events WHERE id = ?', [lastId[0]]);
  const columns = ['id', 'username', 'title', 'event_date', 'note', 'calendar_type', 'repeat_type', 'created_at'];
  const obj = {};
  columns.forEach((col, i) => obj[col] = newEvent[i]);
  res.json(obj);
});

app.delete('/api/calendar/events/:id', (req, res) => {
  const { id } = req.params;
  const { username } = req.body;
  const event = getOne('SELECT username FROM calendar_events WHERE id = ?', [id]);
  if (!event) return res.status(404).json({ error: '事件不存在' });
  if (username && event[0] !== username) return res.status(403).json({ error: '只能删除自己的事件' });
  runQuery('DELETE FROM calendar_events WHERE id = ?', [id]);
  res.json({ success: true });
});

// 启动服务器
const PORT = process.env.PORT || 3000;

initDB().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`留言墙服务器已启动: http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('数据库初始化失败:', err);
  process.exit(1);
});
