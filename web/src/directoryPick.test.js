import { describe, it, expect } from 'vitest';
import { applyDirectoryPerson } from './directoryPick.js';

describe('applyDirectoryPerson', () => {
  it('带出完整姓名、部门/室/邮箱/电话，并把职务映射为关联人职务', () => {
    const editing = { name: '蒋', dept: '', room: '', email: '', phone: '', role: '' };
    applyDirectoryPerson(editing, {
      dept: '产品运营中心', room: 'AI产品室', email: 'j@x.com', phone: '139', title: '室经理', name: '蒋无暇',
    });
    expect(editing).toEqual({
      name: '蒋无暇', dept: '产品运营中心', room: 'AI产品室', email: 'j@x.com', phone: '139', role: '室经理',
    });
  });

  it('副总/总经理也直接填入关联人职务', () => {
    const editing = { name: '', dept: '', room: '', email: '', phone: '', role: '' };
    applyDirectoryPerson(editing, { dept: '网络部', room: null, email: null, phone: null, title: '副总', name: '张三' });
    expect(editing).toEqual({ name: '张三', dept: '网络部', room: '', email: '', phone: '', role: '副总' });
  });

  it('null 字段回填为空串，不覆盖为 null', () => {
    const editing = { name: '', dept: '旧部门', room: '', email: '', phone: '', role: '' };
    applyDirectoryPerson(editing, { dept: null, room: null, email: null, phone: null, title: null, name: '李四' });
    expect(editing).toEqual({ name: '李四', dept: '', room: '', email: '', phone: '', role: '' });
  });
});
