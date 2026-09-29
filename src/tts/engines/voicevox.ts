import type { TTSEngine, PreparedAudio, SpeechOptions } from "../engine";
import { playWavBuffer } from "../audioPlayer";

export interface VoicevoxEngineOptions {
  host?: string;
  port?: number;
  speakerId?: number;
  speedScale?: number;
  volumeScale?: number;
  masterVolume?: number;
  outputSamplingRate?: number;
}

export class VoicevoxEngine implements TTSEngine {
  public readonly name = "VOICEVOX";

  private host: string;
  private port: number;
  private speakerId: number;
  private speedScale: number;
  private volumeScale: number;
  private outputSamplingRate: number;

  constructor(options: VoicevoxEngineOptions = {}) {
    this.host = options.host ?? "127.0.0.1";
    this.port = options.port ?? 50021;
    this.speakerId = options.speakerId ?? 1;
    this.speedScale = options.speedScale ?? 1;
    const effectiveVolume = (options.volumeScale ?? 1) * (options.masterVolume ?? 1);
    this.volumeScale = Math.min(1.0, Math.max(0.0, Math.round(effectiveVolume * 1000) / 1000));
    this.outputSamplingRate = options.outputSamplingRate ?? 24000;
  }

  private get baseUrl(): string {
    return `http://${this.host}:${this.port}`;
  }

  public async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/version`, {
        method: "GET",
        signal: AbortSignal.timeout(1500),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  private async fetchAudioQuery(text: string): Promise<any> {
    const params = new URLSearchParams({
      text,
      speaker: String(this.speakerId),
    });
    const res = await fetch(`${this.baseUrl}/audio_query?${params.toString()}`, {
      method: "POST",
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      throw new Error(`VOICEVOX audio_query failed with status ${res.status}`);
    }
    return await res.json();
  }

  private async fetchSynthesis(audioQuery: any): Promise<ArrayBuffer> {
    const params = new URLSearchParams({
      speaker: String(this.speakerId),
      enable_interrogative_upspeak: "true",
    });
    const res = await fetch(`${this.baseUrl}/synthesis?${params.toString()}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "audio/wav",
      },
      body: JSON.stringify(audioQuery),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      throw new Error(`VOICEVOX synthesis failed with status ${res.status}`);
    }
    return await res.arrayBuffer();
  }

  public async prepare(text: string, options?: SpeechOptions): Promise<PreparedAudio> {
    if (!text || !text.trim()) {
      return { play: async () => {} };
    }

    const audioQuery = await this.fetchAudioQuery(text);
    audioQuery.speedScale = Math.min(
      2.0,
      Math.max(0.5, (this.speedScale ?? 1.0) * (options?.speedScale ?? 1.0))
    );
    if (this.volumeScale != null) audioQuery.volumeScale = this.volumeScale;
    if (this.outputSamplingRate != null) audioQuery.outputSamplingRate = this.outputSamplingRate;
    const wavBuffer = await this.fetchSynthesis(audioQuery);
    return {
      play: () => playWavBuffer(wavBuffer),
    };
  }

  public async say(text: string, options?: SpeechOptions): Promise<void> {
    const audio = await this.prepare(text, options);
    await audio.play();
  }
}
