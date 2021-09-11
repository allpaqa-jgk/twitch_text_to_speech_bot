# twitch text to speech bot for MacOS (, windows and linux via GoogleCloudTTS)

**!!CAUTION!! / 注意**  
**!!this readme might be incorrect / この README は正しくない可能性があります!!**

## Concept / コンセプト

1. Just double click and ready / ダブルクリックで起動するだけで使える
1. No third party app for TTS (e.g. limechat) / メイン機能の TTS では別のアプリケーション不要（limechat など）
1. Remember command for username and keywords / ユーザー名やキーワードを教育
1. Listeners can check chat log before open the stream / 配信を開く前のチャットログをリスナーさんが見れる
   - This is using discord... / discord を利用します。。
   - Using discord, streamer can receive comment as notification of discord even if streaming with (via) iPhone or iPad. (e.g. I can't see "PC monitor" during playing Music Game)  
     / discord を使うことで iPhone, iPad 配信でもコメントを通知として受け取れます。（音ゲー中など PC を見れない場合でも通知であれば見れるという人
1. TTS and Discord transfer functions should be turned off individually / TTS や discord 転送は個別に使用・未使用を切り替えられる

## Functions / 機能

1. speak comment(this is main function. but optional) / コメントの読み上げ
   - comment will be converted to voice data via `say` command. / Mac の`say`コマンドを使って twitch のコメントを読み上げます  
     ( Google TTS version is now developing. / Google のテキスト読み上げサービスを利用したバージョンも開発中 )
   - add `!remember {keyword}={how_to_read}` and `!forget {keyword}` command for text to speech /  
     読み方の教育機能つけました。`!remember {keyword}={how_to_read}` で教育、`!forget {keyword}`で忘却
   - add `!dice {options}` command. / `!dice` コマンド  
     e.g.  
     `!dice 1d6 3d4` => throw one normal die, and three 4-sided dice /  
     `!dice 1d6 3d4` => 普通のサイコロを 1 個、4 面サイコロを 3 個振る
1. transfer comments to discord(optional)
   - if notification setting of discord was ON, you can receive comment as notification on mobile devise during streaming iOS games or something /  
     discord の通知を ON にしておけば、スマホ・タブレットなどでコメントを通知として表示できます。音ゲーなんかで目を離せない場合に便利

## Requirement / 必要なもの

- Generous heart(mandatory) / 優しい心（必須
- Courage to talk to me when something wrong(optional) / 何かあったときに僕に話しかける勇気（任意

### Mandatory for source use / source から使う場合に必須

1. node(~12.6.0)
1. yarn(~1.15.2)

### Mandatory / 必須

1. for text to speech / 読み上げに必要なもの
   - twitch IRC token( see <https://twitchapps.com/tmi/>

### Optional / 省略可能

1. for text to speech / 読み上げに必要なもの
   - mac
     1. install voice data via config / 音声データのインストール
   - cloudTTS ( 1~4 of [GCP TTS document](https://cloud.google.com/text-to-speech/docs/quickstart-client-libraries))
     1. create or login to GCP / 既存の GCP プロジェクトへログイン or 作成
     1. make new service accout for cloudTTS / cloudTTS 用のサービスアカウント作成・DL
     1. setup `serviceAccount.json` file to use 　(there is 2 method) / `serviceAccount.json` ファイルを使えるようにセットアップ（2 つの中から好きな方法で)
        - place file in `config` dir / `config` フォルダへファイルを設置
          1. save to `config` dir as `serviceAccount.json` / `config` フォルダの中に `serviceAccount.json` という名前で保存
          1. ( OR
             - remove `.sample` from filename of `config/serviceAccount.json.sample` / `config/serviceAccount.json.sample` のファイル名から `.sample` を削除
             - paste contents of downloaded service account file / DL したファイルの中身をリネームしたファイルにペースとして保存
        - add `GOOGLE_APPLICATION_CREDENTIALS` of `Environment variable` / 環境変数 `GOOGLE_APPLICATION_CREDENTIALS` へ path を追加
1. for transfer to discord / discord への転送に必要なもの
   - create bot
   - token
   - channel ID  
     search at google, like [discord+bot+token+channel+id](https://www.google.com/search?safe=off&q=discord+bot+token+channel+id&oq=discord+bot+token+channel+id)  
     see e.g. <https://github.com/Chikachi/DiscordIntegration/wiki/How-to-get-a-token-and-channel-ID-for-Discord>

## How to use / 使い方

### Install / インストール

#### Using binary / こちらでビルドした実行ファイルを使う

1. move to latest release / latest release に移動: https://github.com/allpaqa-jgk/twitch_text_to_speech_bot/releases/latest
   - download as zip & unzip / zip で落として解凍
   - download binary and place to same folder / 実行ファイルを DL して同じフォルダへ配置
     - mac: twitch_text_to_speech_bot
     - windows: twitch_text_to_speech_bot.exe
   - edit config/default.js / コンフィグファイルセットアップ

#### Using source / ソースコードから yarn, node で使う

1. download this repo / 下記の中から好きな方法でリポジトリをダウンロード
   1. clone / クローン
      - use HTTPS
        - `git clone https://github.com/allpaqa-jgk/twitch_text_to_speech_bot.git`
      - use SSH
        - `git clone git@github.com:allpaqa-jgk/twitch_text_to_speech_bot.git`
1. install node / node のインストール
   1. install using（homebrew を利用する場合
      - mac: run `brew install node`
   1. use `n` or `nodenv` / （`n`や`nodenv`を使いたい人はご自由にどうぞ
      - see <https://github.com/tj/n>
      - see <https://github.com/nodenv/nodenv>
1. install yarn / yarn というパッケージマネージャを入れる（別に npm でもいいっちゃいいんだけど
   1. run `npm install -g yarn`
1. install packages / パッケージのインストール
   1. move to dir of this repository / このファイルのあるフォルダへ移動
   1. run `yarn install` to install packages to `node_module` directory.
1. install voice data / 音声データのインストール
   ![スクリーンショット 2019-04-17 11 40 26](https://user-images.githubusercontent.com/49287928/56260686-1ff60300-6113-11e9-8316-e61b3ea5fbcf.png)
   ![スクリーンショット 2019-04-17 11 41 59](https://user-images.githubusercontent.com/49287928/56260687-1ff60300-6113-11e9-9c75-91772bb1ee11.png)
   ![スクリーンショット 2019-04-17 11 45 20](https://user-images.githubusercontent.com/49287928/56260688-1ff60300-6113-11e9-88ac-45c9419b9069.png)

### Setting / 初期設定・設定変更

1. copy `config.js.sample` to `config.js`
1. set token, ID and so on
1. change setting if you need
   - TTS_MODE: only 'Mac' is available, Google Cloud TTS version is now developing. Windows is not supported /  
     'Mac'のみ利用可能。Google Cloud TTS 版開発中、Windows はサポート外
   - READ_USERNAME: speak username who commented or not / コメントしたユーザー名も読み上げるかどうか
   - USE*SIMPLE_NAME: remove characters after '*' or numbers end of username / '\_' や末尾の数字を除去して読み上げ
   - SPEAKER_ENGLISH: "Susan" / 英語時の読み上げ音声の名前
   - SPEAKER_JAPANESE: "Kyoko" / 日本語のような 2 バイト文字の読み上げ音声の名前
   - RATE_ENGLISH: 150 / 英語の読み上げスピード
   - RATE_JAPANESE: 200 / 日本語の読み上げスピード
   - BILINGAL_MODE: false / 英語日本語で読み分けるかどうか
   - COMMENT_REMEMVER_AVAILABLE: true / 教育機能オンオフ
   - COMMENT_REMEMVER_REGEXP: "^!(remember)" / 教育コマンドのパターン
   - COMMENT_FORGET_REGEXP: "^!(forget)" / 忘却コマンドのパターン
   - DISCORD_TOKEN: '' / discord bot の token
   - DISCORD_CHANNEL_ID: '' / discord へ転送するチャンネルの ID
   - TW_OAUTH_TOKEN: '' / twitch のコメントを取得したりコメントを書き込んだりするユーザーの token（`{username}_bot`などのアカウントをもう一つ作ってそいつにやらせるのがおすすめ）
   - TW_CHANNEL_NAME: '' / twitch で監視するチャンネル名
   - BOT_USERNAME: '' / bot の名前を変えたいときに使う（微妙

### Exec / 起動

#### Binary

1. exec binary file ( downloaded from https://github.com/allpaqa-jgk/twitch_text_to_speech_bot/releases/latest

#### Source

1. start / スタート
   - move to repository dir / このリポジトリのディレクトリに移動
   - run `yarn start`
1. stop / 終了
   - push `ctrl - c` on your keyboard / キーボードで`ctrl - c`

### Update / 更新

which way did you choose when you download repo? / ダウンロード方法によってアップデート方法が違うよ

1. binary / 実行ファイルをダウンロードした場合
   - Download new files from (latest release)[https://github.com/allpaqa-jgk/twitch_text_to_speech_bot/releases/latest] / (latest release)[https://github.com/allpaqa-jgk/twitch_text_to_speech_bot/releases/latest] から最新版をダウンロード
   - unzip / 解凍
   - overwrite existing files / 既存ファイル上書き
1. clone as git repository / clone した場合
   - `git status`  
     check unstaged change. / コミットしていない変更がないかチェック  
     memo which version you using. / 戻したいときに戻せるように使ってるバージョンをチェック
   - `git pull origin master`
1. zip / zip で DL した場合
   - take backup of your setting and convert list / フォルダーごとバックアップをとる
   - download zip file of current `master branch` / DL し直します
   - unzip / 解凍
   - overwrite files / 上書き

## FAQ

1. Who are you? / お前誰
   - twitter: <https://twitter.com/haaaaaaa_8>
   - twitch: <https://www.twitch.tv/haaaaaaa>
1. Is this free to use? / ただで使える？
   - for Mac mode / Mac モード
     - YES! but I'm happy if you follow my twitch channel. /  
       いいよ！もし気に入ったら twitch のチャンネルをフォローしてもらえると嬉しいな
   - GoogleCloudTTS mode / GoogleCloudTTS モード
     - Free up to 1 million character/month / 100 万文字/月まで無料
1. How can I use on Windows? / windows で使える？
   - This bot is available for only Mac OS. Windows can use only CloudTTS mode. /  
     Mac モードは Mac のみ対応。Windows は CloudTTS モードのみ対応
1. Bug! / Question! / Great idea! / ばぐみつけた！ / 質問がある! / いいこと思いついた!
   1. tell me via twitter / 問題があったときや質問があればツイッターで教えて欲しいな
   1. feel free to make issue / issue にしてくれても OK
   1. or discord / discord も可  
      （you can find invitation on info panel on my twitch channel / twitch のチャンネルの情報パネルに招待リンクあるはず
1. How can I support of developing this repo? / 何かサポートしてやってもいいよって人
   - twitter
     - send message / リプ・DM 多分返します。多分
   - twitch
     - make comment during streaming / コメント歓迎
     - follow/subscribe / フォロー・サブスク
     - donate / ドネーション（寄付）  
       see info panel of my twitch channel / 情報パネルにリンクがあるよ
   - github
     - star this repo / このリポジトリにスターをつける
     - contribute to this repo / 開発社ぼしうちう
     - make issue about bug, idea and so on. / バグやアイディアを issue に書いて欲しいな
     - make PR for bugfix. / バグ修正

## Special Thanks

### Packages

- discordjs/uws
- google-cloud/text-to-speech
- config
- csv
- csv-parse
- discord.js
- forever
- forever-monitor
- play-sound
- request
- request-promise
- tmi.js

### Packages for dev

- eslint
- nexe
- prettier

### I used this repository as reference

- https://blog.sikmi.com/twitch_speaker
  - https://github.com/sikmi/twitch_speaker (ruby)

## Please feel free to send message / なにかあればお気軽にー

- twitter: <https://twitter.com/haaaaaaa_8>
- twitch: <https://www.twitch.tv/haaaaaaa>
