"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var vm = require("node:vm");

["tax.js", "portfolio.js"].forEach(function (f) {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, f), "utf8"), { filename: f });
});

var P = globalThis.pcPortfolio;
var TODAY = "2026-09-19";
var settings = { tax_rate_pct: 37, cpi_pct: 2.5, selling_cost_pct: 2 };

function near(actual, expected, tol, msg) {
  assert.ok(Math.abs(actual - expected) <= tol, (msg || "") + " expected ~" + expected + " got " + actual);
}

var houseA = {
  id: "a", name: "12 Smith St", state: "NSW", ownership_type: "individual",
  purchase_date: "2020-09-19", purchase_price: 700000, acquisition_costs: 30000,
  current_value: 900000, loan_balance: 500000, interest_rate: 6, annual_running_costs: 8000,
  land_value: 600000,
  leases: [{ annual_rent: 40000, lease_expiry: "2027-06-01" }]
};

test("one property: equity, LVR, useable equity, yield", function () {
  var m = P.propertyMetrics(houseA, settings, TODAY);
  assert.equal(m.equity, 400000);
  near(m.lvr, 55.5556, 0.001);
  assert.equal(m.usable70, 130000);
  assert.equal(m.usable80, 220000);
  near(m.grossYield, 4.4444, 0.001);
});

test("cash flow is rent less running costs less interest", function () {
  var m = P.propertyMetrics(houseA, settings, TODAY);
  assert.equal(m.interest, 30000);
  assert.equal(m.cashFlow, 40000 - 8000 - 30000);
});

test("growth since purchase, total and per year", function () {
  var m = P.propertyMetrics(houseA, settings, TODAY);
  assert.equal(m.growth.amount, 200000);
  near(m.growth.pct, 28.571, 0.01);
  near(m.growth.perYearPct, 4.29, 0.05);
});

test("an expired lease no longer counts as rent", function () {
  var expired = Object.assign({}, houseA, { leases: [{ annual_rent: 40000, lease_expiry: "2026-01-01" }] });
  var m = P.propertyMetrics(expired, settings, TODAY);
  assert.equal(m.rent, null);
  assert.equal(m.cashFlow, null);
});

test("a periodic lease counts even with no expiry", function () {
  var periodic = Object.assign({}, houseA, { leases: [{ annual_rent: 26000, is_periodic: true }] });
  assert.equal(P.propertyMetrics(periodic, settings, TODAY).rent, 26000);
});

test("no lease entered means rent is unknown, not zero", function () {
  var none = Object.assign({}, houseA, { leases: [] });
  var m = P.propertyMetrics(none, settings, TODAY);
  assert.equal(m.rent, null);
  assert.equal(m.grossYield, null);
});

test("a blank loan is unknown, a zero loan is a property with no loan", function () {
  var blank = P.propertyMetrics(Object.assign({}, houseA, { loan_balance: "" }), settings, TODAY);
  assert.equal(blank.equity, null);
  assert.equal(blank.interest, null);
  var zero = P.propertyMetrics(Object.assign({}, houseA, { loan_balance: 0, interest_rate: "" }), settings, TODAY);
  assert.equal(zero.equity, 900000);
  assert.equal(zero.interest, 0);
  assert.equal(zero.cashFlow, 32000);
});

test("cash in hand if sold: net proceeds less loan less capital gains tax", function () {
  var m = P.propertyMetrics(houseA, settings, TODAY);
  var cgt = m.sale.cgt;
  assert.ok(cgt.ready);
  near(m.sale.proceeds, 882000, 0.5);
  assert.equal(m.sale.cashIfSold, m.sale.proceeds - 500000 - m.sale.tax);
  assert.ok(m.sale.tax > 0);
});

test("without other income the tax is unknown but cash before tax is still shown", function () {
  var m = P.propertyMetrics(houseA, { tax_rate_pct: null, selling_cost_pct: 2 }, TODAY);
  assert.equal(m.sale.tax, null);
  assert.equal(m.sale.cashIfSold, null);
  near(m.sale.cashBeforeTax, 882000 - 500000, 0.5);
});

