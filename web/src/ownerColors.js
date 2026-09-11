// 项目统计柱形图：工程责任人 → 颜色分配（纯逻辑，便于测试）
export const OWNER_PALETTE = [
  '#0085d0', '#f96bee', '#f0b27a', '#8ecae6', '#7c6cf0',
  '#22b07d', '#e0556a', '#b9b9f9', '#e8a33d', '#5ac8d8',
];

// 汇总各月责任人数量 → 按总数降序分配色板颜色（全局一致），未分配固定灰色
export function buildOwnerStats(byMonth) {
  const totals = new Map();
  for (const m of byMonth ?? []) {
    for (const o of m.owners ?? []) {
      totals.set(o.owner, (totals.get(o.owner) || 0) + o.count);
    }
  }
  const owners = [...totals.entries()]
    .map(([owner, total]) => ({ owner, total }))
    .sort((a, b) => b.total - a.total || a.owner.localeCompare(b.owner, 'zh'));
  const colors = new Map(
    owners.map((o, i) => [o.owner, o.owner === '未分配' ? '#9ca3af' : OWNER_PALETTE[i % OWNER_PALETTE.length]])
  );
  return { owners, colors };
}
