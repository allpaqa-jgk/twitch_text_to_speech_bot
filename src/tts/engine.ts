export interface PreparedAudio {
  play(): Promise<void>;
}

export interface TTSEngine {
  readonly name: string;
  isAvailable(): Promise<boolean>;
  say(text: string): Promise<void>;
  prepare?(text: string): Promise<PreparedAudio>;
  stop?(): Promise<void> | void;
}
