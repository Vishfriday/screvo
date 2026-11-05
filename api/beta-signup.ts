// Vercel serverless function: stores beta sign-ups in Postgres (Neon).
// Needs DATABASE_URL in the Vercel project's environment variables.
import { neon } from "@neondatabase/serverless";

type Signup = {
  email: string;
  name: string | null;
  phone: string | null;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+?[0-9 ()\-.]{7,20}$/;

let tableReady: Promise<unknown> | null = null;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function clean(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

function validate(raw: Record<string, unknown>): { data?: Signup; errors?: Record<string, string> } {
  const name = clean(raw.name, 120);
  const email = clean(raw.email, 254).toLowerCase();
  const phone = clean(raw.phone, 20);

  const errors: Record<string, string> = {};
  if (!EMAIL_RE.test(email)) errors.email = email ? "Enter a valid email address, like you@example.com." : "Enter your email address.";
  if (phone && !PHONE_RE.test(phone)) errors.phone = "Use digits only, with an optional + and country code.";

  if (Object.keys(errors).length) return { errors };
  return { data: { email, name: name || null, phone: phone || null } };
}

export async function POST(request: Request) {
  const url = process.env.DATABASE_URL;
  if (!url) return json({ error: "Sign-ups are not configured yet." }, 500);

  let raw: Record<string, unknown>;
  try {
    raw = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  // Honeypot: real people never fill the hidden "website" field.
  if (clean(raw.website, 200)) return json({ ok: true });

  const { data, errors } = validate(raw);
  if (!data) return json({ error: "Check the highlighted fields.", fields: errors }, 422);

  const sql = neon(url);
  // Only email is required. designation/company were asked for in the first
  // version of the form; they stay as optional columns so older rows keep them.
  tableReady ??= sql
    .transaction([
      sql`CREATE TABLE IF NOT EXISTS beta_signups (
        id          BIGSERIAL PRIMARY KEY,
        name        TEXT,
        email       TEXT NOT NULL UNIQUE,
        designation TEXT,
        company     TEXT,
        phone       TEXT,
        user_agent  TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )`,
      sql`ALTER TABLE beta_signups
        ALTER COLUMN name DROP NOT NULL,
        ALTER COLUMN designation DROP NOT NULL,
        ALTER COLUMN company DROP NOT NULL`,
    ])
    .catch((e) => {
      tableReady = null;
      throw e;
    });

  try {
    await tableReady;
    const ua = clean(request.headers.get("user-agent"), 300) || null;
    // Signing up twice with the same email updates the details instead of failing.
    const rows = await sql`
      INSERT INTO beta_signups (email, name, phone, user_agent)
      VALUES (${data.email}, ${data.name}, ${data.phone}, ${ua})
      ON CONFLICT (email) DO UPDATE SET
        name = COALESCE(EXCLUDED.name, beta_signups.name),
        phone = COALESCE(EXCLUDED.phone, beta_signups.phone),
        updated_at = now()
      RETURNING (xmax = 0) AS inserted`;
    return json({ ok: true, returning: !rows[0]?.inserted });
  } catch (e) {
    console.error("beta-signup insert failed", e);
    return json({ error: "We couldn't save your details. Try again in a minute." }, 500);
  }
}

export function GET() {
  return json({ error: "Method not allowed." }, 405);
}
