import type { TextTransformer } from "./types";
import { dictionary } from "cmu-pronouncing-dictionary";
import { hangulToKatakana } from "./korean";
import {
  isChineseText,
  convertChineseToKatakana,
  replaceTaiwanPhrases,
} from "./chinese";

/**
 * Twitch & Gaming specific abbreviations/slang that have non-phonetic readings in Japanese streams.
 */
const SPECIAL_SLANG: Record<string, string> = {
  w: "わら",
  ww: "わらわら",
  www: "わらわら",
  wwww: "わらわら",
  gg: "ジージー",
  ggs: "ジージーズ",
  wp: "ウェルプレイド",
  "gg wp": "ジージー ウェルプレイド",
  gl: "グッドラック",
  hf: "ハブファン",
  glhf: "グッドラック ハブファン",
  ez: "イージー",
  pog: "ポグ",
  poggers: "ポガーズ",
  pogchamp: "ポグチャンプ",
  kekw: "ケクダブリュー",
  afk: "エーエフケー",
  brb: "ビーアールビー",
  lol: "ロル",
  lmao: "エルエムエーオー",
  wtf: "ダブリューティーエフ",
  nt: "ナイストライ",
  kusa: "くさ",
  bro: "ブロ",
  fps: "エフピーエス",
  rpg: "アールピージー",
  bgm: "ビージーエム",
  npc: "エヌピーシー",
  pvp: "ピーブイピー",
  pve: "ピーブイイー",
  dps: "ディーピーエス",
  id: "アイディー",
  url: "ユーアールエル",
  mp: "エムピー",
  se: "エスイー",
  op: "オーピー",
  ng: "エヌジー",
};

/**
 * Multilingual Spanish phrases & common greetings
 */
const SPANISH_PHRASES: Record<string, string> = {
  "muchas gracias": "ムチャス グラシアス",
  "por favor": "ポル ファボール",
  "buenos dias": "ブエノス ディアス",
  "buenas noches": "ブエナス ノーチェス",
  "como estas": "コモ エスタス",
  hola: "オラ",
  amigo: "アミーゴ",
  amigos: "アミーゴス",
  gracias: "グラシアス",
  adios: "アディオス",
  buenas: "ブエナス",
  bien: "ビエン",
  señor: "セニョール",
  señora: "セニョーラ",
  si: "スィ",
};

/**
 * Cyrillic to Katakana mapping (Russian phonetics)
 */
const CYRILLIC_PHRASES: Record<string, string> = {
  привет: "プリヴィエト",
  здравствуйте: "ズドラーストヴィチェ",
  спасибо: "スパスィーバ",
  пожалуйста: "パジャールスタ",
  хорошо: "ハラショー",
  да: "ダ",
  нет: "ニェット",
  пока: "パカー",
  досвидания: "ダスヴィダーニャ",
};

const CYRILLIC_MAP: Record<string, string> = {
  а: "ア", б: "ブ", в: "ヴ", г: "グ", д: "ド",
  е: "イェ", ё: "ヨ", ж: "ジュ", з: "ズ", и: "イ",
  й: "イ", к: "ク", л: "ル", м: "ム", н: "ン",
  о: "オ", п: "プ", р: "ル", с: "ス", т: "ト",
  у: "ウ", ф: "フ", х: "ハ", ц: "ツ", ч: "チ",
  ш: "シュ", щ: "シチ", ъ: "", ы: "ウィ", ь: "",
  э: "エ", ю: "ユ", я: "ヤ",
};

const SHORT_VOWELS = new Set(["IH", "EH", "AE", "AH", "UH"]);
const STOPS = new Set(["P", "T", "K", "B", "D", "G", "CH"]);

/**
 * Converts ARPAbet phonetic string (from CMU Pronouncing Dictionary)
 * into natural-sounding Japanese Katakana using standard loanword rules.
 */
