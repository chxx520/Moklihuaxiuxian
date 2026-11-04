// 游戏模型：角色、日历、修为与境界、行囊、离线收益、剧本里的玩法指令。
import data from "../../content/game/data.json";
import type { GameState } from "../engine";
import type { Value } from "../parser";

export const DATA = data as any;
export type Realm = { id: number; name: string; stage: string; xp: number; life: number; rate: number; gate?: string };
export const REALMS: Realm[] = DATA.realms;
export type ItemDef = { icon: [number, number]; kind: string; price: number; desc: string; use?: { xp?: number; boost?: number }; battle?: { qi?: number; hp?: number; paper?: number }; equip?: Record<string, number | boolean> };
export const ITEMS: Record<string, ItemDef> = DATA.items;
export type TechDef = { kind: string; tier: string; speed: number; desc: string; element: string; bonus?: string; spells: string[] };
export const TECHS: Record<string, TechDef> = DATA.techniques;
export type LocDef = { x: number; y: number; scene: string; image: string; mood: string; desc: string; links: Record<string, number>; shop?: string[]; encounters?: string[]; gather?: { item: string; days: number; chance: number; text: string }; minRealm?: number; home?: string };
export const LOCS: Record<string, LocDef> = DATA.locations;
export const ELEMENTS: { id: string; color: string; desc: string }[] = DATA.roots.elements;
export const GRADES: { n: number; name: string; speed: number; weight: number }[] = DATA.roots.grades;

export type Player = {
  gender: "男" | "女";
  look: "甲" | "乙" | "丙";
  outfit: "凡人" | "弟子";
  root: string[];
  realm: number;
  xp: number;
  stones: number;
  bag: Record<string, number>;
  equip: string[];
  tech: string;
  techs: string[];
  loadout: string[];
  age: number;
  date: { y: number; m: number; d: number };
  loc: string;
  unlocked: string[];
  lastSeen: number;
  hp: number;
};

export function newPlayer(gender: Player["gender"], look: Player["look"], root: string[]): Player {
  return {
    gender, look, outfit: "凡人", root, realm: 0, xp: 0, stones: 3, bag: { 干粮: 2 }, equip: [],
    tech: "吐纳法", techs: ["吐纳法"], loadout: [], age: 16, date: { y: 1, m: 3, d: 1 }, loc: "白沙渡",
    unlocked: ["白沙渡"], lastSeen: Date.now(), hp: 12,
  };
}

/** 掷灵根：按权重决定几种属性，再随机抽属性 */
export function rollRoot(): string[] {
  const total = GRADES.reduce((a, g) => a + g.weight, 0);
  let r = Math.random() * total;
  const g = GRADES.find((x) => (r -= x.weight) < 0) ?? GRADES[4];
  const pool = ELEMENTS.map((e) => e.id).sort(() => Math.random() - 0.5);
  return pool.slice(0, g.n);
}
export const gradeOf = (root: string[]) => GRADES.find((g) => g.n === root.length)!;

export const realmOf = (p: Player) => REALMS[Math.min(p.realm, REALMS.length - 1)];
export const realmLabel = (p: Player) => { const r = realmOf(p); return r.stage ? `${r.name}${r.stage}` : r.name; };
export const lifespan = (p: Player) => realmOf(p).life;

/** 修炼倍率：境界 × 灵根 × 心法 */
export function cultMult(p: Player) {
  return realmOf(p).rate * gradeOf(p.root).speed * (TECHS[p.tech]?.speed ?? 1);
}
/** 在主界面挂机：每秒修为 */
export const idleRate = (p: Player) => 0.35 * cultMult(p);
/** 闭关：每天修为 */
export const dayRate = (p: Player) => 1.6 * cultMult(p);

export function addXp(p: Player, n: number) {
  const max = realmOf(p).xp;
  p.xp = Math.min(max, p.xp + n);
}
export const canBreak = (p: Player) => p.xp >= realmOf(p).xp && p.realm < REALMS.length - 1 && !realmOf(p).gate;
export function breakthrough(p: Player) {
  if (!canBreak(p)) return false;
  p.xp = 0;
  p.realm++;
  return true;
}

export const MONTHS = ["正", "二", "三", "四", "五", "六", "七", "八", "九", "十", "冬", "腊"];
export const SEASON = (m: number) => (m <= 3 ? "春" : m <= 6 ? "夏" : m <= 9 ? "秋" : "冬");
export const dateLabel = (p: Player) => `太初${cn(p.date.y)}年 · ${MONTHS[p.date.m - 1]}月`;
export function cn(n: number): string {
  const d = "〇一二三四五六七八九";
  if (n <= 10) return n === 10 ? "十" : d[n];
  if (n < 20) return "十" + d[n - 10];
  if (n < 100) return d[Math.floor(n / 10)] + "十" + (n % 10 ? d[n % 10] : "");
  return String(n);
}

