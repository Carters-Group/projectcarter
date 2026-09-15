"use strict";

var test = require("node:test");
var assert = require("node:assert/strict");
var fs = require("node:fs");
var path = require("node:path");
var vm = require("node:vm");

vm.runInThisContext(
  fs.readFileSync(path.join(__dirname, "stamp.js"), "utf8"),
  { filename: "stamp.js" }
);

test("NSW general duty at $1,000,000", function () {
  assert.equal(globalThis.stampEstimate("NSW", 1000000, false), 39412);
});

test("NSW general duty at the $372,000 bracket top", function () {
  assert.equal(globalThis.stampEstimate("NSW", 372000, false), 11152);
});

test("VIC commercial uses the general scale (note is UI-only)", function () {
  assert.equal(globalThis.stampEstimate("VIC", 1000000, true), 55000);
  assert.equal(globalThis.stampEstimate("VIC", 1000000, false), 55000);
});

test("SA commercial duty is nil", function () {
  assert.equal(globalThis.stampEstimate("SA", 800000, true), 0);
  assert.equal(globalThis.stampEstimate("SA", 2500000, true), 0);
});

test("ACT commercial is nil up to the $2,100,000 threshold", function () {
  assert.equal(globalThis.ACT_COMM_THRESHOLD, 2100000);
  assert.equal(globalThis.stampEstimate("ACT", 2100000, true), 0);
  assert.equal(globalThis.stampEstimate("ACT", 2099999, true), 0);
});

test("ACT commercial over the threshold is 5% of the whole value", function () {
  assert.equal(globalThis.stampEstimate("ACT", 3000000, true), 150000);
});

test("NSW registration fees include transfer and mortgage when there is a loan", function () {
  assert.deepEqual(globalThis.regoFees("NSW", 1000000, true), {
    transfer: 180,
    mortgage: 180,
    total: 360
  });
});
