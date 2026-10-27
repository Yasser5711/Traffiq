import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './server/schema.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DB_PATH || './data/traffiq.db' },
});
