// 历练地图（移动、耗时、干粮）、遭遇战（迎战 / 速战 / 撤退、掉落）、采集、商店。
import { enemyArt } from "../art";
import { findAsset } from "../assets";
import { playMusic, sfx } from "../audio";
import { registerBattle, registerFoe, runBattle } from "../battle";
import type { GameState } from "../engine";
import { burst, floatText } from "../fx";
import { autosave } from "../save";
import { SPELL_ORDER } from "../spells";
import { inkWipe } from "../theme";
import { el } from "../ui";
import { addXp, advanceDays, battleMods, DATA, dateLabel, give, ITEMS, LOCS, mirror, realmOf, type Player } from "./model";

type Hooks = { sheet: (title: string, body: HTMLElement, actions?: [string, () => void][], onDismiss?: () => void) => () => void };

/** 最短路径（只走已解锁的地点） */
function route(p: Player, from: string, to: string): { path: string[]; days: number } | null {
  const dist: Record<string, number> = { [from]: 0 };
  const prev: Record<string, string> = {};
  const q = new Set(p.unlocked);
  while (q.size) {
    let u = "", best = Infinity;
    for (const n of q) if ((dist[n] ?? Infinity) < best) { best = dist[n]; u = n; }
    if (!u) break;
    q.delete(u);
    if (u === to) break;
    for (const [v, d] of Object.entries(LOCS[u].links)) {
      if (!p.unlocked.includes(v)) continue;
      const nd = best + d;
      if (nd < (dist[v] ?? Infinity)) { dist[v] = nd; prev[v] = u; }
    }
  }
  if (dist[to] === undefined) return null;
  const path = [to];
  while (path[0] !== from) path.unshift(prev[path[0]]);
  return { path, days: dist[to] };
}

/** 没有地图插画时，用代码画一张水墨舆图 */
function inkMap() {
  return `<svg viewBox="0 0 100 160" width="500" height="800" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
    <defs><filter id="mi"><feTurbulence type="fractalNoise" baseFrequency="0.08" numOctaves="2" seed="3"/><feDisplacementMap in="SourceGraphic" scale="2.5"/></filter>
    <linearGradient id="mg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9dfc6"/><stop offset="1" stop-color="#f1e8d2"/></linearGradient></defs>
    <rect width="100" height="160" fill="url(#mg)"/>
    <g filter="url(#mi)" fill="#5a5448">
      <path d="M0 40 L12 18 L20 30 L32 8 L44 26 L54 10 L66 28 L78 6 L90 24 L100 14 L100 50 L0 50 Z" opacity="0.35"/>
      <path d="M0 52 L16 34 L28 46 L46 30 L60 46 L74 32 L88 44 L100 36 L100 62 L0 62 Z" opacity="0.22"/>
      <path d="M58 58 q8 -6 16 0 q8 -4 14 4 q6 8 -2 14 q-10 6 -20 2 q-12 -2 -8 -20 Z" fill="#3e4a3e" opacity="0.4"/>
    </g>
    <path d="M-5 150 Q30 132 52 146 T110 140 L110 165 L-5 165 Z" fill="#7c9aa6" opacity="0.45" filter="url(#mi)"/>
    <path d="M-5 154 Q30 138 52 150 T110 146" fill="none" stroke="#5e7e8c" stroke-width="0.6" opacity="0.6"/>
    <g fill="#8a7a5a" opacity="0.35">${Array.from({ length: 14 }, (_, i) => `<rect x="${14 + (i % 7) * 4}" y="${108 + Math.floor(i / 7) * 4}" width="3" height="2.5"/>`).join("")}</g>
  </svg>`;
}

