import type { TTSQueue } from "./queue";
import type { TTSEngine } from "./engine";
import type { TextTransformer } from "./transformers/types";

/**
 * Multilingual demo showcase sentence item.
 * - announce: Optional announcement spoken before the text (e.g. "英語を話します", "デモを再生します").
 *   If omitted or empty, only the text is spoken without an announcement.
 * - text: The original sentence to be transformed and spoken.
 */
export interface DemoItem {
  announce?: string;
  text: string;
}

export interface DemoPreparedStep {
  announce?: string;
  text: string;
  converted: string;
}

export const DEMO_ITEMS: DemoItem[] = [
  { text: "デモを再生します。こんにちは！ Hello! Hola! Ciao! Привет! 안녕하세요! 你好！" },
  { text: "主要な言語でのコメントをカタカナで読み上げます" },
  { announce: "日本語を話します", text: "こんにちはみなさん！今日の配信も楽しんでいってくださいね！" },
  { announce: "英語を話します", text: "Hello guys! Nice stream, you play so well!" },
  { announce: "ポルトガル語を話します", text: "Olá amigo! Bom jogo, parabéns pela stream." },
  { announce: "イタリア語を話します", text: "Ciao a tutti! Bellissimo stream, complimenti!" },
  { announce: "スペイン語を話します", text: "¡Hola amigo! Buen stream, muchas gracias por jugar." },
  { announce: "フランス語を話します", text: "Bonjour mon ami! C'est un super stream, merci beaucoup." },
  { announce: "ロシア語を話します", text: "Привет! Отличный стрим, удачи в игре!" },
  { announce: "インドネシア語を話します", text: "Halo teman-teman! Semangat terus, mainnya jago banget." },
  { announce: "ドイツ語を話します", text: "Guten Tag! Toller Stream, viel Glück beim Spiel!" },
  { announce: "韓国語を話します", text: "안녕하세요! 방송 너무 재미있어요 화이팅!" },
  { announce: "中国語を話します", text: "你好！玩得很好，加油！" },
  { announce: "台湾スラングを話します", text: "大家安安！實況主太強了，謝謝乾爹！" },
  { text: "デモを終了します" },
];

export const DEMO_LANGUAGES = DEMO_ITEMS;

/**
 * Transforms all demo items using the provided transformer.
 */
export async function prepareDemoSteps(
  transformer?: TextTransformer
): Promise<DemoPreparedStep[]> {
  const steps: DemoPreparedStep[] = [];
  for (const item of DEMO_ITEMS) {
    const converted = transformer ? await transformer.transform(item.text) : item.text;
    steps.push({
      announce: item.announce,
      text: item.text,
      converted,
    });
  }
  return steps;
}

/**
 * Enqueues the multilingual demo into the TTS queue for interactive console playback.
 */
export async function enqueueDemo(
  queue: TTSQueue,
  transformer?: TextTransformer
): Promise<void> {
  console.log("\n======================================================================");
  console.log("🌏 主要言語の読み上げデモをキューに追加します...");
  console.log("======================================================================");

  const steps = await prepareDemoSteps(transformer);
  for (const step of steps) {
    if (step.announce) {
      console.log(`📢 【${step.announce}】 ${step.text}`);
      console.log(`   └> 変換: ${step.converted}`);
      queue.enqueue(`${step.announce}。`);
    } else {
      console.log(`📢 ${step.text}`);
      console.log(`   └> 変換: ${step.converted}`);
    }
    queue.enqueue(step.converted);
  }
  console.log("======================================================================");
  console.log("💡 中断したい場合は「clear」と入力してください。\n");
}

/**
 * Runs the multilingual demo synchronously for the CLI command (`./twitch-tts-bot demo`).
 */
export async function runDemoCli(
  engine: TTSEngine,
  transformer?: TextTransformer
): Promise<void> {
  console.log("======================================================================");
  console.log(`🌏 主要言語読み上げデモを開始します (使用エンジン: ${engine.name})`);
  console.log("======================================================================\n");

  const steps = await prepareDemoSteps(transformer);
  for (const step of steps) {
    if (step.announce) {
      console.log(`📢 【${step.announce}】`);
      console.log(`原文: ${step.text}`);
      console.log(`変換: ${step.converted}\n`);
      await engine.say(`${step.announce}。`);
      await Bun.sleep(100);
    } else {
      console.log(`📢 原文: ${step.text}`);
      console.log(`変換: ${step.converted}\n`);
    }
    await engine.say(step.converted);
    await Bun.sleep(150);
  }
  console.log("🎉 デモの再生が完了しました。");
}
