# twitch text to speech bot for MacOS

TTS for twitch without Limechat

**!!CAUTION!! / 注意**  
**!!this readme might be incorrect / このREADMEは正しくない可能性があります!!**

## functions / 機能

1. speak comment(this is main function. but optional) / コメントの読み上げ
    - comment will be converted to voice data via `say` command. / Macの`say`コマンドを使ってtwitchのコメントを読み上げます  
    ( Google TTS version is now developing. / Googleのテキスト読み上げサービスを利用したバージョンも開発中 )
    - add `!remember {keyword}={how_to_read}` and `!forget {keyword}` command for text to speech /  
    読み方の教育機能つけました。`!remember {keyword}={how_to_read}` で教育、`!forget {keyword}`で忘却
    - add `!dice {options}` command. / `!dice` コマンド  
    e.g.  
    `!dice 1d6 3d4` => throw one normal die, and three 4-sided dice /  
    `!dice 1d6 3d4` => 普通のサイコロを1個、4面サイコロを3個振る
1. transfer comments to discord(optional)
    - if notification setting of discord was ON, you can receive comment as notification on mobile devise during streaming iOS games or something /  
    discordの通知をONにしておけば、スマホ・タブレットなどでコメントを通知として表示できます。音ゲーなんかで目を離せない場合に便利

## requirement / 必要なもの

- 優しい心（必須
- 何かあったときに僕に話しかける勇気（任意

### mandatory for source use / sourceから使う場合に必須

1. node(>= 11.12)
1. yarn(~1.15.2)

### mandatory / 必須

