import type { TTSEngine } from "./engine";
import type { EngineName, EnglishEngineName } from "./engineFactory";

export interface EngineSet {
  readonly primary: TTSEngine;
  readonly primaryName: EngineName;
  readonly english?: TTSEngine;
  readonly englishName?: EnglishEngineName | string;
}

export class EngineHolder {
  private _current: EngineSet;

  constructor(initial: EngineSet) {
    this._current = Object.freeze({ ...initial });
  }

  public current(): EngineSet {
    return this._current;
  }

  public replace(set: EngineSet): void {
    this._current = Object.freeze({ ...set });
  }
}
