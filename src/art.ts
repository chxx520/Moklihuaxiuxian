import { findAsset } from "./assets";
// 水墨风占位美术：用代码生成场景（远山、雾、宣纸纹理、前景器物）和人物剪影。
// 正式美术到位后，只需要把 renderScene / renderFigure 换成图片即可。

export type Mood = "dawn" | "day" | "dusk" | "night" | "snow" | "spring";

const W = 390;
const H = 560;

type Palette = {
  sky: [string, string];
  ink: string;
  far: string;
  disc?: { color: string; opacity: number; x: number; y: number; r: number };
  mist: number;
  dark: boolean;
  snow?: boolean;
  blossom?: boolean;
};

export const MOODS: Record<Mood, Palette> = {
  dawn: { sky: ["#eeeadf", "#e2dccd"], ink: "#344042", far: "#7d8a88", disc: { color: "#d99a78", opacity: 0.35, x: 280, y: 150, r: 34 }, mist: 0.9, dark: false },
  day: { sky: ["#f2eee2", "#e4dcc8"], ink: "#2c3638", far: "#8a9290", mist: 0.7, dark: false },
  dusk: { sky: ["#f0e3cf", "#d8c1a1"], ink: "#352e2a", far: "#9b8673", disc: { color: "#b5452e", opacity: 0.6, x: 300, y: 205, r: 28 }, mist: 0.6, dark: false },
  night: { sky: ["#2b323a", "#171b20"], ink: "#07090b", far: "#3d4750", disc: { color: "#ebe4cf", opacity: 0.85, x: 90, y: 120, r: 22 }, mist: 0.22, dark: true },
  snow: { sky: ["#eef0ee", "#dde2e1"], ink: "#3a4448", far: "#a5adae", mist: 0.8, dark: false, snow: true },
  spring: { sky: ["#f2efe2", "#e2e4cd"], ink: "#2c3830", far: "#8c9a86", mist: 0.75, dark: false, blossom: true },
};

export function isMood(s: string | undefined): s is Mood {
  return !!s && s in MOODS;
}

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(s: string) {
  let h = 2166136261;
  for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h;
}

let uid = 0;

