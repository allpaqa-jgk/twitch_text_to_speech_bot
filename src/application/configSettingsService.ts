import fs from "fs";
import path from "path";
import { baseConfig, parseConfig, type BotConfig } from "../config";
import {
  CONFIG_SETTINGS,
  getEffectiveApplyMode,
  parseConfigSettings,
  settingsForPlatform,
  type ConfigSettingDefinition,
  type SettingApplyMode,
} from "../configSettings";
import { paths } from "../paths";
import { SettingsStore, settingsStore } from "../settingsStore";
import type { EngineHolder } from "../tts/engineHolder";
import type { EngineManager, EnginePendingInfo, EnglishPendingInfo } from "../tts/engineManager";

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
  nextStartKeys: Array<keyof BotConfig>;
  enginePending?: EnginePendingInfo | null;
  englishEnginePending?: EnglishPendingInfo | null;
}

export class ConfigSettingsService {
  private readonly filePath: string;
  private readonly store: SettingsStore;
  private readonly defaults: BotConfig;
  private readonly platform: string;
  private readonly engineHolder?: EngineHolder;
  private readonly engineManager?: EngineManager;

  constructor(
    filePath = paths.webSettingsJson(),
    store: SettingsStore = settingsStore,
    defaults: BotConfig = baseConfig,
    platform: string = process.platform,
    engineHolder?: EngineHolder,
    engineManager?: EngineManager
  ) {
    this.filePath = filePath;
    this.store = store;
    this.defaults = { ...defaults };
    this.platform = platform;
    this.engineHolder = engineHolder;
    this.engineManager = engineManager;
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
        if (this.canEnterStore(definition)) {
          this.setOverride(patch, key, validated[key]);
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
      if (this.canEnterStore(definition)) {
        const patch: Partial<BotConfig> = {};
        this.setOverride(patch, definition.key, validated[definition.key]);
        this.store.apply(patch);
      }
      return this.createSnapshot(validated, overrides);
    }

    const previousOverrides = this.readOverrides();
    this.writeOverrides({});
    const patch: Partial<BotConfig> = {};
    for (const definition of CONFIG_SETTINGS) {
      const k = definition.key;
      if (Object.prototype.hasOwnProperty.call(previousOverrides, k)) {
        if (this.canEnterStore(definition)) {
          this.setOverride(patch, k, this.defaults[k]);
        }
      }
    }
    if (Object.keys(patch).length > 0) {
      this.store.apply(patch);
    }
    return this.createSnapshot(this.defaults, {});
  }

  private canEnterStore(definition: ConfigSettingDefinition): boolean {
    return getEffectiveApplyMode(definition) === "live";
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

  private isRestartBound(definition: ConfigSettingDefinition): boolean {
    return getEffectiveApplyMode(definition) === "restart";
  }

  private createSnapshot(
    effectiveConfig: BotConfig,
    overrides: Partial<BotConfig>
  ): ConfigSettingsSnapshot {
    const settings = settingsForPlatform(this.platform).map((definition) => {
      const { platforms: _platforms, optionPlatforms: _optionPlatforms, ...rest } = definition;
      return {
        ...rest,
        apply: getEffectiveApplyMode(definition),
        value: effectiveConfig[definition.key] ?? null,
        defaultValue: this.defaults[definition.key] ?? null,
        isOverridden:
          Object.prototype.hasOwnProperty.call(overrides, definition.key) &&
          !sameSettingValue(overrides[definition.key], this.defaults[definition.key]),
      };
    });

    const restartKeys: Array<keyof BotConfig> = [];
    const nextStartKeys: Array<keyof BotConfig> = [];
    for (const definition of CONFIG_SETTINGS) {
      const key = definition.key;
      if (!sameSettingValue(effectiveConfig[key], this.store.start[key])) {
        if (this.isRestartBound(definition)) {
          restartKeys.push(key);
        } else if (getEffectiveApplyMode(definition) === "next-start") {
          nextStartKeys.push(key);
        }
      }
    }
    const restartRequired = restartKeys.length > 0;
    const enginePending = this.engineManager?.pending() ?? null;
    const englishEnginePending = this.engineManager?.englishPending() ?? null;
    return { settings, restartRequired, restartKeys, nextStartKeys, enginePending, englishEnginePending };
  }
}
