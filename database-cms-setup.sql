-- Phase 2: CMS tables (Pages + Menus)

CREATE TABLE IF NOT EXISTS pages (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  title VARCHAR(500),
  description TEXT,
  header_content TEXT,
  footer_content TEXT,
  page_content TEXT,
  meta_keywords TEXT,
  status VARCHAR(50) DEFAULT 'draft',
  parent_id INTEGER REFERENCES pages(id) ON DELETE SET NULL,
  page_order INTEGER DEFAULT 0,
  visibility VARCHAR(50) DEFAULT 'public',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER REFERENCES admin_users(id),
  last_edited_by INTEGER REFERENCES admin_users(id)
);

CREATE TABLE IF NOT EXISTS menus (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255),
  location VARCHAR(50),
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS menu_items (
  id SERIAL PRIMARY KEY,
  menu_id INTEGER REFERENCES menus(id) ON DELETE CASCADE,
  label VARCHAR(255) NOT NULL,
  url VARCHAR(500),
  icon VARCHAR(50),
  order_position INTEGER DEFAULT 0,
  parent_id INTEGER REFERENCES menu_items(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pages_status ON pages(status);
CREATE INDEX IF NOT EXISTS idx_pages_slug ON pages(slug);
CREATE INDEX IF NOT EXISTS idx_menus_location ON menus(location);
CREATE INDEX IF NOT EXISTS idx_menu_items_menu_id ON menu_items(menu_id);
CREATE INDEX IF NOT EXISTS idx_menu_items_parent_id ON menu_items(parent_id);
