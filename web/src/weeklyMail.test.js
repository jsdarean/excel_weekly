import { describe, it, expect } from 'vitest';
import { WEEKLY_MAIL_TITLE, defaultSubject, buildEmailShell, signatureHtml, renderWeeklyBodyHtml } from './weeklyMail.js';

describe('defaultSubject', () => {
  it('默认主题为 标题（日期）', () => {
    expect(defaultSubject('2026-10-17')).toBe('省本部重点工程项目进展（2026-10-17）');
  });
});

describe('buildEmailShell', () => {
  it('默认标题；传副标题时渲染副标题行', () => {
    const html = buildEmailShell('<p>正文</p>', { subtitle: '2026-10-17' });
    expect(html).toContain(WEEKLY_MAIL_TITLE);
    expect(html).toContain('2026-10-17');
    expect(html).toContain('<p>正文</p>');
    expect(html).toContain('linear-gradient(90deg,#0086d4');
  });
  it('自定义标题/副标题，HTML 特殊字符转义', () => {
    const html = buildEmailShell('<p>x</p>', { title: '领导好<a>', subtitle: '第（1）期' });
    expect(html).toContain('领导好&lt;a&gt;');
    expect(html).toContain('第（1）期');
  });
  it('无副标题时不渲染副标题行', () => {
    expect(buildEmailShell('<p>x</p>')).not.toContain('font-size:12px;margin-top:4px');
  });
});

describe('signatureHtml', () => {
  it('空签名返回空串', () => {
    expect(signatureHtml('')).toBe('');
    expect(signatureHtml(null)).toBe('');
  });
  it('签名按段落渲染并转义 HTML', () => {
    const html = signatureHtml('谢谢！\n联系人<a>@x.com');
    expect(html).toContain('谢谢！<br>联系人&lt;a&gt;@x.com');
  });
});

describe('renderWeeklyBodyHtml（给公司领导的模板结构）', () => {
  const text = [
    '各位好！',
    '工程建设部核心网室从2025年1月至今承接的投资项目总数共250个项目。',
    '一、收入相关（25个项目，占10%，其中勘察设计阶段3个）',
    '全部为业务网项目，立项金额约7.54亿元。',
    '部分重点项目上周进展：',
    '1、视联网X节点资源池工程项目，南京节点继续配合验收交维工作。',
    '2、2025年家庭云电脑业务平台建设工程项目，无锡节点已经上线。',
    '二、基础能力（84个项目，占33.6%）',
  ].join('\n');

  it('章节标题渲染为蓝条标题 + 灰色统计副标题', () => {
    const html = renderWeeklyBodyHtml(text);
    expect(html).toContain('border-left:4px solid #0086d4');
    expect(html).toContain('一、收入相关</div>');
    expect(html).toContain('25个项目，占10%');
  });

  it('进展标签渲染为小标题条', () => {
    expect(renderWeeklyBodyHtml(text)).toContain('▍部分重点项目上周进展：');
  });

  it('编号条目：序号徽标 + 项目名（第一个逗号前）加粗', () => {
    const html = renderWeeklyBodyHtml(text);
    expect(html).toContain('border-radius:11px');
    expect(html).toContain('<b style="color:#111827;">视联网X节点资源池工程项目</b>，南京节点');
  });

  it('普通段落按段落渲染，HTML 特殊字符转义', () => {
    const html = renderWeeklyBodyHtml('前言<a>说明\n一、短标题');
    expect(html).toContain('前言&lt;a&gt;说明');
  });
});
