# Twitch Text to Speech Bot

Twitch配信に加え、わんコメ（OneComme）やCastCraft、ローカルHTTP API（棒読みちゃん互換）を介したYouTube Liveや同時配信（マルチ配信）のコメント読み上げにも対応した、高品質・高機能テキスト読み上げ（TTS）ボット。  
**COEIROINK**、**Kokoro TTS**、**Piper TTS**、**VOICEVOX**、および macOS標準の **say** に対応し、配信・SNS用語の自然なカタカナ変換や外国語コメントのカタカナ変換、ネイティブ英語読み上げもサポートしています。

---

## 🌟 主な特徴

1. **多彩なローカル音声合成エンジンに対応**:
   - **COEIROINK**: お好みのキャラクターの高品位音声（エディタ辞書との自動同期対応）
   - **Kokoro TTS (82M)**: ElevenLabs並みに流暢な超高音質英語ボイス（`af_heart`）および日本語ボイス（`jf_alpha`）
   - **Piper TTS**: 高速・省メモリのローカルCLI音声合成（ノイズ・クリッピング対策済み）
   - **VOICEVOX**: 四国めたん、ずんだもん等
   - **macOS say**: macOS標準の合成音声（Kyoko, Susan等）
2. **YouTube Live & マルチ配信ツール連携（わんコメ / CastCraft等）**:
   - **棒読みちゃん互換サーバー (`http://127.0.0.1:50080/Talk?text=...`)**: わんコメや CastCraft の「棒読みちゃん連携」をONにするだけで、本物の棒読みちゃんや追加プラグイン不要でワンクリック連携可能。YouTube Live、Twitch、ツイキャス等の配信コメントをそのまま好みの音声合成で読み上げます。
   - **REST JSON API (`http://127.0.0.1:3939/say`)**: 軽量なHTTP Webhookや配信ツール・ブラウザから直接テキストを送信して読み上げ可能。
   - **自動ポート競合検知**: ポート50080で本物の棒読みちゃんが既に起動している場合もクラッシュせず安全に検知・警告し、メインのHTTP API（3939）を継続稼働します（競合時はツール側で3939番の `/say` を指定するか、棒読みちゃんを停止して再起動してください）。
3. **外国語コメント & 配信・SNS用語の自然な処理**:
   - **カタカナ変換モード (`KATAKANA`)**: YouTube、VTuber、TikTok、Twitter などの配信・SNS用語や、英語・ロシア語・スペイン語・韓国語（音素分解＋連音化）・中国語（台湾華語の表現やスラングを優先し、ピンインをもとに読みを変換）のコメントを発音規則・辞書に基づいて自然なカタカナに自動変換し、日本語ボイスで違和感なくスムーズに読み上げます（漢字のみの日本語コメントを誤判定しない安全ガード付き）。
   - **ネイティブモード (`NATIVE`)**: 英語コメントを Kokoro のネイティブボイスで流暢に読み上げます。
   - **無視モード (`IGNORE`)**: 外国語コメントを読み飛ばします。
4. **音の重複を防ぐ直列FIFO再生キュー & 緊急停止**:
   - 複数のコメントが連続で投稿されても、音声が重ならず順番にクリアに再生されます。
   - スパムや長文コメントの読み上げ時も、`clear` コマンドにより待機中キューの破棄に加えて**現在スピーカーから再生中の音声プロセスも即座に停止**可能です。
5. **教育機能・便利機能**:
   - `!remember 単語=読み方`: チャットから辞書をリアルタイム教育
   - `!forget 単語`: 辞書から削除
   - Discordチャンネルへのコメント自動転送（スマホ通知連携）

---

## 🚀 クイックスタート（配布バイナリを利用する場合）

### 1. 配布ZIPを展開
お使いの環境に合わせた配布ZIPをダウンロードし、任意のフォルダに解凍します。
- **Windows**: `twitch-tts-bot-windows-x64.zip`
- **macOS (Apple Silicon)**: `twitch-tts-bot-mac-arm64.zip`
- **Linux**: `twitch-tts-bot-linux-x64.zip`

### 2. 設定ファイルの作成（任意）
音声エンジンや動作設定を変更したい場合、`config/default.js.sample` を `config/default.js` にコピーして編集します。
（Twitch のトークンやチャンネル名は認証時に自動保存されるため、未記入のままでOKです！）

```javascript
// 使用する音声エンジン ("COEIROINK" | "VOICEVOX" | "PIPER" | "KOKORO" | "Mac")
TTS_ENGINE: "COEIROINK",

// 外国語コメントの処理 ("KATAKANA" | "NATIVE" | "IGNORE")
FOREIGN_LANGUAGE_MODE: "KATAKANA",
```

### 3. 起動とTwitch連携
フォルダ内の `twitch-tts-bot`（Windowsの場合は `twitch-tts-bot.exe`）を実行します。  

- **YouTube / わんコメ等のHTTP連携のみで使う場合**:  
  そのまま起動するだけで待機状態となり、すぐに利用できます（Twitch認証は不要です）。
- **Twitchのチャットも読み上げたい場合**:  
  1. 初回は起動後の対話コンソールで `auth`（または `twitch`）と入力して Enter を押すか、ターミナルで `./twitch-tts-bot auth` を実行します。
  2. 自動的にブラウザが立ち上がり Twitch 公式の認証画面が表示されます。
  3. **「連携」** をクリックするだけで、トークンとチャンネル名が自動取得・保存されます。
  4. `Connected to irc-ws.chat.twitch.tv:443 on #チャンネル名` と表示されれば完了です（次回以降は起動時に自動接続されます）。

