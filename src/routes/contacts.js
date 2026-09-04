import express from 'express';
import { pool } from '../../server.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.use(requireAuth);

// LIST CONTACT INQUIRIES
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM contact_inquiries ORDER BY received_at DESC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('List contacts error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET SINGLE INQUIRY
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM contact_inquiries WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Inquiry not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get contact error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// UPDATE STATUS / NOTES
// Setting status='read' stamps read_at (once); status='responded' stamps responded_at (once).
router.put('/:id', async (req, res) => {
  try {
    const { status, admin_notes } = req.body;
    if (!status && admin_notes === undefined) {
      return res.status(400).json({ error: 'status or admin_notes is required' });
    }

    const result = await pool.query(
      `UPDATE contact_inquiries SET
        status = COALESCE($1, status),
        admin_notes = COALESCE($2, admin_notes),
        read_at = CASE WHEN COALESCE($1, status) = 'read' THEN COALESCE(read_at, CURRENT_TIMESTAMP) ELSE read_at END,
        responded_at = CASE WHEN COALESCE($1, status) = 'responded' THEN COALESCE(responded_at, CURRENT_TIMESTAMP) ELSE responded_at END
       WHERE id = $3 RETURNING *`,
      [status, admin_notes, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Inquiry not found' });
    }

    res.json({ success: true, message: 'Inquiry updated', inquiry: result.rows[0] });
  } catch (error) {
    console.error('Update contact error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM contact_inquiries WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Inquiry not found' });
    }
    res.json({ success: true, message: 'Inquiry deleted' });
  } catch (error) {
    console.error('Delete contact error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
