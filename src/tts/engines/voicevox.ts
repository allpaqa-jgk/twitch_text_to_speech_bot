import type { TTSEngine } from "../engine";
import { config } from "../../config";
import { playWavBuffer } from "../audioPlayer";

export class VoicevoxEngine implements TTSEngine {
  public readonly name = "VOICEVOX";

  private host: string;
  private port: number;
  private speakerId: number;

  constructor() {
    this.host = config.VOICEVOX_HOST;
    this.port = config.VOICEVOX_PORT;
    this.speakerId = config.VOICEVOX_SPEAKER_ID;
  }

  private get baseUrl(): string {
    return `http://${this.host}:${this.port}`;
  }

  public async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/version`, { method: "GET" });
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
    });
    if (!res.ok) {
      throw new Error(`VOICEVOX synthesis failed with status ${res.status}`);
    }
    return await res.arrayBuffer();
  }

  public async say(text: string): Promise<void> {
    if (!text || !text.trim()) {
      return;
    }

    const audioQuery = await this.fetchAudioQuery(text);
    const wavBuffer = await this.fetchSynthesis(audioQuery);
    await playWavBuffer(wavBuffer);
  }
}
