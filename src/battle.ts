// 回合制术法挑战：逻辑 + 界面。数据在 content/battles.json。
import data from "../content/battles.json";
import { enemyArt } from "./art";
import { sfx } from "./audio";
import { SPELLS, SPELL_ORDER, type Spell } from "./spells";
import { el } from "./ui";

type EnemyDef = { name: string; hp: number; pattern: string[]; hidden?: boolean; immune?: boolean; art?: string };
type RitualAction = { name: string; cost: number; progress: number; perTurn?: number; desc: string };
type BattleDef = {
  title: string;
  goal: string;
  kind: "defeat" | "ritual" | "break";
  hp: number;
  paper?: number;
  turns?: number;
  ally?: { name: string; hp: number };
  object?: { name: string; hp: number; breakable?: boolean };
  ritual?: { name: string; target: number; auto?: "allyUnharmed"; knot?: boolean; actions?: RitualAction[] };
  barrier?: number;
  enemies: (string | EnemyDef)[];
  spawns?: Record<string, string[]>;
  tips?: Record<string, string>;
};

type Intent =
  | { k: "attack"; who: "player" | "ally" | "object"; dmg: number }
  | { k: "hide" }
  | { k: "summon"; what: string }
  | { k: "pulse"; dmg: number }
  | { k: "wait" };

type Enemy = {
  uid: number; def: EnemyDef; hp: number; hidden: boolean; stunned: boolean; step: number; intent: Intent; dead: boolean;
};
type Unit = { name: string; hp: number; max: number; shield: number };

export type BattleResult = { win: boolean; objectHp: number; allyHurt: boolean; turns: number; retries: number; broke: number };

const BESTIARY = (data as any).bestiary as Record<string, EnemyDef>;
const BATTLES = (data as any).battles as Record<string, BattleDef>;

export function battleIds() {
  return Object.keys(BATTLES);
}

