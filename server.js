import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import { Pool } from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import authRoutes from './src/routes/auth.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Database Connection
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/pinnacle_admin'
});

// Test database connection
pool.query('SELECT NOW()', (err, result) => {
  if (err) {
    console.error('Database connection error:', err);
  } else {
    console.log('✅ Database connected at', result.rows[0].now);
  }
});

// API Routes
app.use('/api/auth', authRoutes);

// Redirect root to login
app.get('/', (req, res) => {
  res.redirect('/login.html');
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`\n🚀 Pinnacle Admin Backend running on http://localhost:${PORT}`);
  console.log(`📝 Login page: http://localhost:${PORT}/login.html`);
  console.log(`\nTest credentials:`);
  console.log(`   Email: admin@pinnaclebuild.com`);
  console.log(`   Password: Pinnacle123!\n`);
});
