// Your first day: five short cards on the left of the screen, once. Each one
// goes when you've done what it says (or after a while, when there's nothing to
// do). X skips the lot (a tap on phones and tablets); `uitleg` in the console
// shows it again.

export interface TutorialState {
  meters: number; // how far you've walked
  onCall: boolean; // you picked up a phone
  mapOpen: boolean;
  active: boolean; // playing (not paused, not in a menu)
}

interface Step {
  desk: string;
  mob: string;
  done: (s: TutorialState, t: number, from: TutorialState) => boolean;
}

const KEY = "vrt-uitleg";

const STEPS: Step[] = [
  {
    desk: "Kijk rond met de muis, loop met <kbd>WASD</kbd> of <kbd>ZQSD</kbd>. <kbd>SHIFT</kbd> om te rennen.",
    mob: "Linkerduim om te lopen (ver duwen om te rennen), rechterduim om rond te kijken.",
    done: (s, _t, from) => s.meters - from.meters > 8,
  },
  {
    desk: "Ergens rinkelt een telefoon. Volg het groene icoontje op je minikaart en neem op met <kbd>E</kbd>.",
    mob: "Ergens rinkelt een telefoon. Volg het groene icoontje op je minikaart en neem op met <kbd>E</kbd>.",
    done: (s, t) => s.onCall || t > 60,
  },
  {
    desk: "Rechtsboven staat wat je zoekt en hoeveel tijd je nog hebt. Het signaal wordt sterker als je dichterbij komt. <kbd>M</kbd> opent de plattegrond.",
    mob: "Rechtsboven staat wat je zoekt en hoeveel tijd je nog hebt. Het signaal wordt sterker als je dichterbij komt. <kbd>KAART</kbd> opent de plattegrond.",
    done: (s, t) => s.mapOpen || t > 25,
  },
  {
    desk: "Elke opdracht brengt geld op. Je gezondheid zakt: eet en drink bij de oranje icoontjes, water is gratis. Met € 1000 op zak heb je gewonnen.",
    mob: "Elke opdracht brengt geld op. Je gezondheid zakt: eet en drink bij de oranje icoontjes, water is gratis. Met € 1000 op zak heb je gewonnen.",
    done: (_s, t) => t > 16,
  },
  {
    desk: "Een gesloten deur? <kbd>E</kbd> doet ze open. <kbd>C</kbd> om te chatten met de anderen in het gebouw. Veel succes.",
    mob: "Een gesloten deur? <kbd>E</kbd> doet ze open. Veel succes.",
    done: (_s, t) => t > 12,
  },
];

export class Tutorial {
  private el = document.getElementById("tut")!;
  private textEl = document.getElementById("tut-text")!;
  private nEl = document.getElementById("tut-n")!;
  private step = -1;
  private t = 0;
  private from: TutorialState | null = null;
  private last: TutorialState | null = null;

  constructor(private touch: boolean) {
    this.el.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      this.skip();
    });
  }

  get running() {
    return this.step >= 0;
  }

  // once, unless `again`
  start(again = false) {
    if (!again && localStorage.getItem(KEY)) return;
    this.show(0);
  }

  skip() {
    if (this.step < 0) return;
    this.step = -1;
    this.el.classList.remove("show");
    localStorage.setItem(KEY, "1");
  }

  private show(k: number) {
    if (k >= STEPS.length) return this.skip();
    this.step = k;
    this.t = 0;
    this.from = this.last;
    const s = STEPS[k]!;
    this.el.classList.remove("show");
    // (a moment between the cards)
    setTimeout(() => {
      if (this.step !== k) return;
      this.textEl.innerHTML = this.touch ? s.mob : s.desk;
      this.nEl.textContent = `${k + 1}/${STEPS.length}`;
      this.el.classList.add("show");
    }, k ? 600 : 0);
  }

  update(dt: number, st: TutorialState) {
    this.last = { ...st };
    if (this.step < 0 || !st.active) return;
    this.from ??= { ...st };
    this.t += dt;
    if (STEPS[this.step]!.done(st, this.t, this.from)) this.show(this.step + 1);
  }
}
