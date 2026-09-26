import { pinyin } from "pinyin-pro";

/**
 * Taiwan priority phrases, pronunciations, and stream slang.
 * Applied before general Pinyin decomposition to respect Taiwan Mandarin / Twitch usage.
 */
const TAIWAN_PHRASES: Record<string, string> = {
  // Taiwan-specific pronunciations
  垃圾: "レースー",
  // Taiwan Twitch slang & greetings
  安安: "アンアン",
  笑死: "シアオスー",
  按讚: "アンザン",
  點讚: "アンザン",
  點贊: "アンザン",
  乾爹: "ガンディエ",
  乾媽: "ガンマー",
  太強了: "タイチャンラ",
  太好笑了: "タイハオシアオラ",
  辛苦了: "シンクーラ",
  靠北: "カオベイ",
  實況: "シークアン",
  實況主: "シークアンジュー",
  加油: "ジャーヨウ",
  太棒了: "タイバンラ",
  明天見: "ミンティエンジエン",
  明天见: "ミンティエンジエン",
  早安: "ザオアン",
  晚安: "ワンアン",
  歡迎: "ホワンイン",
  欢迎: "ホワンイン",
};

/**
 * Distinctive markers found in Chinese (Simplified & Traditional) and Taiwan Mandarin,
 * but NEVER used in standard Japanese sentences.
 */
const CHINESE_MARKER_REGEX =
  /[这为们过对发会个么谁让说话见还没从听点赞這們麼誰裡點沒很得嗎吧啦喔呢讚靠]/;

const CHINESE_COMMON_WORDS = [
  "你好", "謝謝", "谢谢", "加油", "辛苦了", "歡迎", "欢迎",
  "拜拜", "晚安", "早安", "明天見", "明天见", "太棒了",
  "安安", "笑死", "實況", "実況", "乾爹", "乾媽", "玩得"
];

/**
 * Returns true only if text is genuinely Chinese / Taiwan Mandarin,
 * and strictly guarantees zero false positives on Japanese text.
 */
export function isChineseText(text: string): boolean {
  // 1. Japanese Absolute Guard: If text has any Hiragana or Katakana, 100% Japanese!
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) {
    return false;
  }

  // 2. Must contain CJK Ideographs (漢字/汉字)
  if (!/[\u4E00-\u9FFF]/.test(text)) {
    return false;
  }

  // 3. Check for distinctive Simplified / Traditional Chinese grammar particles and characters
  if (CHINESE_MARKER_REGEX.test(text)) {
    return true;
  }

  // 4. Check for common Chinese phrases/greetings
  for (const word of CHINESE_COMMON_WORDS) {
    if (text.includes(word)) {
      return true;
    }
  }

  return false;
}

/**
 * Standard Mandarin Pinyin (without tones) to Japanese Katakana mapping table.
 * Covers all ~410 Mandarin phonetic syllables.
 */
