/**
 * Korean Hangul mathematical phonetics decomposer and converter to Katakana.
 * Decomposes 11,172 Unicode Hangul syllables (U+AC00 - U+D7A3) into:
 * Choseong (Initial), Jungseong (Medial), and Jongseong (Final Batchim).
 */

const COMMON_KOREAN_PHRASES: Record<string, string> = {
  안녕하세요: "アンニョンハセヨ",
  안녕: "アンニョン",
  감사합니다: "カムサハムニダ",
  고마워: "コマウォ",
  죄송합니다: "チェソンハムニダ",
  미안해: "ミアネ",
  네: "ネー",
  아니요: "アニヨ",
  대박: "テバク",
  진짜: "チンチャ",
  화이팅: "ファイティン",
  파이ティング: "パイティン",
  파이팅: "パイティン",
  사랑해: "サランへ",
  사랑해요: "サランヘヨ",
  재미있어요: "チェミイッソヨ",
  재밌어요: "チェミッソヨ",
  수고했어요: "スゴヘッソヨ",
  수고했어: "スゴヘッソ",
  잘자요: "チャルジャヨ",
};

// Initial consonant (初声) x Medial vowel (中声) mapping table
const CHOSUNG_JUNGSUNG_MAP: Record<number, string[]> = {
  // 0: ㄱ (k/g)
  0: ["カ", "ケ", "キャ", "キェ", "コ", "ケ", "キョ", "キェ", "コ", "クァ", "クェ", "クェ", "キョ", "ク", "クォ", "クェ", "クィ", "キュ", "ク", "クィ", "キ"],
  // 1: ㄲ (kk)
  1: ["ッカ", "ッケ", "ッキャ", "ッキェ", "ッコ", "ッケ", "ッキョ", "ッキェ", "ッコ", "ックァ", "ックェ", "ックェ", "ッキョ", "ック", "ックォ", "ックェ", "ックィ", "ッキュ", "ック", "ックィ", "ッキ"],
  // 2: ㄴ (n)
  2: ["ナ", "ネ", "ニャ", "ニェ", "ノ", "ネ", "ニョ", "ニェ", "ノ", "ナ", "ネ", "ネ", "ニョ", "ヌ", "ヌォ", "ネ", "ヌィ", "ニュ", "ヌ", "ヌィ", "ニ"],
  // 3: ㄷ (t/d)
  3: ["タ", "テ", "チャ", "チェ", "ト", "テ", "チョ", "チェ", "ト", "トァ", "トェ", "トェ", "チョ", "トゥ", "トォ", "トェ", "トィ", "チュ", "トゥ", "トィ", "ティ"],
  // 4: ㄸ (tt)
  4: ["ッタ", "ッテ", "ッチャ", "ッチェ", "ット", "ッテ", "ッチョ", "ッチェ", "ット", "ットァ", "ットェ", "ットェ", "ッチョ", "ットゥ", "ットォ", "ットェ", "ットィ", "ッチュ", "ットゥ", "ットィ", "ッティ"],
  // 5: ㄹ (r/l)
  5: ["ラ", "レ", "リャ", "リェ", "ロ", "レ", "リョ", "リェ", "ロ", "ラ", "レ", "レ", "リョ", "ル", "ルォ", "レ", "ルィ", "リュ", "ル", "ルィ", "リ"],
  // 6: ㅁ (m)
  6: ["マ", "メ", "ミャ", "ミェ", "モ", "メ", "ミョ", "ミェ", "モ", "マ", "メ", "メ", "ミョ", "ム", "ムォ", "メ", "ムィ", "ミュ", "ム", "ムィ", "ミ"],
  // 7: ㅂ (p/b)
  7: ["パ", "ペ", "ピャ", "ピェ", "ポ", "ペ", "ピョ", "ピェ", "ポ", "パ", "ペ", "ペ", "ピョ", "プ", "プォ", "ペ", "ピィ", "ピュ", "プ", "ピィ", "ピ"],
  // 8: ㅃ (pp)
  8: ["ッパ", "ッペ", "ッピャ", "ッピェ", "ッポ", "ッペ", "ッピョ", "ッピェ", "ッポ", "ッパ", "ッペ", "ッペ", "ッピョ", "ップ", "ップォ", "ッペ", "ッピィ", "ッピュ", "ップ", "ッピィ", "ッピ"],
  // 9: ㅅ (s)
  9: ["サ", "セ", "シャ", "シェ", "ソ", "セ", "ショ", "シェ", "ソ", "スァ", "スェ", "スェ", "ショ", "ス", "スォ", "スェ", "スィ", "シュ", "ス", "スィ", "シ"],
  // 10: ㅆ (ss)
  10: ["ッサ", "ッセ", "ッシャ", "ッシェ", "ッソ", "ッセ", "ッショ", "ッシェ", "ッソ", "ッスァ", "ッスェ", "ッスェ", "ッショ", "ッス", "ッスォ", "ッスェ", "ッスィ", "ッシュ", "ッス", "ッスィ", "ッシ"],
  // 11: ㅇ (silent initial / vowel sound)
  11: ["ア", "エ", "ヤ", "イェ", "オ", "エ", "ヨ", "イェ", "オ", "ワ", "ウェ", "ウェ", "ヨ", "ウ", "ウォ", "ウェ", "ウィ", "ユ", "ウ", "ウィ", "イ"],
  // 12: ㅈ (ch/j)
  12: ["チャ", "チェ", "チャ", "チェ", "チョ", "チェ", "チョ", "チェ", "チョ", "チャ", "チェ", "チェ", "チョ", "チュ", "チョ", "チェ", "チ", "チュ", "チュ", "チ", "チ"],
  // 13: ㅉ (jj)
  13: ["ッチャ", "ッチェ", "ッチャ", "ッチェ", "ッチョ", "ッチェ", "ッチョ", "ッチェ", "ッチョ", "ッチャ", "ッチェ", "ッチェ", "ッチョ", "ッチュ", "ッチョ", "ッチェ", "ッチ", "ッチュ", "ッチュ", "ッチ", "ッチ"],
  // 14: ㅊ (ch)
  14: ["チャ", "チェ", "チャ", "チェ", "チョ", "チェ", "チョ", "チェ", "チョ", "チャ", "チェ", "チェ", "チョ", "チュ", "チョ", "チェ", "チ", "チュ", "チュ", "チ", "チ"],
  // 15: ㅋ (k)
  15: ["カ", "ケ", "キャ", "キェ", "コ", "ケ", "キョ", "キェ", "コ", "クァ", "クェ", "クェ", "キョ", "ク", "クォ", "クェ", "クィ", "キュ", "ク", "クィ", "キ"],
  // 16: ㅌ (t)
  16: ["タ", "テ", "チャ", "チェ", "ト", "テ", "チョ", "チェ", "ト", "トァ", "トェ", "トェ", "チョ", "トゥ", "トォ", "トェ", "トィ", "チュ", "トゥ", "トィ", "ティ"],
  // 17: ㅍ (p)
  17: ["パ", "ペ", "ピャ", "ピェ", "ポ", "ペ", "ピョ", "ピェ", "ポ", "パ", "ペ", "ペ", "ピョ", "プ", "プォ", "ペ", "ピィ", "ピュ", "プ", "ピィ", "ピ"],
  // 18: ㅎ (h)
  18: ["ハ", "ヘ", "ヒャ", "ヒェ", "ホ", "ヘ", "ヒョ", "ヒェ", "ホ", "ファ", "フェ", "フェ", "ヒョ", "フ", "フォ", "フェ", "フィ", "ヒュ", "フ", "フィ", "ヒ"],
};

