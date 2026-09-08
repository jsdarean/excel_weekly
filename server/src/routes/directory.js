import { Router } from 'express';
import { getPool } from '../db.js';

const router = Router();

const VALID_TITLES = ['员工', '室经理', '副总', '总经理'];

function validate(body) {
  if (!body || !String(body.name ?? '').trim()) {
    return '姓名不能为空';
  }
  const title = String(body.title ?? '').trim();
  if (title && !VALID_TITLES.includes(title)) {
    return `职务只能是：${VALID_TITLES.join('、')}`;
  }
  return null;
}

function trimOrNull(v) {
  const s = String(v ?? '').trim();
  return s || null;
}

// 列表：支持 ?dept=&room=&q=（q 按姓名模糊查）
router.get('/', async (req, res) => {
  try {
    const where = [];
    const params = [];
    if (req.query.dept) {
      where.push('dept = ?');
      params.push(String(req.query.dept));
    }
    if (req.query.room) {
      where.push('room = ?');
      params.push(String(req.query.room));
    }
    if (req.query.q) {
      where.push('name LIKE ?');
      params.push(`%${String(req.query.q).trim()}%`);
    }
    const sql =
      'SELECT id, dept, room, name, title, email, phone FROM directory' +
      (where.length ? ` WHERE ${where.join(' AND ')}` : '') +
      ' ORDER BY dept, room, name, id';
    const [rows] = await getPool().query(sql, params);
    res.json({ directory: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 级联第一级：已有部门去重列表
router.get('/departments', async (req, res) => {
  try {
    const [rows] = await getPool().query(
      'SELECT DISTINCT dept FROM directory WHERE dept IS NOT NULL AND dept <> "" ORDER BY dept'
    );
    res.json({ departments: rows.map((r) => r.dept) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 级联第二级：某部门下已有的室去重列表
router.get('/rooms', async (req, res) => {
  try {
    const dept = String(req.query.dept ?? '').trim();
    if (!dept) return res.json({ rooms: [] });
    const [rows] = await getPool().query(
      'SELECT DISTINCT room FROM directory WHERE dept = ? AND room IS NOT NULL AND room <> "" ORDER BY room',
      [dept]
    );
    res.json({ rooms: rows.map((r) => r.room) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const err = validate(req.body);
    if (err) return res.status(400).json({ error: err });
    const { dept = null, room = null, name, title = null, email = null, phone = null } = req.body;
    const [r] = await getPool().query(
      'INSERT INTO directory (dept, room, name, title, email, phone) VALUES (?, ?, ?, ?, ?, ?)',
      [trimOrNull(dept), trimOrNull(room), String(name).trim(), trimOrNull(title), trimOrNull(email), trimOrNull(phone)]
    );
    res.status(201).json({ id: r.insertId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const err = validate(req.body);
    if (err) return res.status(400).json({ error: err });
    const [existing] = await getPool().query('SELECT id FROM directory WHERE id = ?', [req.params.id]);
    if (existing.length === 0) return res.status(404).json({ error: '人员不存在' });
    const { dept = null, room = null, name, title = null, email = null, phone = null } = req.body;
    await getPool().query(
      'UPDATE directory SET dept = ?, room = ?, name = ?, title = ?, email = ?, phone = ? WHERE id = ?',
      [trimOrNull(dept), trimOrNull(room), String(name).trim(), trimOrNull(title), trimOrNull(email), trimOrNull(phone), req.params.id]
    );
    res.json({ id: Number(req.params.id) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const [r] = await getPool().query('DELETE FROM directory WHERE id = ?', [req.params.id]);
    if (r.affectedRows === 0) return res.status(404).json({ error: '人员不存在' });
    res.status(204).end();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