/** 一道山脊：尖峰由 |sin| 叠加，山脚渐隐进雾里 */
function ridge(r: () => number, base: number, amp: number, color: string, opacity: number, blur = 0) {
  const id = `g${++uid}`;
  const p1 = r() * 10, p2 = r() * 10;
  const f1 = 0.006 + r() * 0.008, f2 = 0.018 + r() * 0.02, f3 = 0.05 + r() * 0.04;
  let d = `M-20 ${H} L-20 ${base}`;
  let top = base;
  for (let x = -20; x <= W + 20; x += 5) {
    const y = base - amp * (0.62 * Math.abs(Math.sin(x * f1 + p1)) ** 1.6 + 0.3 * Math.abs(Math.sin(x * f2 + p2)) + 0.08 * Math.sin(x * f3));
    top = Math.min(top, y);
    d += ` L${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  d += ` L${W + 20} ${H} Z`;
  return `<linearGradient id="${id}" x1="0" y1="${top}" x2="0" y2="${base + 70}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="${color}" stop-opacity="${opacity}"/>
      <stop offset="0.55" stop-color="${color}" stop-opacity="${opacity * 0.55}"/>
      <stop offset="1" stop-color="${color}" stop-opacity="0"/>
    </linearGradient>
    <path d="${d}" fill="url(#${id})" ${blur ? `filter="url(#blur${blur})"` : 'filter="url(#ink)"'}/>`;
}

function mist(p: Palette, y: number, i: number) {
  const c = p.dark ? "#8a96a0" : "#ffffff";
  return `<g><ellipse cx="${W / 2}" cy="${y}" rx="${W * 0.9}" ry="26" fill="${c}" opacity="${p.mist * 0.55}" filter="url(#blur8)"/></g>`;
}

// ———— 前景器物 ————

function hall(ink: string) {
  return `<g filter="url(#ink)" fill="${ink}">
    <path d="M30 352 Q66 346 96 322 L294 322 Q324 346 360 352 Q300 357 195 357 Q90 357 30 352 Z"/>
    <path d="M96 322 Q130 296 152 284 L238 284 Q260 296 294 322 Z" opacity="0.92"/>
    <path d="M138 286 L252 286 L256 278 L134 278 Z"/>
    <path d="M128 280 q-6 -10 2 -16 M262 280 q6 -10 -2 -16" stroke="${ink}" stroke-width="5" fill="none"/>
    <rect x="92" y="357" width="206" height="92" opacity="0.38"/>
    <rect x="98" y="357" width="9" height="92"/><rect x="150" y="357" width="8" height="92"/>
    <rect x="232" y="357" width="8" height="92"/><rect x="283" y="357" width="9" height="92"/>
    <rect x="170" y="372" width="50" height="77" opacity="0.8"/>
    <rect x="182" y="330" width="26" height="18" fill="#a8443a" opacity="0.9"/>
    <path d="M70 449 L320 449 L336 470 L54 470 Z" opacity="0.55"/>
    <path d="M40 470 L350 470 L370 492 L20 492 Z" opacity="0.4"/>
  </g>`;
}

function roundWindow(ink: string, lamp: boolean) {
  // 符堂内部：墙上一扇圆窗，透出远山；一盏灯
  return `<defs><mask id="win"><rect width="${W}" height="${H}" fill="white"/><circle cx="195" cy="230" r="128" fill="black"/></mask></defs>
    <rect width="${W}" height="${H}" fill="${ink}" opacity="0.86" mask="url(#win)"/>
    <circle cx="195" cy="230" r="128" fill="none" stroke="${ink}" stroke-width="10" filter="url(#ink)"/>
    <g stroke="${ink}" stroke-width="3" opacity="0.7"><line x1="195" y1="102" x2="195" y2="358"/><line x1="67" y1="230" x2="323" y2="230"/></g>
    <g fill="#d8cfbb" opacity="0.16">${[0, 1, 2, 3].map((i) => `<rect x="${24 + i * 6}" y="${400 + i * 34}" width="${110 - i * 12}" height="6"/>`).join("")}</g>
    ${lamp ? `<circle cx="318" cy="420" r="60" fill="#e9a45a" opacity="0.22" filter="url(#blur8)"/><rect x="310" y="404" width="16" height="26" rx="4" fill="#e0b070" opacity="0.85"/>` : ""}`;
}

function hut(ink: string, r: () => number) {
  let bamboo = "";
  for (let i = 0; i < 9; i++) {
    const x = i < 4 ? 14 + i * 20 + r() * 8 : 290 + (i - 4) * 18 + r() * 8;
    const top = 60 + r() * 120;
    let seg = "";
    for (let y = top + 30; y < 520; y += 34 + r() * 10) seg += `<rect x="${x - 4}" y="${y}" width="9" height="2" opacity="0.9"/>`;
    const leaves = [0, 1, 2].map(() => {
      const ly = top + r() * 140, dir = r() > 0.5 ? 1 : -1;
      return `<path d="M${x} ${ly} q${dir * 18} -4 ${dir * 36} 6 q${-dir * 18} 2 ${-dir * 36} -6 Z"/>`;
    }).join("");
    bamboo += `<g opacity="${0.55 + r() * 0.4}"><rect x="${x - 3}" y="${top}" width="6" height="${520 - top}"/>${seg}${leaves}</g>`;
  }
  return `<g filter="url(#ink)" fill="${ink}">
    ${bamboo}
    <path d="M110 372 Q150 330 195 316 Q240 330 280 372 Q240 368 195 368 Q150 368 110 372 Z"/>
    <rect x="128" y="370" width="134" height="86" opacity="0.42"/>
    <rect x="178" y="388" width="34" height="68" opacity="0.85"/>
    <rect x="140" y="386" width="26" height="22" opacity="0.7"/>
    <path d="M60 456 L330 456 L350 480 L40 480 Z" opacity="0.45"/>
  </g>`;
}

function locust(ink: string, r: () => number) {
  let canopy = "";
  for (let i = 0; i < 34; i++) {
    const a = r() * Math.PI * 2, d = r() * 110;
    const cx = 110 + Math.cos(a) * d * 1.2, cy = 170 + Math.sin(a) * d * 0.62;
    canopy += `<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${(16 + r() * 26).toFixed(0)}" opacity="${(0.25 + r() * 0.5).toFixed(2)}"/>`;
  }
  const roofs = [0, 1, 2].map((i) => {
    const x = 230 + i * 48, y = 372 - i * 6;
    return `<path d="M${x} ${y} l22 -14 l22 14 Z" opacity="0.5"/><rect x="${x + 4}" y="${y}" width="36" height="18" opacity="0.3"/>`;
  }).join("");
  return `<g filter="url(#ink)" fill="${ink}">
    ${roofs}
    <g filter="url(#blur2)">${canopy}</g>
    <path d="M86 470 C96 400 70 330 100 250 C108 230 120 226 124 240 C118 300 140 380 150 470 Z"/>
    <path d="M104 262 C80 230 58 214 30 210 M118 252 C150 214 180 200 214 196 M110 300 C86 286 62 286 44 292" stroke="${ink}" stroke-width="9" fill="none" stroke-linecap="round"/>
    <path d="M150 470 C200 440 240 420 300 410 L330 412 C270 430 220 450 196 480 Z" opacity="0.28"/>
    <path d="M0 470 L390 470 L390 520 L0 520 Z" opacity="0.4"/>
    <ellipse cx="152" cy="468" rx="16" ry="6" opacity="0.7"/>
  </g>`;
}

