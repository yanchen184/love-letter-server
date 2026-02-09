# Memory Battle 遊戲模組

記憶翻牌對戰遊戲

## 測試

### 運行單元測試

```bash
cd games/memory-battle
node test.js
```

### 測試覆蓋

- ✅ 遊戲初始化
- ✅ 玩家管理（添加/移除）
- ✅ 遊戲開始（不同棋盤大小）
- ✅ 卡片配對驗證
- ✅ 翻牌邏輯
- ✅ 配對檢查（成功/失敗）
- ✅ **getPublicState() 數據完整性**（關鍵）
- ✅ 回合切換
- ✅ 遊戲結束

### 關鍵測試

最重要的兩個測試：

1. **`getPublicState returns symbols for all cards`**
   - 確保所有卡片都有 symbol 和 symbolId
   - **即使卡片還沒翻開**

2. **`getPublicState cards match internal cards`**
   - 確保公開狀態與內部狀態一致

## 部署前檢查清單

- [ ] 運行所有測試：`node test.js`
- [ ] 測試本地雙人模式
- [ ] 測試 AI 對戰模式
- [ ] **測試線上多人模式**（最重要）
- [ ] 檢查 Railway 日誌

## Bug 修復記錄

### 2026-02-09: 線上模式卡片不顯示

**問題：** getPublicState() 只在卡片翻開時發送 symbol

**原因：** 代碼寫成：
```javascript
symbol: (c.isFlipped || c.isMatched) ? c.symbol : null
```

**修復：** 總是發送 symbol
```javascript
symbol: c.symbol
```

**教訓：** 
- 必須寫測試
- 必須測試所有模式
- 不能只測試一個模式就認為完成
