# 進捗: 天気アイコンをPNGに対応（更新5 / 強度別）

## 変更点
- 雨/雪の強さを分けるため、WMO weathercode→PNG対応表を詳細化。
  - 雨: drizzle(51-55) / rain(61-65) / showers(80-82) で light/medium/heavy を `light_rain` / `shower1` / `shower2` / `shower3` に割当。
  - 雪: 71/73/75 を `snow1` / `snow3` / `snow5` に割当。
  - ひょう/みぞれ: 56/57/66/67 を `sleet`、96/99 を `tstorm2` / `tstorm3`。

## 技術
- `app/api/mcp/iconData.ts` のbase64同梱アイコンを増やした（強度別に必要なPNGを追加）。
- テンプレキャッシュ回避で `ui://widget/weather-v3.html` に更新。

## 検証
- `npm run build` 成功。
