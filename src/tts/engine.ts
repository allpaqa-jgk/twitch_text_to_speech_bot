export interface PreparedAudio {
  play(): Promise<void>;
}

export interface SpeechOptions {
  speedScale?: number;
}

export interface TTSEngine {
  readonly name: string;
  isAvailable(): Promise<boolean>;
  say(text: string, options?: SpeechOptions): Promise<void>;
  prepare?(text: string, options?: SpeechOptions): Promise<PreparedAudio>;
  stop?(): Promise<void> | void;
}
