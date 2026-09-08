import express from 'express';
import multer from 'multer';
import path from 'path';
import { put, del } from '@vercel/blob';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'application/pdf']);
const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15MB (PDFs run larger than the site's images)

// Files are held in memory just long enough to stream to Vercel Blob -
// Vercel's serverless functions have a read-only filesystem, so nothing
// can be written to disk at runtime.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_TYPES.has(file.mimetype)) {
      return cb(new Error('Only image files (jpg, png, gif, webp, svg) or PDFs are allowed'));
    }
    cb(null, true);
  }
});

// The Content-Type header multer's fileFilter sees is whatever the client
// claims - trivially spoofable (confirmed: a plain-text file named
// "malicious.exe" with Content-Type set to "image/jpeg" was accepted before
// this check existed). This verifies the actual file bytes instead. Runs
// after multer buffers the upload, since memoryStorage's fileFilter fires
// before the body is available to inspect.
function detectRealFileType(buffer) {
  if (!buffer || buffer.length < 12) return null;

  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.slice(0, 4).toString('ascii') === 'GIF8') return 'image/gif';
  if (buffer.slice(0, 4).toString('ascii') === 'RIFF' && buffer.slice(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (buffer.slice(0, 4).toString('ascii') === '%PDF') return 'application/pdf';

  // SVG is plain-text XML, not a fixed binary signature - look for the
  // opening tag within the first chunk (allowing a leading XML/BOM prolog).
  const head = buffer.slice(0, 512).toString('utf8').trimStart().toLowerCase();
  if (head.startsWith('<?xml') || head.startsWith('<svg')) {
    if (head.includes('<svg')) return 'image/svg+xml';
  }

  return null;
}

// A real file's detected type doesn't have to match the client's claimed
// mimetype exactly (e.g. some tools mislabel webp as octet-stream) - it
// just has to be ONE of the allowed real types. Rejects anything whose
// actual bytes aren't a recognized image/PDF signature, regardless of what
// the request claimed.
function isAllowedRealFile(buffer) {
  const real = detectRealFileType(buffer);
  return real !== null && ALLOWED_TYPES.has(real);
}

function blobPathname(originalname) {
  const ext = path.extname(originalname).toLowerCase();
  const base = path.basename(originalname, ext)
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'file';
  return `uploads/${Date.now()}-${base}${ext}`;
}

router.use(requireAuth);

// LIST MEDIA
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM media ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (error) {
    console.error('List media error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET SINGLE MEDIA ITEM
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM media WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Media not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get media error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// UPLOAD
router.post('/upload', (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const realType = detectRealFileType(req.file.buffer);
    if (!realType || !ALLOWED_TYPES.has(realType)) {
      return res.status(400).json({ error: 'File content does not match an allowed image or PDF type. The upload was rejected.' });
    }

    let blob;
    try {
      blob = await put(blobPathname(req.file.originalname), req.file.buffer, {
        access: 'public',
        contentType: realType,
      });

      const result = await pool.query(
        `INSERT INTO media (filename, file_url, alt_text, file_type, file_size, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [req.file.originalname, blob.url, req.body.alt_text || '', realType, req.file.size, req.user.id]
      );
      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error('Upload save error:', error);
      // Clean up the orphaned blob if the DB insert failed
      if (blob) del(blob.url).catch(() => {});
      res.status(500).json({ error: 'Server error' });
    }
  });
});

// UPDATE METADATA (alt text / description)
router.put('/:id', async (req, res) => {
  try {
    const { alt_text, description } = req.body;
    const result = await pool.query(
      `UPDATE media SET
        alt_text = COALESCE($1, alt_text),
        description = COALESCE($2, description),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 RETURNING *`,
      [alt_text, description, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Media not found' });
    }
    res.json({ success: true, media: result.rows[0] });
  } catch (error) {
    console.error('Update media error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE (warns if in use via ?force=true gate)
router.delete('/:id', async (req, res) => {
  try {
    const mediaResult = await pool.query('SELECT * FROM media WHERE id = $1', [req.params.id]);
    if (mediaResult.rows.length === 0) {
      return res.status(404).json({ error: 'Media not found' });
    }

    const usage = await pool.query('SELECT id, page_id FROM page_sections WHERE image_id = $1', [req.params.id]);
    if (usage.rows.length > 0 && req.query.force !== 'true') {
      return res.status(409).json({
        error: 'This image is used in one or more page sections',
        usedIn: usage.rows,
        hint: 'Retry with ?force=true to delete anyway'
      });
    }

    await pool.query('DELETE FROM media WHERE id = $1', [req.params.id]);

    // Best-effort; DB row is already the source of truth. Only blob-hosted
    // files (https://...) can be removed this way - older migrated media
    // living under the deployed /uploads bundle can't be deleted at runtime.
    const fileUrl = mediaResult.rows[0].file_url;
    if (fileUrl && fileUrl.startsWith('http')) {
      del(fileUrl).catch(() => {});
    }

    res.json({ success: true, message: 'Media deleted' });
  } catch (error) {
    console.error('Delete media error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
