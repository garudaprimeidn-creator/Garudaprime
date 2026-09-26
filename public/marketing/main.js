(function () {
  document.documentElement.classList.remove("no-js");

  function showReveals(nodes) {
    (nodes || document.querySelectorAll(".reveal")).forEach(function (el) {
      el.classList.add("is-visible");
    });
  }

  showReveals(document.querySelectorAll(".hero .reveal, .cta-banner.reveal, #get-app .reveal"));

  var nav = document.querySelector(".nav");
  var navToggle = document.getElementById("nav-toggle");
  var navMobile = document.getElementById("nav-mobile");
  var navLinks = document.querySelectorAll('.nav-links a, .nav-mobile a[href^="#"]');

  function setMobileNav(open) {
    if (!navToggle || !navMobile || !nav) return;
    navToggle.setAttribute("aria-expanded", open ? "true" : "false");
    navMobile.hidden = !open;
    nav.classList.toggle("is-open", open);
    document.body.classList.toggle("nav-open", open);
    document.body.style.overflow = open ? "hidden" : "";
  }

  function onScroll() {
    if (!nav) return;
    nav.classList.toggle("nav--scrolled", window.scrollY > 12);

    var scrollPos = window.scrollY + nav.offsetHeight + 48;
    navLinks.forEach(function (link) {
      var href = link.getAttribute("href");
      if (!href || href.charAt(0) !== "#") return;
      var section = document.querySelector(href);
      if (!section) return;
      var top = section.offsetTop;
      var bottom = top + section.offsetHeight;
      link.classList.toggle("is-active", scrollPos >= top && scrollPos < bottom);
    });
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  if (navToggle && navMobile) {
    navToggle.addEventListener("click", function () {
      var open = navToggle.getAttribute("aria-expanded") === "true";
      setMobileNav(!open);
    });

    navMobile.querySelectorAll('a[href^="#"]').forEach(function (link) {
      link.addEventListener("click", function () {
        setMobileNav(false);
      });
    });

    window.addEventListener("resize", function () {
      if (window.innerWidth >= 768) setMobileNav(false);
    }, { passive: true });
  }

  if ("IntersectionObserver" in window) {
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: "0px 0px -24px 0px" }
    );

    document.querySelectorAll(".reveal").forEach(function (el) {
      observer.observe(el);
    });
  } else {
    showReveals();
  }

  window.setTimeout(function () {
    showReveals();
  }, 2200);
})();
