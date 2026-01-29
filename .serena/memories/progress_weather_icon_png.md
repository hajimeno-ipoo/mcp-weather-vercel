# 進捗: 天気アイコンをPNGに対応（更新4 / 401対策）

## 原因
- ウィジェット(iframe)からVercelのPNGを直接読むと 401 で落ちる（スクショ/ログより）。
  - 404ではなく401なので、CSPというより「認証/保護/プロキシ都合で画像が取れない」系。

## 対応
- PNGをbase64化してウィジェットHTMLに同梱し、`<img src="data:image/png;base64,...">` で表示するように変更。
  - 生成ファイル: `app/api/mcp/iconData.ts`
  - 対応表は軽量化のため代表アイコンに集約（晴/くもり/雨/雪/霧/雷/不明 + 夜版）。

## 影響範囲
- `app/api/mcp/route.ts`
- `app/api/mcp/iconData.ts`

## 検証結果
- `npm run build` 成功。

## リスク
- `data:` がCSPで禁止されている環境だと表示できない可能性（その場合はコンソールにCSPエラーが出るはず）。

## ロールバック
- `app/api/mcp/iconData.ts` と、ウィジェット内の `ICON_PNG_BASE64` / data: 化部分を削除し、絵文字表示に戻す。