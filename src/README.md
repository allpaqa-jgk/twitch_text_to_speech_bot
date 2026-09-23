# Twitch Text to Speech Bot (v2 - Bun + TypeScript)

Twitch配信用の高品質・低遅延・高機能テキスト読み上げボット（新アーキテクチャ）。
既存のNode.js環境（`src/`）と設定・辞書データを共有しながら、並行して安全に利用できます。

---

## 🚀 主な特徴

1. **マルチエンジン対応**:
   - **COEIROINK**: ユーザーが導入した各種キャラクターの高品位音声（エディタ辞書との自動同期機能付き）
   - **Kokoro TTS (82M)**: 超高音質な英語ボイス（`af_heart`）および日本語（`jf_alpha`）
   - **Piper TTS**: 超高速・省メモリ・ローカルCLI音声合成（音割れ防止 `--volume 0.8 --noise-scale 0.333` 適用済み）
   - **VOICEVOX**: 四国めたん、ずんだもん等
   - **macOS say**: macOS標準音声（Kyoko / Susan等）

2. **外国語コメント対応（選べる3つのモード）**:
   - `KATAKANA`（推奨）: 英語、ロシア語、スペイン語、韓国語などのコメントを自然な発音カタカナに変換し、日本語ボイスで違和感なくスムーズに読み上げ。
   - `NATIVE`: 英語コメントを Kokoro のネイティブボイス（`af_heart` 等）で流暢に読み上げ。
   - `IGNORE`: 外国語コメントを読み飛ばす。

3. **直列FIFO再生キュー（`TTSQueue`）**:
   - 音声が絶対に被らない（重複再生防止）。
   - 一部の音声合成でエラーが発生しても処理が止まらず、次のコメントを確実に再生。

4. **シングルバイナリ出力**:
   - Bunのコンパイル機能により、Node.jsやnpmのない環境でも動く単一実行ファイルを出力可能。

---

## 🛠️ コマンド一覧

すべてのコマンドは `src/` ディレクトリ内で実行します。

### 依存関係のインストール
```bash
bun install
```

### 開発・直接実行
```bash
bun run index.ts
```

### ユニットテスト実行
```bash
bun test
```
（言語判定、カタカナ変換、メッセージ整形、キュー直列処理、ボット統合テストなど全26テスト）

### 単一バイナリへのビルド
```bash
bun run build
```
（`../dist/twitch-tts-v2` に約60MBのスタンドアロンバイナリが生成されます）

### 配布用パッケージ（ZIP）の一括生成
```bash
bun run package
```
（`../dist/twitch-tts-bot/` 配下に設定ファイルサンプルや辞書データ一式を揃え、`../dist/twitch-tts-bot-mac-arm64.zip` を自動生成します）

---

## ⚙️ 設定（`config/default.js`）

設定ファイルはプロジェクトルートの `config/default.js` をそのまま参照します。

```javascript
// 主音声エンジン選択
TTS_ENGINE: "COEIROINK", // "COEIROINK" | "VOICEVOX" | "PIPER" | "KOKORO" | "Mac"

// 外国語コメント処理モード
FOREIGN_LANGUAGE_MODE: "KATAKANA", // "KATAKANA" | "NATIVE" | "IGNORE"

// 英語音声エンジン（FOREIGN_LANGUAGE_MODE: "NATIVE" 時に使用）
ENGLISH_TTS_ENGINE: "KOKORO", // "KOKORO" | "PIPER" | "Mac"
KOKORO_ENGLISH_VOICE: "af_heart", // 高音質英語ボイス
```
