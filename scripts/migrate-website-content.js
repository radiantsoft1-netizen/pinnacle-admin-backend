// One-time migration: import real content from /Users/radiant/pinnaclebuild
// into this admin panel's database. Run with: node scripts/migrate-website-content.js
//
// Idempotent-ish: uses ON CONFLICT / existing-row lookups where the schema
// allows it, so re-running won't blindly duplicate everything, but this is
// a migration script, not a general-purpose sync — expect to review output.

import { Pool } from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/pinnacle_admin'
});

const ADMIN_ID = 1; // admin@pinnaclebuild.com, confirmed via psql before running this
const UPLOADS_DIR = path.join(__dirname, '../public/uploads');

// ---------------------------------------------------------------------------
// Real image inventory: filename -> {width, height, size, ext}
// (gathered via `sips` against the actual files in pinnaclebuild/public,
// already copied into public/uploads by hand before running this script)
// ---------------------------------------------------------------------------
const IMAGE_META = {
  'logo.png': { w: 1024, h: 755, size: 463070 },
  'about-site.jpg': { w: 651, h: 789, size: 598688 },
  'basement-hero.jpg': { w: 1920, h: 1272, size: 647980 },
  'basement-intro.jpg': { w: 663, h: 482, size: 63192 },
  'bathroom-intro.jpg': { w: 1200, h: 800, size: 145669 },
  'cta-contractor-1181354.png': { w: 600, h: 900, size: 278015 },
  'cta-contractor-274130.png': { w: 600, h: 900, size: 266977 },
  'cta-contractor-test1.png': { w: 700, h: 467, size: 224355 },
  'cta-contractor-test2.png': { w: 700, h: 467, size: 212950 },
  'cta-contractor.jpg': { w: 640, h: 960, size: 69936 },
  'cta-contractor.png': { w: 600, h: 900, size: 266977 },
  'footer-consult-contractor.jpg': { w: 800, h: 1200, size: 88244 },
  'footer-consult-cta.png': { w: 1024, h: 431, size: 180091 },
  'footer-consult-mohan.png': { w: 375, h: 334, size: 19916 },
  'garden-suite-hero.jpg': { w: 1920, h: 1292, size: 383358 },
  'garden-suite-intro.jpg': { w: 1200, h: 800, size: 270663 },
  'legal-hero.jpg': { w: 1920, h: 1282, size: 254344 },
  'newsletter-banner-ref.png': { w: 1024, h: 258, size: 28548 },
  'newsletter-contractor.png': { w: 1024, h: 682, size: 350213 },
  'newsletter-figure-ref.png': { w: 389, h: 258, size: 66580 },
  'basements-bar.jpg': { w: 1200, h: 1800, size: 211294 },
  'basements-bedroom.jpg': { w: 800, h: 1200, size: 200101 },
  'basements-living-wide.jpg': { w: 1200, h: 1800, size: 211294 },
  'basements-theatre.jpg': { w: 800, h: 533, size: 53699 },
  'home-extension-exterior.jpg': { w: 800, h: 533, size: 90582 },
  'home-extension-family-room.jpg': { w: 800, h: 545, size: 104660 },
  'home-extension-open-plan.jpg': { w: 800, h: 533, size: 81325 },
  'home-extension-wide.jpg': { w: 1200, h: 796, size: 175069 },
  'hotels-exterior.jpg': { w: 1200, h: 800, size: 255162 },
  'hotels-guest-suite.jpg': { w: 800, h: 533, size: 93305 },
  'hotels-lobby.jpg': { w: 800, h: 533, size: 92140 },
  'hotels-restaurant.jpg': { w: 800, h: 600, size: 102928 },
  'kitchen-cabinetry.jpg': { w: 800, h: 533, size: 81700 },
  'kitchen-dining.jpg': { w: 800, h: 533, size: 91131 },
  'kitchen-island.jpg': { w: 800, h: 544, size: 90037 },
  'kitchen-wide.jpg': { w: 1200, h: 1800, size: 280390 },
  'sun-room-interior.jpg': { w: 800, h: 545, size: 104660 },
  'sun-room-patio.jpg': { w: 800, h: 531, size: 89828 },
  'sun-room-seating.jpg': { w: 800, h: 533, size: 79659 },
  'sun-room-wide.jpg': { w: 1200, h: 800, size: 160597 }
};

// Best available alt text per filename — filled in once the content-extraction
// pass (scripts/scratch/site-content-extract.json) is merged in below.
let ALT_TEXT = {};

