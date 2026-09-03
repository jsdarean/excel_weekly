import { Router } from 'express';
import multer from 'multer';
import xlsx from 'xlsx';
import { getPool } from '../db.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const ROLES = ['室经理', '员工'];

function validate(body) {
  if (!body || !String(body.projectCode ?? '').trim()) return '项目编码不能为空';
  if (!String(body.name ?? '').trim()) return '关联人姓名不能为空';
  const role = String(body.role ?? '').trim();
  if (role && !ROLES.includes(role)) return '职务只能是「室经理」或「员工」';
  if ((body.sendTo || body.sendCc || body.sendBcc) && !String(body.email ?? '').trim()) {
    return '勾选主送/抄送/密送时邮箱不能为空';
  }
  return null;
}

function toRow(body) {
  return {
    project_code: String(body.projectCode).trim(),
    dept: String(body.dept ?? '').trim() || null,
    room: String(body.room ?? '').trim() || null,
    role: String(body.role ?? '').trim() || null,
    name: String(body.name).trim(),
    email: String(body.email ?? '').trim() || null,
    phone: String(body.phone ?? '').trim() || null,
    send_to: body.sendTo ? 1 : 0,
    send_cc: body.sendCc ? 1 : 0,
    send_bcc: body.sendBcc ? 1 : 0,
  };
}

async function projectExists(pool, code) {
  const [rows] = await pool.query('SELECT 1 AS x FROM projects WHERE project_code = ?', [code]);
  return rows.length > 0;
}

// Excel 导入：表头列（与导出格式一致，项目名称列仅作展示、导入时忽略）
const IMPORT_HEADERS = ['项目编码', '部门', '室', '职务', '姓名', '邮箱', '电话', '主送', '抄送', '密送'];
const TRUE_VALUES = new Set(['是', '√', '✓', '1', 'true', 'TRUE', 'y', 'Y']);

function cellText(v) {
  return v === null || v === undefined ? '' : String(v).trim();
}

// 导入关联人：重复（同项目编码+姓名）跳过，错误行记录原因
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
    const missing = ['项目编码', '姓名'].filter((h) => col.get(h) < 0);
    if (missing.length) {
      return res.status(400).json({
        error: `缺少必需表头列：${missing.join('、')}。请先点「导出 Excel」获取模板格式`,
      });
    }

    const pool = getPool();
    const result = { added: 0, skipped: 0, errors: [] };
    for (let i = 1; i < aoa.length; i++) {
      const r = aoa[i];
      const rowNo = i + 1;
      const get = (h) => (col.get(h) >= 0 ? cellText(r[col.get(h)]) : '');
      const body = {
        projectCode: get('项目编码'),
        dept: get('部门'),
        room: get('室'),
        role: get('职务'),
        name: get('姓名'),
        email: get('邮箱'),
        phone: get('电话'),
        sendTo: TRUE_VALUES.has(get('主送')),
        sendCc: TRUE_VALUES.has(get('抄送')),
        sendBcc: TRUE_VALUES.has(get('密送')),
      };
      // 整行空白直接忽略
      if (!body.projectCode && !body.name) continue;
      const err = validate(body);
      if (err) {
        result.errors.push({ row: rowNo, reason: err });
        continue;
      }
      if (!(await projectExists(pool, body.projectCode))) {
        result.errors.push({ row: rowNo, reason: `项目 ${body.projectCode} 不存在` });
        continue;
      }
      const [dup] = await pool.query(
        'SELECT 1 AS x FROM project_contacts WHERE project_code = ? AND name = ?',
        [body.projectCode, body.name]
      );
      if (dup.length) {
        result.skipped++;
        continue;
      }
      const row = toRow(body);
      await pool.query(
        'INSERT INTO project_contacts (project_code, dept, room, role, name, email, phone, send_to, send_cc, send_bcc) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [row.project_code, row.dept, row.room, row.role, row.name, row.email, row.phone, row.send_to, row.send_cc, row.send_bcc]
      );
      result.added++;
    }
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: `导入失败：${e.message}` });
  }
});

