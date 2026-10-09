import type { TTSEngine } from "./engine";
import {
  createEngine,
  createEnglishEngine,
  type EngineName,
  type EnglishEngineName,
} from "./engineFactory";
import type { EngineHolder, EngineSet } from "./engineHolder";
import type { TTSQueue } from "./queue";
import type { Settings, SettingsStore } from "../settingsStore";
import { CONFIG_SETTINGS } from "../configSettings";
import type { BotConfig } from "../config";

export interface Scheduler {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (id: unknown) => void;
}

export const realTimers: Scheduler = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
};

export interface EngineBuilders {
  createEngine: (name: EngineName, config: BotConfig, logger?: (msg: string) => void) => TTSEngine;
  createEnglishEngine: (
    config: BotConfig,
    platform?: NodeJS.Platform,
    logger?: (msg: string) => void
  ) => TTSEngine | undefined;
}

export type EnginePendingStage = "probing" | "waiting" | "failed";

export interface EnginePendingInfo {
  target: EngineName;
  since: number;
  stage: EnginePendingStage;
  error?: string;
}

interface PendingCandidate {
  target: EngineName;
  engine: TTSEngine;
  since: number;
  stage: EnginePendingStage;
  error?: string;
  config: Settings;
  timerId?: unknown;
  cutOverTimerId?: unknown;
  unregisterIdle?: () => void;
  isStartupFallback?: boolean;
}

interface EnglishPendingCandidate {
  target: EnglishEngineName;
  engine?: TTSEngine;
  since: number;
  stage: EnginePendingStage;
  error?: string;
  config: Settings;
  timerId?: unknown;
  cutOverTimerId?: unknown;
  unregisterIdle?: () => void;
  isAddition?: boolean;
}

function didKeyChange(next: Settings, prev: Settings, key: keyof BotConfig): boolean {
  return !Object.is(next[key], prev[key]);
}

function areSettingsEqualForEngine(
  settingsA: Settings,
  settingsB: Settings,
  engineName: EngineName
): boolean {
  if (settingsA.TTS_ENGINE !== settingsB.TTS_ENGINE) return false;
  for (const def of CONFIG_SETTINGS) {
    if (def.engineInput?.primary?.includes(engineName)) {
      if (!Object.is(settingsA[def.key], settingsB[def.key])) {
        return false;
      }
    }
  }
  return true;
}

function areSettingsEqualForEnglishEngine(
  settingsA: Settings,
  settingsB: Settings,
  engineName: EnglishEngineName
): boolean {
  if (settingsA.ENGLISH_TTS_ENGINE !== settingsB.ENGLISH_TTS_ENGINE) return false;
  for (const def of CONFIG_SETTINGS) {
    if (def.engineInput?.english?.includes(engineName)) {
      if (!Object.is(settingsA[def.key], settingsB[def.key])) {
        return false;
      }
    }
  }
  return true;
}

export class EngineManager {
  private readonly store: SettingsStore;
  private readonly queue: TTSQueue;
  private readonly holder: EngineHolder;
  private readonly builders: EngineBuilders;
  private readonly scheduler: Scheduler;
  private activePrimarySettings: Settings;
  private activeEnglishSettings: Settings;
  private pendingCandidate: PendingCandidate | null = null;
  private englishPendingCandidate: EnglishPendingCandidate | null = null;
  private storeUnsubscribe?: () => void;
  private stopped = false;

  constructor(
    store: SettingsStore,
    queue: TTSQueue,
    holder: EngineHolder,
    builders: Partial<EngineBuilders> = {},
    scheduler: Scheduler = realTimers
  ) {
    this.store = store;
    this.queue = queue;
    this.holder = holder;
    this.builders = {
      createEngine: builders.createEngine ?? createEngine,
      createEnglishEngine: builders.createEnglishEngine ?? createEnglishEngine,
    };
    this.scheduler = scheduler;
    this.activePrimarySettings = store.current();
    this.activeEnglishSettings = store.current();

    const currentSet = this.holder.current();
    const configuredPrimary = this.activePrimarySettings.TTS_ENGINE;

    // Start-up fallback check (R3-2):
    // when primaryName ≠ TTS_ENGINE, configured engine is a failed candidate re-probed every 10 s
    if (currentSet.primaryName !== configuredPrimary) {
      this.initStartupFallback(configuredPrimary, this.activePrimarySettings);
    }

    this.storeUnsubscribe = this.store.subscribe((next, prev) => {
      this.handleStoreChange(next, prev);
    });
  }

