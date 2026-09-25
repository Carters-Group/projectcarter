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
  /* land tax on the pair (NSW, $1.1M combined land) comes off cash flow too */
  near(t.landTaxFlow, 500, 0.001);
  near(t.cashFlow, 70000 - 13000 - 500 - 45000, 0.001);
});

test("each property's cash flow in the portfolio carries its share of land tax", function () {
  var r = P.build([houseA, houseB], settings, TODAY);
  near(r.props[0].cashFlow, 40000 - 8000 - 30000 - r.props[0].landTaxShare, 0.001);
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
  assert.equal(s.netRentalIncome, 70000 - 13000 - 500);
  assert.equal(s.grossRentalIncome, 70000);
  assert.equal(s.annualSurplus, 11500);
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

test("a sold property leaves every portfolio figure but keeps its realised tax", function () {
  var soldA = Object.assign({}, houseA, { is_sold: true, planned_sale_date: "2026-08-01", expected_sale_price: 950000 });
  var r = P.build([soldA, houseB], settings, TODAY);
  assert.equal(r.totals.count, 1);
  assert.equal(r.totals.value, 600000);
  assert.equal(r.totals.rent, 30000);
  assert.equal(r.totals.soldProperties, 1);
  assert.equal(r.props.length, 2);
  assert.equal(r.props[0].sold, true);
  /* land tax is only on what is still held: houseB's $500k is under the NSW threshold */
  assert.equal(r.totals.landTax, 0);
  assert.deepEqual(r.realised.years, ["2026-27"]);
  var y = r.realised.byYear["2026-27"];
  assert.equal(y.props.length, 1);
  assert.ok(y.tax > 0);
  assert.equal(y.tax, r.props[0].sale.tax);
});

test("financial year follows the contract date", function () {
  assert.equal(P.financialYear("2026-06-30"), "2025-26");
  assert.equal(P.financialYear("2026-07-01"), "2026-27");
});

/* ---- your home (usage "home") ------------------------------------------ */
var myHome = {
  id: "h", name: "Our home", state: "NSW", ownership_type: "individual", usage: "home",
  purchase_date: "2018-03-01", purchase_price: 1000000, acquisition_costs: 45000,
  current_value: 1400000, loan_balance: 600000, interest_rate: 6, annual_running_costs: 7000,
  land_value: 1100000
};

test("a home has a holding cost, no rent, no cash flow and no capital gains tax", function () {
  var m = P.propertyMetrics(myHome, settings, TODAY);
  assert.equal(m.home, true);
  assert.equal(m.rent, null);
  assert.equal(m.cashFlow, null);
  assert.equal(m.homeCost, 7000 + 36000);
  assert.equal(m.totalCost, 1045000);
  assert.equal(m.growth.afterCosts, 355000);
  assert.equal(m.sale.exempt, true);
  assert.equal(m.sale.tax, 0);
  assert.equal(m.sale.cgt, null);
  assert.equal(m.sale.cashIfSold, 1400000 * 0.98 - 600000);
});

test("a commercial property is never treated as a home", function () {
  var shop = Object.assign({}, myHome, { property_type: "commercial" });
  assert.equal(P.propertyMetrics(shop, settings, TODAY).home, false);
});

test("the home counts toward what you own but not toward investment figures", function () {
  var r = P.build([myHome, houseA], settings, TODAY);
  var t = r.totals;
  /* what you own: both */
  assert.equal(t.value, 2300000);
  assert.equal(t.debt, 1100000);
  near(t.usable80, 740000, 0.01);
  assert.equal(r.summary.usableEquity80, Math.round(t.usable80));
  /* investments: houseA only */
  assert.equal(t.invest.count, 1);
  assert.equal(t.invest.value, 900000);
  assert.equal(t.rent, 40000);
  assert.equal(t.cashFlowCount, 1);
  assert.equal(t.complete, true);
  near(t.grossYield, 40000 / 900000 * 100, 0.0001);
  assert.equal(r.summary.investmentValue, 900000);
  assert.equal(r.summary.investmentDebt, 500000);
  /* home on its own */
  assert.equal(t.home.count, 1);
  assert.equal(t.home.cost, 43000);
  assert.equal(r.summary.homeCostAnnual, 43000);
  /* no rent to chase on a home, and it is exempt from land tax */
  assert.deepEqual(r.missing.rent, []);
  assert.equal(r.props[0].landTaxShare, null);
  assert.equal(r.props[1].sale.cgt.ready, true);
});

test("a home on its own: equity to borrow against, no investment portfolio yet", function () {
  var r = P.build([myHome], settings, TODAY);
  assert.equal(r.totals.counted, 1);
  assert.equal(r.totals.invest.count, 0);
  assert.equal(r.totals.complete, false);
  assert.equal(r.totals.cashFlowCount, 0);
  near(r.totals.usable70, 380000, 0.01);
  assert.equal(r.totals.landTax, 0);
});

test("a former home keeps its moved-out date for the capital gains note", function () {
  var rented = Object.assign({}, houseA, { moved_out_date: "2024-01-15" });
  assert.equal(P.propertyMetrics(rented, settings, TODAY).movedOut, "2024-01-15");
});

/* ---- loan structure: interest only vs principal and interest ------------- */
test("P&I repayment matches the standard formula ($500k, 6%, 30 years)", function () {
  near(P.monthlyRepayment(500000, 6, 30), 2997.75, 0.01);
  near(P.monthlyRepayment(120000, 0, 10), 1000, 0.0001);
});

test("a P&I loan: first-year interest and principal, cost vs cash out", function () {
  var pi = Object.assign({}, myHome, { loan_balance: 500000, loan_type: "pi", loan_years_left: 30 });
  var m = P.propertyMetrics(pi, settings, TODAY);
  near(m.monthly, 2997.75, 0.01);
  near(m.interest + m.principal, 2997.75 * 12, 0.1);
  near(m.principal, 6140, 15);
  assert.ok(m.interest < 30000);
  /* cost to own is running costs + interest; cash out adds the principal */
  near(m.homeCost, 7000 + m.interest, 0.001);
  near(m.homeCashOut, m.homeCost + m.principal, 0.001);
});

test("interest only by default: no principal, repayment is the interest", function () {
  var m = P.propertyMetrics(houseA, settings, TODAY);
  assert.equal(m.loanType, "io");
  assert.equal(m.principal, 0);
  assert.equal(m.repayment, 30000);
  assert.equal(m.interest, 30000);
});

test("P&I with no years left entered is flagged, not guessed", function () {
  var shop = Object.assign({}, houseA, { id: "s", name: "Shop", property_type: "commercial", loan_type: "pi" });
  var m = P.propertyMetrics(shop, settings, TODAY);
  assert.equal(m.termMissing, true);
  assert.equal(m.principal, null);
  var r = P.build([shop], settings, TODAY);
  assert.deepEqual(r.missing.term, ["Shop"]);
  assert.equal(r.totals.repayKnown, false);
});

test("investment cash flow before tax ignores principal; after repayments takes it off", function () {
  var pi = Object.assign({}, houseA, { loan_type: "pi", loan_years_left: 25 });
  var r = P.build([pi], settings, TODAY);
  var m = r.props[0], t = r.totals;
  near(t.cashFlow, 40000 - 8000 - m.interest - (m.landTaxShare || 0), 0.01);
  near(t.cashFlowAfterRepay, t.cashFlow - m.principal, 0.01);
  assert.equal(t.anyPI, true);
  assert.equal(r.summary.investPiDebt, 500000);
  near(r.summary.investPiMonthly, P.monthlyRepayment(500000, 6, 25), 0.01);
});

test("the home's principal is kept apart from the investment figures", function () {
  var home = Object.assign({}, myHome, { loan_type: "pi", loan_years_left: 30 });
  var r = P.build([home, houseA], settings, TODAY);
  assert.equal(r.totals.principal, 0);
  assert.ok(r.totals.home.principal > 0);
  near(r.totals.home.cashOut, r.totals.home.cost + r.totals.home.principal, 0.001);
  assert.equal(r.totals.loans.length, 2);
});

test("debt payoff: P&I clears on schedule, interest only never clears alone", function () {
  var pi = P.debtPayoff([{ balance: 500000, ratePct: 6, monthly: P.monthlyRepayment(500000, 6, 30) }], 0);
  assert.equal(pi.cleared, true);
  near(pi.years, 30, 0.01);
  near(pi.interest, 2997.75 * 360 - 500000, 5);
  var io = P.debtPayoff([{ balance: 500000, ratePct: 6, monthly: 0 }], 0);
  assert.equal(io.cleared, false);
  var extra = P.debtPayoff([{ balance: 500000, ratePct: 6, monthly: P.monthlyRepayment(500000, 6, 30) }], 12000);
  assert.ok(extra.cleared && extra.years < 20 && extra.interest < pi.interest);
  assert.equal(P.debtPayoff([], 5000).cleared, true);
});

test("debt payoff rolls a cleared loan's repayment onto the next", function () {
  var small = { balance: 20000, ratePct: 5, monthly: P.monthlyRepayment(20000, 5, 2) };
  var big = { balance: 300000, ratePct: 6, monthly: 0 };
  var r = P.debtPayoff([small, big], 12000);
  assert.equal(r.cleared, true);
  var noRoll = P.debtPayoff([big], 12000);
  assert.ok(r.years < noRoll.years + 2);
});
