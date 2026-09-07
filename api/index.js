import app from '../src/app.js';

// Vercel's Node.js runtime invokes this default export as a plain
// (req, res) handler on every request — an Express app satisfies that
// signature directly, no adapter needed. See vercel.json for the
// catch-all rewrite that sends every path here.
export default app;
