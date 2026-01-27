# Zod スキーマ実装リファレンス

## 現在の実装例

### geocode_place ツール

```typescript
// スキーマ定義
const geocodePlaceSchema = z.object({
  place: z.string().describe("場所名（例: 中央区 / Shibuya / Tokyo）"),
  count: z.number().int().min(1).max(10).default(5),
  days: z.number().int().min(1).max(7).default(3),
});

// ツール登録
server.registerTool(
  "geocode_place",
  {
    title: "候補地検索（ジオコード）",
    description: "場所名から候補地（緯度経度）を複数返します。",
    inputSchema: geocodePlaceSchema,
    _meta: {
      "openai/outputTemplate": "ui://widget/weather.html",
      "openai/widgetAccessible": true,
      "openai/toolInvocation/invoking": "候補地を検索中…",
      "openai/toolInvocation/invoked": "候補を表示しました",
    },
  },
  async (input: any) => {
    // バリデーション済みの input を使用
    const place = String(input.place ?? "").trim();
    const count = Math.max(1, Math.min(10, Number(input.count ?? 5)));
    const days = Math.max(1, Math.min(7, Number(input.days ?? 3)));

    if (!place) throw new Error("place を指定してください");

    const candidates = await geocodeCandidates(place, count);

    const structuredContent = {
      kind: "geocode",
      query: place,
      days,
      candidates,
    };

    const lines: string[] = [];
    lines.push(`検索: ${place}`);
    if (!candidates.length) {
      lines.push("候補が見つかりませんでした。");
    } else {
      lines.push("候補:");
      candidates.forEach((c, i) => {
        const label = `${c.name}${c.admin1 ? "（" + c.admin1 + "）" : ""}${c.country ? " / " + c.country : ""}`;
        lines.push(`${i + 1}. ${label} (${c.latitude}, ${c.longitude})`);
      });
    }

    return {
      structuredContent,
      content: [{ type: "text" as const, text: lines.join("\n") }],
    };
  }
);
```

### get_forecast ツール

```typescript
// スキーマ定義
const getForecastSchema = z.object({
  latitude: z.number().describe("緯度"),
  longitude: z.number().describe("経度"),
  days: z.number().int().min(1).max(7).default(3),
  timezone: z.string().default("Asia/Tokyo"),
  label: z.string().optional().describe("表示用ラベル（任意）"),
});

// ツール登録
server.registerTool(
  "get_forecast",
  {
    title: "天気取得（緯度経度）",
    description: "緯度経度から現在天気と数日予報を返します。",
    inputSchema: getForecastSchema,
    _meta: {
      "openai/outputTemplate": "ui://widget/weather.html",
      "openai/widgetAccessible": true,
      "openai/toolInvocation/invoking": "天気を取得中…",
      "openai/toolInvocation/invoked": "天気を更新しました",
    },
  },
  async (input: any) => {
    const latitude = Number(input.latitude);
    const longitude = Number(input.longitude);
    const days = Math.max(1, Math.min(7, Number(input.days ?? 3)));
    const timezone = String(input.timezone ?? "Asia/Tokyo");
    const label = (input.label ? String(input.label) : undefined);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new Error("latitude / longitude が不正です");
    }

    const f = await forecastByCoords(latitude, longitude, days, timezone);
    const current = f.current_weather ?? null;

    // ... レスポンス構築
    return {
      structuredContent,
      content: [{ type: "text" as const, text: lines.join("\n") }],
    };
  }
);
```

## Zod スキーマ - 利用可能な検証オプション

### 基本型

```typescript
const schema = z.object({
  // 文字列
  name: z.string(),
  description: z.string().min(10),
  email: z.string().email(),
  url: z.string().url(),
  
  // 数値
  age: z.number(),
  count: z.number().int(),
  price: z.number().positive(),
  
  // ブール値
  active: z.boolean(),
  
  // 配列
  tags: z.array(z.string()),
  
  // オプション（null/undefined 許可）
  middleName: z.string().optional(),
});
```

### 高度な検証

