import { describe, it, expect, vi } from 'vitest';
import { api } from './api.js';
import { importWithConfirm } from './importFlow.js';

vi.mock('./api.js', () => ({
  api: { importReport: vi.fn() },
}));

describe('importWithConfirm', () => {
  it('一次成功直接返回结果', async () => {
    api.importReport.mockResolvedValue({ reportDate: '2026-08-21' });
    const r = await importWithConfirm('file', '2026-08-21', vi.fn());
    expect(r.reportDate).toBe('2026-08-21');
    expect(api.importReport).toHaveBeenCalledWith('file', '2026-08-21', false);
  });

  it('409 且用户确认 → overwrite=true 重发', async () => {
    const conflict = Object.assign(new Error('本周已导入过'), { status: 409 });
    api.importReport
      .mockRejectedValueOnce(conflict)
      .mockResolvedValueOnce({ reportDate: '2026-08-21' });
    const confirmFn = vi.fn().mockReturnValue(true);
    const r = await importWithConfirm('file', '2026-08-21', confirmFn);
    expect(confirmFn).toHaveBeenCalledWith('本周已导入过');
    expect(api.importReport).toHaveBeenLastCalledWith('file', '2026-08-21', true);
    expect(r.reportDate).toBe('2026-08-21');
  });

  it('409 且用户取消 → 返回 null，不重发', async () => {
    const conflict = Object.assign(new Error('本周已导入过'), { status: 409 });
    api.importReport.mockRejectedValueOnce(conflict);
    const r = await importWithConfirm('file', '2026-08-21', () => false);
    expect(r).toBeNull();
    expect(api.importReport).toHaveBeenCalledTimes(1);
  });

  it('非 409 错误直接抛出', async () => {
    const boom = Object.assign(new Error('服务器错误'), { status: 500 });
    api.importReport.mockRejectedValueOnce(boom);
    await expect(
      importWithConfirm('file', '2026-08-21', vi.fn())
    ).rejects.toThrow('服务器错误');
  });
});
