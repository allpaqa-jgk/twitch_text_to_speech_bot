import { config } from "../config";

interface StyleInfo {
  id: number;
  name: string;
  speakerName: string;
}

/**
 * Fetch and list all available speakers/styles from COEIROINK or VOICEVOX
 */
export async function printAvailableSpeakers(): Promise<void> {
  const engine = config.TTS_ENGINE;

  console.log("\n======================================================================");
  console.log(`📢 利用可能なボイス・スタイル一覧 (${engine})`);
  console.log("======================================================================");

  if (engine === "COEIROINK") {
    await printCoeiroinkSpeakers();
  } else if (engine === "VOICEVOX") {
    await printVoicevoxSpeakers();
  } else if (engine === "KOKORO") {
    printKokoroVoices();
  } else if (engine === "Mac") {
    await printMacVoices();
  } else {
    console.log(`現在のTTSエンジン (${engine}) にはスタイルIDの一覧取得APIはありません。`);
  }

  console.log("======================================================================\n");
}

async function printCoeiroinkSpeakers(): Promise<void> {
  const url = `http://${config.COEIROINK_HOST}:${config.COEIROINK_PORT}/v1/speakers`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Status ${res.status}`);
    }
    const speakers = (await res.json()) as Array<{
      speakerName: string;
      styles: Array<{ styleName: string; styleId: number }>;
    }>;

    const list: StyleInfo[] = [];
    for (const spk of speakers) {
      if (Array.isArray(spk.styles)) {
        for (const st of spk.styles) {
          list.push({
            id: st.styleId,
            name: st.styleName,
            speakerName: spk.speakerName,
          });
        }
      }
    }

    if (list.length === 0) {
      console.log("⚠️ インストールされているボイスが見つかりませんでした。");
      return;
    }

    console.log(` ${"[ID]".padEnd(8, " ")} ${"スタイル名".padEnd(20, " ")} キャラクター名`);
    console.log("----------------------------------------------------------------------");
    for (const item of list) {
      const idStr = String(item.id).padEnd(8, " ");
      const styleStr = item.name.padEnd(20, " ");
      console.log(` ${idStr} ${styleStr} ${item.speakerName}`);
    }
    console.log("----------------------------------------------------------------------");
    console.log("💡 お好みのスタイルの [ID] を config/default.js の");
    console.log("   COEIROINK_STYLE_ID に設定してください。");
  } catch (err: any) {
    console.error(`❌ COEIROINK (${url}) に接続できませんでした。`);
    console.error("   COEIROINK アプリを起動した状態で再度お試しください。");
  }
}

async function printVoicevoxSpeakers(): Promise<void> {
  const url = `http://${config.VOICEVOX_HOST}:${config.VOICEVOX_PORT}/speakers`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Status ${res.status}`);
    }
    const speakers = (await res.json()) as Array<{
      name: string;
      styles: Array<{ name: string; id: number }>;
    }>;

    const list: StyleInfo[] = [];
    for (const spk of speakers) {
      if (Array.isArray(spk.styles)) {
        for (const st of spk.styles) {
          list.push({
            id: st.id,
            name: st.name,
            speakerName: spk.name,
          });
        }
      }
    }

    if (list.length === 0) {
      console.log("⚠️ インストールされているボイスが見つかりませんでした。");
      return;
    }

    console.log(` ${"[ID]".padEnd(8, " ")} ${"スタイル名".padEnd(20, " ")} キャラクター名`);
    console.log("----------------------------------------------------------------------");
    for (const item of list) {
      const idStr = String(item.id).padEnd(8, " ");
      const styleStr = item.name.padEnd(20, " ");
      console.log(` ${idStr} ${styleStr} ${item.speakerName}`);
    }
    console.log("----------------------------------------------------------------------");
    console.log("💡 お好みのスタイルの [ID] を config/default.js の");
    console.log("   VOICEVOX_SPEAKER_ID に設定してください。");
  } catch (err: any) {
    console.error(`❌ VOICEVOX (${url}) に接続できませんでした。`);
    console.error("   VOICEVOX アプリを起動した状態で再度お試しください。");
  }
}

function printKokoroVoices(): void {
  console.log("【英語プリセット】");
  console.log("  • af_heart  : 落ち着いた高品質な女性ボイス（推奨・デフォルト）");
  console.log("  • af_bella  : 明るい女性ボイス");
  console.log("  • af_nicole : やわらかな女性ボイス");
  console.log("  • am_adam   : 自然な男性ボイス");
  console.log("  • am_michael: 知的な男性ボイス");
  console.log("\n【日本語プリセット】");
  console.log("  • jf_alpha  : 日本語女性ボイス");
  console.log("----------------------------------------------------------------------");
  console.log("💡 config/default.js の KOKORO_VOICE または KOKORO_ENGLISH_VOICE に設定してください。");
}

async function printMacVoices(): Promise<void> {
  if (process.platform !== "darwin") {
    console.log("macOS 以外のOSでは say コマンドは使用できません。");
    return;
  }
  try {
    const proc = Bun.spawn(["say", "-v", "?"], { stdout: "pipe" });
    const text = await new Response(proc.stdout).text();
    const jaLines = text.split("\n").filter((l) => l.includes("ja_JP"));
    const enLines = text.split("\n").filter((l) => l.includes("en_US") || l.includes("en_GB"));

    console.log("【macOS 日本語ボイス】");
    for (const l of jaLines) console.log("  " + l.trim());
    console.log("\n【macOS 英語ボイス（抜粋）】");
    for (const l of enLines.slice(0, 5)) console.log("  " + l.trim());
    console.log("----------------------------------------------------------------------");
    console.log("💡 SPEAKER_JAPANESE / SPEAKER_ENGLISH にボイス名（例: Kyoko, Samantha）を設定してください。");
  } catch {
    console.log("ボイス一覧を取得できませんでした。");
  }
}
