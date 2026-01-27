# ChatGPT MCP Apps セットアップガイド

**対象**: ChatGPT MCP Apps（Custom GPT または ChatGPT の MCP 機能）  
**目的**: ウィジェット表示とセキュリティ設定

---

## 📋 manifest.json とは？

`manifest.json` は、MCP アプリケーションの設定・メタデータを ChatGPT に告げるファイルです。

```
プロジェクトルート/
├── manifest.json          ← このファイル
├── app/
├── package.json
└── ...
```

**役割**：
- 📝 アプリケーション情報（名前、バージョン、説明）
- 🎨 ウィジェット設定（CSP、ドメイン、デザイン機能）
- 🛠️ ツール定義（Tool の名前、説明、パラメータ）
- 🔒 セキュリティ設定（Content Security Policy）

---

## 🔒 CSP とは？

**CSP** = Content Security Policy（コンテンツセキュリティポリシー）

ウィジェットで HTML + JavaScript を実行するときに、何を実行してよいかを制限するセキュリティ機能です。

```json
"csp": "default-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'"
```

**意味**：
- `default-src 'self'` : デフォルトは自分のドメインからのみ読み込み可
- `'unsafe-inline'` : インラインの HTML/CSS/JavaScript を実行許可
- `script-src 'self' 'unsafe-inline'` : スクリプトは自ドメイン + インライン実行許可

👉 **なぜ必要？** ChatGPT がウィジェット内で悪意のあるコードが実行されないか確認するため

---

## 🌐 widget_domain とは？

ウィジェットに一意のドメイン識別子を与えます。

```json
"widget_domain": "weather-widget"
```

これにより：
- ウィジェット間のクロスサイトアクセスを防止
- ウィジェット固有の localStorage/sessionStorage を確保
- セキュリティサンドボックスを作成

---

## 🚀 ChatGPT での設定方法

### **方法 1: Custom GPT での設定（推奨）**

1. **ChatGPT を開く**  
   https://chat.openai.com/

2. **Custom GPT を作成**  
   - 左メニュー → 「Create」
   - 「Create a new GPT」を選択

3. **Configure セクション**  
   ![](https://via.placeholder.com/400x200?text=Configure+Screen)
   
   - **Name**: "天気予報ウィジェット"
   - **Description**: "Open-Meteo天気予報API統合"

4. **Actions（新規追加）**  
   - 「Add actions」をクリック
   - **Schema URL**: `https://yourdomain.com/manifest.json`
   - または **JSON** 形式で直接 manifest.json の内容を貼り付け

5. **Authentication**  
   - 認証なし（`None`）を選択

6. **Save** をクリック

### **方法 2: API 側で manifest を公開**

`public/manifest.json` として静的ファイルとして配置：

```bash
public/
└── manifest.json     ← ChatGPT が読み込む
```

ChatGPT での設定時に：
```
https://mcp-weather-vercel.vercel.app/manifest.json
```

で参照可能

### **方法 3: GitHub リポジトリで設定**

manifest.json をリポジトリのルートに配置し、ChatGPT 連携時に参照

---

## ⚙️ 現在のプロジェクトでの設定値

### manifest.json の内容

```json
{
  "widgets": {
    "weather-widget": {
      "uri": "ui://widget/weather.html",
      "csp": "default-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'",
      "widget_domain": "weather-widget",
      "capabilities": {
        "interactive": true,
        "responsive": true,
        "dark_mode": true
      }
    }
  }
}
```

**意味**：
- `uri: "ui://widget/weather.html"` → ウィジェットの HTML ファイル（MCP が提供）
- `csp` → インライン CSS/JS 実行を許可
- `widget_domain` → 一意の識別子
- `capabilities` → インタラクティブ、レスポンシブ、ダークモード対応

---

## 📝 実装チェックリスト

### ローカル開発時

- [x] `manifest.json` を作成
- [x] `days` デフォルト値を 7 に設定
- [x] ウィジェット UI を改善（7日間横スクロール対応）
- [x] ビルド成功確認

### Vercel デプロイ時

- [ ] `public/manifest.json` に manifest をコピー
  ```bash
  cp manifest.json public/manifest.json
  ```

- [ ] `next.config.mjs` で manifest を public フォルダから提供
  ```javascript
  // next.config.mjs
  export default {
    // ... existing config
    publicRuntimeConfig: {
      manifestPath: '/manifest.json'
    }
  }
  ```

- [ ] Vercel にデプロイ
  ```bash
  git push origin main
  ```

### ChatGPT Custom GPT 設定

- [ ] ChatGPT Custom GPT を作成
- [ ] Actions で manifest URL を指定
  - ローカル: `http://localhost:3000/manifest.json`
  - Vercel: `https://yourdomain.vercel.app/manifest.json`
- [ ] 認証: 「None」を選択
- [ ] Save

---

## 🧪 動作確認

### ローカル環境

1. **開発サーバー起動**
   ```bash
   npm run dev
   ```

2. **manifest 確認**
   ```bash
   curl http://localhost:3000/manifest.json
   ```

3. **ChatGPT Custom GPT で設定**
   - Schema URL: `http://localhost:3000/manifest.json`
   - Test の Actions で動作確認

### 本番環境（Vercel）

1. **Vercel にデプロイ**
   ```bash
   git push origin main
   ```

2. **manifest 確認**
   ```bash
   curl https://yourdomain.vercel.app/manifest.json
   ```

3. **ChatGPT Custom GPT で設定**
   - Schema URL: `https://yourdomain.vercel.app/manifest.json`

---

## 🔧 よくある質問

**Q: CSP エラーが出る場合は？**  
A: manifest.json の `csp` 設定を確認：
```json
"csp": "default-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'"
```

**Q: ウィジェットが表示されない場合は？**  
A: 以下を確認：
1. `widget_domain` が指定されているか
2. `uri` が `ui://widget/weather.html` か
3. `capabilities.interactive` が `true` か

**Q: データが更新されない場合は？**  
A: manifest.json の `days` デフォルト値（7）が正しく反映されているか確認

---

## 📚 参考資料

- [OpenAI API 公式ドキュメント](https://platform.openai.com/docs/)
- [CSP リファレンス](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
- [Custom GPT ガイド](https://help.openai.com/en/articles/8554397-creating-and-editing-custom-gpts)

---

## 🚀 次のステップ

1. **Vercel にデプロイ**
   ```bash
   git add manifest.json
   git commit -m "feat: Add manifest.json for ChatGPT MCP Apps"
   git push origin main
   ```

2. **ChatGPT Custom GPT を作成**  
   ガイドの「方法 1」に従って設定

3. **動作確認**  
   ChatGPT で「東京の天気」と聞いて、7日間の予報が表示されることを確認

---

**作成日**: 2026年1月28日  
**バージョン**: 1.0
