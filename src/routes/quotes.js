import express from 'express';
import { pool } from '../../server.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.use(requireAuth);

// LIST CALCULATOR QUOTES
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM calculator_quotes ORDER BY created_at DESC`
    );
    res.json(result.rows);
  } catch (error) {
    console.error('List quotes error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET SINGLE QUOTE
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM calculator_quotes WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Quote not found' });
    }
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Get quote error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// UPDATE STATUS / NOTES
router.put('/:id', async (req, res) => {
  try {
    const { status, customer_notes } = req.body;
    if (!status && customer_notes === undefined) {
      return res.status(400).json({ error: 'status or customer_notes is required' });
    }

    const result = await pool.query(
      `UPDATE calculator_quotes SET
        status = COALESCE($1, status),
        customer_notes = COALESCE($2, customer_notes)
       WHERE id = $3 RETURNING *`,
      [status, customer_notes, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Quote not found' });
    }
    res.json({ success: true, message: 'Quote updated', quote: result.rows[0] });
  } catch (error) {
    console.error('Update quote error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE
router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM calculator_quotes WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Quote not found' });
    }
    res.json({ success: true, message: 'Quote deleted' });
  } catch (error) {
    console.error('Delete quote error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
