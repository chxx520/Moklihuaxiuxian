// 创建角色：性别、相貌、姓名、灵根（掷出三组，选一组；可重掷两次）。
import { figureHtml } from "../art";
import { sfx } from "../audio";
import { burst } from "../fx";
import { animatePortrait } from "../live";
import { el } from "../ui";
import { ELEMENTS, gradeOf, newPlayer, rollRoot, type Player } from "./model";

const LOOKS: Record<string, Record<string, string>> = {
  男: { 甲: "清秀书生相，眉目温和", 乙: "英气，浓眉，眼神锐利", 丙: "朴实憨厚，笑起来有虎牙" },
  女: { 甲: "清秀安静，眉眼柔和", 乙: "英气利落，眉峰上挑", 丙: "圆脸机灵，嘴角常带笑" },
};

export function createCharacter(): Promise<{ player: Player; name: string }> {
  return new Promise((resolve) => {
    let gender: Player["gender"] = "女";
    let look: Player["look"] = "甲";
    let rolls = [rollRoot(), rollRoot(), rollRoot()];
    let picked = -1;
    let rerolls = 2;
    let live: { stop(): void } | null = null;

    const root = el("div", { class: "create" });
    document.body.append(root);

    const draw = () => {
      live?.stop();
      const fig = el("div", { class: "cr-fig" });
      fig.innerHTML = figureHtml(`主角_${gender}_${look}_凡人`);
      const name = el("input", { class: "name-input cr-name", value: (root.querySelector(".cr-name") as HTMLInputElement)?.value ?? "沈砚", maxlength: "6" });

      const genderRow = el("div", { class: "cr-row" }, el("span", { class: "cr-label" }, "性别"),
        ...(["女", "男"] as const).map((g) => {
          const b = el("button", { class: `cr-tab ${g === gender ? "on" : ""}` }, g);
          b.addEventListener("click", () => { gender = g; sfx("page"); draw(); });
          return b;
        }));
      const lookRow = el("div", { class: "cr-row" }, el("span", { class: "cr-label" }, "相貌"),
        ...(["甲", "乙", "丙"] as const).map((l) => {
          const b = el("button", { class: `cr-tab ${l === look ? "on" : ""}` }, l);
          b.addEventListener("click", () => { look = l; sfx("page"); draw(); });
          return b;
        }));
      const lookDesc = el("div", { class: "cr-desc" }, LOOKS[gender][look]);

      const rootCards = el("div", { class: "cr-roots" }, ...rolls.map((r, i) => {
        const g = gradeOf(r);
        const c = el("button", { class: `root-card ${picked === i ? "on" : ""} g${g.n}`, style: `animation-delay:${i * 120}ms` },
          el("b", {}, g.name),
          el("div", { class: "rc-els" }, ...r.map((e) => el("i", { class: "root-chip", style: `--c:${ELEMENTS.find((x) => x.id === e)!.color}` }, e))),
          el("small", {}, `修炼 ×${g.speed}`),
        );
        c.addEventListener("click", () => {
          picked = i;
          sfx(g.n <= 2 ? "power" : "page");
          const rr = c.getBoundingClientRect();
          burst(rr.left + rr.width / 2, rr.top + rr.height / 2, g.n <= 2 ? "#f3dc98" : "#cfe6dc", g.n <= 2 ? 30 : 12);
          draw();
        });
        return c;
      }));
      const reroll = el("button", { class: "choice cr-reroll" }, el("span", {}, `重掷灵根（剩 ${rerolls} 次）`));
      if (!rerolls) reroll.setAttribute("disabled", "");
      reroll.addEventListener("click", () => {
        if (!rerolls) return;
        rerolls--;
        rolls = [rollRoot(), rollRoot(), rollRoot()];
        picked = -1;
        sfx("book");
        draw();
      });
      const rootDesc = el("div", { class: "cr-desc" }, picked >= 0 ? rolls[picked].map((e) => `${e}：${ELEMENTS.find((x) => x.id === e)!.desc}`).join("　") : "灵根越纯，修炼越快；每种属性在战斗中各有加成。");

      const ok = el("button", { class: "choice btn-primary cr-ok" }, el("span", {}, "踏上仙途"));
      ok.addEventListener("click", () => {
        if (picked < 0) { sfx("miss"); rootCards.classList.remove("shake"); void rootCards.offsetWidth; rootCards.classList.add("shake"); return; }
        const nm = (root.querySelector(".cr-name") as HTMLInputElement).value.trim() || "沈砚";
        sfx("breakthrough");
        const seal = el("div", { class: "cr-seal" }, "入道");
        root.append(seal);
        setTimeout(() => { live?.stop(); root.remove(); resolve({ player: newPlayer(gender, look, rolls[picked]), name: nm }); }, 1100);
      });

      root.replaceChildren(
        el("div", { class: "cr-head" }, el("span", { class: "cr-title" }, "入道")),
        fig,
        el("div", { class: "cr-panel" },
          el("div", { class: "cr-row" }, el("span", { class: "cr-label" }, "姓名"), name),
          genderRow, lookRow, lookDesc,
          el("div", { class: "cr-sub" }, "灵根"), rootCards, rootDesc, reroll, ok,
        ),
      );
      const img = fig.querySelector("img.portrait") as HTMLImageElement | null;
      live = img ? animatePortrait(img, { sway: 1 }) : null;
    };
    draw();
  });
}
