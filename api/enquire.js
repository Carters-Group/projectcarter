/**
 * Server-side gate for the /enquire lead form.
 *
 * The browser posts here (same origin) instead of straight to Formspree, so
 * the Formspree form ID never appears in page code and bots can't skip the
 * checks by posting to Formspree directly.
 *
 * Vercel env:
 *   TURNSTILE_SECRET_KEY   Cloudflare Turnstile secret. When set, every post
 *                          must carry a valid cf-turnstile-response token.
 *   FORMSPREE_ENQUIRE_FORM Formspree form ID (e.g. "abcdwxyz") for enquiries.
 *                          Falls back to the shared site form if unset.
 * Do not log submissions or keys.
 *
 * Accepts JSON or urlencoded. -> { ok: boolean, reason?: string }
 */
"use strict";

var SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
var FALLBACK_FORM = "xqpkjvkb";
var TIMEOUT_MS = 6000;
var MAX_BODY = 16384;
var WINDOW_MS = 60000;
var MAX_PER_WINDOW = 5;
var MAX_FIELDS = 40;
var MAX_VALUE = 4000;

var SPAM_PHRASES = /\b(seo|backlinks?|guest post|search engine|rank(ing)? (on|in) google|first page of google|web ?(site )?(design|development)|digital marketing|lead ?gen(eration)?|social media (marketing|management)|link ?building|traffic to your|increase your (sales|traffic|revenue)|we offer|our (agency|services|team can)|free (audit|quote|trial)|crypto|bitcoin|casino|viagra|loan offer|directoryinspector|chatgpt visibility|soft loans?|telegram|whatsapp)\b/i;

var ipHits = Object.create(null);

function clientIp(req) {
  var xff = req.headers["x-forwarded-for"];
  if (xff) return String(xff).split(",")[0].trim() || "unknown";
  return (req.socket && req.socket.remoteAddress) || "unknown";
}

function rateLimited(ip, now) {
  Object.keys(ipHits).forEach(function (k) {
    if (now - ipHits[k].start > WINDOW_MS) delete ipHits[k];
  });
  var b = ipHits[ip];
  if (!b || now - b.start > WINDOW_MS) {
    ipHits[ip] = { start: now, count: 1 };
    return false;
  }
  b.count += 1;
  return b.count > MAX_PER_WINDOW;
}

function hostOf(v) {
  return v ? String(v).split(",")[0].trim().toLowerCase() : "";
}

function sameOrigin(req) {
  var origin = req.headers.origin;
  if (!origin) return true;
  var originHost;
  try { originHost = new URL(origin).host.toLowerCase(); } catch (e) { return false; }
  var fwd = hostOf(req.headers["x-forwarded-host"]);
  var host = hostOf(req.headers.host);
  return (fwd && fwd === originHost) || (host && host === originHost);
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function parseRaw(raw, type) {
  if (!raw) return {};
  if (type.indexOf("application/x-www-form-urlencoded") !== -1) {
    var out = {};
    new URLSearchParams(raw).forEach(function (v, k) { out[k] = v; });
    return out;
  }
  return JSON.parse(raw);
}

function readBody(req) {
  var type = String(req.headers["content-type"] || "").toLowerCase();
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    return Promise.resolve(req.body);
  }
  if (typeof req.body === "string") {
    try { return Promise.resolve(parseRaw(req.body, type)); } catch (e) { return Promise.reject(e); }
  }
  return new Promise(function (resolve, reject) {
    var chunks = [];
    var size = 0;
    req.on("data", function (c) {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error("too large")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", function () {
      try { resolve(parseRaw(Buffer.concat(chunks).toString("utf8"), type)); } catch (e) { reject(e); }
    });
    req.on("error", reject);
  });
}

function wantsJson(req) {
  return String(req.headers.accept || "").indexOf("application/json") !== -1;
}

/* Plain (no-JS) form posts get a redirect; fetch callers get JSON. */
function finish(req, res, status, body) {
  if (!wantsJson(req) && body.ok) {
    res.statusCode = 303;
    res.setHeader("Location", "/thanks");
    res.end();
    return;
  }
  send(res, status, body);
}

async function verifyTurnstile(secret, token, ip) {
  if (!token || typeof token !== "string" || token.length > 2048) return false;
  var ac = new AbortController();
  var timer = setTimeout(function () { ac.abort(); }, TIMEOUT_MS);
  try {
    var form = new URLSearchParams();
    form.set("secret", secret);
    form.set("response", token);
    if (ip && ip !== "unknown") form.set("remoteip", ip);
    var r = await fetch(SITEVERIFY, { method: "POST", body: form, signal: ac.signal });
    if (!r.ok) return false;
    var data = await r.json();
    return data && data.success === true;
  } catch (e) {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function clean(body) {
  var out = {};
  var n = 0;
  Object.keys(body).forEach(function (k) {
    if (n >= MAX_FIELDS) return;
    if (k === "cf-turnstile-response" || k === "_gotcha" || k === "_next") return;
    var v = body[k];
    if (Array.isArray(v)) v = v.join(", ");
    if (v == null || typeof v === "object") return;
    out[String(k).slice(0, 60)] = String(v).slice(0, MAX_VALUE);
    n += 1;
  });
  return out;
}

module.exports = async function (req, res) {
  try {
    if (req.method !== "POST") { send(res, 405, { ok: false, reason: "method" }); return; }
    if (!sameOrigin(req)) { send(res, 403, { ok: false, reason: "origin" }); return; }
    var ip = clientIp(req);
    if (rateLimited(ip, Date.now())) { send(res, 429, { ok: false, reason: "rate" }); return; }

    var body;
    try { body = await readBody(req); } catch (e) { send(res, 400, { ok: false, reason: "invalid" }); return; }
    if (!body || typeof body !== "object") { send(res, 400, { ok: false, reason: "invalid" }); return; }

    /* Honeypot filled: pretend it worked, send nothing. */
    if (body._gotcha) { finish(req, res, 200, { ok: true }); return; }

    var secret = process.env.TURNSTILE_SECRET_KEY;
    if (secret) {
      var passed = await verifyTurnstile(secret, body["cf-turnstile-response"], ip);
      if (!passed) { send(res, 403, { ok: false, reason: "captcha" }); return; }
    }

    var email = String(body.Email || body.email || "").trim();
    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      send(res, 400, { ok: false, reason: "email" });
      return;
    }

    /* /enquire uses Message/Name; the 42 Haig St form uses message/first_name/last_name. */
    var text = [body.Message, body.Name, body.message, body.first_name, body.last_name].join(" ");
    if (/https?:\/\/|www\./i.test(text) || SPAM_PHRASES.test(text)) {
      send(res, 422, { ok: false, reason: "spam" });
      return;
    }

    var formId = String(process.env.FORMSPREE_ENQUIRE_FORM || FALLBACK_FORM).replace(/[^a-zA-Z0-9]/g, "");
    var payload = clean(body);
    payload._replyto = email;

    var ac = new AbortController();
    var timer = setTimeout(function () { ac.abort(); }, TIMEOUT_MS);
    try {
      var up = await fetch("https://formspree.io/f/" + formId, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
        signal: ac.signal
      });
      if (!up.ok) { send(res, 502, { ok: false, reason: "upstream" }); return; }
    } catch (e) {
      send(res, 502, { ok: false, reason: "upstream" });
      return;
    } finally {
      clearTimeout(timer);
    }

    finish(req, res, 200, { ok: true });
  } catch (e) {
    send(res, 500, { ok: false, reason: "error" });
  }
};
