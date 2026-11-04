// 所在地主界面：资源栏、挂机修为、动态立绘、地点行动、功能入口，以及闭关、功法、行囊、人物面板。
import eventsData from "../../content/game/events.json";
import { figureHtml, sceneHtml, isMood, type Mood } from "../art";
import { findAsset } from "../assets";
import { ambienceFor, playMusic, setAmbience, sfx } from "../audio";
import { checkConds, type GameState } from "../engine";
import { burst, floatText, pillar, setWeather, shake, weatherFor } from "../fx";
import { animatePortrait } from "../live";
import { parseCond } from "../parser";
import { autosave } from "../save";
import { SPELLS, SPELL_ORDER } from "../spells";
import { el } from "../ui";
import { openMap, quickOrFight, runGather, openShop } from "./map";
import {
  addXp, advanceDays, breakthrough, canBreak, cultMult, dateLabel, dayRate, ELEMENTS, give, gradeOf, idleRate, ITEMS, LOCS,
  mirror, offlineGain, realmLabel, realmOf, REALMS, SEASON, TECHS, lifespan, type GameEvent, type Player,
} from "./model";

const EVENTS: GameEvent[] = (eventsData as any).events;

export type HubHooks = {
  runStory: (node: string) => void;
  openMenu: () => void;
  openJournal: () => void;
  sheet: (title: string, body: HTMLElement, actions?: [string, () => void][], onDismiss?: () => void) => () => void;
};

const $ = (s: string, r: ParentNode = document) => r.querySelector(s) as HTMLElement;

/** 事件条件：在剧本条件基础上，补充 xpfull（修为已满） */
function eventReady(s: GameState, ev: GameEvent) {
  if (ev.at && s.p!.loc !== ev.at) return false;
  if (!ev.repeat && s.done?.includes(ev.id)) return false;
  s.facts.xpfull = s.p!.xp >= realmOf(s.p!).xp;
  return checkConds(s, ev.when ? parseCond(ev.when) : undefined);
}

export function portraitKey(p: Player) {
  return `主角_${p.gender}_${p.look}_${p.outfit}`;
}

function itemIcon(name: string) {
  const def = ITEMS[name];
  const sheet = findAsset("items", "图标表_物品");
  const i = el("span", { class: `item-icon k-${def?.kind ?? "杂物"}` });
  if (sheet && def) {
    i.style.backgroundImage = `url("${sheet}")`;
    i.style.backgroundPosition = `${def.icon[1] * 25}% ${def.icon[0] * 25}%`;
    i.classList.add("sprite");
  } else i.textContent = name[0];
  return i;
}

const NAV: [string, string, number][] = [["闭关", "闭", 0], ["功法", "法", 1], ["行囊", "囊", 2], ["人物", "人", 7], ["地图", "图", 9], ["旧事录", "录", 8], ["菜单", "菜", 10]];

export class Hub {
  root = $("#hub");
  private s!: GameState;
  private timer = 0;
  private acc = 0;
  private live: { pulse(): void; stop(): void } | null = null;
  constructor(private hooks: HubHooks) {}

  get p() { return this.s.p!; }

  open(s: GameState, opts: { offline?: boolean } = {}) {
    this.s = s;
    s.mode = "hub";
    mirror(s);
    this.root.hidden = false;
    this.render();
    this.startIdle();
    if (opts.offline) this.offline();
    autosave(s);
    // 自动事件（延迟一点，先让玩家看见画面）
    setTimeout(() => this.checkAuto(), opts.offline ? 2200 : 700);
  }

  close() {
    clearInterval(this.timer);
    this.timer = 0;
    this.live?.stop();
    this.root.hidden = true;
  }

  private save() {
    this.p.lastSeen = Date.now();
    mirror(this.s);
    autosave(this.s);
  }

  private checkAuto() {
    if (this.root.hidden) return;
    const ev = EVENTS.find((e) => e.auto && eventReady(this.s, e));
    if (ev) this.fire(ev);
  }

  private fire(ev: GameEvent) {
    if (!ev.repeat) this.s.done = [...(this.s.done ?? []), ev.id];
    this.save();
    this.close();
    this.hooks.runStory(ev.node);
  }