function parseIntent(s: string): Intent {
  const [k, a, b] = s.split(":");
  if (k === "attack") return { k, who: a as any, dmg: Number(b) };
  if (k === "summon") return { k, what: a };
  if (k === "pulse") return { k, dmg: Number(a) };
  if (k === "hide") return { k };
  return { k: "wait" };
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

class Battle {
  def: BattleDef;
  player: Unit;
  ally?: Unit;
  object?: Unit;
  enemies: Enemy[] = [];
  turn = 0;
  qi = 0;
  paper: number;
  progress = 0;
  light = 0;
  senseUsed = false;
  sensed = false;
  knot = "";
  usedThisTurn: Record<string, number> = {};
  allyHurtThisTurn = false;
  allyHurt = false;
  broke = 0;
  uid = 0;
  log: string[] = [];
  objectBroken = false;

  constructor(def: BattleDef, private spells: string[], private assist: number) {
    this.def = def;
    this.player = { name: "你", hp: def.hp + assist * 4, max: def.hp + assist * 4, shield: 0 };
    if (def.ally) this.ally = { name: def.ally.name, hp: def.ally.hp + assist * 2, max: def.ally.hp + assist * 2, shield: 0 };
    if (def.object) this.object = { name: def.object.name, hp: def.object.hp + assist * 2, max: def.object.hp + assist * 2, shield: 0 };
    this.paper = (def.paper ?? 2) + assist;
    def.enemies.forEach((e) => this.spawn(e));
  }

  spawn(e: string | EnemyDef) {
    const d = typeof e === "string" ? BESTIARY[e] : e;
    if (!d) throw new Error(`图鉴里没有：${e}`);
    const en: Enemy = { uid: ++this.uid, def: d, hp: d.hp, hidden: !!d.hidden, stunned: false, step: 0, intent: parseIntent(d.pattern[0]), dead: false };
    this.enemies.push(en);
    return en;
  }

  get alive() {
    return this.enemies.filter((e) => !e.dead);
  }

  get qiPerTurn() {
    return 3 + this.assist;
  }

  hand(): Spell[] {
    return SPELL_ORDER.filter((n) => this.spells.includes(n)).map((n) => SPELLS[n]);
  }

  startTurn() {
    this.turn++;
    this.qi = this.qiPerTurn;
    this.senseUsed = false;
    this.sensed = false;
    this.usedThisTurn = {};
    this.allyHurtThisTurn = false;
    const sp = this.def.spawns?.[String(this.turn)];
    if (sp && this.turn > 1) sp.forEach((s) => { this.spawn(s); this.say(`暗处又爬出一只${BESTIARY[s]?.name ?? s}。`); });
    if (this.def.ritual?.knot) {
      const acts = this.def.ritual.actions!;
      this.knot = acts[Math.floor(Math.random() * acts.length)].name;
    }
  }

  say(t: string) {
    this.log.push(t);
    if (this.log.length > 3) this.log.shift();
  }

  hurt(u: Unit, dmg: number) {
    const absorbed = Math.min(u.shield, dmg);
    u.shield -= absorbed;
    const real = dmg - absorbed;
    u.hp = Math.max(0, u.hp - real);
    return { absorbed, real };
  }

  canCast(s: Spell) {
    if (s.name === "辨气术" && this.senseUsed) return "这回合已经看过了";
    if (this.qi < s.cost) return "灵力不够";
    if ((s.paper ?? 0) > this.paper) return "符纸不够";
    if (s.target === "enemy" && !this.alive.some((e) => this.targetable(s, e))) return "没有可以施放的目标";
    return "";
  }

  targetable(s: Spell, e: Enemy) {
    if (e.dead || e.hidden) return false;
    if (s.name !== "定身符" && e.def.immune) return false;
    return true;
  }

  cast(s: Spell, target?: Enemy | Unit) {
    this.qi -= s.cost;
    this.paper -= s.paper ?? 0;
    switch (s.name) {
      case "驱邪符":
      case "破煞符": {
        const e = target as Enemy;
        const dmg = s.name === "驱邪符" ? 3 : 6;
        e.hp = Math.max(0, e.hp - dmg);
        sfx(s.name === "驱邪符" ? "hit" : "burst");
        this.say(`${s.name}击中${e.def.name}，${dmg} 点。`);
        if (s.name === "破煞符") {
          this.broke++;
          if (this.object) {
            const r = this.hurt(this.object, 2);
            this.say(r.real ? `煞气波及${this.object.name}，${r.real} 点。` : `护身符挡住了波及${this.object.name}的煞气。`);
          }
        }
        if (e.hp <= 0) { e.dead = true; this.say(`${e.def.name}散了。`); }
        break;
      }
      case "护身符": {
        const u = target as Unit;
        u.shield += 3;
        sfx("shield");
        this.say(`护身符护住了${u.name === "你" ? "自己" : u.name}。`);
        break;
      }
      case "定身符": {
        const e = target as Enemy;
        e.stunned = true;
        sfx("seal");
        this.say(`${e.def.name}被定住了，下次行动作废。`);
        break;
      }
      case "明灯符": {
        let n = 0;
        this.alive.forEach((e) => { if (e.hidden) { e.hidden = false; n++; } });
        this.light = 2;
        sfx("light");
        this.say(n ? `灯光照出了 ${n} 个藏在暗处的影子。` : "灯光亮起，暗处一时无处可藏。");
        break;
      }
      case "辨气术": {
        this.senseUsed = true;
        this.sensed = true;
        sfx("sense");
        this.say(this.def.ritual?.knot ? `你看清了：它此刻的心结在「${this.knot}」。` : "你看清了暗处的气息流向。");
        break;
      }
    }
  }

  canAct(a: RitualAction) {
    if (this.qi < a.cost) return "灵力不够";
    if ((this.usedThisTurn[a.name] ?? 0) >= (a.perTurn ?? 99)) return "这回合不能再做了";
    if (this.def.ritual?.knot && Object.keys(this.usedThisTurn).length >= 1) return "这回合已经做过一次了";
    return "";
  }

  act(a: RitualAction) {
    this.qi -= a.cost;
    this.usedThisTurn[a.name] = (this.usedThisTurn[a.name] ?? 0) + 1;
    if (this.def.ritual?.knot && a.name !== this.knot) {
      sfx("miss");
      this.say(`「${a.name}」落了空——它此刻要的不是这个。`);
      return;
    }
    this.progress = Math.min(this.def.ritual!.target, this.progress + a.progress);
    sfx("brush");
    this.say(`「${a.name}」，${this.def.ritual!.name}推进了一步。`);
  }

  async enemyPhase(render: () => void) {
    for (const e of this.alive) {
      if (this.checkEnd()) return;
      if (e.stunned) {
        e.stunned = false;
        this.say(`${e.def.name}挣不开定身符。`);
      } else {
        const it = e.intent;
        if (it.k === "attack") {
          const tgt = it.who === "ally" && this.ally ? this.ally : it.who === "object" && this.object ? this.object : this.player;
          const r = this.hurt(tgt, it.dmg);
          if (tgt === this.ally && r.real > 0) { this.allyHurtThisTurn = true; this.allyHurt = true; }
          sfx(r.real ? "thud" : "block");
          this.say(r.real ? `${e.def.name}扑向${tgt === this.player ? "你" : tgt.name}，${r.real} 点。` : `${e.def.name}撞在护身符上。`);
        } else if (it.k === "hide") {
          if (this.light > 0) this.say(`${e.def.name}想钻进暗处，被灯光逼了回来。`);
          else { e.hidden = true; this.say(`${e.def.name}缩进了暗处。`); }
        } else if (it.k === "summon") {
          this.spawn(it.what);
          sfx("summon");
          this.say(`${e.def.name}唤出了一只${BESTIARY[it.what]?.name ?? it.what}。`);
        } else if (it.k === "pulse") {
          [this.player, this.ally, this.object].forEach((u) => u && this.hurt(u, it.dmg));
          if (this.ally) this.allyHurtThisTurn = true;
          sfx("thud");
          this.say(`${e.def.name}震荡开来，所有人受到 ${it.dmg} 点冲击。`);
        }
      }
      e.step = (e.step + 1) % e.def.pattern.length;
      e.intent = parseIntent(e.def.pattern[e.step]);
      render();
      await wait(520);
    }
    [this.player, this.ally, this.object].forEach((u) => u && (u.shield = 0));
    if (this.light > 0) this.light--;
    if (this.def.ritual?.auto === "allyUnharmed" && this.ally && this.ally.hp > 0) {
      if (!this.allyHurtThisTurn) {
        this.progress = Math.min(this.def.ritual.target, this.progress + 1);
        this.say(`${this.ally.name}平安念完了一段。`);
      } else this.say(`${this.ally.name}被打断了，这一段要重念。`);
    }
    if (this.object && this.object.hp <= 0 && this.def.object?.breakable && !this.objectBroken) {
      this.objectBroken = true;
      sfx("crack");
      this.say(`${this.object.name}裂开了。`);
    }
  }

  /** 返回 "win" / "lose" / "" */
  checkEnd(): string {
    if (this.player.hp <= 0) return "lose";
    if (this.ally && this.ally.hp <= 0) return "lose";
    if (this.object && this.object.hp <= 0 && !this.def.object?.breakable) return "lose";
    const k = this.def.kind;
    if (k === "defeat") {
      const pending = Object.keys(this.def.spawns ?? {}).some((t) => Number(t) > this.turn);
      if (!this.alive.length && !pending) return "win";
    }
    if (k === "ritual" && this.progress >= this.def.ritual!.target) return "win";
    if (k === "break" && this.enemies[this.def.barrier ?? 0].dead) return "win";
    return "";
  }

  outOfTurns() {
    return !!this.def.turns && this.turn >= this.def.turns;
  }
}

// ———— 界面 ————

function intentText(b: Battle, e: Enemy): { text: string; cls: string } {
  if (e.hidden && !b.sensed) return { text: "？", cls: "unknown" };
  if (e.stunned) return { text: "被定住", cls: "stun" };
  const it = e.intent;
  const who = (w: string) => (w === "ally" ? b.ally?.name ?? "你" : w === "object" ? b.object?.name ?? "你" : "你");
  switch (it.k) {
    case "attack": return { text: `扑向${who(it.who)} ${it.dmg}`, cls: it.who === "player" ? "atk" : "atk-other" };
    case "hide": return { text: "潜入暗处", cls: "hide" };
    case "summon": return { text: "呼唤同伴", cls: "summon" };
    case "pulse": return { text: `震荡 ${it.dmg}`, cls: "atk" };
    default: return { text: "等待", cls: "" };
  }
}

function bar(cur: number, max: number, cls = "") {
  const pct = Math.max(0, Math.min(100, (cur / max) * 100));
  return el("div", { class: `bar ${cls}` }, el("i", { style: `width:${pct}%` }), el("b", {}, `${cur}/${max}`));
}

export function runBattle(id: string, spells: string[]): Promise<BattleResult> {
  const def = BATTLES[id];
  if (!def) return Promise.reject(new Error(`没有这个挑战：${id}`));
  let retries = 0;

  return new Promise((resolve) => {
    const root = el("div", { class: "battle" });
    document.getElementById("game")!.append(root);

    const start = (assist: number) => {
      const b = new Battle(def, spells, assist);
      let pending: { spell: Spell } | null = null;
      let busy = false;
      const shownTips = new Set<string>();

      const tip = (text: string) => {
        const t = el("div", { class: "b-tip" }, el("div", {}, text), el("button", { class: "choice" }, el("span", {}, "明白")));
        t.querySelector("button")!.addEventListener("click", () => t.remove());
        root.append(t);
      };

      const render = () => {
        const head = el("div", { class: "b-head" },
          el("div", { class: "b-title" }, el("span", { class: "seal" }, def.title), el("span", { class: "b-turn" }, def.turns ? `第 ${b.turn} / ${def.turns} 回合` : `第 ${b.turn} 回合`)),
          el("div", { class: "b-goal" }, def.goal),
        );

        const foes = el("div", { class: "b-foes" }, ...b.enemies.filter((e) => !e.dead || false).map((e) => {
          const it = intentText(b, e);
          const target = pending && pending.spell.target === "enemy" && b.targetable(pending.spell, e);
          const card = el("div", { class: `foe ${e.hidden ? "hidden" : ""} ${target ? "targetable" : ""} ${e.def.immune ? "immune" : ""}` },
            el("div", { class: `intent ${it.cls}` }, it.text),
            el("div", { class: "foe-art" }),
            el("div", { class: "foe-name" }, e.hidden ? "暗处" : e.def.name),
            e.def.immune ? el("div", { class: "foe-immune" }, "杀不死") : bar(e.hp, e.def.hp, "foe-hp"),
          );
          (card.querySelector(".foe-art") as HTMLElement).innerHTML = enemyArt(e.def.art ?? e.def.name);
          if (target) card.addEventListener("click", () => doCast(pending!.spell, e));
          return card;
        }));

        const guards: HTMLElement[] = [];
        const guardCard = (u: Unit, label: string) => {
          const target = pending?.spell.target === "guard";
          const c = el("div", { class: `guard ${target ? "targetable" : ""}` },
            el("div", { class: "guard-name" }, label, u.shield ? el("span", { class: "shield" }, ` 盾${u.shield}`) : ""),
            bar(u.hp, u.max, u === b.player ? "hp" : "hp2"),
          );
          if (target) c.addEventListener("click", () => doCast(pending!.spell, u));
          return c;
        };
        if (b.ally) guards.push(guardCard(b.ally, b.ally.name));
        if (b.object) guards.push(guardCard(b.object, b.objectBroken ? `${b.object.name}（已裂）` : b.object.name));

        const ritual = def.ritual
          ? el("div", { class: "b-ritual" },
              el("span", {}, def.ritual.name),
              bar(b.progress, def.ritual.target, "prog"),
              def.ritual.knot ? el("span", { class: "knot" }, b.sensed ? `心结：${b.knot}` : "心结：？") : "",
            )
          : "";

        const log = el("div", { class: "b-log" }, ...b.log.map((t) => el("div", {}, t)));

        const me = el("div", { class: "b-me" },
          guardCard(b.player, "你"),
          el("div", { class: "b-res" },
            el("span", { class: "qi" }, "灵力 ", ...Array.from({ length: b.qiPerTurn }, (_, i) => el("i", { class: i < b.qi ? "on" : "" }))),
            el("span", { class: "paper" }, `符纸 ${b.paper}`),
          ),
        );

        const cards = el("div", { class: "b-hand" }, ...b.hand().map((s) => {
          const why = b.canCast(s);
          const c = el("button", { class: `card k-${s.kind} ${why ? "off" : ""} ${pending?.spell === s ? "picked" : ""}` },
            el("span", { class: "c-cost" }, s.paper ? `${s.cost}·纸${s.paper}` : String(s.cost)),
            el("span", { class: "c-name" }, s.name),
            el("span", { class: "c-desc" }, s.brief),
          );
          c.addEventListener("click", () => {
            if (busy) return;
            if (why) { flash(why); return; }
            if (s.target === "none") doCast(s);
            else { pending = pending?.spell === s ? null : { spell: s }; render(); }
          });
          return c;
        }));

        const acts = def.ritual?.actions
          ? el("div", { class: "b-acts" }, ...def.ritual.actions.map((a) => {
              const why = b.canAct(a);
              const c = el("button", { class: `act ${why ? "off" : ""}` }, el("span", { class: "c-cost" }, String(a.cost)), el("span", { class: "c-name" }, a.name), el("span", { class: "c-desc" }, a.desc));
              c.addEventListener("click", () => {
                if (busy) return;
                if (why) { flash(why); return; }
                b.act(a);
                after();
              });
              return c;
            }))
          : "";

        const endBtn = el("button", { class: "choice b-end" }, el("span", {}, pending ? "取消选择" : "结束回合"));
        endBtn.addEventListener("click", () => {
          if (busy) return;
          if (pending) { pending = null; render(); return; }
          endTurn();
        });
        const hint = pending ? el("div", { class: "b-hint" }, `${pending.spell.desc}\n${pending.spell.target === "enemy" ? "→ 选择一个敌人" : "→ 选择要护住的对象"}`) : "";

        root.replaceChildren(
          head,
          foes,
          el("div", { class: "b-mid" }, ritual, guards.length ? el("div", { class: "b-guards" }, ...guards) : ""),
          log,
          el("div", { class: "b-bottom" }, me, hint, cards, acts, endBtn),
        );
      };

      const flash = (t: string) => {
        b.say(t);
        render();
      };

      const doCast = (s: Spell, target?: Enemy | Unit) => {
        pending = null;
        b.cast(s, target);
        after();
      };

      const after = () => {
        render();
        const r = b.checkEnd();
        if (r) finish(r);
      };

      const endTurn = async () => {
        busy = true;
        root.classList.add("enemy-turn");
        await b.enemyPhase(render);
        root.classList.remove("enemy-turn");
        let r = b.checkEnd();
        if (!r && b.outOfTurns()) r = "lose";
        if (r) return finish(r);
        b.startTurn();
        busy = false;
        render();
        showTip();
      };

      const showTip = () => {
        const t = def.tips?.[String(b.turn)];
        if (t && !shownTips.has(t) && retries === 0) { shownTips.add(t); tip(t); }
      };

      const finish = async (r: string) => {
        busy = true;
        await wait(400);
        if (r === "win") {
          sfx("seal");
          const card = el("div", { class: "b-result win" },
            el("div", { class: "big-seal" }, def.kind === "ritual" ? "成" : "破"),
            el("div", {}, `${def.title} · 完成`),
            el("button", { class: "choice" }, el("span", {}, "继续")),
          );
          card.querySelector("button")!.addEventListener("click", () => {
            root.remove();
            resolve({ win: true, objectHp: b.object?.hp ?? 0, allyHurt: b.allyHurt, turns: b.turn, retries, broke: b.broke });
          });
          root.append(card);
        } else {
          sfx("miss");
          const reason = b.player.hp <= 0 ? "你撑不住了。" : b.ally && b.ally.hp <= 0 ? `${b.ally.name}受了伤。` : b.object && b.object.hp <= 0 ? `${b.object.name}被毁了。` : "时间来不及了。";
          const card = el("div", { class: "b-result lose" },
            el("div", {}, reason),
            el("div", { class: "dim" }, "定了定神，再来一次。"),
            el("button", { class: "choice" }, el("span", {}, "再试一次")),
            el("button", { class: "choice" }, el("span", {}, "放宽一些再试（体力、灵力、符纸增加）")),
          );
          const [again, easier] = card.querySelectorAll("button");
          again.addEventListener("click", () => { retries++; start(assist); });
          easier.addEventListener("click", () => { retries++; start(assist + 1); });
          root.append(card);
        }
      };

      b.startTurn();
      render();
      showTip();
    };

    start(0);
  });
}