export function arpabetToKatakana(arpaStr: string, originalWord = ""): string {
  const rawPhonemes = arpaStr.split(/\s+/);
  const phonemes = rawPhonemes.map((p) => p.replace(/[0-9]/g, ""));
  const lowerWord = originalWord.toLowerCase();

  // Check if vowel in spelling is short 'o' (like hot, stop, bot, dog, not, comment, box, on, off)
  const isShortO =
    /[bcdfghjklmnpqrstvwxyz]o[bcdfghjklmnpqrstvwxyz]/i.test(lowerWord) ||
    lowerWord === "on" ||
    lowerWord === "off";

  // Diphthong 'ey' written as 'ay' or 'ai' in spelling -> 'エイ' (play, player, rain)
  const isAiAy = lowerWord.includes("ay") || lowerWord.includes("ai");

  const vowels: Record<string, string> = {
    AA: lowerWord.includes("o") ? (isShortO ? "オ" : "オー") : "ア",
    AE: "ア",
    AH: "ア",
    AO: isShortO ? "オ" : "オー",
    AW: "アウ",
    AY: "アイ",
    EH: "エ",
    ER: "アー",
    EY: isAiAy ? "エイ" : "エー",
    IH: "イ",
    IY: "イー",
    OW: "オー",
    OY: "オイ",
    UH: "ウ",
    UW: "ウー",
  };

  const getCv = (c: string, v: string): string => {
    const isO = (v === "AA" && lowerWord.includes("o")) || v === "AO" || v === "OW";
    const oExt = isShortO ? "" : "ー";
    const eyExt = isAiAy ? "イ" : "ー";

    // Special K + AE -> キャ (cat, camp, can)
    if (c === "K" && v === "AE") {
      return "キャ";
    }

    const cvMap: Record<string, Record<string, string>> = {
      B: { AA: isO ? "ボ" + oExt : "バ", AE: "バ", AH: "バ", AO: "ボ" + oExt, AW: "バウ", AY: "バイ", EH: "ベ", ER: "バー", EY: "ベ" + eyExt, IH: "ビ", IY: "ビー", OW: "ボー", OY: "ボイ", UH: "ブ", UW: "ブー" },
      CH: { AA: isO ? "チョ" + oExt : "チャ", AE: "チャ", AH: "チャ", AO: "チョ" + oExt, AW: "チャウ", AY: "チャイ", EH: "チェ", ER: "チャー", EY: "チェ" + eyExt, IH: "チ", IY: "チー", OW: "チョウ", OY: "チョイ", UH: "チュ", UW: "チュー" },
      D: { AA: isO ? "ド" + oExt : "ダ", AE: "ダ", AH: "ダ", AO: "ド" + oExt, AW: "ダウ", AY: "ダイ", EH: "デ", ER: "ダー", EY: "デ" + eyExt, IH: "ディ", IY: "ディー", OW: "ドー", OY: "ドイ", UH: "ドゥ", UW: "ドゥー" },
      DH: { AA: isO ? "ゾ" + oExt : "ザ", AE: "ザ", AH: "ザ", AO: "ゾ" + oExt, AW: "ザウ", AY: "ザイ", EH: "ゼ", ER: "ザー", EY: "ゼ" + eyExt, IH: "ディ", IY: "ディー", OW: "ゾウ", OY: "ゾイ", UH: "ズ", UW: "ズー" },
      F: { AA: isO ? "フォ" + oExt : "ファ", AE: "ファ", AH: "ファ", AO: "フォ" + oExt, AW: "ファウ", AY: "ファイ", EH: "フェ", ER: "ファー", EY: "フェ" + eyExt, IH: "フィ", IY: "フィー", OW: "フォー", OY: "フォイ", UH: "フ", UW: "フー" },
      G: { AA: isO ? "ゴ" + oExt : "ガ", AE: "ガ", AH: "ガ", AO: "ゴ" + oExt, AW: "ガウ", AY: "ガイ", EH: "ゲ", ER: "ガー", EY: "ゲ" + eyExt, IH: "ギ", IY: "ギー", OW: "ゴー", OY: "ゴイ", UH: "グ", UW: "グー" },
      HH: { AA: isO ? "ホ" + oExt : "ハ", AE: "ハ", AH: "ハ", AO: "ホ" + oExt, AW: "ハウ", AY: "ハイ", EH: "ヘ", ER: "ハー", EY: "ヘ" + eyExt, IH: "ヒ", IY: "ヒー", OW: "ホー", OY: "ホイ", UH: "フ", UW: "フー" },
      JH: { AA: isO ? "ジョ" + oExt : "ジャ", AE: "ジャ", AH: "ジャ", AO: "ジョ" + oExt, AW: "ジャウ", AY: "ジャイ", EH: "ジェ", ER: "ジャー", EY: "ジェ" + eyExt, IH: "ジ", IY: "ジー", OW: "ジョウ", OY: "ジョイ", UH: "ジュ", UW: "ジュー" },
      K: { AA: isO ? "コ" + oExt : "カ", AE: "キャ", AH: "カ", AO: "コ" + oExt, AW: "カウ", AY: "カイ", EH: "ケ", ER: "カー", EY: "ケ" + eyExt, IH: "キ", IY: "キー", OW: "コー", OY: "コイ", UH: "ク", UW: "クー" },
      L: { AA: isO ? "ロ" + oExt : "ラ", AE: "ラ", AH: "ラ", AO: "ロ" + oExt, AW: "ラウ", AY: "ライ", EH: "レ", ER: "ラー", EY: "レ" + eyExt, IH: "リ", IY: "リー", OW: "ロー", OY: "ロイ", UH: "ル", UW: "ルー" },
      M: { AA: isO ? "モ" + oExt : "マ", AE: "マ", AH: "マ", AO: "モ" + oExt, AW: "マウ", AY: "マイ", EH: "メ", ER: "マー", EY: "メ" + eyExt, IH: "ミ", IY: "ミー", OW: "モー", OY: "モイ", UH: "ム", UW: "ムー" },
      N: { AA: isO ? "ノ" + oExt : "ナ", AE: "ナ", AH: "ナ", AO: "ノ" + oExt, AW: "ナウ", AY: "ナイ", EH: "ネ", ER: "ナー", EY: "ネ" + eyExt, IH: "ニ", IY: "ニー", OW: "ノー", OY: "ノイ", UH: "ヌ", UW: "ヌー" },
      P: { AA: isO ? "ポ" + oExt : "パ", AE: "パ", AH: "パ", AO: "ポ" + oExt, AW: "パウ", AY: "パイ", EH: "ペ", ER: "パー", EY: "ペ" + eyExt, IH: "ピ", IY: "ピー", OW: "ポー", OY: "ポイ", UH: "プ", UW: "プー" },
      R: { AA: isO ? "ロ" + oExt : "ラ", AE: "ラ", AH: "ラ", AO: "ロ" + oExt, AW: "ラウ", AY: "ライ", EH: "レ", ER: "ラー", EY: "レ" + eyExt, IH: "リ", IY: "リー", OW: "ロー", OY: "ロイ", UH: "ル", UW: "ルー" },
      S: { AA: isO ? "ソ" + oExt : "サ", AE: "サ", AH: "サ", AO: "ソ" + oExt, AW: "サウ", AY: "サイ", EH: "セ", ER: "サー", EY: "セ" + eyExt, IH: "シ", IY: "シー", OW: "ソー", OY: "ソイ", UH: "ス", UW: "スー" },
      SH: { AA: isO ? "ショ" + oExt : "シャ", AE: "シャ", AH: "シャ", AO: "ショ" + oExt, AW: "シャウ", AY: "シャイ", EH: "シェ", ER: "シャー", EY: "シェ" + eyExt, IH: "シ", IY: "シー", OW: "ショー", OY: "ショイ", UH: "シュ", UW: "シュー" },
      T: { AA: isO ? "ト" + oExt : "タ", AE: "タ", AH: "タ", AO: "ト" + oExt, AW: "タウ", AY: "タイ", EH: "テ", ER: "ター", EY: "テ" + eyExt, IH: "ティ", IY: "ティー", OW: "トー", OY: "トイ", UH: "トゥ", UW: "トゥー" },
      TH: { AA: isO ? "ソ" + oExt : "サ", AE: "サ", AH: "サ", AO: "ソ" + oExt, AW: "サウ", AY: "サイ", EH: "セ", ER: "サー", EY: "セ" + eyExt, IH: "シ", IY: "シー", OW: "ソー", OY: "ソイ", UH: "ス", UW: "スー" },
      V: { AA: isO ? "ヴォ" + oExt : "ヴァ", AE: "ヴァ", AH: "ヴァ", AO: "ヴォ" + oExt, AW: "ヴァウ", AY: "ヴァイ", EH: "ヴェ", ER: "ヴァー", EY: "ヴェ" + eyExt, IH: "ヴィ", IY: "ヴィー", OW: "ヴォー", OY: "ヴォイ", UH: "ヴ", UW: "ヴー" },
      W: { AA: isO ? "ウォ" + oExt : "ワ", AE: "ワ", AH: "ワ", AO: "ウォ" + oExt, AW: "ワウ", AY: "ワイ", EH: "ウェ", ER: "ワー", EY: "ウェ" + eyExt, IH: "ウィ", IY: "ウィー", OW: "ウォー", OY: "ウォイ", UH: "ウ", UW: "ウー" },
      Y: { AA: isO ? "ヨ" + oExt : "ヤ", AE: "ヤ", AH: "ヤ", AO: "ヨ" + oExt, AW: "ヤウ", AY: "ヤイ", EH: "イェ", ER: "ヤー", EY: "イェ" + eyExt, IH: "イ", IY: "イー", OW: "ヨー", OY: "ヨイ", UH: "ユ", UW: "ユー" },
      Z: { AA: isO ? "ゾ" + oExt : "ザ", AE: "ザ", AH: "ザ", AO: "ゾ" + oExt, AW: "ザウ", AY: "ザイ", EH: "ゼ", ER: "ザー", EY: "ゼ" + eyExt, IH: "ジ", IY: "ジー", OW: "ゾウ", OY: "ゾイ", UH: "ズ", UW: "ズー" },
      ZH: { AA: isO ? "ジョ" + oExt : "ジャ", AE: "ジャ", AH: "ジャ", AO: "ジョ" + oExt, AW: "ジャウ", AY: "ジャイ", EH: "ジェ", ER: "ジャー", EY: "ジェ" + eyExt, IH: "ジ", IY: "ジー", OW: "ジョウ", OY: "ジョイ", UH: "ジュ", UW: "ジュー" },
    };
    return cvMap[c]?.[v] || "";
  };

  const standaloneC: Record<string, string> = {
    B: "ブ", CH: "チ", D: "ド", DH: "ズ", F: "フ", G: "グ", HH: "ハ",
    JH: "ジ", K: "ク", L: "ル", M: "ム", N: "ン", P: "プ", R: "ル",
    S: "ス", SH: "シュ", T: "ト", TH: "ス", V: "ブ", W: "ウ", Y: "イ",
    Z: "ズ", ZH: "ジュ", NG: "ング",
  };

  let out = "";
  let i = 0;
  let lastWasShortVowel = false;

  while (i < phonemes.length) {
    const p = phonemes[i];
    const next = phonemes[i + 1];

    // TW + Vowel -> ツィ/ツァ/ツ/etc. (e.g. twitch -> T W IH CH -> ツイッチ)
    if (p === "T" && next === "W" && phonemes[i + 2] && vowels[phonemes[i + 2]]) {
      const v = phonemes[i + 2];
      if (v === "IH" || v === "IY") out += "ツイ";
      else if (v === "AE" || v === "AA" || v === "AH") out += "ツァ";
      else if (v === "EH" || v === "EY") out += "ツェ";
      else out += "ツ";
      lastWasShortVowel = SHORT_VOWELS.has(v);
      i += 3;
      continue;
    }

    // NG before K (e.g. thanks -> TH AE NG K S -> サンクス, think -> シンク)
    if (p === "NG" && next === "K") {
      out += "ン";
      lastWasShortVowel = false;
      i++;
      continue;
    }

    // T + S at word-end -> ツ (e.g. cats -> キャッツ, comments -> コメンツ)
    if (p === "T" && next === "S" && i + 2 === phonemes.length) {
      if (lastWasShortVowel && !out.endsWith("ッ") && !out.endsWith("ー") && !out.endsWith("ン")) {
        out += "ッ";
      }
      out += "ツ";
      i += 2;
      continue;
    }

    // R before consonant or at end of word -> prolonged sound (ー)
    if (p === "R" && (!next || !vowels[next])) {
      if (out.length > 0 && !out.endsWith("ー") && !out.endsWith("ッ")) {
        out += "ー";
      }
      lastWasShortVowel = false;
      i++;
      continue;
    }

    // ER after /i/ sound (e.g. player -> プレイヤー)
    if (p === "ER" && out.endsWith("イ")) {
      out += "ヤー";
      lastWasShortVowel = false;
      i++;
      continue;
    }

    // Consonant + Vowel
    if (next && vowels[next]) {
      const cvSound = getCv(p, next);
      if (cvSound) {
        out += cvSound;
        lastWasShortVowel = SHORT_VOWELS.has(next) || ((next === "AA" || next === "AO") && isShortO);
        i += 2;
        continue;
      }
    }

    // Word-final stop after short vowel -> add ッ (e.g. cat -> キャット, egg -> エッグ, dog -> ドッグ)
    if (
      STOPS.has(p) &&
      (i === phonemes.length - 1 || (i === phonemes.length - 2 && phonemes[i + 1] === "S"))
    ) {
      if (lastWasShortVowel && !out.endsWith("ッ") && !out.endsWith("ー") && !out.endsWith("ン")) {
        out += "ッ";
      }
    }

    // Vowel alone
    if (vowels[p]) {
      out += vowels[p];
      lastWasShortVowel = SHORT_VOWELS.has(p) || ((p === "AA" || p === "AO") && isShortO);
      i++;
      continue;
    }

    // Standalone Consonant
    if (standaloneC[p]) {
      out += standaloneC[p];
      lastWasShortVowel = false;
      i++;
      continue;
    }

    i++;
  }

  return out;
}

