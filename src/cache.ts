import Database from "better-sqlite3";

export class Cache {
  private db: Database.Database;

  constructor(path = ".archaeologist-cache.db") {
    this.db = new Database(path);
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT, ts INTEGER)"
    );
  }

  // Return cached value if it exists and is younger than maxAgeMs (default 24h).
  get<T>(key: string, maxAgeMs = 86_400_000): T | null {
    const row = this.db.prepare("SELECT v, ts FROM kv WHERE k = ?").get(key) as
      | { v: string; ts: number }
      | undefined;
    if (!row || Date.now() - row.ts > maxAgeMs) return null;
    return JSON.parse(row.v) as T;
  }

  set(key: string, value: unknown): void {
    this.db
      .prepare("INSERT OR REPLACE INTO kv (k, v, ts) VALUES (?, ?, ?)")
      .run(key, JSON.stringify(value), Date.now());
  }
}
