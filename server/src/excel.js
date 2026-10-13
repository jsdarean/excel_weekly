import xlsx from 'xlsx';
import iconv from 'iconv-lite';

export function parseHeaderDate(header) {
  const m = /(\d{4})(\d{2})(\d{2})/.exec(String(header ?? ''));
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

// 关键列按表头名解析（而非固定索引），兼容文件在任意位置新增列（如计划割接上线时间）
// 周进展有两列（上周/本周），取最后一个含「周进展」的列作为本周进展
function resolveColumns(header) {
  const findAll = (name) => {
    const idx = [];
    for (let i = 0; i < header.length; i++) {
      if (String(header[i] ?? '').includes(name)) idx.push(i);
    }
    return idx;
  };
  const find = (name) => findAll(name)[0] ?? -1;
  const progressIdxs = findAll('周进展');
  return {
    categoryMajor: find('专业类别'),
    projectCode: find('项目编码'),
    projectName: find('项目名称'),
    approvalDate: find('立项批复日期'),
    planCutover: find('计划割接上线时间'),
    category: find('分类'),
    owner: find('工程责任人'),
    budgetWan: find('立项金额'),
    stage: find('项目阶段'),
    content: find('建设内容'),
    progress: progressIdxs.length ? progressIdxs[progressIdxs.length - 1] : -1,
    purchaseRate: find('主设备请购完成率'),
    disclosure: find('是否交底'),
    arrivalRate: find('主设备到货完成率'),
    onlineHandover: find('是否上线交维'),
    finalAcceptance: find('是否竣工验收'),
    demandDept: find('需求部门'),
    demandRoom: find('需求室'),
    demandOwner: find('需求责任人'),
  };
}

// 解析前必须校验关键表头，防止误传其他 Excel（如《周报基础数据.xlsx》）被当作"导入成功 0 条"处理
function validateColumns(col) {
  const missing = [];
  if (col.projectCode < 0) missing.push('"项目编码"');
  if (col.progress < 0) missing.push('"周进展"');
  if (missing.length > 0) {
    throw new Error(`Excel 缺少关键列：${missing.join('，')} 列`);
  }
}

function toText(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function toNumber(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function toDateString(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    // Excel 日期序列值存在浮点误差（实测可回退约 43s），日期单元格
    // 本义为零点，按小时取整以消除跨天偏移
    const t = new Date(Math.round(v.getTime() / 3600000) * 3600000);
    const y = t.getFullYear();
    const m = String(t.getMonth() + 1).padStart(2, '0');
    const d = String(t.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(v).trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

// 判断是否为 CSV（xlsx 是 zip 格式，以 PK\x03\x04 开头）
function isCsv(buffer) {
  return !(buffer[0] === 0x50 && buffer[1] === 0x4b);
}

// CSV 解码：先试 UTF-8（严格模式），失败则按 GBK 解码（Excel 另存的中文 CSV 通常是 GBK）
function decodeCsv(buffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return iconv.decode(buffer, 'gbk');
  }
}

export function parseWeeklyReport(buffer) {
  const wb = isCsv(buffer)
    ? xlsx.read(decodeCsv(buffer).replace(/^\uFEFF/, ''), { type: 'string' })
    : xlsx.read(buffer, { type: 'buffer', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(ws, { header: 1, defval: null });
  const header = rows[0] || [];
  const col = resolveColumns(header);
  validateColumns(col);
  const headerDate = parseHeaderDate(header[col.progress]);

  const cell = (row, idx) => (idx >= 0 ? row[idx] : null);

  const projects = [];
  const progress = [];
  let skipped = 0;

  for (const row of rows.slice(1)) {
    const hasContent = row
      .slice(1)
      .some((v) => v !== null && v !== undefined && String(v).trim() !== '');
    if (!hasContent) continue;
    const code = toText(cell(row, col.projectCode));
    if (!code) {
      skipped++;
      continue;
    }
    projects.push({
      projectCode: code,
      categoryMajor: toText(cell(row, col.categoryMajor)),
      projectName: toText(cell(row, col.projectName)),
      approvalDate: toDateString(cell(row, col.approvalDate)),
      category: toText(cell(row, col.category)),
      owner: toText(cell(row, col.owner)),
      budgetWan: toNumber(cell(row, col.budgetWan)),
      stage: toText(cell(row, col.stage)),
      content: toText(cell(row, col.content)),
      demandDept: toText(cell(row, col.demandDept)),
      demandRoom: toText(cell(row, col.demandRoom)),
      demandOwner: toText(cell(row, col.demandOwner)),
      // 有值时覆盖数据库（在 importData 的 upsert 中处理），无值不动
      planCutoverDate: toDateString(cell(row, col.planCutover)),
    });
    progress.push({
      projectCode: code,
      progress: toText(cell(row, col.progress)),
      purchaseRate: toNumber(cell(row, col.purchaseRate)),
      disclosure: toText(cell(row, col.disclosure)),
      arrivalRate: toNumber(cell(row, col.arrivalRate)),
      onlineHandover: toText(cell(row, col.onlineHandover)),
      finalAcceptance: toText(cell(row, col.finalAcceptance)),
    });
  }

  return { projects, progress, headerDate, skipped };
}
