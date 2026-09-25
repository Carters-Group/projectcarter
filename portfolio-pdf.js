/* =========================================================================
   Project Carter - full portfolio PDF
   -------------------------------------------------------------------------
   Classic script, one global: pcPortfolioPdf. Builds a single report of
   the whole property register from a pcPortfolio.build() result, in the
   order an investor wants to read it: the answer, where you stand, what it
   pays you, each property, where it is heading, what could go wrong, what
   selling would leave you, then land tax, leases and the paper trail.
   Sections with nothing to show are skipped rather than printed empty.

   The account page passes in the few helpers that live there (WALE, lease
   events, the ROI projection) so the figures match the dashboard exactly.
   ========================================================================= */
"use strict";

var pcPortfolioPdf = (function () {
  var BLUE = [95, 161, 208], NAVY = [30, 80, 120], TINT = [234, 242, 248];

  function money(n) {
    if (n == null || !isFinite(n)) return "-";
    var v = Math.round(n);
    return (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("en-AU");
  }
  function pct(n) { return n == null || !isFinite(n) ? "-" : n.toFixed(1) + "%"; }
  function date(s) {
    if (!s) return "-";
    var d = new Date(String(s).length === 10 ? s + "T00:00:00" : s);
    return isNaN(d.getTime()) ? "-" : d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
  }
  function slug(s) { return String(s || "portfolio").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }

  /* opts: { portfolio, properties, holder, computeWale, leaseEvents,
             projection: { years, capGrowthPct, rentGrowthPct, build } } */
  function download(opts) {
    if (!window.jspdf || !window.jspdf.jsPDF) { window.alert("The PDF tool did not load. Check your connection and try again."); return; }
    var P = opts.portfolio, t = P.totals, props = opts.properties || [];
    var clean = window.pcPdf.clean;
    var doc = new window.jspdf.jsPDF({ unit: "pt", format: "a4" });
    var w = doc.internal.pageSize.getWidth(), h = doc.internal.pageSize.getHeight(), L = 48, y = 56;
    var W = w - 2 * L;
    var sectionNo = 0;

    function ensure(need) { if (y + need > h - 60) { doc.addPage(); y = 56; } }

    /* ---- building blocks ------------------------------------------------ */
    function section(title, intro) {
      ensure(70);
      sectionNo++;
      doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(20);
      doc.text(clean(sectionNo + ". " + title), L, y); y += 7;
      doc.setDrawColor(220); doc.line(L, y, w - L, y); y += 16;
      if (intro) para(intro, 9, 110);
    }
    function para(text, size, grey) {
      doc.setFont("helvetica", "normal"); doc.setFontSize(size || 9); doc.setTextColor(grey == null ? 90 : grey);
      var lines = doc.splitTextToSize(clean(text), W);
      var lh = (size || 9) + 3;
      ensure(lines.length * lh);
      doc.text(lines, L, y, { lineHeightFactor: 1.2 });
      y += lines.length * lh + 6;
    }
    function row(k, v, strong) {
      var label = doc.splitTextToSize(clean(k), W - 170);
      var need = label.length * 14 + 2;
      ensure(need);
      doc.setFontSize(10);
      doc.setFont("helvetica", strong ? "bold" : "normal"); doc.setTextColor(strong ? 20 : 90);
      doc.text(label, L, y);
      doc.setFont("helvetica", "bold"); doc.setTextColor(20);
      doc.text(clean(v), w - L, y, { align: "right" });
      y += need;
    }
    /* a line of up to four boxed headline figures */
    function tiles(pairs) {
      var n = pairs.length, gap = 8, tw = (W - gap * (n - 1)) / n, th = 46;
      ensure(th + 12);
      pairs.forEach(function (p, i) {
        var x = L + i * (tw + gap);
        doc.setFillColor(TINT[0], TINT[1], TINT[2]); doc.roundedRect(x, y - 12, tw, th, 4, 4, "F");
        doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(90);
        doc.text(clean(p[0]).toUpperCase(), x + 10, y + 2);
        doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
        doc.text(clean(p[1]), x + 10, y + 22);
      });
      y += th + 8;
    }
    /* cols: [{ head, width, num }]; rows: arrays of strings; last row bold when totalRow */
    function table(cols, rows, totalRow) {
      var fixed = cols.reduce(function (a, c) { return a + (c.width || 0); }, 0);
      var flex = cols.filter(function (c) { return !c.width; }).length;
      var flexW = flex ? (W - fixed) / flex : 0;
      var xs = [], x = L;
      cols.forEach(function (c) { c.w = c.width || flexW; xs.push(x); x += c.w; });
      function head() {
        ensure(24);
        doc.setFillColor(245, 247, 250); doc.rect(L, y - 11, W, 16, "F");
        doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(80);
        cols.forEach(function (c, i) {
          if (c.num) doc.text(clean(c.head), xs[i] + c.w - 4, y, { align: "right" });
          else doc.text(clean(c.head), xs[i] + 4, y);
        });
        y += 16;
      }
      head();
      rows.forEach(function (r, ri) {
        var isTotal = totalRow && ri === rows.length - 1;
        /* a "\n" in a cell starts a second line (clean() would strip it) */
        var cells = r.map(function (v, i) {
          return String(v == null ? "-" : v).split("\n").reduce(function (a, part) {
            return a.concat(doc.splitTextToSize(clean(part), cols[i].w - 8));
          }, []);
        });
        var lines = cells.reduce(function (a, c) { return Math.max(a, c.length); }, 1);
        var rh = lines * 11 + 5;
        if (y + rh > h - 60) { doc.addPage(); y = 56; head(); }
        if (isTotal) { doc.setDrawColor(180); doc.line(L, y - 10, w - L, y - 10); }
        doc.setFont("helvetica", isTotal ? "bold" : "normal"); doc.setFontSize(8.5); doc.setTextColor(isTotal ? 20 : 50);
        cells.forEach(function (c, i) {
          if (cols[i].num) doc.text(c, xs[i] + cols[i].w - 4, y, { align: "right" });
          else doc.text(c, xs[i] + 4, y);
        });
        y += rh;
        if (!isTotal) { doc.setDrawColor(235); doc.line(L, y - 9, w - L, y - 9); }
      });
      y += 8;
    }

    /* ---- header --------------------------------------------------------- */
    doc.setFillColor(BLUE[0], BLUE[1], BLUE[2]); doc.rect(0, 0, w, 6, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(BLUE[0], BLUE[1], BLUE[2]);
    doc.text("PROJECT CARTER", L, y);
    doc.setFont("helvetica", "normal"); doc.setTextColor(120);
    doc.text("Corporate Property Advisor", w - L, y, { align: "right" });
    doc.setDrawColor(BLUE[0], BLUE[1], BLUE[2]); doc.setLineWidth(1.2); doc.line(L, y + 12, w - L, y + 12); doc.setLineWidth(0.2);
    doc.setTextColor(20); doc.setFont("helvetica", "bold"); doc.setFontSize(22);
    doc.text("Portfolio Review", L, y + 44);
    if (opts.holder) {
      doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
      doc.text(clean(opts.holder), L, y + 64);
      y += 20;
    }
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(110);
    doc.text(clean("Prepared " + new Date().toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" })), L, y + 61);
    var basis = t.counted === t.count
      ? t.count + (t.count === 1 ? " property" : " properties") + " held"
      : t.counted + " of " + t.count + " properties counted (the rest are missing a value or loan balance)";
    if (t.soldProperties) basis += ", plus " + t.soldProperties + " sold";
    doc.text(clean(basis + "."), L, y + 75);
    y += 104;

    var ready = t.counted > 0;
    var flowReady = ready && t.cashFlowCount > 0;
    var home = t.home || { count: 0 };
    var hasHome = ready && home.count > 0;

    /* ---- the answer first ---------------------------------------------- */
    var bl = [];
    if (ready) {
      bl.push("Your " + (t.counted === 1 ? "property is" : t.counted + " properties are") + " worth " + money(t.value) + " against " + money(t.debt) + " of debt, leaving " + money(t.equity) + " of equity at a " + pct(t.lvr) + " LVR.");
      if (hasHome) bl.push("That includes your home, which counts toward your equity but not your investment income.");
      if (flowReady) bl.push("Before income tax " + (hasHome ? "your investments " : "they ") + (t.cashFlow >= 0 ? "pay you " + money(t.cashFlowWeekly) : "cost you " + money(-t.cashFlowWeekly)) + " a week.");
      if (hasHome && home.costed) bl.push("Your home costs about " + money(home.costWeekly) + " a week to own in running costs and interest.");
      if (t.usable80 > 0) bl.push("A lender could release roughly " + money(t.usable70) + " to " + money(t.usable80) + " of that equity toward your next purchase.");
    } else {
      bl.push("Add a current value and loan balance to your properties to see your position. This report fills in as the register does.");
    }
    y = window.pcPdf.bottomLine(doc, L, y, bl.join(" ")) + 4;

    /* ---- 1. where you stand -------------------------------------------- */
    if (ready) {
      section("Where you stand today");
      tiles([["Combined value", money(t.value)], ["Debt", money(t.debt)], ["Equity", money(t.equity)], ["Portfolio LVR", pct(t.lvr)]]);
      row("Useable equity, conservative (70% LVR)", money(t.usable70));
      row("Useable equity, higher gearing (80% LVR)", money(t.usable80));
      if (t.blendedRate != null) row("Blended interest rate", pct(t.blendedRate * 100));
      para("Useable equity is the combined value times the LVR a lender will go to, less your existing debt. Your lender's own valuation and policy decide the final number.", 8, 130);
      y += 6;
    }

    /* ---- your home, on its own ------------------------------------------ */
    if (hasHome) {
      section("Your home", "Counted in what you own and your useable equity above, but kept out of the investment cash flow, land tax and capital gains tax.");
      tiles([["Value", money(home.value)], ["Loan", money(home.debt)], ["Equity", money(home.equity)]]);
      if (home.costed) {
        row("Running costs / yr", money(home.runningCosts));
        row("Loan interest / yr", money(home.interest));
        row("Cost to own / yr", money(home.cost), true);
        row("Cost to own / week", money(home.costWeekly));
        if (home.anyPI && home.repayKnown) {
          row("Principal repaid / yr (builds equity)", money(home.principal));
          row("Cash out / week", money(home.cashOutWeekly), true);
        }
      }
      y += 6;
    }

    /* ---- 2. cash flow --------------------------------------------------- */
    if (flowReady) {
      section(hasHome ? "What your investments pay you" : "What it pays you", t.complete ? null : "Based on the " + t.cashFlowCount + " properties with a rent figure, loan and rate.");
      tiles([["Cash flow / week", money(t.cashFlowWeekly)], ["Cash flow / year", money(t.cashFlow)], [t.yieldKind === "net" ? "Net yield" : "Yield on value", pct(t.grossYield)]]);
      row("Rent from current leases", money(t.rent));
      row("Less running costs", money(-t.runningCosts));
      if (t.landTaxFlow) row("Less land tax", money(-t.landTaxFlow));
      row("Net rental income", money(t.rent - t.runningCosts - (t.landTaxFlow || 0)), true);
      row("Less loan interest", money(-t.interest));
      row("Cash flow before income tax", money(t.cashFlow), true);
      if (t.anyPI && t.repayKnown) {
        row("Less principal repaid (builds equity)", money(-t.principal));
        row("Cash flow after loan repayments", money(t.cashFlowAfterRepay), true);
      }
      if (t.yieldKind === "mixed") para("Commercial rent is entered net of outgoings, so the yield mixes net and gross figures.", 8, 130);
      y += 6;
    }

    /* ---- 3. property by property --------------------------------------- */
    var held = P.props.filter(function (m) { return !m.sold; });
    if (held.length) {
      section("Property by property", "Sorted by equity, largest first.");
      var sorted = held.slice().sort(function (a, b) { return (b.equity || -Infinity) - (a.equity || -Infinity); });
      var rows = sorted.map(function (m) {
        var tag = (m.type === "commercial" ? "Commercial" : (m.home ? "My home" : "Residential")) + (m.state ? ", " + m.state : "");
        return [m.name + "\n" + tag, money(m.value), money(m.loan), money(m.equity), pct(m.lvr), money(m.cashFlow),
          m.growth ? (m.growth.perYearPct != null ? pct(m.growth.perYearPct) + " pa" : pct(m.growth.pct) + " total") : "-"];
      });
      if (held.length > 1 && ready) rows.push(["Portfolio", money(t.value), money(t.debt), money(t.equity), pct(t.lvr), flowReady ? money(t.cashFlow) : "-", ""]);
      table([
        { head: "Property" }, { head: "Value", width: 62, num: true }, { head: "Loan", width: 62, num: true },
        { head: "Equity", width: 62, num: true }, { head: "LVR", width: 40, num: true },
        { head: "Cash flow / yr", width: 66, num: true }, { head: "Growth", width: 56, num: true }
      ], rows, held.length > 1 && ready);
      para("Cash flow is after running costs, each property's share of land tax and interest" + (hasHome ? " (your home has none; the portfolio row is investments only)" : "") + ". Growth is from purchase price to current value, per year once held a year or more.", 8, 130);
      y += 6;
    }

    /* ---- 4. where it is heading ---------------------------------------- */
    var pj = opts.projection;
    if (pj && pj.build && t.complete && P.summary.portfolioValue > 0) {
      var plan = pj.build(P.summary, pj.years, pj.capGrowthPct, pj.rentGrowthPct);
      section("Where it is heading", "Over " + pj.years + " year" + (pj.years > 1 ? "s" : "") + " at " + pj.capGrowthPct + "% capital growth and " + pj.rentGrowthPct + "% rental growth a year. Principal and interest loans reduce on their scheduled repayments, and half of any surplus after repayments pays down debt as well. Change these under Total Portfolio ROI on your account.");
      tiles([["Value, year " + pj.years, money(plan.value)], ["Equity, year " + pj.years, money(plan.equity)], ["IRR", plan.irr != null ? pct(plan.irr * 100) : "-"]]);
      var step = pj.years > 10 ? 5 : (pj.years > 5 ? 2 : 1);
      var prow = plan.rows.filter(function (r) { return r.year === 0 || r.year % step === 0 || r.year === pj.years; }).map(function (r) {
        return [r.year === 0 ? "Today" : "Year " + r.year, money(r.value), money(r.balance), money(r.equity), pct(r.value > 0 ? r.balance / r.value * 100 : null)];
      });
      table([{ head: "" }, { head: "Value", width: 90, num: true }, { head: "Debt", width: 90, num: true }, { head: "Equity", width: 90, num: true }, { head: "LVR", width: 60, num: true }], prow);
      row("Debt paid down", money(plan.debtReductionAmt));
      row("Average cash-on-cash return", plan.cashOnCash != null ? pct(plan.cashOnCash * 100) + " a year" : "-");
      para("One blended growth rate across the whole portfolio. Growth is never guaranteed, and no capital gains tax is included since nothing here assumes you sell.", 8, 130);
      y += 6;
    }

    /* ---- 5. what could go wrong ---------------------------------------- */
    if (flowReady) {
      section("What could go wrong", "Your yearly cash flow under three stress tests, applied across the whole portfolio. A rate rise and a vacancy are shown separately, not stacked.");
      var scen = [["Mild", 0.005, 4], ["Moderate", 0.015, 8], ["Severe", 0.03, 16]];
      table([{ head: "Scenario" }, { head: "Rate rise", width: 70, num: true }, { head: "Cash flow if rates rise", width: 120, num: true },
        { head: "Vacancy", width: 70, num: true }, { head: "Cash flow if vacant", width: 110, num: true }],
        scen.map(function (s) {
          return [s[0], "+" + (s[1] * 100).toFixed(1) + "%", money(t.cashFlow - t.flowDebt * s[1]), s[2] + " weeks", money(t.cashFlow - t.rent * s[2] / 52)];
        }));
      para("Approximate: uses your blended rate rather than each loan's own terms.", 8, 130);
      y += 6;
    }

    /* ---- 6. exit -------------------------------------------------------- */
    var exitRows = held.filter(function (m) { return m.sale && ((m.sale.cgt && m.sale.cgt.ready) || (m.home && m.sale.cashIfSold != null)); });
    if (exitRows.length) {
      section("If you sold", "Each property sold at its expected sale price and date (today and current value unless you set them), less selling costs, the loan and capital gains tax under the rules for that date.");
      if (t.soldCount) tiles([["Cash in hand if all sold", money(t.cashIfSold)], ["Capital gains tax", t.cgtNeedsRate ? "Needs tax rate" : money(t.cgtTax)]]);
      var er = exitRows.map(function (m) {
        if (m.home) return [m.name + " (home)", m.sale.saleDate ? date(m.sale.saleDate) : "Today", money(m.sale.price), "Exempt", money(0), money(m.sale.cashIfSold)];
        var r = m.sale.cgt;
        return [m.name, date(r.saleDate), money(m.sale.price), r.loss ? "Loss " + money(r.loss) : money(r.gain), r.needsRate ? "-" : money(r.tax), money(m.sale.cashIfSold)];
      });
      table([{ head: "Property" }, { head: "Sale date", width: 66 }, { head: "Sale price", width: 70, num: true }, { head: "Gain", width: 70, num: true },
        { head: "Tax", width: 62, num: true }, { head: "Cash in hand", width: 74, num: true }], er);
      var missingCgt = held.filter(function (m) { return m.sale && m.sale.cgt && !m.sale.cgt.ready; }).map(function (m) { return m.name; });
      if (missingCgt.length) para("Not included, missing a purchase price or date: " + missingCgt.join(", ") + ".", 8, 130);
      if (exitRows.some(function (m) { return m.home; })) para("Your home is treated as exempt from capital gains tax (main residence). Part of the gain can be taxable if it was rented out or used for business.", 8, 130);
      if (held.some(function (m) { return m.owner && m.owner !== "individual"; })) para("Cash in hand for a property owned by a company, trust or super fund stays with that entity. Paying it out to you can carry further tax, which is not included.", 8, 130);
      if (t.cgtNeedsRate) para("Add your marginal tax rate under Tax and land tax to see the tax on properties held in your own name or a trust.", 8, 130);
      y += 6;
    }

    /* ---- 7. land tax ---------------------------------------------------- */
    var lt = P.landTax;
    if (lt && lt.groups.length) {
      section("Land tax", "Worked out per state and per owner, since each taxpayer gets their own threshold. Already counted in your cash flow above.");
      var lrows = lt.groups.map(function (g) {
        var owner = g.entity ? g.entity : g.ownerLabel || g.owner;
        return [g.state + ", " + owner, g.properties.map(function (p) { return p.name; }).join(", "), money(g.total), money(g.tax)];
      });
      if (lt.groups.length > 1) lrows.push(["Total", "", "", money(lt.totalTax)]);
      table([{ head: "State and owner", width: 130 }, { head: "Properties" }, { head: "Land value", width: 80, num: true }, { head: "Land tax / yr", width: 80, num: true }], lrows, lt.groups.length > 1);
      var gaps = [];
      if (lt.missingValue.length) gaps.push("no land value: " + lt.missingValue.map(function (p) { return p.name; }).join(", "));
      if (lt.missingState.length) gaps.push("no state: " + lt.missingState.map(function (p) { return p.name; }).join(", "));
      if (lt.unmodelled.length) gaps.push("state not modelled: " + lt.unmodelled.map(function (p) { return p.name; }).join(", "));
      if (gaps.length) para("Not included (" + gaps.join("; ") + ").", 8, 130);
      y += 6;
    }

    /* ---- 8. leases ------------------------------------------------------ */
    var heldProps = props.filter(function (p) { return !p.is_sold && !(p.usage === "home" && p.property_type !== "commercial"); });
    var leaseCount = heldProps.reduce(function (a, p) { return a + (p.leases || []).length; }, 0);
    if (leaseCount) {
      section("Leases and key dates");
      var wale = opts.computeWale ? opts.computeWale(heldProps) : null;
      var today = new Date(); today.setHours(0, 0, 0, 0);
      function days(d) { if (!d) return null; var x = new Date(d + "T00:00:00"); return isNaN(x) ? null : Math.round((x - today) / 86400000); }
      var soon = 0, events = [];
      heldProps.forEach(function (p) {
        (p.leases || []).forEach(function (l) {
          var d = days(l.lease_expiry);
          if (d != null && d >= 0 && d <= 365) soon++;
          if (opts.leaseEvents) opts.leaseEvents(p, l).forEach(function (ev) { var dd = days(ev.date); if (dd != null && dd >= 0) events.push(ev); });
        });
      });
      tiles([["WALE" + (wale ? (wale.basis === "income" ? " by income" : " by count") : ""), wale ? wale.years.toFixed(1) + " yrs" : "-"], ["Leases", String(leaseCount)], ["Expiring in 12 months", String(soon)]]);
      events.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
      if (events.length) {
        table([{ head: "Date", width: 80 }, { head: "Event", width: 110 }, { head: "Property" }, { head: "Tenant", width: 130 }],
          events.slice(0, 15).map(function (ev) { return [date(ev.date), ev.type, ev.property || "", ev.tenant || ""]; }));
        if (events.length > 15) para("Plus " + (events.length - 15) + " later dates, listed on your account.", 8, 130);
      }
      y += 6;
    }

    /* ---- 9. sold -------------------------------------------------------- */
    var rz = P.realised;
    if (rz && rz.count) {
      section("Properties you have sold", "Capital gains tax on each sale, grouped by the financial year of the sale contract.");
      var srows = [];
      rz.years.forEach(function (fy) {
        var yr = rz.byYear[fy];
        yr.props.forEach(function (m) {
          var c = m.sale.cgt;
          srows.push([fy || "-", m.name, c && c.ready ? (c.loss ? "Loss " + money(c.loss) : money(c.gain)) : "-", c && c.ready && !c.needsRate ? money(m.sale.tax) : "-"]);
        });
      });
      table([{ head: "Financial year", width: 90 }, { head: "Property" }, { head: "Gain", width: 90, num: true }, { head: "Tax", width: 90, num: true }], srows);
      y += 6;
    }

    /* ---- 10. what is missing ------------------------------------------- */
    var ms = P.missing, miss = [];
    if (ms.value.length) miss.push("Current value: " + ms.value.join(", "));
    if (ms.loan.length) miss.push("Loan balance: " + ms.loan.join(", "));
    if (ms.rent.length) miss.push("A lease with rent: " + ms.rent.join(", "));
    if (ms.rate.length) miss.push("Interest rate: " + ms.rate.join(", "));
    if (ms.term && ms.term.length) miss.push("Years left on a principal and interest loan: " + ms.term.join(", "));
    if (miss.length) {
      section("To complete your picture", "These properties are left out of some figures above until the detail is added.");
      miss.forEach(function (m) { para("- " + m, 9, 70); });
    }

    /* ---- fine print and footers ---------------------------------------- */
    y += 8;
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(130);
    var fine = doc.splitTextToSize(clean("Figures come from what you entered in your property register. This is a planning summary to help you understand your position. It is general in nature and is not financial, tax or legal advice. Confirm tax figures with your accountant and lending figures with your lender or broker."), W);
    ensure(fine.length * 10);
    doc.text(fine, L, y);

    var pages = doc.internal.getNumberOfPages();
    for (var p = 1; p <= pages; p++) {
      doc.setPage(p);
      doc.setDrawColor(BLUE[0], BLUE[1], BLUE[2]); doc.setLineWidth(0.6); doc.line(L, h - 34, w - L, h - 34); doc.setLineWidth(0.2);
      doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(140);
      doc.text("Project Carter  |  Portfolio Review", L, h - 22);
      doc.text("Page " + p + " of " + pages, w - L, h - 22, { align: "right" });
    }

    doc.save("portfolio-review-" + (opts.holder ? slug(opts.holder) + "-" : "") + new Date().toISOString().slice(0, 10) + ".pdf");
  }

  return { download: download };
})();
