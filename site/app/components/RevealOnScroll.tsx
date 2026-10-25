"use client";

// Fades `.reveal` elements in once as they scroll into view, including ones added later (theme cards). Elements
// stay visible without JavaScript: they are only hidden after <html> gets the js-reveal class here.
import { useEffect } from "react";

export function RevealOnScroll() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;
    const seen = (entries: IntersectionObserverEntry[]) =>
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add("is-visible");
        io.unobserve(e.target);
      });
    const io = new IntersectionObserver(seen, { rootMargin: "0px 0px -8% 0px" });
    const watch = () => document.querySelectorAll(".reveal:not(.is-visible)").forEach((el) => io.observe(el));
    document.documentElement.classList.add("js-reveal");
    watch();
    const mo = new MutationObserver(watch);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      io.disconnect();
      mo.disconnect();
      document.documentElement.classList.remove("js-reveal");
    };
  }, []);
  return null;
}