/** 时间推进（天）。返回过了几年 */
export function advanceDays(p: Player, days: number) {
  let years = 0;
  p.date.d += days;
  while (p.date.d > 30) { p.date.d -= 30; p.date.m++; if (p.date.m > 12) { p.date.m = 1; p.date.y++; p.age++; years++; } }
  return years;
}

export const has = (p: Player, item: string, n = 1) => (p.bag[item] ?? 0) >= n;
export function give(p: Player, item: string, n = 1) {
  if (item === "灵石") { p.stones += n; return; }
  p.bag[item] = (p.bag[item] ?? 0) + n;
  if (p.bag[item] <= 0) delete p.bag[item];
  if (ITEMS[item]?.kind === "法宝" && n > 0 && !p.equip.includes(item) && p.equip.length < 3) p.equip.push(item);
}

/** 离线收益（真实时间，最多 8 小时，按挂机速度的 5%） */
export function offlineGain(p: Player, now = Date.now()) {
  const secs = Math.max(0, Math.min(8 * 3600, (now - (p.lastSeen || now)) / 1000));
  return { secs, xp: Math.floor(secs * idleRate(p) * 0.05) };
}

/** 战斗加成：心法、灵根、法宝 */
export function battleMods(p: Player) {
  const m = { hp: 0, talismanDmg: 0, shield: 0, regen: 0, atk: 0, qiChance: 0, firstHitHalf: false, paper: 0 };
  for (const e of p.equip) {
    const eq = ITEMS[e]?.equip ?? {};
    if (eq.hp) m.hp += Number(eq.hp);
    if (eq.talismanDmg) m.talismanDmg += Number(eq.talismanDmg);
    if (eq.firstHitHalf) m.firstHitHalf = true;
  }
  if (p.root.includes("金")) m.atk += 1;
  if (p.root.includes("木")) m.regen += 1;
  if (p.root.includes("土")) m.shield += 1;
  if (p.root.includes("水")) m.qiChance = 0.3;
  if (p.root.includes("火")) m.talismanDmg += 0;
  if (p.tech === "烈阳锻体功") { m.hp += 6; m.atk += 1; }
  if (p.tech === "青木长生诀") m.regen += 1;
  m.hp += Math.floor(p.realm * 1.5);
  return m;
}

/** 把角色状态写进剧本事实，剧本可以用条件判断（realm>=3、item.麦饼 等） */
export function mirror(s: GameState) {
  const p = s.p;
  if (!p) return;
  const f = s.facts;
  f.realm = p.realm;
  f.year = p.date.y;
  f.month = p.date.m;
  f.loc = p.loc;
  f.stones = p.stones;
  f.gender = p.gender;
  f.outfit = p.outfit;
  for (const k of Object.keys(f)) if (k.startsWith("item.")) delete f[k];
  for (const [k, v] of Object.entries(p.bag)) f[`item.${k}`] = v;
}

/** 剧本里的玩法指令：~ give 麦饼 1、~ xp 100、~ days 3、~ years 5、~ learn 留云符经、~ unlock 青石镇、~ loc 留云山、~ outfit 弟子、~ stones 10、~ month 9 */
export function applyAct(s: GameState, name: string, args: string): string | void {
  const p = s.p;
  if (!p) return;
  const [a, b] = args.split(/\s+/);
  const n = Number(b ?? a) || 0;
  switch (name) {
    case "give": give(p, a, Number(b) || 1); return `获得 ${a}${Number(b) > 1 ? " ×" + b : ""}`;
    case "take": give(p, a, -(Number(b) || 1)); return;
    case "stones": p.stones += n; return n > 0 ? `获得 灵石 ×${n}` : undefined;
    case "xp": addXp(p, n); return `修为 +${n}`;
    case "days": advanceDays(p, n); return;
    case "years": advanceDays(p, n * 360); return;
    case "month": { const m = Number(a); if (m) { while (p.date.m !== m) advanceDays(p, 30); } return; }
    case "learn": if (!p.techs.includes(a)) { p.techs.push(a); return `习得心法：${a}`; } return;
    case "tech": if (p.techs.includes(a)) p.tech = a; return;
    case "unlock": if (!p.unlocked.includes(a)) { p.unlocked.push(a); return `新地点：${a}`; } return;
    case "loc": p.loc = a; if (!p.unlocked.includes(a)) p.unlocked.push(a); return;
    case "outfit": p.outfit = a as Player["outfit"]; return;
    case "realm": if (p.realm < n) { p.realm = n; p.xp = 0; } return;
  }
}

export type GameEvent = { id: string; node: string; at?: string; when?: string; auto?: boolean; label?: string; repeat?: boolean };
