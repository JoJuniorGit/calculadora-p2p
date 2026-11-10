/** Small helper to generate unique ids for profiles, purchases and history entries. */
export function createId(): string {
  const cryptoObject = globalThis.crypto;
  if (cryptoObject && typeof cryptoObject.randomUUID === 'function') {
    return cryptoObject.randomUUID();
  }

  const random = Math.random().toString(36).slice(2, 10);
  return `id-${Date.now().toString(36)}-${random}`;
}
