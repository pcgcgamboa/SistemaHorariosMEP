/**
 * Hash de password client-side (SHA-256 vía Web Crypto API).
 *
 * NOTA SAAS: en producción la verificación debe ocurrir server-side con un
 * algoritmo lento y con sal (bcrypt / argon2). Esta implementación es la capa
 * mínima para no almacenar contraseñas en texto plano en el JSON de seed
 * mientras la app es 100% cliente. La interfaz `hashPassword` /
 * `verifyPassword` es estable: al migrar a backend solo se reemplaza el
 * cuerpo de las funciones por llamadas a la API.
 */

export async function hashPassword(password: string): Promise<string> {
  const data = new TextEncoder().encode(password);
  const buffer = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buffer)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function verifyPassword(
  password: string,
  expectedHash: string,
): Promise<boolean> {
  if (!expectedHash) return false;
  const candidate = await hashPassword(password);
  // Comparación constante (evita timing attacks triviales).
  if (candidate.length !== expectedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < candidate.length; i++) {
    diff |= candidate.charCodeAt(i) ^ expectedHash.charCodeAt(i);
  }
  return diff === 0;
}
