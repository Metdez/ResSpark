// Spike (e), D-22: Truv sandbox order with products income + employment. Evidence, not production code.
// Run from the repo root: pnpm -C app run spike ../.planning/phases/01-foundation-staff-sign-in/spikes/truv-order.mjs
// Prints the status and response KEY names only; never bridge_token, share_url, ids, or credentials.
const { TRUV_CLIENT_ID, TRUV_SECRET } = process.env;
if (!TRUV_CLIENT_ID || !TRUV_SECRET) {
  console.log(
    "blocked: no Truv keys — to enable: pnpm -C app wrangler secret put TRUV_CLIENT_ID; pnpm -C app wrangler secret put TRUV_SECRET; and add both to app/.dev.vars"
  );
  process.exit(0);
}

const res = await fetch("https://prod.truv.com/v1/orders/", {
  method: "POST",
  headers: { "X-Access-Client-Id": TRUV_CLIENT_ID, "X-Access-Secret": TRUV_SECRET, "Content-Type": "application/json" },
  body: JSON.stringify({
    products: ["income", "employment"],
    first_name: "Test",
    last_name: "MultipleEmployments",
    email: "goodlogin@domain.com",
    order_number: `resspark-spike-${Date.now()}`,
  }),
});
const json = await res.json().catch(() => ({}));
console.log(`status: ${res.status}`);
console.log(`response keys: ${Object.keys(json).join(", ")}`);
console.log("note: the multiple.employments / goodpassword sandbox login is entered in the Truv Bridge UI, not via the API");
if (res.status !== 201) process.exitCode = 1;
