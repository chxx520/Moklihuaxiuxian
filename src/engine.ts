// 剧情引擎：按节点执行剧本，维护状态，并在安全节点自动存档。
import type { Cond, HubSpot, Item, MenuOption, Story, Value } from "./parser";
import { autosave, logEvent, saveCheckpoint } from "./save";

export type GameState = {
  version: 1;
  name: string;
  node: string;
  hub?: string;
  facts: Record<string, Value>;
  clues: { key: string; text: string }[];
  spells: string[];
  goal?: string;
  scene?: { name: string; sub?: string; mood?: string; variant?: string; image?: string };
  chapter?: string;
  music?: string;
  /** 说话人 → 立绘键（随年龄、时期变化），例如 温小满 → 温小满_13岁 */
  cast?: Record<string, string>;
  savedAt: number;
};

export type MenuItem = { text: string; locked?: string };

export interface Presenter {
  scene(name: string, sub?: string, mood?: string, variant?: string, image?: string): void;
  chapter(text: string): void;
  line(kind: "narration" | "dialogue" | "system", text: string, speaker?: string, portrait?: string): Promise<void>;
  menu(options: MenuItem[]): Promise<number>;
  hub(spots: { text: string; seen: boolean; exit: boolean }[]): Promise<number>;
  end(text: string): Promise<void>;
  toast(text: string): void;
  /** @cg @card @music @sfx @battle @draw @pause；返回的对象会并入事实 */
  cmd(name: string, arg: string, state: GameState): Promise<Record<string, Value> | void>;
}

export function newState(name: string, start: string): GameState {
  return { version: 1, name, node: start, facts: {}, clues: [], spells: [], cast: {}, savedAt: Date.now() };
}

export function checkConds(state: GameState, conds?: Cond[]): boolean {
  if (!conds) return true;
  return conds.every((c) => {
    const v = state.facts[c.key];
    switch (c.op) {
      case "truthy": return !!v;
      case "falsy": return !v;
      case "eq": return v === c.value;
      case "neq": return v !== c.value;
    }
  });
}

export class Engine {
  private stopped = false;
  constructor(private story: Story, public state: GameState, private ui: Presenter) {}

  stop() {
    this.stopped = true;
  }

  private fmt(text: string) {
    return text.replace(/\{name\}/g, this.state.name);
  }

  /** 从 state.node 开始运行，直到遇到 @end 或被停止。 */
  async run() {
    let nodeId: string | null = this.state.node;
    const sc = this.state.scene;
    if (sc) this.ui.scene(sc.name, sc.sub, sc.mood, sc.variant, sc.image);
    if (this.state.chapter) this.ui.chapter(this.state.chapter);
    if (this.state.music) void this.ui.cmd("music", this.state.music, this.state);

    while (nodeId && !this.stopped) {
      nodeId = await this.runNode(nodeId);
    }
  }

  private portrait(speaker: string, expr?: string) {
    const key = this.state.cast?.[speaker] ?? speaker;
    return expr ? `${key}#${expr}` : key;
  }

  private async runNode(id: string): Promise<string | null> {
    const node = this.story.nodes[id];
    if (!node) throw new Error(`找不到节点：${id}`);
    const s = this.state;
    s.node = id;
    s.facts[`seen.${id}`] = true;
    s.savedAt = Date.now();
    autosave(s);
    logEvent("node", id);

    const queue: Item[] = [...node.items];
    while (queue.length && !this.stopped) {
      const it = queue.shift()!;
      if (!checkConds(s, it.cond)) continue;
      switch (it.t) {
        case "line": {
          const speaker = it.speaker && this.fmt(it.speaker);
          await this.ui.line(it.kind, this.fmt(it.text), speaker, speaker ? this.portrait(speaker, it.expr) : undefined);
          break;
        }
        case "scene":
          s.scene = { name: it.name, sub: it.sub, mood: it.mood, variant: it.variant, image: it.image };
          this.ui.scene(it.name, it.sub, it.mood, it.variant, it.image);
          break;
        case "chapter":
          s.chapter = it.text;
          this.ui.chapter(it.text);
          break;
        case "set":
          s.facts[it.key] = it.value;
          break;
        case "spell":
          if (!s.spells.includes(it.name)) {
            s.spells.push(it.name);
            this.ui.toast(`习得术法：${it.name}`);
          }
          break;
        case "clue":
          if (!s.clues.some((c) => c.key === it.key)) {
            s.clues.push({ key: it.key, text: it.text });
            s.facts[`clue.${it.key}`] = true;
            this.ui.toast(`记入旧事录：${it.text}`);
          }
          break;
        case "goal":
          s.goal = it.text;
          break;
        case "goto":
          return it.target === "back" ? s.hub ?? null : it.target;
        case "end":
          logEvent("end", it.text.slice(0, 20));
          await this.ui.end(this.fmt(it.text));
          return null;
        case "cmd": {
          if (it.name === "cast") {
            for (const pair of it.arg.split(/\s+/)) {
              const [who, key] = pair.split("=");
              if (who && key) s.cast = { ...s.cast, [who]: key };
            }
            break;
          }
          if (it.name === "checkpoint") {
            saveCheckpoint(it.arg, s);
            break;
          }
          if (it.name === "music") s.music = it.arg;
          const result = await this.ui.cmd(it.name, this.fmt(it.arg), s);
          if (result) {
            Object.assign(s.facts, result);
            logEvent(it.name, `${it.arg} ${JSON.stringify(result)}`);
          }
          break;
        }
        case "menu": {
          const opts: MenuOption[] = it.options.filter((o) => checkConds(s, o.cond));
          const items = opts.map((o) => ({
            text: this.fmt(o.text),
            locked: o.lock && !checkConds(s, o.lock.cond) ? o.lock.reason : undefined,
          }));
          const idx = await this.ui.menu(items);
          logEvent("choice", `${id}: ${items[idx].text}`);
          queue.unshift(...opts[idx].body);
          break;
        }
        case "hub": {
          s.hub = id;
          const spots: HubSpot[] = it.spots.filter((sp) => checkConds(s, sp.cond));
          const regular = spots.filter((sp) => !sp.exit);
          const allSeen = regular.every((sp) => s.facts[`seen.${sp.target}`]);
          const visible = spots.filter((sp) => !sp.exit || allSeen || sp.cond);
          const idx = await this.ui.hub(
            visible.map((sp) => ({ text: sp.text, seen: !!s.facts[`seen.${sp.target}`], exit: sp.exit })),
          );
          const chosen = visible[idx];
          if (chosen.exit) s.hub = undefined;
          logEvent("look", chosen.target);
          return chosen.target;
        }
      }
    }
    return null;
  }
}