  public current(): EngineSet {
    return this.holder.current();
  }

  public pending(): EnginePendingInfo | null {
    if (!this.pendingCandidate) return null;
    return {
      target: this.pendingCandidate.target,
      since: this.pendingCandidate.since,
      stage: this.pendingCandidate.stage,
      error: this.pendingCandidate.error,
    };
  }

  public stopAll(): void {
    this.stopped = true;
    if (this.storeUnsubscribe) {
      this.storeUnsubscribe();
      this.storeUnsubscribe = undefined;
    }
    this.cancelPendingPrimary();
    this.cancelPendingEnglish();

    const current = this.holder.current();
    if (current.primary) {
      this.disposeEngine(current.primary);
    }
    if (current.english) {
      this.disposeEngine(current.english);
    }
  }

  private log(message: string): void {
    console.log(message);
  }

  private disposeEngine(engine: TTSEngine): void {
    if (typeof engine.dispose === "function") {
      try {
        engine.dispose();
      } catch (err) {
        console.error("[EngineManager] Error disposing engine:", err);
      }
    } else if (typeof engine.stop === "function") {
      try {
        engine.stop();
      } catch (err) {
        console.error("[EngineManager] Error stopping engine:", err);
      }
    }
  }

  private retireEngine(engine: TTSEngine): void {
    if (!this.queue.isInUse(engine)) {
      this.disposeEngine(engine);
      return;
    }

    let disposed = false;
    let unregisterRelease: (() => void) | undefined;
    let timerId: unknown;

    const doDispose = () => {
      if (disposed) return;
      disposed = true;
      if (timerId !== undefined) {
        this.scheduler.clearTimeout(timerId);
        timerId = undefined;
      }
      if (unregisterRelease) {
        unregisterRelease();
        unregisterRelease = undefined;
      }
      this.disposeEngine(engine);
    };

    unregisterRelease = this.queue.onRelease(() => {
      if (!this.queue.isInUse(engine)) {
        doDispose();
      }
    });

    // 120 s retirement cap check (L-c, R3-3)
    timerId = this.scheduler.setTimeout(() => {
      doDispose();
    }, 120000);
  }

  private cancelPendingPrimary(): void {
    if (!this.pendingCandidate) return;
    const candidate = this.pendingCandidate;
    this.pendingCandidate = null;

    if (candidate.timerId !== undefined) {
      this.scheduler.clearTimeout(candidate.timerId);
      candidate.timerId = undefined;
    }
    if (candidate.cutOverTimerId !== undefined) {
      this.scheduler.clearTimeout(candidate.cutOverTimerId);
      candidate.cutOverTimerId = undefined;
    }
    if (candidate.unregisterIdle) {
      candidate.unregisterIdle();
      candidate.unregisterIdle = undefined;
    }

    this.disposeEngine(candidate.engine);
  }

  private cancelPendingEnglish(): void {
    if (!this.englishPendingCandidate) return;
    const candidate = this.englishPendingCandidate;
    this.englishPendingCandidate = null;

    if (candidate.timerId !== undefined) {
      this.scheduler.clearTimeout(candidate.timerId);
      candidate.timerId = undefined;
    }
    if (candidate.cutOverTimerId !== undefined) {
      this.scheduler.clearTimeout(candidate.cutOverTimerId);
      candidate.cutOverTimerId = undefined;
    }
    if (candidate.unregisterIdle) {
      candidate.unregisterIdle();
      candidate.unregisterIdle = undefined;
    }

    if (candidate.engine) {
      this.disposeEngine(candidate.engine);
    }
  }