export function openMap(s: GameState, done: (dest?: string) => void, hooks: Hooks) {
  const p = s.p!;
  const img = findAsset("scenes", "区域地图");
  const wrap = el("div", { class: "map-screen" });
  const frame = el("div", { class: "map-board" });
  // 地图内容放在内层，有卷轴框时收进框内安全区
  const board = el("div", { class: "map-inner" });
  frame.append(board);
  // 没有地图插画时，代码水墨图也转成图片（只栅格化一次，赶路动画不会反复重算滤镜）
  board.innerHTML = `<img class="map-img" src="${img ?? "data:image/svg+xml;charset=utf-8," + encodeURIComponent(inkMap())}" alt="">`;
  const lines = el("div", { class: "map-lines" });
  // 连线
  const seen = new Set<string>();
  let svgLines = `<svg viewBox="0 0 100 100" preserveAspectRatio="none">`;
  for (const [a, la] of Object.entries(LOCS)) for (const b of Object.keys(la.links)) {
    const k = [a, b].sort().join("|");
    if (seen.has(k)) continue;
    seen.add(k);
    const lb = LOCS[b];
    const open = p.unlocked.includes(a) && p.unlocked.includes(b);
    svgLines += `<line x1="${la.x}" y1="${la.y}" x2="${lb.x}" y2="${lb.y}" class="${open ? "open" : "fog"}"/>`;
  }
  lines.innerHTML = svgLines + "</svg>";
  board.append(lines);

  const marker = el("div", { class: "map-me" });
  const setMarker = (x: number, y: number) => { marker.style.left = `${x}%`; marker.style.top = `${y}%`; };
  setMarker(LOCS[p.loc].x, LOCS[p.loc].y);

  for (const [name, l] of Object.entries(LOCS)) {
    const open = p.unlocked.includes(name);
    const n = el("button", { class: `map-node ${open ? "" : "locked"} ${name === p.loc ? "here" : ""}`, style: `left:${l.x}%;top:${l.y}%` },
      el("i", { class: "mn-dot" }), el("span", { class: "mn-name" }, open ? name : "？"));
    n.addEventListener("click", (e) => { e.stopPropagation(); if (open) pick(name); else { sfx("miss"); } });
    board.append(n);
  }
  board.append(marker);

  const info = el("div", { class: "map-info" });
  const head = el("div", { class: "map-head" }, el("span", { class: "map-title" }, "舆图"), el("span", { class: "dim" }, `${dateLabel(p)} · 干粮 ${p.bag["干粮"] ?? 0}`));
  const closeBtn = el("button", { class: "choice map-close" }, el("span", {}, "收起舆图"));
  closeBtn.addEventListener("click", () => { sfx("close"); wrap.remove(); done(); });
  wrap.append(head, frame, info, closeBtn);
  document.body.append(wrap);
  sfx("book");
  info.append(el("p", { class: "dim" }, "点选一处地点。"));

  const pick = (name: string) => {
    sfx("page");
    const l = LOCS[name];
    info.replaceChildren();
    if (name === p.loc) { info.append(el("b", {}, name), el("p", {}, `你就在这里。${l.desc}`)); return; }
    const r = route(p, p.loc, name);
    if (!r) { info.append(el("b", {}, name), el("p", {}, "暂时到不了。")); return; }
    const go = el("button", { class: "choice btn-primary" }, el("span", {}, `前往（${r.days} 日）`));
    go.addEventListener("click", () => travel(r.path, r.days));
    info.append(el("b", {}, name), el("p", {}, l.desc), el("p", { class: "dim" }, `路线：${r.path.join(" → ")}`), go);
  };

  const travel = async (path: string[], days: number) => {
    info.replaceChildren(el("p", {}, "赶路中……"));
    closeBtn.hidden = true;
    sfx("swing");
    for (let i = 1; i < path.length; i++) {
      const a = LOCS[path[i - 1]], b = LOCS[path[i]];
      const seg = LOCS[path[i - 1]].links[path[i]];
      const t0 = performance.now(), dur = 550 + seg * 220;
      await new Promise<void>((res) => {
        const step = (t: number) => {
          const k = Math.min(1, (t - t0) / dur);
          setMarker(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k);
          if (k < 1) requestAnimationFrame(step); else res();
        };
        requestAnimationFrame(step);
      });
      for (let d = 0; d < seg; d++) { if ((p.bag["干粮"] ?? 0) > 0) give(p, "干粮", -1); }
      advanceDays(p, seg);
      head.lastElementChild!.textContent = `${dateLabel(p)} · 干粮 ${p.bag["干粮"] ?? 0}`;
    }
    const dest = path[path.length - 1];
    p.loc = dest;
    mirror(s);
    autosave(s);
    sfx("open");
    await inkWipe(() => wrap.remove(), 800);
    done(dest);
    void days;
  };
}

