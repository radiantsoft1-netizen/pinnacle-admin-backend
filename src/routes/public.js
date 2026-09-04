import express from 'express';
import { pool } from '../../server.js';

const router = express.Router();

// No requireAuth on this router — everything here is meant for anonymous
// website visitors. Never expose draft/unpublished content or admin fields.

// ---------- PAGES ----------

router.get('/pages', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, title, slug, meta_description, is_home_page, updated_at
       FROM pages WHERE status = 'published' ORDER BY page_order ASC, created_at ASC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Public list pages error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/pages/:slug', async (req, res) => {
  try {
    const pageResult = await pool.query(
      `SELECT * FROM pages WHERE slug = $1 AND status = 'published'`,
      [req.params.slug]
    );
    if (pageResult.rows.length === 0) {
      return res.status(404).json({ error: 'Page not found' });
    }
    const page = pageResult.rows[0];

    const sectionsResult = await pool.query(
      `SELECT ps.*, m.file_url AS image_url, m.alt_text AS image_alt
       FROM page_sections ps LEFT JOIN media m ON m.id = ps.image_id
       WHERE ps.page_id = $1 ORDER BY ps.section_order ASC, ps.id ASC`,
      [page.id]
    );

    let featuredImageUrl = null;
    if (page.featured_image) {
      const img = await pool.query('SELECT file_url FROM media WHERE id = $1', [page.featured_image]);
      featuredImageUrl = img.rows[0]?.file_url || null;
    }

    res.json({
      id: page.id,
      name: page.name,
      title: page.title,
      slug: page.slug,
      meta_description: page.meta_description,
      meta_keywords: page.meta_keywords,
      page_content: page.page_content,
      header_content: page.header_content,
      footer_content: page.footer_content,
      featured_image: featuredImageUrl,
      is_home_page: page.is_home_page,
      updated_at: page.updated_at,
      sections: sectionsResult.rows
    });
  } catch (error) {
    console.error('Public get page error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/pages/:slug/sections', async (req, res) => {
  try {
    const pageResult = await pool.query(
      `SELECT id FROM pages WHERE slug = $1 AND status = 'published'`,
      [req.params.slug]
    );
    if (pageResult.rows.length === 0) {
      return res.status(404).json({ error: 'Page not found' });
    }

    const result = await pool.query(
      `SELECT ps.*, m.file_url AS image_url, m.alt_text AS image_alt
       FROM page_sections ps LEFT JOIN media m ON m.id = ps.image_id
       WHERE ps.page_id = $1 ORDER BY ps.section_order ASC, ps.id ASC`,
      [pageResult.rows[0].id]
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Public get sections error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------- MENUS ----------

router.get('/menus/:location', async (req, res) => {
  try {
    const menuResult = await pool.query(
      `SELECT * FROM menus WHERE location = $1 AND status = 'published' ORDER BY id ASC LIMIT 1`,
      [req.params.location]
    );
    if (menuResult.rows.length === 0) {
      return res.json([]); // no menu configured for this location yet — empty nav, not an error
    }

    const itemsResult = await pool.query(
      `SELECT * FROM menu_items WHERE menu_id = $1 AND is_active = true ORDER BY order_position ASC, id ASC`,
      [menuResult.rows[0].id]
    );

    const items = itemsResult.rows;
    const byId = {};
    items.forEach(i => { byId[i.id] = { id: i.id, label: i.label, url: i.url, icon: i.icon, children: [] }; });
    const tree = [];
    items.forEach(i => {
      if (i.parent_id && byId[i.parent_id]) {
        byId[i.parent_id].children.push(byId[i.id]);
      } else {
        tree.push(byId[i.id]);
      }
    });

    res.json(tree);
  } catch (error) {
    console.error('Public get menu error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------- SETTINGS ----------

router.get('/settings', async (req, res) => {
  try {
    const result = await pool.query('SELECT setting_key, setting_value FROM site_settings');
    const map = {};
    result.rows.forEach(row => { map[row.setting_key] = row.setting_value; });
    res.json(map);
  } catch (error) {
    console.error('Public get settings error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------- MEDIA ----------

router.get('/media', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, file_url, alt_text, description, width, height FROM media ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (error) {
    console.error('Public list media error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/media/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, file_url, alt_text, description, width, height FROM media WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Media not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Public get media error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------- FORMS ----------

router.post('/contact', async (req, res) => {
  try {
    const { name, email, phone, message, project_type } = req.body;
    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }

    const result = await pool.query(
      `INSERT INTO contact_inquiries (name, email, phone, project_type, message)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [name, email, phone || null, project_type || null, message || null]
    );

    res.status(201).json({ success: true, message_id: result.rows[0].id });
  } catch (error) {
    console.error('Public contact submit error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/calculator-quote', async (req, res) => {
  try {
    const {
      project_type, project_scope, finish_level, condition, bathrooms, kitchens, services,
      estimated_low, estimated_high, customer_name, customer_email, customer_phone
    } = req.body;

    if (!customer_email) {
      return res.status(400).json({ error: 'customer_email is required' });
    }

    const result = await pool.query(
      `INSERT INTO calculator_quotes
        (project_type, project_scope, finish_level, condition, bathrooms, kitchens, services,
         estimated_low, estimated_high, customer_name, customer_email, customer_phone)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id, estimated_low, estimated_high`,
      [
        project_type || null, project_scope || null, finish_level || null, condition || null,
        bathrooms || null, kitchens || null, services ? JSON.stringify(services) : null,
        estimated_low || null, estimated_high || null,
        customer_name || null, customer_email, customer_phone || null
      ]
    );

    const row = result.rows[0];
    res.status(201).json({
      quote_id: row.id,
      estimate: row.estimated_low && row.estimated_high
        ? Math.round((Number(row.estimated_low) + Number(row.estimated_high)) / 2)
        : null,
      range_low: row.estimated_low,
      range_high: row.estimated_high
    });
  } catch (error) {
    console.error('Public calculator-quote submit error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
