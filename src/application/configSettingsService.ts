import fs from "fs";
import path from "path";
import { baseConfig, config, parseConfig, type BotConfig } from "../config";
import { CONFIG_SETTINGS, parseConfigSettings } from "../configSettings";
import { paths } from "../paths";

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
  }>;
  restartRequired: boolean;
}

export class ConfigSettingsService {
  private readonly filePath: string;
  private readonly activeConfig: BotConfig;
  private readonly defaults: BotConfig;

  constructor(
    filePath = paths.webSettingsJson(),
    activeConfig: BotConfig = config,
    defaults: BotConfig = baseConfig
  ) {
    this.filePath = filePath;
    this.activeConfig = { ...activeConfig };
    this.defaults = { ...defaults };
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
    return this.createSnapshot(validated, updatedOverrides);
  }

  public remove(key?: string): ConfigSettingsSnapshot {
    if (key !== undefined) {
      if (!CONFIG_SETTINGS.some((definition) => definition.key === key)) {
        throw new SettingsValidationError(`Unsupported setting "${key}".`);
      }
      const overrides = this.readOverrides();
      delete overrides[key as keyof BotConfig];
      this.writeOverrides(overrides);
      return this.createSnapshot(
        this.validate({ ...this.defaults, ...overrides }),
        overrides
      );
    }

    this.writeOverrides({});
    return this.createSnapshot(this.defaults, {});
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

  private createSnapshot(
    effectiveConfig: BotConfig,
    overrides: Partial<BotConfig>
  ): ConfigSettingsSnapshot {
    const settings = CONFIG_SETTINGS.map((definition) => ({
      ...definition,
      value: effectiveConfig[definition.key] ?? null,
      defaultValue: this.defaults[definition.key] ?? null,
      isOverridden:
        Object.prototype.hasOwnProperty.call(overrides, definition.key) &&
        !sameSettingValue(overrides[definition.key], this.defaults[definition.key]),
    }));
    const restartRequired = CONFIG_SETTINGS.some(
      ({ key }) => !Object.is(effectiveConfig[key], this.activeConfig[key])
    );
    return { settings, restartRequired };
  }
}