```typescript
const schema = z.object({
  // 範囲制限
  count: z.number().int().min(1).max(100),
  
  // 長さ制限
  password: z.string().min(8).max(32),
  
  // パターンマッチ
  zipCode: z.string().regex(/^\d{5}$/),
  
  // デフォルト値
  language: z.string().default("ja"),
  
  // Union（複数の型を許可）
  id: z.union([z.string(), z.number()]),
  
  // Enum
  status: z.enum(["active", "inactive", "pending"]),
  
  // オブジェクト
  address: z.object({
    street: z.string(),
    city: z.string(),
    zipCode: z.string(),
  }),
  
  // カスタムバリデーション
  value: z.number().refine(
    (val) => val > 0,
    { message: "値は 0 より大きい必要があります" }
  ),
});
```

## 実装パターン

### パターン 1: シンプルなパラメータ

```typescript
const simpleSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().min(1).max(100).default(10),
});
```

### パターン 2: オプショナルパラメータ

```typescript
const optionalSchema = z.object({
  required_param: z.string(),
  optional_param: z.string().optional(),
  param_with_default: z.string().default("default value"),
});
```

### パターン 3: ネストされたオブジェクト

```typescript
const nestedSchema = z.object({
  name: z.string(),
  location: z.object({
    latitude: z.number(),
    longitude: z.number(),
    timezone: z.string(),
  }),
});
```

### パターン 4: Union 型（複数の型を許可）

```typescript
const unionSchema = z.object({
  id: z.union([
    z.string().uuid(),
    z.number().int().positive(),
  ]),
});
```

### パターン 5: 配列パラメータ

```typescript
const arraySchema = z.object({
  tags: z.array(z.string()).min(1),
  coordinates: z.array(z.number()).length(2), // 正確に 2 つの要素
});
```

## バリデーションエラーのハンドリング

### スキーマの事前検証

```typescript
const schema = z.object({
  place: z.string().min(1, "場所名を入力してください"),
  count: z.number().int().min(1, "最小値は 1 です").max(10, "最大値は 10 です"),
});

// 使用
try {
  const validated = schema.parse(input);
  console.log("検証成功:", validated);
} catch (error) {
  if (error instanceof z.ZodError) {
    console.log("検証エラー:", error.errors);
  }
}
```

### 非同期バリデーション

```typescript
const asyncSchema = z.object({
  place: z.string()
    .min(1)
    .refine(async (val) => {
      const response = await fetch(`/api/validate-place?name=${val}`);
      return response.ok;
    }, "この場所は有効ではありません"),
});
```

## MCP ハンドラーとの統合

### スキーマ定義のベストプラクティス

1. **入力スキーマは必ず Zod オブジェクト**
   ```typescript
   inputSchema: z.object({ /* ... */ })  // ✅ 正しい
   inputSchema: { type: "object", ... }  // ❌ 間違い
   ```

2. **フィールドに説明を追加**
   ```typescript
   z.string().describe("このフィールドの説明")
   ```

3. **デフォルト値を指定**
   ```typescript
   z.number().default(10)
   ```

4. **型安全性を保つ**
   ```typescript
   // ハンドラーで型を推論
   async (input: z.infer<typeof geocodePlaceSchema>) => {
     // input の型が自動的に推論される
   }
   ```

## トラブルシューティング

### "safeParseAsync is not a function" エラー

**原因**: JSON スキーマ形式が使用されている

**解決**:
```typescript
// ❌ 間違い
inputSchema: {
  type: "object",
  properties: { /* ... */ },
}

// ✅ 正しい
inputSchema: z.object({
  // ...
})
```

### スキーマ検証エラー

**原因**: Zod スキーマの定義エラー

**デバッグ方法**:
```typescript
// コンソールで検証テスト
const result = schema.safeParse(testInput);
if (!result.success) {
  console.log("エラー:", result.error.errors);
}
```

## 参考リンク

- [Zod - TypeScript-first schema validation](https://zod.dev/)
- [Zod API Reference](https://zod.dev/?id=basic-usage)
- [Zod Error Handling](https://zod.dev/?id=error-handling)
