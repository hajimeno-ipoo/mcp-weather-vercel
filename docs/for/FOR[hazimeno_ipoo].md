# これは何か（1〜3行）
- Vercel 上で動く MCP（Model Context Protocol）サーバーです。
- Open-Meteo API を使って「地名→座標」と「天気予報」を返します。
- ChatGPT などのウィジェット表示（HTML）も返します。

# 何ができるか（箇条書き）
- `geocode_place`: 地名から候補地（緯度・経度など）を返す
- `get_forecast`: 緯度・経度から最大7日分の予報を返す（ウィジェットに日付カードやグラフを表示）

# どう動くか（全体の流れ）
- クライアントが `POST /api/mcp` に JSON-RPC でツール呼び出し
- サーバーが Open-Meteo に問い合わせて結果を整形
- `structuredContent` と、ウィジェット用 `ui://widget/weather.html` を返す

# 主要な画面/モジュール（役割）
- `app/api/mcp/route.ts`: MCP エンドポイントとウィジェットHTML（`widgetHtml()`）本体
- `app/api/mcp/types.ts`: 型定義
- `app/api/mcp/cache.ts`: 予報のキャッシュ

# データの流れ（入力→処理→出力）
- 入力: `place` または `latitude/longitude/days`（Zodで検証）
- 処理: Open-Meteo API 呼び出し → 形を揃える
- 出力: `structuredContent`（候補/予報）＋ウィジェットHTML

# 設定・環境（必要なら）
- Node.js / Next.js（App Router）
- `.env.local`（任意。`.env.example` あり）

# よくある作業（起動、テスト、ビルド、デプロイ）
- 起動: `npm run dev`
- ビルド: `npm run build`
- 本番起動: `npm start`
- MCP エンドポイント: `http://localhost:3000/api/mcp`

# 変更時の注意（壊れやすい所、反例チェック）
- ウィジェットUIは `route.ts` のテンプレ文字列内で DOM を直接作っている（HTML/CSS/JSが同居）。
- 反例チェック例: 「候補地カードのクリックで予報に切り替わる」「日付カードのクリックで詳細が出る」。
