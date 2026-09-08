import { describe, it, expect } from 'vitest';
import { timeProgressPct } from './timeProgress.js';

describe('timeProgressPct', () => {
  const now = new Date('2026-09-08T00:00:00');

  it('正常区间：不保留小数（四舍五入取整）', () => {
    // 2026-08-01 → 2026-10-01 共 61 天，到 09-08 过了 38 天 ≈ 62.3%
    expect(timeProgressPct('2026-08-01', '2026-10-01', now)).toBe(62);
  });

  it('刚好起点 0%，刚好终点 100%', () => {
    expect(timeProgressPct('2026-09-08', '2026-10-08', now)).toBe(0);
    expect(timeProgressPct('2026-08-08', '2026-09-08', now)).toBe(100);
  });

  it('超过计划时间返回大于 100 的值（条形图截断由展示层处理）', () => {
    expect(timeProgressPct('2026-08-01', '2026-09-01', now)).toBeGreaterThan(100);
  });

  it('缺任一日期或区间非法返回 null', () => {
    expect(timeProgressPct(null, '2026-10-01', now)).toBeNull();
    expect(timeProgressPct('2026-08-01', null, now)).toBeNull();
    expect(timeProgressPct('2026-10-01', '2026-08-01', now)).toBeNull(); // 割接早于立项
    expect(timeProgressPct('2026-08-01', '2026-08-01', now)).toBeNull(); // 区间长度为 0
  });
});
