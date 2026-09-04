import express from 'express';
import { pool } from '../../server.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.use(requireAuth);

// GET ALL SETTINGS (as a key -> value map, plus raw rows)
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM site_settings ORDER BY setting_key ASC');
    const map = {};
    result.rows.forEach(row => { map[row.setting_key] = row.setting_value; });
    res.json({ settings: map, rows: result.rows });
  } catch (error) {
    console.error('List settings error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// UPSERT ONE SETTING
router.put('/:key', async (req, res) => {
  try {
    const { value, description, setting_type } = req.body;
    if (value === undefined) {
      return res.status(400).json({ error: 'value is required' });
    }

    const result = await pool.query(
      `INSERT INTO site_settings (setting_key, setting_value, description, setting_type)
       VALUES ($1, $2, $3, COALESCE($4, 'string'))
       ON CONFLICT (setting_key) DO UPDATE SET
         setting_value = EXCLUDED.setting_value,
         description = COALESCE(EXCLUDED.description, site_settings.description),
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [req.params.key, String(value), description || null, setting_type]
    );

    res.json({ success: true, setting: result.rows[0] });
  } catch (error) {
    console.error('Update setting error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// BULK UPSERT (saves a whole settings form in one call)
router.put('/', async (req, res) => {
  const client = await pool.connect();
  try {
    const { settings } = req.body;
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ error: 'settings object is required' });
    }

    await client.query('BEGIN');
    for (const [key, value] of Object.entries(settings)) {
      await client.query(
        `INSERT INTO site_settings (setting_key, setting_value)
         VALUES ($1, $2)
         ON CONFLICT (setting_key) DO UPDATE SET
           setting_value = EXCLUDED.setting_value, updated_at = CURRENT_TIMESTAMP`,
        [key, String(value)]
      );
    }
    await client.query('COMMIT');

    res.json({ success: true, message: 'Settings saved' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Bulk update settings error:', error);
    res.status(500).json({ error: 'Server error' });
  } finally {
    client.release();
  }
});

// DELETE A SETTING
router.delete('/:key', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM site_settings WHERE setting_key = $1 RETURNING setting_key', [req.params.key]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Setting not found' });
    }
    res.json({ success: true, message: 'Setting deleted' });
  } catch (error) {
    console.error('Delete setting error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