  // ———— 挂机修为：每秒增长，修为满了出现「突破」 ————
  private startIdle() {
    clearInterval(this.timer);
    let lastFx = 0;
    this.timer = window.setInterval(() => {
      if (document.hidden || this.root.hidden) return;
      const p = this.p;
      const before = p.xp;
      this.acc += idleRate(p);
      if (this.acc >= 1) {
        const n = Math.floor(this.acc);
        this.acc -= n;
        addXp(p, n);
      }
      if (p.xp !== before) {
        this.updateBars();
        if (Date.now() - lastFx > 2600) {
          lastFx = Date.now();
          const fig = $(".hub-fig", this.root);
          if (fig) floatText(fig.getBoundingClientRect(), `修为 +${Math.max(1, Math.round(idleRate(p) * 2.6))}`, "prog");
        }
      }
      if (p.xp >= realmOf(p).xp) { this.updateBars(); this.checkAuto(); }
      p.lastSeen = Date.now();
    }, 1000);
  }

  private updateBars() {
    const p = this.p;
    const r = realmOf(p);
    const bar = $(".xp-bar i", this.root);
    const txt = $(".xp-bar b", this.root);
    if (bar) bar.style.width = `${Math.min(100, (p.xp / r.xp) * 100)}%`;
    if (txt) txt.textContent = r.gate ? "圆满" : `${Math.floor(p.xp)} / ${r.xp}`;
    const bt = $(".break-btn", this.root);
    if (bt) bt.hidden = !canBreak(p);
    const st = $(".res-stones", this.root);
    if (st) st.textContent = String(p.stones);
  }

