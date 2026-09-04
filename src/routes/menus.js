import express from 'express';
import { pool } from '../../server.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.use(requireAuth);

// LIST MENUS (with item counts)
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT m.id, m.name, m.slug, m.location, m.description, m.updated_at,
              COUNT(mi.id)::int AS item_count
       FROM menus m
       LEFT JOIN menu_items mi ON mi.menu_id = m.id
       GROUP BY m.id
       ORDER BY m.created_at ASC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('List menus error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET SINGLE MENU (with all items)
router.get('/:id', async (req, res) => {
  try {
    const menuResult = await pool.query('SELECT * FROM menus WHERE id = $1', [req.params.id]);
    if (menuResult.rows.length === 0) {
      return res.status(404).json({ error: 'Menu not found' });
    }

    const itemsResult = await pool.query(
      `SELECT * FROM menu_items WHERE menu_id = $1 ORDER BY order_position ASC, id ASC`,
      [req.params.id]
    );

    res.json({ ...menuResult.rows[0], items: itemsResult.rows });
  } catch (error) {
    console.error('Get menu error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// CREATE MENU
router.post('/', async (req, res) => {
  try {
    const { name, location, description } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Menu name is required' });
    }

    const slug = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    const result = await pool.query(
      `INSERT INTO menus (name, slug, location, description) VALUES ($1,$2,$3,$4) RETURNING *`,
      [name, slug, location || 'header', description || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create menu error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// UPDATE MENU (name/location/description)
router.put('/:id', async (req, res) => {
  try {
    const { name, location, description } = req.body;

    const result = await pool.query(
      `UPDATE menus SET
        name = COALESCE($1, name),
        location = COALESCE($2, location),
        description = COALESCE($3, description),
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $4 RETURNING *`,
      [name, location, description, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Menu not found' });
    }

    res.json({ success: true, message: 'Menu updated successfully', menu: result.rows[0] });
  } catch (error) {
    console.error('Update menu error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// DUPLICATE MENU (menu + all items)
router.post('/:id/duplicate', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const menuResult = await client.query('SELECT * FROM menus WHERE id = $1', [req.params.id]);
    if (menuResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Menu not found' });
    }
    const m = menuResult.rows[0];

    const newMenu = await client.query(
      `INSERT INTO menus (name, slug, location, description) VALUES ($1,$2,$3,$4) RETURNING *`,
      [`${m.name}-Copy`, `${m.slug}-copy-${Date.now()}`, m.location, m.description]
    );

    const items = await client.query(
      'SELECT * FROM menu_items WHERE menu_id = $1 ORDER BY order_position ASC, id ASC',
      [req.params.id]
    );

    // Map old item ids -> new item ids so parent_id relationships survive the copy
    const idMap = {};
    for (const item of items.rows) {
      const inserted = await client.query(
        `INSERT INTO menu_items (menu_id, label, url, icon, order_position, parent_id, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [
          newMenu.rows[0].id, item.label, item.url, item.icon, item.order_position,
          item.parent_id ? idMap[item.parent_id] || null : null, item.is_active
        ]
      );
      idMap[item.id] = inserted.rows[0].id;
    }

    await client.query('COMMIT');
    res.status(201).json(newMenu.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Duplicate menu error:', error);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// DELETE MENU (items cascade via FK)
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM menus WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Menu not found' });
    }
    res.json({ success: true, message: 'Menu deleted' });
  } catch (error) {
    console.error('Delete menu error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ADD MENU ITEM
router.post('/:id/items', async (req, res) => {
  try {
    const { label, url, icon, parent_id, order_position } = req.body;
    if (!label) {
      return res.status(400).json({ error: 'Item label is required' });
    }

    let order = order_position;
    if (order === undefined || order === null) {
      const maxResult = await pool.query(
        'SELECT COALESCE(MAX(order_position), 0) + 1 AS next FROM menu_items WHERE menu_id = $1',
        [req.params.id]
      );
      order = maxResult.rows[0].next;
    }

    const result = await pool.query(
      `INSERT INTO menu_items (menu_id, label, url, icon, order_position, parent_id)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.params.id, label, url || '/', icon || null, order, parent_id || null]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Add menu item error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// UPDATE MENU ITEM (label/url/icon/active — nesting changes go through the reorder endpoint)
router.put('/:id/items/:itemId', async (req, res) => {
  try {
    const { label, url, icon, is_active } = req.body;

    const result = await pool.query(
      `UPDATE menu_items SET
        label = COALESCE($1, label),
        url = COALESCE($2, url),
        icon = COALESCE($3, icon),
        is_active = COALESCE($4, is_active)
       WHERE id = $5 AND menu_id = $6 RETURNING *`,
      [label, url, icon, is_active, req.params.itemId, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Menu item not found' });
    }

    res.json({ success: true, item: result.rows[0] });
  } catch (error) {
    console.error('Update menu item error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// REORDER MENU ITEMS (bulk: [{id, order_position, parent_id}])
router.put('/:id/items-reorder', async (req, res) => {
  const client = await pool.connect();
  try {
    const { items } = req.body;
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'items must be an array' });
    }

    await client.query('BEGIN');
    for (const item of items) {
      await client.query(
        `UPDATE menu_items SET order_position = $1, parent_id = $2 WHERE id = $3 AND menu_id = $4`,
        [item.order_position, item.parent_id || null, item.id, req.params.id]
      );
    }
    await client.query('COMMIT');

    res.json({ success: true, message: 'Order updated' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Reorder menu items error:', error);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// DELETE MENU ITEM
router.delete('/:id/items/:itemId', async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM menu_items WHERE id = $1 AND menu_id = $2 RETURNING id',
      [req.params.itemId, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Menu item not found' });
    }
    res.json({ success: true, message: 'Item removed' });
  } catch (error) {
    console.error('Delete menu item error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