test("a blank sale price defaults to current value", function () {
  var m = P.propertyMetrics(houseA, settings, TODAY);
  assert.equal(m.sale.price, 900000);
  var custom = P.propertyMetrics(Object.assign({}, houseA, { expected_sale_price: 1000000 }), settings, TODAY);
  assert.equal(custom.sale.price, 1000000);
});

var houseB = {
  id: "b", name: "Unit 4", state: "NSW", ownership_type: "individual",
  current_value: 600000, loan_balance: 300000, interest_rate: 5, annual_running_costs: 5000,
  land_value: 500000, leases: [{ annual_rent: 30000 }]
};

test("portfolio totals and blended rate", function () {
  var r = P.build([houseA, houseB], settings, TODAY);
  var t = r.totals;
  assert.equal(t.value, 1500000);
  assert.equal(t.debt, 800000);
  assert.equal(t.equity, 700000);
  near(t.lvr, 53.333, 0.01);
  assert.equal(t.usable70, 250000);
  assert.equal(t.usable80, 400000);
  assert.equal(t.rent, 70000);
  assert.equal(t.interest, 30000 + 15000);
  near(t.blendedRate, 45000 / 800000, 1e-9);
  assert.equal(t.cashFlow, 70000 - 13000 - 45000);
});

test("land tax aggregates across properties in the same state", function () {
  var r = P.build([houseA, houseB], settings, TODAY);
  assert.equal(r.totals.landTax, 100 + (1100000 - 1075000) * 0.016);
  near(r.props[0].landTaxShare + r.props[1].landTaxShare, r.totals.landTax, 0.001);
});

test("properties missing a value or loan are excluded and named, not guessed", function () {
  var r = P.build([houseA, { id: "c", name: "Vacant block" }, { id: "d", name: "No loan yet", current_value: 400000 }], settings, TODAY);
  assert.equal(r.totals.counted, 1);
  assert.equal(r.totals.value, 900000);
  assert.deepEqual(r.missing.value, ["Vacant block"]);
  assert.deepEqual(r.missing.loan, ["No loan yet"]);
});

test("summary carries the fields the calculators and plan read", function () {
  var s = P.build([houseA, houseB], settings, TODAY).summary;
  assert.equal(s.usableEquity70, 250000);
  assert.equal(s.usableEquity80, 400000);
  assert.equal(s.portfolioValue, 1500000);
  assert.equal(s.portfolioDebt, 800000);
  assert.equal(s.netRentalIncome, 70000 - 13000);
  assert.equal(s.grossRentalIncome, 70000);
  assert.equal(s.annualSurplus, 12000);
  assert.equal(s.propertyCount, 2);
});

test("cash flow only counts properties whose balance sheet is counted, so both halves match", function () {
  var noValue = { id: "z", name: "No value", loan_balance: 100000, interest_rate: 6, leases: [{ annual_rent: 20000 }] };
  var r = P.build([houseA, noValue], settings, TODAY);
  assert.equal(r.totals.counted, 1);
  assert.equal(r.totals.cashFlowCount, 1);
  assert.equal(r.totals.rent, 40000);
  assert.equal(r.totals.flowDebt, 500000);
});

test("the portfolio is complete only when every counted property has rent and interest", function () {
  assert.equal(P.build([houseA, houseB], settings, TODAY).totals.complete, true);
  var noRent = Object.assign({}, houseB, { leases: [] });
  assert.equal(P.build([houseA, noRent], settings, TODAY).totals.complete, false);
  assert.equal(P.build([], settings, TODAY).totals.complete, false);
});

test("cash if sold sums only the properties that can be worked out", function () {
  var r = P.build([houseA, { id: "q", name: "Blank" }], settings, TODAY);
  assert.equal(r.totals.soldCount, 1);
  assert.equal(r.totals.cashIfSold, r.props[0].sale.cashIfSold);
});

test("an empty portfolio is safe", function () {
  var r = P.build([], settings, TODAY);
  assert.equal(r.totals.count, 0);
  assert.equal(r.totals.value, 0);
  assert.equal(r.totals.lvr, null);
  assert.equal(r.summary.usableEquity70, 0);
});