async function run() {
  const client = await pool.connect();
  try {
    console.log('🔎 Verifying admin user id...');
    const adminCheck = await client.query('SELECT id FROM admin_users WHERE id = $1', [ADMIN_ID]);
    if (adminCheck.rows.length === 0) throw new Error(`Admin user id ${ADMIN_ID} not found — check ADMIN_ID`);

    // Load the content-extraction agent's output if present
    const extractPath = path.join(__dirname, 'scratch/site-content-extract.json');
    let pagesExtract = [];
    if (fs.existsSync(extractPath)) {
      pagesExtract = JSON.parse(fs.readFileSync(extractPath, 'utf8'));
      console.log(`📄 Loaded ${pagesExtract.length} extracted pages from site-content-extract.json`);
      pagesExtract.forEach(p => {
        (p.images || []).forEach(img => {
          const fname = path.basename(img.src);
          if (img.alt && !ALT_TEXT[fname]) ALT_TEXT[fname] = img.alt;
        });
      });
    } else {
      console.warn('⚠️  No site-content-extract.json found yet — media will be inserted with filename-derived alt text; re-run after extraction completes to backfill real alt text.');
    }

    // ---------------- MEDIA ----------------
    console.log('\n📸 Inserting media records...');
    const mediaIdByFilename = {};
    for (const [filename, meta] of Object.entries(IMAGE_META)) {
      const ext = path.extname(filename).slice(1);
      const fileUrl = `/uploads/${filename}`;
      const altFallback = filename.replace(/\.[a-z]+$/i, '').replace(/[-_]+/g, ' ');
      const alt = ALT_TEXT[filename] || altFallback;

      const existing = await client.query('SELECT id FROM media WHERE file_url = $1', [fileUrl]);
      if (existing.rows.length > 0) {
        mediaIdByFilename[filename] = existing.rows[0].id;
        continue;
      }

      const result = await client.query(
        `INSERT INTO media (filename, file_url, alt_text, file_type, file_size, width, height, uploaded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [filename, fileUrl, alt, `image/${ext === 'jpg' ? 'jpeg' : ext}`, meta.size, meta.w, meta.h, ADMIN_ID]
      );
      mediaIdByFilename[filename] = result.rows[0].id;
    }
    console.log(`   ${Object.keys(mediaIdByFilename).length} media rows ready (${IMAGE_META['logo.png'] ? 'logo.png included' : ''})`);

    // ---------------- SETTINGS ----------------
    console.log('\n⚙️  Updating site settings with real values...');
    const realSettings = {
      site_name: 'Pinnacle Design | Build',
      site_tagline: 'General Contracting',
      meta_description: 'Pinnacle Design | Build — general contracting for residential and commercial construction with craftsmanship and lasting quality.',
      site_url: 'https://pinnaclebuild-two.vercel.app',
      contact_email: 'info@thepinnaclebuild.com',
      phone: '+1 226 507 5385',
      address: '53 Mullis Cres, Brampton, ON',
      facebook_url: 'https://www.facebook.com/pinnacledesignbuild',
      instagram_url: 'https://www.instagram.com/pinnacledesignbuild',
      whatsapp_url: 'https://wa.me/12265075385',
      site_logo: mediaIdByFilename['logo.png'] ? `/uploads/logo.png` : ''
    };
    for (const [key, value] of Object.entries(realSettings)) {
      await client.query(
        `INSERT INTO site_settings (setting_key, setting_value)
         VALUES ($1, $2)
         ON CONFLICT (setting_key) DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = CURRENT_TIMESTAMP`,
        [key, value]
      );
    }
    console.log(`   ${Object.keys(realSettings).length} settings upserted`);

    // ---------------- MENUS ----------------
    console.log('\n☰ Rebuilding real navigation menus...');

    // HEADER — reuse existing "Main Navigation" menu if present, else create
    let headerMenu = await client.query(`SELECT id FROM menus WHERE location = 'header' ORDER BY id ASC LIMIT 1`);
    let headerMenuId;
    if (headerMenu.rows.length > 0) {
      headerMenuId = headerMenu.rows[0].id;
      await client.query('DELETE FROM menu_items WHERE menu_id = $1', [headerMenuId]); // clear old test items
      await client.query(`UPDATE menus SET name = 'Main Navigation', status = 'published' WHERE id = $1`, [headerMenuId]);
    } else {
      const created = await client.query(
        `INSERT INTO menus (name, slug, location, status) VALUES ('Main Navigation','main-nav','header','published') RETURNING id`
      );
      headerMenuId = created.rows[0].id;
    }

    const SERVICES = [
      ['Bathroom Renovation', '/bathroom-renovation'],
      ['Basement Renovation', '/basement-renovation'],
      ['Full Home Renovation', '/full-home-renovation'],
      ['Construction Project Management', '/construction-project-management'],
      ['Kitchen Renovation', '/kitchen-renovation'],
      ['Garden Suite', '/garden-suite'],
      ['Home Addition', '/home-addition'],
      ['Multiplex Conversion', '/multiplex-conversion'],
      ['Garage Conversion', '/garage-conversion']
    ];

    let order = 1;
    const homeItem = await insertMenuItem(client, headerMenuId, 'Home', '/', order++, null);
    const servicesItem = await insertMenuItem(client, headerMenuId, 'Services', '/services', order++, null);
    for (const [label, url] of SERVICES) {
      await insertMenuItem(client, headerMenuId, label, url, order++, servicesItem);
    }
    await insertMenuItem(client, headerMenuId, 'The Process', '/process', order++, null);
    await insertMenuItem(client, headerMenuId, 'Gallery', '/gallery', order++, null);
    await insertMenuItem(client, headerMenuId, 'About Us', '/about', order++, null);
    await insertMenuItem(client, headerMenuId, 'Cost Calculator', '/cost-calculator', order++, null);
    await insertMenuItem(client, headerMenuId, 'Contact Us', '/contact', order++, null);
    console.log(`   Header menu (id ${headerMenuId}): ${order - 1} items (incl. ${SERVICES.length} nested under Services)`);

    // FOOTER
    let footerMenu = await client.query(`SELECT id FROM menus WHERE location = 'footer' ORDER BY id ASC LIMIT 1`);
    let footerMenuId;
    if (footerMenu.rows.length > 0) {
      footerMenuId = footerMenu.rows[0].id;
      await client.query('DELETE FROM menu_items WHERE menu_id = $1', [footerMenuId]);
    } else {
      const created = await client.query(
        `INSERT INTO menus (name, slug, location, status) VALUES ('Footer Menu','footer-menu','footer','published') RETURNING id`
      );
      footerMenuId = created.rows[0].id;
    }

    let fOrder = 1;
    for (const [label, url] of [
      ['About Us', '/about'], ['The Process', '/process'], ['Gallery', '/gallery'],
      ['Contact Us', '/contact'], ['Privacy Policy', '/privacy-policy'], ['Terms of Use', '/terms-of-use']
    ]) {
      await insertMenuItem(client, footerMenuId, label, url, fOrder++, null);
    }
    console.log(`   Footer menu (id ${footerMenuId}): ${fOrder - 1} items`);

    console.log('\n✅ Media, settings, and menus migration complete.');

    // ---------------- PAGES + SECTIONS ----------------
    if (pagesExtract.length === 0) {
      console.log('\n⏭  Skipping pages/sections — no extract JSON yet. Re-run this script once it exists.');
      return { mediaIdByFilename, pagesExtract };
    }

    console.log(`\n📝 Creating ${pagesExtract.length} pages with their sections...`);
    let pageOrder = 1;
    let totalSections = 0;

    for (const p of pagesExtract) {
      const isHome = p.slug === 'home';
      const featuredImageFilename = p.images && p.images.length > 0 ? path.basename(p.images[0].src) : null;
      const featuredImageId = featuredImageFilename ? (mediaIdByFilename[featuredImageFilename] || null) : null;

      const existing = await client.query('SELECT id FROM pages WHERE slug = $1', [p.slug]);
      let pageId;

      if (existing.rows.length > 0) {
        pageId = existing.rows[0].id;
        await client.query(
          `UPDATE pages SET
            name = $1, title = $2, meta_description = $3, meta_keywords = $4,
            status = 'published', page_order = $5, is_home_page = $6,
            featured_image = $7, published_at = COALESCE(published_at, CURRENT_TIMESTAMP),
            updated_at = CURRENT_TIMESTAMP, last_edited_by = $8
           WHERE id = $9`,
          [p.h1 || p.title, p.title, p.meta_description || null, p.meta_keywords || null,
           pageOrder, isHome, featuredImageId, ADMIN_ID, pageId]
        );
        await client.query('DELETE FROM page_sections WHERE page_id = $1', [pageId]); // replace with fresh extract
      } else {
        const result = await client.query(
          `INSERT INTO pages (name, slug, title, meta_description, meta_keywords, status,
             page_order, is_home_page, featured_image, published_at, created_by, last_edited_by)
           VALUES ($1,$2,$3,$4,$5,'published',$6,$7,$8,CURRENT_TIMESTAMP,$9,$9) RETURNING id`,
          [p.h1 || p.title, p.slug, p.title, p.meta_description || null, p.meta_keywords || null,
           pageOrder, isHome, featuredImageId, ADMIN_ID]
        );
        pageId = result.rows[0].id;
      }
      pageOrder++;

      let sectionOrder = 1;
      for (const s of (p.sections || [])) {
        const imgFilename = s.image ? path.basename(s.image) : null;
        const imageId = imgFilename ? (mediaIdByFilename[imgFilename] || null) : null;

        await client.query(
          `INSERT INTO page_sections (page_id, section_type, section_title, section_content, section_order, image_id)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [pageId, s.section_type || 'content', s.section_title || null, s.section_content || null, sectionOrder++, imageId]
        );
        totalSections++;
      }

      console.log(`   ✓ ${p.slug} (page id ${pageId}): ${(p.sections || []).length} sections, featured_image=${featuredImageId || 'none'}`);
    }

    console.log(`\n✅ Pages migration complete: ${pagesExtract.length} pages, ${totalSections} sections total.`);

    return { mediaIdByFilename, pagesExtract };
  } finally {
    client.release();
  }
}

async function insertMenuItem(client, menuId, label, url, order, parentId) {
  const result = await client.query(
    `INSERT INTO menu_items (menu_id, label, url, order_position, parent_id, is_active)
     VALUES ($1,$2,$3,$4,$5,true) RETURNING id`,
    [menuId, label, url, order, parentId]
  );
  return result.rows[0].id;
}

run()
  .then(() => { console.log('\nDone.'); process.exit(0); })
  .catch(err => { console.error('❌ Migration failed:', err); process.exit(1); });