#### 🔄 アカウントを変更したい場合 / パスワード変更等で使えなくなった場合
1. フォルダ内の `config/auth.json` を削除します。
2. 対話コンソールで `auth` と入力するか、ターミナルで `./twitch-tts-bot auth` を実行するとブラウザが開き、新しく連携画面が表示されます。

> [!TIP]
> **わんコメ / CastCraft / YouTube Live で利用する場合**:  
> - 本ボットを起動し、わんコメまたは CastCraft の設定で **「棒読みちゃん連携」を有効（ON）** にするだけで、すぐにコメント読み上げが連携されます（追加プラグインや本物の棒読みちゃんの起動は不要です）。
> - Twitch の認証を行わなくても単体で動作します。直接の Twitch IRC 接続が不要な場合は、`config/default.js` で `ENABLE_TWITCH: false` に設定するか、対話型コンソールで `twitch off` と入力すれば二重読み上げを防げます。

> [!TIP]
> **macOSで「開発元を確認できないため開けません」と表示される場合**:  
> バイナリファイルを **右クリック（または Control + クリック）して「開く」** を選択し、表示される確認ダイアログで「開く」をクリックしてください。またはターミナルで `xattr -d com.apple.quarantine twitch-tts-bot` を実行してセキュリティ警告を解除できます。

---

## 🎮 対話型コンソール & CLI コマンド

ボット起動中、実行中のターミナルから直接コマンドを入力して各種操作が可能です（対話型コンソール）。  
また、起動時の引数（CLI コマンド）としても各種機能を直接呼び出せます。

### 対話型コンソールコマンド（起動中のターミナルで入力）
- `demo` / `lang`: 主要言語（日本語・英語・中国語・韓国語・ロシア語・スペイン語）の挨拶やリスナーコメントの読み上げデモを実行します。音声エンジンやカタカナ変換の動作確認に最適です。
- `clear`: 再生待ちのキュー破棄だけでなく、**現在スピーカーから再生中の音声プロセス（afplay / PowerShell 等）も即座に停止**します（長文コメントや誤読の緊急停止に便利です）。
- `speakers` / `list`: インストール済みのボイスやスタイルID一覧を表示します。
- `say` / `s <テキスト>`: 任意のテキストを入力してテスト発声します（設定した外国語モードが反映されます）。
- `twitch` / `t` [on/off]: 起動中に Twitch IRC の接続・切断を動的に切り替えます（わんコメ等との併用時にコメントが二重読み上げされるのを防ぐため `twitch off` 推奨。未認証時は認証フローを開始します）。
- `status`: Twitch チャンネルの接続状態、HTTPサーバーおよび棒読みちゃん互換ポートの稼働状態、キューの待ち件数を表示します。
- `?` / `help`: コマンド一覧を表示します。
- `q` / `exit`: ボットを終了します。

### CLI コマンド（起動オプション）
```bash
# 主要言語の読み上げデモを実行
./twitch-tts-bot demo
# または
bun run demo

# 利用可能なキャラクター・スタイルID一覧を表示
./twitch-tts-bot speakers

# Twitch OAuth 連携の再実行
./twitch-tts-bot auth
```

---

## 🛠️ 各音声エンジンの利用準備

### COEIROINK を使う場合
1. [COEIROINK 公式サイト](https://coeiroink.com/) から COEIROINK（v2）をダウンロードして起動します。
2. `config/default.js` の `TTS_ENGINE` を `"COEIROINK"` に設定します。
3. お好みのキャラクターを使用する場合は `config/default.js` の `COEIROINK_STYLE_ID` を変更してください。

### Kokoro TTS を使う場合
- 高音質な英語・日本語合成が完全ローカルで動作します。
- Python 3.10+ 環境が必要です（初回起動時にモデル `hexgrad/Kokoro-82M` が自動ダウンロードされます）。

### Piper TTS を使う場合
- `models/piper/` 配下に ONNX モデルファイル（`ja_JP-hi_fi_captain-medium.onnx` 等）を配置して利用します。

### VOICEVOX を使う場合
1. [VOICEVOX 公式サイト](https://voicevox.hiroshiba.jp/) から VOICEVOX を起動（または Docker コンテナを起動）します。
2. `config/default.js` の `TTS_ENGINE` を `"VOICEVOX"` に設定します。

---

## 💻 開発・ソースコードから実行する場合

本プロジェクトは **Bun + TypeScript** をベースに構築されています。

### 動作要件
- [Bun](https://bun.sh/) (v1.1+)

### セットアップ・実行
```bash
# 依存パッケージのインストール
cd src
bun install

# Twitch認証（初回のみ）
bun run auth

# 開発実行
bun run index.ts

# ユニットテスト実行（全71テスト）
bun test

# 多言語読み上げデモの実行
bun run demo

# スタンドアロンバイナリのビルド
bun run build
```

---

## ⚠️ 音声合成の利用規約・クレジット表記について

各音声合成エンジンやキャラクターの音声を配信・動画・商用利用で使用する場合は、それぞれの公式利用規約に従ってください。

- **COEIROINK**: キャラクターごとに利用規約が異なります。配信概要欄等にクレジット表記（例: `音声：COEIROINK:キャラクター名`）が必要な場合があります。詳細は各キャラクターおよび [COEIROINK利用規約](https://coeiroink.com/) をご確認ください。
- **VOICEVOX**: 配信・動画等で使用する際は、クレジット表記（例: `VOICEVOX:四国めたん`）が必須です。詳細は [VOICEVOX利用規約](https://voicevox.hiroshiba.jp/) をご確認ください。
- **Kokoro TTS**: Apache-2.0 ライセンスに基づくオープンソースTTSです。

---

## 📝 ライセンス
MIT License
