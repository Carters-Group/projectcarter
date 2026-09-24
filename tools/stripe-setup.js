/* =========================================================================
   Project Carter - one-off Stripe product setup (run on your own computer)
   -------------------------------------------------------------------------
   Creates the products and annual prices shown on pricing.html. Safe to run
   more than once: anything that already exists is left alone.

   Run it in PowerShell from the project folder:

     $env:STRIPE_SECRET_KEY = "sk_test_..."     (a TEST key, pasted here only)
     node tools/stripe-setup.js

   Then register the webhook for a deployment (prints the signing secret):

     node tools/stripe-setup.js --webhook https://<your-site>/api/stripe-webhook

   The key is read from the environment and never written anywhere. It refuses
   to run with a live key unless you also set STRIPE_ALLOW_LIVE=yes.

   No npm install needed: it talks to Stripe's REST API directly (Node 18+).
   ========================================================================= */
"use strict";

var KEY = process.env.STRIPE_SECRET_KEY || "";
if (!/^(sk|rk)_(test|live)_/.test(KEY)) {
  console.error("Set STRIPE_SECRET_KEY first, e.g.  $env:STRIPE_SECRET_KEY = \"sk_test_...\"");
  process.exit(1);
}
if (/_live_/.test(KEY) && process.env.STRIPE_ALLOW_LIVE !== "yes") {
  console.error("That is a LIVE key. Use a test key, or set STRIPE_ALLOW_LIVE=yes if you really mean it.");
  process.exit(1);
}

/* what pricing.html sells. property_limit is the TOTAL number of properties
   the plan covers (the first one is free on the DIY ladder, so the 2-property
   price is the first paid step). Amounts are in cents, AUD, GST inclusive. */
var PRODUCTS = [
  {
    id: "pc_diy",
    name: "Project Carter - Do It Yourself",
    description: "12 months of access to the full dashboard, calculators, PDFs, tax and CGT for your properties. The first property is free.",
    prices: [
      { lookup_key: "diy_2_properties_annual", nickname: "2 properties, 12 months",  amount: 25000, property_limit: 2 },
      { lookup_key: "diy_3_properties_annual", nickname: "3 properties, 12 months",  amount: 50000, property_limit: 3 },
      { lookup_key: "diy_4_properties_annual", nickname: "4 properties, 12 months",  amount: 75000, property_limit: 4 },
      { lookup_key: "diy_5_properties_annual", nickname: "5 properties, 12 months",  amount: 99700, property_limit: 5 }
    ]
  },
  {
    id: "pc_dfy",
    name: "Project Carter - Done For You",
    description: "We build your portfolio in the platform, a one-on-one walkthrough with Trent, and general advice on portfolio health. 12 months.",
    prices: [
      { lookup_key: "dfy_annual", nickname: "Done For You, 12 months", amount: 499700, property_limit: null }
    ]
  }
];

function form(obj, prefix, out) {
  out = out || [];
  Object.keys(obj).forEach(function (k) {
    var v = obj[k], name = prefix ? prefix + "[" + k + "]" : k;
    if (v === null || v === undefined) return;
    if (typeof v === "object") form(v, name, out);
    else out.push(encodeURIComponent(name) + "=" + encodeURIComponent(String(v)));
  });
  return out;
}

async function stripe(method, path, body) {
  var res = await fetch("https://api.stripe.com/v1" + path, {
    method: method,
    headers: {
      Authorization: "Bearer " + KEY,
      "Content-Type": "application/x-www-form-urlencoded",
      "Stripe-Version": "2025-09-30.clover"
    },
    body: body ? form(body).join("&") : undefined
  });
  var json = await res.json();
  if (!res.ok) {
    var err = new Error((json.error && json.error.message) || ("Stripe error " + res.status));
    err.code = json.error && json.error.code;
    throw err;
  }
  return json;
}

