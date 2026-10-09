import { initialConfig, type BotConfig } from "./config";

export type Settings = Readonly<BotConfig>;

export type SettingsSubscriber = (next: Settings, prev: Settings) => void;

export class SettingsStore {
  readonly start: Settings;
  private _current: Settings;
  private subscribers = new Set<SettingsSubscriber>();

  constructor(initial: BotConfig) {
    this.start = Object.freeze({ ...initial });
    this._current = this.start;
  }

  public current(): Settings {
    return this._current;
  }

  public apply(patch: Partial<BotConfig>): Settings {
    const prev = this._current;
    const next: Settings = Object.freeze({ ...this._current, ...patch });
    this._current = next;
    for (const fn of this.subscribers) {
      try {
        fn(next, prev);
      } catch (err) {
        console.error("[SettingsStore] Subscriber error:", err);
      }
    }
    return next;
  }

  public subscribe(fn: SettingsSubscriber): () => void {
    this.subscribers.add(fn);
    return () => {
      this.subscribers.delete(fn);
    };
  }
}

export const settingsStore = new SettingsStore(initialConfig);
