# コード修正比較

## 修正前（エラー状態）

### ❌ インポート部分
```typescript
import { createMcpHandler } from "mcp-handler";

// Zod がインポートされていない
```

### ❌ ツール登録 - geocode_place
```typescript
server.registerTool(
  "geocode_place",
  {
    title: "候補地検索（ジオコード）",
    description: "場所名から候補地（緯度経度）を複数返します。",
    inputSchema: {
      type: "object",  // ❌ JSON スキーマ形式
      properties: {
        place: { type: "string", description: "場所名（例: 中央区 / Shibuya / Tokyo）" },
        count: { type: "integer", minimum: 1, maximum: 10, default: 5 },
        days: { type: "integer", minimum: 1, maximum: 7, default: 3 }
      },
      required: ["place"],
    } as any,  // ❌ 型安全性がない
    // ...
  },
  async (input: any) => {
    // ...
  }
);
```

### ❌ content フィールド
```typescript
return {
  structuredContent,
  content: [{ type: "text", text: lines.join("\n") }],  // ❌ 型推論が弱い
};
```

---

## 修正後（解決済み）

### ✅ インポート部分
```typescript
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";  // ✅ Zod をインポート
```

### ✅ Zod スキーマ定義
```typescript
const geocodePlaceSchema = z.object({
  place: z.string().describe("場所名（例: 中央区 / Shibuya / Tokyo）"),
  count: z.number().int().min(1).max(10).default(5),
  days: z.number().int().min(1).max(7).default(3),
});

const getForecastSchema = z.object({
  latitude: z.number().describe("緯度"),
  longitude: z.number().describe("経度"),
  days: z.number().int().min(1).max(7).default(3),
  timezone: z.string().default("Asia/Tokyo"),
  label: z.string().optional().describe("表示用ラベル（任意）"),
});
```

### ✅ ツール登録 - geocode_place
```typescript
server.registerTool(
  "geocode_place",
  {
    title: "候補地検索（ジオコード）",
    description: "場所名から候補地（緯度経度）を複数返します。",
    inputSchema: geocodePlaceSchema,  // ✅ Zod スキーマを使用
    _meta: {
      "openai/outputTemplate": "ui://widget/weather.html",
      "openai/widgetAccessible": true,
      "openai/toolInvocation/invoking": "候補地を検索中…",
      "openai/toolInvocation/invoked": "候補を表示しました",
    },
  },
  async (input: any) => {
    // ...
  }
);
```

### ✅ ツール登録 - get_forecast
```typescript
server.registerTool(
  "get_forecast",
  {
    title: "天気取得（緯度経度）",
    description: "緯度経度から現在天気と数日予報を返します。",
    inputSchema: getForecastSchema,  // ✅ Zod スキーマを使用
    _meta: {
      "openai/outputTemplate": "ui://widget/weather.html",
      "openai/widgetAccessible": true,
      "openai/toolInvocation/invoking": "天気を取得中…",
      "openai/toolInvocation/invoked": "天気を更新しました",
    },
  },
  async (input: any) => {
    // ...
  }
);
```

### ✅ content フィールド
```typescript
return {
  structuredContent,
  content: [{ type: "text" as const, text: lines.join("\n") }],  // ✅ リテラル型を明示指定
};
```

---

## 変更行数サマリー

| 変更内容 | 行数 |
|---------|------|
| Zod インポート追加 | +1 |
| Zod スキーマ定義 | +15 |
| inputSchema を JSON スキーマから Zod スキーマに変更 | -15, +2 |
| content 型指定追加 | +2 |
| **合計差分** | **+5 行（ネット）** |

## ビルド結果

### 修正前
```
Failed to compile.
./app/api/mcp/route.ts:262:11
Type error: Type 'string' is not assignable to type 'AnySchema'.
```

### 修正後
```
✓ Compiled successfully in 1000.4ms
Running TypeScript ...
✓ Generating static pages using 11 workers (4/4) in 200.3ms

Route (app)
├ ○ /
├ ○ /_not-found
└ ƒ /api/mcp
```
