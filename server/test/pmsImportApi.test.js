import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import xlsx from 'xlsx';
import { createApp } from '../src/app.js';
import { getPool } from '../src/db.js';
import { resetDb } from './helpers/db.js';

function buildPmsBuffer(rows) {
  const header = ['项目编码', '项目名称', '项目阶段', '工程管理经理-主'];
  const ws = xlsx.utils.aoa_to_sheet([header, ...rows]);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, 'PMS');
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

describe('POST /api/import-pms', () => {
  beforeEach(async () => {
    await resetDb();
    const pool = getPool();
    await pool.query("INSERT INTO persons (name) VALUES ('张三'), ('李四')");
    await pool.query(
      `INSERT INTO projects (project_code, project_name, stage, owner)
       VALUES ('P001', '已有项目甲', '项目实施阶段', '张三'),
              ('P002', '已有项目乙', '勘察设计阶段', '李四')`
    );
  });

  it('筛选人员→阶段映射→匹配更新/未匹配新增，返回统计', async () => {
    const buf = buildPmsBuffer([
      // 阶段映射后一致：不更新
      ['P001', '已有项目甲', '工程实施阶段', '张三'],
      // 阶段映射后不一致：更新（勘察设计 → 终验归档）
      ['P002', '已有项目乙', '审计归档阶段', '李四'],
      // 库里没有的新项目：新增（映射为项目实施阶段）
      ['P999', '新项目丙', '工程实施阶段', '张三'],
      // 经理不在人员配置里：跳过
      ['P998', '外人项目', '工程实施阶段', '王五'],
      // 立项阶段：不管（即使库里没有也不新增）
      ['P997', '立项项目', '立项阶段', '张三'],
    ]);
    const res = await request(createApp())
      .post('/api/import-pms')
      .attach('file', buf, 'pms.xlsx');
    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(1);
    expect(res.body.inserted).toBe(1);
    expect(res.body.unchanged).toBe(1);
    expect(res.body.skippedNoPerson).toBe(1);
    expect(res.body.skippedStage).toBe(1);

    const pool = getPool();
    const [p2] = await pool.query("SELECT stage FROM projects WHERE project_code = 'P002'");
    expect(p2[0].stage).toBe('终验归档阶段');
    const [p9] = await pool.query(
      "SELECT project_name, stage, owner FROM projects WHERE project_code = 'P999'"
    );
    expect(p9[0]).toMatchObject({
      project_name: '新项目丙',
      stage: '项目实施阶段',
      owner: '张三',
    });
    const [p7] = await pool.query("SELECT 1 AS x FROM projects WHERE project_code = 'P997'");
    expect(p7).toHaveLength(0);

    // 明细
    expect(res.body.updatedList).toEqual([
      { projectCode: 'P002', from: '勘察设计阶段', to: '终验归档阶段' },
    ]);
    expect(res.body.insertedList).toEqual(['P999']);
  });

  it('幂等：重复导入第二次全是 unchanged', async () => {
    const buf = buildPmsBuffer([
      ['P002', '已有项目乙', '审计归档阶段', '李四'],
      ['P999', '新项目丙', '工程实施阶段', '张三'],
    ]);
    const app = createApp();
    await request(app).post('/api/import-pms').attach('file', buf, 'pms.xlsx');
    const res2 = await request(app).post('/api/import-pms').attach('file', buf, 'pms.xlsx');
    expect(res2.body.updated).toBe(0);
    expect(res2.body.inserted).toBe(0);
    expect(res2.body.unchanged).toBe(2);
  });

  it('缺文件 400；缺关键列 400', async () => {
    const app = createApp();
    const noFile = await request(app).post('/api/import-pms');
    expect(noFile.status).toBe(400);
    const badBuf = xlsx.write(
      (() => {
        const wb = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(wb, xlsx.utils.aoa_to_sheet([['项目编码', '其他列']]), 'x');
        return wb;
      })(),
      { type: 'buffer', bookType: 'xlsx' }
    );
    const bad = await request(app).post('/api/import-pms').attach('file', badBuf, 'x.xlsx');
    expect(bad.status).toBe(400);
    expect(bad.body.error).toContain('项目阶段');
  });
});
