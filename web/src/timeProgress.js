// 时间进度百分比：(当前时间 - 立项批复时间) / (计划割接上线时间 - 立项批复时间)
// 返回四舍五入后的整数；缺数据或区间非法（割接时间不晚于立项时间）返回 null
export function timeProgressPct(approvalDate, cutoverDate, now = new Date()) {
  if (!approvalDate || !cutoverDate) return null;
  const start = new Date(`${approvalDate}T00:00:00`).getTime();
  const end = new Date(`${cutoverDate}T00:00:00`).getTime();
  if (!(end > start)) return null;
  return Math.round(((now.getTime() - start) / (end - start)) * 100);
}
