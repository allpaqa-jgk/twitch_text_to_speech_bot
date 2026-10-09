import fs from "fs";
import path from "path";
import { baseConfig, parseConfig, type BotConfig } from "../config";
import {
  CONFIG_SETTINGS,
  parseConfigSettings,
  settingsForPlatform,
  type ConfigSettingDefinition,
  type SettingApplyMode,
} from "../configSettings";
import { paths } from "../paths";
import { SettingsStore, settingsStore } from "../settingsStore";
import type { EngineHolder } from "../tts/engineHolder";

function sameSettingValue(first: unknown, second: unknown): boolean {
  return Object.is(first, second) || (first == null && second == null);
}

export class SettingsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SettingsValidationError";
  }
}

export interface ConfigSettingsSnapshot {
  settings: Array<{
    key: keyof BotConfig;
    label: string;
    group: string;
    type: "text" | "number" | "boolean" | "select";
    value: string | number | boolean | null;
    defaultValue: string | number | boolean | null;
    isOverridden: boolean;
    options?: readonly string[];
    min?: number;
    max?: number;
    step?: number;
    nullable?: boolean;
    apply: SettingApplyMode;
  }>;
  restartRequired: boolean;
  restartKeys: Array<keyof BotConfig>;
}

export class ConfigSettingsService {
  private readonly filePath: string;
  private readonly store: SettingsStore;
  private readonly defaults: BotConfig;
  private readonly platform: string;
  private readonly engineHolder?: EngineHolder;

  constructor(
    filePath = paths.webSettingsJson(),
    store: SettingsStore | BotConfig = settingsStore,
    defaults: BotConfig = baseConfig,
    platform: string = process.platform,
    engineHolder?: EngineHolder
  ) {
    this.filePath = filePath;
    this.store = store instanceof SettingsStore ? store : new SettingsStore(store as BotConfig);
    this.defaults = { ...defaults };
    this.platform = typeof platform === "string" ? platform : process.platform;
    this.engineHolder = engineHolder;
  }

  public getSnapshot(): ConfigSettingsSnapshot {
    const overrides = this.readOverrides();
    const effectiveConfig = this.validate({ ...this.defaults, ...overrides });
    return this.createSnapshot(effectiveConfig, overrides);
  }

  public update(updatesValue: unknown): ConfigSettingsSnapshot {
    let updates: Partial<BotConfig>;
    try {
      if (
        updatesValue !== null &&
        typeof updatesValue === "object" &&
        !Array.isArray(updatesValue)
      ) {
        const editableKeys = new Set(CONFIG_SETTINGS.map(({ key }) => key));
        const protectedKey = Object.keys(updatesValue).find((key) => !editableKeys.has(key as keyof BotConfig));
        if (protectedKey) {
          throw new SettingsValidationError(`Setting "${protectedKey}" cannot be edited from the Web UI.`);
        }
      }
      updates = parseConfigSettings(updatesValue, "settings");
      if (Object.keys(updates).length === 0) {
        throw new SettingsValidationError("At least one setting is required.");
      }
    } catch (error) {
      if (error instanceof SettingsValidationError) throw error;
      throw new SettingsValidationError(error instanceof Error ? error.message : String(error));
    }

    for (const definition of CONFIG_SETTINGS) {
      const key = definition.key;
      if (!Object.prototype.hasOwnProperty.call(updates, key)) continue;
      const value = updates[key];
      if (
        typeof value === "number" &&
        Number.isFinite(value) &&
        ((definition.min !== undefined && value < definition.min) ||
          (definition.max !== undefined && value > definition.max))
      ) {
        throw new SettingsValidationError(
          `${key} must be a number between ${definition.min} and ${definition.max}.`
        );
      }
    }

    const updatedOverrides = { ...this.readOverrides() };
    for (const definition of CONFIG_SETTINGS) {
      const key = definition.key;
      if (!Object.prototype.hasOwnProperty.call(updates, key)) continue;
      const value = updates[key];
      if (sameSettingValue(value, this.defaults[key])) {
        delete updatedOverrides[key];
      } else {
        this.setOverride(updatedOverrides, key, value);
      }
    }
    const validated = this.validate({ ...this.defaults, ...updatedOverrides });
    this.writeOverrides(updatedOverrides);

    // Apply only request keys, filtered to what enters the store in PR 1
    const patch: Partial<BotConfig> = {};
    for (const definition of CONFIG_SETTINGS) {
      const key = definition.key;
      if (Object.prototype.hasOwnProperty.call(updates, key)) {
        if (this.canEnterStoreInPR1(definition)) {
          patch[key] = validated[key] as any;
        }
      }
    }
    if (Object.keys(patch).length > 0) {
      this.store.apply(patch);
    }

    return this.createSnapshot(validated, updatedOverrides);
  }

