# FX 外匯資訊站 (Forex Dashboard)

這是一個現代化、具備毛玻璃 (Glassmorphism) 質感的金融外匯資訊儀表板。專案整合了多方匯率 API 並具有自動交叉驗證機制，同時提供即時全球財經新聞以及換匯成本試算工具。

## ✨ 核心特色
- **自動交叉驗證**：後端會同時抓取 ExchangeRate-API、Finnhub 與 Frankfurter (歐洲央行數據) 進行動態容差比對，確保匯率精準度。
- **快取機制 (Redis)**：透過 Upstash Redis 進行資料快取，大幅降低外部 API 呼叫次數，避免觸發免費 API 額度限制。
- **即時財經新聞**：串接 Finnhub 全球新聞，讓使用者隨時掌握市場動態。
- **換匯試算計算機**：提供平均成本試算，幫助投資人評估分批換匯的平均成本。
- **流暢且響應式設計**：以 Vanilla HTML/CSS/JS 實作，輕量、快速，支援各尺寸裝置完美顯示。

## 🛠️ 技術架構
- **前端**：HTML5, Vanilla JavaScript, CSS3 (CSS Variables, Flexbox/Grid)
- **後端**：Vercel Serverless Functions (Node.js)
- **資料庫**：Upstash Redis (Vercel Integration)

## 🚀 部署教學 (以 Vercel 為例)

本專案經過特殊設計，完美相容於 Vercel 的「零配置 (Zero Config)」環境。

### 1. 匯入專案至 Vercel
將此專案推送到您的 GitHub 後，在 Vercel 後台選擇匯入此 Repository。Vercel 會自動將 `public` 資料夾設為靜態網站，並將 `api` 資料夾作為 Serverless 後端。

### 2. 連接 Redis 資料庫
1. 在 Vercel 的 **Storage** 分頁，建立一個 **Upstash Redis** 資料庫。
2. 確保資料庫已成功連結 (Connected) 至此專案。系統會自動注入 `REDIS_URL` 等環境變數。

### 3. 設定環境變數
請在 Vercel 專案設定的 **Environment Variables** 中加入以下金鑰：
- `EXCHANGE_KEY`: 您的 ExchangeRate-API 金鑰。
- `FINNHUB_KEY`: 您的 Finnhub API 金鑰。
- `CRON_SECRET`: 用於保護快取更新端點的自訂暗號 (例如：`mySecret123`)。

*(附註：`REDIS_URL` 會由 Vercel Storage 自動注入，無需手動填寫)*

### 4. 初始化 / 更新快取資料
部署完成後，專案的 Redis 快取初始會是空的。您必須手動觸發一次後端更新程序，或者使用外部排程服務（如 GitHub Actions, Cron-job.org）定時呼叫以下網址：
```
https://[您的Vercel專案網址]/api/fetch-data?cron=true&secret=[您設定的CRON_SECRET]
```
- 若執行成功，會回傳 `{"success":true,"message":"數據更新並成功寫入快取！"}`
- 之後前端即可瞬間從 Redis 載入所有資料！

## 📄 授權條款
此專案僅供學習與交流使用，外匯與新聞數據版權歸原 API 供應商所有。請勿用於任何商業交易之絕對依據。