function gate(ink: string, state: string) {
  // 温家旧门：正面，门楣铜镜，门上黄符
  const blackened = state === "black";
  const talisman = blackened ? "#4a4236" : "#e3c873";
  const torn = state === "torn" ? `<path d="M222 392 l14 0 l-6 20 l-10 -4 Z" fill="#f0e3cf"/>` : "";
  return `<g>
    <g filter="url(#ink)" fill="${ink}">
      <path d="M0 300 L18 296 L30 306 L52 298 L60 330 L74 322 L80 470 L0 470 Z" opacity="0.5"/>
      <path d="M390 310 L366 304 L352 316 L330 306 L318 470 L390 470 Z" opacity="0.5"/>
      <path d="M68 238 Q195 214 322 238 L330 252 Q195 236 60 252 Z"/>
      <rect x="86" y="250" width="218" height="26" opacity="0.92"/>
      <rect x="92" y="276" width="16" height="196"/><rect x="282" y="276" width="16" height="196"/>
      <rect x="110" y="282" width="84" height="190" opacity="0.66"/>
      <rect x="196" y="282" width="84" height="190" opacity="0.66"/>
      <path d="M150 320 h8 M150 380 h8 M150 440 h8 M232 320 h8 M232 380 h8 M232 440 h8" stroke="${ink}" stroke-width="6" opacity="0.8"/>
      <path d="M50 470 L340 470 L360 496 L30 496 Z" opacity="0.45"/>
    </g>
    <circle cx="195" cy="263" r="15" fill="#b9b3a3" stroke="#5d5444" stroke-width="3"/>
    <circle cx="195" cy="263" r="22" fill="#e8e0c8" opacity="${state === "glow" ? 0.55 : 0.12}" filter="url(#blur8)" />
    <g transform="rotate(-2 222 360)">
      <rect x="202" y="320" width="40" height="92" fill="${talisman}" opacity="0.95"/>
      <path d="M212 332 q10 6 0 14 q12 4 2 14 M226 330 v40 M218 380 q8 -6 14 2 q-6 8 -14 6" stroke="${blackened ? "#1d1a16" : "#a8443a"}" stroke-width="2.6" fill="none"/>
      ${torn}
    </g>
  </g>`;
}

function pine(ink: string, r: () => number) {
  // 崖边一棵松：斜干，几簇扁平的松针团
  let tiers = "";
  const tiersAt = [[268, 300], [318, 262], [244, 252], [300, 222]];
  for (const [cx, cy] of tiersAt) {
    for (let k = 0; k < 6; k++) {
      const x = cx + (r() - 0.5) * 50, y = cy + (r() - 0.5) * 10;
      tiers += `<ellipse cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" rx="${(18 + r() * 16).toFixed(0)}" ry="${(5 + r() * 4).toFixed(0)}" opacity="${(0.55 + r() * 0.4).toFixed(2)}"/>`;
    }
  }
  return `<g filter="url(#ink)" fill="${ink}" transform="translate(16 120)">
    <path d="M390 380 L330 396 Q290 420 262 470 L250 560 L390 560 Z" opacity="0.8"/>
    <path d="M300 400 C296 360 278 330 290 300 C296 280 312 262 330 250 L334 254 C318 270 304 290 300 310 C298 340 312 370 310 400 Z"/>
    <path d="M296 318 C280 312 262 306 246 304 M306 280 C292 262 276 256 262 254" stroke="${ink}" stroke-width="4" fill="none" stroke-linecap="round"/>
    <g filter="url(#blur2)">${tiers}</g>
    <path d="M70 150 q8 -6 14 0 q6 -6 14 0 M120 176 q6 -4 10 0 q4 -4 10 0" stroke="${ink}" stroke-width="2" fill="none" opacity="0.6"/>
  </g>`;
}

