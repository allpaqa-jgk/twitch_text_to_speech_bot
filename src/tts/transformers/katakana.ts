import type { TextTransformer } from "./types";

/**
 * Common English & Multilingual frequent words/phrases pronunciation dictionary.
 */
const COMMON_DICTIONARY: Record<string, string> = {
  // English Greetings & Reactions
  hello: "ハロー",
  hi: "ハイ",
  hey: "ヘイ",
  bye: "バイバイ",
  goodbye: "グッバイ",
  cya: "スィーヤ",
  welcome: "ウェルカム",
  thanks: "サンクス",
  thank: "サンク",
  you: "ユー",
  "thank you": "サンキュー",
  thx: "サンクス",
  ty: "サンキュー",
  pls: "プリーズ",
  please: "プリーズ",
  sorry: "ソーリー",
  sry: "ソーリー",
  yes: "イエス",
  no: "ノー",
  yeah: "イェー",
  yep: "イェップ",
  nope: "ノープ",
  ok: "オーケー",
  okay: "オーケー",
  gg: "ジージー",
  wp: "ウェルプレイド",
  "gg wp": "ジージー ウェルプレイド",
  gl: "グッドラック",
  hf: "ハブファン",
  glhf: "グッドラック ハブファン",
  lol: "エルオーエル",
  lmao: "エルエムエーオー",
  omg: "オーマイガー",
  wtf: "ダブリューティーエフ",
  ez: "イージー",
  pog: "ポグ",
  poggers: "ポガーズ",
  pogchamp: "ポグチャンプ",
  kekw: "ケクダブリュー",
  kappa: "カッパ",
  lfg: "エルエフジー",
  afk: "エーエフケー",
  brb: "ビーアールビー",
  rip: "リップ",
  ggs: "ジージーズ",
  nice: "ナイス",
  good: "グッド",
  great: "グレート",
  awesome: "オーサム",
  cool: "クール",
  cute: "キュート",
  amazing: "アメイジング",
  perfect: "パーフェクト",
  beautiful: "ビューティフル",
  congrats: "コングラッツ",
  congratulations: "コングラチュレーションズ",
  wow: "ワオ",
  bro: "ブロ",
  dude: "デュード",
  guy: "ガイ",
  guys: "ガイズ",
  man: "マン",
  friend: "フレンド",
  stream: "ストリーム",
  streamer: "ストリーマー",
  gaming: "ゲーミング",
  game: "ゲーム",
  play: "プレイ",
  player: "プレイヤー",
  chat: "チャット",
  bot: "ボット",
  twitch: "ツイッチ",
  live: "ライブ",
  love: "ラブ",
  like: "ライク",
  subscribe: "サブスクライブ",
  follow: "フォロー",
  follower: "フォロワー",
  raid: "レイド",
  host: "ホスト",
  clip: "クリップ",
  highlight: "ハイライト",
  music: "ミュージック",
  song: "ソング",
  sound: "サウンド",
  voice: "ボイス",
  audio: "オーディオ",
  video: "ビデオ",
  what: "ワット",
  why: "ワイ",
  how: "ハウ",
  where: "ウェア",
  when: "ウェン",
  who: "フー",
  night: "ナイト",
  knight: "ナイト",
  fight: "ファイト",
  light: "ライト",
  right: "ライト",
  station: "ステーション",
  morning: "モーニング",
  evening: "イブニング",
  today: "トゥデイ",
  tomorrow: "トゥモロー",
  yesterday: "イエスタデイ",
  time: "タイム",
  world: "ワールド",
  people: "ピープル",
  happy: "ハッピー",
  sad: "サッド",
  crazy: "クレイジー",
  real: "リアル",
  true: "トゥルー",
  false: "フォルス",
  one: "ワン",
  two: "ツー",
  three: "スリー",
  four: "フォー",
  five: "ファイブ",
  six: "シックス",
  seven: "セブン",
  eight: "エイト",
  nine: "ナイン",
  ten: "テン",

  // Core English Grammar & Common Words
  this: "ディス",
  that: "ザット",
  these: "ディーズ",
  those: "ゾーズ",
  the: "ザ",
  a: "ア",
  an: "アン",
  is: "イズ",
  are: "アー",
  am: "アム",
  was: "ワズ",
  were: "ワー",
  be: "ビー",
  been: "ビーン",
  being: "ビーイング",
  it: "イット",
  its: "イッツ",
  "it's": "イッツ",
  i: "アイ",
  my: "マイ",
  me: "ミー",
  mine: "マイン",
  your: "ユア",
  yours: "ユアーズ",
  he: "ヒー",
  his: "ヒズ",
  him: "ヒム",
  she: "シー",
  her: "ハー",
  hers: "ハーズ",
  we: "ウィー",
  our: "アワー",
  us: "アス",
  they: "ゼイ",
  their: "ゼア",
  them: "ゼム",
  do: "ドゥー",
  does: "ダズ",
  did: "ディド",
  done: "ダン",
  have: "ハブ",
  has: "ハズ",
  had: "ハド",
  can: "キャン",
  "can't": "キャント",
  cant: "キャント",
  could: "クッド",
  will: "ウィル",
  "won't": "ウォント",
  wont: "ウォント",
  would: "ウッド",
  should: "シュッド",
  must: "マスト",
  may: "メイ",
  might: "マイト",
  not: "ノット",
  and: "アンド",
  but: "バット",
  or: "オア",
  so: "ソー",
  if: "イフ",
  as: "アズ",
  because: "ビコーズ",
  in: "イン",
  on: "オン",
  at: "アット",
  to: "トゥー",
  for: "フォー",
  of: "オブ",
  with: "ウィズ",
  without: "ウィズアウト",
  by: "バイ",
  from: "フロム",
  about: "アバウト",
  into: "イントゥー",
  over: "オーバー",
  after: "アフター",
  before: "ビフォー",
  test: "テスト",
  testing: "テスティング",
  check: "チェック",
  try: "トライ",
  start: "スタート",
  stop: "ストップ",
  here: "ヒア",
  there: "ゼア",
  now: "ナウ",
  then: "ゼン",
  all: "オール",
  any: "エニー",
  some: "サム",
  very: "ベリー",
  much: "マッチ",
  many: "メニー",
  too: "トゥー",
  also: "オールソー",
  just: "ジャスト",
  only: "オンリー",
  really: "リアリー",
  sure: "シュア",
  which: "ウィッチ",
  than: "ザン",
  get: "ゲット",
  make: "メイク",
  go: "ゴー",
  see: "シー",
  come: "カム",
  take: "テイク",
  know: "ノウ",
  think: "シンク",
  look: "ルック",
  want: "ウォント",
  give: "ギブ",
  find: "ファインド",
  tell: "テル",
  ask: "アスク",
  doing: "ドゥーイング",
  watch: "ウォッチ",
  watching: "ウォッチング",
  work: "ワーク",
  feel: "フィール",
  leave: "リーブ",
  call: "コール",

  // Spanish Phrases
  hola: "オラ",
  adios: "アディオス",
  amigo: "アミーゴ",
  amigos: "アミーゴス",
  gracias: "グラシアス",
  "muchas gracias": "ムチャス グラシアス",
  "por favor": "ポル ファボール",
  buenas: "ブエナス",
  "buenos dias": "ブエノス ディアス",
  "buenas noches": "ブエナス ノーチェス",
  "como estas": "コモ エスタス",
  bien: "ビエン",
  si: "スィ",
  señor: "セニョール",
  señora: "セニョーラ",
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

/**
 * Korean Hangul phrases
 */
const HANGUL_COMMON_MAP: Record<string, string> = {
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
  파이팅: "パイティン",
  사랑해: "サランへ",
};

/**
 * Convert English word to natural katakana phonetics (Phonics rules)
 */
export function phonicsToKatakana(rawWord: string): string {
  let word = rawWord.toLowerCase();

  // Direct dictionary check
  if (COMMON_DICTIONARY[word]) {
    return COMMON_DICTIONARY[word];
  }

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

  // 3. Consonant clusters (Initial / Medial)
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

  // 6. Remaining individual consonants to Japanese sounds
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

  // Clean-up any trailing English ASCII
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
    .replace(/ñ/g, "ニャ")
    .replace(/ll/g, "リャ")
    .replace(/rr/g, "ル")
    .replace(/á/g, "a")
    .replace(/é/g, "e")
    .replace(/í/g, "i")
    .replace(/ó/g, "o")
    .replace(/ú/g, "u");
}

/**
 * Convert Hangul text to Katakana
 */
function hangulToKatakana(text: string): string {
  let result = text;
  for (const [phrase, katakana] of Object.entries(HANGUL_COMMON_MAP)) {
    result = result.replace(new RegExp(phrase, "g"), katakana);
  }
  return result;
}

/**
 * KatakanaTransformer: Converts foreign text (English, Cyrillic, Spanish, Hangul)
 * into natural-sounding Katakana suitable for Japanese TTS engines.
 */
export class KatakanaTransformer implements TextTransformer {
  public readonly name = "KatakanaTransformer";

  public transform(text: string): string {
    let result = text;

    // 1. Cyrillic (Russian)
    if (/[\u0400-\u04FF]/.test(result)) {
      result = cyrillicToKatakana(result);
    }

    // 2. Hangul (Korean)
    if (/[\uAC00-\uD7AF]/.test(result)) {
      result = hangulToKatakana(result);
    }

    // 3. Multi-word phrases / idioms first (e.g. "thank you", "muchas gracias", "buenos dias")
    const lowerResult = result.toLowerCase();
    for (const [phrase, katakana] of Object.entries(COMMON_DICTIONARY)) {
      if (phrase.includes(" ") && lowerResult.includes(phrase)) {
        const regex = new RegExp(`\\b${phrase}\\b`, "gi");
        result = result.replace(regex, katakana);
      }
    }

    // 4. Exact full word match for known dictionary words (including Spanish like señor, hola, etc.)
    result = result.replace(/[A-Za-zñáéíóúÑÁÉÍÓÚ]+('[A-Za-z]+)?/g, (match) => {
      const lower = match.toLowerCase();
      if (COMMON_DICTIONARY[lower]) {
        return COMMON_DICTIONARY[lower];
      }
      // If not in dictionary, apply Spanish character preprocessing then phonics
      const preprocessed = spanishPreprocess(match);
      return phonicsToKatakana(preprocessed);
    });

    // Clean up any remaining inverted punctuation
    result = result.replace(/[¡¿]/g, "");

    // 5. Compact spaces between Katakana words to eliminate excessively long pauses in Japanese TTS engines
    let prev: string;
    do {
      prev = result;
      result = result.replace(/([ァ-ヴー])[\s\u3000]+([ァ-ヴー])/g, "$1$2");
    } while (result !== prev);

    return result;
  }
}
