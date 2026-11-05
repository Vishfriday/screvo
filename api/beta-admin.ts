// Vercel serverless function: lists beta sign-ups for the admin page.
// Needs DATABASE_URL and BETA_ADMIN_TOKEN in the Vercel project's environment variables.
import { neon } from "@neondatabase/serverless";
import { timingSafeEqual, createHash } from "node:crypto";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function sameSecret(a: string, b: string) {
  // Hash both so the comparison is constant-time regardless of length.
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export async function GET(request: Request) {
  const token = process.env.BETA_ADMIN_TOKEN;
  const url = process.env.DATABASE_URL;
  if (!token || token.length < 12) {
    return json({ error: "Admin access isn't set up. Set BETA_ADMIN_TOKEN (12+ characters) in Vercel and redeploy." }, 503);
  }
  if (!url) return json({ error: "No database is connected. Set DATABASE_URL in Vercel and redeploy." }, 503);

  const given = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!given || !sameSecret(given, token)) return json({ error: "That admin password is wrong." }, 401);

  const sql = neon(url);
  try {
    const rows = await sql`
      SELECT id, email, name, phone, created_at, updated_at
      FROM beta_signups
      ORDER BY created_at DESC
      LIMIT 5000`;
    return json({ signups: rows });
  } catch (e) {
    // Table not created yet: nobody has signed up.
    if ((e as { code?: string }).code === "42P01") return json({ signups: [] });
    console.error("beta-admin query failed", e);
    return json({ error: "Couldn't read sign-ups from the database." }, 500);
  }
}
