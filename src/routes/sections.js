import express from 'express';
import { pool } from '../../server.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.use(requireAuth);

// GET SINGLE SECTION
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM page_sections WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Section not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get section error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// UPDATE SECTION
router.put('/:id', async (req, res) => {
  try {
    const { section_type, section_title, section_content, background_color, text_color, image_id, json_data, section_order } = req.body;

    let imageIdParam;
    if (image_id === undefined) {
      imageIdParam = null;
    } else if (image_id === null || image_id === '') {
      imageIdParam = '';
    } else {
      imageIdParam = String(image_id);
    }

    const result = await pool.query(
      `UPDATE page_sections SET
        section_type = COALESCE($1, section_type),
        section_title = COALESCE($2, section_title),
        section_content = COALESCE($3, section_content),
        background_color = COALESCE($4, background_color),
        text_color = COALESCE($5, text_color),
        image_id = CASE WHEN $6::text IS NULL THEN image_id ELSE NULLIF($6, '')::int END,
        json_data = COALESCE($7, json_data),
        section_order = COALESCE($8, section_order),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $9 RETURNING *`,
      [section_type, section_title, section_content, background_color, text_color, imageIdParam, json_data, section_order, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Section not found' });
    }
    res.json({ success: true, section: result.rows[0] });
  } catch (error) {
    console.error('Update section error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// REORDER SECTIONS (bulk: [{id, section_order}])
router.put('/reorder/bulk', async (req, res) => {
  const client = await pool.connect();
  try {
    const { sections } = req.body;
    if (!Array.isArray(sections)) {
      return res.status(400).json({ error: 'sections must be an array' });
    }

    await client.query('BEGIN');
    for (const s of sections) {
      await client.query('UPDATE page_sections SET section_order = $1 WHERE id = $2', [s.section_order, s.id]);
    }
    await client.query('COMMIT');

    res.json({ success: true, message: 'Order updated' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Reorder sections error:', error);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// DUPLICATE SECTION
router.post('/:id/duplicate', async (req, res) => {
  try {
    const source = await pool.query('SELECT * FROM page_sections WHERE id = $1', [req.params.id]);
    if (source.rows.length === 0) {
      return res.status(404).json({ error: 'Section not found' });
    }
    const s = source.rows[0];

    const maxResult = await pool.query(
      'SELECT COALESCE(MAX(section_order), -1) + 1 AS next FROM page_sections WHERE page_id = $1',
      [s.page_id]
    );

    const result = await pool.query(
      `INSERT INTO page_sections (page_id, section_type, section_title, section_content, section_order, background_color, text_color, image_id, json_data)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [s.page_id, s.section_type, s.section_title, s.section_content, maxResult.rows[0].next, s.background_color, s.text_color, s.image_id, s.json_data]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Duplicate section error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE SECTION
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM page_sections WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Section not found' });
    }
    res.json({ success: true, message: 'Section deleted' });
  } catch (error) {
    console.error('Delete section error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
