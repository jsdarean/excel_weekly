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
  }
  for (const [k, v] of Object.entries(flat)) {
    out = out.split(`{{${k}}}`).join(String(v));
  }
  // 动态占位符：{{分类名_阶段名_项目数}}，该分类下这个阶段没有项目时替换为 0
  out = out.replace(/\{\{([^{}_]+)_([^{}]+)_项目数\}\}/g, (m, cat, stage) => {
    const sc = data.categories[cat]?.stageCounts;
    return sc ? String(sc[stage] ?? 0) : m;
  });
  return out;
}

// 从数据库聚合生成渲染所需数据
export async function buildReportData(pool) {
  const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM projects');
  const [[{ cancelled }]] = await pool.query(
    "SELECT COUNT(*) AS cancelled FROM projects WHERE category = '拟取消'"
  );
  // 在建项目总数：剔除终验归档阶段与拟取消类别
  const [[{ n: building }]] = await pool.query(
    `SELECT COUNT(*) AS n FROM projects
     WHERE COALESCE(stage, '') <> '终验归档' AND COALESCE(category, '') <> '拟取消'`
  );
  // 近N周交付：阶段变为终验归档的时间在最近N周内（stage_changed_at 由导入流程在阶段变化时写入）
  const [[{ n: w1 }]] = await pool.query(
    `SELECT COUNT(*) AS n FROM projects
     WHERE stage = '终验归档' AND stage_changed_at >= DATE_SUB(NOW(), INTERVAL 1 WEEK)`
  );
  const [[{ n: w2 }]] = await pool.query(
    `SELECT COUNT(*) AS n FROM projects
     WHERE stage = '终验归档' AND stage_changed_at >= DATE_SUB(NOW(), INTERVAL 2 WEEK)`
  );

  const [catRows] = await pool.query(
    `SELECT category, COUNT(*) AS n, COALESCE(SUM(budget_wan), 0) AS budget
     FROM projects WHERE category IN ('收入相关', '基础能力', '支撑后端') GROUP BY category`
  );

  // 分类 × 阶段 项目数
  const [stageRows] = await pool.query(
    `SELECT category, stage, COUNT(*) AS n
     FROM projects
     WHERE category IN ('收入相关', '基础能力', '支撑后端')
       AND stage IS NOT NULL AND stage <> ''
     GROUP BY category, stage`
  );

  // 每个分类下关注项目的最新一周详细进展
  const [hlRows] = await pool.query(
    `SELECT p.category, p.project_name, w.detail
     FROM watch_progress w
     JOIN projects p ON p.project_code = w.project_code
     JOIN (
       SELECT project_code, MAX(report_date) AS max_date
       FROM watch_progress GROUP BY project_code
     ) latest ON latest.project_code = w.project_code AND latest.max_date = w.report_date
     ORDER BY w.project_code`
  );
  const hlByCat = new Map();
  for (const r of hlRows) {
    if (!hlByCat.has(r.category)) hlByCat.set(r.category, []);
    hlByCat.get(r.category).push(r);
  }

  const categories = {};
  for (const cat of ['收入相关', '基础能力', '支撑后端']) {
    const row = catRows.find((r) => r.category === cat);
    const count = row ? row.n : 0;
    const hls = hlByCat.get(cat) || [];
    categories[cat] = {
      count,
      pct: total ? Math.round((count / total) * 1000) / 10 : 0,
      budgetYi: row ? (Number(row.budget) / 10000).toFixed(2) : '0.00',
      stageCounts: Object.fromEntries(
        stageRows.filter((r) => r.category === cat).map((r) => [r.stage, r.n])
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
