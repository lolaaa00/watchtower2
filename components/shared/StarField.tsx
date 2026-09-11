"use client";

import { useEffect, useRef } from "react";

interface Star {
  x: number; y: number; r: number;
  vx: number; vy: number; o: number; tw: number;
}

export default function StarField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let W = 0, H = 0;
    const stars: Star[] = [];
    let raf: number;

    function resize() {
      W = canvas!.width = window.innerWidth;
      H = canvas!.height = window.innerHeight;
    }

    function initStars(n: number) {
      stars.length = 0;
      for (let i = 0; i < n; i++) {
        stars.push({
          x: Math.random() * W, y: Math.random() * H,
          r: Math.random() * 0.9 + 0.15,
          vx: (Math.random() - 0.5) * 0.04,
          vy: (Math.random() - 0.5) * 0.04,
          o: Math.random() * 0.45 + 0.05,
          tw: Math.random() * Math.PI * 2,
        });
      }
    }

    function draw() {
      ctx!.clearRect(0, 0, W, H);
      for (const s of stars) {
        s.x += s.vx; s.y += s.vy; s.tw += 0.007;
        if (s.x < 0) s.x = W; if (s.x > W) s.x = 0;
        if (s.y < 0) s.y = H; if (s.y > H) s.y = 0;
        const o = s.o * (0.65 + 0.35 * Math.sin(s.tw));
        ctx!.beginPath();
        ctx!.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(237,237,232,${o})`;
        ctx!.fill();
      }
      raf = requestAnimationFrame(draw);
    }

    resize();
    initStars(50);
    draw();

    const flicker = setInterval(() => {
      const s = stars[Math.floor(Math.random() * stars.length)];
      if (s) {
        s.o = Math.min(s.o * 2.5, 0.85);
        setTimeout(() => { s.o = Math.random() * 0.45 + 0.05; }, 1200);
      }
    }, 1400);

    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(flicker);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} id="stars" />;
}
