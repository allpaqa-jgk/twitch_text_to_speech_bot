module.exports = {
  "env": {
    "node": true
  },
  "extends": [
    "eslint:recommended", "standard", "prettier"
  ],
  "plugins": [
    "prettier"
  ],
  "globals": {
      "Atomics": "readonly",
      "SharedArrayBuffer": "readonly"
  },
  "parserOptions": {
      "ecmaVersion": 2018,
      "sourceType": "module"
  },
  "rules": {
    "no-console": 0,
    "indent": [
      "error",
      2
    ],
    "no-multi-spaces": [
      2,
      { exceptions: { "ObjectExpression": true } }
    ],
    "no-trailing-spaces": 1,
    "node/exports-style": "error",           //`module.exports`と`exports.*`を混ぜて使うと警告します。
    "node/no-deprecated-api": "error",       //Node.jsの非推奨APIを使用すると警告します。
    "node/no-missing-import": "error",       //`import`構文で存在しないファイルを読もうとすると警告します。
    "node/no-missing-require": "error",      //`require()`で存在しないファイルを読もうとすると警告します。
    "node/no-unpublished-bin": "error",      //CLIのエントリポイントが無視リストに入っていた場合に警告します。
    "node/no-unpublished-import": "error",   //`import`構文で公開後に読めなくなるモジュールを読もうとすると警告します。
    "node/no-unpublished-require": "error",  //`require()`で公開後に読めなくなるモジュールを読もうとすると警告します。
    "node/no-unsupported-features": "error", //指定したNode.jsのバージョンでサポートされていない構文を使おうとすると警告します。
    "node/process-exit-as-throw": "error",   //`process.exit()`の実行パスを修正します。
    "node/shebang": "error",                 //シバンの誤りを指摘します。
    "no-multiple-empty-lines": "error"
  }
}
