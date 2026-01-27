# 修正サマリー

## 概要

**プロジェクト**: mcp-weather-vercel  
**問題**: MCP スキーマバリデーションエラー  
**ステータス**: ✅ 解決済み  
**修正日**: 2026年1月27-28日

## 問題の構成

### 1. TypeScript 型エラー

**エラーメッセージ**:
```
Type error: Type 'string' is not assignable to type 'AnySchema'.
  262 |           type: "object",
```

**ファイル**: `app/api/mcp/route.ts` (行 262, 335)

### 2. ランタイムエラー

**エラーメッセージ**:
```
e.safeParseAsync is not a function
```

**原因**: `mcp-handler` が期待する Zod スキーマが提供されていなかった

## 実施した修正

### 修正 1: Zod インポートの追加

**ファイル**: `app/api/mcp/route.ts`  
**行**: 2

```typescript
import { z } from "zod";
```

### 修正 2: Zod スキーマの定義

**ファイル**: `app/api/mcp/route.ts`  
**行**: 238-252

```typescript
// Zod スキーマ定義
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

### 修正 3: inputSchema を JSON スキーマから Zod スキーマに変更

**ファイル**: `app/api/mcp/route.ts`  
**行**: 272（geocode_place）、327（get_forecast）

**変更前**:
```typescript
inputSchema: {
  type: "object",
  properties: { /* ... */ },
  required: ["place"],
} as any,
```

**変更後**:
```typescript
inputSchema: geocodePlaceSchema,
```

### 修正 4: content フィールドのリテラル型指定

**ファイル**: `app/api/mcp/route.ts`  
**行**: 310, 390

**変更前**:
```typescript
content: [{ type: "text", text: lines.join("\n") }],
```

**変更後**:
```typescript
content: [{ type: "text" as const, text: lines.join("\n") }],
```

## 結果

### ビルド結果

**修正前**:
```
Failed to compile.
./app/api/mcp/route.ts:262:11
Type error: Type 'string' is not assignable to type 'AnySchema'.
```

**修正後**:
```
✓ Compiled successfully in 1000.4ms
Running TypeScript ...
✓ Generating static pages using 11 workers (4/4) in 200.3ms
```

### パッケージ依存関係

Zod はすでに `package.json` の依存関係に含まれているため、追加インストール不要。

```json
{
  "dependencies": {
    "zod": "3.25.76"
  }
}
```

## ファイル変更一覧

| ファイル | 変更内容 | 行数 |
|---------|--------|------|
| `app/api/mcp/route.ts` | Zod インポート追加、スキーマ定義、inputSchema 修正 | +17 |
| `docs/troubleshooting/issue-schema-validation-error.md` | トラブルシューティング記事作成 | 新規 |
| `docs/troubleshooting/code-comparison.md` | コード修正前後の比較作成 | 新規 |
| `docs/troubleshooting/testing-guide.md` | テスト・検証ガイド作成 | 新規 |
| `docs/troubleshooting/summary.md` | このファイル | 新規 |

## 次のステップ

1. **ローカルテスト**
   - `npm run build` でビルド成功を確認
   - `npm run dev` で開発サーバーを起動
   - MCP API をテストして機能確認

2. **デプロイ**
   ```bash
   git add .
   git commit -m "fix: Use Zod schemas for MCP tool input validation"
   git push origin main
   ```

3. **本番検証**
   - Vercel デプロイが成功することを確認
   - 本番環境で MCP API テストを実行

## 技術的な洞察

### なぜ Zod が必要か

1. **ランタイムバリデーション**: 入力データが実行時に検証される
2. **型安全性**: TypeScript の型システムと統合
3. **エラー情報**: バリデーション失敗時に詳細なエラーメッセージ
4. **MCP 互換性**: `mcp-handler` が Zod をネイティブサポート

### Zod スキーマの構造

```typescript
const schema = z.object({
  fieldName: z.<type>()
    .min(1)           // 検証ルール
    .max(10)
    .default(5)       // デフォルト値
    .describe("説明") // フィールド説明
});
```

### スキーマの検証機能

Zod スキーマは以下のような検証を自動的に行う：

- **型チェック**: 値が期待された型か
- **範囲チェック**: min(), max() で数値範囲を制限
- **パターンマッチ**: regex() で文字列パターンを検証
- **カスタム検証**: refine() でカスタムルールを追加

## リファレンス

- [Zod Documentation](https://zod.dev/)
- [mcp-handler npm](https://www.npmjs.com/package/mcp-handler)
- [Model Context Protocol](https://modelcontextprotocol.io/)

## サポート

このドキュメントに記載されていない問題が発生した場合は、以下を確認してください：

1. `npm run build` でエラーメッセージを確認
2. `docs/troubleshooting/testing-guide.md` でテスト方法を参照
3. Zod と mcp-handler の最新バージョンを確認
