# Pinnacle Admin Panel - Backend

Admin panel backend for Pinnacle Design | Build website. Built with Node.js, Express, and PostgreSQL.

## Phase 1: Authentication & Dashboard

✅ **Completed Features:**
- Secure JWT authentication
- Login/logout functionality
- Admin dashboard
- Session management
- Responsive UI (desktop & mobile)

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Environment

Create `.env` file (template provided):

```
PORT=5000
DATABASE_URL=postgresql://user:password@localhost:5432/pinnacle_admin
JWT_SECRET=pinnacle-admin-secret-key-2024-change-in-production
NODE_ENV=development
```

### 3. Set Up PostgreSQL Database

**Option A: Local PostgreSQL**
```bash
psql -U postgres
```

Then run in psql:
```sql
CREATE DATABASE pinnacle_admin;
\c pinnacle_admin
```

Paste contents of `database-setup.sql` and run.

**Option B: Cloud PostgreSQL (Render, AWS, etc.)**
- Create database via provider
- Copy connection string to `.env` as `DATABASE_URL`

### 4. Create Admin Accounts

After database is set up, run the setup script:

```bash
npm install -g ts-node  # if not already installed
node setup-admin-users.js
```

This will:
- Hash passwords securely
- Create default admin accounts
- Display credentials

**Default Credentials:**
```
Email: admin@pinnaclebuild.com
Password: Pinnacle123!

Email: manager@pinnaclebuild.com
Password: Manager123!
```

### 5. Start Development Server

```bash
npm run dev
```

Server runs on: **http://localhost:5000**

**Login Page:** http://localhost:5000/login.html
**Dashboard:** http://localhost:5000/dashboard.html

## Project Structure

```
pinnacle-admin-backend/
├── server.js              # Main server file
├── package.json           # Dependencies
├── .env                   # Environment variables
├── .gitignore             # Git ignore rules
├── database-setup.sql     # Database schema
├── setup-admin-users.js   # Create default admin accounts
├── ADMIN-CREDENTIALS.txt  # Admin account credentials
├── src/
│   └── routes/
│       └── auth.js        # Authentication routes
├── public/
│   ├── login.html         # Login page
│   └── dashboard.html     # Admin dashboard
└── README.md              # This file
```

## API Routes

### Authentication

**POST /api/auth/login**
- Body: `{ email, password }`
- Returns: `{ success, token, user }`

**GET /api/auth/me**
- Headers: `Authorization: Bearer <token>`
- Returns: User information

**POST /api/auth/logout**
- Just removes token (client-side)

## Database Schema

### admin_users Table
```sql
- id (Serial primary key)
- email (Unique, varchar 255)
- password (Hashed, varchar 255)
- name (varchar 255)
- role (varchar 50: 'owner' or 'manager')
- created_at (Timestamp)
- last_login (Timestamp)
- is_active (Boolean)
```

### login_logs Table (Future use)
```sql
- id (Serial primary key)
- admin_id (FK to admin_users)
- login_time (Timestamp)
- ip_address (varchar 50)
- status (varchar 50)
```

### contact_inquiries Table (Phase 2)
```sql
- id (Serial primary key)
- name, email, phone
- project_type, message
- received_at, status
```

### calculator_quotes Table (Phase 2)
```sql
- id (Serial primary key)
- Project details
- Services selected
- estimated_low, estimated_high
- created_at, customer_email
```

## Security Features

✅ **Implemented:**
- Password hashing with bcryptjs
- JWT token authentication
- HTTPS ready
- Secure session management
- CORS configured
- Input validation

⚠️ **For Production:**
- Change JWT_SECRET to a strong random string
- Enable HTTPS/SSL certificate
- Use environment-specific .env files
- Implement rate limiting
- Add CSRF protection
- Enable security headers

## Development vs Production

### Development
```bash
npm run dev
```
- Runs on port 5000
- Auto-reload with nodemon
- Detailed error messages

### Production
```bash
npm start
```
- Runs on configured PORT
- Error handling for production
- Uses production database
- HTTPS required

## Deployment to Render.com

### 1. Connect GitHub Repository
- Push to GitHub
- Link GitHub to Render.com

### 2. Create New Web Service
```
Service Type: Node.js
Build Command: npm install
Start Command: npm start
```

### 3. Set Environment Variables
```
PORT=5000
DATABASE_URL=<your-postgres-url>
JWT_SECRET=<strong-random-secret>
NODE_ENV=production
```

### 4. Deploy
Click "Deploy" — Render will:
- Install dependencies
- Build the application
- Start the server
- Assign public URL

### 5. Update Login/Dashboard URLs
After deployment, access via:
- Login: `https://your-app.render.com/login.html`
- Dashboard: `https://your-app.render.com/dashboard.html`

## Troubleshooting

### "Cannot find module 'pg'"
```bash
npm install pg
```

### "Connection refused"
- Check PostgreSQL is running
- Verify DATABASE_URL in .env
- Check port 5432 is not blocked

### "Password invalid"
- Check .env file exists
- Verify JWT_SECRET is set
- Make sure admin accounts were created with `node setup-admin-users.js`

### "CORS error"
- CORS is enabled for all origins
- Check browser console for actual error
- Verify API route is correct

## Next Steps: Phase 2

Planned features for Phase 2:
- ✏️ Content Management (edit pages, services)
- 📸 Project gallery management
- 💬 Contact inquiry view/management
- 💰 Calculator quote management
- 📊 Basic analytics dashboard
- 👥 Admin user management

## Support

For issues or questions:
- Email: admin@pinnaclebuild.com
- Phone: +1 226 507 5385

## License

Proprietary - Pinnacle Design | Build

---

**Created:** September 4, 2026  
**Status:** Phase 1 Complete - Ready for Testing  
**Version:** 1.0.0
