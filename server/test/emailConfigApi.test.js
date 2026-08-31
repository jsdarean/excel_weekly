import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { resetDb } from './helpers/db.js';

const config = {
  smtpHost: 'smtp.example.com',
  smtpPort: 465,
  smtpSecure: true,
  smtpUser: 'zhangsan@example.com',
  smtpPass: 'secret-auth-code',
  fromName: '核心网室',
  fromAddr: '',
};

describe('/api/email-config', () => {
  beforeEach(resetDb);

  it('未配置时 GET 返回 null', async () => {
    const res = await request(createApp()).get('/api/email-config');
    expect(res.status).toBe(200);
    expect(res.body.config).toBeNull();
  });

  it('保存 → 读取（授权码不回传，IMAP 地址自动推断）', async () => {
    const app = createApp();
    const saved = await request(app).put('/api/email-config').send(config);
    expect(saved.status).toBe(200);

    const res = await request(app).get('/api/email-config');
    const c = res.body.config;
    expect(c.smtpHost).toBe('smtp.example.com');
    expect(c.smtpPort).toBe(465);
    expect(c.smtpUser).toBe('zhangsan@example.com');
    expect(c.fromName).toBe('核心网室');
    expect(c.hasPassword).toBe(true);
    expect(c.imapInferred).toBe('imap.example.com:993');
    expect(JSON.stringify(res.body)).not.toContain('secret-auth-code');
  });

  it('授权码留空表示不修改；缺 SMTP 服务器/账号返回 400', async () => {
    const app = createApp();
    await request(app).put('/api/email-config').send(config);
    const again = await request(app)
      .put('/api/email-config')
      .send({ ...config, smtpPass: '', fromName: '改名' });
    expect(again.status).toBe(200);
    const res = await request(app).get('/api/email-config');
    expect(res.body.config.hasPassword).toBe(true);
    expect(res.body.config.fromName).toBe('改名');

    const noHost = await request(app).put('/api/email-config').send({ ...config, smtpHost: '' });
    expect(noHost.status).toBe(400);
    const noUser = await request(app).put('/api/email-config').send({ ...config, smtpUser: '' });
    expect(noUser.status).toBe(400);
  });

  it('首次配置缺授权码返回 400', async () => {
    const res = await request(createApp())
      .put('/api/email-config')
      .send({ ...config, smtpPass: '' });
    expect(res.status).toBe(400);
  });

  it('测试接口：收件地址非法返回 400；配置不完整返回 400', async () => {
    const app = createApp();
    const badTo = await request(app).post('/api/email-config/test').send({ to: 'not-an-email' });
    expect(badTo.status).toBe(400);
    const noConfig = await request(app)
      .post('/api/email-config/test')
      .send({ to: 'a@b.com' });
    expect(noConfig.status).toBe(400);
  });
});
