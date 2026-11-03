"use client";

import { useEffect } from "react";

/**
 * Tracks the visual viewport so the app shell shrinks above the on-screen keyboard (iOS Safari
 * doesn't resize the layout viewport). Sets --vvh (visible height) and --kb (keyboard height).
 */
export function ViewportSync() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement.style;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (Math.abs(vv.scale - 1) > 0.01) return; // pinch-zoomed: leave layout alone
        const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
        root.setProperty("--vvh", `${Math.round(vv.height)}px`);
        root.setProperty("--kb", `${Math.round(kb)}px`);
        // iOS scrolls the whole page to reveal a focused field; the shell already fits.
        if (window.scrollY !== 0) window.scrollTo(0, 0);
      });
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      cancelAnimationFrame(frame);
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      root.removeProperty("--vvh");
      root.removeProperty("--kb");
    };
  }, []);
  return null;
}
