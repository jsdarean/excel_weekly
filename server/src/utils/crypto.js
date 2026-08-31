// AES-256-GCM 配置加密：密钥取 CONFIG_ENCRYPTION_KEY（32 字节 hex），
// 首次使用时自动生成并追加到 server/.env 持久化
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function ensureKey() {
  const existing = process.env.CONFIG_ENCRYPTION_KEY;
  if (existing && /^[0-9a-f]{64}$/i.test(existing)) return Buffer.from(existing, 'hex');
  const key = crypto.randomBytes(32).toString('hex');
  const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../.env');
  fs.appendFileSync(envPath, `CONFIG_ENCRYPTION_KEY=${key}\n`);
  process.env.CONFIG_ENCRYPTION_KEY = key;
  return Buffer.from(key, 'hex');
}

export function encryptText(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', ensureKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  // 布局：iv(12) | authTag(16) | 密文
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64');
}

export function decryptText(payload) {
  const raw = Buffer.from(payload, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', ensureKey(), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
}