async function ensureProduct(p) {
  try {
    var made = await stripe("POST", "/products", {
      id: p.id, name: p.name, description: p.description,
      metadata: { app: "projectcarter" }
    });
    console.log("created product  " + made.id + "  " + made.name);
  } catch (e) {
    if (e.code === "resource_already_exists") console.log("product exists   " + p.id);
    else throw e;
  }
}

async function ensurePrice(productId, pr) {
  var found = await stripe("GET", "/prices?lookup_keys[]=" + encodeURIComponent(pr.lookup_key) + "&limit=1");
  if (found.data && found.data.length) {
    console.log("price exists     " + pr.lookup_key + "  " + found.data[0].id);
    return found.data[0];
  }
  var meta = { app: "projectcarter" };
  if (pr.property_limit) meta.property_limit = String(pr.property_limit);
  var made = await stripe("POST", "/prices", {
    product: productId,
    currency: "aud",
    unit_amount: pr.amount,
    recurring: { interval: "year" },
    tax_behavior: "inclusive",
    lookup_key: pr.lookup_key,
    nickname: pr.nickname,
    metadata: meta
  });
  console.log("created price    " + pr.lookup_key + "  " + made.id + "  A$" + (pr.amount / 100).toLocaleString("en-AU"));
  return made;
}

/* the events api/stripe-webhook.js acts on */
var WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed"
];

/* node tools/stripe-setup.js --webhook https://<site>/api/stripe-webhook
   Registers the webhook and prints its signing secret (Stripe only shows it
   once, at creation) for Vercel's STRIPE_WEBHOOK_SECRET. */
async function ensureWebhook(url) {
  /* a protected Vercel preview needs ?x-vercel-protection-bypass=<secret> on the end */
  if (!/^https:\/\/[^/]+\/api\/stripe-webhook(\?[^#\s]*)?$/.test(url)) {
    throw new Error("The webhook URL should look like https://<your-site>/api/stripe-webhook");
  }
  var list = await stripe("GET", "/webhook_endpoints?limit=100");
  var existing = (list.data || []).filter(function (w) { return w.url === url; })[0];
  if (existing) {
    await stripe("POST", "/webhook_endpoints/" + existing.id, { enabled_events: WEBHOOK_EVENTS });
    console.log("webhook exists   " + existing.id + "  " + url + "  (events refreshed)");
    console.log("\nIts signing secret was shown when it was created. If you no longer have it,");
    console.log("open it in the Stripe dashboard (Developers, Webhooks) and reveal or roll it.");
    return;
  }
  var made = await stripe("POST", "/webhook_endpoints", {
    url: url,
    enabled_events: WEBHOOK_EVENTS,
    description: "Project Carter plans",
    api_version: "2025-09-30.clover"
  });
  console.log("created webhook  " + made.id + "  " + url);
  console.log("\nPut this in Vercel as STRIPE_WEBHOOK_SECRET (it is only shown now):\n\n  " + made.secret + "\n");
}

(async function () {
  var mode = /_live_/.test(KEY) ? "LIVE" : "TEST";
  var at = process.argv.indexOf("--webhook");
  if (at !== -1) {
    console.log("Setting up the Project Carter webhook in " + mode + " mode\n");
    await ensureWebhook(String(process.argv[at + 1] || ""));
    return;
  }
  console.log("Setting up Project Carter products in " + mode + " mode\n");
  for (var i = 0; i < PRODUCTS.length; i++) {
    await ensureProduct(PRODUCTS[i]);
    for (var j = 0; j < PRODUCTS[i].prices.length; j++) {
      await ensurePrice(PRODUCTS[i].id, PRODUCTS[i].prices[j]);
    }
  }
  console.log("\nDone. Check them at https://dashboard.stripe.com" + (mode === "TEST" ? "/test" : "") + "/products");
})().catch(function (e) {
  console.error("\nFailed: " + e.message);
  process.exit(1);
});
