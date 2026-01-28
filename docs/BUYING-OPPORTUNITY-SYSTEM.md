# Buying Opportunity Detection System (搶貨機會偵測系統)

> 此文檔記錄了整個 Walmart 3P 套利業務的庫存偵測與搶貨機會系統。用於在新的對話中重建或遷移此系統到 Web App。

---

## 1. 業務模型概述

### 1.1 業務背景
- **角色**: Walmart 3P (Third-Party) 賣家
- **商業模式**: 從 Walmart.com 購買產品，透過 Shipper (位於 ZIP 77057, Houston) 發貨給客戶
- **核心策略**: 當 Walmart 在其他地區開始缺貨時，提前囤貨，等全面缺貨時客戶會轉向 3P 賣家購買

### 1.2 套利邏輯
```
其他地區 OOS → 我們的 Shipper 地區有貨 → 提前購買囤貨 → 等待全面缺貨 → 客戶轉向我們購買 → 獲利
```

**關鍵洞察**: Walmart 的庫存是區域性的，不同 ZIP Code 的庫存狀態可能不同。當多個主要城市開始缺貨，但 Shipper 所在地區仍有貨時，就是搶貨的最佳時機。

---

## 2. 核心偵測模型

### 2.1 Multi-ZIP Detection Model (多區域偵測模型)

**監測的 7 個 ZIP Codes:**
| ZIP Code | 城市 | 角色 |
|----------|------|------|
| 77057 | Houston | **Shipper 所在地** (購買來源) |
| 90210 | Los Angeles | 監測區域 |
| 10001 | New York | 監測區域 |
| 60601 | Chicago | 監測區域 |
| 85001 | Phoenix | 監測區域 |
| 30301 | Atlanta | 監測區域 |
| 98101 | Seattle | 監測區域 |

### 2.2 庫存狀態分類 (Availability Score)

透過 ScrapingBee API 獲取 Walmart 產品頁面，解析以下狀態：

| 狀態 | 判斷條件 | 預估數量 |
|------|----------|----------|
| **OOS** (Out of Stock) | `out_of_stock=true` 或 無 delivery/shipping 或 第三方賣家 | 0 |
| **CRITICAL** | delivery_information 包含 "only X left" 且 X ≤ 5 | 1-5 |
| **LOW** | delivery_information 包含 "only X left" 且 X > 5，或 "low stock" | 6-15 |
| **IN_STOCK** | 有 delivery 或 shipping，無低庫存提示 | 50+ |

### 2.3 Urgency 評分邏輯

基於 6 個監測區域 (排除 Shipper 區域) 的狀態計算：

| Urgency | 條件 | 建議購買量 | 行動 |
|---------|------|------------|------|
| **HIGH** | 4+ 區域 OOS | min(Shipper庫存, 20) | 立即購買 |
| **MEDIUM** | 2+ 區域 OOS，或 1 OOS + 2 Low Stock | min(Shipper庫存, 10) | 儘快購買 |
| **LOW** | 2+ 區域顯示 scarcity (OOS 或 Low Stock) | min(Shipper庫存, 5) | 考慮購買 |
| **NONE** | 不符合以上條件 | 0 | 不行動 |

**前提條件**: Shipper 區域 (77057) 必須有貨且非 CRITICAL 狀態，否則無法購買。

---

## 3. 數據架構

### 3.1 Airtable 結構

**Base ID**: `appRCQASsApV4C33N`

#### Product Table (`tblo1uuy8Nc9CSjX4`)
主產品表，存儲所有監測的產品：

| 欄位名 | 類型 | 說明 |
|--------|------|------|
| SKU | Text | 產品 SKU |
| WM Product ID | Text | Walmart 產品 ID (用於 API 查詢) |
| Title | Text | 產品標題 |
| Status | Select | Active / Inactive |
| WM Inventory | Number | Walmart 庫存數量 |
| Scrape Low Stock Message | Text | 抓取到的低庫存訊息 |
| 7-Day Sales | Number | 過去 7 天銷量 |
| Walmart Listing URL | URL | 產品頁面連結 |

