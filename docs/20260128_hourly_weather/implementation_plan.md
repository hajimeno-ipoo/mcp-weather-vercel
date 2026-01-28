# 1時間毎の天気表示の実装計画

## 1. 目的
ユーザーがより詳細な天気予報を確認できるように、1時間ごとの天気変化（天気アイコン、気温、降水確率）を可視化する機能を導入する。
日別カードをクリックした際の詳細パネルに、単なる気温グラフではなく、参考画像のような**時間ごとの天気予報リスト（アイコン・気温・降水確率）**を表示する。

## 2. 変更内容

### 2.1. 型定義の更新 (`app/api/mcp/types.ts`)
`OpenMeteoForecastResponse` および `ForecastResult` 型に `hourly` フィールドを追加する。
- `hourly.time`: 時間配列
- `hourly.temperature_2m`: 気温配列
- `hourly.precipitation_probability`: 降水確率配列
- `hourly.weathercode`: 天気コード配列

### 2.2. APIロジックの更新 (`app/api/mcp/route.ts`)
- `forecastByCoords` 関数で Open-Meteo API を呼び出す際、`hourly` パラメータを追加する。
  - パラメータ: `temperature_2m,weathercode,precipitation_probability`
- 取得した `hourly` データを日別にグループ化し、フロントエンドに渡す構造を整備する。

### 2.3. UIウィジェットの更新 (`app/api/mcp/route.ts`)
`widgetHtml` 内の JavaScript と CSS を更新し、詳細パネルの表示を刷新する。

#### デザイン方針 (参考画像準拠)
詳細パネルに以下の要素を配置する：

1.  **既存の詳細データ（維持）**
    - 日付と曜日
    - 最高/最低気温
    - 降水確率、降水量
    - 最大風速
    - ※これらを上段に表示し、その下に新しい時間別予報を追加する。

2.  **【新規】1時間ごとの天気予報リスト** (横スクロール)
    - **横スクロールで24時間分すべての「時刻・天気アイコン・気温・降水確率」を表示する。**

3.  **表示要素（時間別）**:
    - 時刻 (例: "14:00")
    - 天気アイコン (☀️, ☁️, ☔ など)
    - 気温 (℃)
    - 降水確率 (%)

#### 実装イメージ
```html
<div class="hourly-container">
  <div class="hourly-item">
    <div class="time">09:00</div>
    <div class="icon">☀️</div>
    <div class="temp">15°</div>
    <div class="prob">0%</div>
  </div>
  <!-- ... -->
</div>
```
CSSで横スクロール (`overflow-x: auto`) を適用し、スムーズに閲覧できるようにする。

## 3. 検証計画

### 3.1. 自動テスト
- テストスクリプト `scripts/test-hourly.mjs` を作成し、`get_forecast` ツールを呼び出す。
- レスポンスのJSON構造に `hourly` データが正しく含まれているか、配列長が24（または予測日数分）であることを確認する。

### 3.2. 手動検証
- ChatGPT (Developer Mode) または `inspect-mcp` ツール等でサーバーに接続し、`geocdoe_place` -> `get_forecast` のフローを実行。
- レンダリングされたHTMLウィジェットで、各日付をクリックして時間別グラフが表示されることを確認する。

## 4. リスク
- **レスポンスサイズ**: データ量が増えるため、VercelのFunction Payload制限（4.5MB）に注意が必要だが、テキストデータなので問題ない範囲と想定。
- **APIレートリミット**: Open-Meteoの制限内であることを確認（商用利用でない限り問題なし）。
