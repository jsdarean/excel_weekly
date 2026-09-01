import { Router } from 'express';
import multer from 'multer';
import xlsx from 'xlsx';
import { getPool } from '../db.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

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

router.get('/', async (req, res) => {
  try {
    const [rows] = await getPool().query(
      'SELECT id, name, phone, short_number, email, title FROM persons ORDER BY id'
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
    const { name, phone = null, shortNumber = null, email = null, title = null } = req.body;
    const [r] = await getPool().query(
      'INSERT INTO persons (name, phone, short_number, email, title) VALUES (?, ?, ?, ?, ?)',
      [String(name).trim(), phone, shortNumber, email, String(title ?? '').trim() || null]
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
    const { name, phone = null, shortNumber = null, email = null, title = null } = req.body;
    const [existing] = await getPool().query(
      'SELECT id FROM persons WHERE id = ?',
      [req.params.id]
    );
    if (existing.length === 0) return res.status(404).json({ error: '人员不存在' });
    await getPool().query(
      'UPDATE persons SET name = ?, phone = ?, short_number = ?, email = ?, title = ? WHERE id = ?',
      [String(name).trim(), phone, shortNumber, email, String(title ?? '').trim() || null, req.params.id]
    );
    res.json({ id: Number(req.params.id) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Excel 导入：表头列（与导出格式一致）；同名人员跳过，错误行记录原因
const IMPORT_HEADERS = ['姓名', '职务', '电话', '短号', '邮箱'];

function cellText(v) {
  return v === null || v === undefined ? '' : String(v).trim();
}

router.post('/import', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '缺少上传文件 file' });
    let aoa;
    try {
      const wb = xlsx.read(req.file.buffer, { type: 'buffer' });
      aoa = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
    } catch (e) {
      return res.status(400).json({ error: `Excel 解析失败：${e.message}` });
    }
    if (!aoa.length) return res.status(400).json({ error: 'Excel 内容为空' });

    const header = aoa[0].map(cellText);
    const col = new Map(IMPORT_HEADERS.map((h) => [h, header.indexOf(h)]));
    if (col.get('姓名') < 0) {
      return res.status(400).json({
        error: '缺少必需表头列：姓名。请先点「导出 Excel」获取模板格式',
      });
    }

    const pool = getPool();
    const result = { added: 0, skipped: 0, errors: [] };
    for (let i = 1; i < aoa.length; i++) {
      const r = aoa[i];
      const rowNo = i + 1;
      const get = (h) => (col.get(h) >= 0 ? cellText(r[col.get(h)]) : '');
      const body = {
        name: get('姓名'),
        title: get('职务'),
        phone: get('电话'),
        shortNumber: get('短号'),
        email: get('邮箱'),
      };
      // 整行空白直接忽略
      if (!body.name && !body.phone && !body.email) continue;
      const err = validate(body);
      if (err) {
        result.errors.push({ row: rowNo, reason: err });
        continue;
      }
      const [dup] = await pool.query('SELECT 1 AS x FROM persons WHERE name = ?', [body.name]);
      if (dup.length) {
        result.skipped++;
        continue;
      }
      await pool.query(
        'INSERT INTO persons (name, phone, short_number, email, title) VALUES (?, ?, ?, ?, ?)',
        [body.name, body.phone || null, body.shortNumber || null, body.email || null, body.title || null]
      );
      result.added++;
    }
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: `导入失败：${e.message}` });
  }
});

router.delete('/:id', async (req, res) => {  try {
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
