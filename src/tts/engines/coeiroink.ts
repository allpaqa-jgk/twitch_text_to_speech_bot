import type { TTSEngine } from "../engine";
import { config } from "../../config";
import { playWavBuffer } from "../audioPlayer";
import fs from "fs";
import path from "path";
import os from "os";

interface CoeiroinkDictionaryWord {
  word: string;
  yomi: string;
  accent: number;
  numMoras: number;
}

interface CoeiroinkDictionaryStore {
  dictionary?: CoeiroinkDictionaryWord[];
}

interface CoeiroinkSpeakerMeta {
  speakerUuid: string;
}

interface CoeiroinkProsodyDetail {
  [key: string]: unknown;
}

export class CoeiroinkEngine implements TTSEngine {
  public readonly name = "COEIROINK";

  private host: string;
  private port: number;
  private styleId: number;
  private speakerUuidConfig?: string;
  private speedScale: number;
  private volumeScale: number;
  private outputSamplingRate: number;
  private pauseLength: number;

  private speakerUuidCache: Map<number, string> = new Map();
  private lastDictionaryMtime: number | null = null;

  constructor() {
    this.host = config.COEIROINK_HOST;
    this.port = config.COEIROINK_PORT;
    this.styleId = config.COEIROINK_STYLE_ID;
    this.speakerUuidConfig = config.COEIROINK_SPEAKER_UUID;
    this.speedScale = config.COEIROINK_SPEED_SCALE;
    const effectiveVolume = (config.COEIROINK_VOLUME_SCALE ?? 1.0) * (config.MASTER_VOLUME ?? 1.0);
    this.volumeScale = Math.min(1.0, Math.max(0.0, Math.round(effectiveVolume * 1000) / 1000));
    this.outputSamplingRate = config.COEIROINK_OUTPUT_SAMPLING_RATE ?? 44100;
    this.pauseLength = config.COEIROINK_PAUSE_LENGTH ?? 0.04;
  }

  private get baseUrl(): string {
    return `http://${this.host}:${this.port}`;
  }

  public async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/v1/speakers`, {
        method: "GET",
        signal: AbortSignal.timeout(1500),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  private getDictionaryStorePath(): string {
    if (process.platform === "darwin") {
      return path.join(
        os.homedir(),
        "Library/Application Support/coeiroink-v2/dictionaryStore.json"
      );
    } else if (process.platform === "win32") {
      return path.join(
        process.env.APPDATA || "",
        "coeiroink-v2/dictionaryStore.json"
      );
    }
    return path.join(os.homedir(), ".config/coeiroink-v2/dictionaryStore.json");
  }

  private async syncDictionary(): Promise<void> {
    const dictPath = this.getDictionaryStorePath();
    if (!fs.existsSync(dictPath)) {
      return;
    }

    try {
      const stats = fs.statSync(dictPath);
      if (this.lastDictionaryMtime && stats.mtimeMs <= this.lastDictionaryMtime) {
        return;
      }

      const dictContent = fs.readFileSync(dictPath, "utf-8");
      const dictData = JSON.parse(dictContent) as CoeiroinkDictionaryStore;
      const words: CoeiroinkDictionaryWord[] = [];
      if (Array.isArray(dictData.dictionary)) {
        for (const item of dictData.dictionary) {
          if (
            item.word &&
            item.yomi &&
            item.accent != null &&
            item.numMoras != null
          ) {
            words.push({
              word: item.word,
              yomi: item.yomi,
              accent: item.accent,
              numMoras: item.numMoras,
            });
          }
        }
      }

      const res = await fetch(`${this.baseUrl}/v1/set_dictionary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dictionaryWords: words }),
      });

      if (res.ok) {
        this.lastDictionaryMtime = stats.mtimeMs;
      }
    } catch (err: any) {
      const errStr = String(err?.message || err);
      const isConnectionRefused =
        err?.code === "ConnectionRefused" ||
        err?.errno === 0 ||
        errStr.includes("ConnectionRefused") ||
        errStr.includes("Unable to connect") ||
        errStr.includes("fetch failed");

      if (!isConnectionRefused) {
        console.warn("[CoeiroinkEngine] Dictionary sync error:", err?.message || err);
      }
    }
  }

  private async getSpeakerUuid(styleId: number): Promise<string> {
    if (this.speakerUuidConfig) {
      return this.speakerUuidConfig;
    }
    if (this.speakerUuidCache.has(styleId)) {
      return this.speakerUuidCache.get(styleId)!;
    }

    const res = await fetch(
      `${this.baseUrl}/v1/style_id_to_speaker_meta?styleId=${styleId}`,
      { method: "POST" }
    );
    if (!res.ok) {
      throw new Error(`Failed to resolve speakerUuid for styleId ${styleId} (Status: ${res.status})`);
    }

    const data = await res.json() as CoeiroinkSpeakerMeta;
    if (!data?.speakerUuid) {
      throw new Error(`Invalid speaker meta returned for styleId ${styleId}`);
    }

    this.speakerUuidCache.set(styleId, data.speakerUuid);
    return data.speakerUuid;
  }

  private async fetchEstimateProsody(text: string): Promise<CoeiroinkProsodyDetail[]> {
    const res = await fetch(`${this.baseUrl}/v1/estimate_prosody`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    if (!res.ok) {
      throw new Error(`estimate_prosody failed with status ${res.status}`);
    }

    const data = await res.json() as { detail: CoeiroinkProsodyDetail[] };
    return data.detail;
  }

  private async fetchSynthesis(
    text: string,
    prosodyDetail: CoeiroinkProsodyDetail[],
    speakerUuid: string,
    styleId: number
  ): Promise<ArrayBuffer> {
    const body = {
      speakerUuid,
      styleId,
      text,
      prosodyDetail,
      speedScale: this.speedScale,
      volumeScale: this.volumeScale,
      pitchScale: 0.0,
      intonationScale: 1.0,
      prePhonemeLength: 0.1,
      postPhonemeLength: 0.1,
      pauseLength: this.pauseLength,
      outputSamplingRate: this.outputSamplingRate,
    };

    const res = await fetch(`${this.baseUrl}/v1/synthesis`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "audio/wav",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`synthesis failed with status ${res.status}`);
    }

    return await res.arrayBuffer();
  }

  public async say(text: string): Promise<void> {
    if (!text || !text.trim()) {
      return;
    }

    await this.syncDictionary();
    const speakerUuid = await this.getSpeakerUuid(this.styleId);
    const prosodyDetail = await this.fetchEstimateProsody(text);
    const wavBuffer = await this.fetchSynthesis(
      text,
      prosodyDetail,
      speakerUuid,
      this.styleId
    );

    await playWavBuffer(wavBuffer);
  }
}
