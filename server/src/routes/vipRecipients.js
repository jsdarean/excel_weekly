import { Router } from 'express';
import multer from 'multer';
import xlsx from 'xlsx';
import { getPool } from '../db.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const SEND_TYPES = ['主送', '抄送', '密送'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function templateExists(pool, id) {
  const [rows] = await pool.query('SELECT 1 AS x FROM report_templates WHERE id = ?', [id]);
  return rows.length > 0;
}

// template_id 解析：所有接口都要求 ?template_id=，收件人按模板完全隔离
function templateIdOf(req, res) {
  const id = Number(req.query.template_id ?? req.body?.templateId ?? 0);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: '缺少模板参数 template_id' });
    return null;
  }
  return id;
}

function validate(body, templateId) {
  if (!templateId) return '缺少模板参数';
  if (!body || !String(body.name ?? '').trim()) return '姓名不能为空';
  const email = String(body.email ?? '').trim();
  if (!email) return '邮箱不能为空';
  if (!EMAIL_RE.test(email)) return '邮箱格式不正确';
  const sendType = String(body.sendType ?? '主送').trim();
  if (!SEND_TYPES.includes(sendType)) return `发送方式只能是：${SEND_TYPES.join('、')}`;
  return null;
}

function trimOrNull(v) {
  const s = String(v ?? '').trim();
  return s || null;
}

