import { describe, it, expect, afterEach } from 'vitest';
import nodemailer from 'nodemailer';
import {
  transporterCacheKey,
  getPooledTransporter,
  closeTransporterPool,
} from '../src/mailService.js';

const base = { smtpHost: 'smtp.x.com', smtpPort: 465, smtpSecure: true, smtpUser: 'a@x.com', smtpPass: 'pw' };

afterEach(() => closeTransporterPool());

describe('SMTP 连接池', () => {
  it('缓存键随任一配置项变化而变化', () => {
    const k0 = transporterCacheKey(base);
    expect(transporterCacheKey({ ...base })).toBe(k0);
    expect(transporterCacheKey({ ...base, smtpPort: 587 })).not.toBe(k0);
    expect(transporterCacheKey({ ...base, smtpHost: 'smtp2.x.com' })).not.toBe(k0);
    expect(transporterCacheKey({ ...base, smtpUser: 'b@x.com' })).not.toBe(k0);
    expect(transporterCacheKey({ ...base, smtpPass: 'pw2' })).not.toBe(k0);
    // 与发送无关的字段不影响键
    expect(transporterCacheKey({ ...base, fromName: 'x', imapEnabled: false })).toBe(k0);
  });

  it('同一配置复用同一 transport 实例；配置变化重建池', () => {
    const t1 = getPooledTransporter(base);
    expect(getPooledTransporter({ ...base })).toBe(t1);
    const t2 = getPooledTransporter({ ...base, smtpPort: 587 });
    expect(t2).not.toBe(t1);
    // 重建后新配置命中新实例
    expect(getPooledTransporter({ ...base, smtpPort: 587 })).toBe(t2);
  });

  it('池化 transport 带 pool 配置', () => {
    const t = getPooledTransporter(base);
    expect(t.transporter.options.pool).toBe(true);
    expect(t.transporter.options.maxConnections).toBe(3);
  });
});
