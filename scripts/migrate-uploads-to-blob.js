/**
 * One-time migration: uploads every local file in public/uploads/ to Vercel
 * Blob storage and repoints the matching `media` row's file_url at the new
 * Blob URL. Fixes the 40 images that 404 in production because they only
 * ever existed on local disk (never committed to git) and a git-triggered
 * deploy doesn't include them.
 *
 * Usage: node scripts/migrate-uploads-to-blob.js
 * Requires BLOB_READ_WRITE_TOKEN and POSTGRES_URL / POSTGRES_URL_NON_POOLING
 * in the environment (see /tmp/prod-env-check.txt pulled via `vercel env pull`).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { put } from '@vercel/blob';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, '../public/uploads');

const pool = new pg.Pool({
  connectionString: process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
});

const MIME_BY_EXT = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
};

async function main() {
  const files = fs.readdirSync(uploadsDir).filter((f) => f !== '.gitkeep');
  console.log(`Found ${files.length} local files to migrate.\n`);

  const { rows: mediaRows } = await pool.query(
    `SELECT id, filename, file_url FROM media WHERE file_url LIKE '/uploads/%'`
  );
  console.log(`Found ${mediaRows.length} media rows pointing at /uploads/.\n`);

  let migrated = 0, skipped = 0, unmatched = [];

  for (const file of files) {
    const localPath = path.join(uploadsDir, file);
    const row = mediaRows.find((m) => m.file_url === `/uploads/${file}`);
    if (!row) {
      unmatched.push(file);
      continue;
    }

    const ext = path.extname(file).toLowerCase();
    const contentType = MIME_BY_EXT[ext] || 'application/octet-stream';
    const buffer = fs.readFileSync(localPath);

    const blob = await put(`uploads/${file}`, buffer, {
      access: 'public',
      contentType,
      addRandomSuffix: false,
    });

    await pool.query('UPDATE media SET file_url = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [blob.url, row.id]);
    console.log(`✓ ${file} -> ${blob.url}`);
    migrated++;
  }

  console.log(`\nMigrated: ${migrated}`);
  console.log(`Media rows with no matching local file: ${skipped}`);
  if (unmatched.length) {
    console.log(`Local files with no matching media row (uploaded but not linked to a row):`);
    unmatched.forEach((f) => console.log(`  - ${f}`));
  }

  await pool.end();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
