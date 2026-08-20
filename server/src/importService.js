export async function hasProgressForDate(pool, reportDate) {
  const [rows] = await pool.query(
    'SELECT 1 AS x FROM weekly_progress WHERE report_date = ? LIMIT 1',
    [reportDate]
  );
  return rows.length > 0;
}

export async function importData(pool, parsed, reportDate) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    let inserted = 0;
    let updated = 0;
    for (const p of parsed.projects) {
      const [r] = await conn.query(
        `INSERT INTO projects
           (project_code, category_major, project_name, approval_date,
            category, owner, budget_wan, stage, content)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           category_major = VALUES(category_major),
           project_name = VALUES(project_name),
           approval_date = VALUES(approval_date),
           category = VALUES(category),
           owner = VALUES(owner),
           budget_wan = VALUES(budget_wan),
           stage = VALUES(stage),
           content = VALUES(content)`,
        [p.projectCode, p.categoryMajor, p.projectName, p.approvalDate,
         p.category, p.owner, p.budgetWan, p.stage, p.content]
      );
      if (r.affectedRows === 1) inserted++;
      else if (r.affectedRows === 2) updated++;
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
        [w.projectCode, reportDate, w.progress, w.purchaseRate, w.disclosure,
         w.arrivalRate, w.onlineHandover, w.finalAcceptance]
      );
      progressWritten++;
    }
    await conn.commit();
    return { inserted, updated, progressWritten };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}
