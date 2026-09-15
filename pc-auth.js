/* =========================================================================
   Project Carter - shared auth + saved-reports client (Supabase)
   -------------------------------------------------------------------------
   Loaded on every calculator page and on account.html, AFTER the Supabase
   UMD bundle:

     <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
     <script src="pc-auth.js"></script>

   Fill the two placeholders below with your project's values from
   Supabase - Settings - API. Both are safe to commit: the anon key grants
   nothing without a signed-in user, because Row Level Security scopes every
   row to its owner (see supabase-schema.sql).

   Exposes window.pcAuth (see the object at the bottom) and fires a
   "pc-auth-change" event on document whenever the sign-in state settles.
   ========================================================================= */
(function () {
  "use strict";

  var SUPABASE_URL      = "https://rqbdumfqucptklmhlskr.supabase.co";
  var SUPABASE_ANON_KEY = "sb_publishable_eUP7BAawFxUJiN_EbCm4Sw_Lk4BCu3o";
  var FORMSPREE_ENDPOINT = "https://formspree.io/f/xqpkjvkb";
  var AVATAR_BUCKET = "avatars";
  var AVATAR_MAX_BYTES = 2 * 1024 * 1024;
  var AVATAR_EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
  var PROFILE_COLS = "id,email,full_name,phone,occupation,avatar_url,has_password,subscription_status";

  var CONFIGURED =
    SUPABASE_URL.indexOf("http") === 0 &&
    SUPABASE_ANON_KEY &&
    SUPABASE_ANON_KEY !== "PC_SUPABASE_ANON_KEY";

  var MEMBER_CACHE_KEY = "pc_member_cache";

  /* Synchronous best-guess so member pages paint unmasked on first frame.
     Reconciled against the real session a moment later. */
  var cachedMember = false;
  try { cachedMember = window.localStorage.getItem(MEMBER_CACHE_KEY) === "1"; } catch (e) {}
  window.pcMember = CONFIGURED ? cachedMember : false;

  var client = null;
  var currentUser = null;
  var currentProfile = null;
  var listeners = [];
  var resolveReady;
  var ready = new Promise(function (r) { resolveReady = r; });

  function setMemberCache(on) {
    try {
      if (on) window.localStorage.setItem(MEMBER_CACHE_KEY, "1");
      else window.localStorage.removeItem(MEMBER_CACHE_KEY);
    } catch (e) {}
  }

  function emitChange() {
    window.pcMember = !!currentUser;
    var detail = { user: publicUser(), isMember: !!currentUser };
    listeners.forEach(function (cb) { try { cb(detail); } catch (e) {} });
    try {
      document.dispatchEvent(new CustomEvent("pc-auth-change", { detail: detail }));
    } catch (e) {
      var ev = document.createEvent("CustomEvent");
      ev.initCustomEvent("pc-auth-change", false, false, detail);
      document.dispatchEvent(ev);
    }
    renderBar();
  }

  function publicUser() {
    if (!currentUser) return null;
    var meta = currentUser.user_metadata || {};
    return {
      id: currentUser.id,
      email: currentUser.email || (currentProfile && currentProfile.email) || "",
      full_name: (currentProfile && currentProfile.full_name) || meta.full_name || "",
      phone: (currentProfile && currentProfile.phone) || meta.phone || "",
      occupation: (currentProfile && currentProfile.occupation) || "",
      avatar_url: (currentProfile && currentProfile.avatar_url) || "",
      has_password: !!(currentProfile && currentProfile.has_password),
      subscription_status: (currentProfile && currentProfile.subscription_status) || "free"
    };
  }

  /* ---- Formspree lead ping on first sign-up ---------------------------- */
  function maybePingLead() {
    if (!currentUser) return;
    var key = "pc_lead_pinged_" + currentUser.id;
    try { if (window.localStorage.getItem(key) === "1") return; } catch (e) {}
    var u = publicUser();
    if (!u.email) return;
    var body = new FormData();
    body.append("_subject", "New Project Carter account");
    body.append("Name", u.full_name || "(not given)");
    body.append("Email", u.email);
    body.append("Phone", u.phone || "(not given)");
    body.append("Source", "Account sign-up");
    fetch(FORMSPREE_ENDPOINT, { method: "POST", body: body, headers: { Accept: "application/json" } })
      .then(function () { try { window.localStorage.setItem(key, "1"); } catch (e) {} })
      .catch(function () {});
  }

  /* ---- profile photo (Storage bucket `avatars`) ------------------------- */
  function avatarPathFromUrl(url) {
    if (!url || !SUPABASE_URL || url.indexOf(SUPABASE_URL) !== 0) return null;
    var marker = "/storage/v1/object/public/" + AVATAR_BUCKET + "/";
    var i = url.indexOf(marker);
    if (i === -1) return null;
    var path = url.slice(i + marker.length).split("?")[0];
    try { path = decodeURIComponent(path); } catch (e) {}
    if (!path || path.indexOf("..") !== -1) return null;
    return path;
  }

  function removeStoredAvatar(prevUrl, keepPath) {
    if (!client || !client.storage || !currentUser) return;
    var path = avatarPathFromUrl(prevUrl);
    if (!path || path.indexOf(currentUser.id + "/") !== 0) return;
    if (keepPath && path === keepPath) return;
    client.storage.from(AVATAR_BUCKET).remove([path]).catch(function () {});
  }

  /* ---- profile ------------------------------------------------------------ */
  function loadProfile() {
    if (!client || !currentUser) { currentProfile = null; return Promise.resolve(null); }
    return client
      .from("profiles")
      .select(PROFILE_COLS)
      .eq("id", currentUser.id)
      .maybeSingle()
      .then(function (res) {
        currentProfile = res.data || null;
        /* Trigger fills the row on sign-up; upsert here as a belt-and-braces
           for any account created before the trigger existed. */
        if (!currentProfile) {
          var meta = currentUser.user_metadata || {};
          return client.from("profiles").upsert({
            id: currentUser.id,
            email: currentUser.email,
            full_name: meta.full_name || null,
            phone: meta.phone || null,
            has_password: !!meta.has_password
          }).select(PROFILE_COLS).maybeSingle()
            .then(function (r2) { currentProfile = r2.data || null; return currentProfile; });
        }
        return currentProfile;
      })
      .catch(function () { return null; });
  }

  /* ---- init ------------------------------------------------------------- */
  function init() {
    if (!CONFIGURED) {
      console.warn("[pc-auth] Supabase not configured - fill PC_SUPABASE_URL / PC_SUPABASE_ANON_KEY in pc-auth.js");
      setMemberCache(false);
      resolveReady();
      renderBar();
      return;
    }
    if (!window.supabase || !window.supabase.createClient) {
      console.error("[pc-auth] supabase-js not found - load the CDN bundle before pc-auth.js");
      resolveReady();
      return;
    }

    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      /* implicit flow puts the session straight in the redirect URL rather
         than requiring a code-verifier saved earlier in this same browser -
         magic links are routinely opened from a mail app's own in-app
         browser, a different storage context than the one the visitor
         requested the link from, and PKCE fails silently in that case */
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "implicit" }
    });

    client.auth.getSession().then(function (res) {
      currentUser = (res.data && res.data.session && res.data.session.user) || null;
      setMemberCache(!!currentUser);
      return loadProfile();
    }).then(function () {
      maybePingLead();
      resolveReady();
      emitChange();
    });

    client.auth.onAuthStateChange(function (_event, session) {
      var nextUser = (session && session.user) || null;
      var changed = (!!nextUser) !== (!!currentUser) || (nextUser && currentUser && nextUser.id !== currentUser.id);
      currentUser = nextUser;
      setMemberCache(!!currentUser);
      loadProfile().then(function () {
        if (currentUser) maybePingLead();
        if (changed || _event === "SIGNED_IN" || _event === "SIGNED_OUT") emitChange();
      });
    });
  }

  /* ---- auth-bar UI ---------------------------------------------------------
     Injected just under the site header on any page that carries a
     calculator (#calcResults) or opts in with <body data-pc-auth-bar>. */
  function barTarget() {
    if (document.querySelector(".pc-auth-bar")) return null;
    if (document.getElementById("calcResults") || document.body.hasAttribute("data-pc-auth-bar")) {
      return document.querySelector(".site-header");
    }
    return null;
  }

  function renderBar() {
    var header = barTarget() || document.querySelector(".pc-auth-bar");
    if (!header) return;
    var bar = document.querySelector(".pc-auth-bar");
    if (!bar) {
      bar = document.createElement("div");
      bar.className = "pc-auth-bar";
      var h = document.querySelector(".site-header");
      if (h && h.parentNode) h.parentNode.insertBefore(bar, h.nextSibling);
      else document.body.insertBefore(bar, document.body.firstChild);
    }
    if (!CONFIGURED) { bar.hidden = true; return; }
    bar.hidden = false;

    var u = publicUser();
    if (u) {
      bar.innerHTML =
        '<div class="wrap pc-auth-bar__inner">' +
          '<span class="pc-auth-bar__who">Signed in as <strong></strong></span>' +
          '<span class="pc-auth-bar__links">' +
            '<a href="account">My saved reports</a>' +
            '<button type="button" class="linklike" data-pc-signout>Sign out</button>' +
          '</span>' +
        '</div>';
      bar.querySelector("strong").textContent = u.email;
      bar.querySelector("[data-pc-signout]").addEventListener("click", function () {
        api.signOut();
      });
    } else {
      bar.innerHTML =
        '<div class="wrap pc-auth-bar__inner">' +
          '<span class="pc-auth-bar__who">Free account: save these figures and open them again later.</span>' +
          '<span class="pc-auth-bar__links"><a href="account">Sign in or create an account</a></span>' +
        '</div>';
    }
  }

  /* ---- reports API ---------------------------------------------------------- */
  function requireClient() {
    if (!CONFIGURED) return { error: { message: "Accounts are not set up yet." } };
    if (!client) return { error: { message: "Auth client not ready." } };
    if (!currentUser) return { error: { message: "Please sign in first." } };
    return null;
  }

  var api = {
    ready: ready,
    configured: CONFIGURED,
    formspreeEndpoint: FORMSPREE_ENDPOINT,

    user: publicUser,
    isMember: function () { return !!currentUser; },

    onChange: function (cb) {
      listeners.push(cb);
      if (currentUser !== undefined) { try { cb({ user: publicUser(), isMember: !!currentUser }); } catch (e) {} }
      return function () { listeners = listeners.filter(function (x) { return x !== cb; }); };
    },

    getProfile: function () {
      return loadProfile().then(function (p) { return { data: p, error: p ? null : { message: "No profile" } }; });
    },

    updateProfile: function (fields) {
      var bad = requireClient();
      if (bad) return Promise.resolve(bad);
      var row = {};
      if (fields.full_name !== undefined) row.full_name = (fields.full_name || "").trim().slice(0, 200) || null;
      if (fields.phone !== undefined) row.phone = (fields.phone || "").trim().slice(0, 40) || null;
      if (fields.occupation !== undefined) row.occupation = (fields.occupation || "").trim().slice(0, 120) || null;
      if (fields.avatar_url !== undefined) {
        var avatarUrl = fields.avatar_url || null;
        if (avatarUrl && avatarUrl.indexOf(SUPABASE_URL) !== 0) {
          return Promise.resolve({ error: { message: "Invalid photo URL." } });
        }
        row.avatar_url = avatarUrl;
      }
      return client.from("profiles").update(row).eq("id", currentUser.id)
        .select(PROFILE_COLS).maybeSingle()
        .then(function (res) {
          if (!res.error && res.data) {
            currentProfile = currentProfile ? Object.assign({}, currentProfile, res.data) : res.data;
          }
          return { data: res.data, error: res.error };
        });
    },

    uploadAvatar: function (file) {
      var bad = requireClient();
      if (bad) return Promise.resolve(bad);
      if (!client.storage || !client.storage.from) {
        return Promise.resolve({ error: { message: "Photo upload is not available." } });
      }
      var ext = file && AVATAR_EXT[file.type];
      if (!file || !ext) return Promise.resolve({ error: { message: "Use a JPEG, PNG or WebP image." } });
      if (file.size > AVATAR_MAX_BYTES) return Promise.resolve({ error: { message: "Keep the photo under 2 MB." } });
      var path = currentUser.id + "/avatar-" + Date.now() + "." + ext;
      var prev = currentProfile && currentProfile.avatar_url;
      return client.storage.from(AVATAR_BUCKET).upload(path, file, {
        upsert: true,
        contentType: file.type,
        cacheControl: "3600"
      }).then(function (res) {
        if (res.error) return { error: res.error };
        var pub = client.storage.from(AVATAR_BUCKET).getPublicUrl(path);
        var url = pub && pub.data && pub.data.publicUrl;
        if (!url) return { error: { message: "Uploaded, but could not build the photo URL." } };
        return api.updateProfile({ avatar_url: url }).then(function (upd) {
          if (!upd.error) removeStoredAvatar(prev, path);
          return upd;
        });
      });
    },

    removeAvatar: function () {
      var bad = requireClient();
      if (bad) return Promise.resolve(bad);
      var prev = currentProfile && currentProfile.avatar_url;
      return api.updateProfile({ avatar_url: null }).then(function (upd) {
        if (!upd.error) removeStoredAvatar(prev, null);
        return upd;
      });
    },

    signInWithMagicLink: function (email, opts) {
      if (!CONFIGURED) return Promise.resolve({ error: { message: "Accounts are not set up yet." } });
      opts = opts || {};
      var data = {};
      if (opts.full_name) data.full_name = opts.full_name;
      if (opts.phone) data.phone = opts.phone;
      return client.auth.signInWithOtp({
        email: email,
        options: {
          shouldCreateUser: true,
          emailRedirectTo: opts.redirectTo || (window.location.origin + "/account"),
          data: data
        }
      });
    },

    signInWithPassword: function (email, password) {
      if (!CONFIGURED) return Promise.resolve({ error: { message: "Accounts are not set up yet." } });
      return client.auth.signInWithPassword({ email: email, password: password });
    },

    signUpWithPassword: function (email, password, opts) {
      if (!CONFIGURED) return Promise.resolve({ error: { message: "Accounts are not set up yet." } });
      opts = opts || {};
      var data = { has_password: true };
      if (opts.full_name) data.full_name = opts.full_name;
      if (opts.phone) data.phone = opts.phone;
      return client.auth.signUp({
        email: email,
        password: password,
        options: {
          emailRedirectTo: opts.redirectTo || (window.location.origin + "/account"),
          data: data
        }
      });
    },

    /* lets a signed-in visitor (who may have arrived via a magic link and
       never set one) add or change their password for next time - also
       flips profiles.has_password so the "set a password" nudge stops
       showing once they've done this */
    setPassword: function (newPassword) {
      var bad = requireClient();
      if (bad) return Promise.resolve(bad);
      return client.auth.updateUser({ password: newPassword }).then(function (res) {
        if (res.error) return { error: res.error };
        return client.from("profiles").update({ has_password: true }).eq("id", currentUser.id)
          .then(function (r2) {
            if (!r2.error && currentProfile) currentProfile.has_password = true;
            return { error: r2.error };
          });
      });
    },

    /* Supabase sends a confirmation link to the new address before the
       change actually takes effect (and, if "Secure email change" is on in
       the project's Auth settings, one to the old address too) - nothing
       changes here client-side until that's clicked, so profiles.email
       and currentUser.email are left alone until the next session refresh
       picks up the confirmed address. */
    updateEmail: function (newEmail) {
      var bad = requireClient();
      if (bad) return Promise.resolve(bad);
      return client.auth.updateUser(
        { email: newEmail },
        { emailRedirectTo: window.location.origin + "/account" }
      ).then(function (res) {
        return { error: res.error };
      });
    },

    signOut: function () {
      if (!client) { return Promise.resolve({ error: null }); }
      return client.auth.signOut().then(function (r) {
        currentUser = null; currentProfile = null;
        setMemberCache(false);
        emitChange();
        return r;
      });
    },

    canSave: function () {
      if (requireClient()) return Promise.resolve(false);
      return client.rpc("pc_can_save").then(function (res) {
        if (res.error) return true;               // fail open while everything is free
        return res.data !== false;
      }).catch(function () { return true; });
    },

    saveReport: function (report) {
      var bad = requireClient();
      if (bad) return Promise.resolve(bad);
      var row = {
        user_id: currentUser.id,
        calculator: report.calculator,
        title: (report.title || "Untitled report").slice(0, 200),
        inputs: report.inputs || {},
        summary: report.summary || {}
      };
      var q = report.id
        ? client.from("reports").update({ title: row.title, inputs: row.inputs, summary: row.summary }).eq("id", report.id).eq("user_id", currentUser.id).select().maybeSingle()
        : client.from("reports").insert(row).select().maybeSingle();
      return q.then(function (res) { return { data: res.data, error: res.error }; });
    },

    listReports: function (calculator) {
      var bad = requireClient();
      if (bad) return Promise.resolve(bad);
      var q = client.from("reports").select("id,calculator,title,inputs,summary,is_master,created_at,updated_at")
        .eq("user_id", currentUser.id).order("updated_at", { ascending: false });
      if (calculator) q = q.eq("calculator", calculator);
      return q.then(function (res) { return { data: res.data || [], error: res.error }; });
    },

    getReport: function (id) {
      var bad = requireClient();
      if (bad) return Promise.resolve(bad);
      return client.from("reports").select("id,calculator,title,inputs,summary,is_master,created_at,updated_at")
        .eq("id", id).eq("user_id", currentUser.id).maybeSingle()
        .then(function (res) { return { data: res.data, error: res.error }; });
    },

    /* the signed-in visitor's master portfolio (in practice their master
       Portfolio Review report), or null if none is set yet */
    getMasterReport: function () {
      var bad = requireClient();
      if (bad) return Promise.resolve(bad);
      return client.from("reports").select("id,calculator,title,inputs,summary,is_master,created_at,updated_at")
        .eq("user_id", currentUser.id).eq("is_master", true).maybeSingle()
        .then(function (res) { return { data: res.data, error: res.error }; });
    },

    /* mark one saved report as the master portfolio, unsetting any previous
       one first (at most one per account - also enforced in the database) */
    setMasterReport: function (id) {
      var bad = requireClient();
      if (bad) return Promise.resolve(bad);
      return client.from("reports").update({ is_master: false })
        .eq("user_id", currentUser.id).eq("is_master", true)
        .then(function () {
          return client.from("reports").update({ is_master: true })
            .eq("id", id).eq("user_id", currentUser.id)
            .then(function (res) { return { error: res.error }; });
        });
    },

    clearMasterReport: function () {
      var bad = requireClient();
      if (bad) return Promise.resolve(bad);
      return client.from("reports").update({ is_master: false })
        .eq("user_id", currentUser.id).eq("is_master", true)
        .then(function (res) { return { error: res.error }; });
    },

    renameReport: function (id, title) {
      var bad = requireClient();
      if (bad) return Promise.resolve(bad);
      return client.from("reports").update({ title: (title || "Untitled report").slice(0, 200) })
        .eq("id", id).eq("user_id", currentUser.id)
        .then(function (res) { return { error: res.error }; });
    },

    deleteReport: function (id) {
      var bad = requireClient();
      if (bad) return Promise.resolve(bad);
      return client.from("reports").delete().eq("id", id).eq("user_id", currentUser.id)
        .then(function (res) { return { error: res.error }; });
    },

    /* Request, not a full auth wipe: deletes everything the anon key is
       allowed to touch (saved reports, then name/phone/occupation/avatar_url
       on the profile row) and pings Formspree so Trent can close the actual
       sign-in (auth.users) from the dashboard. Deleting an auth user
       needs the service-role key, which must never live in client-side
       code. The login may still work until he does. Signs the
       visitor out either way. Best-effort: remove the caller's own Storage
       object while the session is still live; leftovers stay in the
       avatars bucket until deleted in the dashboard. */
    requestAccountDeletion: function () {
      var bad = requireClient();
      if (bad) return Promise.resolve(bad);
      var email = currentUser.email;
      var uid = currentUser.id;
      var prevAvatar = currentProfile && currentProfile.avatar_url;
      return client.from("reports").delete().eq("user_id", uid)
        .then(function () {
          var path = avatarPathFromUrl(prevAvatar);
          if (!path || path.indexOf(uid + "/") !== 0 || !client.storage) return {};
          return client.storage.from(AVATAR_BUCKET).remove([path]).catch(function () { return {}; });
        })
        .then(function () {
          return client.from("profiles").update({ full_name: null, phone: null, occupation: null, avatar_url: null }).eq("id", uid);
        })
        .then(function () {
          var body = new FormData();
          body.append("_subject", "Project Carter - account deletion request");
          body.append("Email", email || "(unknown)");
          body.append("User ID", uid);
          body.append("Source", "Account page - Request account deletion");
          return fetch(FORMSPREE_ENDPOINT, { method: "POST", body: body, headers: { Accept: "application/json" } }).catch(function () {});
        })
        .then(function () { return api.signOut(); })
        .then(function () { return { error: null }; })
        .catch(function (err) { return { error: { message: (err && err.message) || "Something went wrong deleting your data." } }; });
    }
  };

  window.pcAuth = api;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
