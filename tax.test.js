"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var vm = require("node:vm");

vm.runInThisContext(
  fs.readFileSync(path.join(__dirname, "tax.js"), "utf8"),
  { filename: "tax.js" }
);

var T = globalThis.pcTax;

function near(actual, expected, tol, msg) {
  assert.ok(Math.abs(actual - expected) <= tol, (msg || "") + " expected ~" + expected + " got " + actual);
}

/* ---- land tax ---------------------------------------------------------- */

test("NSW general: nil at threshold, $2,100 at $1.2m, premium base checks out", function () {
  assert.equal(T.landTax("NSW", "individual", 1000000).tax, 0);
  assert.equal(T.landTax("NSW", "individual", 1200000).tax, 2100);
  near(T.landTax("NSW", "individual", 6571000).tax, 88036, 1);
});

test("NSW special trust pays from the first dollar", function () {
  assert.equal(T.landTax("NSW", "trust", 500000).tax, 8000);
});

test("QLD individual vs company/trust at $1m", function () {
  assert.equal(T.landTax("QLD", "individual", 1000000).tax, 4500);
  assert.equal(T.landTax("QLD", "trust", 1000000).tax, 12500);
  assert.equal(T.landTax("QLD", "company", 1000000).tax, 12500);
  assert.equal(T.landTax("QLD", "individual", 599999).tax, 0);
});

test("VIC general and trust at $500k", function () {
  assert.equal(T.landTax("VIC", "individual", 500000).tax, 1950);
  near(T.landTax("VIC", "trust", 500000).tax, 3588.5, 0.01);
  assert.equal(T.landTax("VIC", "individual", 40000).tax, 0);
});

test("VIC top bracket matches at $3m for general and trust", function () {
  assert.equal(T.landTax("VIC", "individual", 3000000).tax, 31650);
  assert.equal(T.landTax("VIC", "trust", 3000000).tax, 31650);
});

test("WA, SA and TAS spot checks", function () {
  assert.equal(T.landTax("WA", "individual", 500000).tax, 500);
  assert.equal(T.landTax("SA", "individual", 1000000).tax, 835);
  near(T.landTax("TAS", "individual", 300000).tax, 837.5, 0.001);
});

test("ACT and NT are not modelled", function () {
  assert.equal(T.landTax("ACT", "individual", 900000).modelled, false);
  assert.equal(T.landTax("NT", "individual", 900000).modelled, false);
});

test("every schedule is continuous at each bracket boundary", function () {
  Object.keys(T.LAND).forEach(function (st) {
    ["general", "trust"].forEach(function (kind) {
      var rows = T.LAND[st][kind];
      if (!rows) return;
      for (var i = 1; i < rows.length; i++) {
        var prev = rows[i - 1];
        var atBoundary = prev.base + (rows[i].from - prev.from) * prev.rate;
        /* flat-amount steps (VIC $500 -> $975, WA $0 -> $300) are real
           jumps in the published tables, not errors */
        if (prev.rate === 0) continue;
        /* the VIC trust table adds the general table's flat $500 / $975
           steps at $50k and $100k on top of the surcharge, so it jumps there */
        if (st === "VIC" && kind === "trust" && (rows[i].from === 50000 || rows[i].from === 100000)) continue;
        near(atBoundary, rows[i].base, 1, st + " " + kind + " boundary " + rows[i].from);
      }
    });
  });
});

test("portfolio aggregates by state and splits tax pro-rata", function () {
  var r = T.landTaxPortfolio([
    { id: "a", name: "A", state: "NSW", owner: "individual", landValue: 800000 },
    { id: "b", name: "B", state: "NSW", owner: "individual", landValue: 800000 },
    { id: "c", name: "C", state: "QLD", owner: "individual", landValue: 500000 }
  ], {});
  assert.equal(r.groups.length, 2);
  var nsw = r.groups.filter(function (g) { return g.state === "NSW"; })[0];
  assert.equal(nsw.tax, 8500);
  assert.equal(nsw.properties[0].share, 4250);
  assert.equal(r.totalTax, 8500);
});

