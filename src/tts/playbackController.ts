import type { PreparedAudio, TTSEngine } from "./engine";
import { stopAudio } from "./audioPlayer";

export interface PlaybackController {
  play(audio: PreparedAudio): Promise<void>;
  cancel(engine?: TTSEngine): void;
}

export class AudioPlaybackController implements PlaybackController {
  constructor(private readonly stopActiveAudio: () => void = stopAudio) {}

  public play(audio: PreparedAudio): Promise<void> {
    return audio.play();
  }

  public cancel(engine?: TTSEngine): void {
    this.stopActiveAudio();
    try {
      engine?.stop?.();
    } catch {
      // Cancellation should still complete if an engine's stop hook fails.
    }
  }
}