  private initStartupFallback(targetName: EngineName, config: Settings): void {
    const candidate = this.builders.createEngine(targetName, config, (msg) => this.log(msg));
    const pending: PendingCandidate = {
      target: targetName,
      engine: candidate,
      since: Date.now(),
      stage: "failed",
      error: `設定された音声エンジン "${targetName}" に接続できませんでした。`,
      config,
      isStartupFallback: true,
    };
    this.pendingCandidate = pending;
    this.scheduleReProbe(pending);
  }

  private handleStoreChange(next: Settings, prev: Settings): void {
    if (this.stopped) return;

    this.handlePrimaryStoreChange(next, prev);
    this.handleEnglishStoreChange(next, prev);
  }

  private handlePrimaryStoreChange(next: Settings, prev: Settings): void {
    const activePrimaryName = this.holder.current().primaryName;
    const primaryEngineChanged = didKeyChange(next, prev, "TTS_ENGINE");

    let primaryInputChanged = false;
    for (const def of CONFIG_SETTINGS) {
      if (def.engineInput?.primary?.includes(activePrimaryName)) {
        if (didKeyChange(next, prev, def.key)) {
          primaryInputChanged = true;
          break;
        }
      }
    }

    // Start-up fallback special handling (R3-2):
    // when running on a fallback, the configured engine is kept re-probing in failed stage.
    // Changing fallback inputs rebuilds the active fallback engine without cancelling the probe candidate.
    if (this.pendingCandidate?.isStartupFallback) {
      if (primaryEngineChanged) {
        this.startRebuildPrimary(next.TTS_ENGINE, next);
        return;
      }
      if (primaryInputChanged) {
        this.rebuildActiveFallback(activePrimaryName, next);
        return;
      }
      if (!areSettingsEqualForEngine(next, this.pendingCandidate.config, this.pendingCandidate.target)) {
        this.pendingCandidate.config = next;
      }
      return;
    }

    // Check supersede back to current (M4)
    if (this.pendingCandidate) {
      if (areSettingsEqualForEngine(next, this.activePrimarySettings, activePrimaryName)) {
        // Reverted to current running values -> cancel rebuild
        this.cancelPendingPrimary();
        return;
      }

      // Check if candidate needs update (supersede with new values)
      if (primaryEngineChanged || !areSettingsEqualForEngine(next, this.pendingCandidate.config, this.pendingCandidate.target)) {
        this.startRebuildPrimary(next.TTS_ENGINE, next);
        return;
      }

      return;
    }

    if (primaryEngineChanged || primaryInputChanged) {
      this.startRebuildPrimary(next.TTS_ENGINE, next);
    }
  }

  private rebuildActiveFallback(targetName: EngineName, next: Settings): void {
    const candidate = this.builders.createEngine(targetName, next, (msg) => this.log(msg));
    this.activePrimarySettings = next;
    if (this.queue.isIdle()) {
      const oldSet = this.holder.current();
      const oldPrimary = oldSet.primary;
      this.holder.replace({
        ...oldSet,
        primary: candidate,
        primaryName: targetName,
      });
      this.queue.setDefaultEngine(candidate);
      this.retireEngine(oldPrimary);
    } else {
      let swapped = false;
      const unsub = this.queue.onIdle(() => {
        if (swapped) return;
        if (this.queue.isIdle()) {
          swapped = true;
          unsub();
          const oldSet = this.holder.current();
          const oldPrimary = oldSet.primary;
          this.holder.replace({
            ...oldSet,
            primary: candidate,
            primaryName: targetName,
          });
          this.queue.setDefaultEngine(candidate);
          this.retireEngine(oldPrimary);
        }
      });
    }
  }

  private startRebuildPrimary(targetName: EngineName, next: Settings): void {
    this.cancelPendingPrimary();

    const candidate = this.builders.createEngine(targetName, next, (msg) => this.log(msg));
    const pending: PendingCandidate = {
      target: targetName,
      engine: candidate,
      since: Date.now(),
      stage: "probing",
      config: next,
    };
    this.pendingCandidate = pending;

    this.probePrimaryCandidate(pending);
  }

