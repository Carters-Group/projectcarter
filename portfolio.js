/* =========================================================================
   Project Carter - portfolio metrics from the property register
   -------------------------------------------------------------------------
   Classic script (no modules). Exposes one global, pcPortfolio. Pure
   functions, no DOM, unit-tested in node (portfolio.test.js). Load after
   tax.js (uses pcTax for land tax and capital gains tax when present).

   The property register is the single source of truth: each property is
   entered once (what was paid, what it's worth, what's owed, what it earns,
   what it costs) and every portfolio figure is derived here, so the account
   page and the calculators that pull from it can never disagree.

   Blank means "not entered", zero means "none" (a loan balance of 0 is a
   property with no loan). Totals only count properties that have what each
   figure needs, and report who is missing, rather than guessing.
   ========================================================================= */
"use strict";

var pcPortfolio = (function () {
  function num(v) {
    if (v == null || v === "") return null;
    var n = Number(String(v).replace(/[^0-9.\-]/g, ""));
    return isFinite(n) ? n : null;
  }
  function pos(v) { var n = num(v); return n != null && n > 0 ? n : null; }
  function todayISO() { return new Date().toISOString().slice(0, 10); }
  function ms(iso) { return Date.parse(iso + "T00:00:00Z"); }

  function leaseIsCurrent(l, today) {
    if (l.is_periodic) return true;
    if (!l.lease_expiry) return true;
    return l.lease_expiry >= today;
  }

  /* rent from the property's current leases; unknown until a lease with a
     rent figure exists (a property with no lease entered is not "vacant",
     it just has nothing recorded yet) */
  function annualRent(p, today) {
    var sum = 0, known = false;
    (p.leases || []).forEach(function (l) {
      if (!leaseIsCurrent(l, today)) return;
      var r = num(l.annual_rent);
      if (r != null && r > 0) { sum += r; known = true; }
    });
    return { rent: sum, known: known };
  }

  function cgtInputFor(p, value) {
    return {
      owner: p.ownership_type || "individual",
      purchaseDate: p.purchase_date || null,
      purchasePrice: num(p.purchase_price) || 0,
      acqCosts: num(p.acquisition_costs) || 0,
      improvements: num(p.improvements) || 0,
      worksClaimed: num(p.capital_works_claimed) || 0,
      saleDate: p.planned_sale_date || null,
      salePrice: pos(p.expected_sale_price) || value || 0,
      newBuild: !!p.is_new_build,
      v27: num(p.value_at_jul_2027) || 0
    };
  }

  function cgtSettingsFrom(s) {
    return {
      taxRatePct: s && s.tax_rate_pct != null ? s.tax_rate_pct : null,
      cpiPct: s && s.cpi_pct != null ? s.cpi_pct : 2.5,
      sellingCostPct: s && s.selling_cost_pct != null ? s.selling_cost_pct : 2,
      superPhase: s && s.super_phase === "pension" ? "pension" : "accumulation"
    };
  }

  /* everything one property can tell you on its own (land tax share needs
     the whole portfolio, so build() adds that afterwards) */
  function propertyMetrics(p, settings, today) {
    today = today || todayISO();
    var value = pos(p.current_value);
    var loan = num(p.loan_balance);
    if (loan != null && loan < 0) loan = 0;
    var rate = num(p.interest_rate);
    var costs = num(p.annual_running_costs);
    var price = pos(p.purchase_price);
    var rent = annualRent(p, today);

    var m = {
      id: p.id, name: p.name || "Untitled property", entity: (p.holding_entity || "").trim(), type: p.property_type === "commercial" ? "commercial" : "residential", state: p.state || "", owner: p.ownership_type || "individual",
      value: value, loan: loan, rate: rate, price: price,
      equity: value != null && loan != null ? value - loan : null,
      lvr: value != null && loan != null ? loan / value * 100 : null,
      usable70: value != null && loan != null ? Math.max(0, value * 0.70 - loan) : null,
      usable80: value != null && loan != null ? Math.max(0, value * 0.80 - loan) : null,
      rent: rent.known ? rent.rent : null,
      grossYield: rent.known && value != null ? rent.rent / value * 100 : null,
      runningCosts: costs,
      landTaxShare: null
    };

    m.interest = loan != null && (loan === 0 || rate != null) ? loan * (rate || 0) / 100 : null;
    m.cashFlow = m.rent != null && m.interest != null ? m.rent - (costs || 0) - m.interest : null;

    m.growth = null;
    if (price != null && value != null) {
      var yrs = p.purchase_date ? (ms(today) - ms(p.purchase_date)) / (365.25 * 86400000) : null;
      m.growth = {
        amount: value - price,
        pct: (value / price - 1) * 100,
        perYearPct: yrs != null && yrs >= 1 ? (Math.pow(value / price, 1 / yrs) - 1) * 100 : null
      };
    }

    var sellPct = cgtSettingsFrom(settings).sellingCostPct;
    var salePrice = pos(p.expected_sale_price) || value;
    var sale = { price: salePrice, cgt: null, proceeds: null, tax: null, taxReform: null, cashIfSold: null, cashIfSoldReform: null, cashBeforeTax: null };
    if (salePrice != null) {
      sale.proceeds = salePrice * (1 - sellPct / 100);
      if (loan != null) sale.cashBeforeTax = sale.proceeds - loan;
      if (typeof pcTax !== "undefined") {
        var cgt = pcTax.cgtEstimate(cgtInputFor(p, value), cgtSettingsFrom(settings));
        sale.cgt = cgt;
        if (cgt.ready) {
          sale.proceeds = cgt.proceeds;
          if (loan != null) sale.cashBeforeTax = cgt.proceeds - loan;
          /* the tax on the sale date: the new rules from 1 July 2027, otherwise current law */
          if (!cgt.needsRate && cgt.tax != null) {
            sale.tax = cgt.tax;
            if (loan != null) sale.cashIfSold = cgt.proceeds - loan - cgt.tax;
          }
        }
      }
    }
    m.sale = sale;
    return m;
  }

  function sum(list, key) { return list.reduce(function (a, x) { return a + (x[key] || 0); }, 0); }

  function build(props, settings, today) {
    today = today || todayISO();
    settings = settings || {};
    var metrics = (props || []).map(function (p) { return propertyMetrics(p, settings, today); });

    var landTax = null;
    if (typeof pcTax !== "undefined") {
      landTax = pcTax.landTaxPortfolio(metrics.map(function (m, i) {
        return {
          id: m.id, name: m.name, state: m.state, owner: m.owner,
          landValue: pos(props[i].land_value) || 0, waMetro: !!props[i].wa_metro, entity: props[i].holding_entity || ""
        };
      }), {});
      landTax.groups.forEach(function (g) {
        g.properties.forEach(function (gp) {
          metrics.forEach(function (m) { if (m.id === gp.id) m.landTaxShare = gp.share; });
        });
      });
    }

    var withValue = metrics.filter(function (m) { return m.value != null; });
    var counted = metrics.filter(function (m) { return m.value != null && m.loan != null; });
    /* cash flow is only counted for properties whose balance-sheet figures
       are counted too, so the two halves of the portfolio always describe
       the same set of properties */
    var flowed = counted.filter(function (m) { return m.cashFlow != null; });

    var value = sum(counted, "value");
    var debt = sum(counted, "loan");
    var equity = value - debt;
    var rent = sum(flowed, "rent");
    var costs = flowed.reduce(function (a, m) { return a + (m.runningCosts || 0); }, 0);
    var interest = sum(flowed, "interest");
    var cashFlow = rent - costs - interest;

    var geared = flowed.filter(function (m) { return m.loan > 0 && m.rate != null; });
    var gearedDebt = sum(geared, "loan");
    var blendedRate = gearedDebt > 0 ? sum(geared, "interest") / gearedDebt : null;

    var sold = metrics.filter(function (m) { return m.sale.cashIfSold != null; });
    var cgtItems = metrics.filter(function (m) { return m.sale.cgt; }).map(function (m) { return m.sale.cgt; });
    var cgtTotals = typeof pcTax !== "undefined" ? pcTax.cgtPortfolio(cgtItems) : null;

    var totals = {
      count: metrics.length,
      valued: withValue.length,
      counted: counted.length,
      value: value, debt: debt, equity: equity,
      lvr: value > 0 ? debt / value * 100 : null,
      usable70: Math.max(0, value * 0.70 - debt),
      usable80: Math.max(0, value * 0.80 - debt),
      cashFlowCount: flowed.length,
      flowDebt: sum(flowed, "loan"),
      complete: counted.length > 0 && flowed.length === counted.length,
      rent: rent, runningCosts: costs, interest: interest,
      cashFlow: cashFlow, cashFlowWeekly: cashFlow / 52,
      blendedRate: blendedRate,
      landTax: landTax ? landTax.totalTax : null,
      cgtTax: cgtTotals ? cgtTotals.tax : null,
      cgtCurrent: cgtTotals ? cgtTotals.currentTax : null,
      cgtReform: cgtTotals ? cgtTotals.reformTax : null,
      cgtNeedsRate: cgtTotals ? cgtTotals.needsRate : false,
      soldCount: sold.length,
      cashIfSold: sold.reduce(function (a, m) { return a + m.sale.cashIfSold; }, 0),
      grossYield: value > 0 && flowed.length === counted.length && rent > 0 ? rent / value * 100 : null,
      /* commercial rent is entered net of outgoings, so its yield is a net yield */
      yieldKind: flowed.length && flowed.every(function (m) { return m.type === "commercial"; }) ? "net"
        : (flowed.some(function (m) { return m.type === "commercial"; }) ? "mixed" : "gross")
    };

    var names = function (list) { return list.map(function (m) { return m.name; }); };
    var missing = {
      value: names(metrics.filter(function (m) { return m.value == null; })),
      loan: names(metrics.filter(function (m) { return m.value != null && m.loan == null; })),
      rent: names(metrics.filter(function (m) { return m.rent == null; })),
      rate: names(metrics.filter(function (m) { return m.loan != null && m.loan > 0 && m.rate == null; }))
    };
    /* the same lists as {id, name} so each can link to the field to fill in */
    var refs = function (list) { return list.map(function (m) { return { id: m.id, name: m.name }; }); };
    var missingRefs = {
      value: refs(metrics.filter(function (m) { return m.value == null; })),
      loan: refs(metrics.filter(function (m) { return m.value != null && m.loan == null; })),
      rent: refs(metrics.filter(function (m) { return m.rent == null; })),
      rate: refs(metrics.filter(function (m) { return m.loan != null && m.loan > 0 && m.rate == null; }))
    };

    return { props: metrics, totals: totals, missing: missing, missingRefs: missingRefs, landTax: landTax, cgt: cgtTotals, summary: toSummary(totals) };
  }

  /* the small snapshot shape the calculators already read (usableEquity70 /
     usableEquity80 for "funds available"), plus what the account page's
     plan, debt-goal and risk sections need. Cash flow is before tax. */
  function toSummary(t) {
    return {
      portfolioValue: Math.round(t.value),
      portfolioDebt: Math.round(t.debt),
      portfolioEquity: Math.round(t.equity),
      usableEquity70: Math.round(t.usable70),
      usableEquity80: Math.round(t.usable80),
      netRentalIncome: Math.round(t.rent - t.runningCosts),
      grossRentalIncome: Math.round(t.rent),
      blendedRate: t.blendedRate,
      portfolioLvr: t.lvr != null ? Math.round(t.lvr * 10) / 10 : null,
      annualSurplus: Math.round(t.cashFlow),
      weeklySurplus: Math.round(t.cashFlowWeekly),
      propertyCount: t.counted
    };
  }

  return { build: build, propertyMetrics: propertyMetrics, cgtInputFor: cgtInputFor, cgtSettingsFrom: cgtSettingsFrom, toSummary: toSummary };
})();
