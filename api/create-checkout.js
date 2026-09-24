/**
 * Starts a Stripe Checkout (subscription) for a signed-in user.
 *
 * POST JSON { plan } with header Authorization: Bearer <Supabase access token>
 *   plan is one of the lookup keys in _billing.js PLANS.
 * -> { url }  send the browser to it.
 *
 * The plan the customer ends up on is written by api/stripe-webhook.js, never
 * by anything the browser says.
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
      "&select=subscription_status,stripe_customer_id,full_name");
    var profile = rows && rows[0];
    if (!profile) return b.send(res, 404, { error: "No account found." });

    if (profile.subscription_status === "active" || profile.subscription_status === "trialing") {
      return b.send(res, 409, { error: "You already have a plan. Use Manage billing to change it." });
    }
    if (profile.subscription_status === "past_due") {
      return b.send(res, 409, { error: "Your last payment did not go through. Update your card in Manage billing." });
    }

    /* renewing after a plan ended: the new plan has to cover what they already hold */
    var held = await b.supabaseAdmin("GET", "properties?user_id=eq." + encodeURIComponent(user.id) + "&select=id");
    var count = (held && held.length) || 0;
    if (b.PLANS[plan].properties < count) {
      return b.send(res, 400, { error: "You have " + count + " properties, so choose a plan that covers at least " + count + "." });
    }

    var customerId = profile.stripe_customer_id;
    if (!customerId) {
      var customer = await b.stripe("POST", "/customers", {
        email: user.email || undefined,
        name: profile.full_name || undefined,
        metadata: { user_id: user.id }
      });
      customerId = customer.id;
      await b.supabaseAdmin("PATCH", "profiles?id=eq." + encodeURIComponent(user.id), { stripe_customer_id: customerId });
    }

    var prices = await b.stripe("GET", "/prices", { "lookup_keys": [plan], active: true, limit: 1 });
    var price = prices.data && prices.data[0];
    if (!price) return b.send(res, 500, { error: "That plan is not available right now." });

    var origin = b.siteOrigin(req);
    var params = {
      mode: "subscription",
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{ price: price.id, quantity: 1 }],
      success_url: origin + "/account?checkout=success",
      cancel_url: origin + "/pricing?checkout=cancelled",
      allow_promotion_codes: true,
      /* shown above the Pay button, so renewal and refunds are clear before paying */
      custom_text: {
        submit: {
          message: "Renews automatically every 12 months, with a reminder email first. Cancel any time from your account and your plan runs to the end of the paid year. Payments are not refundable. " +
            "[Plans and Billing terms](" + origin + "/billing-terms)"
        }
      },
      subscription_data: { metadata: { user_id: user.id, plan: plan } },
      metadata: { user_id: user.id, plan: plan }
    };
    /* GST: switch on once Stripe Tax is set up in the dashboard */
    if (process.env.STRIPE_AUTOMATIC_TAX === "on") {
      params.automatic_tax = { enabled: true };
      params.customer_update = { address: "auto", name: "auto" };
      params.tax_id_collection = { enabled: true };
    }

    var session = await b.stripe("POST", "/checkout/sessions", params);
    return b.send(res, 200, { url: session.url });
  } catch (e) {
    return b.fail(res, e);
  }
};