  private async probePrimaryCandidate(pending: PendingCandidate): Promise<void> {
    let available = false;
    try {
      available = await pending.engine.isAvailable();
    } catch {
      available = false;
    }

    if (this.stopped || this.pendingCandidate !== pending) {
      return;
    }

    if (available) {
      pending.stage = "waiting";
      delete pending.error;

      // Start 60 s cut-over timer (Q72-1 (b))
      this.scheduleCutOver(pending);

      if (this.queue.isIdle()) {
        this.swapPrimary(pending);
      } else {
        const unsub = this.queue.onIdle(() => {
          if (this.pendingCandidate === pending && this.queue.isIdle()) {
            if (pending.unregisterIdle) {
              pending.unregisterIdle();
              pending.unregisterIdle = undefined;
            }
            this.swapPrimary(pending);
          }
        });
        pending.unregisterIdle = unsub;
      }
    } else {
      pending.stage = "failed";
      pending.error = `音声エンジン "${pending.target}" に接続できませんでした。`;
      this.scheduleReProbe(pending);
    }
  }

  private scheduleReProbe(pending: PendingCandidate): void {
    if (pending.timerId !== undefined) {
      this.scheduler.clearTimeout(pending.timerId);
      pending.timerId = undefined;
    }

    pending.timerId = this.scheduler.setTimeout(async () => {
      pending.timerId = undefined;
      if (this.stopped || this.pendingCandidate !== pending) return;

      let available = false;
      try {
        available = await pending.engine.isAvailable();
      } catch {
        available = false;
      }

      if (this.stopped || this.pendingCandidate !== pending) return;

      if (available) {
        pending.stage = "waiting";
        delete pending.error;
        this.scheduleCutOver(pending);

        if (this.queue.isIdle()) {
          this.swapPrimary(pending);
        } else {
          const unsub = this.queue.onIdle(() => {
            if (this.pendingCandidate === pending && this.queue.isIdle()) {
              if (pending.unregisterIdle) {
                pending.unregisterIdle();
                pending.unregisterIdle = undefined;
              }
              this.swapPrimary(pending);
            }
          });
          pending.unregisterIdle = unsub;
        }
      } else {
        this.scheduleReProbe(pending);
      }
    }, 10000);
  }

  private scheduleCutOver(pending: PendingCandidate): void {
    if (pending.cutOverTimerId !== undefined) return;

    pending.cutOverTimerId = this.scheduler.setTimeout(() => {
      pending.cutOverTimerId = undefined;
      if (this.stopped || this.pendingCandidate !== pending) return;
      if (pending.stage === "waiting") {
        this.swapPrimary(pending);
      }
    }, 60000);
  }

  private swapPrimary(pending: PendingCandidate): void {
    if (pending.timerId !== undefined) {
      this.scheduler.clearTimeout(pending.timerId);
      pending.timerId = undefined;
    }
    if (pending.cutOverTimerId !== undefined) {
      this.scheduler.clearTimeout(pending.cutOverTimerId);
      pending.cutOverTimerId = undefined;
    }
    if (pending.unregisterIdle) {
      pending.unregisterIdle();
      pending.unregisterIdle = undefined;
    }

    const oldSet = this.holder.current();
    const oldPrimary = oldSet.primary;

    const newSet: EngineSet = {
      ...oldSet,
      primary: pending.engine,
      primaryName: pending.target,
    };
    this.holder.replace(newSet);
    this.queue.setDefaultEngine(pending.engine);

    this.activePrimarySettings = pending.config;
    this.pendingCandidate = null;

    this.retireEngine(oldPrimary);
  }

