/**
 * Opens Stripe's Customer Portal (change plan, update card, cancel, see
 * invoices) for the signed-in user.
 *
 * POST with header Authorization: Bearer <Supabase access token>
 * -> { url }
 *
 * The portal's look and what it allows are set in the Stripe dashboard under
 * Settings, Billing, Customer portal.
 */
"use strict";

var b = require("./_billing");

function openPortal(customerId, origin) {
  return b.stripe("POST", "/billing_portal/sessions", {
    customer: customerId,
    return_url: origin + "/account"
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return b.send(res, 405, { error: "Method not allowed" });
  if (!b.sameOrigin(req)) return b.send(res, 403, { error: "Forbidden" });

  try {
    var user = await b.userFromRequest(req);
    if (!user) return b.send(res, 401, { error: "Please sign in first." });

    var rows = await b.supabaseAdmin("GET", "profiles?id=eq." + encodeURIComponent(user.id) + "&select=stripe_customer_id");
    var customerId = rows && rows[0] && rows[0].stripe_customer_id;
    if (!customerId) return b.send(res, 404, { error: "There is no billing to manage yet." });

    var origin = b.siteOrigin(req);
    var session;
    try {
      session = await openPortal(customerId, origin);
    } catch (e) {
      /* Stripe has no portal set up yet for this mode: create a plain one
         (cancel, card, invoices) once, then try again */
      if (!/configuration/i.test(String(e && e.message))) throw e;
      await b.stripe("POST", "/billing_portal/configurations", {
        business_profile: { headline: "Manage your Project Carter plan" },
        default_return_url: origin + "/account",
        features: {
          customer_update: { enabled: true, allowed_updates: ["name", "email", "address", "phone", "tax_id"] },
          invoice_history: { enabled: true },
          payment_method_update: { enabled: true },
          subscription_cancel: { enabled: true, mode: "at_period_end" }
        }
      });
      session = await openPortal(customerId, origin);
    }
    return b.send(res, 200, { url: session.url });
  } catch (e) {
    return b.fail(res, e);
  }
};
