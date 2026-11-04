// 剧本解析器：把 content/*.story 的纯文本剧本转成节点数据。
// 语法说明见 content/README.md。

export type Value = boolean | number | string;

export type Cond = { key: string; op: "truthy" | "falsy" | "eq" | "neq" | "gt" | "lt" | "ge" | "le"; value?: Value };

export type Item =
  | { t: "line"; speaker?: string; expr?: string; text: string; kind: "narration" | "dialogue" | "system"; cond?: Cond[] }
  | { t: "scene"; name: string; sub?: string; mood?: string; variant?: string; image?: string; cond?: Cond[] }
  | { t: "cmd"; name: string; arg: string; cond?: Cond[] }
  | { t: "act"; name: string; arg: string; cond?: Cond[] }
  | { t: "chapter"; text: string; cond?: Cond[] }
  | { t: "set"; key: string; value: Value; cond?: Cond[] }
  | { t: "spell"; name: string; cond?: Cond[] }
  | { t: "clue"; key: string; text: string; cond?: Cond[] }
  | { t: "goal"; text: string; cond?: Cond[] }
  | { t: "goto"; target: string; cond?: Cond[] }
  | { t: "end"; text: string; cond?: Cond[] }
  | { t: "menu"; options: MenuOption[]; cond?: Cond[] }
  | { t: "hub"; spots: HubSpot[]; cond?: Cond[] };

export type MenuOption = { text: string; cond?: Cond[]; lock?: { cond: Cond[]; reason: string }; body: Item[] };
export type HubSpot = { text: string; target: string; exit: boolean; cond?: Cond[] };

export type StoryNode = { id: string; file: string; items: Item[] };
export type Story = { nodes: Record<string, StoryNode>; order: string[] };

export class StoryError extends Error {}

const COND_RE = /\s*\[\?([^\]]+)\]\s*$/;

export function parseCond(src: string): Cond[] {
  return src.split(/\s*&\s*/).filter(Boolean).map((part) => {
    const m = part.match(/^([\w.:]+)\s*(!=|>=|<=|=|>|<)\s*(.+)$/);
    const ops: Record<string, Cond["op"]> = { "=": "eq", "!=": "neq", ">": "gt", "<": "lt", ">=": "ge", "<=": "le" };
    if (m) return { key: m[1], op: ops[m[2]], value: parseValue(m[3]) } as Cond;
    if (part.startsWith("!")) return { key: part.slice(1).trim(), op: "falsy" } as Cond;
    return { key: part.trim(), op: "truthy" } as Cond;
  });
}