function snowfall(r: () => number) {
  let s = "";
  for (let i = 0; i < 60; i++) s += `<circle cx="${(r() * W).toFixed(0)}" cy="${(r() * H).toFixed(0)}" r="${(0.8 + r() * 1.8).toFixed(1)}" fill="#fff" opacity="${(0.5 + r() * 0.5).toFixed(2)}"/>`;
  return `<g class="snow">${s}</g>`;
}

function blossoms(r: () => number) {
  let s = "";
  for (let i = 0; i < 26; i++) s += `<circle cx="${(r() * W).toFixed(0)}" cy="${(r() * 320).toFixed(0)}" r="${(1.6 + r() * 2.2).toFixed(1)}" fill="#d9a3a0" opacity="${(0.4 + r() * 0.4).toFixed(2)}"/>`;
  return `<g class="petals">${s}</g>`;
}


function room(ink: string, lamp: boolean, bed: boolean) {
  // 室内：墙、一扇方格窗透出夜色、可选油灯与床
  return `<defs><mask id="rw"><rect width="${W}" height="${H}" fill="white"/><rect x="200" y="120" width="140" height="150" fill="black"/></mask></defs>
    <rect width="${W}" height="${H}" fill="${ink}" opacity="0.82" mask="url(#rw)"/>
    <g stroke="${ink}" stroke-width="5" opacity="0.9" filter="url(#ink)">
      <rect x="200" y="120" width="140" height="150" fill="none"/>
      <line x1="270" y1="120" x2="270" y2="270"/><line x1="200" y1="195" x2="340" y2="195"/>
      <line x1="235" y1="120" x2="235" y2="270" stroke-width="2"/><line x1="305" y1="120" x2="305" y2="270" stroke-width="2"/>
    </g>
    <path d="M200 270 L340 270 L300 560 L120 560 Z" fill="#e8e0c8" opacity="0.08"/>
    ${bed ? `<g fill="${ink}" filter="url(#ink)"><rect x="20" y="380" width="200" height="22" opacity="0.9"/><rect x="26" y="402" width="10" height="70"/><rect x="204" y="402" width="10" height="70"/><path d="M30 380 q30 -26 70 -20 l110 4 l0 16 Z" fill="#cfc4ac" opacity="0.25"/></g>` : ""}
    ${lamp ? `<circle cx="300" cy="410" r="70" fill="#e9a45a" opacity="0.2" filter="url(#blur8)"/><rect x="292" y="396" width="16" height="26" rx="4" fill="#e0b070" opacity="0.85"/><rect x="270" y="422" width="70" height="8" fill="${ink}" opacity="0.8"/>` : ""}`;
}

function shrine(ink: string) {
  let tabs = "";
  for (let row = 0; row < 3; row++) for (let i = 0; i < 7; i++) {
    const x = 62 + i * 40, y = 250 + row * 52;
    tabs += `<rect x="${x}" y="${y}" width="20" height="40" rx="3" opacity="${0.55 + (i % 3) * 0.12}"/>`;
  }
  return `<rect width="${W}" height="${H}" fill="${ink}" opacity="0.8"/>
    <path d="M250 0 L300 0 L360 ${H} L180 ${H} Z" fill="#efe6cf" opacity="0.13" filter="url(#blur4)"/>
    <g fill="#5a5044" filter="url(#ink)">${tabs}</g>
    <rect x="40" y="410" width="310" height="14" fill="#3a332b"/>
    <rect x="50" y="424" width="12" height="90" fill="#3a332b"/><rect x="328" y="424" width="12" height="90" fill="#3a332b"/>
    <path d="M190 402 v-22" stroke="#d9a35a" stroke-width="2"/><circle cx="190" cy="378" r="10" fill="#e9a45a" opacity="0.35" filter="url(#blur4)"/>`;
}

