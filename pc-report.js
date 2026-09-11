/* =========================================================================
   Project Carter - "save this report" wiring, shared by all five calculators
   -------------------------------------------------------------------------
   Load order on each calculator page:

     <script src="script.js"></script>
     <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
     <script> ... the page's own calculator IIFE ... </script>
     <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
     <script src="pc-auth.js"></script>
     <script src="pc-report.js"></script>

   The page must carry <body data-pc-calc="noi|roi|da|grv|pr|cl">.

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

  var CALC_LABEL = { noi: "NOI", roi: "ROI", da: "DA", grv: "GRV", pr: "PR", cl: "CL" }[CALC] || CALC.toUpperCase();
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
    if (CALC === "pr") {
      data.dyn.props = Array.prototype.map.call(
        document.querySelectorAll("#propertyCards [data-prop]"),
        function (card) {
          var out = {};
          Array.prototype.forEach.call(
            card.querySelectorAll("input[id], select[id]"),
            function (el) {
              var key = el.id.replace(/^p\d+_/, "");
              out[key] = (el.type === "checkbox" || el.type === "radio") ? !!el.checked : el.value;
            }
          );
          return out;
        }
      );
    }
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

    if (CALC === "pr" && data.dyn && data.dyn.props && data.dyn.props.length) {
      matchRowCount("addProperty", "#propertyCards [data-prop]", ".dwelling-type__remove", data.dyn.props.length);
      document.querySelectorAll("#propertyCards [data-prop]").forEach(function (card, i) {
        var p = data.dyn.props[i]; if (!p) return;
        var id = card.getAttribute("data-prop");
        /* checkboxes first - the acquisition-costs toggle reveals other fields */
        Object.keys(p).forEach(function (key) {
          var el = card.querySelector("#p" + id + "_" + key);
          if (el && (el.type === "checkbox" || el.type === "radio")) setField(el, p[key]);
        });
        Object.keys(p).forEach(function (key) {
          var el = card.querySelector("#p" + id + "_" + key);
          if (el && el.type !== "checkbox" && el.type !== "radio") setField(el, p[key]);
        });
      });
    }

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

  /* ---- pull a figure from another saved report ---------------------------
     A field on this calculator can offer to pull a number straight from one
     of the signed-in visitor's OTHER saved reports (e.g. usable equity from
     a saved Portfolio Review), instead of re-running that calculator's model
     here. Reads the small `summary` snapshot each calculator writes onto its
     own saved report at save time (see onSave below); this page never needs
     to know how that number was worked out. Pulling copies a plain editable
     number into the field - it is a one-time snapshot, not a live link; a
     "choose a different report" control lets the visitor re-pull later. */
  var SOURCE_LABEL = { noi: "NOI", roi: "ROI", da: "Development Site (DA)", grv: "GRV", pr: "Portfolio Review", cl: "Commercial Lending" };

  function addPuller(opts) {
    var field = document.getElementById(opts.fieldId);
    if (!field) return;
    var host = field.closest(".field") || field.parentNode;
    if (!host) return;

    var box = document.createElement("div");
    box.className = "pc-pull";
    box.hidden = true;
    host.appendChild(box);

    var sourceLabel = SOURCE_LABEL[opts.sourceCalc] || opts.sourceCalc.toUpperCase();

    function renderIdle() {
      box.innerHTML = "";
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "linklike pc-pull__btn";
      btn.textContent = opts.label || ("Pull from a saved " + sourceLabel + " report");
      btn.addEventListener("click", loadList);
      box.appendChild(btn);
    }

    function loadList() {
      box.textContent = "Loading your saved reports…";
      window.pcAuth.listReports(opts.sourceCalc).then(function (res) {
        if (res.error) { box.textContent = res.error.message || "Could not load saved reports."; return; }
        var rows = (res.data || []).filter(function (r) {
          return r.summary && r.summary[opts.summaryKey] != null;
        });
        if (!rows.length) {
          box.textContent = "No saved " + sourceLabel + " report has this figure yet.";
          return;
        }
        renderPicker(rows);
      });
    }

    function renderPicker(rows) {
      box.innerHTML = "";
      var sel = document.createElement("select");
      sel.className = "pc-pull__select";
      var opt0 = document.createElement("option");
      opt0.value = "";
      opt0.textContent = "Choose a saved " + sourceLabel + " report…";
      sel.appendChild(opt0);
      rows.forEach(function (r) {
        var o = document.createElement("option");
        o.value = r.id;
        o.textContent = (r.title || "Untitled report") + " (" + new Date(r.updated_at).toLocaleDateString("en-AU") + ")";
        sel.appendChild(o);
      });
      sel.addEventListener("change", function () {
        var row = rows.filter(function (r) { return r.id === sel.value; })[0];
        if (row) pull(row);
      });
      box.appendChild(sel);
    }

    function pull(row) {
      var val = row.summary[opts.summaryKey];
      setField(field, Math.round(val).toLocaleString("en-AU"));
      box.innerHTML = "";
      var note = document.createElement("p");
      note.className = "pc-pull__note";
      note.textContent = "Pulled from “" + (row.title || "Untitled report") + "” (" +
        new Date(row.updated_at).toLocaleDateString("en-AU") + "). Still yours to edit.";
      var again = document.createElement("button");
      again.type = "button";
      again.className = "linklike";
      again.textContent = "Choose a different report";
      again.addEventListener("click", loadList);
      box.appendChild(note);
      box.appendChild(again);
    }

    function sync() {
      var show = !!(window.pcAuth && window.pcAuth.configured && window.pcAuth.isMember());
      box.hidden = !show;
      if (show && !box.firstChild) renderIdle();
    }
    document.addEventListener("pc-auth-change", sync);
    if (window.pcAuth && window.pcAuth.ready) window.pcAuth.ready.then(sync);
  }

  window.pcReport = { calc: CALC, serialize: serialize, restore: restore,
                      currentId: function () { return loadedReportId; },
                      addPuller: addPuller };

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
    var summary = {};
    try { if (window.pcCalcSummary) summary = window.pcCalcSummary() || {}; } catch (e) {}
    window.pcAuth.saveReport({
      calculator: CALC, title: title, inputs: serialize(), summary: summary, id: loadedReportId || undefined
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
    /* Pages declare window.PC_PULLERS = [{fieldId, sourceCalc, summaryKey, label}, ...]
       in their own inline script, BEFORE this file loads, since pc-report.js
       loads last. Wired up here once, rather than each page calling
       addPuller itself (which would run before window.pcReport exists). */
    (window.PC_PULLERS || []).forEach(addPuller);
    if (window.pcAuth && window.pcAuth.ready) {
      window.pcAuth.ready.then(function () { syncUi(); hydrate(); restoreDraft(); });
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
