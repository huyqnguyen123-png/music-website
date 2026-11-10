// Tiny in-memory cache: remembers keys for a limited time (lost on restart)
export class TtlCache {
  private expiresAt = new Map<string, number>();

  constructor(private ttlMs: number) {}

  has(key: string) {
    const expiry = this.expiresAt.get(key);
    if (expiry === undefined) return false;
    if (expiry < Date.now()) {
      this.expiresAt.delete(key);
      return false;
    }
    return true;
  }

  add(key: string) {
    this.expiresAt.set(key, Date.now() + this.ttlMs);
  }
}
