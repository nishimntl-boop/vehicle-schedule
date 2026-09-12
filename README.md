# 車両・人員 配置管理（GitHub Pages版 v27）

## 構成
- GitHub Pages：予定表の画面を配信
- Google Apps Script：共有データの読み書き
- Googleスプレッドシート：共有データ保存

## GitHub Pages
このフォルダの中身をGitHubリポジトリのルートへアップロードしてください。
`index.html` がトップページになります。

## Google Apps Script
`gas/Code.gs` をApps Scriptの `Code.gs` に置き換えてください。

このv27ではApps Scriptがスプレッドシートに紐付いていなくても動作するよう、対象スプレッドシートIDを固定しています。

対象スプレッドシートID:
`1KYmKn-zGJyLdrut_pjQ_QFVWH6BCIR_wNu910Hf2i80`

Webアプリ設定:
- 実行するユーザー：自分
- アクセスできるユーザー：全員

既存のWebアプリデプロイを「新しいバージョン」に更新してください。URLは現在のものをそのまま使用します。

## 現在のGAS URL
`https://script.google.com/macros/s/AKfycbw6NI9FHyRj1afnCuPNeuUZCcFGP3n0n0OIlMEvlSrridqC1FcQl6166th9gGSmtzTP/exec`

## 動作確認
1. PCで予定を1件登録
2. 数秒待ってスマホでGitHub Pagesを再読み込み
3. PCで登録した予定がスマホにも表示されることを確認
4. スマホから別の予定を登録し、PCを再読み込みして確認

## 注意
GitHub Pagesで公開するサイトはインターネット上からアクセス可能です。リポジトリに個人情報・パスワード・秘密鍵などを入れないでください。


## v30 修正
- 共有同期後にスマホ用予定追加モーダルの車両・人員チェック欄が消える不具合を修正
- 確定・予定の色を端末によらず統一
- PWAキャッシュをv30へ更新

- v31: PC→GAS保存をiframe POST + JSONP確認方式に変更、保存中の自動読込による上書きを防止

- v32: GAS側indexにも同じ保存確認処理を反映、SW登録番号を更新
