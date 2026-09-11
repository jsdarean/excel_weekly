import { describe, it, expect } from 'vitest';
import { buildOwnerStats, OWNER_PALETTE } from './ownerColors.js';

describe('buildOwnerStats', () => {
  const byMonth = [
    { month: '2026-01', owners: [{ owner: '张三', count: 2 }, { owner: '李四', count: 1 }] },
    { month: '2026-02', owners: [{ owner: '李四', count: 3 }, { owner: '未分配', count: 1 }] },
  ];

  it('按责任人总数降序排列', () => {
    const { owners } = buildOwnerStats(byMonth);
    expect(owners).toEqual([
      { owner: '李四', total: 4 },
      { owner: '张三', total: 2 },
      { owner: '未分配', total: 1 },
    ]);
  });

  it('颜色全局一致：总数最高者用色板第一色，未分配固定灰色', () => {
    const { colors } = buildOwnerStats(byMonth);
    expect(colors.get('李四')).toBe(OWNER_PALETTE[0]);
    expect(colors.get('张三')).toBe(OWNER_PALETTE[1]);
    expect(colors.get('未分配')).toBe('#9ca3af');
  });

  it('空数据返回空结果', () => {
    expect(buildOwnerStats([])).toEqual({ owners: [], colors: new Map() });
  });
});