// 关联人列表（联查项目名称、建设内容；可按项目编码过滤）
router.get('/', async (req, res) => {
  try {
    const pool = getPool();
    const params = [];
    let where = '';
    if (req.query.project_code) {
      where = 'WHERE c.project_code = ?';
      params.push(req.query.project_code);
    }
    const [rows] = await pool.query(
      `SELECT c.id, c.project_code, c.dept, c.room, c.role, c.name, c.email, c.phone,
              c.send_to, c.send_cc, c.send_bcc,
              p.project_name, p.content, p.owner
       FROM project_contacts c
       LEFT JOIN projects p ON p.project_code = c.project_code
       ${where}
       ORDER BY c.project_code, c.id`,
      params
    );
    res.json({ contacts: rows });
  } catch (e) {
    res.status(500).json({ error: `查询失败：${e.message}` });
  }
});

// 部门/室候选：取自已有关联人和项目基础信息（需求部门/需求室），用于录入时联动。
// 源数据中「产品运营中心/网络部/数智化部」这类值是用 / 拼接的多个部门，需拆成原子项再去重
function splitOrgs(values) {
  const set = new Set();
  for (const v of values) {
    if (!v) continue;
    for (const part of String(v).split('/')) {
      const s = part.trim();
      if (s) set.add(s);
    }
  }
  return [...set].sort();
}

router.get('/options', async (req, res) => {
  try {
    const pool = getPool();
    const [deptRows] = await pool.query(
      `SELECT DISTINCT v FROM (
         SELECT dept AS v FROM project_contacts
         UNION SELECT demand_dept FROM projects
       ) t
       WHERE v IS NOT NULL AND v <> ''`
    );
    const [roomRows] = await pool.query(
      `SELECT DISTINCT v FROM (
         SELECT room AS v FROM project_contacts
         UNION SELECT demand_room FROM projects
       ) t
       WHERE v IS NOT NULL AND v <> ''`
    );
    res.json({
      depts: splitOrgs(deptRows.map((r) => r.v)),
      rooms: splitOrgs(roomRows.map((r) => r.v)),
    });
  } catch (e) {
    res.status(500).json({ error: `查询失败：${e.message}` });
  }
});

// 新增关联人
router.post('/', async (req, res) => {
  try {
    const err = validate(req.body);
    if (err) return res.status(400).json({ error: err });
    const pool = getPool();
    const row = toRow(req.body);
    if (!(await projectExists(pool, row.project_code))) {
      return res.status(404).json({ error: '项目不存在' });
    }
    const [r] = await pool.query(
      'INSERT INTO project_contacts (project_code, dept, room, role, name, email, phone, send_to, send_cc, send_bcc) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [row.project_code, row.dept, row.room, row.role, row.name, row.email, row.phone, row.send_to, row.send_cc, row.send_bcc]
    );
    res.status(201).json({ id: r.insertId });
  } catch (e) {
    res.status(500).json({ error: `保存失败：${e.message}` });
  }
});

// 修改关联人（项目编码不可改，换项目请删除后重建）
router.put('/:id', async (req, res) => {
  try {
    const err = validate(req.body);
    if (err) return res.status(400).json({ error: err });
    const pool = getPool();
    const [existing] = await pool.query('SELECT id FROM project_contacts WHERE id = ?', [req.params.id]);
    if (existing.length === 0) return res.status(404).json({ error: '关联人不存在' });
    const row = toRow(req.body);
    if (!(await projectExists(pool, row.project_code))) {
      return res.status(404).json({ error: '项目不存在' });
    }
    await pool.query(
      'UPDATE project_contacts SET project_code = ?, dept = ?, room = ?, role = ?, name = ?, email = ?, phone = ?, send_to = ?, send_cc = ?, send_bcc = ? WHERE id = ?',
      [row.project_code, row.dept, row.room, row.role, row.name, row.email, row.phone, row.send_to, row.send_cc, row.send_bcc, req.params.id]
    );
    res.json({ id: Number(req.params.id) });
  } catch (e) {
    res.status(500).json({ error: `保存失败：${e.message}` });
  }
});

// 删除关联人
router.delete('/:id', async (req, res) => {
  try {
    const [r] = await getPool().query('DELETE FROM project_contacts WHERE id = ?', [req.params.id]);
    if (r.affectedRows === 0) return res.status(404).json({ error: '关联人不存在' });
    res.status(204).end();
  } catch (e) {
    res.status(500).json({ error: `删除失败：${e.message}` });
  }
});

export default router;
