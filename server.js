import dotenv from 'dotenv';
dotenv.config();

import app from './src/app.js';

// Local dev / any host that runs a long-lived process (not used on Vercel —
// see api/index.js, which exports the same app for the serverless runtime).
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`\n🚀 Pinnacle Admin Backend running on http://localhost:${PORT}`);
  console.log(`📝 Login page: http://localhost:${PORT}/login.html`);
  console.log(`\nTest credentials:`);
  console.log(`   Email: admin@pinnaclebuild.com`);
  console.log(`   Password: Pinnacle123!\n`);
});
