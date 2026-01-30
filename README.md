# MCP Weather (Vercel)

ChatGPT の Developer mode から接続できる MCP（Model Context Protocol）サーバーです。Open-Meteo の無料 API を使用して、天気予報機能を提供します。

**Vercel にデプロイすると、HTTPS で `/api/mcp` が使えるようになります。**

## 機能

### 使い方（手順）

手順1：チャットに地名を入力して送信します（例：東京）  
手順2：候補地がカードで表示されます  
手順3：候補地カードを選ぶと、週間（7日）の天気予報が表示されます

### ツール

- **geocode_place**: 地名を入力すると、複数の候補地（緯度経度）を返します
  - パラメータ: `place` (必須)、`count` (オプション、デフォルト: 20 / 最大: 20)
  
- **get_forecast**: 緯度経度から天気予報データを取得します
  - ※互換用の非推奨ツールです。通常は候補地カード選択でウィジェットが直接取得します
  - パラメータ: `latitude` (必須)、`longitude` (必須)、`days` (オプション、常に7日で返します)、`timezone` (オプション)

### UI

ChatGPT 内に動的なウィジェットが表示されます：
- 候補地検索結果のボタン
- 天気予報一覧
- 更新ボタン

## セットアップ

### 前提条件

- Node.js 18.0 以上
- npm 9.0 以上（または yarn、pnpm）

### ローカル開発

```bash
# 1. リポジトリをクローン
git clone <repository-url>
cd mcp-weather-vercel

# 2. 依存パッケージをインストール
npm install

# 3. 環境変数を設定（オプション）
cp .env.example .env.local
# .env.local を編集してカスタマイズ（デフォルト値で動作します）

# 4. 開発サーバーを起動
npm run dev

# 5. ブラウザでアクセス
# http://localhost:3000
# MCPエンドポイント: http://localhost:3000/api/mcp
```

### 本番ビルド

```bash
npm run build
npm start
```

## Vercel へのデプロイ

### 自動デプロイ（推奨）

1. GitHub にリポジトリをプッシュ
2. [Vercel Dashboard](https://vercel.com) にアクセス
3. **New Project** をクリック
4. GitHub リポジトリを選択
5. **Deploy** をクリック
6. デプロイ完了後、MCP URL を確認

### 手動デプロイ

```bash
# Vercel CLI をインストール
npm install -g vercel

# デプロイ
vercel
```

## ChatGPT への接続

### 設定手順

1. ChatGPT を開き、Developer mode を有効化
2. **Settings** → **Apps** または **Settings** → **Connectors**
3. **Create** をクリック
4. MCP Server URL を入力：
   - ローカル: `http://localhost:3000/api/mcp`
   - 本番: `https://your-vercel-url.vercel.app/api/mcp`
5. **Connect** をクリック

### ChatGPT での使用方法

```
ユーザー: "Tokyo の天気を教えてください"

ChatGPT:
1. geocode_place を使用して Tokyo の候補地を検索
2. 候補地を表示（UI ウィジェット内）
3. ユーザーが候補を選択
4. get_forecast を使用して天気予報を取得
5. 予報を表示・更新可能
```

## API リファレンス

### MCP エンドポイント

**URL**: `/api/mcp`  
**メソッド**: `POST`  
**Content-Type**: `application/json`

### geocode_place ツール

候補地を検索します。

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "geocode_place",
	    "arguments": {
	      "place": "Tokyo",
	      "count": 20
	    }
  }
}
```

**レスポンス例**:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "検索: Tokyo\n候補:\n1. Tokyo / Japan (35.6762, 139.6503)\n..."
      }
    ],
    "structuredContent": {
      "kind": "geocode",
      "query": "Tokyo",
      "candidates": [
        {
          "name": "Tokyo",
          "country": "Japan",
          "latitude": 35.6762,
          "longitude": 139.6503,
          "timezone": "Asia/Tokyo"
        }
      ]
    }
  }
}
```

### get_forecast ツール

天気予報を取得します。

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "get_forecast",
    "arguments": {
      "latitude": 35.6762,
      "longitude": 139.6503,
      "days": 3,
      "timezone": "Asia/Tokyo"
    }
  }
}
```

**レスポンス例**:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "座標: 35.6762, 139.6503 (Asia/Tokyo)\nいま: 12℃ / 風 8\n2026-01-28: 曇り / 10〜15℃ / 降水 最大20%\n..."
      }
    ],
    "structuredContent": {
      "kind": "forecast",
      "location": {
        "latitude": 35.6762,
        "longitude": 139.6503,
        "timezone": "Asia/Tokyo"
      },
      "current": {
        "temperature_c": 12,
        "windspeed": 8
      },
      "daily": [
        {
          "date": "2026-01-28",
          "summary_ja": "曇り",
          "temp_max_c": 15,
          "temp_min_c": 10,
          "precip_prob_max_percent": 20
        }
      ]
    }
  }
}
```

