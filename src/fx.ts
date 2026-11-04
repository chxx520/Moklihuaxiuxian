// 场景粒子（落叶、雪、尘埃、萤火、花瓣、雨）与战斗特效（符箓飞出、爆散、伤害数字、震屏）。

export type Weather = "leaves" | "snow" | "dust" | "fireflies" | "petals" | "rain" | "none";

type P = { x: number; y: number; vx: number; vy: number; r: number; a: number; rot: number; vr: number; life: number; hue: number };

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let kind: Weather = "none";
let parts: P[] = [];
let raf = 0;
let last = 0;
let W = 0, H = 0;

function resize() {
  if (!canvas) return;
  const dpr = Math.min(1.5, window.devicePixelRatio || 1);
  W = canvas.clientWidth;
  H = canvas.clientHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener("resize", resize);

const COUNT: Record<Weather, number> = { leaves: 14, snow: 70, dust: 34, fireflies: 22, petals: 22, rain: 120, none: 0 };

function spawn(initial: boolean): P {
  const r = Math.random;
  const p: P = { x: r() * W, y: initial ? r() * H : -20, vx: 0, vy: 0, r: 2, a: 1, rot: r() * 6.28, vr: 0, life: r() * 100, hue: r() };
  switch (kind) {
    case "leaves": p.r = 5 + r() * 5; p.vy = 18 + r() * 22; p.vx = 10 + r() * 20; p.vr = (r() - 0.5) * 3; p.a = 0.7 + r() * 0.3; break;
    case "snow": p.r = 0.8 + r() * 2.2; p.vy = 14 + r() * 26; p.vx = (r() - 0.5) * 10; p.a = 0.5 + r() * 0.5; break;
    case "dust": p.r = 0.6 + r() * 1.6; p.vy = -2 - r() * 5; p.vx = (r() - 0.5) * 6; p.a = 0.15 + r() * 0.35; if (!initial) p.y = H * (0.2 + r() * 0.6); break;
    case "fireflies": p.r = 1.2 + r() * 1.6; p.vx = (r() - 0.5) * 10; p.vy = (r() - 0.5) * 8; if (!initial) p.y = H * (0.35 + r() * 0.5); p.x = r() * W; break;
    case "petals": p.r = 2.5 + r() * 2.5; p.vy = 12 + r() * 16; p.vx = 8 + r() * 14; p.vr = (r() - 0.5) * 2; p.a = 0.6 + r() * 0.4; break;
    case "rain": p.r = 10 + r() * 14; p.vy = 520 + r() * 260; p.vx = -60; p.a = 0.18 + r() * 0.2; break;
  }
  return p;
}

function frame(t: number) {
  raf = 0;
  if (!ctx || !canvas || !canvas.isConnected || kind === "none") return;
  const dt = Math.min(0.05, (t - last) / 1000 || 0.016);
  last = t;
  ctx.clearRect(0, 0, W, H);
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    p.life += dt;
    if (kind === "leaves" || kind === "petals") p.vx += Math.sin(p.life * 1.3) * 6 * dt;
    if (kind === "fireflies") { p.vx += (Math.random() - 0.5) * 20 * dt; p.vy += (Math.random() - 0.5) * 20 * dt; p.vx *= 0.98; p.vy *= 0.98; }
    if (kind === "snow") p.vx += Math.sin(p.life * 0.9 + p.hue * 6) * 4 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.vr * dt;
    if (p.y > H + 30 || p.x > W + 40 || p.x < -40 || (kind === "dust" && p.y < -10)) { parts[i] = spawn(false); continue; }
    if (kind === "fireflies" && (p.y < H * 0.2 || p.y > H)) p.vy *= -1;
    draw(ctx, p);
  }
  raf = requestAnimationFrame(frame);
}