export function parseValue(raw: string): Value {
  const s = raw.trim();
  if (s === "true") return true;
  if (s === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  return s.replace(/^["']|["']$/g, "");
}

const PREFIX_COND_RE = /^\[\?([^\]]+)\]\s*/;

function takeCond(text: string): [string, Cond[] | undefined] {
  const p = text.match(PREFIX_COND_RE);
  if (p) return [text.slice(p[0].length), parseCond(p[1])];
  const m = text.match(COND_RE);
  if (!m) return [text, undefined];
  return [text.slice(0, m.index).trimEnd(), parseCond(m[1])];
}

function parseLine(text: string, file: string, lineNo: number): Item {
  let [body, cond] = takeCond(text);
  const where = `${file}:${lineNo}`;

  if (body.startsWith("->")) return { t: "goto", target: body.slice(2).trim(), cond };
  if (body.startsWith("@scene")) {
    const [name, sub, look, image] = body.slice(6).split("|").map((s) => s.trim());
    const [mood, variant] = (look ?? "").split("/").map((s) => s.trim());
    return { t: "scene", name, sub: sub || undefined, mood: mood || undefined, variant: variant || undefined, image: image || undefined, cond };
  }
  const cm = body.match(/^@(cast|cg|card|music|sfx|battle|draw|checkpoint|pause|hub|fight|shop)\b\s*(.*)$/);
  if (cm) return { t: "cmd", name: cm[1], arg: cm[2].trim().replace(/\\n/g, "\n"), cond };
  if (body.startsWith("@chapter")) return { t: "chapter", text: body.slice(8).trim(), cond };
  if (body.startsWith("@end")) return { t: "end", text: body.slice(4).trim().replace(/\\n/g, "\n"), cond };
  if (body.startsWith("~")) {
    const cmd = body.slice(1).trim();
    let m = cmd.match(/^set\s+([\w.]+)\s*=\s*(.+)$/);
    if (m) return { t: "set", key: m[1], value: parseValue(m[2]), cond };
    m = cmd.match(/^spell\s+(.+)$/);
    if (m) return { t: "spell", name: m[1].trim(), cond };
    m = cmd.match(/^clue\s+([\w.]+)\s+(.+)$/);
    if (m) return { t: "clue", key: m[1], text: m[2].trim(), cond };
    m = cmd.match(/^goal\s+(.+)$/);
    if (m) return { t: "goal", text: m[1].trim(), cond };
    m = cmd.match(/^(give|take|stones|xp|days|years|month|learn|tech|unlock|loc|outfit|realm)\b\s*(.*)$/);
    if (m) return { t: "act", name: m[1], arg: m[2].trim(), cond };
    throw new StoryError(`${where} 无法识别的指令：${body}`);
  }
  if (body.startsWith("〔")) return { t: "line", kind: "system", text: body, cond };
  const dm = body.match(/^([^：\s\[]{1,8})(?:\[([^\]]+)\])?：(.+)$/);
  if (dm) return { t: "line", kind: "dialogue", speaker: dm[1], expr: dm[2], text: dm[3], cond };
  return { t: "line", kind: "narration", text: body, cond };
}

export function parseStory(files: Record<string, string>): Story {
  const nodes: Record<string, StoryNode> = {};
  const order: string[] = [];

  for (const [file, src] of Object.entries(files)) {
    const lines = src.replace(/\r\n?/g, "\n").split("\n");
    let node: StoryNode | null = null;
    let menu: Extract<Item, { t: "menu" }> | null = null;
    let hub: Extract<Item, { t: "hub" }> | null = null;

    lines.forEach((raw, i) => {
      const lineNo = i + 1;
      if (!raw.trim() || raw.trim().startsWith("//")) return;
      const indented = /^( {2,}|\t)/.test(raw);
      const text = raw.trim();

      if (text.startsWith("# ")) {
        const id = text.slice(2).trim();
        if (nodes[id]) throw new StoryError(`${file}:${lineNo} 节点重复：${id}`);
        node = { id, file, items: [] };
        nodes[id] = node;
        order.push(id);
        menu = null;
        hub = null;
        return;
      }
      if (!node) throw new StoryError(`${file}:${lineNo} 内容必须写在某个 "# 节点" 下面`);
      const cur = node as StoryNode;

      if (indented) {
        if (!menu || menu.options.length === 0) throw new StoryError(`${file}:${lineNo} 缩进行只能跟在 "+ 选项" 后面`);
        menu.options[menu.options.length - 1].body.push(parseLine(text, file, lineNo));
        return;
      }

      if (text.startsWith("+")) {
        let raw = text.slice(1).trim();
        // [lock?条件 原因]：选项总是显示，但条件不满足时锁住并显示原因
        let lock: MenuOption["lock"];
        const lm = raw.match(/\s*\[lock\?([^\s\]]+)\s+([^\]]+)\]/);
        if (lm) {
          lock = { cond: parseCond(lm[1]), reason: lm[2].trim() };
          raw = raw.replace(lm[0], "");
        }
        const [body, cond] = takeCond(raw);
        const opt: MenuOption = { text: body, cond, lock, body: [] };
        const jm = body.match(/^(.*?)\s*->\s*(\S+)$/);
        if (jm) {
          opt.text = jm[1];
          opt.body.push({ t: "goto", target: jm[2] });
        }
        if (!menu) {
          menu = { t: "menu", options: [] };
          cur.items.push(menu);
        }
        // 跳转放在选项内容最后执行
        menu.options.push(opt);
        hub = null;
        return;
      }
      menu = null;

      if (text === "@investigate") {
        hub = { t: "hub", spots: [] };
        cur.items.push(hub);
        return;
      }
      if (text.startsWith(">")) {
        if (!hub) throw new StoryError(`${file}:${lineNo} "> 调查点" 必须写在 @investigate 下面`);
        const exit = text.startsWith(">>");
        const [body, cond] = takeCond(text.slice(exit ? 2 : 1).trim());
        const m = body.match(/^(.*?)\s*->\s*(\S+)$/);
        if (!m) throw new StoryError(`${file}:${lineNo} 调查点需要写跳转：> 名称 -> 节点`);
        hub.spots.push({ text: m[1], target: m[2], exit, cond });
        return;
      }
      hub = null;
      cur.items.push(parseLine(text, file, lineNo));
    });
  }

  // 把选项里写在第一行的 "-> 目标" 挪到最后，让缩进的回应先播完
  for (const n of Object.values(nodes)) {
    for (const it of n.items) {
      if (it.t !== "menu") continue;
      for (const o of it.options) {
        const first = o.body[0];
        if (first && first.t === "goto" && o.body.length > 1) o.body.push(o.body.shift()!);
      }
    }
  }
  return { nodes, order };
}

/** 检查所有跳转目标是否存在，返回问题列表。 */
export function lintStory(story: Story): string[] {
  const problems: string[] = [];
  const check = (target: string, from: string) => {
    if (target === "back") return;
    if (!story.nodes[target]) problems.push(`${from} 跳转到不存在的节点：${target}`);
  };
  const walk = (items: Item[], from: string) => {
    for (const it of items) {
      if (it.t === "goto") check(it.target, from);
      if (it.t === "menu") it.options.forEach((o) => walk(o.body, from));
      if (it.t === "hub") it.spots.forEach((s) => check(s.target, from));
    }
  };
  for (const n of Object.values(story.nodes)) {
    walk(n.items, `${n.file} # ${n.id}`);
    // 节点结尾必须有去处，否则游戏会无提示地停住
    const last = n.items[n.items.length - 1];
    const ends = (it?: Item): boolean =>
      !!it && !it.cond && (it.t === "goto" || it.t === "end" || it.t === "hub" || (it.t === "cmd" && it.name === "hub") ||
        (it.t === "menu" && it.options.every((o) => ends(o.body[o.body.length - 1]))));
    if (!ends(last)) problems.push(`${n.file} # ${n.id} 结尾没有无条件的跳转、@end 或调查点，会形成死路`);
  }
  return problems;
}
