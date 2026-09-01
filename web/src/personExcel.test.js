import { describe, it, expect } from 'vitest';
import { buildPersonsData } from './personExcel.js';

describe('buildPersonsData', () => {
  it('表头与导入模板一致，空值导出为空字符串', () => {
    const data = buildPersonsData([
      { name: '张三', title: '室经理', phone: '139', short_number: '61001', email: 'zs@x.com' },
      { name: '李四', title: null, phone: null, short_number: null, email: null },
    ]);
    expect(data[0]).toEqual(['姓名', '职务', '电话', '短号', '邮箱']);
    expect(data[1]).toEqual(['张三', '室经理', '139', '61001', 'zs@x.com']);
    expect(data[2]).toEqual(['李四', '', '', '', '']);
  });
});
