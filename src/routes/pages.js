import express from 'express';
import { pool } from '../../server.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.use(requireAuth);

// LIST PAGES (summary fields, for the sidebar list)
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, slug, title, status, page_order, parent_id, is_home_page, updated_at
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
  const client = await pool.connect();
  try {
    const {
      name, slug, title, description,
      header_content, footer_content, page_content,
      meta_keywords, meta_description, status, parent_id, page_order, visibility,
      featured_image, is_home_page
    } = req.body;

    // parent_id is nullable and needs to distinguish "omitted" (keep existing)
    // from "explicitly cleared" (set to NULL) — a plain COALESCE can't express that
    // for a value whose valid states include NULL itself.
    let parentIdParam;
    if (parent_id === undefined) {
      parentIdParam = null;
    } else if (parent_id === null || parent_id === '') {
      parentIdParam = '';
    } else {
      parentIdParam = String(parent_id);
    }

    let featuredImageParam;
    if (featured_image === undefined) {
      featuredImageParam = null;
    } else if (featured_image === null || featured_image === '') {
      featuredImageParam = '';
    } else {
      featuredImageParam = String(featured_image);
    }

    await client.query('BEGIN');

    // Only one page can be the home page — clear any existing holder first
    // (the partial unique index would otherwise reject this update).
    if (is_home_page === true) {
      await client.query('UPDATE pages SET is_home_page = false WHERE is_home_page = true AND id != $1', [req.params.id]);
    }

    const result = await client.query(
      `UPDATE pages SET
        name = COALESCE($1, name),
        slug = COALESCE($2, slug),
        title = COALESCE($3, title),
        description = COALESCE($4, description),
        header_content = COALESCE($5, header_content),
        footer_content = COALESCE($6, footer_content),
        page_content = COALESCE($7, page_content),
        meta_keywords = COALESCE($8, meta_keywords),
        meta_description = COALESCE($9, meta_description),
        status = COALESCE($10, status),
        parent_id = CASE WHEN $11::text IS NULL THEN parent_id ELSE NULLIF($11, '')::int END,
        page_order = COALESCE($12, page_order),
        visibility = COALESCE($13, visibility),
        featured_image = CASE WHEN $14::text IS NULL THEN featured_image ELSE NULLIF($14, '')::int END,
        is_home_page = COALESCE($15, is_home_page),
        published_at = CASE WHEN COALESCE($10, status) = 'published' THEN COALESCE(published_at, CURRENT_TIMESTAMP) ELSE published_at END,
        last_edited_by = $16,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $17 RETURNING *`,
      [
        name, slug, title, description,
        header_content, footer_content, page_content,
        meta_keywords, meta_description, status,
        parentIdParam,
        page_order, visibility,
        featuredImageParam, is_home_page,
        req.user.id, req.params.id
      ]
    );

    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Page not found' });
    }

    await client.query('COMMIT');
    res.json({ success: true, message: 'Page updated successfully', page: result.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') {
      return res.status(409).json({ error: 'A page with that slug already exists' });
    }
    console.error('Update page error:', error);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
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

// ---------- PAGE SECTIONS (nested under a page) ----------

// LIST SECTIONS FOR A PAGE
router.get('/:id/sections', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM page_sections WHERE page_id = $1 ORDER BY section_order ASC, id ASC',
      [req.params.id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('List sections error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ADD SECTION TO A PAGE
router.post('/:id/sections', async (req, res) => {
  try {
    const { section_type, section_title, section_content, background_color, text_color, image_id, json_data, section_order } = req.body;
    if (!section_type) {
      return res.status(400).json({ error: 'section_type is required' });
    }

    let order = section_order;
    if (order === undefined || order === null) {
      const maxResult = await pool.query(
        'SELECT COALESCE(MAX(section_order), -1) + 1 AS next FROM page_sections WHERE page_id = $1',
        [req.params.id]
      );
      order = maxResult.rows[0].next;
    }

    const result = await pool.query(
      `INSERT INTO page_sections (page_id, section_type, section_title, section_content, section_order, background_color, text_color, image_id, json_data)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [req.params.id, section_type, section_title || null, section_content || null, order,
       background_color || null, text_color || null, image_id || null, json_data || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Add section error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
