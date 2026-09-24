/**
 * Shared helpers for the Stripe billing functions (create-checkout,
 * billing-portal, stripe-webhook). The leading underscore keeps Vercel from
 * exposing this file as a route.
 *
 * Vercel env (set on the project, Preview first, test-mode values):
 *   STRIPE_SECRET_KEY          sk_test_... / rk_test_...  (server only, never in client code)
 *   STRIPE_WEBHOOK_SECRET      whsec_...                   (from the Stripe webhook endpoint)
 *   SUPABASE_URL               https://<project>.supabase.co
 *   SUPABASE_ANON_KEY          the publishable key (same one pc-auth.js uses)
 *   SUPABASE_SERVICE_ROLE_KEY  service role key (server only)
 *   STRIPE_AUTOMATIC_TAX       "on" once Stripe Tax is set up (GST); leave unset until then
 *
 * Nothing here logs keys, tokens or email addresses.
 */
"use strict";

var STRIPE_VERSION = "2025-09-30.clover";

/* the plans a customer can buy online; keys are the Stripe price lookup_keys
   created by tools/stripe-setup.js. Done For You is sold through the enquiry
   form, not self-serve checkout. */
var PLANS = {
  diy_2_properties_annual: { properties: 2 },
  diy_3_properties_annual: { properties: 3 },
  diy_4_properties_annual: { properties: 4 },
  diy_5_properties_annual: { properties: 5 }
};

function env(name) {
  /* forgive a value pasted into Vercel with its quotes or a stray space */
  var v = String(process.env[name] || "").trim().replace(/^["']+|["']+$/g, "").trim();
  if (!v) {
    var err = new Error("not configured: " + name);
    err.notConfigured = true;
    throw err;
  }
  return v;
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

/* Stripe wants form encoding with bracket notation for nested values */
function form(obj, prefix, out) {
  out = out || [];
  Object.keys(obj).forEach(function (k) {
    var v = obj[k];
    var name = prefix ? prefix + "[" + k + "]" : k;
    if (v === null || v === undefined) return;
    if (Array.isArray(v)) {
      v.forEach(function (item, i) {
        if (item !== null && typeof item === "object") form(item, name + "[" + i + "]", out);
        else out.push(encodeURIComponent(name + "[" + i + "]") + "=" + encodeURIComponent(String(item)));
      });
    } else if (typeof v === "object") {
      form(v, name, out);
    } else {
      out.push(encodeURIComponent(name) + "=" + encodeURIComponent(String(v)));
    }
  });
  return out;
}

async function stripe(method, path, params) {
  var opts = {
    method: method,
    headers: {
      Authorization: "Bearer " + env("STRIPE_SECRET_KEY"),
      "Stripe-Version": STRIPE_VERSION
    }
  };
  var url = "https://api.stripe.com/v1" + path;
  if (params) {
    var body = form(params).join("&");
    if (method === "GET") url += (url.indexOf("?") === -1 ? "?" : "&") + body;
    else {
      opts.headers["Content-Type"] = "application/x-www-form-urlencoded";
      opts.body = body;
    }
  }
  var res = await fetch(url, opts);
  var json = await res.json();
  if (!res.ok) {
    var err = new Error((json.error && json.error.message) || ("Stripe error " + res.status));
    err.status = res.status;
    err.stripe = true;
    throw err;
  }
  return json;
}

/* Supabase REST as the service role: bypasses row level security, so it is
   only ever used for the narrow reads and writes below */
async function supabaseAdmin(method, path, body) {
  var key = env("SUPABASE_SERVICE_ROLE_KEY");
  var res = await fetch(env("SUPABASE_URL") + "/rest/v1/" + path, {
    method: method,
    headers: {
      apikey: key,
      Authorization: "Bearer " + key,
      "Content-Type": "application/json",
      Prefer: "return=representation"
    },
    body: body ? JSON.stringify(body) : undefined
  });
  var text = await res.text();
  var json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    var err = new Error("database error " + res.status + (json && json.message ? ": " + json.message : ""));
    err.status = res.status;
    throw err;
  }
  return json;
}

/* who is calling: the browser sends its Supabase access token */
async function userFromRequest(req) {
  var auth = req.headers.authorization || "";
  var m = /^Bearer\s+(.+)$/i.exec(auth);
  if (!m) return null;
  var res = await fetch(env("SUPABASE_URL") + "/auth/v1/user", {
    headers: { apikey: env("SUPABASE_ANON_KEY"), Authorization: "Bearer " + m[1] }
  });
  if (!res.ok) return null;
  var u = await res.json();
  return u && u.id ? { id: u.id, email: u.email || "" } : null;
}

function sameOrigin(req) {
  var origin = req.headers.origin;
  if (!origin) return true;
  var host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim().toLowerCase();
  try {
    return new URL(origin).host.toLowerCase() === host;
  } catch (e) {
    return false;
  }
}

function siteOrigin(req) {
  var host = String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
  var proto = String(req.headers["x-forwarded-proto"] || "https").split(",")[0].trim();
  return proto + "://" + host;
}

function readJson(req, max) {
  max = max || 4096;
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) return Promise.resolve(req.body);
  if (typeof req.body === "string") {
    try { return Promise.resolve(JSON.parse(req.body || "{}")); } catch (e) { return Promise.reject(e); }
  }
  return new Promise(function (resolve, reject) {
    var chunks = [], size = 0;
    req.on("data", function (c) {
      size += c.length;
      if (size > max) { reject(new Error("too large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", function () {
      var raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) { resolve({}); return; }
      try { resolve(JSON.parse(raw)); } catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

function fail(res, e) {
  if (e && e.notConfigured) return send(res, 503, { error: "Billing is not switched on yet." });
  /* Stripe's own messages never include keys or card details, and they say
     exactly what to fix (a missing permission, tax setting, unknown customer) */
  if (e && e.stripe) return send(res, 502, { error: "Payment setup problem: " + String(e.message || "").slice(0, 300) });
  if (e && /^database error/.test(String(e.message))) return send(res, 500, { error: "Account lookup failed (" + String(e.message).slice(0, 120) + "). Please try again." });
  return send(res, 500, { error: "Something went wrong. Please try again." });
}

module.exports = {
  PLANS: PLANS, env: env, send: send, stripe: stripe, supabaseAdmin: supabaseAdmin,
  userFromRequest: userFromRequest, sameOrigin: sameOrigin, siteOrigin: siteOrigin,
  readJson: readJson, fail: fail
};
