// What the others are up to, bottom left: who came in, who left, what they
// said, who picked up a phone and who won. C opens a line to say something
// yourself (Enter sends, Esc closes).
import { CHAT_MAX } from "./protocol";

export type FeedKind = "join" | "leave" | "chat" | "me" | "note" | "job" | "talk";

export class Chat {
  open = false;
  onSend: (text: string) => void = () => {};
  onClose: () => void = () => {};
  private feed = document.getElementById("feed")!;
  private el = document.getElementById("chat")!;
  private input = document.getElementById("chat-in") as HTMLInputElement;

  constructor() {
    this.input.maxLength = CHAT_MAX;
    this.input.addEventListener("keydown", (e) => {
      e.stopPropagation(); // (the keys are for typing, not walking)
      if (e.code === "Escape") {
        e.preventDefault();
        return this.hide();
      }
      if (e.code === "Enter" || e.code === "NumpadEnter") {
        const text = this.input.value.trim();
        if (text) this.onSend(text);
        this.hide();
      }
    });
    this.input.addEventListener("keyup", (e) => e.stopPropagation());
  }

  show() {
    this.open = true;
    this.el.classList.add("show");
    document.body.classList.add("chatting");
    this.input.value = "";
    // (after the key that opened it, so the C doesn't end up in the input)
    setTimeout(() => this.input.focus(), 0);
  }

  hide() {
    if (!this.open) return;
    this.open = false;
    this.el.classList.remove("show");
    document.body.classList.remove("chatting");
    this.input.blur();
    this.onClose();
  }

  // a line in the feed; it fades after a while (chat stays longer)
  line(kind: FeedKind, text: string, who = "") {
    const el = document.createElement("div");
    el.className = `fl ${kind}`;
    if (who) {
      const b = document.createElement("b");
      b.textContent = who;
      el.append(b);
    }
    el.append(text);
    this.feed.append(el);
    while (this.feed.children.length > 6) this.feed.firstElementChild!.remove();
    const life = kind === "chat" || kind === "me" ? 14000 : 8000;
    setTimeout(() => el.classList.add("out"), life);
    setTimeout(() => el.remove(), life + 800);
  }
}
