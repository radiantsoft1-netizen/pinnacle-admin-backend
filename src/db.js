import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Vercel Postgres injects POSTGRES_URL (pooled, via PgBouncer) automatically
// when the store is linked to the project. DATABASE_URL is the local-dev /
// Render-style var name. A small max pool size matters on serverless — every
// concurrent function instance gets its own pool, so a large `max` here can
// exhaust the database's real connection limit under load.
//
// Tried swapping to @neondatabase/serverless's WebSocket-based Pool here,
// hypothesizing it would cut the ~350ms per-request cost seen on Vercel.
// Measured it head-to-head against plain `pg` (same warm process, repeat
// queries against the real Neon pooler) and it was worse, not better -
// ~250-280ms per query even on a long-lived warm connection, vs ~20ms for
// `pg`'s plain TCP connection reuse. Reverted. The ~350ms in production
// looks like irreducible network RTT for a fresh connection per invocation,
// not something either driver fixes from here.
const connectionString =
  process.env.POSTGRES_URL || process.env.DATABASE_URL || 'postgresql://localhost:5432/pinnacle_admin';

export const pool = new Pool({
  connectionString,
  max: process.env.VERCEL ? 1 : 10,
});
