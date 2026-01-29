# 進捗: 天気アイコンをPNGに対応（更新3）

## 症状
- 画像が依然として空枠になるケースがあり、CSP更新が反映されていない（キャッシュ）可能性がある。

## 対応
- ウィジェットテンプレURIを `ui://widget/weather-v2.html` に変更し、ChatGPT側のテンプレキャッシュを回避。
  - 変更箇所: `registerResource` のURIと、各ツールの `openai/outputTemplate`。

## 検証結果
- `npm run build` 成功。

## 次の確認
- Vercelへ再デプロイ後、ウィジェットでアイコン表示が復活するか確認。
