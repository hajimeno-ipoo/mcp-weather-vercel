# 進捗: 天気アイコンをPNGに対応（更新）

## 追加で直したこと
- 不具合: ウィジェット(iframe)内で `/weather_icon/...` を読むと、サンドボックスドメインに解決されて 404 になっていた。
- 対応: アイコンURLを絶対URLにできるよう `ASSET_BASE_URL` を導入し、`icon_url` とウィジェット内 `wmoToIconUrl()` が `https://<vercel>/weather_icon/...` を返すように変更。
  - 優先順: `NEXT_PUBLIC_APP_URL` → `APP_URL` → `VERCEL_URL`（あれば `https://` を付与）→ なしなら相対のまま。

## 影響範囲
- 対象ファイル: `app/api/mcp/route.ts`
- データ: `get_forecast` 日別に `icon_url` を追加（既存 `icon` は維持）。

## 検証結果
- `npm run build` 成功。

## リスク
- もしApps SDK側のCSPで外部`img-src`が制限されていると表示不可の可能性。ただし今回の失敗は 404 だったので、まずは絶対URL化で改善が期待できる。

## ロールバック
- `ASSET_BASE_URL` と `icon_url` / `<img>` 部分を削除して、絵文字表示だけに戻す。