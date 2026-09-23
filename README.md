# Twitch Text to Speech Bot

Twitch配信用の高品質・高機能テキスト読み上げ（TTS）ボット。  
**COEIROINK**、**Kokoro TTS**、**Piper TTS**、**VOICEVOX**、および macOS標準の **say** に対応し、外国語コメントの自然なカタカナ変換やネイティブ英語読み上げもサポートしています。

---

## 🌟 主な特徴

1. **多彩なローカル音声合成エンジンに対応**:
   - **COEIROINK**: お好みのキャラクターの高品位音声（エディタ辞書との自動同期対応）
   - **Kokoro TTS (82M)**: ElevenLabs並みに流暢な超高音質英語ボイス（`af_heart`）および日本語ボイス（`jf_alpha`）
   - **Piper TTS**: 高速・省メモリのローカルCLI音声合成（ノイズ・クリッピング対策済み）
   - **VOICEVOX**: 四国めたん、ずんだもん等
   - **macOS say**: macOS標準の合成音声（Kyoko, Susan等）
2. **外国語コメントの自然な処理**:
   - **カタカナ変換モード (`KATAKANA`)**: 英語・ロシア語・スペイン語・韓国語などのコメントをフォニックス（発音規則）に基づいて自然なカタカナに自動変換し、日本語ボイスで違和感なくスムーズに読み上げます。
   - **ネイティブモード (`NATIVE`)**: 英語コメントを Kokoro のネイティブボイスで流暢に読み上げます。
   - **無視モード (`IGNORE`)**: 外国語コメントを読み飛ばします。
3. **音の重複を防ぐ直列FIFO再生キュー**:
   - 複数のコメントが連続で投稿されても、音声が重ならず順番にクリアに再生されます。
4. **教育機能・便利機能**:
   - `!remember 単語=読み方`: チャットから辞書をリアルタイム教育
   - `!forget 単語`: 辞書から削除
   - `!dice 1d6 2d20`: サイコロ機能
   - Discordチャンネルへのコメント自動転送（スマホ通知連携）

---

## 🚀 クイックスタート（配布バイナリを利用する場合）

### 1. 配布ZIPを展開
配布された `twitch-tts-bot.zip` を任意のフォルダに解凍します。

### 2. 設定ファイルの作成
1. `config/default.js.sample` を同じフォルダ内にコピーし、名前を `default.js` に変更します。
2. テキストエディタで `config/default.js` を開き、以下の項目を設定します：

```javascript
// Twitch 接続設定
TW_OAUTH_TOKEN: "oauth:xxxxxxxxxxxxxxxxxxxxxx", // https://twitchapps.com/tmi/ で取得
TW_CHANNEL_NAME: "your_channel_name",            // 読み上げを行いたいチャンネル名

// 使用する音声エンジン ("COEIROINK" | "VOICEVOX" | "PIPER" | "KOKORO" | "Mac")
TTS_ENGINE: "COEIROINK",

// 外国語コメントの処理 ("KATAKANA" | "NATIVE" | "IGNORE")
FOREIGN_LANGUAGE_MODE: "KATAKANA",
```

### 3. 起動
フォルダ内の `twitch-tts-bot` を実行します。  
`Connected to irc-ws.chat.twitch.tv:443` と表示されれば準備完了です！

> [!TIP]
> **macOSで「開発元を確認できないため開けません」と表示される場合**:  
> バイナリファイルを **右クリック（または Control + クリック）して「開く」** を選択し、表示される確認ダイアログで「開く」をクリックしてください。またはターミナルで `xattr -d com.apple.quarantine twitch-tts-bot` を実行してセキュリティ警告を解除できます。

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

# 開発実行
bun run index.ts

# ユニットテスト実行（全26テスト）
bun test

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
