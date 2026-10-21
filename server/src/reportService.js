// 周报文字模板渲染：把 {{占位符}} 替换为当前统计数据
// data 结构由 buildReportData 生成，本函数为纯函数便于测试
export function renderTemplate(template, data) {
  let out = template;
  const flat = {
    '项目总数': data.total,
    '拟取消数': data.cancelled,
    '在建项目总数': data.building,
    '近1周交付项目数': data.delivered1w,
    '近2周交付项目数': data.delivered2w,
  };
  for (const [cat, c] of Object.entries(data.categories)) {
    flat[`${cat}_项目数`] = c.count;
    flat[`${cat}_占比`] = c.pct;
    flat[`${cat}_金额亿`] = c.budgetYi;
    flat[`${cat}_重点进展`] = c.highlights;
    // 在建变体：剔除终验归档后的项目数/占比/金额
    flat[`${cat}_在建_项目数`] = c.buildingCount ?? 0;
    flat[`${cat}_在建_占比`] = c.buildingPct ?? 0;
    flat[`${cat}_在建_金额亿`] = c.buildingBudgetYi ?? '0.00';
  }
  for (const [k, v] of Object.entries(flat)) {
    out = out.split(`{{${k}}}`).join(String(v));
  }
  // 动态占位符：{{分类名_阶段名_项目数}}，该分类下这个阶段没有项目时替换为 0；
  // {{分类名_在建_阶段名_项目数}} 为在建变体（剔除终验归档）
  out = out.replace(/\{\{([^{}_]+)_([^{}]+)_项目数\}\}/g, (m, cat, stage) => {
    const building = stage.startsWith('在建_');
    const stageName = building ? stage.slice(3) : stage;
    const sc = data.categories[cat]?.[building ? 'buildingStageCounts' : 'stageCounts'];
    return sc ? String(sc[stageName] ?? 0) : m;
  });
  return out;
}

// 从数据库聚合生成渲染所需数据
// periodType：周报=最近1个周报期，双周报=2，月报=4；重点进展按窗口内各周合并
const PERIOD_WEEKS = { 周报: 1, 双周报: 2, 月报: 4 };

