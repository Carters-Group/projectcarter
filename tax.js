/* =========================================================================
   Project Carter - land tax + capital gains tax estimators
   -------------------------------------------------------------------------
   Classic script (no modules). Exposes one global, pcTax. Pure functions, no
   DOM, so it can be unit-tested in node (see tax.test.js).

   LAND TAX: per-state general / trust schedules on unimproved (site) land
   value, aggregated per owner per state (thresholds do not stack across
   states). Schedules: NSW (2026, frozen thresholds), VIC (2024-2033 table),
   QLD (Queensland Revenue Office), WA / SA / TAS (2025-26). Estimate only.
   ACT and NT are not modelled.

   CAPITAL GAINS TAX: current law (50% discount for individuals/trusts, 33.3%
   for super, none for companies) alongside the 2026-27 Budget reform that
   applies from 1 July 2027 (announced, NOT yet confirmed as legislation):
   cost-base indexation + a 30% minimum tax on the net gain, with a split-gain
   transition for assets held across 1 July 2027 and a new-build election.
   Where the announcement is silent (exact apportionment formula, how the
   minimum tax interacts with the pre-2027 discounted portion) this makes a
   stated, editable assumption rather than guessing silently.
   ========================================================================= */
"use strict";

var pcTax = (function () {
  var REFORM_DATE = "2027-07-01";
  var PRE_CGT_DATE = "1985-09-20";
  var MS_YEAR = 365.25 * 86400000;

  var OWNERS = {
    individual: "Individual(s)",
    trust: "Family / discretionary trust",
    company: "Company",
    super: "Super fund (SMSF)"
  };
  var STATES = ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"];

  /* ---- land tax ------------------------------------------------------- */

  /* rows ascending by `from`; tax = base + (value - from) * rate for the
     highest row the value has reached */
  function bracketTax(v, rows) {
    var row = rows[0];
    for (var i = 0; i < rows.length; i++) { if (v >= rows[i].from) row = rows[i]; }
    return row.base + (v - row.from) * row.rate;
  }

  var LAND = {
    NSW: {
      period: "the 2026 land tax year (calendar year, land value averaged over three years)",
      general: [
        { from: 0, base: 0, rate: 0 },
        { from: 1075000, base: 100, rate: 0.016 },
        { from: 6571000, base: 88036, rate: 0.02 }
      ],
      /* special (discretionary) trusts: no tax-free threshold */
      trust: [
        { from: 0, base: 0, rate: 0.016 },
        { from: 6571000, base: 105136, rate: 0.02 }
      ]
    },
    VIC: {
      period: "the 2026 land tax year (calendar year, site value)",
      general: [
        { from: 0, base: 0, rate: 0 },
        { from: 50000, base: 500, rate: 0 },
        { from: 100000, base: 975, rate: 0 },
        { from: 300000, base: 1350, rate: 0.003 },
        { from: 600000, base: 2250, rate: 0.006 },
        { from: 1000000, base: 4650, rate: 0.009 },
        { from: 1800000, base: 11850, rate: 0.0165 },
        { from: 3000000, base: 31650, rate: 0.0265 }
      ],
      trust: [
        { from: 0, base: 0, rate: 0 },
        { from: 25000, base: 82, rate: 0.00375 },
        { from: 50000, base: 676, rate: 0.00375 },
        { from: 100000, base: 1338, rate: 0.00375 },
        { from: 250000, base: 1901, rate: 0.00675 },
        { from: 600000, base: 4263, rate: 0.00975 },
        { from: 1000000, base: 8163, rate: 0.01275 },
        { from: 1800000, base: 18363, rate: 0.011072 },
        { from: 3000000, base: 31650, rate: 0.0265 }
      ]
    },
    QLD: {
      period: "the land tax year ending 30 June (annual Valuer-General valuation)",
      general: [
        { from: 0, base: 0, rate: 0 },
        { from: 600000, base: 500, rate: 0.01 },
        { from: 1000000, base: 4500, rate: 0.0165 },
        { from: 3000000, base: 37500, rate: 0.0125 },
        { from: 5000000, base: 62500, rate: 0.0175 },
        { from: 10000000, base: 150000, rate: 0.0225 }
      ],
      trust: [
        { from: 0, base: 0, rate: 0 },
        { from: 350000, base: 1450, rate: 0.017 },
        { from: 2250000, base: 33750, rate: 0.015 },
        { from: 5000000, base: 75000, rate: 0.0225 },
        { from: 10000000, base: 187500, rate: 0.0275 }
      ]
    },
    WA: {
      period: "2025-26 (assessed as at 30 June)",
      general: [
        { from: 0, base: 0, rate: 0 },
        { from: 300000, base: 300, rate: 0 },
        { from: 420000, base: 300, rate: 0.0025 },
        { from: 1000000, base: 1750, rate: 0.009 },
        { from: 1800000, base: 8950, rate: 0.018 },
        { from: 5000000, base: 66550, rate: 0.02 },
        { from: 11000000, base: 186550, rate: 0.0267 }
      ],
      mritOver: 300000,
      mritRate: 0.0014
    },
    SA: {
      period: "2025-26 (thresholds are revalued each year)",
      general: [
        { from: 0, base: 0, rate: 0 },
        { from: 833000, base: 0, rate: 0.005 },
        { from: 1338000, base: 2525, rate: 0.01 },
        { from: 1946000, base: 8605, rate: 0.02 },
        { from: 3116000, base: 32005, rate: 0.024 }
      ]
    },
    TAS: {
      period: "2025-26",
      general: [
        { from: 0, base: 0, rate: 0 },
        { from: 125000, base: 50, rate: 0.0045 },
        { from: 500000, base: 1737.5, rate: 0.015 }
      ]
    }
  };

  function landTableFor(state, owner) {
    var s = LAND[state];
    if (!s) return null;
    if (state === "NSW") return owner === "trust" ? s.trust : s.general;
    if (state === "VIC") return owner === "trust" ? s.trust : s.general;
    if (state === "QLD") return owner === "individual" ? s.general : s.trust;
    return s.general;
  }

  /* tax on one owner's aggregated land value in one state */
  function landTax(state, owner, value) {
    var rows = landTableFor(state, owner);
    if (!rows) return { modelled: false, tax: 0 };
    return { modelled: true, tax: Math.max(0, bracketTax(Math.max(0, value || 0), rows)) };
  }

  function waMrit(metroValue) {
    var s = LAND.WA;
    return Math.max(0, (metroValue - s.mritOver) * s.mritRate);
  }

  /* props: [{ id, name, state, owner, landValue, waMetro }]
     otherLand: { NSW: 123456, ... } - taxable land held in the visitor's own
     name in that state that is not in the register (joins the individual group) */
  function landTaxPortfolio(props, otherLand) {
    var groups = {};
    var order = [];
    var missingState = [];
    var unmodelled = [];
    var missingValue = [];

    function groupFor(state, owner) {
      var k = state + "|" + owner;
      if (!groups[k]) {
        groups[k] = { state: state, owner: owner, ownerLabel: OWNERS[owner], total: 0, otherLand: 0, metroTotal: 0, properties: [] };
        order.push(k);
      }
      return groups[k];
    }

    (props || []).forEach(function (p) {
      if (!p.state) { missingState.push(p); return; }
      if (!LAND[p.state]) { unmodelled.push(p); return; }
      if (!(p.landValue > 0)) { missingValue.push(p); return; }
      var g = groupFor(p.state, p.owner || "individual");
      g.total += p.landValue;
      if (p.state === "WA" && p.waMetro) g.metroTotal += p.landValue;
      g.properties.push({ id: p.id, name: p.name, landValue: p.landValue });
    });

    Object.keys(otherLand || {}).forEach(function (st) {
      var v = otherLand[st];
      if (LAND[st] && v > 0) {
        var g = groupFor(st, "individual");
        g.otherLand += v;
        g.total += v;
      }
    });

    var totalTax = 0;
    var out = order.map(function (k) {
      var g = groups[k];
      var base = landTax(g.state, g.owner, g.total).tax;
      var mrit = g.state === "WA" ? waMrit(g.metroTotal) : 0;
      g.baseTax = base;
      g.mrit = mrit;
      g.tax = base + mrit;
      g.properties.forEach(function (p) {
        p.share = g.total > 0 ? g.tax * (p.landValue / g.total) : 0;
      });
      totalTax += g.tax;
      return g;
    });

    return { groups: out, totalTax: totalTax, missingState: missingState, unmodelled: unmodelled, missingValue: missingValue };
  }

  /* ---- income tax (for the tax on a gain) ----------------------------- */

  /* resident rates, excluding Medicare. Bottom rate is 15% for 2026-27 and
     14% from 1 July 2027 (legislated); above $45k it makes no difference. */
  function scaleTax(income, dateISO) {
    var bottom = dateISO >= REFORM_DATE ? 0.14 : 0.15;
    var t = 0;
    var i = Math.max(0, income);
    if (i > 18200) t += (Math.min(i, 45000) - 18200) * bottom;
    if (i > 45000) t += (Math.min(i, 135000) - 45000) * 0.30;
    if (i > 135000) t += (Math.min(i, 190000) - 135000) * 0.37;
    if (i > 190000) t += (i - 190000) * 0.45;
    return t;
  }
  var MEDICARE = 0.02;

  function personalTaxOnTop(other, add, dateISO) {
    return scaleTax(other + add, dateISO) - scaleTax(other, dateISO) + add * MEDICARE;
  }

  /* ---- capital gains tax ---------------------------------------------- */

  function ms(iso) { return Date.parse(iso + "T00:00:00Z"); }
  function todayISO() { return new Date().toISOString().slice(0, 10); }
  function addYearISO(iso) {
    var d = new Date(ms(iso));
    d.setUTCFullYear(d.getUTCFullYear() + 1);
    return d.toISOString().slice(0, 10);
  }

  function currentDiscount(owner, over12) {
    if (!over12) return 0;
    if (owner === "company") return 0;
    if (owner === "super") return 1 / 3;
    return 0.5;
  }

  /* tax on a taxable amount for one owner type */
  function taxOn(owner, amount, otherIncome, dateISO) {
    if (amount <= 0) return 0;
    if (owner === "company") return amount * 0.30;
    if (owner === "super") return amount * 0.15;
    if (otherIncome == null) return null;
    return personalTaxOnTop(otherIncome, amount, dateISO);
  }

  /* p: { owner, purchaseDate, purchasePrice, acqCosts, improvements,
          worksClaimed, saleDate, salePrice, newBuild, v27 }
     s: { otherIncome (number|null), cpiPct, sellingCostPct } */
  function cgtEstimate(p, s) {
    var owner = p.owner || "individual";
    var missing = [];
    if (!(p.purchasePrice > 0)) missing.push("purchase price");
    if (!p.purchaseDate) missing.push("purchase date");
    if (!(p.salePrice > 0)) missing.push("expected sale price");
    if (missing.length) return { ready: false, missing: missing };

    var saleDate = p.saleDate || todayISO();
    if (ms(saleDate) < ms(p.purchaseDate)) return { ready: false, missing: [], error: "The sale date is before the purchase date." };

    var costBase = Math.max(0, p.purchasePrice + (p.acqCosts || 0) + (p.improvements || 0) - (p.worksClaimed || 0));
    var sellingCosts = p.salePrice * ((s.sellingCostPct || 0) / 100);
    var proceeds = p.salePrice - sellingCosts;
    var gain = proceeds - costBase;
    /* the ATO leaves out both the day of acquisition and the day of the CGT
       event, so a sale exactly on the anniversary is still short of 12 months */
    var over12 = ms(saleDate) > ms(addYearISO(p.purchaseDate));
    var other = s.otherIncome == null || !isFinite(s.otherIncome) ? null : s.otherIncome;

    var res = {
      ready: true, owner: owner, saleDate: saleDate, costBase: costBase, sellingCosts: sellingCosts,
      proceeds: proceeds, gain: gain, over12: over12, needsIncome: false, reform: null,
      preCgt: ms(p.purchaseDate) < ms(PRE_CGT_DATE),
      inputs: {
        purchasePrice: p.purchasePrice, acqCosts: p.acqCosts || 0, improvements: p.improvements || 0,
        worksClaimed: p.worksClaimed || 0, salePrice: p.salePrice, sellingCostPct: s.sellingCostPct || 0
      }
    };

    /* bought before 20 September 1985: outside CGT today. The announced
       reform would bring later growth in, but how is too unsettled to model. */
    if (res.preCgt) {
      res.currentLaw = { discountPct: 0, taxableGain: 0, tax: 0 };
      return res;
    }

    if (gain <= 0) {
      res.currentLaw = { discountPct: 0, taxableGain: 0, tax: 0 };
      res.loss = -gain;
      return res;
    }

    var disc = currentDiscount(owner, over12);
    var taxable = gain * (1 - disc);
    var tax = taxOn(owner, taxable, other, saleDate);
    if (tax == null) res.needsIncome = true;
    res.currentLaw = { discountPct: disc * 100, taxableGain: taxable, tax: tax };

    var reformApplies = ms(saleDate) >= ms(REFORM_DATE) && over12 && (owner === "individual" || owner === "trust");
    if (!reformApplies) return res;

    var cpi = (s.cpiPct == null || !isFinite(s.cpiPct) ? 2.5 : s.cpiPct) / 100;
    var pre = 0, post = 0, indexedBase = 0, v27 = null, v27Estimated = false;

    if (ms(p.purchaseDate) >= ms(REFORM_DATE)) {
      var yrs = (ms(saleDate) - ms(p.purchaseDate)) / MS_YEAR;
      indexedBase = costBase * Math.pow(1 + cpi, yrs);
      post = Math.max(0, proceeds - indexedBase);
    } else {
      if (p.v27 > 0) { v27 = p.v27; }
      else {
        var tTotal = (ms(saleDate) - ms(p.purchaseDate)) / MS_YEAR;
        var t1 = (ms(REFORM_DATE) - ms(p.purchaseDate)) / MS_YEAR;
        v27 = p.purchasePrice * Math.pow(p.salePrice / p.purchasePrice, t1 / tTotal);
        v27Estimated = true;
      }
      var v = Math.min(Math.max(v27, costBase), proceeds);
      pre = v - costBase;
      var yrs2 = (ms(saleDate) - ms(REFORM_DATE)) / MS_YEAR;
      indexedBase = v * Math.pow(1 + cpi, yrs2);
      post = Math.max(0, proceeds - indexedBase);
    }

    var amount = pre * 0.5 + post;
    var reformTax, floorApplied = false;
    var base = taxOn(owner, amount, other, saleDate);
    if (base == null) { reformTax = null; }
    else {
      var scaled = base - amount * MEDICARE;
      var minTax = amount * 0.30;
      floorApplied = minTax > scaled;
      reformTax = Math.max(scaled, minTax) + amount * MEDICARE;
    }

    var reform = {
      preGain: pre, postGain: post, indexedBase: indexedBase, v27: v27, v27Estimated: v27Estimated,
      cpiPct: cpi * 100, taxableAmount: amount, tax: reformTax, election: null, floorApplied: floorApplied
    };

    if (p.newBuild && reformTax != null && tax != null) {
      if (tax <= reformTax) {
        reform.tax = tax; reform.election = "discount";
      } else {
        reform.election = "indexation";
      }
    }
    res.reform = reform;
    return res;
  }

  function cgtPortfolio(items) {
    var current = 0, reform = 0, gain = 0, count = 0, needsIncome = false;
    items.forEach(function (r) {
      if (!r || !r.ready) return;
      count++;
      if (r.gain > 0) gain += r.gain;
      if (r.needsIncome) { needsIncome = true; return; }
      current += r.currentLaw.tax || 0;
      reform += (r.reform && r.reform.tax != null ? r.reform.tax : r.currentLaw.tax) || 0;
    });
    return { count: count, gain: gain, currentTax: current, reformTax: reform, needsIncome: needsIncome };
  }

  return {
    REFORM_DATE: REFORM_DATE,
    OWNERS: OWNERS,
    STATES: STATES,
    LAND: LAND,
    landTax: landTax,
    landTaxPortfolio: landTaxPortfolio,
    scaleTax: scaleTax,
    cgtEstimate: cgtEstimate,
    cgtPortfolio: cgtPortfolio,
    todayISO: todayISO
  };
})();
