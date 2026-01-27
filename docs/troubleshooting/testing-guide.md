# テスト・検証ガイド

## ローカルテスト方法

### 1. ビルドテスト

```bash
cd /Users/apple/Desktop/Dev_App/mcp-weather-vercel
npm run build
```

**期待される結果**:
```
✓ Compiled successfully
Running TypeScript ...
✓ Generating static pages using 11 workers
```

### 2. 開発サーバーテスト

```bash
npm run dev
```

サーバーが起動したら、別のターミナルで MCP API をテストします。

### 3. MCP API テスト

#### geocode_place ツール呼び出し

```bash
curl -X POST http://localhost:3000/api/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "geocode_place",
      "arguments": {
        "place": "Tokyo",
        "count": 5,
        "days": 3
      }
    }
  }'
```

**期待される応答**:
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
      "days": 3,
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

#### get_forecast ツール呼び出し

```bash
curl -X POST http://localhost:3000/api/mcp \
  -H "Content-Type: application/json" \
  -d '{
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
  }'
```

**期待される応答**:
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
        "windspeed": 8,
        "winddirection": 180,
        "is_day": true,
        "time": "2026-01-28T14:30"
      },
      "daily": [
        {
          "date": "2026-01-28",
          "weathercode": 3,
          "summary_ja": "くもり",
          "temp_max_c": 15,
          "temp_min_c": 10,
          "precip_prob_max_percent": 20
        }
      ]
    }
  }
}
```

## エラーハンドリングテスト

### 無効な入力テスト

```bash
curl -X POST http://localhost:3000/api/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "geocode_place",
      "arguments": {
        "place": ""
      }
    }
  }'
```

**期待される動作**: バリデーションエラーが返される

### 存在しないツール呼び出し

```bash
curl -X POST http://localhost:3000/api/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 4,
    "method": "tools/call",
    "params": {
      "name": "nonexistent_tool",
      "arguments": {}
    }
  }'
```

**期待される動作**: ツールが見つからないというエラーが返される

## Vercel デプロイテスト

### 1. コミットとプッシュ

```bash
cd /Users/apple/Desktop/Dev_App/mcp-weather-vercel
git add docs/troubleshooting/
git add app/api/mcp/route.ts
git commit -m "fix: Use Zod schemas for MCP tool input validation"
git push origin main
```

### 2. Vercel デプロイメント確認

- Vercel ダッシュボードで自動デプロイが開始されることを確認
- ビルドログで TypeScript コンパイルが成功することを確認
- デプロイ完了後、本番環境で MCP API テストを実行

```bash
curl -X POST https://your-vercel-deployment-url/api/mcp \
  -H "Content-Type: application/json" \
  -d '{ /* MCP リクエスト */ }'
```

## トラブルシューティング

### ビルドが失敗する場合

1. **Zod インポートを確認**
   ```bash
   grep "import { z } from \"zod\"" app/api/mcp/route.ts
   ```
   出力がない場合、インポートを追加してください。

2. **スキーマ定義を確認**
   ```bash
   grep -A 5 "const geocodePlaceSchema" app/api/mcp/route.ts
   ```
   Zod スキーマが正しく定義されていることを確認。

3. **キャッシュをクリア**
   ```bash
   rm -rf .next
   npm run build
   ```

### ツール呼び出しエラーが発生する場合

1. **MCP サーバーが起動しているか確認**
   ```bash
   curl http://localhost:3000/api/mcp -X POST
   ```

2. **JSON RPC 形式を確認**
   リクエストが正しい JSON RPC 2.0 形式になっているか確認

3. **引数の型を確認**
   Zod スキーマで定義された型に合致する引数が渡されているか確認

## パフォーマンステスト

### レスポンス時間測定

```bash
time curl -X POST http://localhost:3000/api/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "geocode_place",
      "arguments": {"place": "Tokyo"}
    }
  }'
```

**期待される応答時間**: 1-3 秒（ジオコーディング API の遅延含む）

### 複数リクエストの負荷テスト

```bash
for i in {1..10}; do
  curl -X POST http://localhost:3000/api/mcp \
    -H "Content-Type: application/json" \
    -d "{
      \"jsonrpc\": \"2.0\",
      \"id\": $i,
      \"method\": \"tools/call\",
      \"params\": {
        \"name\": \"geocode_place\",
        \"arguments\": {\"place\": \"City$i\"}
      }
    }" &
done
wait
```

## チェックリスト

修正が完全に動作していることを確認するためのチェックリスト：

- [ ] `npm run build` が成功する
- [ ] TypeScript コンパイルエラーがない
- [ ] `npm run dev` でサーバーが起動する
- [ ] geocode_place ツールが実行可能
- [ ] get_forecast ツールが実行可能
- [ ] 無効な入力でバリデーションエラーが返される
- [ ] Vercel デプロイが成功する
- [ ] 本番環境で MCP API が動作する