/**
 * Fallback phonics-based converter for words not in the CMU dictionary
 * (slang, character elongations like 'haaaaaaa', usernames, typos).
 */
export function phonicsToKatakana(rawWord: string): string {
  let word = rawWord.toLowerCase();

  // 1. Common suffixes
  word = word
    .replace(/tion/g, "ション")
    .replace(/sion/g, "ジョン")
    .replace(/ture/g, "チャー")
    .replace(/ight/g, "アイト")
    .replace(/ough/g, "オフ")
    .replace(/ing$/g, "イング")
    .replace(/ed$/g, "ド")
    .replace(/er$/g, "アー")
    .replace(/or$/g, "オー")
    .replace(/ar$/g, "アー")
    .replace(/al$/g, "アル");

  // 2. Digraphs & phonics combos
  word = word
    .replace(/ch/g, "チ")
    .replace(/sh/g, "シュ")
    .replace(/ph/g, "フ")
    .replace(/th/g, "ス")
    .replace(/wh/g, "ホ")
    .replace(/ck/g, "ック")
    .replace(/qu/g, "ク")
    .replace(/kn/g, "ナ")
    .replace(/wr/g, "ラ")
    .replace(/ee/g, "イー")
    .replace(/ea/g, "イー")
    .replace(/oo/g, "ウー")
    .replace(/ai/g, "エイ")
    .replace(/ay/g, "エイ")
    .replace(/oa/g, "オー")
    .replace(/ou/g, "アウ")
    .replace(/ow/g, "オウ");

  // 3. Consonant clusters
  word = word
    .replace(/str/g, "ストラ")
    .replace(/st/g, "スト")
    .replace(/sp/g, "スピ")
    .replace(/sk/g, "スク")
    .replace(/sm/g, "スメ")
    .replace(/sn/g, "スネ")
    .replace(/sw/g, "スワ")
    .replace(/gra/g, "グラ")
    .replace(/gri/g, "グリ")
    .replace(/gru/g, "グル")
    .replace(/gre/g, "グレ")
    .replace(/gro/g, "グロ")
    .replace(/gr/g, "グラ")
    .replace(/tra/g, "トラ")
    .replace(/tri/g, "トリ")
    .replace(/tru/g, "トゥルー")
    .replace(/tre/g, "トレ")
    .replace(/tro/g, "トロ")
    .replace(/tr/g, "トラ")
    .replace(/bra/g, "ブラ")
    .replace(/bri/g, "ブリ")
    .replace(/bru/g, "ブル")
    .replace(/bre/g, "ブレ")
    .replace(/bro/g, "ブロ")
    .replace(/br/g, "ブラ")
    .replace(/cra/g, "クラ")
    .replace(/cri/g, "クリ")
    .replace(/cru/g, "クル")
    .replace(/cre/g, "クレ")
    .replace(/cro/g, "クロ")
    .replace(/cr/g, "クラ")
    .replace(/dra/g, "ドラ")
    .replace(/dri/g, "ドリ")
    .replace(/dru/g, "ドラ")
    .replace(/dre/g, "ドレ")
    .replace(/dro/g, "ドロ")
    .replace(/dr/g, "ドラ")
    .replace(/pla/g, "プラ")
    .replace(/pli/g, "プリ")
    .replace(/plu/g, "プル")
    .replace(/ple/g, "プレ")
    .replace(/plo/g, "プロ")
    .replace(/pl/g, "プル")
    .replace(/fla/g, "フラ")
    .replace(/fli/g, "フリ")
    .replace(/flu/g, "フル")
    .replace(/fle/g, "フレ")
    .replace(/flo/g, "フロ")
    .replace(/fl/g, "フル");

  // 4. Silent E rule: vowel + consonant + e -> long vowel
  word = word
    .replace(/a([bcdfghjklmnpqrstvwxyz])e$/g, "エイ$1")
    .replace(/i([bcdfghjklmnpqrstvwxyz])e$/g, "アイ$1")
    .replace(/o([bcdfghjklmnpqrstvwxyz])e$/g, "オー$1")
    .replace(/u([bcdfghjklmnpqrstvwxyz])e$/g, "ユー$1");

  // 5. Standard CV syllables
  const cvTable: [RegExp, string][] = [
    [/kya/g, "キャ"], [/kyu/g, "キュ"], [/kyo/g, "キョ"],
    [/sha/g, "シャ"], [/shu/g, "シュ"], [/sho/g, "ショ"], [/shi/g, "シ"],
    [/cha/g, "チャ"], [/chu/g, "チュ"], [/cho/g, "チョ"], [/chi/g, "チ"],
    [/tsu/g, "ツ"],
    [/fa/g, "ファ"], [/fi/g, "フィ"], [/fe/g, "フェ"], [/fo/g, "フォ"], [/fu/g, "フ"],
    [/ja/g, "ジャ"], [/ju/g, "ジュ"], [/jo/g, "ジョ"], [/ji/g, "ジ"],
    [/va/g, "ヴァ"], [/vi/g, "ヴィ"], [/vu/g, "ヴ"], [/ve/g, "ヴェ"], [/vo/g, "ヴォ"],
    [/ka/g, "カ"], [/ki/g, "キ"], [/ku/g, "ク"], [/ke/g, "ケ"], [/ko/g, "コ"],
    [/sa/g, "サ"], [/si/g, "シ"], [/su/g, "ス"], [/se/g, "セ"], [/so/g, "ソ"],
    [/ta/g, "タ"], [/ti/g, "ティ"], [/tu/g, "トゥ"], [/te/g, "テ"], [/to/g, "ト"],
    [/na/g, "ナ"], [/ni/g, "ニ"], [/nu/g, "ヌ"], [/ne/g, "ネ"], [/no/g, "ノ"],
    [/ha/g, "ハ"], [/hi/g, "ヒ"], [/he/g, "ヘ"], [/ho/g, "ホ"],
    [/ma/g, "マ"], [/mi/g, "ミ"], [/mu/g, "ム"], [/me/g, "メ"], [/mo/g, "モ"],
    [/ya/g, "ヤ"], [/yu/g, "ユ"], [/yo/g, "ヨ"],
    [/ra/g, "ラ"], [/ri/g, "リ"], [/ru/g, "ル"], [/re/g, "レ"], [/ro/g, "ロ"],
    [/la/g, "ラ"], [/li/g, "リ"], [/lu/g, "ル"], [/le/g, "レ"], [/lo/g, "ロ"],
    [/wa/g, "ワ"], [/wo/g, "ウォ"],
    [/ga/g, "ガ"], [/gi/g, "ギ"], [/gu/g, "グ"], [/ge/g, "ゲ"], [/go/g, "ゴ"],
    [/za/g, "ザ"], [/zu/g, "ズ"], [/ze/g, "ゼ"], [/zo/g, "ゾ"],
    [/da/g, "ダ"], [/di/g, "ディ"], [/du/g, "ドゥ"], [/de/g, "デ"], [/do/g, "ド"],
    [/ba/g, "バ"], [/bi/g, "ビ"], [/bu/g, "ブ"], [/be/g, "ベ"], [/bo/g, "ボ"],
    [/pa/g, "パ"], [/pi/g, "ピ"], [/pu/g, "プ"], [/pe/g, "ペ"], [/po/g, "ポ"],
    [/ca/g, "カ"], [/cu/g, "ク"], [/co/g, "コ"], [/ci/g, "シ"], [/ce/g, "セ"],
    [/a/g, "ア"], [/i/g, "イ"], [/u/g, "ウ"], [/e/g, "エ"], [/o/g, "オ"],
  ];

  for (const [pattern, rep] of cvTable) {
    word = word.replace(pattern, rep);
  }

  // 6. Remaining consonants
  const consonantTable: [RegExp, string][] = [
    [/b/g, "ブ"], [/c/g, "ク"], [/d/g, "ド"], [/f/g, "フ"], [/g/g, "グ"],
    [/h/g, "ハ"], [/j/g, "ジ"], [/k/g, "ク"], [/l/g, "ル"], [/m/g, "ム"],
    [/n/g, "ン"], [/p/g, "プ"], [/q/g, "ク"], [/r/g, "ル"], [/s/g, "ス"],
    [/t/g, "ト"], [/v/g, "ヴ"], [/w/g, "ウ"], [/x/g, "クス"], [/y/g, "イ"],
    [/z/g, "ズ"],
  ];

  for (const [pattern, rep] of consonantTable) {
    word = word.replace(pattern, rep);
  }

  word = word.replace(/[a-z]/g, "");
  return word || rawWord;
}