  public remove(key?: string): ConfigSettingsSnapshot {
    if (key !== undefined) {
      const definition = CONFIG_SETTINGS.find((def) => def.key === key);
      if (!definition) {
        throw new SettingsValidationError(`Unsupported setting "${key}".`);
      }
      const overrides = this.readOverrides();
      delete overrides[key as keyof BotConfig];
      this.writeOverrides(overrides);
      const validated = this.validate({ ...this.defaults, ...overrides });
      if (this.canEnterStoreInPR1(definition)) {
        this.store.apply({ [key]: validated[key as keyof BotConfig] });
      }
      return this.createSnapshot(validated, overrides);
    }

    const previousOverrides = this.readOverrides();
    this.writeOverrides({});
    const patch: Partial<BotConfig> = {};
    for (const definition of CONFIG_SETTINGS) {
      const k = definition.key;
      if (Object.prototype.hasOwnProperty.call(previousOverrides, k)) {
        if (this.canEnterStoreInPR1(definition)) {
          patch[k] = this.defaults[k] as any;
        }
      }
    }
    if (Object.keys(patch).length > 0) {
      this.store.apply(patch);
    }
    return this.createSnapshot(this.defaults, {});
  }

  private canEnterStoreInPR1(definition: ConfigSettingDefinition): boolean {
    return (
      definition.apply === "live" &&
      definition.engineInput === undefined &&
      definition.key !== "BILINGAL_MODE"
    );
  }

  private readOverrides(): Partial<BotConfig> {
    if (!fs.existsSync(this.filePath)) return {};

    let parsed: unknown;
    try {
      parsed = JSON.parse(fs.readFileSync(this.filePath, "utf-8"));
    } catch (error) {
      throw new Error(`Could not read saved settings: ${String(error)}`);
    }
    try {
      const overrides = parseConfigSettings(parsed, this.filePath);
      delete overrides.HTTP_SERVER_ENABLED;
      return overrides;
    } catch (error) {
      throw new Error(`Could not read saved settings: ${String(error)}`);
    }
  }

  private validate(candidate: unknown): BotConfig {
    try {
      return parseConfig(candidate, {});
    } catch (error) {
      throw new SettingsValidationError(
        error instanceof Error ? error.message.replace(/^\[Config\]\s*/, "") : String(error)
      );
    }
  }

  private writeOverrides(overrides: Partial<BotConfig>): void {
    if (Object.keys(overrides).length === 0) {
      if (fs.existsSync(this.filePath)) fs.unlinkSync(this.filePath);
      return;
    }
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(overrides, null, 2)}\n`, {
      encoding: "utf-8",
      mode: 0o600,
    });
    fs.renameSync(temporaryPath, this.filePath);
  }

  private setOverride<K extends keyof BotConfig>(
    overrides: Partial<BotConfig>,
    key: K,
    value: BotConfig[K]
  ): void {
    overrides[key] = value;
  }

  private isRestartBound(
    definition: ConfigSettingDefinition,
    effectiveConfig: BotConfig,
    runningHasEnglishEngine: boolean
  ): boolean {
    if (definition.apply === "restart") return true;
    if (definition.engineInput !== undefined) return true;
    if (definition.key === "BILINGAL_MODE") return true;
    if (definition.key === "FOREIGN_LANGUAGE_MODE") {
      return effectiveConfig.FOREIGN_LANGUAGE_MODE === "NATIVE" && !runningHasEnglishEngine;
    }
    return false;
  }

  private createSnapshot(
    effectiveConfig: BotConfig,
    overrides: Partial<BotConfig>
  ): ConfigSettingsSnapshot {
    const runningHasEnglishEngine = this.engineHolder
      ? Boolean(this.engineHolder.current().english)
      : (this.store.start.FOREIGN_LANGUAGE_MODE === "NATIVE" || this.store.start.BILINGAL_MODE) &&
        (this.store.start.ENGLISH_TTS_ENGINE !== "Mac" || this.platform === "darwin");

    const settings = settingsForPlatform(this.platform).map((definition) => {
      const { platforms: _platforms, optionPlatforms: _optionPlatforms, ...rest } = definition;
      return {
        ...rest,
        value: effectiveConfig[definition.key] ?? null,
        defaultValue: this.defaults[definition.key] ?? null,
        isOverridden:
          Object.prototype.hasOwnProperty.call(overrides, definition.key) &&
          !sameSettingValue(overrides[definition.key], this.defaults[definition.key]),
      };
    });

    const restartKeys: Array<keyof BotConfig> = [];
    for (const definition of CONFIG_SETTINGS) {
      const key = definition.key;
      if (!sameSettingValue(effectiveConfig[key], this.store.start[key])) {
        if (this.isRestartBound(definition, effectiveConfig, runningHasEnglishEngine)) {
          restartKeys.push(key);
        }
      }
    }
    const restartRequired = restartKeys.length > 0;
    return { settings, restartRequired, restartKeys };
  }
}
