/**
 * Same-origin email reputation proxy for enquire.html.
 *
 * Vercel env: ABSTRACTAPI_KEY — AbstractAPI Email Reputation API key.
 * Set it on the Vercel project. If it is missing, this function fails open
 * ({ ok: true }) so the contact form still posts to Formspree.
 * Do not put the key in client code. Do not log emails or the key.
 *
 * POST JSON { email } -> { ok: boolean, reason?: string }
 * Same-origin only: no Access-Control-Allow-Origin.
 */
"use strict";

var ABSTRACT_URL = "https://emailreputation.abstractapi.com/v1/";
var TIMEOUT_MS = 4000;
var MAX_BODY = 2048;
var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function hostOf(value) {
  if (!value) return "";
  return String(value).split(",")[0].trim().toLowerCase();
}

function sameOrigin(req) {
  var origin = req.headers.origin;
  if (!origin) return true;
  var originHost;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch (e) {
    return false;
  }
  var forwarded = hostOf(req.headers["x-forwarded-host"]);
  var host = hostOf(req.headers.host);
  return (forwarded && forwarded === originHost) || (host && host === originHost);
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function readBody(req) {
  if (req.body && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    return Promise.resolve(req.body);
  }
  if (typeof req.body === "string") {
    try {
      return Promise.resolve(JSON.parse(req.body || "{}"));
    } catch (e) {
      return Promise.reject(e);
    }
  }
  return new Promise(function (resolve, reject) {
    var chunks = [];
    var size = 0;
    req.on("data", function (chunk) {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error("too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", function () {
      var raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function reputationBad(data) {
  var deliv = data && data.email_deliverability;
  var quality = data && data.email_quality;
  return !!data && (
    (deliv && deliv.is_format_valid === false) ||
    (quality && quality.is_disposable === true) ||
    (deliv && deliv.status === "undeliverable")
  );
}

module.exports = async function (req, res) {
  try {
    if (req.method !== "POST") {
      send(res, 405, { ok: false, reason: "method" });
      return;
    }
    if (!sameOrigin(req)) {
      send(res, 403, { ok: false, reason: "origin" });
      return;
    }

    var body;
    try {
      body = await readBody(req);
    } catch (e) {
      send(res, 200, { ok: false, reason: "invalid" });
      return;
    }

    var email = typeof body.email === "string" ? body.email.trim() : "";
    if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
      send(res, 200, { ok: false, reason: "invalid" });
      return;
    }

    var key = process.env.ABSTRACTAPI_KEY;
    if (!key) {
      send(res, 200, { ok: true, reason: "skipped" });
      return;
    }

    var url =
      ABSTRACT_URL +
      "?api_key=" +
      encodeURIComponent(key) +
      "&email=" +
      encodeURIComponent(email);
    var ac = new AbortController();
    var timer = setTimeout(function () {
      ac.abort();
    }, TIMEOUT_MS);

    var data;
    try {
      var upstream = await fetch(url, {
        method: "GET",
        signal: ac.signal,
        headers: { Accept: "application/json" },
      });
      if (!upstream.ok) {
        send(res, 200, { ok: true, reason: "upstream" });
        return;
      }
      data = await upstream.json();
    } catch (e) {
      send(res, 200, { ok: true, reason: "upstream" });
      return;
    } finally {
      clearTimeout(timer);
    }

    var bad = reputationBad(data);
    send(res, 200, { ok: !bad, reason: bad ? "undeliverable" : "ok" });
  } catch (e) {
    send(res, 200, { ok: true, reason: "error" });
  }
};