  render() {
    const p = this.p;
    const loc = LOCS[p.loc];
    const mood = (isMood(loc.mood) ? loc.mood : "day") as Mood;
    const night = false;
    const r = realmOf(p);

    const top = el("div", { class: "hub-top" },
      el("div", { class: "realm-plaque" }, el("span", {}, realmLabel(p))),
      el("div", { class: "xp-bar" }, el("i", { style: `width:${Math.min(100, (p.xp / r.xp) * 100)}%` }), el("b", {}, r.gate ? "圆满" : `${Math.floor(p.xp)} / ${r.xp}`)),
      el("div", { class: "res-row" },
        el("span", { class: "res" }, el("i", { class: "ri ri-stone" }), el("span", { class: "res-stones" }, String(p.stones))),
        el("span", { class: "res" }, el("i", { class: "ri ri-life" }), `${p.age} / ${lifespan(p)}`),
        el("span", { class: "res date" }, el("i", { class: "ri ri-moon" }), `${dateLabel(p)} · ${SEASON(p.date.m)}`),
      ),
    );

    const scene = el("div", { class: "hub-scene art-fill" });
    scene.innerHTML = `<div class="layer in">${sceneHtml(loc.scene, mood, "", loc.image)}</div>`;

    const fig = el("div", { class: "hub-fig" });
    fig.innerHTML = figureHtml(portraitKey(p));
    const qi = el("div", { class: "qi-motes" }, ...Array.from({ length: 10 }, (_, i) => el("i", { style: `--d:${(i * 0.37) % 3}s;--x:${(i * 37) % 100}%` })));

    const locName = el("div", { class: "hub-loc" }, el("span", { class: "hub-loc-name" }, p.loc), el("span", { class: "hub-loc-desc" }, loc.desc));

    // 地点行动
    const acts: HTMLElement[] = [];
    const evs = EVENTS.filter((e) => !e.auto && e.label && eventReady(this.s, e));
    for (const ev of evs) acts.push(this.actBtn(ev.label!, "event", () => this.fire(ev)));
    if (loc.home && p.outfit === "弟子") acts.push(this.actBtn("回洞府闭关", "home", () => this.openRetreat(true)));
    if (loc.encounters) acts.push(this.actBtn("探索", "explore", () => this.explore()));
    if (loc.gather) acts.push(this.actBtn(`采集·${loc.gather.item}`, "gather", () => this.gather()));
    if (loc.shop) acts.push(this.actBtn("钱记杂货铺", "shop", () => openShop(this.s, () => this.render(), this.hooks)));
    acts.push(this.actBtn("出发", "travel", () => this.openMap()));

    const goal = el("div", { class: "hub-goal" }, el("span", { class: "goal-tag" }, "目标"), el("span", {}, this.s.goal ?? "四处走走"));

    const breakBtn = el("button", { class: "break-btn" }, el("span", {}, r.gate ? "瓶颈" : "突破"));
    breakBtn.hidden = !canBreak(p);
    breakBtn.addEventListener("click", () => this.doBreak());

    const nav = el("nav", { class: "hub-nav" }, ...NAV.map(([label, glyph, idx]) => {
      const b = el("button", { class: "nav-btn" });
      const sheet = findAsset("ui", "图标表_功能");
      const ic = el("span", { class: "nav-ic", "data-glyph": glyph });
      if (sheet) {
        const pos = `${(idx % 4) * 33.333}% ${Math.floor(idx / 4) * 50}%`;
        ic.style.setProperty("--nav-sheet-img", `url("${sheet}")`);
        ic.style.setProperty("--nav-pos", pos);
        ic.classList.add("sprite");
      } else ic.textContent = glyph;
      b.append(ic, el("span", { class: "nav-label" }, label));
      b.addEventListener("click", () => this.nav(label));
      return b;
    }));

    this.root.replaceChildren(scene, qi, fig, top, locName, goal, el("div", { class: "hub-acts" }, ...acts), breakBtn, nav);
    setWeather(this.root, weatherFor(loc.scene, mood, loc.image));
    setAmbience(ambienceFor(loc.scene, night ? "night" : mood, loc.image));
    playMusic(loc.home ? "山门" : p.loc === "雾隐林" || p.loc === "断崖" ? "回忆" : "村庄");

    const img = fig.querySelector("img.portrait") as HTMLImageElement | null;
    this.live?.stop();
    this.live = img ? animatePortrait(img, { sway: 1.1 }) : null;
    // 点击立绘：吐纳，主动增加修为（有短暂冷却）
    let lastTap = 0;
    fig.addEventListener("click", (e) => {
      const now = Date.now();
      if (now - lastTap < 350) return;
      lastTap = now;
      this.live?.pulse();
      const gain = Math.max(1, Math.round(cultMult(p) * 1.5));
      addXp(p, gain);
      sfx("cloth");
      floatText(new DOMRect(e.clientX - 10, e.clientY - 20, 20, 20), `+${gain}`, "prog");
      burst(e.clientX, e.clientY, "#bfeefa", 8);
      this.updateBars();
      if (canBreak(p) || p.xp >= realmOf(p).xp) this.checkAuto();
    });
  }

  private actBtn(label: string, kind: string, fn: () => void) {
    const b = el("button", { class: `act-btn a-${kind}` }, el("span", {}, label));
    b.addEventListener("click", () => { sfx("page"); fn(); });
    return b;
  }

  private nav(label: string) {
    switch (label) {
      case "闭关": return this.openRetreat(!!LOCS[this.p.loc].home);
      case "功法": return this.openTech();
      case "行囊": return this.openBag();
      case "人物": return this.openChar();
      case "地图": return this.openMap();
      case "旧事录": return this.hooks.openJournal();
      case "菜单": return this.hooks.openMenu();
    }
  }

  private openMap() {
    openMap(this.s, (dest) => {
      this.save();
      this.render();
      if (dest) setTimeout(() => this.checkAuto(), 500);
    }, this.hooks);
  }

  private async explore() {
    const loc = LOCS[this.p.loc];
    if (loc.minRealm && this.p.realm < loc.minRealm) { this.hooks.sheet("太危险了", el("p", {}, `这里的东西不是现在的你能应付的。（需要${realmLabel({ ...this.p, realm: loc.minRealm } as Player)}）`)); return; }
    advanceDays(this.p, 1);
    this.close();
    await quickOrFight(this.s, loc.encounters![Math.floor(Math.random() * loc.encounters!.length)], this.hooks);
    this.open(this.s);
  }