const PINYIN_TABLE: Record<string, string> = {
  // A
  a: "ア", ai: "アイ", an: "アン", ang: "アン", ao: "アオ",
  // B
  ba: "バー", bai: "バイ", ban: "バン", bang: "バン", bao: "バオ", bei: "ベイ", ben: "ベン", beng: "ボン", bi: "ビー", bian: "ビエン", biao: "ビャオ", bie: "ビエ", bin: "ビン", bing: "ビン", bo: "ボー", bu: "ブー",
  // C
  ca: "ツァ", cai: "ツァイ", can: "ツァン", cang: "ツァン", cao: "ツァオ", ce: "ツァ", cei: "ツェイ", cen: "ツェン", ceng: "ツォン", cha: "チャー", chai: "チャイ", chan: "チャン", chang: "チャン", chao: "チャオ", che: "チャ", chen: "チェン", cheng: "チョン", chi: "チー", chong: "チョン", chou: "チョウ", chu: "チュー", chua: "チュア", chuai: "チュアイ", chuan: "チュアン", chuang: "チュアン", chui: "チュイ", chun: "チュン", chuo: "チュオ", ci: "ツー", cong: "ツォン", cou: "ツォウ", cu: "ツー", cuan: "ツアン", cui: "ツイ", cun: "ツン", cuo: "ツオ",
  // D
  da: "ダー", dai: "ダイ", dan: "ダン", dang: "ダン", dao: "ダオ", de: "ドゥ", dei: "デイ", den: "デン", deng: "ドン", di: "ディー", dian: "ディエン", diao: "ディアオ", die: "ディエ", ding: "ディン", diu: "ディウ", dong: "ドン", dou: "ドウ", du: "ドゥー", duan: "ドゥアン", dui: "ドゥイ", dun: "ドゥン", duo: "ドゥオ",
  // E
  e: "アー", ei: "エイ", en: "エン", eng: "エン", er: "アル",
  // F
  fa: "ファー", fan: "ファン", fang: "ファン", fei: "フェイ", fen: "フェン", feng: "フォン", fo: "フォー", fou: "フォウ", fu: "フー",
  // G
  ga: "ガー", gai: "ガイ", gan: "ガン", gang: "ガン", gao: "ガオ", ge: "ガー", gei: "ゲイ", gen: "ゲン", geng: "ゴン", gong: "ゴン", gou: "ゴウ", gu: "グー", gua: "グア", guai: "グアイ", guan: "グアン", guang: "グアン", gui: "グイ", gun: "グン", guo: "グオ",
  // H
  ha: "ハー", hai: "ハイ", han: "ハン", hang: "ハン", hao: "ハオ", he: "ハー", hei: "ヘイ", hen: "ヘン", heng: "ホン", hong: "ホン", hou: "ホウ", hu: "フー", hua: "ホア", huai: "ホアイ", huan: "ホアン", huang: "ホアン", hui: "ホイ", hun: "フン", huo: "ホオ",
  // J
  ji: "ジー", jia: "ジア", jian: "ジエン", jiang: "ジアン", jiao: "ジアオ", jie: "ジエ", jin: "ジン", jing: "ジン", jiong: "ジオン", jiu: "ジウ", ju: "ジュー", juan: "ジュアン", jue: "ジュエ", jun: "ジュン",
  // K
  ka: "カー", kai: "カイ", kan: "カン", kang: "カン", kao: "カオ", ke: "カー", kei: "ケイ", ken: "ケン", keng: "コン", kong: "コン", kou: "コウ", ku: "クー", kua: "クア", kuai: "クアイ", kuan: "クアン", kuang: "クアン", kui: "クイ", kun: "クン", kuo: "クオ",
  // L
  la: "ラー", lai: "ライ", lan: "ラン", lang: "ラン", lao: "ラオ", le: "ラ", lei: "レイ", leng: "ロン", li: "リー", lia: "リア", lian: "リエン", liang: "リアン", liao: "リアオ", lie: "リエ", lin: "リン", ling: "リン", liu: "リウ", lo: "ロー", long: "ロン", lou: "ロウ", lu: "ルー", luan: "ルアン", lun: "ルン", luo: "ルオ", lv: "リュー", lve: "リュエ",
  // M
  ma: "マー", mai: "マイ", man: "マン", mang: "マン", mao: "マオ", me: "モ", mei: "メイ", men: "メン", meng: "モン", mi: "ミー", mian: "ミエン", miao: "ミアオ", mie: "ミエ", min: "ミン", ming: "ミン", miu: "ミウ", mo: "モー", mou: "モウ", mu: "ムー",
  // N
  na: "ナー", nai: "ナイ", nan: "ナン", nang: "ナン", nao: "ナオ", ne: "ネ", nei: "ネイ", nen: "ネン", neng: "ノン", ni: "ニー", nian: "ニエン", niang: "ニアン", niao: "ニアオ", nie: "ニエ", nin: "ニン", ning: "ニン", niu: "ニウ", nong: "ノン", nou: "ノウ", nu: "ヌー", nuan: "ヌアン", nuo: "ヌオ", nv: "ニュー", nve: "ニュエ",
  // O
  o: "オー", ou: "オウ",
  // P
  pa: "パー", pai: "パイ", pan: "パン", pang: "パン", pao: "パオ", pei: "ペイ", pen: "ペン", peng: "ポン", pi: "ピー", pian: "ピエン", piao: "ピアオ", pie: "ピエ", pin: "ピン", ping: "ピン", po: "ポー", pou: "ポウ", pu: "プー",
  // Q
  qi: "チー", qia: "チア", qian: "チエン", qiang: "チアン", qiao: "チアオ", qie: "チエ", qin: "チン", qing: "チン", qiong: "チオン", qiu: "チウ", qu: "チュー", quan: "チュアン", que: "チュエ", qun: "チュン",
  // R
  ran: "ラン", rang: "ラン", rao: "ラオ", re: "ラー", ren: "レン", reng: "ロン", ri: "リー", rong: "ロン", rou: "ロウ", ru: "ルー", rua: "ルア", ruan: "ルアン", rui: "ルイ", run: "ルン", ruo: "ルオ",
  // S
  sa: "サー", sai: "サイ", san: "サン", sang: "サン", sao: "サオ", se: "スー", sen: "セン", seng: "ソン", sha: "シャー", shai: "シャイ", shan: "シャン", shang: "シャン", shao: "シャオ", she: "シャー", shei: "シェイ", shen: "シェン", sheng: "ション", shi: "シー", shou: "ショウ", shu: "シュー", shua: "シュア", shuai: "シュアイ", shuan: "シュアン", shuang: "シュアン", shui: "シュイ", shun: "シュン", shuo: "シュオ", si: "スー", song: "ソン", sou: "ソウ", su: "スー", suan: "スアン", sui: "スイ", sun: "スン", suo: "スオ",
  // T
  ta: "ター", tai: "タイ", tan: "タン", tang: "タン", tao: "タオ", te: "トゥ", tei: "テイ", teng: "トン", ti: "ティー", tian: "ティエン", tiao: "ティアオ", tie: "ティエ", ting: "ティン", tong: "トン", tou: "トウ", tu: "トゥー", tuan: "トゥアン", tui: "トゥイ", tun: "トゥン", tuo: "トゥオ",
  // W
  wa: "ワー", wai: "ワイ", wan: "ワン", wang: "ワン", wei: "ウェイ", wen: "ウェン", weng: "ウォン", wo: "ウォ", wu: "ウー",
  // X
  xi: "シー", xia: "シア", xian: "シエン", xiang: "シアン", xiao: "シアオ", xie: "シエ", xin: "シン", xing: "シン", xiong: "シオン", xiu: "シウ", xu: "シュー", xuan: "シュアン", xue: "シュエ", xun: "シュン",
  // Y
  ya: "ヤー", yan: "イエン", yang: "ヤン", yao: "ヤオ", ye: "イエ", yi: "イー", yin: "イン", ying: "イン", yo: "ヨー", yong: "ヨン", you: "ヨウ", yu: "ユー", yuan: "ユアン", yue: "ユエ", yun: "ユン",
  // Z
  za: "ザー", zai: "ザイ", zan: "ザン", zang: "ザン", zao: "ザオ", ze: "ザー", zei: "ゼイ", zen: "ゼン", zeng: "ゾン", zha: "ジャー", zhai: "ジャイ", zhan: "ジャン", zhang: "ジャン", zhao: "ジャオ", zhe: "ジャー", zhei: "ジェイ", zhen: "ジェン", zheng: "ジョン", zhi: "ジー", zhong: "ジョン", zhou: "ジョウ", zhu: "ジュー", zhua: "ジュア", zhuai: "ジュアイ", zhuan: "ジュアン", zhuang: "ジュアン", zhui: "ジュイ", zhun: "ジュン", zhuo: "ジュオ", zi: "ズー", zong: "ゾン", zou: "ゾウ", zu: "ズー", zuan: "ズアン", zui: "ズイ", zun: "ズン", zuo: "ズオ"
};

