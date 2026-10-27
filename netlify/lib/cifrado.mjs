// AES-256-GCM para los secretos de integraciones. La clave sale de CIFRADO_SECRETO o, si falta, de SESION_SECRETO.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

function clave() {
  const propia = (process.env.CIFRADO_SECRETO || '').trim();
  const sesion = (process.env.SESION_SECRETO || '').trim();
  if (!propia && !sesion) throw new Error('Falta configurar SESION_SECRETO');
  return createHash('sha256').update(propia || sesion + ':cifrado').digest();
}

export function cifrar(texto) {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', clave(), iv);
  const cifrado = Buffer.concat([c.update(String(texto), 'utf8'), c.final()]);
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), cifrado.toString('base64')].join(':');
}

// Tira Error si no se puede (formato raro o la clave cambió): quien llama lo trata como "sin clave"
export function descifrar(s) {
  const [v, iv, tag, datos] = String(s || '').split(':');
  if (v !== 'v1' || !iv || !tag || datos == null) throw new Error('Secreto con formato desconocido');
  const d = createDecipheriv('aes-256-gcm', clave(), Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(datos, 'base64')), d.final()]).toString('utf8');
}

export const enmascarar = (s) => (s ? '…' + String(s).slice(-4) : '');
