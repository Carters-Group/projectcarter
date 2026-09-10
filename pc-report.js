/* =========================================================================
   Project Carter - "save this report" wiring, shared by all four calculators
   -------------------------------------------------------------------------
   Load order on each calculator page:

     <script src="script.js"></script>
     <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
     <script> ... the page's own calculator IIFE ... </script>
     <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
     <script src="pc-auth.js"></script>
     <script src="pc-report.js"></script>

   The page must carry <body data-pc-calc="noi|roi|da|grv">.

   What this does, entirely from the DOM (no reach into the calculator IIFE):
     - wires the "Project name or address" field (#pcProjectName, or #address
       on the DA page) as the report title
     - adds a "Save report" button into .calc-cta
     - on ?report=<id>, rehydrates every input from a saved report and lets
       the calculator's own listeners recompute
   Unmasking for signed-in members is done inside each calculator IIFE.
   ========================================================================= */
(function () {
  "use strict";

  var CALC = (document.body.getAttribute("data-pc-calc") || "").toLowerCase();
  if (!CALC) return;

  var CALC_LABEL = { noi: "NOI", roi: "ROI", da: "DA", grv: "GRV" }[CALC] || CALC.toUpperCase();
  var inputsRoot = document.getElementById("calcInputs");
  if (!inputsRoot) return;

  var loadedReportId = null;
  var loadedTitle = "";
  var DRAFT_KEY = "pc_draft_" + CALC;

  /* ---- project name / address field ----------------------------------- */
  function nameField() {
    return document.getElementById("pcProjectName") || document.getElementById("address");
  }
  function projectName() {
    var f = nameField();
    return f && f.value ? f.value.trim() : "";
  }
  function defaultTitle() {
    return projectName() || ("Untitled " + CALC_LABEL + " report");
  }

  /* ---- (de)serialise -------------------------------------------------------- */
  function fieldEls() {
    return Array.prototype.slice.call(
      inputsRoot.querySelectorAll("input[id], select[id], textarea[id]")
    ).filter(function (el) { return el.type !== "button" && el.type !== "submit"; });
  }

  function serialize() {
    var data = { v: 2, calc: CALC, projectName: projectName(), fields: {}, dyn: {} };
    fieldEls().forEach(function (el) {
      if (el.type === "checkbox" || el.type === "radio") data.fields[el.id] = !!el.checked;
      else data.fields[el.id] = el.value;
    });
    if (CALC === "grv") {
      data.dyn.types = Array.prototype.map.call(
        document.querySelectorAll("#typeCards [data-type]"),
        function (card) {
          var id = card.getAttribute("data-type");
          function g(sfx) { var n = card.querySelector("#t" + id + "_" + sfx); return n ? n.value : ""; }
          return { label: g("label"), count: g("count"), gfa: g("gfa"),
                   build: g("build"), price: g("price"), sellpct: g("sellpct") };
        }
      );
      data.dyn.finance = Array.prototype.map.call(
        document.querySelectorAll("#financeRows [data-fin]"),
        function (row) {
          var id = row.getAttribute("data-fin");
          function g(sfx) { var n = row.querySelector("#f" + id + "_" + sfx); return n ? n.value : ""; }
          return { label: g("label"), rate: g("rate"), basis: g("basis"), period: g("period") };
        }
      );
    }
    return data;
  }

  function fire(el, types) {
    types.forEach(function (t) {
      var ev;
      try { ev = new Event(t, { bubbles: true }); }
      catch (e) { ev = document.createEvent("Event"); ev.initEvent(t, true, false); }
      el.dispatchEvent(ev);
    });
  }

  function setField(el, val) {
    if (!el) return;
    if (el.type === "checkbox" || el.type === "radio") {
      var want = !!val;
      if (el.checked !== want) { el.checked = want; fire(el, ["input", "change", "click"]); }
      return;
    }
    el.value = val == null ? "" : String(val);
    fire(el, ["input", "change", "blur"]);
  }

  function matchRowCount(addBtnId, rowSelector, removeSelector, want) {
    var addBtn = document.getElementById(addBtnId);
    var guard = 0;
    function count() { return document.querySelectorAll(rowSelector).length; }
    while (count() < want && guard++ < 40) { if (addBtn) addBtn.click(); else break; }
    guard = 0;
    while (count() > want && guard++ < 40) {
      var rows = document.querySelectorAll(rowSelector);
      var last = rows[rows.length - 1];
      var rm = last && last.querySelector(removeSelector);
      if (rm) rm.click(); else break;
    }
  }

  function restore(data) {
    if (!data || !data.fields) return;

    if (CALC === "grv" && data.dyn) {
      if (data.dyn.types && data.dyn.types.length) {
        matchRowCount("addType", "#typeCards [data-type]", ".dwelling-type__remove", data.dyn.types.length);
        document.querySelectorAll("#typeCards [data-type]").forEach(function (card, i) {
          var t = data.dyn.types[i]; if (!t) return;
          var id = card.getAttribute("data-type");
          setField(card.querySelector("#t" + id + "_label"), t.label);
          setField(card.querySelector("#t" + id + "_count"), t.count);
          setField(card.querySelector("#t" + id + "_gfa"), t.gfa);
          setField(card.querySelector("#t" + id + "_build"), t.build);
          setField(card.querySelector("#t" + id + "_price"), t.price);
          setField(card.querySelector("#t" + id + "_sellpct"), t.sellpct);
        });
      }
      if (data.dyn.finance && data.dyn.finance.length) {
        matchRowCount("addFinance", "#financeRows [data-fin]", ".finance-row__remove", data.dyn.finance.length);
        document.querySelectorAll("#financeRows [data-fin]").forEach(function (row, i) {
          var fr = data.dyn.finance[i]; if (!fr) return;
          var id = row.getAttribute("data-fin");
          setField(row.querySelector("#f" + id + "_basis"), fr.basis);
          setField(row.querySelector("#f" + id + "_label"), fr.label);
          setField(row.querySelector("#f" + id + "_rate"), fr.rate);
          setField(row.querySelector("#f" + id + "_period"), fr.period);
        });
      }
    }

    /* static fields: checkboxes first (they gate other fields), then the rest */
    var ids = Object.keys(data.fields);
    ids.filter(function (id) {
      var el = document.getElementById(id);
      return el && (el.type === "checkbox" || el.type === "radio");
    }).forEach(function (id) { setField(document.getElementById(id), data.fields[id]); });

    ids.filter(function (id) {
      var el = document.getElementById(id);
      return el && el.type !== "checkbox" && el.type !== "radio";
    }).forEach(function (id) { setField(document.getElementById(id), data.fields[id]); });

    if (data.projectName && nameField()) setField(nameField(), data.projectName);

    var first = fieldEls()[0];
    if (first) fire(first, ["input", "change"]);
  }

  window.pcReport = { calc: CALC, serialize: serialize, restore: restore,
                      currentId: function () { return loadedReportId; } };

  /* ---- Save button ------------------------------------------------------ */
  var cta = document.querySelector(".calc-cta");
  var openLead = document.getElementById("openLead");
  var saveBtn, saveMsg;

  function buildSaveUi() {
    if (!cta || saveBtn) return;
    saveBtn = document.createElement("button");
    saveBtn.type = "button";
    saveBtn.id = "pcSaveBtn";
    saveBtn.className = "btn btn-ghost btn-block pc-save-btn";
    saveMsg = document.createElement("p");
    saveMsg.className = "pc-save-msg";
    saveMsg.hidden = true;
    if (openLead && openLead.parentNode === cta) {
      cta.insertBefore(saveBtn, openLead);
      cta.insertBefore(saveMsg, openLead);
    } else {
      cta.appendChild(saveBtn);
      cta.appendChild(saveMsg);
    }
    saveBtn.addEventListener("click", onSave);
    syncUi();
  }

  function msg(text, kind) {
    if (!saveMsg) return;
    saveMsg.textContent = text || "";
    saveMsg.hidden = !text;
    saveMsg.className = "pc-save-msg" + (kind ? " is-" + kind : "");
  }

  function syncUi() {
    if (!saveBtn || !window.pcAuth) return;
    if (!window.pcAuth.configured) { saveBtn.hidden = true; return; }
    saveBtn.hidden = false;
    if (window.pcAuth.isMember()) {
      saveBtn.textContent = loadedReportId ? "Update saved report" : "Save report";
      saveBtn.disabled = false;
    } else {
      saveBtn.textContent = "Sign in to save this report";
      saveBtn.disabled = false;
    }
  }

  function stashDraft() {
    try { window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(serialize())); } catch (e) {}
  }

  function onSave() {
    if (!window.pcAuth.isMember()) {
      stashDraft();
      var here = window.location.pathname.split("/").pop() || ("" + CALC + "-calculator.html");
      window.location.href = "account.html?from=" + encodeURIComponent(here);
      return;
    }
    saveBtn.disabled = true;
    msg("Saving…");
    var title = projectName() || loadedTitle || defaultTitle();
    window.pcAuth.saveReport({
      calculator: CALC, title: title, inputs: serialize(), id: loadedReportId || undefined
    }).then(function (res) {
      saveBtn.disabled = false;
      if (res.error) { msg(res.error.message || "Could not save.", "error"); return; }
      if (res.data && res.data.id) {
        loadedReportId = res.data.id;
        loadedTitle = res.data.title;
        try {
          var u = new URL(window.location.href);
          u.searchParams.set("report", loadedReportId);
          history.replaceState(null, "", u.toString());
        } catch (e) {}
      }
      try { window.sessionStorage.removeItem(DRAFT_KEY); } catch (e) {}
      msg("Saved as “" + title + "”. Open it any time from your account.", "ok");
      syncUi();
    });
  }

  /* ---- hydrate from ?report=<id> ------------------------------------------- */
  function hydrate() {
    var id;
    try { id = new URL(window.location.href).searchParams.get("report"); } catch (e) { id = null; }
    if (!id) return;
    if (!window.pcAuth.configured) return;
    if (!window.pcAuth.isMember()) {
      msg("Sign in to open this saved report.", "error");
      return;
    }
    msg("Loading your saved report…");
    window.pcAuth.getReport(id).then(function (res) {
      if (res.error || !res.data) { msg("That report could not be found.", "error"); return; }
      loadedReportId = res.data.id;
      loadedTitle = res.data.title;
      restore(res.data.inputs || {});
      try { window.sessionStorage.removeItem(DRAFT_KEY); } catch (e) {}
      msg("Loaded “" + (res.data.title || "Untitled report") + "”. Changes here can be saved back.", "ok");
      syncUi();
    });
  }

  /* a draft stashed just before a "sign in to save" redirect - restore it
     once the visitor is back and signed in, if they are not opening a
     specific saved report */
  function restoreDraft() {
    var hasReportParam;
    try { hasReportParam = !!new URL(window.location.href).searchParams.get("report"); } catch (e) { hasReportParam = false; }
    if (hasReportParam || !window.pcAuth.isMember()) return;
    var raw;
    try { raw = window.sessionStorage.getItem(DRAFT_KEY); } catch (e) { raw = null; }
    if (!raw) return;
    try { window.sessionStorage.removeItem(DRAFT_KEY); } catch (e) {}
    try {
      restore(JSON.parse(raw));
      msg("Your figures are back. Press “Save report” to keep them.", "ok");
    } catch (e) {}
  }

  document.addEventListener("pc-auth-change", syncUi);

  function start() {
    buildSaveUi();
    if (window.pcAuth && window.pcAuth.ready) {
      window.pcAuth.ready.then(function () { syncUi(); hydrate(); restoreDraft(); });
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