#### Buying Opportunities Table (`tbldotf29PlnIboA0`)
搶貨機會表，存儲偵測到的機會：

| 欄位名 | 類型 | 說明 |
|--------|------|------|
| SKU | Text | 產品 SKU |
| Product Title | Text | 產品標題 |
| Store | Select | 來源店鋪 (Walmart) |
| Urgency | Select | HIGH / MEDIUM / LOW |
| Recommended Qty | Number | 建議購買數量 |
| Shipper ZIP Status | Text | Shipper 區域庫存狀態 |
| Shipper Est Qty | Number | Shipper 區域預估庫存 |
| OOS Regions | Text | OOS 的區域列表 |
| Low Stock Regions | Text | 低庫存的區域列表 |
| Total Regions | Number | 總監測區域數 |
| Region Details | Long Text (JSON) | 各區域詳細狀態 |
| Reason | Text | 觸發原因說明 |
| Status | Select | Active / Actioned / Skipped |
| Actioned By | Text | 處理人員 |
| Actioned At | DateTime | 處理時間 |
| Qty Purchased | Number | 實際購買數量 |
| WM Product ID | Text | Walmart 產品 ID |
| Walmart Link | URL | 購買連結 |
| Last Check | DateTime | 最後檢查時間 |
| Notes | Long Text | 備註 |

### 3.2 n8n Variables
| 變數名 | 用途 |
|--------|------|
| `AIRTABLE_TOKEN` | Airtable API Token |

### 3.3 外部 API
| 服務 | 用途 | API Key 位置 |
|------|------|--------------|
| ScrapingBee | Walmart 產品頁面抓取 | 硬編碼在 Code node |

---

## 4. n8n Workflows

### 4.1 WM19 - Inventory Monitor - OOS Detection & Pause
**Workflow ID**: `WK2ov0LEOmDIofbf`
**狀態**: Active, 運作中
**節點數**: 80+

**功能**:
- 定時監測產品庫存狀態
- 偵測 OOS 產品並暫停 listing
- 偵測 Low Stock 並減少庫存
- 記錄歷史數據
- 發送 Slack 通知

**觸發方式**:
- Schedule Trigger (定時)
- Webhook Trigger (手動測試)

**關鍵節點**:
- `Search records`: 從 Airtable 獲取產品
- `Scrape WITHOUT HTML` / `Scrape WITH HTML`: ScrapingBee 抓取
- `Filter OOS Products`: 篩選 OOS 產品
- `Batch Update Airtable (Fast)`: 批量更新 Airtable

### 4.2 WM20 - Buying Opportunity Scanner
**Workflow ID**: `8Rome1SCVFZPxV1S`
**狀態**: Active
**節點數**: 12

**功能**:
- 多區域庫存掃描 (7 ZIP codes)
- 計算 Urgency 評分
- 寫入 Buying Opportunities table
- 24 小時 cooldown 防止重複檢查

**觸發方式**:
- Schedule Trigger (每 6 小時)
- Webhook Trigger (可被 WM19 調用)

**關鍵節點**:
1. **Webhook Trigger** / **Schedule Trigger**: 觸發入口
2. **Get Candidates from Airtable**: 獲取候選產品
   - Filter: `AND({Status}='Active', OR({Scrape Low Stock Message}!='', {WM Inventory}<21))`
3. **Check Cooldown (24hr)**: 檢查是否在 24 小時內已掃描過
4. **Multi-ZIP Scrape**: 掃描 7 個區域的庫存狀態
5. **Calculate Buying Score**: 計算 Urgency 評分
6. **Upsert to Buying Opportunities**: 寫入/更新 Airtable

**Code 節點詳細邏輯**:

