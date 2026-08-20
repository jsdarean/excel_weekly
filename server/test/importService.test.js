import { describe, it, expect, beforeEach } from 'vitest';
import { getPool } from '../src/db.js';
import { resetDb } from './helpers/db.js';
import { hasProgressForDate, importData } from '../src/importService.js';

const parsed = {
  projects: [
    {
      projectCode: 'P001', categoryMajor: '业务网', projectName: '项目甲',
      approvalDate: '2025-09-09', category: '基础能力', owner: '张三',
      budgetWan: 320, stage: '项目实施阶段', content: '内容甲',
    },
  ],
  progress: [
    {
      projectCode: 'P001', progress: '第一周进展', purchaseRate: 0.5,
      disclosure: '是', arrivalRate: 0.4, onlineHandover: '否',
      finalAcceptance: '否',
    },
  ],
  headerDate: '2026-08-21',
  skipped: 0,
};

describe('importData', () => {
  beforeEach(resetDb);

  it('首次导入：inserted=1, updated=0, progressWritten=1', async () => {
    const stats = await importData(getPool(), parsed, '2026-08-21');
    expect(stats).toEqual({ inserted: 1, updated: 0, progressWritten: 1 });
    const [p] = await getPool().query('SELECT * FROM projects');
    expect(p[0].project_name).toBe('项目甲');
    expect(p[0].approval_date).toBe('2025-09-09');
    const [w] = await getPool().query('SELECT * FROM weekly_progress');
    expect(w[0].report_date).toBe('2026-08-21');
  });

  it('再次导入：基础数据更新（updated=1），同周进展覆盖', async () => {
    await importData(getPool(), parsed, '2026-08-21');
    const parsed2 = structuredClone(parsed);
    parsed2.projects[0].stage = '工程验收阶段';
    parsed2.progress[0].progress = '修正后的进展';
    const stats = await importData(getPool(), parsed2, '2026-08-21');
    expect(stats).toEqual({ inserted: 0, updated: 1, progressWritten: 1 });
    const [p] = await getPool().query('SELECT stage FROM projects');
    expect(p[0].stage).toBe('工程验收阶段');
    const [w] = await getPool().query('SELECT progress FROM weekly_progress');
    expect(w).toHaveLength(1);
    expect(w[0].progress).toBe('修正后的进展');
  });

  it('同周同数据覆盖导入：updated=1（数据未变也算更新）', async () => {
    await importData(getPool(), parsed, '2026-08-21');
    const stats = await importData(getPool(), parsed, '2026-08-21');
    expect(stats).toEqual({ inserted: 0, updated: 1, progressWritten: 1 });
  });

  it('不同周各自成记录，互不影响', async () => {
    await importData(getPool(), parsed, '2026-08-21');
    await importData(getPool(), parsed, '2026-08-28');
    const [w] = await getPool().query(
      'SELECT report_date FROM weekly_progress ORDER BY report_date'
    );
    expect(w.map((r) => r.report_date)).toEqual(['2026-08-21', '2026-08-28']);
  });
});

describe('hasProgressForDate', () => {
  beforeEach(resetDb);

  it('有记录返回 true，无记录返回 false', async () => {
    expect(await hasProgressForDate(getPool(), '2026-08-21')).toBe(false);
    await importData(getPool(), parsed, '2026-08-21');
    expect(await hasProgressForDate(getPool(), '2026-08-21')).toBe(true);
    expect(await hasProgressForDate(getPool(), '2026-08-28')).toBe(false);
  });
});