1. for text to speech / 読み上げに必要なもの
    - twitch IRC token( see <https://twitchapps.com/tmi/>

### optional / 省略可能

1. for text to speech / 読み上げに必要なもの
    - install voice data via config / 音声データのインストール
1. for transfer to discord / discordへの転送に必要なもの
    - create bot
    - token
    - channel ID  
    search at google, like [discord+bot+token+channel+id](https://www.google.com/search?safe=off&q=discord+bot+token+channel+id&oq=discord+bot+token+channel+id)  
    see e.g. <https://github.com/Chikachi/DiscordIntegration/wiki/How-to-get-a-token-and-channel-ID-for-Discord>

## how to use / 使い方

### install / インストール

#### Using binary / こちらでビルドした実行ファイルを使う

this is RC! / 現在準備中

1. move to latest release / latest releaseに移動: https://github.com/allpaqa-jgk/twitch_text_to_speech_bot/releases/latest
    - download as zip & unzip / zipで落として解凍
    - download binary and place to same folder / 実行ファイルをDLして同じフォルダへ配置
        - mac: twitch_text_to_speech_bot
        - windows: twitch_text_to_speech_bot.exe
    - edit config/default.js / コンフィグファイルセットアップ

#### Using source / ソースコードからyarn, nodeで使う

1. download this repo / 下記の中から好きな方法でリポジトリをダウンロード
    1. clone / クローン
        - use HTTPS
            - `git clone https://github.com/allpaqa-jgk/twitch_text_to_speech_bot.git`
        - use SSH
            - `git clone git@github.com:allpaqa-jgk/twitch_text_to_speech_bot.git`
1. install node / nodeのインストール
    1. install using（homebrewを利用する場合
        - mac: run `brew install node`
    1. use `n` or `nodenv` / （`n`や`nodenv`を使いたい人はご自由にどうぞ
        - see <https://github.com/tj/n>
        - see <https://github.com/nodenv/nodenv>
1. install yarn / yarnというパッケージマネージャを入れる（別にnpmでもいいっちゃいいんだけど
    1. run `npm install -g yarn`
1. install packages / パッケージのインストール
    1. move to dir of this repository / このファイルのあるフォルダへ移動
    1. run `yarn install` to install packages to `node_module` directory.
1. install voice data / 音声データのインストール
    ![スクリーンショット 2019-04-17 11 40 26](https://user-images.githubusercontent.com/49287928/56260686-1ff60300-6113-11e9-8316-e61b3ea5fbcf.png)
    ![スクリーンショット 2019-04-17 11 41 59](https://user-images.githubusercontent.com/49287928/56260687-1ff60300-6113-11e9-9c75-91772bb1ee11.png)
    ![スクリーンショット 2019-04-17 11 45 20](https://user-images.githubusercontent.com/49287928/56260688-1ff60300-6113-11e9-88ac-45c9419b9069.png)

### setting / 初期設定・設定変更

1. copy `config.js.sample` to `config.js`
1. set token, ID and so on
1. change setting if you need
    - TTS_MODE: only 'Mac' is available, Google Cloud TTS version is now developing. Windows is not supported /  
    'Mac'のみ利用可能。Google Cloud TTS版開発中、Windowsはサポート外
    - READ_USERNAME: speak username who commented or not / コメントしたユーザー名も読み上げるかどうか
    - SPEAKER_ENGLISH: "Susan" / 英語時の読み上げ音声の名前
    - SPEAKER_JAPANESE: "Kyoko" / 日本語のような2バイト文字の読み上げ音声の名前
    - RATE_ENGLISH: 150 / 英語の読み上げスピード
    - RATE_JAPANESE: 200 / 日本語の読み上げスピード
    - BILINGAL_MODE: true / 英語日本語で読み分けるかどうか
    - COMMENT_REMEMVER_AVAILABLE: true / 教育機能オンオフ
    - DISCORD_TOKEN: '' / discord botのtoken
    - DISCORD_CHANNEL_ID: '' / discordへ転送するチャンネルのID
    - TW_OAUTH_TOKEN: '' / twitchのコメントを取得したりコメントを書き込んだりするユーザーのtoken（`{username}_bot`などのアカウントをもう一つ作ってそいつにやらせるのがおすすめ）
    - TW_CHANNEL_NAME: '' / twitchで監視するチャンネル名
    - BOT_USERNAME: '' / botの名前を変えたいときに使う（微妙

### exec / 起動

#### binary

1. exec binary file ( downloaded from https://github.com/allpaqa-jgk/twitch_text_to_speech_bot/releases/latest

#### source

1. start / スタート
    - move to repository dir / このリポジトリのディレクトリに移動
    - run `yarn start`
1. stop / 終了
    - push `ctrl - c` on your keyboard / キーボードで`ctrl - c`

### update / 更新

which way did you choose when you download repo? / ダウンロード方法によってアップデート方法が違うよ

1. clone as git repository / cloneした場合
    - `git status`  
    check unstaged change. / コミットしていない変更がないかチェック  
    memo which version you using. / 戻したいときに戻せるように使ってるバージョンをチェック
    - `git pull origin master`
1. zip / zipでDLした場合
    - take backup of your setting and convert list / フォルダーごとバックアップをとる
    - download zip file of current `master branch` / DLし直します
    - unzip / 解凍
    - overwrite files / 上書き

## FAQ

1. Who are you? / お前誰
    - twitter: <https://twitter.com/haaaaaaa_8>
    - twitch: <https://www.twitch.tv/haaaaaaa>
1. Is this free to use? / ただで使える？
    - YES! but I'm happy if you follow my twitch channel. /  
    いいよ！もし気に入ったらtwitchのチャンネルをフォローしてもらえると嬉しいな
1. How can I use on Windows? / windowsで使える？
    - This bot is available for only Mac OS. Windows is not supported now. /  
    Macのみ対応。改造したら使えるようにできるとは思うけどどうしよっかなって感じ
1. Bug! / Question! / Great idea! / ばぐみつけた！ / 質問がある! / いいこと思いついた!
    1. tell me via twitter / 問題があったときや質問があればツイッターで教えて欲しいな
    1. feel free to make issue / issueにしてくれてもOK
    1. or discord / discordも可  
    （you can find invitation on info panel on my twitch channel / twitchのチャンネルの情報パネルに招待リンクあるはず
1. How can I support of developing this repo? / 何かサポートしてやってもいいよって人
    - twitter
        - send message / リプ・DM多分返します。多分
    - twitch
        - make comment during streaming / コメント歓迎
        - follow/subscribe / フォロー・サブスク
        - donate / ドネーション（寄付）  
        see info panel of my twitch channel / 情報パネルにリンクがあるよ
    - github
        - star this repo / このリポジトリにスターをつける
        - contribute to this repo / 開発社ぼしうちう
        - make issue about bug, idea and so on. / バグやアイディアをissueに書いて欲しいな
        - make PR for bugfix. / バグ修正

## Special Thanks

### Packages

- discord.js
- tmi.js
- play-sound
- @google-cloud/text-to-speech
- dotenv
- csv-parse
- csv

## Please feel free to send message / なにかあればお気軽にー

- twitter: <https://twitter.com/haaaaaaa_8>
- twitch: <https://www.twitch.tv/haaaaaaa>