```javascript
// Check Cooldown (24hr) - 核心邏輯
const COOLDOWN_HOURS = 24;
// 檢查 Buying Opportunities table 中該 SKU 的 Last Check 時間
// 如果在 24 小時內，則跳過

// Multi-ZIP Scrape - 核心邏輯
const ZIP_CODES = [
  { zip: '77057', city: 'Houston', isShipper: true },
  { zip: '90210', city: 'Los Angeles', isShipper: false },
  // ... 其他區域
];
// 使用 ScrapingBee API 逐個掃描
// 解析 fulfillment.delivery, fulfillment.shipping, out_of_stock 等欄位

// Calculate Buying Score - 核心邏輯
// 統計 OOS 和 Low Stock 區域數量
// 根據閾值判斷 Urgency
// 計算建議購買數量
```

---

## 5. Web App 組件

### 5.1 Dashboard (Next.js + Tailwind)
**專案路徑**: `/Users/homanyeung/Projects/product-margin-tool`

#### 頁面結構:
```
/                           # 首頁 - 工具選擇
/profit-scout               # Profit Scout 計算器
/repricing                  # 重新定價計算器
/buying-opportunities       # 搶貨機會 Dashboard
```

#### Buying Opportunities Dashboard
**路徑**: `/src/app/buying-opportunities/page.tsx`
**組件**: `/src/components/BuyingOpportunities.tsx`

**功能**:
- 顯示所有 Active 的搶貨機會
- 按 Urgency 篩選 (HIGH / MEDIUM / LOW)
- 顯示各區域狀態詳情
- 操作按鈕: Buy (跳轉 Walmart) / Done (標記已處理) / Skip (跳過)

**API Endpoint**: `/src/app/api/buying-opportunities/route.ts`
- `GET`: 獲取機會列表
- `PATCH`: 更新機會狀態

---

## 6. 已知問題與限制

### 6.1 已解決的問題
| 問題 | 解決方案 |
|------|----------|
| `$env.AIRTABLE_API_KEY` 不存在 | 改用 `$vars.AIRTABLE_TOKEN` |
| Airtable credential 權限不足 | 改用 `E4M8VLDBsppYD3gv` (ALL account 4) |
| Webhook 404 not registered | n8n cloud 需要在 UI 中手動執行一次註冊 |
| Merge node mode 錯誤 | 移除 Merge node，直接連接 trigger 到下一節點 |

### 6.2 當前限制
1. **ScrapingBee API 成本**: 每次 Multi-ZIP 掃描需要 7 個 API 請求
2. **24 小時 Cooldown**: 同一 SKU 每 24 小時只掃描一次
3. **候選產品篩選**: 只掃描已有 Low Stock Message 或 WM Inventory < 21 的產品
4. **手動操作**: 實際購買仍需人工在 Walmart 網站完成

### 6.3 潛在改進
1. 減少 ScrapingBee 成本：只在特定條件下觸發 Multi-ZIP 掃描
2. 自動化購買流程
3. 歷史數據分析：預測哪些產品容易缺貨
4. 更精細的區域選擇：根據銷售數據選擇監測區域

---

## 7. 系統架構圖

