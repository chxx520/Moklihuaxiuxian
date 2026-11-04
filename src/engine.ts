// 剧情引擎：按节点执行剧本，维护状态，并在安全节点自动存档。
import type { Cond, HubSpot, Item, MenuOption, Story, Value } from "./parser";
import { autosave } from "./save";

export type GameState = {
  version: 1;
  name: string;
  node: string;
  hub?: string;
  facts: Record<string, Value>;
  clues: { key: string; text: string }[];
  spells: string[];
  goal?: string;
  scene?: { name: string; sub?: string };
  chapter?: string;
  savedAt: number;
};

export interface Presenter {
  scene(name: string, sub?: string): void;
  chapter(text: string): void;
  line(kind: "narration" | "dialogue" | "system", text: string, speaker?: string): Promise<void>;
  menu(options: string[]): Promise<number>;
  hub(spots: { text: string; seen: boolean; exit: boolean }[]): Promise<number>;
  end(text: string): Promise<void>;
  toast(text: string): void;
}

export function newState(name: string, start: string): GameState {
  return { version: 1, name, node: start, facts: {}, clues: [], spells: [], savedAt: Date.now() };
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
    if (this.state.scene) this.ui.scene(this.state.scene.name, this.state.scene.sub);
    if (this.state.chapter) this.ui.chapter(this.state.chapter);

    while (nodeId && !this.stopped) {
      nodeId = await this.runNode(nodeId);
    }
  }

  private async runNode(id: string): Promise<string | null> {
    const node = this.story.nodes[id];
    if (!node) throw new Error(`找不到节点：${id}`);
    const s = this.state;
    s.node = id;
    s.facts[`seen.${id}`] = true;
    s.savedAt = Date.now();
    autosave(s);

    const queue: Item[] = [...node.items];
    while (queue.length && !this.stopped) {
      const it = queue.shift()!;
      if (!checkConds(s, it.cond)) continue;
      switch (it.t) {
        case "line":
          await this.ui.line(it.kind, this.fmt(it.text), it.speaker && this.fmt(it.speaker));
          break;
        case "scene":
          s.scene = { name: it.name, sub: it.sub };
          this.ui.scene(it.name, it.sub);
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
          await this.ui.end(this.fmt(it.text));
          return null;
        case "menu": {
          const opts: MenuOption[] = it.options.filter((o) => checkConds(s, o.cond));
          const idx = await this.ui.menu(opts.map((o) => this.fmt(o.text)));
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
          return chosen.target;
        }
      }
    }
    return null;
  }
}
