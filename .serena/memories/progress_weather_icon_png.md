# 進捗: 天気アイコンをPNGに対応（更新2）

## 症状
- ウィジェット内の `<img>` が空枠（読み込み失敗）。
- 先の404は、サンドボックスドメインに解決されていたのが原因。

## 対応
- `ASSET_BASE_URL` を末尾スラッシュ除去して正規化。
- `openai/widgetCSP.resource_domains` に `ASSET_BASE_URL` を追加し、サンドボックスCSPで外部画像（Vercelドメイン）を許可。
  - 追加箇所: `app/api/mcp/route.ts` の `registerResource(...)._meta.openai/widgetCSP`。

## 検証結果
- `npm run build` 成功。

## 次の確認
- Vercelへ再デプロイ後、ウィジェットで日別/時間別アイコンが画像表示されるか確認。
- もしまだ不可なら、コンソールのCSPエラー文を取得して原因特定。
