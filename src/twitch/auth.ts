import fs from "fs";
import path from "path";
import { paths } from "../paths";

export const TWITCH_CLIENT_ID = "7dk45kh2j51i6rk3wcen6ctu7g8cqi";
export const TWITCH_REDIRECT_URI = "http://localhost:3000";
export const TWITCH_PORT = 3000;
export const TWITCH_SCOPES = ["chat:read", "chat:edit"];

export interface TwitchAuthResult {
  token: string;
  login: string;
  displayName: string;
}

function openBrowser(url: string) {
  const plat = process.platform;
  let cmd: string[];
  if (plat === "darwin") {
    cmd = ["open", url];
  } else if (plat === "win32") {
    cmd = ["cmd", "/c", "start", url];
  } else {
    cmd = ["xdg-open", url];
  }
  try {
    Bun.spawn(cmd, { stdout: "ignore", stderr: "ignore" });
  } catch {
    // ignore browser open errors
  }
}

const AUTH_HTML = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Twitch TTS Bot - 連携完了</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      background: #0e0e10;
      color: #efeff1;
    }
    .card {
      background: #18181b;
      padding: 2.5rem 2rem;
      border-radius: 12px;
      border: 1px solid #2f2f35;
      text-align: center;
      max-width: 440px;
      width: 90%;
      box-shadow: 0 10px 25px rgba(0,0,0,0.5);
    }
    .icon {
      font-size: 2.5rem;
      margin-bottom: 1rem;
    }
    h1 {
      color: #bf94ff;
      margin: 0 0 1rem 0;
      font-size: 1.4rem;
    }
    p {
      color: #adadb8;
      line-height: 1.6;
      font-size: 0.95rem;
      margin: 0.5rem 0;
    }
    .badge {
      display: inline-block;
      margin-top: 1rem;
      padding: 0.4rem 1rem;
      background: #26262c;
      border-radius: 20px;
      font-size: 0.9rem;
      color: #00f59b;
      font-weight: 600;
    }
    .error {
      color: #eb0400;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon" id="icon">⏳</div>
    <h1 id="title">Twitch 認証処理中</h1>
    <p id="msg">認証トークンを確認しています。少々お待ちください...</p>
    <div id="badge-container"></div>
  </div>
  <script>
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const token = params.get('access_token');
    const error = params.get('error_description') || params.get('error');

    if (token) {
      fetch('/save-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token })
      })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          document.getElementById('icon').innerText = '✅';
          document.getElementById('title').innerText = '連携が完了しました！';
          document.getElementById('title').style.color = '#00f59b';
          document.getElementById('msg').innerHTML = 'ユーザー: <b>' + (data.displayName || data.username) + '</b> (' + data.username + ')<br><br>このウィンドウを閉じて、ターミナルにお戻りください。';
          document.getElementById('badge-container').innerHTML = '<span class="badge">認証成功</span>';
        } else {
          document.getElementById('icon').innerText = '⚠️';
          document.getElementById('title').innerText = '認証情報の取得に失敗しました';
          document.getElementById('msg').innerText = data.error || '不明なエラーが発生しました';
        }
      })
      .catch(err => {
        document.getElementById('icon').innerText = '❌';
        document.getElementById('title').innerText = '通信エラー';
        document.getElementById('msg').innerText = 'ローカルサーバーとの通信に失敗しました: ' + err;
      });
    } else if (error) {
      document.getElementById('icon').innerText = '❌';
      document.getElementById('title').innerText = 'Twitch 認証が拒否または失敗しました';
      document.getElementById('msg').innerText = error;
    } else {
      document.getElementById('icon').innerText = '❓';
      document.getElementById('title').innerText = 'トークンが見つかりません';
      document.getElementById('msg').innerText = 'リダイレクトURLにトークンが含まれていませんでした。もう一度お試しください。';
    }
  </script>
</body>
</html>
`;

/**
 * Twitch の OAuth 認証サーバーを起動し、ブラウザで認証を行ってトークンとユーザー名を取得・保存する
 */
export async function startTwitchOAuthFlow(): Promise<TwitchAuthResult> {
  const authUrl = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${encodeURIComponent(
    TWITCH_REDIRECT_URI
  )}&response_type=token&scope=${encodeURIComponent(
    TWITCH_SCOPES.join(" ")
  )}&force_verify=true`;

  console.log("\n=======================================================");
  console.log("🔑 Twitch 認証を開始します");
  console.log("=======================================================");
  console.log("自動でブラウザが開きます。");
  console.log("もしブラウザが開かない場合は、以下のURLを直接開いてください:\n");
  console.log(authUrl);
  console.log("=======================================================\n");

  return new Promise<TwitchAuthResult>((resolve, reject) => {
    let server: any;

    try {
      server = Bun.serve({
        port: TWITCH_PORT,
        async fetch(req) {
          const url = new URL(req.url);

          // ブラウザからの初期アクセスまたはリダイレクト戻り時
          if (url.pathname === "/" || url.pathname === "") {
            return new Response(AUTH_HTML, {
              headers: { "Content-Type": "text/html; charset=utf-8" },
            });
          }

          // ブラウザの JS がトークンを抽出して POST してきたとき
          if (url.pathname === "/save-token" && req.method === "POST") {
            try {
              const body = (await req.json()) as { token: string };
              const token = body.token;

              if (!token) {
                return Response.json(
                  { success: false, error: "トークンが空です" },
                  { status: 400 }
                );
              }

              // Twitch Helix API でユーザー情報を検証・取得
              const userRes = await fetch("https://api.twitch.tv/helix/users", {
                headers: {
                  "Client-Id": TWITCH_CLIENT_ID,
                  Authorization: `Bearer ${token}`,
                },
              });

              if (!userRes.ok) {
                const errText = await userRes.text();
                console.error("[TwitchAuth] Helix user check failed:", errText);
                return Response.json(
                  { success: false, error: "Twitch API でのユーザー確認に失敗しました" },
                  { status: 400 }
                );
              }

              const userData = (await userRes.json()) as {
                data: Array<{ login: string; display_name: string; id: string }>;
              };

              const user = userData.data[0];
              const login = user?.login || "";
              const displayName = user?.display_name || login;

              const fullOauthToken = `oauth:${token}`;

              // 1. auth.json に保存
              const authPath = paths.authJson();
              const authData = {
                oauthToken: fullOauthToken,
                channelName: login,
                username: login,
                displayName: displayName,
                updatedAt: new Date().toISOString(),
              };

              fs.writeFileSync(authPath, JSON.stringify(authData, null, 2), "utf-8");

              console.log("\n-------------------------------------------------------");
              console.log("🎉 Twitch 認証に成功しました！");
              console.log(`👤 ユーザー名 : ${displayName} (@${login})`);
              console.log(`📺 対象チャンネル: #${login}`);
              console.log(`💾 認証ファイルを保存: ${authPath}`);
              console.log("-------------------------------------------------------\n");

              // ブラウザへ応答
              const response = Response.json({
                success: true,
                username: login,
                displayName: displayName,
              });

              // 少し待ってからサーバーを停止し Promise を解決
              setTimeout(() => {
                server.stop();
                resolve({
                  token: fullOauthToken,
                  login,
                  displayName,
                });
              }, 500);

              return response;
            } catch (err: any) {
              console.error("[TwitchAuth] Error processing token:", err);
              return Response.json(
                { success: false, error: err.message },
                { status: 500 }
              );
            }
          }

          return new Response("Not Found", { status: 404 });
        },
      });

      // ブラウザを開く
      openBrowser(authUrl);
    } catch (err) {
      reject(err);
    }
  });
}