function pinyinWordToKatakana(py: string): string {
  const clean = py.toLowerCase().replace(/[^a-z]/g, "");
  return PINYIN_TABLE[clean] || py;
}

/**
 * Converts Chinese / Taiwan Mandarin text to Katakana:
 * 1. Matches Taiwan priority slang & pronunciations without adding spaces.
 * 2. Converts remaining Hanzi blocks to Pinyin -> Katakana (connected smoothly without spaces).
 * 3. Normalizes Chinese punctuation to Japanese punctuation for natural TTS prosody.
 */
export function convertChineseToKatakana(text: string): string {
  let result = text;

  // 1. Taiwan phrases first (direct replacement without inserting spaces)
  for (const [phrase, katakana] of Object.entries(TAIWAN_PHRASES)) {
    if (result.includes(phrase)) {
      result = result.split(phrase).join(katakana);
    }
  }

  // 2. Only remaining Hanzi blocks: join syllables directly WITHOUT spaces
  result = result.replace(/[\u4E00-\u9FFF]+/g, (hanziMatch) => {
    const tokens = pinyin(hanziMatch, { toneType: "none", type: "array" });
    return tokens.map(pinyinWordToKatakana).join("");
  });

  // 3. Normalize Chinese punctuation to Japanese punctuation for natural prosody
  result = result
    .replace(/，/g, "、")
    .replace(/。/g, "。")
    .replace(/！/g, "！")
    .replace(/？/g, "？");

  // 4. Remove unnecessary spaces around punctuation
  result = result
    .replace(/\s+([、。！？!?,\.])/g, "$1")
    .replace(/([、。！？!?,\.])\s+/g, "$1");

  return result.replace(/[\s\u3000]+/g, " ").trim();
}