// Final consonant (終声 / パッチム) Katakana mapping
const JONGSUNG_MAP: Record<number, string> = {
  0: "",
  1: "ク", // ㄱ
  2: "ク", // ㄲ
  3: "ク", // ㄳ
  4: "ン", // ㄴ
  5: "ン", // ㄵ
  6: "ン", // ㄶ
  7: "ッ", // ㄷ
  8: "ル", // ㄹ
  9: "ク", // ㄺ
  10: "ム", // ㄻ
  11: "プ", // ㄼ
  12: "ル", // ㄽ
  13: "ル", // ㄾ
  14: "プ", // ㄿ
  15: "ル", // ㅀ
  16: "ム", // ㅁ
  17: "プ", // ㅂ
  18: "プ", // ㅄ
  19: "ッ", // ㅅ
  20: "ッ", // ㅆ
  21: "ン", // ㅇ (ng)
  22: "ッ", // ㅈ
  23: "ッ", // ㅊ
  24: "ク", // ㅋ
  25: "ッ", // ㅌ
  26: "プ", // ㅍ
  27: "ッ", // ㅎ
};

/**
 * Converts a single Hangul syllable character code to Katakana.
 */
function decomposeHangulSyllable(code: number): { l: number; v: number; t: number } | null {
  if (code < 0xac00 || code > 0xd7a3) {
    return null;
  }
  const idx = code - 0xac00;
  const l = Math.floor(idx / 588);
  const v = Math.floor((idx % 588) / 28);
  const t = idx % 28;
  return { l, v, t };
}

/**
 * Decomposes and translates arbitrary Korean Hangul text into natural Japanese Katakana.
 */
export function hangulToKatakana(text: string): string {
  let processed = text;

  // 1. Common frequent phrases priority override (direct replacement without extra spaces)
  for (const [phrase, katakana] of Object.entries(COMMON_KOREAN_PHRASES)) {
    if (processed.includes(phrase)) {
      processed = processed.split(phrase).join(katakana);
    }
  }

  // 2. Mathematical phonetic decomposition for all remaining Hangul characters
  let result = "";
  const len = processed.length;

  for (let i = 0; i < len; i++) {
    const code = processed.charCodeAt(i);
    const syllable = decomposeHangulSyllable(code);

    if (!syllable) {
      result += processed[i];
      continue;
    }

    const { l, v, t } = syllable;
    const base = CHOSUNG_JUNGSUNG_MAP[l]?.[v] || "";

    // Check liaison (連音化) with next character if it has silent initial ㅇ (l === 11)
    let batchimSound = JONGSUNG_MAP[t] || "";

    if (t > 0 && i + 1 < len) {
      const nextCode = processed.charCodeAt(i + 1);
      const nextSyllable = decomposeHangulSyllable(nextCode);

      // If next character is a Hangul syllable starting with vowel (ㅇ, l=11)
      if (nextSyllable && nextSyllable.l === 11) {
        // Double ss ㅆ + vowel -> ッ + サ/シ/ス/セ/ソ
        if (t === 20) {
          batchimSound = "ッ";
        }
      }
    }

    result += base + batchimSound;
  }

  // 3. Remove unnecessary spaces before punctuation
  result = result.replace(/\s+([、。！？!?,\.])/g, "$1");

  return result.replace(/[\s\u3000]+/g, " ").trim();
}
