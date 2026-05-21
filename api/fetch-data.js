// 🚀 修正：改用 require 語法，防止 Vercel 執行環境因為 import 語法崩潰
const { kv } = require('@vercel/kv');

module.exports = async (req, res) => {
  // 🚀 修正：在 Node.js 中，query 參數與 headers 的標準安全抓取方式
  const secret = req.query ? req.query.secret : null;
  const cron = req.query ? req.query.cron : null;
  const authHeader = req.headers ? req.headers['authorization'] : null;

  // 安全檢查：驗證暗號
  if (
    (cron === 'true' && secret === 'mySecret123') || 
    (authHeader && authHeader === `Bearer ${process.env.CRON_SECRET}`)
  ) {
    try {
      console.log("暗號正確，開始執行後端數據更新與比對...");

      // 備援匯率資料
      const fallbackRates = {
        USD: 1, TWD: 32.2, EUR: 0.92, JPY: 155, GBP: 0.79, AUD: 1.52, CAD: 1.37, CHF: 0.91
      };

      // 1. 呼叫外部 API
      const [resExchange, resFinnhub, resFrankfurter] = await Promise.allSettled([
        fetch(`https://v6.exchangerate-api.com/v6/${process.env.EXCHANGE_KEY}/latest/USD`).then(r => r.json()),
        fetch(`https://finnhub.io/api/v1/news?category=general&token=${process.env.FINNHUB_KEY}`).then(r => r.json()),
        fetch("https://api.frankfurter.app/latest?from=USD").then(r => r.json())
      ]);

      let primaryRates = {};
      let benchmarkRates = {};
      let liveRates = { USD: 1 };

      if (resExchange.status === "fulfilled" && resExchange.value.result === "success") {
        primaryRates = resExchange.value.conversion_rates;
      }

      if (resFrankfurter.status === "fulfilled" && resFrankfurter.value.rates) {
        benchmarkRates = resFrankfurter.value.rates;
        benchmarkRates.USD = 1;
      }

      let finnhubRates = null;
      if (resFinnhub.status === "fulfilled" && !resFinnhub.value.error && resFinnhub.value.quote) {
        finnhubRates = resFinnhub.value.quote;
      }

      // 2. 交叉驗證與數據對齊
      if (Object.keys(primaryRates).length > 0) {
        for (const [currency, primaryRate] of Object.entries(primaryRates)) {
          if (currency === "USD") continue;

          let finalRate = primaryRate;
          if (benchmarkRates[currency]) {
            const benchmarkRate = benchmarkRates[currency];
            const differencePct = Math.abs(primaryRate - benchmarkRate) / primaryRate * 100;

            if (differencePct <= 0.5) {
              finalRate = (primaryRate + benchmarkRate) / 2;
            } else {
              finalRate = benchmarkRate;
            }
          } else if (finnhubRates && finnhubRates[currency]) {
            const secondaryRate = finnhubRates[currency];
            const differencePct = Math.abs(primaryRate - secondaryRate) / primaryRate * 100;

            if (differencePct <= 0.5) {
              finalRate = (primaryRate + secondaryRate) / 2;
            }
          }
          liveRates[currency] = finalRate;
        }
      } else {
        liveRates = { ...fallbackRates };
      }

      // 新聞處理
      let finalNews = [];
      if (resFinnhub.status === "fulfilled" && Array.isArray(resFinnhub.value) && resFinnhub.value.length > 0) {
        finalNews = resFinnhub.value.slice(0, 8).map(item => {
          const date = new Date(item.datetime * 1000);
          return {
            time: date.toLocaleTimeString("zh-Hant-TW", { hour: "2-digit", minute: "2-digit" }),
            title: item.headline || "全球財經要聞",
            image: item.image || "",
            summary: item.summary || "點擊查看完整新聞報導內容。",
            source: item.source || "Market News",
            url: item.url || "#"
          };
        });
      }

      // 打包最終共識數據
      const marketOutput = {
        rates: liveRates,
        news: finalNews,
        updatedAt: new Date().toISOString()
      };

      // 3. 寫入快取，保存 15 分鐘
      await kv.set('fx_market_data', marketOutput, { ex: 900 });

      // 回傳成功 JSON
      return res.status(200).json({ success: true, message: "數據更新並成功寫入快取！" });

    } catch (err) {
      console.error("內部運作錯誤:", err);
      return res.status(500).json({ error: "Internal Server Error", details: err.message });
    }
  }

  // 暗號不對拒絕連線
  return res.status(401).json({ error: "Unauthorized: 無權限存取此 API" });
};
