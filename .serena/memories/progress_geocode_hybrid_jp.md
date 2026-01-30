# 進捗: ローカルJP地名検索(GeoNames) 追加

## 変更点
- 仕様変更: `geocode_place` がまず `JP/JP.txt` を部分一致検索し、見つからない時だけ Open‑Meteo(ja→en) にフォールバック
- 内部実装: `app/api/mcp/geonamesJp.ts` で `JP/JP.txt` を読み込み、行政区(A)と都市(P)を優先して候補をスコア順に返す
- 内部実装: `next.config.mjs` に `outputFileTracingIncludes` を追加し、Vercelデプロイ時に `JP/JP.txt` を確実に同梱

## 影響範囲
- 呼び出し元: `app/api/mcp/route.ts` の `geocodeCandidates()`（候補地検索の結果が変わる）

## 検証結果
- `npm run build`

## リスク
- `JP/JP.txt` を初回ロードする分、最初の検索だけ少し遅くなる可能性あり

## ロールバック
- `app/api/mcp/geonamesJp.ts` の利用と `next.config.mjs` の `outputFileTracingIncludes` を削除して、従来のOpen‑Meteo検索だけに戻す