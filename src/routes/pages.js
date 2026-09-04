import express from 'express';
import { pool } from '../../server.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.use(requireAuth);

// LIST PAGES (summary fields, for the sidebar list)
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, slug, title, status, page_order, parent_id, updated_at
       FROM pages ORDER BY page_order ASC, created_at ASC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('List pages error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET SINGLE PAGE (full content)
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM pages WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Page not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get page error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// CREATE PAGE
router.post('/', async (req, res) => {
  try {
    const { name, slug, title, status } = req.body;

    if (!name || !slug) {
      return res.status(400).json({ error: 'Name and slug are required' });
    }

    const result = await pool.query(
      `INSERT INTO pages (name, slug, title, status, created_by, last_edited_by)
       VALUES ($1, $2, $3, $4, $5, $5) RETURNING *`,
      [name, slug, title || name, status || 'draft', req.user.id]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'A page with that slug already exists' });
    }
    console.error('Create page error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// UPDATE PAGE (content, header, footer, settings — all via one endpoint)
router.put('/:id', async (req, res) => {
  try {
    const {
      name, slug, title, description,
      header_content, footer_content, page_content,
      meta_keywords, status, parent_id, page_order, visibility
    } = req.body;

    // parent_id is nullable and needs to distinguish "omitted" (keep existing)
    // from "explicitly cleared" (set to NULL) — a plain COALESCE can't express that
    // for a value whose valid states include NULL itself.
    let parentIdParam;
    if (parent_id === undefined) {
      parentIdParam = null; // omitted -> CASE branch below keeps existing value
    } else if (parent_id === null || parent_id === '') {
      parentIdParam = ''; // explicit clear -> NULLIF makes this a true SQL NULL
    } else {
      parentIdParam = String(parent_id);
    }

    const result = await pool.query(
      `UPDATE pages SET
        name = COALESCE($1, name),
        slug = COALESCE($2, slug),
        title = COALESCE($3, title),
        description = COALESCE($4, description),
        header_content = COALESCE($5, header_content),
        footer_content = COALESCE($6, footer_content),
        page_content = COALESCE($7, page_content),
        meta_keywords = COALESCE($8, meta_keywords),
        status = COALESCE($9, status),
        parent_id = CASE WHEN $10::text IS NULL THEN parent_id ELSE NULLIF($10, '')::int END,
        page_order = COALESCE($11, page_order),
        visibility = COALESCE($12, visibility),
        last_edited_by = $13,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $14 RETURNING *`,
      [
        name, slug, title, description,
        header_content, footer_content, page_content,
        meta_keywords, status,
        parentIdParam,
        page_order, visibility,
        req.user.id, req.params.id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Page not found' });
    }

    res.json({ success: true, message: 'Page updated successfully', page: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'A page with that slug already exists' });
    }
    console.error('Update page error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// DUPLICATE PAGE
router.post('/:id/duplicate', async (req, res) => {
  try {
    const source = await pool.query('SELECT * FROM pages WHERE id = $1', [req.params.id]);
    if (source.rows.length === 0) {
      return res.status(404).json({ error: 'Page not found' });
    }
    const p = source.rows[0];

    let newSlug = `${p.slug}-copy`;
    let suffix = 2;
    while (true) {
      const clash = await pool.query('SELECT id FROM pages WHERE slug = $1', [newSlug]);
      if (clash.rows.length === 0) break;
      newSlug = `${p.slug}-copy-${suffix++}`;
    }

    const result = await pool.query(
      `INSERT INTO pages
        (name, slug, title, description, header_content, footer_content, page_content,
         meta_keywords, status, parent_id, page_order, visibility, created_by, last_edited_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'draft',$9,$10,$11,$12,$12) RETURNING *`,
      [
        `${p.name}-Copy`, newSlug, p.title, p.description, p.header_content,
        p.footer_content, p.page_content, p.meta_keywords, p.parent_id,
        p.page_order, p.visibility, req.user.id
      ]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Duplicate page error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE PAGE
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM pages WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Page not found' });
    }
    res.json({ success: true, message: 'Page deleted' });
  } catch (error) {
    console.error('Delete page error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
