-- Pinnacle Admin Panel Database Setup
-- Run this SQL file to initialize the database

-- Create admin_users table
CREATE TABLE IF NOT EXISTS admin_users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'manager',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login TIMESTAMP,
  is_active BOOLEAN DEFAULT true
);

-- Create login_logs table
CREATE TABLE IF NOT EXISTS login_logs (
  id SERIAL PRIMARY KEY,
  admin_id INTEGER REFERENCES admin_users(id),
  login_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ip_address VARCHAR(50),
  status VARCHAR(50)
);

-- Create contact_inquiries table (for Phase 2)
CREATE TABLE IF NOT EXISTS contact_inquiries (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  project_type VARCHAR(100),
  message TEXT,
  received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(50) DEFAULT 'new'
);

-- Create calculator_quotes table (for Phase 2)
CREATE TABLE IF NOT EXISTS calculator_quotes (
  id SERIAL PRIMARY KEY,
  project_type VARCHAR(100),
  project_scope VARCHAR(100),
  finish_level VARCHAR(50),
  bathrooms INTEGER,
  kitchens INTEGER,
  condition VARCHAR(50),
  services JSONB,
  estimated_low DECIMAL(10, 2),
  estimated_high DECIMAL(10, 2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  customer_email VARCHAR(255)
);

-- Insert default admin users (passwords should be hashed)
-- NOTE: Before inserting, hash these passwords using bcryptjs in your application:
-- 1. Pinnacle123! (admin account)
-- 2. Manager123! (manager account)
--
-- Example hashed passwords (generated with bcryptjs):
-- admin: $2a$10$YourHashedPasswordHere
-- manager: $2a$10$YourHashedPasswordHere
--
-- For now, leave this commented and run the setup script that hashes the passwords

-- INSERT INTO admin_users (email, password, name, role) VALUES
-- ('admin@pinnaclebuild.com', '$2a$10$hashedpassword1', 'Pinnacle Admin', 'owner'),
-- ('manager@pinnaclebuild.com', '$2a$10$hashedpassword2', 'Manager', 'manager');

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users(email);
CREATE INDEX IF NOT EXISTS idx_contact_inquiries_email ON contact_inquiries(email);
CREATE INDEX IF NOT EXISTS idx_calculator_quotes_email ON calculator_quotes(customer_email);
CREATE INDEX IF NOT EXISTS idx_contact_inquiries_status ON contact_inquiries(status);

-- Grant permissions (if using a separate database user)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON admin_users TO app_user;
-- GRANT SELECT, INSERT, UPDATE ON contact_inquiries TO app_user;
-- GRANT SELECT, INSERT ON calculator_quotes TO app_user;
-- GRANT SELECT, INSERT ON login_logs TO app_user;