function cave(ink: string) {
  return `<defs><mask id="cv"><rect width="${W}" height="${H}" fill="white"/><path d="M60 560 Q60 160 195 140 Q330 160 330 560 Z" fill="black"/></mask></defs>
    <rect width="${W}" height="${H}" fill="${ink}" opacity="0.88" mask="url(#cv)" filter="url(#ink)"/>
    <path d="M40 120 q20 60 6 140 M350 110 q-14 80 4 150" stroke="${ink}" stroke-width="4" fill="none" opacity="0.6"/>
    <ellipse cx="195" cy="470" rx="120" ry="28" fill="none" stroke="#c9a25e" stroke-width="2.5" opacity="0.7"/>
    <ellipse cx="195" cy="470" rx="80" ry="18" fill="none" stroke="#c9a25e" stroke-width="1.5" opacity="0.6"/>
    <ellipse cx="195" cy="470" rx="130" ry="34" fill="#e9c97a" opacity="0.15" filter="url(#blur8)" class="pulse"/>`;
}

function mirrorRealm(ink: string) {
  return `<rect width="${W}" height="${H}" fill="#dfe3e4" opacity="0.5"/>
    <g transform="translate(60 40) scale(0.7)">${gate(ink, "glow")}</g>
    <path d="M195 380 Q200 460 180 560" stroke="#f4f2ea" stroke-width="18" fill="none" opacity="0.5" filter="url(#blur4)"/>`;
}

function field(ink: string, r: () => number, grey: boolean) {
  let rows = "";
  for (let i = 0; i < 10; i++) {
    const y = 380 + i * 18;
    const isGrey = grey && i % 2 === 0;
    rows += `<path d="M${-20 + i * 6} ${y} Q195 ${y - 10} ${410 - i * 6} ${y}" stroke="${isGrey ? "#8a8a80" : "#5f7a4f"}" stroke-width="${4 + i * 0.6}" fill="none" opacity="${isGrey ? 0.45 : 0.6}"/>`;
    for (let k = 0; k < 14; k++) {
      const x = 10 + k * 28 + r() * 10;
      rows += `<path d="M${x} ${y} l-3 -${8 + i} M${x} ${y} l3 -${7 + i}" stroke="${isGrey ? "#7d7a6e" : "#4f6a40"}" stroke-width="1.5" opacity="${isGrey ? 0.3 : 0.55}"/>`;
    }
  }
  return `<g filter="url(#ink)">${rows}</g>${grey ? `<ellipse cx="200" cy="440" rx="180" ry="40" fill="#9a9a90" opacity="0.25" filter="url(#blur8)" class="mist"/>` : ""}
    <path d="M300 372 l20 -14 l20 14 Z M296 372 h48 v16 h-48 Z" fill="${ink}" opacity="0.5"/>`;
}

function newWall(ink: string) {
  let bricks = "";
  for (let row = 0; row < 11; row++) for (let i = 0; i < 9; i++) {
    const x = 40 + i * 36 + (row % 2) * 18, y = 250 + row * 20;
    if (x < 30 || x > 340) continue;
    bricks += `<rect x="${x}" y="${y}" width="32" height="16" opacity="${0.35 + ((i + row) % 3) * 0.08}"/>`;
  }
  return `<g fill="${ink}" filter="url(#ink)">
      <path d="M0 300 L18 296 L30 306 L52 298 L60 330 L74 322 L80 470 L0 470 Z" opacity="0.5"/>
      <path d="M390 310 L366 304 L352 316 L330 306 L318 470 L390 470 Z" opacity="0.5"/>
      ${bricks}
      <path d="M50 470 L340 470 L360 496 L30 496 Z" opacity="0.45"/>
    </g>
    <path d="M180 470 q15 12 30 0 Z" fill="#8a6a4a"/><path d="M186 468 l6 -8 l4 6 l6 -9 l4 11" stroke="#c9c2b0" stroke-width="2" fill="none"/>`;
}

/** 场景名 → 前景构图。未登记的场景只画远山和松。 */
const PROPS: Record<string, (ink: string, r: () => number, variant: string) => string> = {
  符堂外: (ink) => hall(ink),
  符堂: (ink) => roundWindow(ink, true),
  竹屋前: (ink, r) => hut(ink, r),
  槐荫村口: (ink, r) => locust(ink, r),
  温家旧门: (ink, _r, v) => gate(ink, v || "torn"),
  温家西屋: (ink) => room(ink, true, true),
  竹屋内: (ink) => room(ink, true, true),
  祠堂: (ink) => shrine(ink),
  闭关: (ink) => cave(ink),
  镜中境: (ink) => mirrorRealm(ink),
  田野: (ink, r) => field(ink, r, true),
  温家新墙: (ink) => newWall(ink),
};