// ———— 遭遇战 ————

const roll = ([a, b]: [number, number]) => a + Math.floor(Math.random() * (b - a + 1));

export async function quickOrFight(s: GameState, foeId: string, hooks: Hooks, opts: { forced?: boolean; grant?: string[] } = {}): Promise<boolean> {
  const p = s.p!;
  const foe = DATA.foes[foeId];
  registerFoe(foeId, { name: foe.name, hp: foe.hp + Math.floor(p.realm * 0.8), pattern: foe.pattern, hidden: foe.hidden, art: foe.art });
  const count = !opts.forced && p.realm >= 3 && Math.random() < 0.35 ? 2 : 1;
  const bid = `enc_${foeId}`;
  registerBattle(bid, { title: `遭遇 · ${foe.name}`, goal: `击退${foe.name}`, kind: "defeat", hp: 12, paper: 2, enemies: Array(count).fill(foeId) });
  const spells = (p.loadout.length ? p.loadout : SPELL_ORDER).filter((n) => s.spells.includes(n));
  const power = p.realm * 2.2 + spells.length * 1.2 + battleMods(p).atk * 2;
  const threat = (foe.hp * count) / 2.4 + 2;
  const canQuick = !opts.forced && power >= threat * 1.35 && spells.length > 0;
  void canQuick;

  const choice = await new Promise<"fight" | "quick" | "flee">((resolve) => {
    const art = el("div", { class: "enc-art" });
    art.innerHTML = enemyArt(foe.art);
    const actions: [string, () => void][] = [["迎战", () => resolve("fight")]];
    if (canQuick) actions.push(["速战（实力远胜，直接结算）", () => resolve("quick")]);
    if (!opts.forced) actions.push(["撤退", () => resolve("flee")]);
    sfx("summon");
    hooks.sheet(`遭遇 · ${foe.name}${count > 1 ? " ×2" : ""}`, el("div", { class: "encounter" }, art, el("p", {}, count > 1 ? `两只${foe.name}从暗处围了上来。` : `一只${foe.name}挡住了去路。`)), actions, () => resolve(opts.forced ? "fight" : "flee"));
  });
  if (choice === "flee") { sfx("back"); return false; }

  let win = true;
  if (choice === "fight") {
    playMusic("挑战");
    const items = { ...p.bag };
    // 还没学会术法时，靠木牌之力
    const grant = opts.grant ?? (spells.length ? undefined : ["驱邪符", "护身符"]);
    const r = await runBattle(bid, spells, {
      mods: battleMods(p), items, itemDefs: ITEMS as any, grant,
      onUseItem: (k) => give(p, k, -1),
    });
    win = r.win;
  }
  if (!win) return false;

  // 掉落
  const gains: [string, number][] = [];
  for (const [k, range] of Object.entries(foe.loot as Record<string, [number, number]>)) {
    const n = roll(range) * count;
    if (n > 0) { give(p, k, n); gains.push([k, n]); }
  }
  const xp = foe.xp * count;
  addXp(p, xp);
  mirror(s);
  autosave(s);
  await showRewards(hooks, choice === "quick" ? "速战告捷" : "战斗胜利", [["修为", xp], ...gains]);
  return true;
}

