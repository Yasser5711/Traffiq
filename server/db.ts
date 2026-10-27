import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { eq } from 'drizzle-orm';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { config } from './config';
import * as schema from './schema';

mkdirSync(dirname(config.dbPath), { recursive: true });

const sqlite = new Database(config.dbPath, { create: true });
sqlite.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;');

export const db = drizzle(sqlite, { schema });

migrate(db, { migrationsFolder: resolve(import.meta.dir, '../drizzle') });

export function setting(key: string, fallback: string): string {
  return db.select({ value: schema.settings.value }).from(schema.settings).where(eq(schema.settings.key, key)).get()?.value ?? fallback;
}

export function setSetting(key: string, value: string) {
  db.insert(schema.settings).values({ key, value }).onConflictDoUpdate({ target: schema.settings.key, set: { value } }).run();
}