/** 生成完整场景 SVG。variant 用于同一地点的不同状态（如护符破损 / 发黑）。 */
/** 把 SVG 转成 <img>：浏览器只栅格化一次并缓存，不会每帧重算滤镜 */
function svgImg(svg: string, cls: string, color = "#1f1b18") {
  const src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg.replace(/currentColor/g, color));
  return `<img class="${cls}" src="${src}" alt="" decoding="async">`;
}

/** 飘动的雾：独立的 CSS 渐变层，只做位移动画（GPU 合成，几乎不耗性能） */
function mistLayer(mood: Mood) {
  const p = MOODS[mood];
  const extra = p.snow ? '<div class="fx-snow"></div>' : p.blossom ? '<div class="fx-petals"></div>' : "";
  return `<div class="fx-mist ${p.dark ? "dark" : ""}" style="opacity:${p.mist}"><i></i><i></i><i></i></div>${extra}`;
}

function scope(svg: string, pre: string) {
  return svg.replace(/id="([\w]+)"/g, `id="${pre}$1"`).replace(/url\(#(\w+)\)/g, `url(#${pre}$1)`);
}

export function renderScene(name: string, mood: Mood = "day", variant = ""): string {
  return scope(sceneSvg(name, mood, variant), `s${++uid}_`);
}

function sceneSvg(name: string, mood: Mood, variant: string): string {
  const p = MOODS[mood];
  const r = rng(hash(name));
  const interior = name === "符堂";
  const prop = PROPS[name]?.(p.ink, rng(hash(name) + 7), variant) ?? pine(p.ink, rng(hash(name) + 7));
  const d = p.disc;
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.sky[0]}"/><stop offset="1" stop-color="${p.sky[1]}"/></linearGradient>
    <filter id="ink" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="3"/><feDisplacementMap in="SourceGraphic" scale="5"/></filter>
    <filter id="blur2"><feGaussianBlur stdDeviation="2"/></filter>
    <filter id="blur4"><feGaussianBlur stdDeviation="4"/></filter>
    <filter id="blur8" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="8"/></filter>
    <filter id="paper"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="8"/><feColorMatrix values="0 0 0 0 0.3  0 0 0 0 0.26  0 0 0 0 0.2  0 0 0 0.09 0"/></filter>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  ${d ? `<circle cx="${d.x}" cy="${d.y}" r="${d.r}" fill="${d.color}" opacity="${d.opacity}"/>` : ""}
  ${ridge(r, 250, 120, p.far, 0.55, 4)}
  ${mist(p, 262, 0)}
  ${ridge(r, 320, 110, p.far, 0.8, 2)}
  ${mist(p, 330, 1)}
  ${ridge(r, 400, 90, p.ink, p.dark ? 0.9 : 0.55)}
  ${mist(p, 410, 2)}
  ${prop}
  ${p.snow ? snowfall(r) : ""}
  ${p.blossom ? blossoms(r) : ""}
  <rect width="${W}" height="${H}" filter="url(#paper)"/>
</svg>`;
}

// ———— 人物剪影 ————
// 每个人物一个 120×300 的剪影，用身形和标志物区分。

const FIG: Record<string, string> = {
  顾长庚: `<path d="M60 22 q-6 -14 2 -18 q8 4 2 18 Z"/><ellipse cx="60" cy="42" rx="15" ry="18"/>
    <path d="M52 56 q8 30 0 52 q8 -6 16 0 q-8 -22 0 -52 Z" opacity="0.7"/>
    <path d="M44 64 Q30 70 26 110 L18 290 L102 290 L94 110 Q90 70 76 64 Q60 76 44 64 Z"/>
    <path d="M26 150 Q60 172 94 150 L96 176 Q60 196 24 176 Z" opacity="0.6"/>`,
  陆青棠: `<ellipse cx="60" cy="22" rx="12" ry="9"/><path d="M66 18 l26 -12" stroke="currentColor" stroke-width="3"/>
    <ellipse cx="60" cy="44" rx="13" ry="16"/>
    <path d="M47 62 Q38 70 36 104 L28 290 L92 290 L84 104 Q82 70 73 62 Q60 72 47 62 Z"/>
    <path d="M36 118 Q22 150 20 196 L36 200 Q40 160 46 128 Z M84 118 Q96 140 100 170 L84 176 Z" opacity="0.75"/>
    <rect x="88" y="150" width="20" height="28" transform="rotate(8 98 164)" fill="#e3c873" opacity="0.9"/>`,
  温小满: `<ellipse cx="54" cy="150" rx="5" ry="6"/><ellipse cx="66" cy="150" rx="5" ry="6"/><ellipse cx="60" cy="167" rx="13" ry="14"/>
    <path d="M48 182 Q40 188 38 214 L32 290 L88 290 L82 214 Q80 188 72 182 Q60 190 48 182 Z"/>`,
  温阿婆: `<path d="M44 92 Q58 72 76 84 Q84 96 78 112 Q60 118 46 108 Z"/>
    <path d="M50 110 Q36 120 34 160 Q30 220 30 290 L88 290 Q86 210 80 160 Q78 126 70 114 Z"/>
    <path d="M86 150 L104 290" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>
    <path d="M70 140 Q86 146 90 152" stroke="currentColor" stroke-width="8" stroke-linecap="round" fill="none"/>`,
};

FIG["温晚"] = `<ellipse cx="60" cy="40" rx="13" ry="16"/>
    <path d="M47 34 Q44 70 40 110 L50 104 Q50 70 52 46 Z M73 34 Q76 70 80 110 L70 104 Q70 70 68 46 Z" opacity="0.8"/>
    <path d="M48 58 Q38 66 36 100 L30 230 Q60 250 90 230 L84 100 Q82 66 72 58 Q60 68 48 58 Z" opacity="0.75"/>
    <path d="M30 230 Q40 260 34 290 M60 240 Q66 268 58 296 M90 230 Q84 262 92 288" stroke="currentColor" stroke-width="6" fill="none" opacity="0.35"/>`;
FIG["阿禾"] = `<ellipse cx="60" cy="150" rx="7" ry="6"/><ellipse cx="60" cy="168" rx="13" ry="14"/>
    <path d="M48 183 Q41 190 39 214 L34 290 L86 290 L81 214 Q79 190 72 183 Q60 191 48 183 Z"/>
    <path d="M82 210 l14 -18" stroke="currentColor" stroke-width="3"/>`;

export function hasFigure(name: string) {
  return name in FIG;
}

export function renderFigure(name: string): string {
  const body = FIG[name];
  if (!body) return "";
  return scope(`<svg viewBox="0 0 120 300" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMax meet">
    <defs><filter id="fink"><feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed="5"/><feDisplacementMap in="SourceGraphic" scale="3"/></filter>
    <linearGradient id="ffade" x1="0" y1="0" x2="0" y2="1"><stop offset="0.7" stop-color="white"/><stop offset="1" stop-color="white" stop-opacity="0"/></linearGradient>
    <mask id="fmask"><rect width="120" height="300" fill="url(#ffade)"/></mask></defs>
    <g fill="currentColor" color="currentColor" filter="url(#fink)" mask="url(#fmask)">${body}</g>
  </svg>`, `f${++uid}_`);
}

// ———— 敌人 ————

const FOE: Record<string, string> = {
  饥影: `<path d="M50 20 q14 -4 22 8 q6 12 -2 22 q10 6 12 30 l10 50 l-8 2 l-12 -42 l-4 50 l-8 0 l-2 -48 l-8 46 l-8 -2 l6 -52 q-8 10 -20 30 l-6 -4 q12 -26 24 -40 q-8 -14 4 -50 Z"/>
    <ellipse cx="56" cy="34" rx="2.5" ry="2" fill="#e8c36a"/><ellipse cx="66" cy="34" rx="2.5" ry="2" fill="#e8c36a"/>
    <ellipse cx="60" cy="78" rx="8" ry="10" fill="#f3ecdc" opacity="0.35"/>`,
  饥祟: `<path d="M60 8 q30 4 34 40 q4 36 -6 60 l10 52 l-76 0 l10 -52 q-10 -24 -6 -60 q4 -36 34 -40 Z" opacity="0.92"/>
    <ellipse cx="60" cy="74" rx="16" ry="22" fill="#f3ecdc" opacity="0.3"/>
    <ellipse cx="50" cy="38" rx="3" ry="2.4" fill="#e8c36a"/><ellipse cx="70" cy="38" rx="3" ry="2.4" fill="#e8c36a"/>
    <path d="M28 70 q-20 -8 -26 -26 M92 70 q20 -8 26 -26 M30 96 q-22 6 -30 0 M90 96 q22 6 30 0" stroke="currentColor" stroke-width="4" fill="none"/>
    <path d="M-4 40 h14 q-1 6 -7 6 q-6 0 -7 -6 Z M110 40 h14 q-1 6 -7 6 q-6 0 -7 -6 Z M-6 92 h14 q-1 6 -7 6 q-6 0 -7 -6 Z M112 92 h14 q-1 6 -7 6 q-6 0 -7 -6 Z" fill="#8a7a62"/>
    <path d="M40 120 l-6 30 M80 120 l6 30 M60 124 l0 34" stroke="#b39c6a" stroke-width="2" opacity="0.7"/>`,
  屏障: `<circle cx="60" cy="80" r="52" fill="none" stroke="currentColor" stroke-width="6" opacity="0.8"/>
    <circle cx="60" cy="80" r="40" fill="currentColor" opacity="0.25"/>
    <path d="M60 36 v88 M16 80 h88 M30 50 l60 60 M90 50 l-60 60" stroke="#a8443a" stroke-width="2.5" opacity="0.85"/>`,
};

const foeCache = new Map<string, string>();
export function enemyArt(name: string): string {
  const hit = foeCache.get(name);
  if (hit) return hit;
  const v = enemyArtRaw(name);
  foeCache.set(name, v);
  return v;
}

function enemyArtRaw(name: string): string {
  const img = findAsset("enemies", name);
  if (img) return `<img src="${img}" alt="">`;
  const body = FOE[name] ?? FOE["饥影"];
  return svgImg(`<svg viewBox="-10 0 140 170" xmlns="http://www.w3.org/2000/svg"><defs><filter id="ef"><feTurbulence type="fractalNoise" baseFrequency="0.07" numOctaves="2" seed="2"/><feDisplacementMap in="SourceGraphic" scale="4"/></filter></defs><g fill="currentColor" color="currentColor" filter="url(#ef)">${body}</g></svg>`, "foe-svg", "#1b1715");
}

/** 场景：有插画用插画，否则用代码生成的水墨图 */
export function sceneHtml(name: string, mood: Mood, variant: string, image?: string): string {
  const img = (image && findAsset("scenes", image)) || findAsset("scenes", name, name + "_");
  if (img) return `<img class="scene-img" src="${img}" alt="" decoding="async"><div class="mist-overlay"></div>${mistLayer(mood)}`;
  return sceneCache(name, mood, variant) + mistLayer(mood);
}

const sceneImgCache = new Map<string, string>();
function sceneCache(name: string, mood: Mood, variant: string) {
  const k = `${name}|${mood}|${variant}`;
  let v = sceneImgCache.get(k);
  if (!v) { v = svgImg(renderScene(name, mood, variant), "scene-svg"); sceneImgCache.set(k, v); }
  return v;
}

/** 标题页背景 */
export function titleHtml() {
  const img = findAsset("scenes", "符堂外_清晨");
  if (img) return `<img class="scene-img title-img" src="${img}" alt=""><div class="title-veil"></div>${mistLayer("dawn")}`;
  return sceneCache("归山", "dawn", "") + mistLayer("dawn");
}

/** 角色实际身高（相对成年人）。立绘画布一样大，游戏里按设定缩放。 */
const HEIGHTS: [string, number][] = [
  ["温小满_8岁", 0.6], ["阿禾_8岁", 0.6], ["温小满_13岁", 0.84], ["温阿婆", 0.86], ["温晚", 0.97], ["陆青棠", 0.96],
];
function figureScale(key: string) {
  return HEIGHTS.find(([k]) => key.startsWith(k))?.[1] ?? 1;
}

/** 立绘：portrait 形如「温小满_8岁#笑」。有图用图，否则用剪影。 */
export function figureHtml(portrait: string): string {
  const [key, expr] = portrait.split("#");
  const img = findAsset("characters", expr ? `${key}_${expr}` : key, key);
  if (img) return `<img class="portrait" src="${img}" alt="" decoding="async" style="height:${figureScale(key) * 100}%">`;
  const fig = renderFigure(key.split("_")[0]);
  return fig ? svgImg(fig, "fig-svg") : "";
}

export function hasPortrait(portrait: string) {
  const key = portrait.split("#")[0];
  return !!findAsset("characters", key, key) || hasFigure(key.split("_")[0]);
}
