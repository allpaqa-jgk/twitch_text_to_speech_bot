export interface TTSEngine {
  readonly name: string;
  isAvailable(): Promise<boolean>;
  say(text: string): Promise<void>;
}
