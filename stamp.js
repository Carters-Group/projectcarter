/* =========================================================================
   Project Carter - stamp duty + titles-office registration fees
   -------------------------------------------------------------------------
   Classic script (no modules). Load before each of roi/da/pr/cl calculator
   IIFEs. Exposes STAMP, REGO, ACT_COMM_THRESHOLD, bracketDuty, stampEstimate,
   regoFees on the global object.

   General (non-concessional) transfer duty by state. Company / investor
   purchases get no first-home or owner-occupier concession, so these are
   the standard scales. Published 2024-25 rates; thresholds in several
   states index yearly. Estimate only.
   ========================================================================= */
"use strict";

function bracketDuty(v, rows) {
  for (var i = 0; i < rows.length; i++) {
    if (v <= rows[i].up) return rows[i].base + (v - rows[i].over) * rows[i].rate;
  }
  return null;
}

var STAMP = {
  NSW: [
    { up: 17000, over: 0, base: 0, rate: 0.0125 },
    { up: 37000, over: 17000, base: 212, rate: 0.015 },
    { up: 99000, over: 37000, base: 512, rate: 0.0175 },
    { up: 372000, over: 99000, base: 1597, rate: 0.035 },
    { up: 1240000, over: 372000, base: 11152, rate: 0.045 },
    { up: 3721000, over: 1240000, base: 50212, rate: 0.055 },
    { up: Infinity, over: 3721000, base: 186668, rate: 0.07 }
  ],
  VIC: [
    { up: 25000, over: 0, base: 0, rate: 0.014 },
    { up: 130000, over: 25000, base: 350, rate: 0.024 },
    { up: 960000, over: 130000, base: 2870, rate: 0.06 },
    { up: 2000000, over: 0, base: 0, rate: 0.055 },
    { up: Infinity, over: 2000000, base: 110000, rate: 0.065 }
  ],
  QLD: [
    { up: 5000, over: 0, base: 0, rate: 0 },
    { up: 75000, over: 5000, base: 0, rate: 0.015 },
    { up: 540000, over: 75000, base: 1050, rate: 0.035 },
    { up: 1000000, over: 540000, base: 17325, rate: 0.045 },
    { up: Infinity, over: 1000000, base: 38025, rate: 0.0575 }
  ],
  WA: [
    { up: 120000, over: 0, base: 0, rate: 0.019 },
    { up: 150000, over: 120000, base: 2280, rate: 0.0285 },
    { up: 360000, over: 150000, base: 3135, rate: 0.038 },
    { up: 725000, over: 360000, base: 11115, rate: 0.0475 },
    { up: Infinity, over: 725000, base: 28453, rate: 0.0515 }
  ],
  SA: [
    { up: 12000, over: 0, base: 0, rate: 0.01 },
    { up: 30000, over: 12000, base: 120, rate: 0.02 },
    { up: 50000, over: 30000, base: 480, rate: 0.03 },
    { up: 100000, over: 50000, base: 1080, rate: 0.035 },
    { up: 200000, over: 100000, base: 2830, rate: 0.04 },
    { up: 250000, over: 200000, base: 6830, rate: 0.0425 },
    { up: 300000, over: 250000, base: 8955, rate: 0.0475 },
    { up: 500000, over: 300000, base: 11330, rate: 0.05 },
    { up: Infinity, over: 500000, base: 21330, rate: 0.055 }
  ],
  TAS: [
    { up: 3000, over: 0, base: 50, rate: 0 },
    { up: 25000, over: 3000, base: 50, rate: 0.0175 },
    { up: 75000, over: 25000, base: 435, rate: 0.0225 },
    { up: 200000, over: 75000, base: 1560, rate: 0.035 },
    { up: 375000, over: 200000, base: 5935, rate: 0.04 },
    { up: 725000, over: 375000, base: 12935, rate: 0.0425 },
    { up: Infinity, over: 725000, base: 27810, rate: 0.045 }
  ],
  ACT: [
    { up: 200000, over: 0, base: 0, rate: 0.006 },
    { up: 300000, over: 200000, base: 1200, rate: 0.022 },
    { up: 500000, over: 300000, base: 3400, rate: 0.034 },
    { up: 750000, over: 500000, base: 10200, rate: 0.0432 },
    { up: 1000000, over: 750000, base: 21000, rate: 0.059 },
    { up: 1455000, over: 1000000, base: 35750, rate: 0.064 },
    { up: Infinity, over: 0, base: 0, rate: 0.0454 }
  ]
};

/* ACT abolishes commercial duty up to this dutiable value (from 1 July 2026) */
var ACT_COMM_THRESHOLD = 2100000;

/* ---- title-office registration fees, indicative 2024-25 -------------
   A property transfer also attracts land-titles-office fees on top of
   transfer duty. Some jurisdictions charge a flat lodgement fee, others
   scale it with price. "transfer" registers the change of title;
   "mortgage" registers the buyer's incoming mortgage and is charged only
   when there is a loan. Registering the discharge of the seller's
   existing mortgage is the seller's cost and is not included here.
   Rounded, published titles-registry schedules, not quotes. */
var REGO = {
  NSW: { mortgage: 180, transfer: function () { return 180; } },
  VIC: { mortgage: 121, transfer: function (p) { return Math.min(3600, 92 + p * 0.00234); } },
  QLD: { mortgage: 231, transfer: function (p) {
           return 231 + (p > 180000 ? Math.ceil((p - 180000) / 10000) * 43 : 0); } },
  WA:  { mortgage: 178, transfer: function (p) {
           return 178 + (p > 85000 ? Math.ceil((p - 85000) / 100000) * 178 : 0); } },
  SA:  { mortgage: 190, transfer: function (p) {
           var b = [[5000, 190], [20000, 205], [40000, 260], [50000, 315], [100000, 475],
                    [200000, 830], [250000, 1010], [300000, 1190], [500000, 1720],
                    [1000000, 3945]];
           for (var i = 0; i < b.length; i++) { if (p <= b[i][0]) return b[i][1]; }
           return 6930; } },
  TAS: { mortgage: 155, transfer: function () { return 233; } },
  ACT: { mortgage: 174, transfer: function () { return 465; } },
  NT:  { mortgage: 166, transfer: function () { return 166; } }
};

function regoFees(state, price, hasLoan) {
  var r = REGO[state];
  if (!r || !price || price <= 0) return { transfer: 0, mortgage: 0, total: 0 };
  var t = Math.round(r.transfer(price));
  var m = hasLoan ? r.mortgage : 0;
  return { transfer: t, mortgage: m, total: t + m };
}

function stampEstimate(state, price, commercial) {
  if (!state || !price || price <= 0) return null;
  if (commercial && state === "SA") return 0;
  if (commercial && state === "ACT") return price <= ACT_COMM_THRESHOLD ? 0 : price * 0.05;
  if (state === "NT") {
    if (price <= 525000) { var V = price / 1000; return 0.06571441 * V * V + 15 * V; }
    if (price <= 3000000) return price * 0.0495;
    if (price <= 5000000) return price * 0.0575;
    return price * 0.0595;
  }
  var rows = STAMP[state];
  if (!rows) return null;
  var d = bracketDuty(price, rows);
  return d == null ? null : Math.max(d, 0);
}
