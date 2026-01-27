# トラブルシューティング：MCP スキーマバリデーションエラー

**日時**: 2026年1月27-28日  
**ステータス**: ✅ 解決済み

## 問題の説明

MCP（Model Context Protocol）ツールの登録時に2つのエラーが発生していました。

### エラー 1: TypeScript 型エラー
```
Type error: Type 'string' is not assignable to type 'AnySchema'.
  type: "object"
```

**発生箇所**: `app/api/mcp/route.ts:262`

**原因**: `inputSchema` フィールドに JSON スキーマ形式の文字列リテラルを使用していたが、MCP ハンドラーが期待していた型と一致していなかった。

### エラー 2: ランタイムエラー
```
e.safeParseAsync is not a function
```

**原因**: `mcp-handler` 内部で Zod スキーマを期待していたが、プレーンな JSON スキーマオブジェクトが渡されていた。

## 根本原因

`mcp-handler@1.0.7` は入力スキーマとして **Zod スキーマ** を期待しています。JSON スキーマの文字列形式やプレーンオブジェクトではなく、Zod で定義されたバリデーションスキーマが必須です。

## 解決方法

### ステップ 1: Zod をインポート
```typescript
import { z } from "zod";
```

### ステップ 2: Zod スキーマを定義
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

### ステップ 3: ツール登録で Zod スキーマを使用
```typescript
server.registerTool(
  "geocode_place",
  {
    title: "候補地検索（ジオコード）",
    description: "場所名から候補地（緯度経度）を複数返します。",
    inputSchema: geocodePlaceSchema,  // Zod スキーマを直接使用
    _meta: { /* ... */ },
  },
  async (input: any) => {
    // ハンドラー実装
  }
);
```

### ステップ 4: content フィールドのリテラル型指定
TypeScript の型推論を助けるため、`content` フィールドで型リテラルを明示的に指定：
```typescript
return {
  structuredContent,
  content: [{ type: "text" as const, text: lines.join("\n") }],
};
```

## 修正後の結果

✅ TypeScript コンパイルエラー解決  
✅ `e.safeParseAsync is not a function` エラー解決  
✅ ビルド成功: `Next.js 16.1.5 (Turbopack)` でコンパイル成功  
✅ 全ページ生成完了

```
Generating static pages using 11 workers (4/4) in 200.3ms
Route (app)
├ ○ /
├ ○ /_not-found
└ ƒ /api/mcp
```

## 技術的背景

### Zod スキーマの利点
1. **ランタイムバリデーション**: 入力データが期待された型/形式に合致することを実行時に検証
2. **型推論**: TypeScript が自動的に入力型を推論可能
3. **エラーメッセージ**: バリデーション失敗時に詳細なエラーメッセージを提供
4. **MCP 互換性**: `mcp-handler` が Zod をネイティブサポート

### mcp-handler が Zod を期待する理由
- MCP SDK は Zod を依存関係として含む
- スキーマの自動バリデーションと型安全性を提供
- JSON スキーマとは異なり、ランタイムバリデーション能力を持つ

## チェックリスト

- [x] Zod インポートを追加
- [x] ツールごとに Zod スキーマを定義
- [x] inputSchema を JSON スキーマからから Zod スキーマに変更
- [x] content フィールドのリテラル型を指定
- [x] TypeScript コンパイル成功確認
- [x] ビルド成功確認
- [x] デプロイ準備完了

## 関連ファイル

- `app/api/mcp/route.ts` - MCP ハンドラー実装（修正済み）
- `package.json` - Zod は既に依存関係に含まれている

## 参考リンク

- [Zod Documentation](https://zod.dev/)
- [mcp-handler on npm](https://www.npmjs.com/package/mcp-handler)
- [Model Context Protocol](https://modelcontextprotocol.io/)
