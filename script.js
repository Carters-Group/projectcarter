/* Project Carter - site interactions */
(function () {
  "use strict";

  var header = document.getElementById("siteHeader");
  var nav = document.getElementById("primaryNav");
  var toggle = document.getElementById("navToggle");

  /* Header background on scroll */
  function onScroll() {
    if (window.scrollY > 24) header.classList.add("scrolled");
    else header.classList.remove("scrolled");
  }
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  /* Mobile nav */
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    });
    nav.addEventListener("click", function (e) {
      if (e.target.tagName === "A") {
        nav.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
        toggle.setAttribute("aria-label", "Open menu");
      }
    });
  }

  /* Calculators dropdown */
  var dropdowns = document.querySelectorAll(".nav-dropdown");
  var desktopQuery = window.matchMedia("(min-width: 781px)");
  Array.prototype.forEach.call(dropdowns, function (dd) {
    var ddToggle = dd.querySelector(".nav-dropdown-toggle");
    var menu = dd.querySelector(".nav-dropdown-menu");
    if (!ddToggle || !menu) return;

    function setOpen(on) {
      dd.classList.toggle("open", on);
      ddToggle.setAttribute("aria-expanded", String(on));
    }

    ddToggle.addEventListener("click", function (e) {
      e.stopPropagation();
      setOpen(!dd.classList.contains("open"));
    });
    dd.addEventListener("mouseenter", function () { if (desktopQuery.matches) setOpen(true); });
    dd.addEventListener("mouseleave", function () { if (desktopQuery.matches) setOpen(false); });
    document.addEventListener("click", function (e) {
      if (dd.classList.contains("open") && !dd.contains(e.target)) setOpen(false);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && dd.classList.contains("open")) { setOpen(false); ddToggle.focus(); }
    });
  });

  /* Reveal on scroll */
  var reveal = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            io.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.08 }
    );
    reveal.forEach(function (el) { io.observe(el); });
  } else {
    reveal.forEach(function (el) { el.classList.add("in"); });
  }

  /* Current year in footer */
  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());
})();