/**
 * Convert Cyrillic (Russian) text to Katakana
 */
function cyrillicToKatakana(text: string): string {
  let lower = text.toLowerCase();
  for (const [phrase, katakana] of Object.entries(CYRILLIC_PHRASES)) {
    lower = lower.replace(new RegExp(phrase, "g"), katakana);
  }

  let result = "";
  for (const char of lower) {
    if (CYRILLIC_MAP[char]) {
      result += CYRILLIC_MAP[char];
    } else {
      result += char;
    }
  }
  return result;
}

/**
 * Convert Spanish accents and specific characters
 */
function spanishPreprocess(text: string): string {
  return text
    .replace(/¡/g, "")
    .replace(/¿/g, "")
    .replace(/ña/gi, "ニャ")
    .replace(/ñe/gi, "ニェ")
    .replace(/ñi/gi, "ニ")
    .replace(/ño/gi, "ニョ")
    .replace(/ñu/gi, "ニュ")
    .replace(/ñ/gi, "ニャ")
    .replace(/ll/gi, "リャ")
    .replace(/rr/gi, "ル")
    .replace(/ü/gi, "u")
    .replace(/ä/gi, "e")
    .replace(/ö/gi, "o")
    .replace(/ß/gi, "ss")
    .replace(/à|â/gi, "a")
    .replace(/è|ê|ë/gi, "e")
    .replace(/î|ï/gi, "i")
    .replace(/ô/gi, "o")
    .replace(/û|ù/gi, "u")
    .replace(/ç/gi, "s")
    .replace(/á/gi, "a")
    .replace(/é/gi, "e")
    .replace(/í/gi, "i")
    .replace(/ó/gi, "o")
    .replace(/ú/gi, "u");
}

