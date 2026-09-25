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

   A residential property can be the owner's home (usage "home"). It counts
   toward what you own (value, debt, equity, useable equity), because that is
   the equity that funds the next purchase, but never toward the investment
   figures (rent, yield, cash flow, land tax, capital gains tax). Its running
   costs and loan interest are reported on their own as the cost of owning
   your home.

   Each loan is interest only (the default) or principal and interest with
   a number of years left to run. On a P&I loan the first year's interest is
   what the repayments actually charge as the balance falls, and the
   principal repaid is shown on its own: it is not a cost (it becomes
   equity), but it is cash leaving each month, so it comes off "after
   repayments" and "cash out" figures and never off cash flow before tax.
   ========================================================================= */
"use strict";

var pcPortfolio = (function () {
  function num(v) {
    if (v == null || v === "") return null;
    var n = Number(String(v).replace(/[^0-9.\-]/g, ""));
    return isFinite(n) ? n : null;
  }
  function pos(v) { var n = num(v); return n != null && n > 0 ? n : null; }
  /* the visitor's own calendar date (toISOString is UTC, which is still
     yesterday in Australia until 10 or 11am) */
  function todayISO() { var d = new Date(); return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2); }
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
    var home = isHome(p);
    var rent = home ? { rent: 0, known: false } : annualRent(p, today);

    var m = {
      id: p.id, name: p.name || "Untitled property", sold: !!p.is_sold, entity: (p.holding_entity || "").trim(), type: p.property_type === "commercial" ? "commercial" : "residential", state: p.state || "", owner: p.ownership_type || "individual",
      home: home, movedOut: !home && p.property_type !== "commercial" && p.moved_out_date ? p.moved_out_date : null,
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
    /* the loan's structure: repayments, and the principal they pay off */
    m.loanType = p.loan_type === "pi" ? "pi" : "io";
    m.yearsLeft = m.loanType === "pi" ? pos(p.loan_years_left) : null;
    m.ioExpiry = m.loanType === "io" && loan > 0 ? (p.io_expiry_date || null) : null;
    m.termMissing = m.loanType === "pi" && loan > 0 && m.yearsLeft == null;
    m.monthly = null; m.principal = null; m.repayment = null;
    if (m.interest != null) {
      if (m.loanType === "pi" && loan > 0 && m.yearsLeft != null) {
        var fy = firstYear(loan, rate, m.yearsLeft);
        m.monthly = fy.monthly;
        m.interest = fy.interest;
        m.principal = fy.principal;
      } else if (!m.termMissing) {
        m.monthly = m.interest / 12;
        m.principal = 0;
      }
      if (m.principal != null) m.repayment = m.interest + m.principal;
    }
    m.cashFlow = m.rent != null && m.interest != null ? m.rent - (costs || 0) - m.interest : null;
    /* your home earns nothing, so what it costs to hold is its own figure:
       running costs plus loan interest, per year */
    m.homeCost = home && m.interest != null ? (costs || 0) + m.interest : null;
    /* and what actually leaves your account for it: that plus principal */
    m.homeCashOut = m.homeCost != null && m.principal != null ? m.homeCost + m.principal : null;

    /* all-in cost: price plus buying costs (stamp duty, legals) and
       improvements, the same things that make up a cost base */
    m.totalCost = price != null ? price + (pos(p.acquisition_costs) || 0) + (pos(p.improvements) || 0) : null;

    m.growth = null;
    if (price != null && value != null) {
      var yrs = p.purchase_date ? (ms(today) - ms(p.purchase_date)) / (365.25 * 86400000) : null;
      m.growth = {
        amount: value - price,
        pct: (value / price - 1) * 100,
        perYearPct: yrs != null && yrs >= 1 ? (Math.pow(value / price, 1 / yrs) - 1) * 100 : null,
        afterCosts: value - m.totalCost
      };
    }

    var sellPct = cgtSettingsFrom(settings).sellingCostPct;
    var salePrice = pos(p.expected_sale_price) || value;
    var sale = { price: salePrice, cgt: null, proceeds: null, tax: null, taxReform: null, cashIfSold: null, cashIfSoldReform: null, cashBeforeTax: null, exempt: home, saleDate: p.planned_sale_date || null };
    if (salePrice != null && home) {
      /* main residence exemption: no capital gains tax on your own home */
      sale.proceeds = salePrice * (1 - sellPct / 100);
      sale.tax = 0;
      if (loan != null) sale.cashBeforeTax = sale.cashIfSold = sale.proceeds - loan;
    } else if (salePrice != null) {
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

  /* the monthly repayment on a principal and interest loan */
  function monthlyRepayment(balance, ratePct, years) {
    var n = Math.round(years * 12);
    if (!(balance > 0) || !(n > 0)) return 0;
    var r = (ratePct || 0) / 100 / 12;
    return r === 0 ? balance / n : balance * r / (1 - Math.pow(1 + r, -n));
  }

  /* the next 12 months of a P&I loan: interest charged and principal repaid */
  function firstYear(balance, ratePct, years) {
    var pay = monthlyRepayment(balance, ratePct, years), r = (ratePct || 0) / 100 / 12;
    var b = balance, interest = 0, principal = 0;
    for (var i = 0; i < 12 && b > 0; i++) {
      var int = b * r, prin = Math.min(pay - int, b);
      interest += int; principal += prin; b -= prin;
    }
    return { monthly: pay, interest: interest, principal: principal };
  }

  /* Month by month until every loan is cleared (or maxYears): interest on
     each balance, scheduled principal on P&I loans, then the extra (plus the
     repayment of any loan already cleared) onto the highest-rate balance.
     loans: [{ balance, ratePct, monthly }] (monthly 0 = interest only). */
  function debtPayoff(loans, extraPerYear, maxYears) {
    maxYears = maxYears || 60;
    var ls = (loans || []).filter(function (l) { return l.balance > 0; }).map(function (l) {
      return { b: l.balance, r: (l.ratePct || 0) / 100 / 12, pay: l.monthly || 0 };
    });
    var start = ls.reduce(function (a, l) { return a + l.b; }, 0);
    if (!start) return { cleared: true, months: 0, years: 0, interest: 0, remaining: 0 };
    ls.sort(function (a, b) { return b.r - a.r; });
    var extra = (extraPerYear || 0) / 12, interest = 0, month = 0, left = start;
    while (month < maxYears * 12 && left > 0.5) {
      month++;
      var spare = extra;
      ls.forEach(function (l) {
        if (l.b <= 0) { spare += l.pay; return; }
        var int = l.b * l.r;
        interest += int;
        if (l.pay > 0) l.b -= Math.max(0, Math.min(l.pay - int, l.b));
      });
      ls.forEach(function (l) {
        if (spare <= 0 || l.b <= 0) return;
        var put = Math.min(spare, l.b);
        l.b -= put; spare -= put;
      });
      left = ls.reduce(function (a, l) { return a + Math.max(0, l.b); }, 0);
    }
    return { cleared: left <= 0.5, months: month, years: month / 12, interest: interest, remaining: Math.max(0, left) };
  }

  /* only a residential property can be the owner's home */
  function isHome(p) { return p.usage === "home" && p.property_type !== "commercial"; }

  function sum(list, key) { return list.reduce(function (a, x) { return a + (x[key] || 0); }, 0); }

  function build(props, settings, today) {
    today = today || todayISO();
    settings = settings || {};
    /* every property keeps its metrics (in the same order as props, so the
       account page can pair them up), but a sold one drops out of every
       portfolio figure; it only carries its realised capital gains tax */
    var all = (props || []).map(function (p) { return propertyMetrics(p, settings, today); });
    var metrics = all.filter(function (m) { return !m.sold; });
    var heldProps = (props || []).filter(function (p) { return !p.is_sold; });

    /* your home is exempt from land tax, so it never joins a land tax group */
    var landTax = null;
    if (typeof pcTax !== "undefined") {
      landTax = pcTax.landTaxPortfolio(metrics.map(function (m, i) {
        return {
          id: m.id, name: m.name, state: m.state, owner: m.owner,
          landValue: pos(heldProps[i].land_value) || 0, waMetro: !!heldProps[i].wa_metro, entity: heldProps[i].holding_entity || ""
        };
      }).filter(function (x, i) { return !metrics[i].home; }), {});
      landTax.groups.forEach(function (g) {
        g.properties.forEach(function (gp) {
          metrics.forEach(function (m) { if (m.id === gp.id) m.landTaxShare = gp.share; });
        });
      });
    }

    /* land tax is a holding cost like rates, so it comes off each
       property's cash flow once the portfolio has worked out its share */
    metrics.forEach(function (m) {
      if (m.cashFlow != null && m.landTaxShare) m.cashFlow -= m.landTaxShare;
    });

    var withValue = metrics.filter(function (m) { return m.value != null; });
    var counted = metrics.filter(function (m) { return m.value != null && m.loan != null; });
    /* what you own counts your home; everything about income counts only
       the investments */
    var invested = counted.filter(function (m) { return !m.home; });
    var homes = counted.filter(function (m) { return m.home; });
    /* cash flow is only counted for properties whose balance-sheet figures
       are counted too, so the two halves of the portfolio always describe
       the same set of properties */
    var flowed = invested.filter(function (m) { return m.cashFlow != null; });
    var investValue = sum(invested, "value");
    var investDebt = sum(invested, "loan");
    var homeValue = sum(homes, "value");
    var homeDebt = sum(homes, "loan");
    var homeCosted = homes.filter(function (m) { return m.homeCost != null; });
    var homeCost = sum(homeCosted, "homeCost");
    var homeRepaid = homeCosted.filter(function (m) { return m.principal != null; });

    var value = sum(counted, "value");
    var debt = sum(counted, "loan");
    var equity = value - debt;
    var rent = sum(flowed, "rent");
    var costs = flowed.reduce(function (a, m) { return a + (m.runningCosts || 0); }, 0);
    var interest = sum(flowed, "interest");
    var landTaxFlow = sum(flowed, "landTaxShare");
    var cashFlow = rent - costs - landTaxFlow - interest;
    /* principal on the investment loans: cash out, not a cost */
    var principal = sum(flowed, "principal");
    var repayKnown = flowed.every(function (m) { return m.principal != null; });
    flowed.forEach(function (m) { m.cashAfterRepay = m.principal != null ? m.cashFlow - m.principal : null; });
    /* every loan with a balance and a rate, for the debt reduction goal */
    var loans = counted.filter(function (m) { return m.loan > 0 && m.rate != null; }).map(function (m) {
      return { id: m.id, name: m.name, balance: m.loan, ratePct: m.rate, monthly: m.loanType === "pi" && m.yearsLeft != null ? m.monthly : 0, pi: m.loanType === "pi" && m.yearsLeft != null, principal: m.principal || 0 };
    });
    var piInvest = flowed.filter(function (m) { return m.loanType === "pi" && m.yearsLeft != null && m.loan > 0; });

    var geared = flowed.filter(function (m) { return m.loan > 0 && m.rate != null; });
    var gearedDebt = sum(geared, "loan");
    var blendedRate = gearedDebt > 0 ? sum(geared, "interest") / gearedDebt : null;
    /* every loan with a rate, your home's included (for paying debt down) */
    var allGeared = counted.filter(function (m) { return m.loan > 0 && m.rate != null; });
    var allGearedDebt = sum(allGeared, "loan");
    var allBlendedRate = allGearedDebt > 0 ? sum(allGeared, "interest") / allGearedDebt : null;

    var sold = metrics.filter(function (m) { return m.sale.cashIfSold != null; });
    var cgtItems = metrics.filter(function (m) { return m.sale.cgt; }).map(function (m) { return m.sale.cgt; });
    var cgtTotals = typeof pcTax !== "undefined" ? pcTax.cgtPortfolio(cgtItems) : null;

    /* properties already sold: the tax actually owed on each sale, grouped
       by the financial year the sale contract falls in */
    var soldProps = all.filter(function (m) { return m.sold; });
    var realised = { count: soldProps.length, byYear: {}, years: [] };
    soldProps.forEach(function (m) {
      var fy = financialYear((m.sale.cgt && m.sale.cgt.saleDate) || m.sale.saleDate);
      if (!realised.byYear[fy]) { realised.byYear[fy] = { fy: fy, gain: 0, tax: 0, needsRate: false, props: [] }; realised.years.push(fy); }
      var y = realised.byYear[fy];
      y.props.push(m);
      var c = m.sale.cgt;
      if (c && c.ready && c.gain > 0) y.gain += c.gain;
      if (c && c.ready && c.needsRate) y.needsRate = true;
      else if (m.sale.tax != null) y.tax += m.sale.tax;
    });
    realised.years.sort().reverse();

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
      complete: invested.length > 0 && flowed.length === invested.length,
      invest: {
        count: invested.length, value: investValue, debt: investDebt, equity: investValue - investDebt,
        lvr: investValue > 0 ? investDebt / investValue * 100 : null
      },
      home: {
        count: homes.length, value: homeValue, debt: homeDebt, equity: homeValue - homeDebt,
        costed: homeCosted.length,
        runningCosts: homeCosted.reduce(function (a, m) { return a + (m.runningCosts || 0); }, 0),
        interest: sum(homeCosted, "interest"),
        cost: homeCost, costWeekly: homeCost / 52,
        anyPI: homeRepaid.some(function (m) { return m.loanType === "pi"; }),
        repayKnown: homeRepaid.length === homeCosted.length,
        principal: sum(homeRepaid, "principal"),
        cashOut: homeCost + sum(homeRepaid, "principal"),
        cashOutWeekly: (homeCost + sum(homeRepaid, "principal")) / 52
      },
      principal: principal, repayKnown: repayKnown,
      anyPI: flowed.some(function (m) { return m.loanType === "pi"; }),
      cashFlowAfterRepay: cashFlow - principal, cashFlowAfterRepayWeekly: (cashFlow - principal) / 52,
      loans: loans,
      piDebt: sum(piInvest, "loan"),
      piMonthly: sum(piInvest, "monthly"),
      allBlendedRate: allBlendedRate,
      rent: rent, runningCosts: costs, interest: interest, landTaxFlow: landTaxFlow,
      soldProperties: soldProps.length,
      cashFlow: cashFlow, cashFlowWeekly: cashFlow / 52,
      blendedRate: blendedRate,
      landTax: landTax ? landTax.totalTax : null,
      cgtTax: cgtTotals ? cgtTotals.tax : null,
      cgtCurrent: cgtTotals ? cgtTotals.currentTax : null,
      cgtReform: cgtTotals ? cgtTotals.reformTax : null,
      cgtNeedsRate: cgtTotals ? cgtTotals.needsRate : false,
      soldCount: sold.length,
      cashIfSold: sold.reduce(function (a, m) { return a + m.sale.cashIfSold; }, 0),
      grossYield: investValue > 0 && flowed.length === invested.length && rent > 0 ? rent / investValue * 100 : null,
      /* commercial rent is entered net of outgoings, so its yield is a net yield */
      yieldKind: flowed.length && flowed.every(function (m) { return m.type === "commercial"; }) ? "net"
        : (flowed.some(function (m) { return m.type === "commercial"; }) ? "mixed" : "gross")
    };

    var names = function (list) { return list.map(function (m) { return m.name; }); };
    var missing = {
      value: names(metrics.filter(function (m) { return m.value == null; })),
      loan: names(metrics.filter(function (m) { return m.value != null && m.loan == null; })),
      rent: names(metrics.filter(function (m) { return !m.home && m.rent == null; })),
      rate: names(metrics.filter(function (m) { return m.loan != null && m.loan > 0 && m.rate == null; })),
      term: names(metrics.filter(function (m) { return m.termMissing; }))
    };
    /* the same lists as {id, name} so each can link to the field to fill in */
    var refs = function (list) { return list.map(function (m) { return { id: m.id, name: m.name }; }); };
    var missingRefs = {
      value: refs(metrics.filter(function (m) { return m.value == null; })),
      loan: refs(metrics.filter(function (m) { return m.value != null && m.loan == null; })),
      rent: refs(metrics.filter(function (m) { return !m.home && m.rent == null; })),
      rate: refs(metrics.filter(function (m) { return m.loan != null && m.loan > 0 && m.rate == null; })),
      term: refs(metrics.filter(function (m) { return m.termMissing; }))
    };

    return { props: all, totals: totals, missing: missing, missingRefs: missingRefs, landTax: landTax, cgt: cgtTotals, realised: realised, summary: toSummary(totals) };
  }

  /* "2026-27" for a contract date between 1 July 2026 and 30 June 2027 */
  function financialYear(iso) {
    if (!iso) return "";
    var y = Number(iso.slice(0, 4)), mo = Number(iso.slice(5, 7));
    var start = mo >= 7 ? y : y - 1;
    return start + "-" + String(start + 1).slice(-2);
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
      netRentalIncome: Math.round(t.rent - t.runningCosts - (t.landTaxFlow || 0)),
      grossRentalIncome: Math.round(t.rent),
      blendedRate: t.blendedRate,
      portfolioLvr: t.lvr != null ? Math.round(t.lvr * 10) / 10 : null,
      /* the investments on their own (what an ROI projection should start
         from) and your home on its own */
      investmentValue: Math.round(t.invest ? t.invest.value : t.value),
      investmentDebt: Math.round(t.invest ? t.invest.debt : t.debt),
      homeValue: t.home ? Math.round(t.home.value) : 0,
      homeDebt: t.home ? Math.round(t.home.debt) : 0,
      homeCostAnnual: t.home ? Math.round(t.home.cost) : 0,
      /* the P&I investment loans, so a projection can pay them down on schedule */
      investPiDebt: Math.round(t.piDebt || 0),
      investPiMonthly: Math.round((t.piMonthly || 0) * 100) / 100,
      principalRepaid: Math.round(t.principal || 0),
      annualSurplus: Math.round(t.cashFlow),
      weeklySurplus: Math.round(t.cashFlowWeekly),
      propertyCount: t.counted
    };
  }

  return { build: build, propertyMetrics: propertyMetrics, isHome: isHome, monthlyRepayment: monthlyRepayment, debtPayoff: debtPayoff, cgtInputFor: cgtInputFor, cgtSettingsFrom: cgtSettingsFrom, toSummary: toSummary, financialYear: financialYear };
})();
