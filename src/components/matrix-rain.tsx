"use client";

import { useEffect, useState } from "react";

/**
 * Background rain for the Matrix theme.
 * Glyphs sit in a fixed grid. A bright head advances down the column and the
 * trail behind it fades, which is how the 1999 titles read as falling code.
 * Half-width katakana and digits only — not a film frame.
 * 1999 palette: pure black, bright leading green (#E0FCD9), body #43FF33
 * falling through #00990B into #001F04.
 */
const GLYPHS =
  "0123456789ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ";

const HEAD = "#E0FCD9";
const BODY = ["#43FF33", "#14b83a", "#00990B", "#005c12", "#012006"];

const FONT = 15;
const COLUMN = 22;

type Column = {
  head: number;
  length: number;
  speed: number;
  carry: number;
  glyphs: string[];
  alive: boolean;
};

function glyph() {
  return GLYPHS[Math.floor(Math.random() * GLYPHS.length)] ?? "0";
}

function makeColumn(rows: number, scatter: boolean): Column {
  return {
    head: scatter ? Math.floor(Math.random() * rows) : -Math.floor(Math.random() * rows),
    length: 8 + Math.floor(Math.random() * 12),
    speed: 0.28 + Math.random() * 0.55,
    carry: Math.random(),
    glyphs: Array.from({ length: rows + 8 }, () => glyph()),
    alive: Math.random() < 0.38,
  };
}

function MatrixRainCanvas() {
  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.className = "matrix-rain";
    canvas.setAttribute("aria-hidden", "true");
    document.body.appendChild(canvas);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      canvas.remove();
      return;
    }

    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let columns: Column[] = [];
    let width = 0;
    let height = 0;
    let rows = 0;
    let raf = 0;
    let running = true;

    function layout() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      rows = Math.ceil(height / FONT) + 1;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.ceil(width / COLUMN);
      columns = Array.from({ length: count }, () => makeColumn(rows, true));
    }

    function paint() {
      ctx!.clearRect(0, 0, width, height);
      ctx!.font = `${FONT}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      ctx!.textBaseline = "top";
      columns.forEach((col, index) => {
        if (!col.alive) return;
        const x = index * COLUMN;
        for (let i = 0; i < col.length; i++) {
          const row = col.head - i;
          if (row < 0 || row >= rows) continue;
          const cell = col.glyphs[row % col.glyphs.length] ?? "0";
          if (i === 0) {
            ctx!.fillStyle = HEAD;
            ctx!.globalAlpha = 0.92;
          } else {
            ctx!.fillStyle = BODY[Math.min(BODY.length - 1, Math.floor((i / col.length) * BODY.length))]!;
            ctx!.globalAlpha = Math.max(0.06, 0.62 * (1 - i / col.length));
          }
          ctx!.fillText(cell, x, row * FONT);
        }
      });
      ctx!.globalAlpha = 1;
    }

    function advance() {
      for (const col of columns) {
        if (!col.alive) {
          if (Math.random() < 0.004) col.alive = true;
          continue;
        }
        col.carry += col.speed;
        if (col.carry < 1) continue;
        col.carry = 0;
        col.head += 1;
        const slot = ((col.head % col.glyphs.length) + col.glyphs.length) % col.glyphs.length;
        if (Math.random() < 0.65) col.glyphs[slot] = glyph();
        if (col.head - col.length > rows + 2) {
          col.head = -Math.floor(Math.random() * 24);
          col.length = 8 + Math.floor(Math.random() * 12);
          col.speed = 0.28 + Math.random() * 0.55;
          col.alive = Math.random() < 0.7;
        }
      }
    }

    function tick() {
      if (!running) return;
      advance();
      paint();
      raf = window.requestAnimationFrame(tick);
    }

    function start() {
      window.cancelAnimationFrame(raf);
      if (!running || document.hidden || media.matches) return;
      raf = window.requestAnimationFrame(tick);
    }

    layout();
    paint();
    start();

    const onResize = () => {
      layout();
      paint();
    };
    const onMotion = () => {
      if (media.matches) {
        window.cancelAnimationFrame(raf);
        paint();
      } else {
        start();
      }
    };
    const onVisibility = () => {
      if (document.hidden) window.cancelAnimationFrame(raf);
      else start();
    };

    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibility);
    media.addEventListener("change", onMotion);

    return () => {
      running = false;
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
      media.removeEventListener("change", onMotion);
      canvas.remove();
    };
  }, []);

  return null;
}

export function MatrixRain() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setActive(root.dataset.theme === "matrix");
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  if (!active) return null;
  return <MatrixRainCanvas />;
}
