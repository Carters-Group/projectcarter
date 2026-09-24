/**
 * Stripe webhook: the one place a user's plan is written.
 *
 * Every relevant event just says "this subscription changed"; the handler
 * then re-reads the subscription from Stripe and writes the plan from it, so
 * duplicate, late or out-of-order events cannot leave a stale plan behind.
 *
 * Add in Stripe (Developers, Webhooks) pointing at /api/stripe-webhook with:
 *   checkout.session.completed
 *   customer.subscription.created / .updated / .deleted
 *   invoice.paid / invoice.payment_failed
 * and put its signing secret in Vercel as STRIPE_WEBHOOK_SECRET.
 */
"use strict";

var crypto = require("crypto");
var b = require("./_billing");

var TOLERANCE_SECONDS = 300;

function rawBody(req) {
  return new Promise(function (resolve, reject) {
    var chunks = [], size = 0;
    req.on("data", function (c) {
      size += c.length;
      if (size > 1024 * 1024) { reject(new Error("too large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", function () { resolve(Buffer.concat(chunks)); });
    req.on("error", reject);
  });
}

/* Stripe-Signature: t=<unix>,v1=<hex>[,v1=<hex>]  HMAC-SHA256 of "<t>.<body>" */
function verify(raw, header, secret, nowSeconds) {
  if (!header) return false;
  var t = null, sigs = [];
  String(header).split(",").forEach(function (part) {
    var kv = part.split("=");
    if (kv[0] === "t") t = kv[1];
    if (kv[0] === "v1") sigs.push(kv[1]);
  });
  if (!t || !sigs.length) return false;
  if (Math.abs((nowSeconds || Math.floor(Date.now() / 1000)) - Number(t)) > TOLERANCE_SECONDS) return false;
  var expected = crypto.createHmac("sha256", secret).update(t + "." + raw.toString("utf8")).digest("hex");
  var eb = Buffer.from(expected, "utf8");
  return sigs.some(function (s) {
    var sb = Buffer.from(s, "utf8");
    return sb.length === eb.length && crypto.timingSafeEqual(sb, eb);
  });
}

/* what the subscription means for the account */
function planFrom(sub) {
  var item = sub.items && sub.items.data && sub.items.data[0];
  var price = item && item.price;
  var limit = price && price.metadata && parseInt(price.metadata.property_limit, 10);
  var status = sub.status;
  /* past_due keeps the plan while Stripe retries the card (pc_is_paid agrees) */
  var paid = status === "active" || status === "trialing" || status === "past_due";
  var mapped = paid ? status
    : (status === "canceled" || status === "unpaid" || status === "incomplete_expired") ? "canceled"
    : "free";
  var end = sub.current_period_end || (item && item.current_period_end) || null;
  var out = {
    subscription_status: mapped,
    stripe_subscription_id: sub.id,
    plan_period_end: end ? new Date(end * 1000).toISOString() : null
  };
  /* a paid price without a property_limit (Done For You) leaves the limit set by hand alone */
  if (!paid) out.property_limit = 1;
  else if (limit > 0) out.property_limit = limit;
  return out;
}

async function syncSubscription(subscriptionId, hintedUserId) {
  var sub = await b.stripe("GET", "/subscriptions/" + encodeURIComponent(subscriptionId), { expand: ["items.data.price"] });
  var userId = (sub.metadata && sub.metadata.user_id) || hintedUserId || null;
  var filter;
  if (userId) {
    filter = "id=eq." + encodeURIComponent(userId);
  } else if (sub.customer) {
    filter = "stripe_customer_id=eq." + encodeURIComponent(typeof sub.customer === "string" ? sub.customer : sub.customer.id);
  } else {
    return "no user";
  }
  var plan = planFrom(sub);
  plan.stripe_customer_id = typeof sub.customer === "string" ? sub.customer : (sub.customer && sub.customer.id) || null;
  await b.supabaseAdmin("PATCH", "profiles?" + filter, plan);
  return plan.subscription_status;
}

function subscriptionIdOf(event) {
  var o = event.data && event.data.object;
  if (!o) return null;
  switch (event.type) {
    case "checkout.session.completed":
      return o.mode === "subscription" ? o.subscription : null;
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      return o.id;
    case "invoice.paid":
    case "invoice.payment_failed":
      return o.subscription ||
        (o.parent && o.parent.subscription_details && o.parent.subscription_details.subscription) || null;
    default:
      return null;
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return b.send(res, 405, { error: "Method not allowed" });

  var event;
  try {
    var secret = b.env("STRIPE_WEBHOOK_SECRET");
    var raw = await rawBody(req);
    if (!verify(raw, req.headers["stripe-signature"], secret)) return b.send(res, 400, { error: "Bad signature" });
    event = JSON.parse(raw.toString("utf8"));
  } catch (e) {
    return b.fail(res, e);
  }

  try {
    var subId = subscriptionIdOf(event);
    if (subId) {
      var hint = event.type === "checkout.session.completed" ? event.data.object.client_reference_id : null;
      await syncSubscription(subId, hint);
    }
    return b.send(res, 200, { received: true });
  } catch (e) {
    /* a non-200 makes Stripe retry, which is what we want for a temporary failure */
    /* the reason is safe to return: only Stripe's signed events reach this point */
    return b.send(res, 500, { error: "Could not process the event", detail: String(e && e.message || e).slice(0, 300) });
  }
};

module.exports.config = { api: { bodyParser: false } };
module.exports._test = { verify: verify, planFrom: planFrom, subscriptionIdOf: subscriptionIdOf };