function draw(c: CanvasRenderingContext2D, p: P) {
  switch (kind) {
    case "leaves": {
      c.save();
      c.translate(p.x, p.y);
      c.rotate(p.rot);
      c.globalAlpha = p.a;
      c.fillStyle = p.hue < 0.5 ? "#c98a3e" : p.hue < 0.8 ? "#b5652e" : "#d9b35a";
      c.beginPath();
      c.ellipse(0, 0, p.r, p.r * 0.45, 0, 0, Math.PI * 2);
      c.fill();
      c.restore();
      break;
    }
    case "petals": {
      c.save();
      c.translate(p.x, p.y);
      c.rotate(p.rot);
      c.globalAlpha = p.a;
      c.fillStyle = p.hue < 0.6 ? "#e7b9b4" : "#f3d6d2";
      c.beginPath();
      c.ellipse(0, 0, p.r, p.r * 0.6, 0, 0, Math.PI * 2);
      c.fill();
      c.restore();
      break;
    }
    case "snow":
    case "dust": {
      c.globalAlpha = p.a;
      c.fillStyle = kind === "snow" ? "#ffffff" : "#fff6dc";
      c.beginPath();
      c.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      c.fill();
      break;
    }
    case "fireflies": {
      const glow = 0.4 + 0.6 * Math.abs(Math.sin(p.life * 1.7 + p.hue * 6));
      const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 6);
      g.addColorStop(0, `rgba(240,230,150,${0.9 * glow})`);
      g.addColorStop(1, "rgba(240,230,150,0)");
      c.globalAlpha = 1;
      c.fillStyle = g;
      c.beginPath();
      c.arc(p.x, p.y, p.r * 6, 0, Math.PI * 2);
      c.fill();
      break;
    }
    case "rain": {
      c.globalAlpha = p.a;
      c.strokeStyle = "#cfd8e0";
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(p.x, p.y);
      c.lineTo(p.x + p.vx * 0.02, p.y + p.r);
      c.stroke();
      break;
    }
  }
}

/** 在容器里设置天气粒子。传入 none 关闭。 */
export function setWeather(host: HTMLElement, w: Weather) {
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.className = "fx-canvas";
    ctx = canvas.getContext("2d");
  }
  if (canvas.parentElement !== host) host.append(canvas);
  if (w === kind) return;
  kind = w;
  resize();
  parts = Array.from({ length: COUNT[w] }, () => spawn(true));
  if (!raf && w !== "none") { last = performance.now(); raf = requestAnimationFrame(frame); }
}

document.addEventListener("visibilitychange", () => {
  if (!document.hidden && !raf && kind !== "none" && canvas?.isConnected) { last = performance.now(); raf = requestAnimationFrame(frame); }
});

/** 按场景名、时辰推断天气 */
export function weatherFor(name: string, mood: string, image?: string): Weather {
  const key = `${name}${image ?? ""}`;
  if (key.includes("雨")) return "rain";
  if (mood === "snow" || key.includes("冬")) return "snow";
  if (mood === "spring" || key.includes("春")) return "petals";
  if (mood === "night") return key.includes("屋") || key.includes("内") ? "dust" : "fireflies";
  if (/屋内|符堂|祠堂|西屋|竹屋内|闭关|洞府/.test(key) && !key.includes("外")) return "dust";
  if (mood === "dusk" || key.includes("秋")) return "leaves";
  return "dust";
}

// ———— 战斗特效（覆盖层，独立于会被重绘的战斗界面） ————

let layer: HTMLDivElement | null = null;
function fxLayer() {
  if (!layer || !layer.isConnected) {
    layer = document.createElement("div");
    layer.className = "fx-layer";
    document.body.append(layer);
  }
  return layer;
}

