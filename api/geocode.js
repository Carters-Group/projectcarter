/**
 * Same-origin Nominatim proxy for da-calculator.html.
 *
 * Browsers cannot set User-Agent; OSM requires an identifying UA + contact.
 * This function fetches Nominatim server-side and returns the same JSON array
 * the calculator already consumes (Nominatim search hits).
 *
 * GET or POST with `q`. Does not store addresses: a warm instance keeps the
 * last few hundred results in memory for up to 6 hours so a repeated lookup
 * doesn't spend OSM's one-request-a-second allowance, and that memory goes
 * when the instance does. Logs status only, never q.
 *
 * Vercel Node serverless: /api/geocode.js -> /api/geocode (no vercel.json).
 */
"use strict";

var NOMINATIM = "https://nominatim.openstreetmap.org/search";
var UA = "ProjectCarter/1.0 (https://projectcarter.com.au; trent@cartersinvestments.com.au)";
var TIMEOUT_MS = 5000;
var MAX_Q = 200;
var MIN_Q = 8;
var MAX_BODY = 2048;
var NOMINATIM_GAP_MS = 1100;
var WINDOW_MS = 60000;
var MAX_PER_WINDOW = 10;

var CACHE_MS = 6 * 60 * 60 * 1000;
var CACHE_MAX = 500;
var MAX_WAIT_MS = 2500;
var lastNominatimAt = 0;
var ipHits = Object.create(null);
var cache = new Map();

function cacheKey(q) {
  return q.toLowerCase().replace(/[\s,]+/g, " ").trim();
}
function cacheGet(q) {
  var hit = cache.get(cacheKey(q));
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_MS) {
    cache.delete(cacheKey(q));
    return null;
  }
  return hit.data;
}
function cacheSet(q, data) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(cacheKey(q), { at: Date.now(), data: data });
}
/* Nominatim allows about one request a second per app. When two visitors
   look up at once, the second waits its turn (briefly) instead of failing. */
function waitForSlot() {
  var start = Date.now();
  return new Promise(function (resolve) {
    (function check() {
      var now = Date.now();
      if (now - lastNominatimAt >= NOMINATIM_GAP_MS) {
        lastNominatimAt = now;
        resolve(true);
      } else if (now - start > MAX_WAIT_MS) {
        resolve(false);
      } else {
        setTimeout(check, NOMINATIM_GAP_MS - (now - lastNominatimAt) + 10);
      }
    })();
  });
}

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

function clientIp(req) {
  var xff = req.headers["x-forwarded-for"];
  if (xff) return String(xff).split(",")[0].trim() || "unknown";
  return (req.socket && req.socket.remoteAddress) || "unknown";
}

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

function logStatus(status) {
  console.log("geocode status", status);
}

function pruneHits(now) {
  Object.keys(ipHits).forEach(function (ip) {
    if (now - ipHits[ip].start > WINDOW_MS) delete ipHits[ip];
  });
}

function rateLimited(ip, now) {
  pruneHits(now);
  var bucket = ipHits[ip];
  if (!bucket || now - bucket.start > WINDOW_MS) {
    ipHits[ip] = { start: now, count: 1 };
    return false;
  }
  bucket.count += 1;
  return bucket.count > MAX_PER_WINDOW;
}

function queryQ(req) {
  if (req.query && typeof req.query.q === "string") return req.query.q;
  try {
    var u = new URL(req.url, "http://localhost");
    return u.searchParams.get("q") || "";
  } catch (e) {
    return "";
  }
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

function cleanQ(raw) {
  if (typeof raw !== "string") return "";
  return raw.trim();
}

module.exports = async function (req, res) {
  try {
    if (req.method !== "GET" && req.method !== "POST") {
      logStatus(405);
      send(res, 405, []);
      return;
    }
    if (!sameOrigin(req)) {
      logStatus(403);
      send(res, 403, []);
      return;
    }

    var q = queryQ(req);
    if (req.method === "POST" && !q) {
      try {
        var body = await readBody(req);
        q = cleanQ(body && body.q);
      } catch (e) {
        logStatus(400);
        send(res, 400, []);
        return;
      }
    } else {
      q = cleanQ(q);
    }

    if (!q || q.length < MIN_Q || q.length > MAX_Q) {
      logStatus(400);
      send(res, 400, []);
      return;
    }

    if (rateLimited(clientIp(req), Date.now())) {
      logStatus(429);
      send(res, 429, []);
      return;
    }

    var cached = cacheGet(q);
    if (cached) {
      logStatus("200 cached");
      send(res, 200, cached);
      return;
    }

    if (!(await waitForSlot())) {
      logStatus(429);
      send(res, 429, []);
      return;
    }

    var url =
      NOMINATIM +
      "?format=json&addressdetails=1&limit=1&countrycodes=au&q=" +
      encodeURIComponent(q);
    var ac = new AbortController();
    var timer = setTimeout(function () {
      ac.abort();
    }, TIMEOUT_MS);

    try {
      var upstream = await fetch(url, {
        method: "GET",
        signal: ac.signal,
        headers: {
          Accept: "application/json",
          "User-Agent": UA,
          Referer: "https://projectcarter.com.au/"
        }
      });
      logStatus(upstream.status);
      if (!upstream.ok) {
        send(res, 502, []);
        return;
      }
      var data = await upstream.json();
      var hits = Array.isArray(data) ? data : [];
      if (hits.length) cacheSet(q, hits);
      send(res, 200, hits);
    } catch (e) {
      logStatus(504);
      send(res, 504, []);
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    logStatus(500);
    send(res, 500, []);
  }
};
