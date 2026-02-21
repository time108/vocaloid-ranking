# ボカロランキング

人気ボカロ曲を検索・ランキング表示するWebアプリです。
**YouTube Data API v3**（公式API）を使用しており、完全に合法です。

## 使い方

1. `index.html` をブラウザで開く（ダブルクリック、または `open index.html`）
2. YouTube Data API キーを入力して「保存して開始」
3. キャラクター・並び順・期間を絞り込んでランキング確認

## YouTube APIキーの取得（無料）

1. https://console.cloud.google.com/ にアクセス
2. 新しいプロジェクトを作成
3. 「APIとサービス」→「ライブラリ」→「YouTube Data API v3」を有効化
4. 「APIとサービス」→「認証情報」→「APIキーを作成」
5. 発行されたキーをアプリに貼り付け

> 無料枠：1日 10,000クォータ（通常使用で十分）

## 機能

- キャラクター別フィルター（ミク / リン / レン / ルカ / KAITO / MEIKO / flower）
- 並び順（再生数順 / 新着順 / 関連度順）
- 期間フィルター（今週 / 今月 / 今年 / 全期間）
- フリーワード検索
- ページネーション（もっと見る）
- YouTubeへの直接リンク

## 法的事項

- データ取得に使用する YouTube Data API v3 は Google が公式提供するAPIです
- [YouTube API 利用規約](https://developers.google.com/youtube/terms/api-services-terms-of-service) に準拠しています
- 動画・楽曲の著作権はそれぞれの権利者に帰属します
- APIキーはブラウザのローカルストレージのみに保存され、外部には送信されません