  private gather() {
    this.close();
    runGather(this.s, this.hooks, () => this.open(this.s));
  }

  // ———— 突破 ————
  private doBreak() {
    const p = this.p;
    if (!canBreak(p)) return;
    const from = realmLabel(p);
    breakthrough(p);
    this.save();
    sfx("breakthrough");
    pillar("#f3e2a0");
    shake(this.root, 10);
    const fig = $(".hub-fig", this.root);
    if (fig) { const r = fig.getBoundingClientRect(); burst(r.left + r.width / 2, r.top + r.height * 0.4, "#f3dc98", 40); }
    const card = el("div", { class: "break-card" },
      el("div", { class: "bc-from" }, from),
      el("div", { class: "bc-arrow" }, "▼"),
      el("div", { class: "bc-to" }, realmLabel(p)),
      el("div", { class: "bc-note" }, `寿元上限 ${lifespan(p)} · 修炼速度 ×${cultMult(p).toFixed(2)}`),
    );
    this.root.append(card);
    setTimeout(() => { card.classList.add("out"); setTimeout(() => card.remove(), 600); }, 2400);
    setTimeout(() => this.render(), 300);
    setTimeout(() => this.checkAuto(), 2800);
  }

  // ———— 离线修炼 ————
  private offline() {
    const g = offlineGain(this.p);
    if (g.xp < 1) return;
    addXp(this.p, g.xp);
    this.save();
    const h = Math.floor(g.secs / 3600), m = Math.floor((g.secs % 3600) / 60);
    const num = el("b", { class: "ol-num" }, "0");
    this.hooks.sheet("离线修炼", el("div", { class: "offline" },
      el("p", {}, `你离开的 ${h ? h + " 小时 " : ""}${m} 分钟里，周天自行运转。`),
      el("div", { class: "ol-gain" }, "修为 +", num),
      el("p", { class: "dim" }, "离线最多累积 8 小时。"),
    ), [["收下", () => this.render()]]);
    sfx("count");
    const t0 = performance.now();
    const tick = (t: number) => { const k = Math.min(1, (t - t0) / 1200); num.textContent = String(Math.floor(g.xp * k)); if (k < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }

  // ———— 闭关 ————
  openRetreat(atHome: boolean) {
    const p = this.p;
    const opts: [string, number][] = [["一月", 30], ["三月", 90], ["一年", 360], ["三年", 1080]];
    const mult = atHome ? 1 : 0.6;
    const hasPill = (p.bag["辟谷丹"] ?? 0) > 0;
    let usePill = false;
    const pillToggle = el("label", { class: "pill-toggle" }, el("input", { type: "checkbox" }), ` 服用辟谷丹（收益 +50%，持有 ${p.bag["辟谷丹"] ?? 0}）`);
    (pillToggle.querySelector("input") as HTMLInputElement).disabled = !hasPill;
    pillToggle.querySelector("input")!.addEventListener("change", (e) => (usePill = (e.target as HTMLInputElement).checked));
    const body = el("div", { class: "retreat" },
      el("p", {}, atHome ? "洞府灵气充裕，适合长久闭关。" : "此地不是洞府，闭关收益只有六成。"),
      el("p", { class: "dim" }, `每日约得修为 ${Math.round(dayRate(p) * mult)}。闭关期间时间会流逝，山下的人也会老去。`),
      hasPill ? pillToggle : "",
      el("div", { class: "retreat-opts" }, ...opts.map(([label, days]) => {
        const b = el("button", { class: "choice" }, el("span", {}, `闭关${label}`), el("small", {}, `约 +${Math.round(dayRate(p) * mult * days)} 修为`));
        b.addEventListener("click", () => { close(); this.retreat(days, mult * (usePill ? 1.5 : 1), usePill); });
        return b;
      })),
    );
    const close = this.hooks.sheet("闭关", body);
  }

  private retreat(days: number, mult: number, usedPill: boolean) {
    const p = this.p;
    if (usedPill) give(p, "辟谷丹", -1);
    const gain = Math.round(dayRate(p) * mult * days);
    const startXp = p.xp, startDate = { ...p.date };
    const ov = el("div", { class: "retreat-fx" },
      el("div", { class: "rf-ring" }), el("div", { class: "rf-ring r2" }),
      el("div", { class: "rf-fig" }),
      el("div", { class: "rf-date" }), el("div", { class: "rf-xp" }),
    );
    (ov.querySelector(".rf-fig") as HTMLElement).innerHTML = figureHtml(portraitKey(p));
    for (let i = 0; i < 26; i++) ov.append(el("i", { class: "rf-mote", style: `--a:${i * 13.8}deg;--d:${(i * 0.11) % 1.6}s` }));
    document.body.append(ov);
    sfx("cast");
    playMusic("回忆");
    const dur = 2600;
    const t0 = performance.now();
    const tmp = { ...p, date: { ...startDate } } as Player;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / dur);
      const d = Math.floor(days * k);
      tmp.date = { ...startDate };
      advanceDays(tmp, d);
      (ov.querySelector(".rf-date") as HTMLElement).textContent = `${dateLabel(tmp)}`;
      (ov.querySelector(".rf-xp") as HTMLElement).textContent = `修为 +${Math.round(gain * k)}`;
      if (k < 1) requestAnimationFrame(step);
      else finish();
    };
    const finish = () => {
      advanceDays(p, days);
      // 闭关期间修为满了，自动冲破小境界（不会冲破大境界的瓶颈）
      const from = realmLabel(p);
      let pool = startXp + gain, breaks = 0;
      while (pool >= realmOf(p).xp && p.realm < REALMS.length - 1 && !realmOf(p).gate) { pool -= realmOf(p).xp; p.realm++; breaks++; }
      p.xp = Math.min(pool, realmOf(p).xp);
      this.save();
      sfx(breaks ? "breakthrough" : "get");
      setTimeout(() => {
        ov.classList.add("out");
        setTimeout(() => ov.remove(), 600);
        this.render();
        if (breaks) {
          pillar("#f3e2a0");
          const card = el("div", { class: "break-card" },
            el("div", { class: "bc-from" }, `出关 · ${from}`), el("div", { class: "bc-arrow" }, "▼"),
            el("div", { class: "bc-to" }, realmLabel(p)),
            el("div", { class: "bc-note" }, breaks > 1 ? `闭关${days >= 360 ? Math.round(days / 360) + "年" : Math.round(days / 30) + "月"}，连破 ${breaks} 层` : "闭关期间，水到渠成"),
          );
          this.root.append(card);
          setTimeout(() => { card.classList.add("out"); setTimeout(() => card.remove(), 600); }, 2400);
          setTimeout(() => this.checkAuto(), 2800);
        } else this.checkAuto();
      }, 500);
    };
    requestAnimationFrame(step);
  }

