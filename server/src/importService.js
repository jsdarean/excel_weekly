export async function hasProgressForDate(pool, reportDate) {
  const [rows] = await pool.query(
    'SELECT 1 AS x FROM weekly_progress WHERE report_date = ? LIMIT 1',
    [reportDate]
  );
  return rows.length > 0;
}

// 周进展规范化：去除首尾空白；末尾没有结束标点（。！？；.!?;）时补句号
function normalizeProgress(text) {
  if (text === null || text === undefined) return text;
  const t = String(text).trim();
  if (!t) return text;
  return /[。！？；.!?;]$/.test(t) ? t : `${t}。`;
}

export async function importData(pool, parsed, reportDate) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    let inserted = 0;
    let updated = 0;
    for (const p of parsed.projects) {
      // affectedRows 无法区分"更新但值未变"（FOUND_ROWS 下为 1），
      // 因此先查存在性再 upsert，保证 inserted/updated 统计准确。
      const [exist] = await conn.query(
        'SELECT id FROM projects WHERE project_code = ?',
        [p.projectCode]
      );
      await conn.query(
        `INSERT INTO projects
           (project_code, category_major, project_name, approval_date,
            category, owner, budget_wan, stage, content,
            demand_dept, demand_room, demand_owner)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           category_major = VALUES(category_major),
           project_name = VALUES(project_name),
           approval_date = VALUES(approval_date),
           category = VALUES(category),
           owner = VALUES(owner),
           budget_wan = VALUES(budget_wan),
           stage = VALUES(stage),
           content = VALUES(content),
           demand_dept = VALUES(demand_dept),
           demand_room = VALUES(demand_room),
           demand_owner = VALUES(demand_owner)`,
        [p.projectCode, p.categoryMajor, p.projectName, p.approvalDate,
         p.category, p.owner, p.budgetWan, p.stage, p.content,
         p.demandDept, p.demandRoom, p.demandOwner]
      );
      if (exist.length > 0) updated++;
      else inserted++;
    }
    let progressWritten = 0;
    for (const w of parsed.progress) {
      await conn.query(
        `INSERT INTO weekly_progress
           (project_code, report_date, progress, purchase_rate, disclosure,
            arrival_rate, online_handover, final_acceptance)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           progress = VALUES(progress),
           purchase_rate = VALUES(purchase_rate),
           disclosure = VALUES(disclosure),
           arrival_rate = VALUES(arrival_rate),
           online_handover = VALUES(online_handover),
           final_acceptance = VALUES(final_acceptance)`,
        [w.projectCode, reportDate, normalizeProgress(w.progress), w.purchaseRate, w.disclosure,
         w.arrivalRate, w.onlineHandover, w.finalAcceptance]
      );
      progressWritten++;
    }
    // 同步更新已关注项目的 weekly 副本（手工修改的 source='manual' 不覆盖）
    await conn.query(
      `UPDATE watch_progress wp
       JOIN watched_projects w ON w.project_code = wp.project_code
       JOIN weekly_progress wpr
         ON wpr.project_code = wp.project_code AND wpr.report_date = wp.report_date
       SET wp.detail = wpr.progress
       WHERE wp.source = 'weekly' AND wpr.report_date = ?`,
      [reportDate]
    );
    // 导入新周次时，为已关注项目补一份副本
    await conn.query(
      `INSERT IGNORE INTO watch_progress (project_code, report_date, detail, source)
       SELECT w.project_code, wpr.report_date, wpr.progress, 'weekly'
       FROM watched_projects w
       JOIN weekly_progress wpr
         ON wpr.project_code = w.project_code AND wpr.report_date = ?
       WHERE wpr.progress IS NOT NULL AND TRIM(wpr.progress) <> ''`,
      [reportDate]
    );
    await conn.commit();
    return { inserted, updated, progressWritten };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}