test("thresholds do not stack across states or owner types", function () {
  var r = T.landTaxPortfolio([
    { id: "a", name: "A", state: "NSW", owner: "individual", landValue: 1000000 },
    { id: "b", name: "B", state: "QLD", owner: "individual", landValue: 590000 },
    { id: "c", name: "C", state: "NSW", owner: "company", landValue: 1000000 }
  ], {});
  assert.equal(r.totalTax, 0);
  assert.equal(r.groups.length, 3);
});

test("other land in a state joins the individual group", function () {
  var r = T.landTaxPortfolio([
    { id: "a", name: "A", state: "NSW", owner: "individual", landValue: 700000 }
  ], { NSW: 500000 });
  assert.equal(r.groups[0].total, 1200000);
  assert.equal(r.totalTax, 2100);
});

test("WA metro adds MRIT; missing state / unmodelled state are reported", function () {
  var r = T.landTaxPortfolio([
    { id: "a", name: "A", state: "WA", owner: "individual", landValue: 500000, waMetro: true },
    { id: "b", name: "B", state: "", owner: "individual", landValue: 500000 },
    { id: "c", name: "C", state: "ACT", owner: "individual", landValue: 500000 }
  ], {});
  near(r.totalTax, 500 + 280, 0.01);
  assert.equal(r.missingState.length, 1);
  assert.equal(r.unmodelled.length, 1);
});

/* ---- CGT: current law -------------------------------------------------- */

var base = {
  owner: "individual", purchaseDate: "2020-01-01", purchasePrice: 800000,
  acqCosts: 40000, improvements: 0, worksClaimed: 0,
  saleDate: "2026-12-01", salePrice: 1200000
};
var settings = { taxRatePct: 37, cpiPct: 2.5, sellingCostPct: 0 };

test("individual, held over 12 months: 50% discount then the flat tax rate", function () {
  var r = T.cgtEstimate(base, settings);
  assert.equal(r.gain, 360000);
  assert.equal(r.currentLaw.discountPct, 50);
  assert.equal(r.currentLaw.taxableGain, 180000);
  near(r.currentLaw.tax, 180000 * 0.37, 0.01);
  assert.equal(r.reform, null, "sale before 1 July 2027 has no reform column");
});

test("selling costs reduce the gain", function () {
  var r = T.cgtEstimate(base, { taxRatePct: 37, cpiPct: 2.5, sellingCostPct: 2 });
  assert.equal(r.gain, 360000 - 24000);
});

test("capital works claimed reduce the cost base (increase the gain)", function () {
  var r = T.cgtEstimate(Object.assign({}, base, { worksClaimed: 50000 }), settings);
  assert.equal(r.costBase, 790000);
  assert.equal(r.gain, 410000);
});

test("held 12 months or less: no discount", function () {
  var r = T.cgtEstimate(Object.assign({}, base, { purchaseDate: "2026-06-01" }), settings);
  assert.equal(r.currentLaw.discountPct, 0);
  assert.equal(r.reform, null);
});

test("12 months excludes both the purchase day and the sale day", function () {
  var mk = function (sale) {
    return T.cgtEstimate(Object.assign({}, base, { purchaseDate: "2025-06-20", saleDate: sale }), settings);
  };
  assert.equal(mk("2026-06-20").currentLaw.discountPct, 0, "exactly on the anniversary is still short");
  assert.equal(mk("2026-06-21").currentLaw.discountPct, 50, "the day after the anniversary qualifies");
});

test("an asset bought before 20 September 1985 is outside CGT today", function () {
  var r = T.cgtEstimate(Object.assign({}, base, { purchaseDate: "1984-01-01" }), settings);
  assert.equal(r.preCgt, true);
  assert.equal(r.currentLaw.tax, 0);
  assert.equal(T.cgtEstimate(base, settings).preCgt, false);
});

