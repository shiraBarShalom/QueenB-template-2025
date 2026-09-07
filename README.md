# MentorMe

MentorMe is a React, Material UI, Express, and PostgreSQL mentoring application.
Members sign in, complete a mentee and/or mentor profile, and administrators
manage accounts from a protected dashboard. Authentication uses Argon2id
password hashes and server-side sessions stored in PostgreSQL.

## Security model

- Plaintext passwords are never stored, returned, or logged. Argon2id creates a
  salted one-way hash.
- SQL values are always passed separately through PostgreSQL placeholders such
  as `$1`; user input is never concatenated into SQL.
- The browser receives only an opaque session cookie. It is HttpOnly,
  SameSite=Strict, rotated at login, and Secure in production.
- Login, registration, and password-reset endpoints are rate-limited.
- The public registration schema rejects unknown fields, including `isAdmin`.
- Password-reset tokens are random, stored only as SHA-256 hashes, expire, and
  can be used once. A successful reset revokes every existing session.
- Forgot-password responses never reveal whether an email exists.
- Administrators are created only by the local `admin:create` command.
- Admin mutations are authorized from the database, not from the session flag
  alone, and privileged changes are written to `admin_actions`.
- The web server uses a restricted PostgreSQL role. A separate owner role runs
  migrations.

## 1. Install and verify PostgreSQL on Windows

This machine currently has PostgreSQL entries under `C:\Program Files\PostgreSQL`,
but no service or `psql.exe` was discoverable. Repair PostgreSQL 18 from
**Settings > Apps > Installed apps**, or reinstall it:

```powershell
winget uninstall --id PostgreSQL.PostgreSQL.18
winget install --id PostgreSQL.PostgreSQL.18
```

The installer asks for a password for the built-in `postgres` administrator.
Keep it in a password manager; it is not the password the app will use.

Open a new terminal and verify:

```powershell
psql --version
pg_isready
```

If PostgreSQL is installed but `psql` is not found, add its `bin` directory
(normally `C:\Program Files\PostgreSQL\18\bin`) to Windows PATH, then reopen the
terminal.

## 2. Back up and create isolated database roles

In pgAdmin, right-click the existing `mentor_me` database and choose
**Backup...** before changing its schema.

Generate two different strong passwords in PowerShell:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

In pgAdmin, open **Login/Group Roles > Create > Login/Group Role**. Create
`mentorme_owner` and `mentorme_app`, set each generated password on the
Definition tab, enable Login, and leave Superuser/Create roles/Create databases
disabled.

Then run this password-free SQL as `postgres` in the `mentor_me` Query Tool:

```sql
ALTER DATABASE mentor_me OWNER TO mentorme_owner;
ALTER SCHEMA public OWNER TO mentorme_owner;
ALTER TABLE public.users OWNER TO mentorme_owner;
```

`mentorme_owner` may change this database's schema. `mentorme_app` is the
restricted identity used by the running web server and receives only data
access from the migration.

## 3. Configure private environment values

Copy the example file:

```powershell
Copy-Item server\.env.example server\.env
```

Edit `server\.env`:

```dotenv
PORT=5000
NODE_ENV=development
CLIENT_ORIGIN=http://localhost:3000
TRUST_PROXY=false
DATABASE_URL=postgresql://mentorme_app:APP_PASSWORD_HERE@localhost:5432/mentor_me
MIGRATION_DATABASE_URL=postgresql://mentorme_owner:OWNER_PASSWORD_HERE@localhost:5432/mentor_me
DB_SSL=false
DB_SSL_REJECT_UNAUTHORIZED=true
SESSION_SECRET=PASTE_A_RANDOM_SECRET_HERE
RESEND_API_KEY=re_your_resend_api_key
RESEND_FROM_EMAIL=MentorMe <onboarding@resend.dev>
PASSWORD_RESET_TOKEN_TTL_MINUTES=60
```

Generate `SESSION_SECRET`:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

`server/.env` is ignored by git. Never commit or send it to another person.
Each teammate creates their own local file.

## 4. Install, migrate, and run

From the repository root:

```powershell
npm install
npm run install-all
npm run db:upgrade-passwords
npm run db:migrate
npm run db:check
npm run dev
```

- `db:upgrade-passwords` is a one-time legacy upgrade. It hashes every value
  from the old `password` column with Argon2id in a transaction and removes
  that plaintext column only after all rows succeed.
- `db:migrate` applies each versioned SQL file once, records its checksum, and
  never executes the old destructive `DROP TABLE` script.
