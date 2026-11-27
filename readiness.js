/* =========================================================
   Readiness scorecard engine
   Used by commercial-readiness.html and development-readiness.html.
   Each page sets window.PC_QUIZ before loading this file:

   {
     id: "commercial",
     subject: "Commercial readiness scorecard",
     questions: [
       { id, cat, q, help?, type: "radio"|"check", options: [
           { v: "label", p: points, good?: "strength text", tip?: "gap text" }
         ], max?: number,            // check questions: points cap
         derive?: function(answers)  // optional: returns {p, max, good, tip}
       }
     ],
     cats: { key: "Label" },
     bands: [ { min, label, lead, next } ],   // highest min first
     ctas: [ { href, label, ghost? } ]
   }

   One question per screen. Radio questions advance on click; checkbox
   questions and the details screen have a Next button. No progress bar
   or question count, by design. The score is only shown after the lead
   has been accepted by /api/enquire (Turnstile checked server-side).
   ========================================================= */
(function () {
  "use strict";

  var Q = window.PC_QUIZ;
  if (!Q) return;

  var root = document.getElementById("quiz");
  var stage = document.getElementById("quizStage");
  var backBtn = document.getElementById("quizBack");
  var nextBtn = document.getElementById("quizNext");
  var nav = document.getElementById("quizNav");
  var main = document.getElementById("main");

  var TURNSTILE_SITE_KEY = "0x4AAAAAAGR2ENzdiprSVls5";
  var MIN_FILL_MS = 12000;
  var loadedAt = Date.now();

  var answers = {};             /* id -> string (radio) | string[] (check) */
  var questions = Q.questions;
  var current = 0;              /* 0..questions.length-1 = questions, questions.length = details */
  var detailsIdx = questions.length;
  var turnstile = { token: "", rendered: false, el: null };
  var sending = false;
  var details = { Name: "", Email: "", Phone: "", State: "", Message: "" };

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  /* ---------------- scoring ---------------- */
  function optOf(q, v) {
    for (var i = 0; i < q.options.length; i++) if (q.options[i].v === v) return q.options[i];
    return null;
  }

  function scoreQuestion(q) {
    if (q.derive) return q.derive(answers);
    var a = answers[q.id];
    if (q.type === "check") {
      var picked = Array.isArray(a) ? a : [];
      var sum = 0;
      picked.forEach(function (v) { var o = optOf(q, v); if (o) sum += o.p; });
      var max = q.max || q.options.reduce(function (t, o) { return t + Math.max(0, o.p); }, 0);
      var p = Math.min(sum, max);
      var r = { p: p, max: max };
      if (q.good && p / max >= 0.7) r.good = q.good;
      if (q.tip && p / max < 0.7) {
        var missing = q.options.filter(function (o) { return o.p > 0 && picked.indexOf(o.v) === -1; })
          .map(function (o) { return o.short || o.v; });
        r.tip = q.tip.replace("{missing}", missing.join(", ").toLowerCase());
      }
      return r;
    }
    var o = optOf(q, a);
    if (!o || o.p == null) return null;
    var m = q.options.reduce(function (t, x) { return Math.max(t, x.p == null ? 0 : x.p); }, 0);
    return { p: o.p, max: m, good: o.good, tip: o.tip };
  }

  function results() {
    var cats = {};
    var total = 0, max = 0, goods = [], tips = [];
    questions.forEach(function (q) {
      var r = scoreQuestion(q);
      if (!r || !r.max) return;
      total += r.p; max += r.max;
      if (q.cat) {
        cats[q.cat] = cats[q.cat] || { p: 0, max: 0 };
        cats[q.cat].p += r.p; cats[q.cat].max += r.max;
      }
      var ratio = r.p / r.max;
      if (r.good && ratio >= 0.7) goods.push({ t: r.good, w: r.max * ratio });
      if (r.tip && ratio < 0.7) tips.push({ t: r.tip, w: r.max * (1 - ratio) });
    });
    var score = max ? Math.round((total / max) * 100) : 0;
    var band = Q.bands[Q.bands.length - 1];
    for (var i = 0; i < Q.bands.length; i++) { if (score >= Q.bands[i].min) { band = Q.bands[i]; break; } }
    goods.sort(function (a, b) { return b.w - a.w; });
    tips.sort(function (a, b) { return b.w - a.w; });
    return { score: score, band: band, cats: cats, goods: goods.slice(0, 4), tips: tips.slice(0, 4) };
  }

  /* ---------------- rendering ---------------- */
  function renderQuestion(i) {
    var q = questions[i];
    var a = answers[q.id];
    var type = q.type === "check" ? "checkbox" : "radio";
    var html = '<fieldset class="quiz-step" data-q="' + esc(q.id) + '">' +
      '<legend class="quiz-q">' + esc(q.q) + "</legend>" +
      (q.help ? '<p class="quiz-help">' + esc(q.help) + "</p>" : "") +
      '<div class="opts"' + (type === "radio" ? ' role="radiogroup"' : "") + ">";
    q.options.forEach(function (o, k) {
      var checked = type === "radio" ? a === o.v : Array.isArray(a) && a.indexOf(o.v) !== -1;
      html += '<label class="opt"><input type="' + type + '" name="q_' + esc(q.id) + '" value="' + esc(o.v) + '"' +
        (checked ? " checked" : "") + ' data-k="' + k + '" /><span>' + esc(o.v) + "</span></label>";
    });
    html += "</div></fieldset>";
    stage.innerHTML = html;

    var inputs = stage.querySelectorAll("input");
    Array.prototype.forEach.call(inputs, function (inp) {
      inp.addEventListener("change", function () {
        if (type === "radio") {
          answers[q.id] = inp.value;
          refreshNav();
          /* small pause so the tick registers before the next question */
          setTimeout(function () { if (current === i) go(1); }, 260);
        } else {
          answers[q.id] = Array.prototype.filter.call(inputs, function (x) { return x.checked; })
            .map(function (x) { return x.value; });
          refreshNav();
        }
      });
    });
    var first = stage.querySelector("input:checked") || inputs[0];
    if (first) first.focus({ preventScroll: true });
  }

  var STATES = ["Queensland", "New South Wales", "Victoria", "Western Australia", "South Australia",
    "Tasmania", "Australian Capital Territory", "Northern Territory", "Outside Australia"];

  function renderDetails() {
    var opts = '<option value="" disabled' + (details.State ? "" : " selected") + ">Select your state</option>" +
      STATES.map(function (s) { return "<option" + (details.State === s ? " selected" : "") + ">" + s + "</option>"; }).join("");
    stage.innerHTML =
      '<div class="quiz-step">' +
      '<p class="quiz-q">Last step: where can I reach you?</p>' +
      '<p class="quiz-help">Your score, what\'s working for you and what to work on next show up on screen as soon as you hit the button.</p>' +
      '<div class="q q-contact">' +
      '<div class="field"><label for="qName">Name</label><input type="text" id="qName" autocomplete="name" required value="' + esc(details.Name) + '" /></div>' +
      '<div class="field"><label for="qEmail">Email</label><input type="email" id="qEmail" autocomplete="email" required value="' + esc(details.Email) + '" /></div>' +
      '<div class="field"><label for="qPhone">Phone</label><input type="tel" id="qPhone" autocomplete="tel" required value="' + esc(details.Phone) + '" /></div>' +
      '<div class="field"><label for="qState">Which state do you live in?</label><select id="qState" autocomplete="address-level1" required>' + opts + "</select></div>" +
      '<div class="field"><label for="qMsg">Anything else I should know? (optional)</label><textarea id="qMsg" rows="2">' + esc(details.Message) + "</textarea></div>" +
      '<input type="text" id="qHp" tabindex="-1" autocomplete="off" aria-hidden="true" class="hp" />' +
      '<div class="field" id="turnstileBox" hidden></div>' +
      '<p class="form-note" id="qNote" aria-live="polite"></p>' +
      "</div>" +
      '<p class="form-fineprint">I\'ll only use your details to follow up on your score.</p>' +
      "</div>";

    var map = { qName: "Name", qEmail: "Email", qPhone: "Phone", qState: "State", qMsg: "Message" };
    Object.keys(map).forEach(function (id) {
      var el = document.getElementById(id);
      var h = function () { details[map[id]] = el.value; refreshNav(); };
      el.addEventListener("input", h);
      el.addEventListener("change", h);
    });
    turnstile.rendered = false;
    turnstile.token = "";
    renderTurnstile();
    document.getElementById("qName").focus({ preventScroll: true });
  }

  function renderTurnstile() {
    if (!TURNSTILE_SITE_KEY || turnstile.rendered || !window.turnstile) return;
    var box = document.getElementById("turnstileBox");
    if (!box) return;
    turnstile.rendered = true;
    turnstile.el = box;
    box.hidden = false;
    window.turnstile.render(box, {
      sitekey: TURNSTILE_SITE_KEY,
      theme: "dark",
      size: "flexible",
      "refresh-expired": "auto",
      callback: function (t) { turnstile.token = t; refreshNav(); },
      "expired-callback": function () { turnstile.token = ""; refreshNav(); },
      "error-callback": function () { turnstile.token = ""; refreshNav(); }
    });
  }
  if (TURNSTILE_SITE_KEY) {
    window.onTurnstileLoad = function () { if (current === detailsIdx) renderTurnstile(); };
    var ts = document.createElement("script");
    ts.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=onTurnstileLoad";
    ts.async = true;
    document.head.appendChild(ts);
  }

  function detailsValid() {
    var email = details.Email.trim();
    return details.Name.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
      details.Phone.replace(/\D/g, "").length >= 8 && details.State;
  }

  function stepValid() {
    if (current === detailsIdx) return !!detailsValid() && (!TURNSTILE_SITE_KEY || !!turnstile.token) && !sending;
    var q = questions[current];
    var a = answers[q.id];
    if (q.type === "check") return true;      /* "none of these" is a valid answer */
    return !!a;
  }

  function refreshNav() {
    backBtn.hidden = current === 0;
    var q = questions[current];
    var isRadio = q && q.type !== "check";
    /* radio questions advance themselves; show Next only once answered (for when they come Back) */
    nextBtn.hidden = isRadio && !answers[q.id];
    nextBtn.textContent = current === detailsIdx ? (sending ? "Working it out…" : "Show my score") : "Next";
    nextBtn.disabled = !stepValid();
    nav.hidden = current === 0 && nextBtn.hidden;
  }

  function render() {
    if (current === detailsIdx) renderDetails();
    else renderQuestion(current);
    refreshNav();
  }

  function go(dir) {
    var n = current + dir;
    if (n < 0 || n > detailsIdx) return;
    if (dir > 0 && !stepValid()) return;
    current = n;
    render();
    /* keep the card in view on phones */
    var top = root.getBoundingClientRect().top;
    if (top < 0 || top > window.innerHeight * 0.6) root.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  backBtn.addEventListener("click", function () { go(-1); });
  nextBtn.addEventListener("click", function () {
    if (current === detailsIdx) submit();
    else go(1);
  });

  /* ---------------- submit ---------------- */
  function note(msg) {
    var el = document.getElementById("qNote");
    if (el) { el.textContent = msg || ""; el.className = "form-note" + (msg ? " is-bad" : ""); }
  }

  function answerText(q) {
    var a = answers[q.id];
    if (Array.isArray(a)) return a.length ? a.join(", ") : "None of these";
    return a || "";
  }

  function submit() {
    if (!stepValid() || sending) return;
    var hp = document.getElementById("qHp");
    var R = results();
    if (hp && hp.value) { showResults(R); return; }
    if (Date.now() - loadedAt < MIN_FILL_MS) { showResults(R); return; }   /* bot speed: show, send nothing */

    var text = details.Message + " " + details.Name;
    if (/https?:\/\/|www\./i.test(text)) {
      note("Please remove any links from your message and try again.");
      return;
    }

    sending = true;
    refreshNav();
    note("");

    var data = {
      _subject: Q.subject + ": " + R.score + "/100 (" + R.band.label + ")",
      Scorecard: Q.subject,
      Score: R.score + "/100",
      Band: R.band.label
    };
    Object.keys(Q.cats).forEach(function (k) {
      var c = R.cats[k];
      if (c && c.max) data["Score: " + Q.cats[k]] = Math.round((c.p / c.max) * 100) + "%";
    });
    questions.forEach(function (q) { data[q.short || q.q] = answerText(q); });
    data.Name = details.Name.trim();
    data.Email = details.Email.trim();
    data.Phone = details.Phone.trim();
    data.State = details.State;
    if (details.Message.trim()) data.Message = details.Message.trim();
    if (turnstile.token) data["cf-turnstile-response"] = turnstile.token;

    fetch("/api/enquire", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(data)
    }).then(function (r) {
      return r.json().catch(function () { return { ok: false }; });
    }).then(function (res) {
      if (res && res.ok) { showResults(R); return; }
      var msg = "Sorry, that didn't go through. Please try again in a moment.";
      if (res && res.reason === "email") msg = "That email address doesn't look right. Please check it.";
      if (res && res.reason === "spam") msg = "Your message looks like advertising or contains a link. Please reword it.";
      if (res && res.reason === "captcha") msg = "The security check expired. Please tick it again.";
      if (res && res.reason === "rate") msg = "Too many attempts. Please wait a minute and try again.";
      fail(msg);
    }).catch(function () {
      fail("Sorry, that didn't go through. Please check your connection and try again.");
    });
  }

  function fail(msg) {
    sending = false;
    if (turnstile.rendered && window.turnstile && turnstile.el) {
      turnstile.token = "";
      window.turnstile.reset(turnstile.el);
    }
    refreshNav();
    note(msg);
  }

  /* ---------------- results ---------------- */
  function showResults(R) {
    sending = false;
    nav.hidden = true;
    if (main) main.classList.add("quiz-done");
    var C = 2 * Math.PI * 52;
    var catsHtml = Object.keys(Q.cats).map(function (k) {
      var c = R.cats[k];
      if (!c || !c.max) return "";
      var pct = Math.round((c.p / c.max) * 100);
      return '<div class="rs-cat"><div class="rs-cat-top"><span>' + esc(Q.cats[k]) + "</span><span>" + pct + "%</span></div>" +
        '<div class="rs-cat-bar"><span style="width:' + pct + '%"></span></div></div>';
    }).join("");
    var list = function (arr, cls) {
      return arr.length ? '<ul class="rs-list ' + cls + '">' + arr.map(function (x) { return "<li>" + esc(x.t) + "</li>"; }).join("") + "</ul>"
        : '<p class="rs-empty">' + (cls === "is-good" ? "Nothing standing out yet, which is normal at the start." : "No big gaps. Nice work.") + "</p>";
    };
    var first = details.Name.trim().split(/\s+/)[0];
    stage.innerHTML =
      '<div class="rs" tabindex="-1" id="rs">' +
      '<div class="rs-head">' +
      '<div class="rs-ring" role="img" aria-label="Score ' + R.score + ' out of 100">' +
      '<svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="52" class="rs-ring-bg"/>' +
      '<circle cx="60" cy="60" r="52" class="rs-ring-fg" stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + C.toFixed(1) + '" data-off="' + (C * (1 - R.score / 100)).toFixed(1) + '"/></svg>' +
      '<div class="rs-num"><strong>' + R.score + "</strong><span>/ 100</span></div></div>" +
      '<div><p class="kicker">' + esc(first ? first + ", your result" : "Your result") + "</p>" +
      '<h2 class="rs-band">' + esc(R.band.label) + "</h2>" +
      '<p class="rs-lead">' + esc(R.band.lead) + "</p></div></div>" +
      '<div class="rs-cats">' + catsHtml + "</div>" +
      '<div class="rs-cols"><div><h3>What\'s working for you</h3>' + list(R.goods, "is-good") + "</div>" +
      "<div><h3>What to work on</h3>" + list(R.tips, "is-tip") + "</div></div>" +
      '<div class="rs-next"><h3>Next step</h3><p>' + esc(R.band.next) + "</p>" +
      '<div class="rs-ctas">' + Q.ctas.map(function (c) {
        return '<a class="btn ' + (c.ghost ? "btn-ghost" : "btn-accent") + '" href="' + esc(c.href) + '">' + esc(c.label) + "</a>";
      }).join("") + "</div></div>" +
      '<p class="form-fineprint">A general guide only, based on your answers. It isn\'t financial, lending or tax advice, and it doesn\'t assess your borrowing capacity. Speak to your broker and accountant before you commit.</p>' +
      "</div>";
    var rs = document.getElementById("rs");
    root.scrollIntoView({ behavior: "smooth", block: "start" });
    rs.focus({ preventScroll: true });
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        var fg = stage.querySelector(".rs-ring-fg");
        if (fg) fg.setAttribute("stroke-dashoffset", fg.getAttribute("data-off"));
      });
    });
  }

  /* expose for testing in the console */
  window.PC_QUIZ_DEBUG = { answers: answers, results: results, show: function () { showResults(results()); } };

  render();
})();