function center(r: DOMRect) {
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** 符箓从 from 飞向 to，命中后爆散。color 决定光色。 */
export async function castTalisman(from: DOMRect, to: DOMRect, color = "#f3d27a", heavy = false) {
  const L = fxLayer();
  const a = center(from), b = center(to);
  const t = document.createElement("div");
  t.className = `fx-talisman ${heavy ? "heavy" : ""}`;
  t.style.setProperty("--glow", color);
  L.append(t);
  const mid = { x: (a.x + b.x) / 2 + (Math.random() - 0.5) * 80, y: Math.min(a.y, b.y) - 60 };
  const anim = t.animate(
    [
      { transform: `translate(${a.x}px, ${a.y}px) rotate(-20deg) scale(0.6)`, opacity: 0 },
      { transform: `translate(${mid.x}px, ${mid.y}px) rotate(160deg) scale(1)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${b.x}px, ${b.y}px) rotate(340deg) scale(0.9)`, opacity: 1 },
    ],
    { duration: heavy ? 420 : 340, easing: "cubic-bezier(.4,.1,.6,1)" },
  );
  await anim.finished.catch(() => {});
  t.remove();
  burst(b.x, b.y, color, heavy ? 26 : 16);
}

export function burst(x: number, y: number, color: string, n = 16) {
  const L = fxLayer();
  const ring = document.createElement("div");
  ring.className = "fx-ring";
  ring.style.cssText = `left:${x}px;top:${y}px;--glow:${color}`;
  L.append(ring);
  ring.animate([{ transform: "translate(-50%,-50%) scale(0.2)", opacity: 0.9 }, { transform: "translate(-50%,-50%) scale(2.4)", opacity: 0 }], { duration: 480, easing: "ease-out" }).finished.then(() => ring.remove(), () => ring.remove());
  for (let i = 0; i < n; i++) {
    const s = document.createElement("i");
    s.className = "fx-spark";
    s.style.cssText = `left:${x}px;top:${y}px;background:${color}`;
    L.append(s);
    const ang = Math.random() * Math.PI * 2, d = 30 + Math.random() * 60;
    s.animate([{ transform: "translate(0,0) scale(1)", opacity: 1 }, { transform: `translate(${Math.cos(ang) * d}px, ${Math.sin(ang) * d}px) scale(0.2)`, opacity: 0 }], { duration: 380 + Math.random() * 300, easing: "cubic-bezier(.2,.8,.4,1)" }).finished.then(() => s.remove(), () => s.remove());
  }
}

/** 飘出数字（伤害、护盾等） */
export function floatText(r: DOMRect, text: string, cls = "dmg") {
  const L = fxLayer();
  const c = center(r);
  const d = document.createElement("div");
  d.className = `fx-num ${cls}`;
  d.textContent = text;
  d.style.cssText = `left:${c.x + (Math.random() - 0.5) * 30}px;top:${c.y - 10}px`;
  L.append(d);
  d.animate([{ transform: "translate(-50%,0) scale(0.6)", opacity: 0 }, { transform: "translate(-50%,-18px) scale(1.25)", opacity: 1, offset: 0.2 }, { transform: "translate(-50%,-56px) scale(1)", opacity: 0 }], { duration: 900, easing: "ease-out" }).finished.then(() => d.remove(), () => d.remove());
}

export function shake(el: Element, strength = 6) {
  el.animate(
    [0, 1, 2, 3, 4, 5].map((i) => ({ transform: `translate(${i === 5 ? 0 : (Math.random() - 0.5) * strength * 2}px, ${i === 5 ? 0 : (Math.random() - 0.5) * strength}px)` })),
    { duration: 260 },
  );
}

export function flash(el: Element, color = "rgba(255,255,255,0.9)") {
  el.animate([{ filter: "brightness(1)", boxShadow: `0 0 0 0 ${color}` }, { filter: "brightness(2.2)", boxShadow: `0 0 24px 6px ${color}`, offset: 0.25 }, { filter: "brightness(1)", boxShadow: `0 0 0 0 ${color}` }], { duration: 320 });
}

/** 全屏光柱（突破、获得重要物品） */
export function pillar(color = "#f3e2a0") {
  const L = fxLayer();
  const d = document.createElement("div");
  d.className = "fx-pillar";
  d.style.setProperty("--glow", color);
  L.append(d);
  d.animate([{ opacity: 0, transform: "scaleX(0.2)" }, { opacity: 1, transform: "scaleX(1)", offset: 0.3 }, { opacity: 0, transform: "scaleX(1.6)" }], { duration: 1400, easing: "ease-out" }).finished.then(() => d.remove(), () => d.remove());
}