  // ———— 功法 ————
  private openTech() {
    const p = this.p;
    const learned = SPELL_ORDER.filter((n) => this.s.spells.includes(n));
    if (!p.loadout.length) p.loadout = learned.slice(0, 6);
    const techList = el("div", { class: "tech-list" }, ...p.techs.map((t) => {
      const d = TECHS[t];
      const c = el("div", { class: `tech-card ${t === p.tech ? "on" : ""}` },
        el("div", { class: "tech-name" }, el("span", { class: "tier" }, d.tier), t),
        el("div", { class: "tech-desc" }, d.desc),
        el("div", { class: "dim" }, `修炼速度 ×${d.speed}${d.element ? ` · ${d.element}属` : ""}`),
      );
      c.addEventListener("click", () => { p.tech = t; sfx("power"); this.save(); close(); this.openTech(); this.render(); });
      return c;
    }));
    const spellGrid = el("div", { class: "spell-grid" }, ...(learned.length ? learned : []).map((n) => {
      const sp = SPELLS[n];
      const on = p.loadout.includes(n);
      const c = el("button", { class: `spell-cell k-${sp.kind} ${on ? "on" : ""}` }, el("b", {}, n), el("small", {}, sp.brief));
      c.addEventListener("click", () => {
        if (on) p.loadout = p.loadout.filter((x) => x !== n);
        else if (p.loadout.length < 6) p.loadout.push(n);
        sfx("page");
        this.save();
        close();
        this.openTech();
      });
      return c;
    }));
    const close = this.hooks.sheet("功法", el("div", {},
      el("h3", {}, "主修心法（点选切换）"), techList,
      el("h3", {}, `带入战斗的术法（${p.loadout.length} / 6）`),
      learned.length ? spellGrid : el("p", { class: "dim" }, "还没有学会任何术法。"),
    ));
  }

