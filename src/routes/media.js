import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { pool } from '../../server.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, '../../public/uploads');

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']);
const MAX_FILE_SIZE = 8 * 1024 * 1024; // 8MB

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const base = path.basename(file.originalname, ext)
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'file';
    cb(null, `${Date.now()}-${base}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_TYPES.has(file.mimetype)) {
      return cb(new Error('Only image files (jpg, png, gif, webp, svg) are allowed'));
    }
    cb(null, true);
  }
});

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

    try {
      const fileUrl = `/uploads/${req.file.filename}`;
      const result = await pool.query(
        `INSERT INTO media (filename, file_url, alt_text, file_type, file_size, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [req.file.originalname, fileUrl, req.body.alt_text || '', req.file.mimetype, req.file.size, req.user.id]
      );
      res.status(201).json(result.rows[0]);
    } catch (error) {
      console.error('Upload save error:', error);
      // Clean up the orphaned file if the DB insert failed
      fs.unlink(req.file.path, () => {});
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

    const filePath = path.join(uploadsDir, path.basename(mediaResult.rows[0].file_url));
    fs.unlink(filePath, () => {}); // best-effort; DB row is already the source of truth

    res.json({ success: true, message: 'Media deleted' });
  } catch (error) {
    console.error('Delete media error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
