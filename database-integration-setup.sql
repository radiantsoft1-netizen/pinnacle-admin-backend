-- Website <-> Admin integration: media, settings, page sections, activity log,
-- plus extending the existing contact_inquiries / calculator_quotes tables.
-- Both tables are currently empty, so these ALTERs are additive/safe.

-- ===== MEDIA =====
CREATE TABLE IF NOT EXISTS media (
  id SERIAL PRIMARY KEY,
  filename VARCHAR(255) NOT NULL,
  file_url VARCHAR(500) NOT NULL,
  alt_text VARCHAR(255),
  description TEXT,
  file_type VARCHAR(50),
  file_size INTEGER,
  width INTEGER,
  height INTEGER,
  uploaded_by INTEGER REFERENCES admin_users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===== SITE SETTINGS (key/value) =====
CREATE TABLE IF NOT EXISTS site_settings (
  id SERIAL PRIMARY KEY,
  setting_key VARCHAR(255) UNIQUE NOT NULL,
  setting_value TEXT,
  description VARCHAR(500),
  setting_type VARCHAR(50) DEFAULT 'string',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===== PAGE SECTIONS (flexible content blocks) =====
CREATE TABLE IF NOT EXISTS page_sections (
  id SERIAL PRIMARY KEY,
  page_id INTEGER REFERENCES pages(id) ON DELETE CASCADE,
  section_type VARCHAR(100),
  section_title VARCHAR(255),
  section_content TEXT,
  section_order INTEGER DEFAULT 0,
  background_color VARCHAR(50),
  text_color VARCHAR(50),
  image_id INTEGER REFERENCES media(id) ON DELETE SET NULL,
  json_data JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===== ACTIVITY LOG =====
CREATE TABLE IF NOT EXISTS activity_logs (
  id SERIAL PRIMARY KEY,
  admin_id INTEGER REFERENCES admin_users(id),
  action VARCHAR(255),
  entity_type VARCHAR(100),
  entity_id INTEGER,
  changes JSONB,
  ip_address VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===== EXTEND contact_inquiries =====
ALTER TABLE contact_inquiries ADD COLUMN IF NOT EXISTS read_at TIMESTAMP;
ALTER TABLE contact_inquiries ADD COLUMN IF NOT EXISTS responded_at TIMESTAMP;
ALTER TABLE contact_inquiries ADD COLUMN IF NOT EXISTS admin_notes TEXT;

-- ===== EXTEND calculator_quotes =====
-- (existing estimated_low/estimated_high already cover the low/high range;
--  existing finish_level/condition already cover finish and condition level)
ALTER TABLE calculator_quotes ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'new';
ALTER TABLE calculator_quotes ADD COLUMN IF NOT EXISTS estimated_cost DECIMAL(10, 2);
ALTER TABLE calculator_quotes ADD COLUMN IF NOT EXISTS customer_name VARCHAR(255);
ALTER TABLE calculator_quotes ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(20);
ALTER TABLE calculator_quotes ADD COLUMN IF NOT EXISTS customer_notes TEXT;

-- ===== EXTEND menus (already exists from the Phase 2 CMS build) =====
ALTER TABLE menus ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'published';

-- ===== EXTEND pages (already exists from the Phase 2 CMS build) with the
-- fields the public site needs that weren't part of the original CMS schema =====
ALTER TABLE pages ADD COLUMN IF NOT EXISTS meta_description VARCHAR(500);
ALTER TABLE pages ADD COLUMN IF NOT EXISTS featured_image INTEGER REFERENCES media(id) ON DELETE SET NULL;
ALTER TABLE pages ADD COLUMN IF NOT EXISTS is_home_page BOOLEAN DEFAULT false;
ALTER TABLE pages ADD COLUMN IF NOT EXISTS published_at TIMESTAMP;
CREATE UNIQUE INDEX IF NOT EXISTS idx_pages_one_home ON pages(is_home_page) WHERE is_home_page = true;

CREATE INDEX IF NOT EXISTS idx_page_sections_page_id ON page_sections(page_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_admin_id ON activity_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_entity ON activity_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_calculator_quotes_status ON calculator_quotes(status);