test("the result carries its inputs so the page can show the workings", function () {
  var r = T.cgtEstimate(Object.assign({}, base, { improvements: 20000, worksClaimed: 10000 }), settings);
  assert.equal(r.inputs.purchasePrice, 800000);
  assert.equal(r.inputs.acqCosts, 40000);
  assert.equal(r.inputs.improvements, 20000);
  assert.equal(r.inputs.worksClaimed, 10000);
  assert.equal(r.costBase, 800000 + 40000 + 20000 - 10000);
});

test("company: no discount, 30% flat, no reform column", function () {
  var r = T.cgtEstimate(Object.assign({}, base, { owner: "company", saleDate: "2028-01-01" }), settings);
  near(r.currentLaw.tax, 360000 * 0.30, 0.01);
  assert.equal(r.reform, null);
});

test("super fund: one-third discount at 15%", function () {
  var r = T.cgtEstimate(Object.assign({}, base, { owner: "super" }), settings);
  near(r.currentLaw.tax, 360000 * (2 / 3) * 0.15, 0.01);
});

test("a loss produces no tax and reports the loss", function () {
  var r = T.cgtEstimate(Object.assign({}, base, { salePrice: 700000 }), settings);
  assert.equal(r.currentLaw.tax, 0);
  assert.ok(r.loss > 0);
});

test("missing tax rate leaves an individual's tax unknown, not zero", function () {
  var r = T.cgtEstimate(base, { taxRatePct: null, cpiPct: 2.5, sellingCostPct: 0 });
  assert.equal(r.needsRate, true);
  assert.equal(r.currentLaw.tax, null);
});

test("missing purchase details are reported, not guessed", function () {
  var r = T.cgtEstimate({ owner: "individual", salePrice: 900000 }, settings);
  assert.equal(r.ready, false);
  assert.deepEqual(r.missing, ["purchase price", "purchase date"]);
});

/* ---- CGT: the 1 July 2027 reform --------------------------------------- */

test("straddling 1 July 2027: pre-portion discounted, post-portion indexed", function () {
  var r = T.cgtEstimate(
    Object.assign({}, base, { saleDate: "2028-01-01", v27: 1000000 }),
    settings
  );
  assert.ok(r.reform);
  assert.equal(r.reform.preGain, 160000);
  near(r.reform.postGain, 187482, 30);
  near(r.reform.taxableAmount, 80000 + r.reform.postGain, 0.01);
  near(r.reform.tax, r.reform.taxableAmount * 0.37, 0.01);
  assert.equal(r.reform.v27Estimated, false);
});

test("estimated 1 July 2027 value sits between purchase price and sale price", function () {
  var r = T.cgtEstimate(Object.assign({}, base, { saleDate: "2029-07-01" }), settings);
  assert.ok(r.reform.v27Estimated);
  assert.ok(r.reform.v27 > 800000 && r.reform.v27 < 1200000);
});

test("minimum 30% tax floors a low-rate holder's tax", function () {
  var r = T.cgtEstimate(
    { owner: "individual", purchaseDate: "2027-08-01", purchasePrice: 1000000, saleDate: "2028-08-02", salePrice: 1050000 },
    { taxRatePct: 19, cpiPct: 2.5, sellingCostPct: 0 }
  );
  near(r.reform.postGain, 24900, 150);
  near(r.reform.tax, r.reform.postGain * 0.30, 0.5);
  assert.equal(r.reform.floorApplied, true);
});

test("the minimum tax is not flagged when the normal rate already exceeds it", function () {
  var r = T.cgtEstimate(Object.assign({}, base, { saleDate: "2028-01-01", v27: 1000000 }), settings);
  assert.equal(r.reform.floorApplied, false);
});

test("indexation cannot turn a gain into a loss", function () {
  var r = T.cgtEstimate(
    { owner: "individual", purchaseDate: "2027-08-01", purchasePrice: 1000000, saleDate: "2029-08-01", salePrice: 1010000 },
    { taxRatePct: 37, cpiPct: 2.5, sellingCostPct: 0 }
  );
  assert.equal(r.reform.postGain, 0);
});

