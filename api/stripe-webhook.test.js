"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var crypto = require("node:crypto");

var t = require("./stripe-webhook.js")._test;

function sign(body, secret, ts) {
  var v1 = crypto.createHmac("sha256", secret).update(ts + "." + body).digest("hex");
  return "t=" + ts + ",v1=" + v1;
}

test("a correctly signed body is accepted", function () {
  var body = JSON.stringify({ id: "evt_1" });
  assert.equal(t.verify(Buffer.from(body), sign(body, "whsec_x", 1000), "whsec_x", 1000), true);
});

test("a wrong secret, a changed body or an old timestamp is rejected", function () {
  var body = JSON.stringify({ id: "evt_1" });
  assert.equal(t.verify(Buffer.from(body), sign(body, "whsec_other", 1000), "whsec_x", 1000), false);
  assert.equal(t.verify(Buffer.from(body + " "), sign(body, "whsec_x", 1000), "whsec_x", 1000), false);
  assert.equal(t.verify(Buffer.from(body), sign(body, "whsec_x", 1000), "whsec_x", 1000 + 301), false);
  assert.equal(t.verify(Buffer.from(body), "", "whsec_x", 1000), false);
});

test("an active subscription gives the plan's property limit", function () {
  var p = t.planFrom({
    id: "sub_1", status: "active", current_period_end: 1800000000,
    items: { data: [{ price: { metadata: { property_limit: "4" } } }] }
  });
  assert.equal(p.subscription_status, "active");
  assert.equal(p.property_limit, 4);
  assert.equal(p.stripe_subscription_id, "sub_1");
  assert.ok(p.plan_period_end);
});

test("a cancelled or unpaid subscription drops back to the free limit", function () {
  var base = { id: "sub_1", items: { data: [{ price: { metadata: { property_limit: "5" } } }] } };
  var c = t.planFrom(Object.assign({ status: "canceled" }, base));
  assert.equal(c.subscription_status, "canceled");
  assert.equal(c.property_limit, 1);
  assert.equal(t.planFrom(Object.assign({ status: "past_due" }, base)).subscription_status, "past_due");
  assert.equal(t.planFrom(Object.assign({ status: "incomplete" }, base)).subscription_status, "free");
});

test("events find their subscription", function () {
  assert.equal(t.subscriptionIdOf({ type: "customer.subscription.updated", data: { object: { id: "sub_9" } } }), "sub_9");
  assert.equal(t.subscriptionIdOf({ type: "checkout.session.completed", data: { object: { mode: "subscription", subscription: "sub_2" } } }), "sub_2");
  assert.equal(t.subscriptionIdOf({ type: "checkout.session.completed", data: { object: { mode: "payment" } } }), null);
  assert.equal(t.subscriptionIdOf({ type: "invoice.paid", data: { object: { parent: { subscription_details: { subscription: "sub_3" } } } } }), "sub_3");
  assert.equal(t.subscriptionIdOf({ type: "charge.succeeded", data: { object: {} } }), null);
});