## 環境変数

`.env.example` をコピーして `.env.local` を作成し、カスタマイズできます。

| 変数名 | デフォルト | 説明 |
|--------|-----------|------|
| `NEXT_PUBLIC_GEOCODING_API_URL` | `https://geocoding-api.open-meteo.com/v1/search` | ジオコーディング API の URL |
| `NEXT_PUBLIC_FORECAST_API_URL` | `https://api.open-meteo.com/v1/forecast` | 天気予報 API の URL |
| `MCP_REQUEST_TIMEOUT` | `30` | API リクエストのタイムアウト（秒） |
| `MCP_RETRY_ATTEMPTS` | `3` | API リクエスト失敗時のリトライ回数 |
| `NEXT_PUBLIC_GEOCODING_DEFAULT_COUNT` | `20` | ジオコーディングのデフォルト結果数 |
| `NEXT_PUBLIC_FORECAST_DEFAULT_DAYS` | `7` | 予報のデフォルト日数（常に7日） |
| `NEXT_PUBLIC_DEFAULT_TIMEZONE` | `Asia/Tokyo` | デフォルトタイムゾーン |

## トラブルシューティング

詳細なトラブルシューティングガイドは [docs/troubleshooting/](./docs/troubleshooting/) を参照してください。

### よくある問題

#### ビルドエラー: "Type 'string' is not assignable to type 'AnySchema'"

**解決方法**: Zod スキーマを使用しているか確認してください。

```typescript
// ❌ 間違い
inputSchema: { type: "object", properties: {} }

// ✅ 正しい
inputSchema: z.object({ /* ... */ })
```

詳細は [docs/troubleshooting/issue-schema-validation-error.md](./docs/troubleshooting/issue-schema-validation-error.md) を参照。

#### API がタイムアウトする

**解決方法**: 環境変数 `MCP_REQUEST_TIMEOUT` を増加させる。

```bash
MCP_REQUEST_TIMEOUT=60  # 60 秒に設定
```

#### リトライについて

API リクエストが失敗した場合、自動的に最大 `MCP_RETRY_ATTEMPTS` 回リトライされます。

```bash
MCP_RETRY_ATTEMPTS=5  # 最大 5 回リトライ
```

## パフォーマンス

### キャッシング

現在、API 呼び出しはキャッシュされていません。本番環境では CDN キャッシングの使用を検討してください。

### レスポンス時間

- geocode_place: 1-3 秒（Open-Meteo API の遅延含む）
- get_forecast: 1-2 秒

## 開発

### ファイル構成

```
.
├── app/
│   ├── api/
│   │   └── mcp/
│   │       └── route.ts          # MCP ハンドラーのメイン実装
│   ├── layout.tsx
│   └── page.tsx
├── docs/
│   └── troubleshooting/           # トラブルシューティングガイド
├── .env.example                   # 環境変数テンプレート
├── next.config.mjs                # Next.js 設定
├── package.json
├── tsconfig.json
└── README.md                      # このファイル
```

### スクリプト

```bash
npm run dev       # 開発サーバー起動
npm run build     # 本番ビルド
npm start         # ビルド済みの本番サーバー起動
```

## テスト

```bash
# ビルドテスト
npm run build

# 開発サーバーでテスト
npm run dev
```

## トラブルシューティング

詳細なテスト方法は [docs/troubleshooting/testing-guide.md](./docs/troubleshooting/testing-guide.md) を参照。

## 技術スタック

- **Runtime**: Node.js
- **フレームワーク**: Next.js 16.1.5
- **言語**: TypeScript 5.6.3
- **バリデーション**: Zod 3.25.76
- **MCP**: mcp-handler 1.0.7
- **デプロイ**: Vercel

## ライセンス

MIT

## サポート

問題が発生した場合は、[docs/troubleshooting/](./docs/troubleshooting/) フォルダを確認してください。

## API 出典

- **ジオコーディング**: [Open-Meteo Geocoding API](https://open-meteo.com/en/docs/geocoding-api)
- **天気予報**: [Open-Meteo Weather API](https://open-meteo.com/en/docs)

両 API とも無料で使用でき、API キーが不要です。