- Migration order: `001_secure_auth_profiles.sql`,
  `002_password_reset_tokens.sql`, `003_roles_account_controls.sql`,
  `004_admin_audit_log.sql`.
- `db:check` confirms the restricted runtime role can connect.
- `dev` starts the API at `http://localhost:5000` and React at
  `http://localhost:3000`.

## 5. Create an administrator

After migration:

```powershell
npm run admin:create
```

The command prompts for name, email, and password. Password input is hidden,
hashed with Argon2id, and never enters terminal history. Running it again for an
existing email securely promotes that account and replaces its password.

Public signup cannot create an administrator. After the first sign-in, complete
onboarding, then open **Admin dashboard**.

## Password reset with Resend

1. Create a [Resend](https://resend.com) account and copy an API key into
   `RESEND_API_KEY`.
2. Until a domain is verified, keep
   `RESEND_FROM_EMAIL=MentorMe <onboarding@resend.dev>`. Resend test mode can
   deliver only to the email address that owns the Resend account.
3. After a domain is verified, change `RESEND_FROM_EMAIL` to that sender.
4. If `RESEND_API_KEY` is empty in development, MentorMe logs the reset link in
   the server terminal instead of sending email.

Members use **Forgot password?** on the sign-in page. The email contains a
one-time `/reset-password?token=...` link.

## Member onboarding

After sign-up or sign-in, incomplete profiles go to `/onboarding`. Members can
choose mentee, mentor, or both. Each step saves immediately through:

- `PUT /api/users/me/roles`
- `PATCH /api/users/me`
- `PATCH /api/users/me/profile`
- `PATCH /api/users/me/mentor-profile`

Completed members land on `/home` and can return to `/onboarding` to edit.

## Administrator workflow

- `/admin` lists accounts with search, pagination, and membership stats.
- `/admin/users/:id` edits name, email, roles, profile, admin access, and
  account status.
- Administrators cannot demote or disable themselves, and the last active
  administrator cannot be demoted or disabled.
- Disabled accounts cannot sign in. Disabling an account also revokes its
  sessions.
- **Send reset email** and **Sign out everywhere** require confirmation and are
  written to the audit log.

## Authentication and admin API

- `POST /api/users/register` — display name, email, password
- `POST /api/users/login` — email, password
- `POST /api/users/forgot-password` — email
- `POST /api/users/reset-password` — token, password
- `POST /api/users/logout` — authenticated
- `GET /api/users/me` — current safe account/profile data
- `PATCH /api/users/me` — display name
- `PUT /api/users/me/roles` — `MENTEE` and/or `MENTOR`
- `PATCH /api/users/me/profile` — shared professional profile
- `PATCH /api/users/me/mentor-profile` — opt in or update mentor settings
- `GET /api/admin/me` — current administrator
- `GET /api/admin/stats` — membership counts
- `GET /api/admin/users` — paginated search
- `GET /api/admin/users/:id` — account detail
- `PATCH /api/admin/users/:id` — account, roles, and profile
- `DELETE /api/admin/users/:id/sessions` — revoke sessions
- `POST /api/admin/users/:id/password-reset` — send a reset email

Common profile fields are background, LinkedIn/GitHub URLs, job title, company,
experience, programming languages, and tech stack. Mentor-only fields are advice
topics, capacity, meeting duration, and whether requests are accepted.

## Tests

Fast security tests require no database:

```powershell
npm run test:server
```

Frontend guard and form tests:

```powershell
$env:CI="true"
npm run test:client
```

Database integration tests run only when a dedicated test database is provided.
Never point this variable at development or production because tests truncate
users:

```powershell
$env:TEST_DATABASE_URL="postgresql://mentorme_owner:OWNER_PASSWORD_HERE@localhost:5432/mentorme_test"
npm run test:server
```

Create `mentorme_test` separately and use a test-only owner. The integration
suite verifies registration, Argon2 storage, sessions, logout, profile
authorization, password reset, admin authorization, last-admin protection,
disabled-user login, rate limiting, duplicate accounts, and SQL-injection-shaped
input.

## Production notes

- Use HTTPS and `NODE_ENV=production`; otherwise Secure cookies cannot work.
- Store secrets in the deployment platform's secret manager, not `.env` in git.
- Set `CLIENT_ORIGIN` to the exact HTTPS frontend origin.
- Set `TRUST_PROXY=true` only behind a trusted reverse proxy.
- Use a managed PostgreSQL service with TLS (`DB_SSL=true`) and backups.
- Rotate the session secret deliberately; rotation signs every user out.
- Production requires `RESEND_API_KEY` and a verified sending domain.
