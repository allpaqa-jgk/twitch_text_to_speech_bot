import sys
import json
import os
import soundfile as sf
import numpy as np
import warnings

# Suppress PyTorch and HuggingFace user warnings for clean logs
warnings.filterwarnings("ignore")

# Automatically set ESPEAK_DATA_PATH on macOS if installed via Homebrew
if sys.platform == "darwin" and "ESPEAK_DATA_PATH" not in os.environ:
    brew_espeak = "/opt/homebrew/share/espeak-ng-data"
    if os.path.exists(brew_espeak):
        os.environ["ESPEAK_DATA_PATH"] = brew_espeak

from kokoro import KPipeline

pipelines = {}

def get_pipeline(lang_code: str):
    if lang_code not in pipelines:
        pipelines[lang_code] = KPipeline(lang_code=lang_code, repo_id="hexgrad/Kokoro-82M")
    return pipelines[lang_code]

def main():
    # Preload English ('a') and Japanese ('j') pipelines
    try:
        get_pipeline("a")
    except Exception as e:
        sys.stderr.write(f"Warning preloading English pipeline: {e}\n")

    sys.stdout.write("READY\n")
    sys.stdout.flush()

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        
        try:
            req = json.loads(line)
            text = req.get("text", "")
            output_path = req.get("outputPath", "")
            lang = req.get("lang", "a")
            default_voice = "af_heart" if lang == "a" else "jf_alpha"
            voice = req.get("voice") or default_voice
            speed = float(req.get("speed", 1.0))

            if not text or not output_path:
                sys.stdout.write(json.dumps({"status": "error", "error": "Empty text or outputPath"}) + "\n")
                sys.stdout.flush()
                continue

            pipeline = get_pipeline(lang)
            generator = pipeline(text, voice=voice, speed=speed)
            audio_segments = []

            for gs, ps, audio in generator:
                if len(audio) > 0:
                    audio_segments.append(audio)

            if len(audio_segments) == 0:
                sys.stdout.write(json.dumps({"status": "error", "error": "No audio generated"}) + "\n")
                sys.stdout.flush()
                continue

            combined = np.concatenate(audio_segments)
            os.makedirs(os.path.dirname(output_path), exist_ok=True)
            sf.write(output_path, combined, 24000)

            sys.stdout.write(json.dumps({"status": "ok", "path": output_path}) + "\n")
            sys.stdout.flush()
        except Exception as e:
            sys.stdout.write(json.dumps({"status": "error", "error": str(e)}) + "\n")
            sys.stdout.flush()

if __name__ == "__main__":
    main()
