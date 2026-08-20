import { Router } from 'express';
import { getPool } from '../db.js';

const router = Router();

function validate(body) {
  if (!body || !String(body.name ?? '').trim()) {
    return '姓名不能为空';
  }
  return null;
}

router.get('/', async (req, res) => {
  try {
    const [rows] = await getPool().query(
      'SELECT id, name, phone, short_number, email FROM persons ORDER BY id'
    );
    res.json({ persons: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const err = validate(req.body);
    if (err) return res.status(400).json({ error: err });
    const { name, phone = null, shortNumber = null, email = null } = req.body;
    const [r] = await getPool().query(
      'INSERT INTO persons (name, phone, short_number, email) VALUES (?, ?, ?, ?)',
      [String(name).trim(), phone, shortNumber, email]
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
    const { name, phone = null, shortNumber = null, email = null } = req.body;
    const [existing] = await getPool().query(
      'SELECT id FROM persons WHERE id = ?',
      [req.params.id]
    );
    if (existing.length === 0) return res.status(404).json({ error: '人员不存在' });
    await getPool().query(
      'UPDATE persons SET name = ?, phone = ?, short_number = ?, email = ? WHERE id = ?',
      [String(name).trim(), phone, shortNumber, email, req.params.id]
    );
    res.json({ id: Number(req.params.id) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const [r] = await getPool().query('DELETE FROM persons WHERE id = ?', [
      req.params.id,
    ]);
    if (r.affectedRows === 0) return res.status(404).json({ error: '人员不存在' });
    res.status(204).end();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
