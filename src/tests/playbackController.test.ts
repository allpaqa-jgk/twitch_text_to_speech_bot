import { describe, expect, it } from "bun:test";
import { AudioPlaybackController } from "../tts/playbackController";
import type { TTSEngine } from "../tts/engine";

describe("AudioPlaybackController", () => {
  it("delegates prepared audio playback", async () => {
    const played: string[] = [];
    const controller = new AudioPlaybackController(() => {});

    await controller.play({
      play: async () => {
        played.push("played");
      },
    });

    expect(played).toEqual(["played"]);
  });

  it("cancels active audio and invokes the active engine stop hook", () => {
    let audioStopped = false;
    let engineStopped = false;
    const controller = new AudioPlaybackController(() => {
      audioStopped = true;
    });
    const engine: TTSEngine = {
      name: "MockEngine",
      isAvailable: async () => true,
      say: async () => {},
      stop: () => {
        engineStopped = true;
      },
    };

    controller.cancel(engine);

    expect(audioStopped).toBe(true);
    expect(engineStopped).toBe(true);
  });
});
