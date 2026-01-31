# 進捗メモ: manifest統一 + daysズレ解消

## 進捗
- 完了

## 変更点（仕様変更）
- `get_forecast` は入力で `days` を受け取らない（常に7日固定）に統一

## 変更点（内部実装）
- `manifest.json` と `public/manifest.json` を同一内容に統一（`ui://widget/weather-v23.html` + OSM iframe 用 `frame-src` を含む）
- `app/api/mcp/route.ts` の `getForecastSchema` から `days` を削除
- ブレ再発防止として manifest 一致テストを追加（`scripts/test-manifest.mjs`）
- `package.json` に `npm test`/`npm run lint` を追加（test=manifest一致、lint=tsc noEmit）
- README/主要ドキュメントの `days`/`timezone` 記載を整理

## 影響範囲
- `public/manifest.json` がデプロイ時に配信されるので、ChatGPT 側の Schema URL 参照に影響
- `get_forecast` に `days` を送ってくるクライアントは、Zodのデフォルト挙動（未知キーは捨てる）により基本は壊れにくい

## 検証結果
- `npm test`
- `npm run lint`

## リスク
- `manifest.json` と `public/manifest.json` を手で別々に編集するとズレる（→ `npm test` で検出）

## ロールバック
- `getForecastSchema` に `days` を戻し、`forecastByCoords(..., 7)` を入力値に合わせる（または docs を元に戻す）
- manifest は変更前の JSON に戻す