router.get('/', async (req, res) => {
  try {
    const templateId = templateIdOf(req, res);
    if (!templateId) return;
    const [rows] = await getPool().query(
      `SELECT id, dept, title, name, email, send_type, enabled FROM vip_recipients
       WHERE template_id = ?
       ORDER BY FIELD(send_type, '主送', '抄送', '密送'), sort_order, id`,
      [templateId]
    );
    res.json({ recipients: rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 调整顺序：整体提交当前模板按展示顺序排列的 id 数组
router.put('/order', async (req, res) => {
  try {
    const templateId = templateIdOf(req, res);
    if (!templateId) return;
    const ids = req.body?.ids;
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'ids 必须是数组' });
    const pool = getPool();
    for (let i = 0; i < ids.length; i++) {
      await pool.query(
        'UPDATE vip_recipients SET sort_order = ? WHERE id = ? AND template_id = ?',
        [i, ids[i], templateId]
      );
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const templateId = templateIdOf(req, res);
    if (!templateId) return;
    if (!(await templateExists(getPool(), templateId))) {
      return res.status(404).json({ error: '模板不存在' });
    }
    const err = validate(req.body, templateId);
    if (err) return res.status(400).json({ error: err });
    const { dept = null, title = null, name, email, sendType = '主送' } = req.body;
    const enabled = req.body?.enabled === false || req.body?.enabled === 0 ? 0 : 1;
    const [r] = await getPool().query(
      'INSERT INTO vip_recipients (template_id, dept, title, name, email, send_type, enabled) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [templateId, trimOrNull(dept), trimOrNull(title), String(name).trim(), String(email).trim(), String(sendType).trim(), enabled]
    );
    res.status(201).json({ id: r.insertId });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const templateId = templateIdOf(req, res);
    if (!templateId) return;
    const err = validate(req.body, templateId);
    if (err) return res.status(400).json({ error: err });
    const [existing] = await getPool().query(
      'SELECT id FROM vip_recipients WHERE id = ? AND template_id = ?',
      [req.params.id, templateId]
    );
    if (existing.length === 0) return res.status(404).json({ error: '收件人不存在' });
    const { dept = null, title = null, name, email, sendType = '主送' } = req.body;
    const enabled = req.body?.enabled === false || req.body?.enabled === 0 ? 0 : 1;
    await getPool().query(
      'UPDATE vip_recipients SET dept = ?, title = ?, name = ?, email = ?, send_type = ?, enabled = ? WHERE id = ?',
      [trimOrNull(dept), trimOrNull(title), String(name).trim(), String(email).trim(), String(sendType).trim(), enabled, req.params.id]
    );
    res.json({ id: Number(req.params.id) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const templateId = templateIdOf(req, res);
    if (!templateId) return;
    const [r] = await getPool().query(
      'DELETE FROM vip_recipients WHERE id = ? AND template_id = ?',
      [req.params.id, templateId]
    );
    if (r.affectedRows === 0) return res.status(404).json({ error: '收件人不存在' });
    res.status(204).end();
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 导出 Excel（指定模板，与导入格式一致）
router.get('/export', async (req, res) => {
  try {
    const templateId = templateIdOf(req, res);
    if (!templateId) return;
    const [rows] = await getPool().query(
      `SELECT dept, title, name, email, send_type, enabled FROM vip_recipients
       WHERE template_id = ? ORDER BY FIELD(send_type, '主送', '抄送', '密送'), sort_order, id`,
      [templateId]
    );
    const aoa = [
      ['部门', '职务', '姓名', '邮箱', '发送方式', '是否发送'],
      ...rows.map((r) => [r.dept ?? '', r.title ?? '', r.name, r.email, r.send_type, r.enabled ? '是' : '否']),
    ];
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet(aoa), 'VIP收件人');
    const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="vip_recipients.xlsx"');
    res.send(buf);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Excel 导入：表头与导出一致；同一模板内姓名+邮箱重复的行跳过
const IMPORT_HEADERS = ['部门', '职务', '姓名', '邮箱', '发送方式', '是否发送'];

router.post('/import', upload.single('file'), async (req, res) => {
  try {
    const templateId = templateIdOf(req, res);
    if (!templateId) return;
    if (!req.file) return res.status(400).json({ error: '缺少上传文件 file' });
    let aoa;
    try {
      const wb = xlsx.read(req.file.buffer, { type: 'buffer' });
      aoa = xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
    } catch (e) {
      return res.status(400).json({ error: `Excel 解析失败：${e.message}` });
    }
    if (!aoa.length) return res.status(400).json({ error: 'Excel 内容为空' });

    const header = aoa[0].map((v) => String(v ?? '').trim());
    const col = new Map(IMPORT_HEADERS.map((h) => [h, header.indexOf(h)]));
    if (col.get('姓名') < 0 || col.get('邮箱') < 0) {
      return res.status(400).json({ error: '缺少必需表头列：姓名、邮箱。请先点「导出 Excel」获取模板格式' });
    }

    const pool = getPool();
    const result = { added: 0, skipped: 0, errors: [] };
    const seen = new Set();
    for (let i = 1; i < aoa.length; i++) {
      const r = aoa[i];
      const rowNo = i + 1;
      const get = (h) => (col.get(h) >= 0 ? String(r[col.get(h)] ?? '').trim() : '');
      const body = {
        dept: get('部门'), title: get('职务'), name: get('姓名'),
        email: get('邮箱'), sendType: get('发送方式') || '主送',
        enabled: get('是否发送') !== '否',
      };
      if (!body.name && !body.email) continue;
      const err = validate(body, templateId);
      if (err) {
        result.errors.push({ row: rowNo, reason: err });
        continue;
      }
      const key = `${body.name}|${body.email}`;
      if (seen.has(key)) {
        result.skipped++;
        continue;
      }
      seen.add(key);
      const [dup] = await pool.query(
        'SELECT 1 AS x FROM vip_recipients WHERE template_id = ? AND name = ? AND email = ?',
        [templateId, body.name, body.email]
      );
      if (dup.length) {
        result.skipped++;
        continue;
      }
      await pool.query(
        'INSERT INTO vip_recipients (template_id, dept, title, name, email, send_type, enabled) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [templateId, body.dept || null, body.title || null, body.name, body.email, body.sendType, body.enabled === false ? 0 : 1]
      );
      result.added++;
    }
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: `导入失败：${e.message}` });
  }
});

export default router;