  // ———— 行囊 ————
  private openBag() {
    const p = this.p;
    const items = Object.entries(p.bag).filter(([, n]) => n > 0);
    const grid = el("div", { class: "bag-grid" },
      el("div", { class: "bag-cell stone" }, itemIcon("灵石"), el("b", {}, String(p.stones)), el("small", {}, "灵石")),
      ...items.map(([k, n]) => {
        const c = el("button", { class: `bag-cell ${p.equip.includes(k) ? "equipped" : ""}` }, itemIcon(k), el("b", {}, `×${n}`), el("small", {}, k));
        c.addEventListener("click", () => this.itemDetail(k, close));
        return c;
      }),
    );
    const close = this.hooks.sheet("行囊", el("div", {}, grid, items.length ? "" : el("p", { class: "dim" }, "行囊空空。")));
  }

  private itemDetail(k: string, closeBag: () => void) {
    const p = this.p;
    const d = ITEMS[k];
    const actions: [string, () => void][] = [];
    if (d?.use?.xp) actions.push(["服用", () => {
      give(p, k, -1);
      addXp(p, d.use!.xp!);
      sfx("power");
      this.save();
      this.render();
      closeBag();
      const fig = $(".hub-fig", this.root);
      if (fig) floatText(fig.getBoundingClientRect(), `修为 +${d.use!.xp}`, "prog");
    }]);
    if (d?.kind === "法宝") actions.push([p.equip.includes(k) ? "卸下" : "佩戴", () => {
      p.equip = p.equip.includes(k) ? p.equip.filter((x) => x !== k) : [...p.equip, k].slice(-3);
      sfx("power");
      this.save();
      closeBag();
      this.openBag();
    }]);
    this.hooks.sheet(k, el("div", { class: "item-detail" }, itemIcon(k), el("div", {}, el("p", { class: "dim" }, `${d?.kind ?? ""} · 持有 ${p.bag[k] ?? 0}`), el("p", {}, d?.desc ?? ""))), actions);
  }

  // ———— 人物 ————
  private openChar() {
    const p = this.p;
    const g = gradeOf(p.root);
    const fig = el("div", { class: "char-fig" });
    fig.innerHTML = figureHtml(portraitKey(p));
    const body = el("div", { class: "char" },
      fig,
      el("div", { class: "char-info" },
        el("div", { class: "char-name" }, this.s.name),
        el("div", { class: "kv" }, el("span", {}, "境界"), el("b", {}, realmLabel(p))),
        el("div", { class: "kv" }, el("span", {}, "灵根"), el("b", {}, g.name, " ", ...p.root.map((r) => el("i", { class: "root-chip", style: `--c:${ELEMENTS.find((e) => e.id === r)!.color}` }, r)))),
        el("div", { class: "kv" }, el("span", {}, "心法"), el("b", {}, p.tech)),
        el("div", { class: "kv" }, el("span", {}, "年岁"), el("b", {}, `${p.age} / 寿元 ${lifespan(p)}`)),
        el("div", { class: "kv" }, el("span", {}, "修炼"), el("b", {}, `挂机 ${idleRate(p).toFixed(2)}/秒 · 闭关 ${Math.round(dayRate(p))}/日`)),
        el("div", { class: "kv" }, el("span", {}, "法宝"), el("b", {}, p.equip.length ? p.equip.join("、") : "无")),
        el("p", { class: "dim" }, p.root.map((r) => `${r}：${ELEMENTS.find((e) => e.id === r)!.desc}`).join("　")),
      ),
    );
    this.hooks.sheet("人物", body);
  }
}

export { REALMS };
