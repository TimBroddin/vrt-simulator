// The debug console: the key left of 1 (` or ²) opens it. `help` lists the
// commands, but not all of them: `warp` opens the warp menu, which takes you to
// any plek in the building.
import { PLACES } from "./places";

interface Command {
  help: string | null; // null: not on the list
  run: (args: string[]) => string | void;
}

// the key left of 1, wherever the layout puts it
export const isConsoleKey = (e: KeyboardEvent) => e.code === "Backquote" || e.code === "IntlBackslash" || e.key === "`" || e.key === "²";

export class DevConsole {
  open = false;
  onClose: () => void = () => {};
  private el = document.getElementById("devconsole")!;
  private out = document.getElementById("dc-out")!;
  private input = document.getElementById("dc-in") as HTMLInputElement;
  private commands = new Map<string, Command>();
  private history: string[] = [];
  private hi = 0;

  constructor() {
    this.add("help", "deze lijst", () => [...this.commands].filter(([, c]) => c.help).map(([n, c]) => `${n.padEnd(8)} ${c.help}`).join("\n"));
    this.add("clear", "scherm leegmaken", () => void (this.out.textContent = ""));
    this.add("exit", "console sluiten", () => void this.hide());
    this.input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.code === "Escape" || isConsoleKey(e)) {
        e.preventDefault();
        return this.hide();
      }
      if (e.code === "Enter" || e.code === "NumpadEnter") {
        const line = this.input.value.trim();
        this.input.value = "";
        if (line) this.exec(line);
      } else if (e.code === "ArrowUp" || e.code === "ArrowDown") {
        e.preventDefault();
        this.hi = Math.max(0, Math.min(this.history.length, this.hi + (e.code === "ArrowUp" ? -1 : 1)));
        this.input.value = this.history[this.hi] ?? "";
      }
    });
    this.print("VRT SIMULATOR · debug console · typ help");
  }

  add(name: string, help: string | null, run: Command["run"]) {
    this.commands.set(name, { help, run });
  }

  show() {
    this.open = true;
    this.el.classList.add("show");
    this.input.value = "";
    this.hi = this.history.length;
    // (after the key that opened it, so it doesn't end up in the input)
    setTimeout(() => this.input.focus(), 0);
  }

  hide() {
    if (!this.open) return;
    this.open = false;
    this.el.classList.remove("show");
    this.input.blur();
    this.onClose();
  }

  print(text: string, cls = "") {
    const line = document.createElement("div");
    if (cls) line.className = cls;
    line.textContent = text;
    this.out.appendChild(line);
    while (this.out.children.length > 200) this.out.firstElementChild!.remove();
    this.out.scrollTop = this.out.scrollHeight;
  }

  private exec(line: string) {
    this.history.push(line);
    this.hi = this.history.length;
    this.print(`> ${line}`, "cmd");
    const [name, ...args] = line.split(/\s+/);
    const c = this.commands.get(name!.toLowerCase());
    if (!c) return this.print(`onbekend commando: ${name} (typ help)`, "err");
    try {
      const r = c.run(args);
      if (r) this.print(r);
    } catch (err) {
      this.print(String(err), "err");
    }
  }
}

// The warp menu: every plek, filter by typing, ↑↓ and Enter (or click) to go.
export class WarpMenu {
  open = false;
  onPick: (id: string, name: string) => void = () => {};
  onClose: () => void = () => {};
  private el = document.getElementById("warp")!;
  private list = document.getElementById("warp-list")!;
  private filter = document.getElementById("warp-filter") as HTMLInputElement;
  private note = document.getElementById("warp-note")!;
  private items: { id: string; name: string; el: HTMLButtonElement }[] = [];
  private sel = 0;

  constructor(extra: { id: string; name: string }[] = []) {
    for (const p of [...extra, ...PLACES]) {
      const b = document.createElement("button");
      b.textContent = p.name;
      b.onclick = () => this.onPick(p.id, p.name);
      this.list.appendChild(b);
      this.items.push({ ...p, el: b });
    }
    this.filter.addEventListener("input", () => this.refresh(0));
    this.filter.addEventListener("keydown", (e) => {
      e.stopPropagation();
      const shown = this.shown();
      if (e.code === "Escape" || isConsoleKey(e)) {
        e.preventDefault();
        this.hide();
      } else if (e.code === "ArrowDown" || e.code === "ArrowUp") {
        e.preventDefault();
        this.refresh(Math.max(0, Math.min(shown.length - 1, this.sel + (e.code === "ArrowDown" ? 1 : -1))));
      } else if ((e.code === "Enter" || e.code === "NumpadEnter") && shown[this.sel]) {
        const it = shown[this.sel]!;
        this.onPick(it.id, it.name);
      }
    });
    document.getElementById("warp-close")!.onclick = () => this.hide();
  }

  private shown() {
    return this.items.filter((it) => !it.el.hidden);
  }

  private refresh(sel: number) {
    const q = this.filter.value.trim().toLowerCase();
    for (const it of this.items) it.el.hidden = !!q && !it.name.toLowerCase().includes(q) && !it.id.includes(q);
    const shown = this.shown();
    this.sel = Math.min(sel, Math.max(0, shown.length - 1));
    for (const it of this.items) it.el.classList.remove("sel");
    shown[this.sel]?.el.classList.add("sel");
    shown[this.sel]?.el.scrollIntoView({ block: "nearest" });
  }

  // found: the plekken you've already found get a dot
  show(found: Set<string>, query = "") {
    this.open = true;
    this.el.classList.add("show");
    for (const it of this.items) it.el.classList.toggle("found", found.has(it.id));
    this.filter.value = query;
    this.setNote("");
    this.refresh(0);
    setTimeout(() => this.filter.focus(), 0);
  }

  hide() {
    if (!this.open) return;
    this.open = false;
    this.el.classList.remove("show");
    this.filter.blur();
    this.onClose();
  }

  setNote(t: string) {
    this.note.textContent = t;
  }
}
