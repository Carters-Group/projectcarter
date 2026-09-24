/**
 * Upgrade to a bigger plan on the customer's existing subscription.
 *
 * POST JSON { plan, confirm? } with header Authorization: Bearer <Supabase access token>
 *   plan     one of the lookup keys in _billing.js PLANS, with MORE properties than they have now
 *   confirm  false or missing: only price it. true: do it.
 *
 * Price it -> { amount_due, currency, properties }
 *   the amount charged today: the new price less credit for the unused part of
 *   the current plan (Stripe works this out).
 * Do it    -> { ok: true, properties }
 *   the subscription moves to the new price, a fresh 12 months starts today and
 *   the credit is applied, so nobody pays twice for the same time. The webhook
 *   then writes the new property limit and dates, as for any other change.
 */
"use strict";

var b = require("./_billing");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return b.send(res, 405, { error: "Method not allowed" });
  if (!b.sameOrigin(req)) return b.send(res, 403, { error: "Forbidden" });

  try {
    var user = await b.userFromRequest(req);
    if (!user) return b.send(res, 401, { error: "Please sign in first." });

    var body = await b.readJson(req);
    var plan = String(body.plan || "");
    if (!b.PLANS[plan]) return b.send(res, 400, { error: "Unknown plan." });

    var rows = await b.supabaseAdmin("GET", "profiles?id=eq." + encodeURIComponent(user.id) +
      "&select=subscription_status,property_limit,stripe_subscription_id");
    var profile = rows && rows[0];
    var paid = profile && (profile.subscription_status === "active" || profile.subscription_status === "trialing");
    if (!paid || !profile.stripe_subscription_id) {
      return b.send(res, 409, { error: "You do not have an active plan to change." });
    }

    var target = b.PLANS[plan].properties;
    if (target <= (profile.property_limit || 1)) {
      return b.send(res, 400, { error: "Choose a plan with more properties than you have now." });
    }

    var sub = await b.stripe("GET", "/subscriptions/" + encodeURIComponent(profile.stripe_subscription_id));
    var item = sub.items && sub.items.data && sub.items.data[0];
    if (!item) return b.send(res, 409, { error: "We could not find your current plan." });

    var prices = await b.stripe("GET", "/prices", { lookup_keys: [plan], active: true, limit: 1 });
    var price = prices.data && prices.data[0];
    if (!price) return b.send(res, 500, { error: "That plan is not available right now." });

    if (!body.confirm) {
      var preview = await b.stripe("POST", "/invoices/create_preview", {
        subscription: sub.id,
        subscription_details: {
          items: [{ id: item.id, price: price.id }],
          billing_cycle_anchor: "now",
          proration_behavior: "always_invoice"
        }
      });
      return b.send(res, 200, { amount_due: preview.amount_due, currency: preview.currency, properties: target });
    }

    await b.stripe("POST", "/subscriptions/" + encodeURIComponent(sub.id), {
      items: [{ id: item.id, price: price.id }],
      billing_cycle_anchor: "now",
      proration_behavior: "always_invoice",
      payment_behavior: "error_if_incomplete",
      metadata: { user_id: user.id, plan: plan }
    });
    return b.send(res, 200, { ok: true, properties: target });
  } catch (e) {
    /* a declined card is worth saying plainly; anything else stays generic */
    if (e && e.status === 402) return b.send(res, 402, { error: String(e.message || "Your card was declined.").slice(0, 200) });
    /* a restricted Stripe key missing a permission says so plainly, so it can be fixed */
    if (e && e.status === 403) return b.send(res, 503, { error: "Billing needs a permission added in Stripe: " + String(e.message).slice(0, 220) });
    return b.fail(res, e);
  }
};
