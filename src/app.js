import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import authRoutes from './routes/auth.js';
import pagesRoutes from './routes/pages.js';
import menusRoutes from './routes/menus.js';
import contactsRoutes from './routes/contacts.js';
import quotesRoutes from './routes/quotes.js';
import mediaRoutes from './routes/media.js';
import settingsRoutes from './routes/settings.js';
import sectionsRoutes from './routes/sections.js';
import publicRoutes from './routes/public.js';
import { pool } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Middleware
// CORS_ORIGIN may list multiple comma-separated origins (production site,
// staging, etc). Localhost is always allowed too, for local frontend dev
// against this API - every route here is either public read-only content
// or protected by a JWT bearer token, never cookies, so a permissive origin
// list carries no CSRF risk.
const allowedOrigins = (process.env.CORS_ORIGIN || '').split(',').map(o => o.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin) || /^https?:\/\/localhost(:\d+)?$/.test(origin)) {
      return callback(null, true);
    }
    callback(null, false);
  }
}));
app.use(express.json());
// Absolute path, not a bare 'public' string — process.cwd() is unreliable
// inside a serverless function's runtime and silently resolves to the
// wrong directory there, even though a relative path works fine locally.
app.use(express.static(path.join(__dirname, '../public')));

// One-time connectivity check per cold start — cheap, and surfaces bad
// DATABASE_URL/POSTGRES_URL config immediately in the function logs.
pool.query('SELECT NOW()', (err, result) => {
  if (err) {
    console.error('Database connection error:', err);
  } else {
    console.log('✅ Database connected at', result.rows[0].now);
  }
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/pages', pagesRoutes);
app.use('/api/menus', menusRoutes);
app.use('/api/contacts', contactsRoutes);
app.use('/api/quotes', quotesRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/sections', sectionsRoutes);
app.use('/api/public', publicRoutes);

// Redirect root to login
app.get('/', (req, res) => {
  res.redirect('/login.html');
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

export default app;