  private handleEnglishStoreChange(next: Settings, prev: Settings): void {
    const prevNeeded = prev.FOREIGN_LANGUAGE_MODE === "NATIVE" || prev.BILINGAL_MODE;
    const nextNeeded = next.FOREIGN_LANGUAGE_MODE === "NATIVE" || next.BILINGAL_MODE;

    // Case 1: Need turned OFF
    if (prevNeeded && !nextNeeded) {
      this.cancelPendingEnglish();
      const current = this.holder.current();
      const oldEnglish = current.english;
      this.holder.replace({
        ...current,
        english: undefined,
        englishName: undefined,
      });
      if (oldEnglish) {
        this.retireEngine(oldEnglish);
      }
      this.activeEnglishSettings = next;
      return;
    }

    // Case 2: Need turned ON while currently no English engine exists (Q72-2 (c))
    if (!prevNeeded && nextNeeded) {
      this.cancelPendingEnglish();
      this.addEnglishEngine(next);
      return;
    }

    // Case 3: Need was ON and remains ON
    if (prevNeeded && nextNeeded) {
      const activeEnglishName = this.holder.current().englishName;
      const englishEngineChanged = didKeyChange(next, prev, "ENGLISH_TTS_ENGINE");

      let englishInputChanged = false;
      if (activeEnglishName) {
        for (const def of CONFIG_SETTINGS) {
          if (def.engineInput?.english?.includes(activeEnglishName as EnglishEngineName)) {
            if (didKeyChange(next, prev, def.key)) {
              englishInputChanged = true;
              break;
            }
          }
        }
      }

      if (this.englishPendingCandidate) {
        if (
          activeEnglishName &&
          areSettingsEqualForEnglishEngine(next, this.activeEnglishSettings, activeEnglishName as EnglishEngineName)
        ) {
          this.cancelPendingEnglish();
          return;
        }

        if (
          englishEngineChanged ||
          !areSettingsEqualForEnglishEngine(next, this.englishPendingCandidate.config, this.englishPendingCandidate.target)
        ) {
          this.startRebuildEnglish(next.ENGLISH_TTS_ENGINE, next);
          return;
        }
        return;
      }

      if (englishEngineChanged || englishInputChanged) {
        this.startRebuildEnglish(next.ENGLISH_TTS_ENGINE, next);
      }
    }
  }

  private addEnglishEngine(next: Settings): void {
    const candidate = this.builders.createEnglishEngine(
      next,
      process.platform,
      (msg) => this.log(msg)
    );

    if (!candidate) {
      // e.g. Mac off darwin
      this.holder.replace({
        ...this.holder.current(),
        english: undefined,
        englishName: undefined,
      });
      this.activeEnglishSettings = next;
      return;
    }

    const pending: EnglishPendingCandidate = {
      target: next.ENGLISH_TTS_ENGINE,
      engine: candidate,
      since: Date.now(),
      stage: "probing",
      config: next,
      isAddition: true,
    };
    this.englishPendingCandidate = pending;

    // Probe in background; while probing, holder has no English engine so KATAKANA guard applies
    this.probeEnglishAddition(pending);
  }

  private async probeEnglishAddition(pending: EnglishPendingCandidate): Promise<void> {
    let available = false;
    try {
      available = pending.engine ? await pending.engine.isAvailable() : false;
    } catch {
      available = false;
    }

    if (this.stopped || this.englishPendingCandidate !== pending) return;

    if (available && pending.engine) {
      this.englishPendingCandidate = null;
      // Addition: apply at once (no idle wait)
      this.holder.replace({
        ...this.holder.current(),
        english: pending.engine,
        englishName: pending.target,
      });
      this.activeEnglishSettings = pending.config;
    } else {
      pending.stage = "failed";
      pending.error = `英語音声エンジン "${pending.target}" に接続できませんでした。`;
      this.scheduleReProbeEnglish(pending);
    }
  }

  private startRebuildEnglish(targetName: EnglishEngineName, next: Settings): void {
    this.cancelPendingEnglish();

    const candidate = this.builders.createEnglishEngine(
      next,
      process.platform,
      (msg) => this.log(msg)
    );

    if (!candidate) {
      this.holder.replace({
        ...this.holder.current(),
        english: undefined,
        englishName: undefined,
      });
      this.activeEnglishSettings = next;
      return;
    }

    const pending: EnglishPendingCandidate = {
      target: targetName,
      engine: candidate,
      since: Date.now(),
      stage: "probing",
      config: next,
      isAddition: false,
    };
    this.englishPendingCandidate = pending;

    this.probeEnglishSwap(pending);
  }