export function showRewards(hooks: Hooks, title: string, gains: [string, number][]) {
  return new Promise<void>((resolve) => {
    sfx("get");
    const list = el("div", { class: "reward-list" }, ...gains.map(([k, n], i) => {
      const c = el("div", { class: "reward", style: `animation-delay:${i * 90}ms` }, el("span", { class: "rw-name" }, k), el("b", {}, `+${n}`));
      return c;
    }));
    hooks.sheet(title, list, [["收下", () => resolve()]], () => resolve());
    setTimeout(() => { const r = list.getBoundingClientRect(); burst(r.left + r.width / 2, r.top + 20, "#f3dc98", 24); }, 200);
  });
}

// ———— 采集 ————

export function runGather(s: GameState, hooks: Hooks, done: () => void) {
  const p = s.p!;
  const g = LOCS[p.loc].gather!;
  const ov = el("div", { class: "gather-fx" }, el("div", { class: "gf-text" }, g.text), el("div", { class: "gf-bar" }, el("i", {})));
  document.body.append(ov);
  sfx("cloth");
  requestAnimationFrame(() => ((ov.querySelector(".gf-bar i") as HTMLElement).style.width = "100%"));
  setTimeout(async () => {
    ov.remove();
    advanceDays(p, g.days);
    const n = Math.random() < g.chance ? 1 + (Math.random() < 0.3 ? 1 : 0) : 0;
    if (n) give(p, g.item, n);
    mirror(s);
    autosave(s);
    if (n) await showRewards(hooks, "采集所得", [[g.item, n]]);
    else { hooks.sheet("一无所获", el("p", {}, "找了很久，什么也没找到。")); }
    done();
  }, 1600);
}

// ———— 商店 ————

export function openShop(s: GameState, rerender: () => void, hooks: Hooks) {
  const p = s.p!;
  const stock: string[] = LOCS[p.loc].shop ?? [];
  let tab: "buy" | "sell" = "buy";
  let close = () => {};
  const draw = () => {
    close();
    const money = el("div", { class: "shop-money" }, `灵石 ${p.stones}`);
    const tabs = el("div", { class: "shop-tabs" },
      ...(["buy", "sell"] as const).map((t) => {
        const b = el("button", { class: `tab ${tab === t ? "on" : ""}` }, t === "buy" ? "买" : "卖");
        b.addEventListener("click", () => { tab = t; sfx("page"); draw(); });
        return b;
      }));
    const rows = tab === "buy"
      ? stock.map((k) => {
          const d = ITEMS[k];
          const b = el("button", { class: "shop-row" }, el("b", {}, k), el("small", {}, d.desc), el("span", { class: "price" }, `${d.price} 灵石`));
          b.addEventListener("click", () => {
            if (p.stones < d.price) { sfx("miss"); floatText(b.getBoundingClientRect(), "灵石不够", "hurt"); return; }
            p.stones -= d.price;
            give(p, k, 1);
            sfx("get");
            floatText(b.getBoundingClientRect(), `+1 ${k}`, "prog");
            mirror(s); autosave(s);
            money.textContent = `灵石 ${p.stones}`;
          });
          return b;
        })
      : Object.entries(p.bag).filter(([k, n]) => n > 0 && ITEMS[k] && ITEMS[k].kind !== "法宝" && ITEMS[k].price > 0).map(([k, n]) => {
          const price = Math.max(1, Math.floor(ITEMS[k].price / 2));
          const b = el("button", { class: "shop-row" }, el("b", {}, `${k} ×${n}`), el("small", {}, ITEMS[k].desc), el("span", { class: "price" }, `卖 ${price}`));
          b.addEventListener("click", () => { give(p, k, -1); p.stones += price; sfx("count"); mirror(s); autosave(s); draw(); });
          return b;
        });
    close = hooks.sheet("钱记杂货铺", el("div", { class: "shop" }, money, tabs, el("div", { class: "shop-rows" }, ...rows)), [["离开", () => rerender()]]);
  };
  draw();
}

export { realmOf };
