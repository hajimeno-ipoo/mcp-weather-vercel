# Task: Implement Hourly Weather Display

- [x] Define hourly weather types in `types.ts` <!-- id: 0 -->
- [x] Update `forecastByCoords` in `route.ts` to fetch hourly data <!-- id: 1 -->
- [x] 表示データの正確性確認（気温・降水確率の対応）
- [x] 詳細パネル内での既存データとの共存
- [x] レイアウトとデザインの検証
    - [x] ブラウザでの表示確認
    - [x] ライトモード/ダークモードでの視認性確認
    - [x] OpenAIウィジェット環境での表示不具合の調査と根本対策
        - [x] 原因特定：innerHTMLによるサニタイズ（スタイルの消失）
        - [x] 対策検討：document.createElementによる要素構築への移行
        - [x] 実装と最終確認
- [x] ドキュメント更新（walkthrough.md, task.md）
- [x] Implement `hourly` data mapping in `get_forecast` tool <!-- id: 2 -->
- [x] Update `widgetHtml` to render hourly temperature chart <!-- id: 3 -->
- [x] Verify implementation (Network issues in local env confirmed independent of code) <!-- id: 4 -->