export async function buildReportData(pool, { periodType = '周报' } = {}) {
  const weeks = PERIOD_WEEKS[periodType] ?? 1;
  const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM projects');
  const [[{ cancelled }]] = await pool.query(
    "SELECT COUNT(*) AS cancelled FROM projects WHERE category = '拟取消'"
  );
  // 在建项目总数：按项目阶段剔除终验归档（拟取消是分类维度，不影响在建判断）
  const [[{ n: building }]] = await pool.query(
    "SELECT COUNT(*) AS n FROM projects WHERE COALESCE(stage, '') NOT LIKE '%终验归档%'"
  );
  // 近N周交付：阶段变为终验归档的时间在最近N周内（stage_changed_at 由导入流程在阶段变化时写入）
  const [[{ n: w1 }]] = await pool.query(
    `SELECT COUNT(*) AS n FROM projects
     WHERE stage LIKE '%终验归档%' AND stage_changed_at >= DATE_SUB(NOW(), INTERVAL 1 WEEK)`
  );
  const [[{ n: w2 }]] = await pool.query(
    `SELECT COUNT(*) AS n FROM projects
     WHERE stage LIKE '%终验归档%' AND stage_changed_at >= DATE_SUB(NOW(), INTERVAL 2 WEEK)`
  );

  const [catRows] = await pool.query(
    `SELECT category, COUNT(*) AS n, COALESCE(SUM(budget_wan), 0) AS budget
     FROM projects WHERE category IN ('收入相关', '基础能力', '支撑后端') GROUP BY category`
  );

  // 分类 × 阶段 项目数（含终验归档）
  const [stageRows] = await pool.query(
    `SELECT category, stage, COUNT(*) AS n
     FROM projects
     WHERE category IN ('收入相关', '基础能力', '支撑后端')
       AND stage IS NOT NULL AND stage <> ''
     GROUP BY category, stage`
  );

  // 分类在建（剔除终验归档）：项目数/金额/阶段分布
  const [buildingCatRows] = await pool.query(
    `SELECT category, COUNT(*) AS n, COALESCE(SUM(budget_wan), 0) AS budget
     FROM projects
     WHERE category IN ('收入相关', '基础能力', '支撑后端')
       AND COALESCE(stage, '') NOT LIKE '%终验归档%'
     GROUP BY category`
  );
  const [buildingStageRows] = await pool.query(
    `SELECT category, stage, COUNT(*) AS n
     FROM projects
     WHERE category IN ('收入相关', '基础能力', '支撑后端')
       AND stage IS NOT NULL AND stage <> ''
       AND stage NOT LIKE '%终验归档%'
     GROUP BY category, stage`
  );

  // 每个分类下关注项目最近 N 个周报期的进展（按周期窗口合并：去"本周"、去句尾句号、分号连接、重复去重）
  const [dateRows] = await pool.query(
    'SELECT DISTINCT report_date FROM weekly_progress ORDER BY report_date DESC LIMIT ?',
    [weeks]
  );
  const windowDates = dateRows.map((r) => r.report_date);
  const hlByCat = new Map();
  if (windowDates.length) {
    const [hlRows] = await pool.query(
      `SELECT p.category, p.project_code, p.project_name, w.report_date, w.detail
       FROM watch_progress w
       JOIN projects p ON p.project_code = w.project_code
       WHERE w.report_date IN (?)
       ORDER BY p.project_code, w.report_date`,
      [windowDates]
    );
    // 同一项目窗口内各周进展合并为一条
    const byProject = new Map();
    for (const r of hlRows) {
      if (!byProject.has(r.project_code)) {
        byProject.set(r.project_code, { category: r.category, project_name: r.project_name, details: [] });
      }
      byProject.get(r.project_code).details.push(r.detail);
    }
    for (const [, p] of byProject) {
      const parts = [];
      for (const d of p.details) {
        const t = String(d ?? '').replace(/本周/g, '').replace(/[。.\s]+$/, '').trim();
        if (t && !parts.includes(t)) parts.push(t);
      }
      if (!parts.length) continue;
      if (!hlByCat.has(p.category)) hlByCat.set(p.category, []);
      hlByCat.get(p.category).push({ project_name: p.project_name, detail: parts.join('；') + '。' });
    }
  }

  const categories = {};
  // 在建占比分母：全部在建项目（含拟取消，与「在建项目总数」同口径）
  for (const cat of ['收入相关', '基础能力', '支撑后端']) {
    const row = catRows.find((r) => r.category === cat);
    const count = row ? row.n : 0;
    const brow = buildingCatRows.find((r) => r.category === cat);
    const buildingCount = brow ? brow.n : 0;
    const hls = hlByCat.get(cat) || [];
    categories[cat] = {
      count,
      pct: total ? Math.round((count / total) * 1000) / 10 : 0,
      budgetYi: row ? (Number(row.budget) / 10000).toFixed(2) : '0.00',
      stageCounts: Object.fromEntries(
        stageRows.filter((r) => r.category === cat).map((r) => [r.stage, r.n])
      ),
      // 在建变体（剔除终验归档；占比分母为全部在建项目，与「在建项目总数」同口径）
      buildingCount,
      buildingPct: building ? Math.round((buildingCount / building) * 1000) / 10 : 0,
      buildingBudgetYi: brow ? (Number(brow.budget) / 10000).toFixed(2) : '0.00',
      buildingStageCounts: Object.fromEntries(
        buildingStageRows.filter((r) => r.category === cat).map((r) => [r.stage, r.n])
      ),
      highlights: hls.length
        ? hls
            .map((h, i) => `${i + 1}、${h.project_name}，${String(h.detail).replace(/本周/g, '').replace(/。+\s*$/, '')}。`)
            .join('\n')
        : '（无）',
    };
  }

  return { total, cancelled, building, delivered1w: w1, delivered2w: w2, categories };
}
