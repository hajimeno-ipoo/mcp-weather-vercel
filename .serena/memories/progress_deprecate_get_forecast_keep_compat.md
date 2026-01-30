# 進捗: get_forecast を互換用に残しつつ非推奨化

## 目的
- 候補地選択まで ChatGPT が `get_forecast` を呼んで先走るのを抑えたい

## 現状
- ウィジェットが候補地クリック/更新時に Open‑Meteo を直接 `fetch` して予報を表示するよう変更
- `get_forecast` ツールは互換のため残し、タイトル/説明で非推奨化

## 変更点
- 内部実装: `fetchForecastDirect()` をウィジェットJSに追加し、クリック/更新で `callTool("get_forecast")` を使わない
- 仕様変更(メタ): `get_forecast` の `title/description` を「非推奨」に更新
- ドキュメント: README に非推奨の注記を追加
- キャッシュ回避: `WIDGET_TEMPLATE_URI` を `weather-v20` に更新

## 検証
- `npm run build`

## リスク
- サーバ側キャッシュを使わず、候補地クリック時に直接APIを叩く（通信失敗時は表示エラーになる）

## ロールバック
- ウィジェットのクリック/更新を `callTool("get_forecast")` に戻し、`fetchForecastDirect` を削除