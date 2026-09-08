// 从通讯录人员记录向项目关联人表单带出字段（null 统一转为空串，便于表单回填）
// 职务映射：通讯录职务（员工/室经理/副总/总经理）→ 关联人职务（同一套取值）
const VALID_TITLES = ['总经理', '副总', '室经理', '员工'];

export function applyDirectoryPerson(editing, p) {
  editing.name = p.name ?? editing.name ?? '';
  editing.dept = p.dept ?? '';
  editing.room = p.room ?? '';
  editing.email = p.email ?? '';
  editing.phone = p.phone ?? '';
  if (VALID_TITLES.includes(p.title)) editing.role = p.title;
  return editing;
}
