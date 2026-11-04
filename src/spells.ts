// 六个术法的定义。数值集中在这里，方便调整平衡。

export type SpellTarget = "enemy" | "guard" | "none";

export type Spell = {
  name: string;
  cost: number;
  paper?: number;
  target: SpellTarget;
  kind: "攻" | "守" | "察";
  desc: string;
  /** 卡面上的简短说明 */
  brief: string;
  /** 战斗外（探索）时的用途说明 */
  field?: string;
};

export const SPELLS: Record<string, Spell> = {
  驱邪符: { name: "驱邪符", brief: "伤害 3", cost: 1, target: "enemy", kind: "攻", desc: "对一个现形的敌人造成 3 点伤害。", field: "驱散小股阴气。" },
  破煞符: { name: "破煞符", brief: "伤害 6 · 波及器物", cost: 2, paper: 1, target: "enemy", kind: "攻", desc: "造成 6 点伤害，但煞气会波及附近的器物（2 点）。消耗 1 张符纸。", field: "强行打开被封住的地方。" },
  护身符: { name: "护身符", brief: "护盾 3", cost: 1, target: "guard", kind: "守", desc: "为自己、同伴或器物加上 3 点护盾，持续到敌人下次行动结束。" },
  定身符: { name: "定身符", brief: "取消一次行动", cost: 2, target: "enemy", kind: "守", desc: "取消一个敌人的下一次行动。" },
  明灯符: { name: "明灯符", brief: "照出暗处", cost: 1, target: "none", kind: "察", desc: "照出所有藏在暗处的敌人，两回合内它们无法再隐藏。", field: "照亮暗处，发现痕迹。" },
  辨气术: { name: "辨气术", brief: "看穿意图与心结", cost: 0, target: "none", kind: "察", desc: "每回合一次。看穿暗处敌人的意图、敌人的弱点，以及异常的「心结」。", field: "看见残留的气息。" },
};

export const SPELL_ORDER = ["驱邪符", "破煞符", "护身符", "定身符", "明灯符", "辨气术"];
