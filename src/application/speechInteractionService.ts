import type { TTSQueue } from "../tts/queue";
import type { TextTransformer } from "../tts/transformers/types";
import { enqueueDemo } from "../tts/demo";
import { detectLanguage } from "../text/languageDetector";

export interface SpeechQueueControl {
  clear(): void;
  enqueue: TTSQueue["enqueue"];
}

export interface PreviewLine {
  line: number;
  original: string;
  transformed: string;
  lang: string;
}

export class SpeechInteractionService {
  constructor(
    private readonly queue: SpeechQueueControl,
    private readonly transformer?: TextTransformer
  ) {}

  public clearQueue(): void {
    this.queue.clear();
  }

  public enqueueDemo(): Promise<void> {
    return enqueueDemo(this.queue, this.transformer);
  }

  public async preview(lines: string[]): Promise<PreviewLine[]> {
    const results: PreviewLine[] = [];
    for (let index = 0; index < lines.length; index++) {
      const original = lines[index];
      const trimmed = original.trim();
      const lang = detectLanguage(trimmed);
      const transformed = trimmed
        ? (this.transformer ? await this.transformer.transform(trimmed) : trimmed)
        : "";
      results.push({
        line: index + 1,
        original,
        transformed,
        lang,
      });
    }
    return results;
  }
}