/**
 * KatakanaTransformer: Converts foreign text (English, Cyrillic, Spanish, Hangul, Chinese)
 * into natural-sounding Katakana suitable for Japanese TTS engines.
 * Powered by CMU Pronouncing Dictionary (135,000+ words) + Taiwan/Chinese Pinyin + Korean decomposition.
 */
export class KatakanaTransformer implements TextTransformer {
  public readonly name = "KatakanaTransformer";

  public transform(text: string): string {
    // Normalize smart curly apostrophes (from mobile / macOS) to standard ASCII apostrophe
    let result = text.replace(/[\u2018\u2019]/g, "'");

    // 1. Cyrillic (Russian)
    if (/[\u0400-\u04FF]/.test(result)) {
      result = cyrillicToKatakana(result);
    }

    // 2. Hangul (Korean) - Mathematical phonetic decomposition + common stream phrases
    if (/[\uAC00-\uD7AF\u1100-\u11FF]/.test(result)) {
      result = hangulToKatakana(result);
    }

    // Check if the original text was pure Chinese text (zero Kana + Chinese markers)
    const isChinese = isChineseText(result);

    // 3. Common Chinese greetings & Taiwan slang (applied even in mixed Japanese comments)
    result = replaceTaiwanPhrases(result);

    // 4. Pure Chinese / Taiwan Mandarin (converts all remaining Hanzi via Pinyin)
    if (isChinese) {
      result = convertChineseToKatakana(result);
    }

    // 3. Multi-word phrases / idioms
    const lowerResult = result.toLowerCase();
    for (const [phrase, katakana] of Object.entries(SPANISH_PHRASES)) {
      if (lowerResult.includes(phrase)) {
        const regex = new RegExp(`\\b${phrase}\\b`, "gi");
        result = result.replace(regex, katakana);
      }
    }
    for (const [phrase, katakana] of Object.entries(SPECIAL_SLANG)) {
      if (phrase.includes(" ") && lowerResult.includes(phrase)) {
        const regex = new RegExp(`\\b${phrase}\\b`, "gi");
        result = result.replace(regex, katakana);
      }
    }

    // 4. Exact word match via CMU Pronouncing Dictionary (135,000+ words) or fallback
    result = result.replace(
      /[A-Za-zñáéíóúüäößàâèêëîïôûùçÑÁÉÍÓÚÜÄÖÀÂÈÊËÎÏÔÛÙÇ]+('[A-Za-z]+)?/g,
      (match) => {
      const lower = match.toLowerCase();

      // Check special slang first (gg, ez, w, etc.)
      if (SPECIAL_SLANG[lower]) {
        return SPECIAL_SLANG[lower];
      }

      // Check common Spanish words (hola, amigo, gracias, etc.)
      if (SPANISH_PHRASES[lower]) {
        return SPANISH_PHRASES[lower];
      }

      // Check CMU Pronouncing Dictionary (135,155 English words)
      if (dictionary[lower]) {
        return arpabetToKatakana(dictionary[lower], match);
      }

      // Fallback for slang, non-dictionary elongations (haaaaaaa), or Spanish
      const preprocessed = spanishPreprocess(match);
      return phonicsToKatakana(preprocessed);
    });

    // Clean up any remaining inverted punctuation
    result = result.replace(/[¡¿]/g, "");

    // 5. Normalize Western punctuation to Japanese punctuation for natural breath pauses
    result = result
      .replace(/,/g, "、")
      .replace(/\.(?=\s|$)/g, "。")
      .replace(/!/g, "！")
      .replace(/\?/g, "？");

    // 6. Connect consecutive Katakana words by removing foreign word spaces
    // e.g. "ハロー ガイズ" -> "ハローガイズ", "ユー プレイ" -> "ユープレイ"
    result = result.replace(/(?<=[\u30A0-\u30FFー])\s+(?=[\u30A0-\u30FFー])/g, "");

    // 7. Remove spaces before/after Japanese punctuation
    result = result
      .replace(/\s+([、。！？])/g, "$1")
      .replace(/([、。！？])\s+/g, "$1");

    return result.replace(/[\s\u3000]+/g, " ").trim();
  }
}
