// Spike (c), D-22: signed Storage upload by a client holding only the publishable key (no session).
// Evidence, not production code. Run from the repo root:
//   pnpm -C app exec dotenv -e .dev.vars -- node ../.planning/phases/01-foundation-staff-sign-in/spikes/tus-signed-upload.mjs
// Prints statuses only; never a key, a token, or a signed URL.
import { createRequire } from "node:module";

const require = createRequire(new URL("../../../../app/package.json", import.meta.url));
const { createClient } = require("@supabase/supabase-js");

const { SUPABASE_URL, SUPABASE_SECRET_KEY, SUPABASE_PUBLISHABLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SECRET_KEY || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error("Missing SUPABASE_URL, SUPABASE_SECRET_KEY or SUPABASE_PUBLISHABLE_KEY");
}

const BUCKET = "spike-tus";
const SIMPLE = "spike/simple.bin";
const RESUMABLE = "spike/resumable.bin";
const MiB = 1024 * 1024;
const CHUNK = 6 * MiB; // Supabase: TUS chunk size must be exactly 6 MiB
const TOTAL = 10 * MiB;

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, noSession);
const anon = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, noSession);
const results = {};

const b64 = (s) => Buffer.from(s).toString("base64");
// Response bodies carry no secrets, but strip anything token-shaped before printing.
const safe = (text) => text.replace(/"(token|signedUrl|url)"\s*:\s*"[^"]*"/g, '"$1":"<redacted>"').slice(0, 300);

async function tus(host, token) {
  const base = { apikey: SUPABASE_PUBLISHABLE_KEY, "x-signature": token, "Tus-Resumable": "1.0.0" };
  const create = await fetch(`${host}/storage/v1/upload/resumable/sign`, {
    method: "POST",
    headers: {
      ...base,
      "Upload-Length": String(TOTAL),
      "Upload-Metadata": `bucketName ${b64(BUCKET)},objectName ${b64(RESUMABLE)},contentType ${b64("application/octet-stream")}`,
    },
  });
  const location = create.headers.get("location");
  const steps = [`POST /sign ${create.status}`];
  if (create.status !== 201 || !location) return { ok: false, status: create.status, steps, body: safe(await create.text()) };
  const url = new URL(location, host).toString();
  for (const offset of [0, CHUNK]) {
    const size = Math.min(CHUNK, TOTAL - offset);
    const patch = await fetch(url, {
      method: "PATCH",
      headers: { ...base, "Upload-Offset": String(offset), "Content-Type": "application/offset+octet-stream" },
      body: Buffer.alloc(size, 2),
    });
    steps.push(`PATCH @${offset} ${patch.status} offset=${patch.headers.get("upload-offset")}`);
    if (patch.status !== 204) return { ok: false, status: patch.status, steps, body: safe(await patch.text()) };
  }
  return { ok: steps.at(-1).endsWith(`offset=${TOTAL}`), steps };
}

try {
  const { data: buckets, error: listErr } = await admin.storage.listBuckets();
  if (listErr) throw new Error(`listBuckets failed: ${listErr.message}`);
  if (!buckets.some((b) => b.name === BUCKET)) {
    const { error } = await admin.storage.createBucket(BUCKET, { public: false, fileSizeLimit: 26214400 });
    if (error) throw new Error(`createBucket failed: ${error.message}`);
  }

  // PATH A: simple signed upload, publishable-key client, no session ever created.
  const signedA = await admin.storage.from(BUCKET).createSignedUploadUrl(SIMPLE);
  if (signedA.error) throw new Error(`createSignedUploadUrl A failed: ${signedA.error.message}`);
  const { data: session } = await anon.auth.getSession();
  const up = await anon.storage.from(BUCKET).uploadToSignedUrl(signedA.data.path, signedA.data.token, Buffer.alloc(2 * MiB, 1), {
    contentType: "application/octet-stream",
  });
  results.simple = up.error ? `FAIL ${up.error.message}` : "PASS";
  console.log(`session before upload: ${session.session ? "present" : "none"}`);
  console.log(`PATH A uploadToSignedUrl (2 MiB): ${results.simple}`);

  // PATH B: raw TUS against /upload/resumable/sign with x-signature; storage host first, project host on 404.
  const signedB = await admin.storage.from(BUCKET).createSignedUploadUrl(RESUMABLE);
  if (signedB.error) throw new Error(`createSignedUploadUrl B failed: ${signedB.error.message}`);
  const ref = new URL(SUPABASE_URL).hostname.split(".")[0];
  const hosts = [`https://${ref}.storage.supabase.co`, `https://${ref}.supabase.co`];
  for (const host of hosts) {
    const r = await tus(host, signedB.data.token);
    const label = host.includes(".storage.") ? "<ref>.storage.supabase.co" : "<ref>.supabase.co";
    console.log(`PATH B TUS host ${label}: ${r.ok ? "PASS" : "FAIL"} | ${r.steps.join(" | ")}${r.body ? ` | body ${r.body}` : ""}`);
    results.resumable = `${r.ok ? "PASS" : "FAIL"} via ${label}`;
    if (r.status !== 404) break;
  }

  const { data: objects, error: lsErr } = await admin.storage.from(BUCKET).list("spike");
  if (lsErr) throw new Error(`list failed: ${lsErr.message}`);
  for (const o of objects) console.log(`object spike/${o.name} size=${o.metadata?.size}`);
} finally {
  const rm = await admin.storage.from(BUCKET).remove([SIMPLE, RESUMABLE]);
  const del = await admin.storage.deleteBucket(BUCKET);
  console.log(`cleanup: remove ${rm.error ? `FAIL ${rm.error.message}` : "ok"}, deleteBucket ${del.error ? `FAIL ${del.error.message}` : "ok"}`);
  const { data: after } = await admin.storage.listBuckets();
  console.log(`buckets after cleanup: ${after?.length ?? "unknown"}`);
}

console.log(`RESULT simple=${results.simple} resumable=${results.resumable}`);
if (!String(results.simple).startsWith("PASS") || !String(results.resumable).startsWith("PASS")) process.exitCode = 1;
