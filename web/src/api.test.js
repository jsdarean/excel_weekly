import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildQuery, api } from './api.js';

afterEach(() => vi.unstubAllGlobals());

describe('buildQuery', () => {
  it('拼接非空参数，跳过空值', () => {
    expect(buildQuery({ report_date: '2026-08-21', category: '', owner: null, stage: '项目实施阶段' }))
      .toBe('?report_date=2026-08-21&stage=%E9%A1%B9%E7%9B%AE%E5%AE%9E%E6%96%BD%E9%98%B6%E6%AE%B5');
    expect(buildQuery({})).toBe('');
  });
});

describe('api.importReport', () => {
  it('发送 FormData 并携带 overwrite 标志', async () => {
    const fake = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ reportDate: '2026-08-21' }),
    });
    vi.stubGlobal('fetch', fake);
    const file = new File(['x'], 'weekly.xlsx');
    await api.importReport(file, '2026-08-21', true);
    const [url, opts] = fake.mock.calls[0];
    expect(url).toBe('/api/import');
    expect(opts.method).toBe('POST');
    expect(opts.body.get('report_date')).toBe('2026-08-21');
    expect(opts.body.get('overwrite')).toBe('true');
    expect(opts.body.get('file')).toBeInstanceOf(File);
  });

  it('非 2xx 抛出带 status 和 error 信息的 Error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: () => Promise.resolve({ error: '本周已导入过' }),
    }));
    const err = await api.importReport(new File(['x'], 'a.xlsx'), '2026-08-21', false).catch((e) => e);
    expect(err.status).toBe(409);
    expect(err.message).toBe('本周已导入过');
  });
});
