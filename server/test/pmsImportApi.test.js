import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import xlsx from 'xlsx';
import AdmZip from 'adm-zip';
import { createApp } from '../src/app.js';
import { getPool } from '../src/db.js';
import { resetDb } from './helpers/db.js';

function buildPmsBuffer(rows) {
  const header = ['项目编码', '项目名称', '项目阶段', '工程管理经理-主', '第一次立项批复完成时间', '第一次立项批复金额'];
  const ws = xlsx.utils.aoa_to_sheet([header, ...rows]);
  const wb = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(wb, ws, 'PMS');
  return xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function buildPmsZipBuffer(rows) {
  const xlsxBuf = buildPmsBuffer(rows);
  const zip = new AdmZip();
  zip.addFile('pms.xlsx', xlsxBuf);
  return zip.toBuffer();
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
      // 阶段映射后一致：不更新（日期/金额列留空）
      ['P001', '已有项目甲', '工程实施阶段', '张三', null, null],
      // 阶段映射后不一致：更新（勘察设计 → 终验归档），同时补充缺失的日期/金额
      ['P002', '已有项目乙', '审计归档阶段', '李四', '2025/6/1', '12,000,000'],
      // 库里没有的新项目：新增（映射为项目实施阶段）
      ['P999', '新项目丙', '工程实施阶段', '张三', new Date(2025, 0, 1), 8000000],
      // 经理不在人员配置里：跳过
      ['P998', '外人项目', '工程实施阶段', '王五', '2025-01-01', 1000000],
      // 立项阶段：不管（即使库里没有也不新增）
      ['P997', '立项项目', '立项阶段', '张三', '2025-01-01', 1000000],
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
    const [p2] = await pool.query("SELECT stage, approval_date, budget_wan FROM projects WHERE project_code = 'P002'");
    expect(p2[0].stage).toBe('终验归档阶段');
    expect(p2[0].approval_date).toBe('2025-06-01');
    expect(Number(p2[0].budget_wan)).toBe(1200);
    const [p9] = await pool.query(
      "SELECT project_name, stage, owner, approval_date, budget_wan FROM projects WHERE project_code = 'P999'"
    );
    expect(p9[0]).toMatchObject({
      project_name: '新项目丙',
      stage: '项目实施阶段',
      owner: '张三',
      approval_date: '2025-01-01',
    });
    expect(Number(p9[0].budget_wan)).toBe(800);
    const [p7] = await pool.query("SELECT 1 AS x FROM projects WHERE project_code = 'P997'");
    expect(p7).toHaveLength(0);

    // 明细
    expect(res.body.updatedList).toEqual([
      { projectCode: 'P002', projectName: '已有项目乙', manager: '李四', from: '勘察设计阶段', to: '终验归档阶段' },
    ]);
    expect(res.body.insertedList).toEqual([
      { projectCode: 'P999', projectName: '新项目丙', manager: '张三' },
    ]);
  });

  it('已有日期/金额时不被宽表覆盖', async () => {
    const pool = getPool();
    await pool.query(
      "UPDATE projects SET approval_date = '2024-01-01', budget_wan = 999 WHERE project_code = 'P002'"
    );
    const buf = buildPmsBuffer([
      ['P002', '已有项目乙', '审计归档阶段', '李四', '2025-06-01', '12,000,000'],
    ]);
    const res = await request(createApp())
      .post('/api/import-pms')
      .attach('file', buf, 'pms.xlsx');
    expect(res.status).toBe(200);
    const [p2] = await pool.query("SELECT approval_date, budget_wan FROM projects WHERE project_code = 'P002'");
    expect(p2[0].approval_date).toBe('2024-01-01');
    expect(Number(p2[0].budget_wan)).toBe(999);
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

  it('支持上传 zip 压缩包，自动解压其中的 xlsx 导入', async () => {
    const buf = buildPmsZipBuffer([
      ['P001', '已有项目甲', '工程实施阶段', '张三', null, null],
      ['P002', '已有项目乙', '审计归档阶段', '李四', '2025/6/1', '12,000,000'],
      ['P999', '新项目丙', '工程实施阶段', '张三', '2025-01-01', 8000000],
    ]);
    const res = await request(createApp())
      .post('/api/import-pms')
      .attach('file', buf, 'pms.zip');
    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(1);
    expect(res.body.inserted).toBe(1);
    expect(res.body.unchanged).toBe(1);
    expect(res.body.updatedList).toEqual([
      { projectCode: 'P002', projectName: '已有项目乙', manager: '李四', from: '勘察设计阶段', to: '终验归档阶段' },
    ]);
    expect(res.body.insertedList).toEqual([
      { projectCode: 'P999', projectName: '新项目丙', manager: '张三' },
    ]);
  });

  it('zip 中无 xlsx 返回 400', async () => {
    const zip = new AdmZip();
    zip.addFile('readme.txt', Buffer.from('hello'));
    const res = await request(createApp())
      .post('/api/import-pms')
      .attach('file', zip.toBuffer(), 'empty.zip');
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('ZIP');
  });

  it('preview 返回待新增和阶段变化列表', async () => {
    const buf = buildPmsBuffer([
      ['P001', '已有项目甲', '工程实施阶段', '张三', null, null],
      ['P002', '已有项目乙', '审计归档阶段', '李四', '2025/6/1', '12,000,000'],
      ['P999', '新项目丙', '工程实施阶段', '张三', '2025-01-01', 8000000],
      ['P998', '外人项目', '工程实施阶段', '王五', '2025-01-01', 1000000],
      ['P997', '立项项目', '立项阶段', '张三', '2025-01-01', 1000000],
    ]);
    const res = await request(createApp())
      .post('/api/import-pms/preview')
      .attach('file', buf, 'pms.xlsx');
    expect(res.status).toBe(200);
    expect(res.body.toInsert).toHaveLength(1);
    expect(res.body.toInsert[0].projectCode).toBe('P999');
    expect(res.body.stageChanges).toHaveLength(1);
    expect(res.body.stageChanges[0]).toMatchObject({
      projectCode: 'P002',
      projectName: '已有项目乙',
      manager: '李四',
      from: '勘察设计阶段',
      to: '终验归档阶段',
      hasFill: true,
    });
    expect(res.body.unchanged).toBe(1);
    expect(res.body.skippedNoPerson).toBe(1);
    expect(res.body.skippedStage).toBe(1);
  });

  it('apply 只更新用户确认的阶段变化；未确认的不更新', async () => {
    const app = createApp();
    const preview = await request(app)
      .post('/api/import-pms/preview')
      .attach(
        'file',
        buildPmsBuffer([
          ['P001', '已有项目甲', '工程实施阶段', '张三', null, null],
          ['P002', '已有项目乙', '审计归档阶段', '李四', '2025/6/1', '12,000,000'],
          ['P999', '新项目丙', '工程实施阶段', '张三', '2025-01-01', 8000000],
        ]),
        'pms.xlsx'
      );

    // 只确认 P002 的阶段变化，P001 不变更
    const apply = await request(app)
      .post('/api/import-pms/apply')
      .send({
        toInsert: preview.body.toInsert,
        confirmedUpdates: preview.body.stageChanges.filter((u) => u.projectCode === 'P002'),
      });
    expect(apply.status).toBe(200);
    expect(apply.body.updated).toBe(1);
    expect(apply.body.inserted).toBe(1);

    const pool = getPool();
    const [p1] = await pool.query("SELECT stage FROM projects WHERE project_code = 'P001'");
    expect(p1[0].stage).toBe('项目实施阶段');
    const [p2] = await pool.query("SELECT stage, approval_date, budget_wan FROM projects WHERE project_code = 'P002'");
    expect(p2[0].stage).toBe('终验归档阶段');
    expect(p2[0].approval_date).toBe('2025-06-01');
    expect(Number(p2[0].budget_wan)).toBe(1200);
  });

  it('preview 对缺失日期/金额但阶段不变的项目标记 onlyFill', async () => {
    const pool = getPool();
    await pool.query(
      "INSERT INTO projects (project_code, project_name, stage, owner) VALUES ('P003', '已有项目丙', '项目实施阶段', '张三')"
    );
    const res = await request(createApp())
      .post('/api/import-pms/preview')
      .attach(
        'file',
        buildPmsBuffer([['P003', '已有项目丙', '工程实施阶段', '张三', '2025-03-01', 5000000]]),
        'pms.xlsx'
      );
    expect(res.status).toBe(200);
    expect(res.body.stageChanges).toHaveLength(1);
    expect(res.body.stageChanges[0].onlyFill).toBe(true);
    expect(res.body.stageChanges[0].hasFill).toBe(true);
    expect(res.body.unchanged).toBe(0);
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
