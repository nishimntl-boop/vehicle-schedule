# 車両人員予定表 GitHub Pages版 v47（共有高速化版）

v46で正常動作した共有方式を維持し、GAS側の読み込みを高速化した版です。

## 今回の変更
- GASの通常読み込みを `CacheService` 優先に変更。
- 保存完了時にキャッシュを即更新するため、次回の読み込みでSpreadsheetを毎回開かずに済む構成。
- GitHub Pages → GAS は従来どおり JSONP、保存は hidden form POST。
- 自動同期間隔を10秒→7秒に短縮。
- 既存の予定・色・車両・人員・PWA仕様は変更していません。

## GAS更新
`gas/Code.gs` を現在のGASプロジェクトへ貼り付けて保存し、Webアプリを新しいバージョンで再デプロイしてください。

設定：
- 実行ユーザー：自分
- アクセスできるユーザー：全員

## GitHub Pages更新
`index.html`、`manifest.json`、`sw.js`、`icons/` をGitHub Pagesへアップロードしてください。