```
┌─────────────────────────────────────────────────────────────────┐
│                        TRIGGER SOURCES                           │
├─────────────────────────────────────────────────────────────────┤
│  Schedule (6hr)  │  Webhook  │  WM19 Low Stock Detection        │
└────────┬─────────┴─────┬─────┴──────────────┬────────────────────┘
         │               │                     │
         ▼               ▼                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                    WM20 - Buying Opportunity Scanner             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────┐    ┌──────────────────┐                   │
│  │ Get Candidates   │───▶│ Check Cooldown   │                   │
│  │ from Airtable    │    │ (24hr)           │                   │
│  └──────────────────┘    └────────┬─────────┘                   │
│                                   │                              │
│                                   ▼                              │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                  Multi-ZIP Scrape                         │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐         │   │
│  │  │ 77057   │ │ 90210   │ │ 10001   │ │ 60601   │  ...    │   │
│  │  │ Houston │ │ LA      │ │ NYC     │ │ Chicago │         │   │
│  │  │ SHIPPER │ │         │ │         │ │         │         │   │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘         │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                   │                              │
│                                   ▼                              │
│  ┌──────────────────┐    ┌──────────────────┐                   │
│  │ Calculate        │───▶│ Upsert to        │                   │
│  │ Buying Score     │    │ Airtable         │                   │
│  └──────────────────┘    └──────────────────┘                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                  Airtable - Buying Opportunities                 │
├─────────────────────────────────────────────────────────────────┤
│  SKU  │ Urgency │ Recommended Qty │ OOS Regions │ Status        │
│  ...  │ HIGH    │ 15              │ LA, NYC, CHI│ Active        │
└─────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Web Dashboard (Next.js)                       │
├─────────────────────────────────────────────────────────────────┤
│  ┌────────────┐  ┌────────────┐  ┌────────────┐                 │
│  │   HIGH     │  │  MEDIUM    │  │    LOW     │                 │
│  │   Badge    │  │   Badge    │  │   Badge    │                 │
│  └────────────┘  └────────────┘  └────────────┘                 │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Product: XYZ Widget                                       │   │
│  │ Urgency: HIGH - 4 regions OOS                            │   │
│  │ Recommended: 15 units                                     │   │
│  │ [Buy] [Done] [Skip]                                       │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 8. 遷移到 Web App 的考慮

### 8.1 可以保留在 n8n 的部分
- 定時觸發 (Schedule Trigger)
- 複雜的錯誤處理和重試邏輯
- 與現有系統的集成 (Slack 通知等)

### 8.2 建議遷移到 Web App 的部分
- **Multi-ZIP Scraping 邏輯**: 更容易測試和維護
- **Urgency 計算邏輯**: 可以更靈活地調整閾值
- **Dashboard 和 UI**: 已經在 Next.js 中
- **API Endpoints**: 統一在一個代碼庫中管理

### 8.3 遷移架構建議
```
┌─────────────────────────────────────────────────────────────────┐
│                    Next.js Web App (Vercel)                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  /api/cron/scan-opportunities    ← Vercel Cron (每 6 小時)       │
│  /api/buying-opportunities       ← Dashboard API                 │
│  /api/scrape/multi-zip           ← ScrapingBee 調用              │
│                                                                  │
│  /lib/models/urgency-calculator  ← 核心計算邏輯                   │
│  /lib/services/airtable          ← Airtable 操作                 │
│  /lib/services/scrapingbee       ← ScrapingBee 封裝              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 9. 檔案清單

### n8n Workflows
- `WM19 - Inventory Monitor - OOS Detection & Pause` (WK2ov0LEOmDIofbf)
- `WM20 - Buying Opportunity Scanner` (8Rome1SCVFZPxV1S)

### Web App 檔案
- `/src/app/buying-opportunities/page.tsx`
- `/src/components/BuyingOpportunities.tsx`
- `/src/app/api/buying-opportunities/route.ts`
- `/src/app/page.tsx` (包含 Buying Opportunities 入口)

### 本文檔
- `/docs/BUYING-OPPORTUNITY-SYSTEM.md`

---

## 10. 下一步行動

在新的對話中，可以：

1. **閱讀此文檔**: `Read /Users/homanyeung/Projects/product-margin-tool/docs/BUYING-OPPORTUNITY-SYSTEM.md`

2. **討論遷移策略**: 決定哪些部分保留在 n8n，哪些遷移到 Web App

3. **實施遷移**:
   - 在 Next.js 中實現 Multi-ZIP Scraping API
   - 設置 Vercel Cron Jobs
   - 重構 Dashboard 組件

4. **測試與驗證**: 確保新系統與舊系統行為一致

---

*文檔創建時間: 2026-01-27*
*最後更新: 2026-01-27*
