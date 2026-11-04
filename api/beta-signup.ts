// Vercel serverless function: stores beta sign-ups in Postgres (Neon).
// Needs DATABASE_URL in the Vercel project's environment variables.
import { neon } from "@neondatabase/serverless";

type Signup = {
  name: string;
  email: string;
  designation: string;
  company: string;
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
  const designation = clean(raw.designation, 120);
  const company = clean(raw.company, 160);
  const phone = clean(raw.phone, 20);

  const errors: Record<string, string> = {};
  if (!name) errors.name = "Enter your name.";
  if (!EMAIL_RE.test(email)) errors.email = "Enter a valid email address, like you@company.com.";
  if (!designation) errors.designation = "Enter your designation.";
  if (!company) errors.company = "Enter your company name.";
  if (phone && !PHONE_RE.test(phone)) errors.phone = "Use digits only, with an optional + and country code.";

  if (Object.keys(errors).length) return { errors };
  return { data: { name, email, designation, company, phone: phone || null } };
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
  tableReady ??= sql`
    CREATE TABLE IF NOT EXISTS beta_signups (
      id          BIGSERIAL PRIMARY KEY,
      name        TEXT NOT NULL,
      email       TEXT NOT NULL UNIQUE,
      designation TEXT NOT NULL,
      company     TEXT NOT NULL,
      phone       TEXT,
      user_agent  TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )`.catch((e) => {
    tableReady = null;
    throw e;
  });

  try {
    await tableReady;
    const ua = clean(request.headers.get("user-agent"), 300) || null;
    // Signing up twice with the same email updates the details instead of failing.
    const rows = await sql`
      INSERT INTO beta_signups (name, email, designation, company, phone, user_agent)
      VALUES (${data.name}, ${data.email}, ${data.designation}, ${data.company}, ${data.phone}, ${ua})
      ON CONFLICT (email) DO UPDATE SET
        name = EXCLUDED.name,
        designation = EXCLUDED.designation,
        company = EXCLUDED.company,
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
