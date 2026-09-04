import bcrypt from 'bcryptjs';
import { pool } from './server.js';
import dotenv from 'dotenv';

dotenv.config();

async function setupAdminUsers() {
  try {
    console.log('🔐 Hashing admin passwords...');

    // Hash passwords
    const adminPassword = await bcrypt.hash('Pinnacle123!', 10);
    const managerPassword = await bcrypt.hash('Manager123!', 10);

    console.log('✅ Passwords hashed');
    console.log('📝 Creating default admin accounts...\n');

    // Insert admin users
    await pool.query(
      'INSERT INTO admin_users (email, password, name, role) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
      ['admin@pinnaclebuild.com', adminPassword, 'Pinnacle Admin', 'owner']
    );

    await pool.query(
      'INSERT INTO admin_users (email, password, name, role) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
      ['manager@pinnaclebuild.com', managerPassword, 'Manager', 'manager']
    );

    console.log('✅ Admin accounts created successfully!\n');
    console.log('═══════════════════════════════════════════');
    console.log('ADMIN CREDENTIALS');
    console.log('═══════════════════════════════════════════');
    console.log('\n🔓 OWNER ACCOUNT:');
    console.log('   Email:    admin@pinnaclebuild.com');
    console.log('   Password: Pinnacle123!');
    console.log('   Role:     owner (Full Access)\n');
    console.log('🔓 MANAGER ACCOUNT:');
    console.log('   Email:    manager@pinnaclebuild.com');
    console.log('   Password: Manager123!');
    console.log('   Role:     manager (Limited Access)\n');
    console.log('═══════════════════════════════════════════');
    console.log('\n⚠️  IMPORTANT:');
    console.log('   1. Save these credentials securely');
    console.log('   2. Change passwords after first login');
    console.log('   3. Never share credentials');
    console.log('   4. Use HTTPS in production\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error setting up admin users:', error);
    process.exit(1);
  }
}

setupAdminUsers();
