import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Vercel Postgres injects POSTGRES_URL (pooled, via PgBouncer) automatically
// when the store is linked to the project. DATABASE_URL is the local-dev /
// Render-style var name. A small max pool size matters on serverless — every
// concurrent function instance gets its own pool, so a large `max` here can
// exhaust the database's real connection limit under load.
const connectionString =
  process.env.POSTGRES_URL || process.env.DATABASE_URL || 'postgresql://localhost:5432/pinnacle_admin';

export const pool = new Pool({
  connectionString,
  max: process.env.VERCEL ? 1 : 10,
});