test("new build takes the cheaper of the two regimes", function () {
  var flat = Object.assign({}, base, { saleDate: "2029-07-01", newBuild: true });
  var r = T.cgtEstimate(flat, settings);
  assert.ok(r.reform.election === "discount" || r.reform.election === "indexation");
  assert.ok(r.reform.tax <= r.currentLaw.tax + 0.01);
});

test("portfolio totals skip unready rows and flag a missing tax rate", function () {
  var a = T.cgtEstimate(base, settings);
  var b = T.cgtEstimate({ owner: "individual" }, settings);
  var t = T.cgtPortfolio([a, b]);
  assert.equal(t.count, 1);
  near(t.currentTax, 180000 * 0.37, 0.01);
  var t2 = T.cgtPortfolio([T.cgtEstimate(base, { taxRatePct: null })]);
  assert.equal(t2.needsRate, true);
});

/* ---- the rules follow the sale date ------------------------------------ */

test("a sale before 1 July 2027 uses current law and the tax equals it", function () {
  var r = T.cgtEstimate(base, settings);
  assert.equal(r.rules, "current");
  assert.equal(r.tax, r.currentLaw.tax);
});

test("a sale after 1 July 2027 uses the new rules for an individual, not the 50% discount", function () {
  var r = T.cgtEstimate(Object.assign({}, base, { saleDate: "2028-01-01", v27: 1000000 }), settings);
  assert.equal(r.rules, "new");
  assert.equal(r.tax, r.reform.tax);
});

test("a company is 30% with no discount whatever the sale date, and ignores the personal rate", function () {
  var early = T.cgtEstimate(Object.assign({}, base, { owner: "company" }), settings);
  var late = T.cgtEstimate(Object.assign({}, base, { owner: "company", saleDate: "2028-01-01" }), settings);
  var other = T.cgtEstimate(Object.assign({}, base, { owner: "company" }), Object.assign({}, settings, { taxRatePct: 45 }));
  near(early.tax, 360000 * 0.30, 0.01);
  near(late.tax, 360000 * 0.30, 0.01);
  assert.equal(early.tax, other.tax);
  assert.equal(early.rules, "current");
});

test("held 12 months or less is taxed in full at the rate, before and after 2027", function () {
  var r = T.cgtEstimate(Object.assign({}, base, { purchaseDate: "2027-09-01", saleDate: "2028-03-01" }), settings);
  assert.equal(r.currentLaw.discountPct, 0);
  near(r.tax, r.gain * 0.37, 0.01);
});

test("portfolio tax total follows each property's own rules", function () {
  var a = T.cgtEstimate(base, settings);
  var b = T.cgtEstimate(Object.assign({}, base, { owner: "company" }), settings);
  var t = T.cgtPortfolio([a, b]);
  near(t.tax, a.tax + b.tax, 0.01);
});

/* ---- land tax: a separate entity is a separate taxpayer ------------------ */

test("properties in different entities get their own land tax threshold", function () {
  var same = T.landTaxPortfolio([
    { id: "a", name: "A", state: "NSW", owner: "company", landValue: 900000, entity: "" },
    { id: "b", name: "B", state: "NSW", owner: "company", landValue: 900000, entity: "" }
  ], {});
  var split = T.landTaxPortfolio([
    { id: "a", name: "A", state: "NSW", owner: "company", landValue: 900000, entity: "Alpha Pty Ltd" },
    { id: "b", name: "B", state: "NSW", owner: "company", landValue: 900000, entity: "Beta Pty Ltd" }
  ], {});
  assert.equal(same.groups.length, 1);
  assert.equal(split.groups.length, 2);
  assert.equal(split.groups[0].entity, "Alpha Pty Ltd");
  assert.ok(split.totalTax <= same.totalTax, "splitting across entities never raises land tax");
});

test("the same entity name (any case) is grouped together", function () {
  var r = T.landTaxPortfolio([
    { id: "a", name: "A", state: "NSW", owner: "company", landValue: 900000, entity: "Alpha Pty Ltd" },
    { id: "b", name: "B", state: "NSW", owner: "company", landValue: 900000, entity: "alpha pty ltd" }
  ], {});
  assert.equal(r.groups.length, 1);
});