  private async probeEnglishSwap(pending: EnglishPendingCandidate): Promise<void> {
    let available = false;
    try {
      available = pending.engine ? await pending.engine.isAvailable() : false;
    } catch {
      available = false;
    }

    if (this.stopped || this.englishPendingCandidate !== pending) return;

    if (available && pending.engine) {
      pending.stage = "waiting";
      delete pending.error;

      // 60 s cut-over timer
      pending.cutOverTimerId = this.scheduler.setTimeout(() => {
        pending.cutOverTimerId = undefined;
        if (this.stopped || this.englishPendingCandidate !== pending) return;
        if (pending.stage === "waiting") {
          this.swapEnglish(pending);
        }
      }, 60000);

      if (this.queue.isIdle()) {
        this.swapEnglish(pending);
      } else {
        const unsub = this.queue.onIdle(() => {
          if (this.englishPendingCandidate === pending && this.queue.isIdle()) {
            if (pending.unregisterIdle) {
              pending.unregisterIdle();
              pending.unregisterIdle = undefined;
            }
            this.swapEnglish(pending);
          }
        });
        pending.unregisterIdle = unsub;
      }
    } else {
      pending.stage = "failed";
      pending.error = `英語音声エンジン "${pending.target}" に接続できませんでした。`;
      this.scheduleReProbeEnglish(pending);
    }
  }

  private scheduleReProbeEnglish(pending: EnglishPendingCandidate): void {
    if (pending.timerId !== undefined) {
      this.scheduler.clearTimeout(pending.timerId);
      pending.timerId = undefined;
    }

    pending.timerId = this.scheduler.setTimeout(async () => {
      pending.timerId = undefined;
      if (this.stopped || this.englishPendingCandidate !== pending) return;

      let available = false;
      try {
        available = pending.engine ? await pending.engine.isAvailable() : false;
      } catch {
        available = false;
      }

      if (this.stopped || this.englishPendingCandidate !== pending) return;

      if (available && pending.engine) {
        if (pending.isAddition) {
          this.englishPendingCandidate = null;
          this.holder.replace({
            ...this.holder.current(),
            english: pending.engine,
            englishName: pending.target,
          });
          this.activeEnglishSettings = pending.config;
        } else {
          pending.stage = "waiting";
          delete pending.error;

          pending.cutOverTimerId = this.scheduler.setTimeout(() => {
            pending.cutOverTimerId = undefined;
            if (this.stopped || this.englishPendingCandidate !== pending) return;
            if (pending.stage === "waiting") {
              this.swapEnglish(pending);
            }
          }, 60000);

          if (this.queue.isIdle()) {
            this.swapEnglish(pending);
          } else {
            const unsub = this.queue.onIdle(() => {
              if (this.englishPendingCandidate === pending && this.queue.isIdle()) {
                if (pending.unregisterIdle) {
                  pending.unregisterIdle();
                  pending.unregisterIdle = undefined;
                }
                this.swapEnglish(pending);
              }
            });
            pending.unregisterIdle = unsub;
          }
        }
      } else {
        this.scheduleReProbeEnglish(pending);
      }
    }, 10000);
  }

  private swapEnglish(pending: EnglishPendingCandidate): void {
    if (pending.cutOverTimerId !== undefined) {
      this.scheduler.clearTimeout(pending.cutOverTimerId);
      pending.cutOverTimerId = undefined;
    }
    if (pending.unregisterIdle) {
      pending.unregisterIdle();
      pending.unregisterIdle = undefined;
    }

    const oldSet = this.holder.current();
    const oldEnglish = oldSet.english;

    this.holder.replace({
      ...oldSet,
      english: pending.engine,
      englishName: pending.target,
    });

    this.activeEnglishSettings = pending.config;
    this.englishPendingCandidate = null;

    if (oldEnglish) {
      this.retireEngine(oldEnglish);
    }
  }
}
