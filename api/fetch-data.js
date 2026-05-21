// 🚀 修正：改用 require 語法，防止 Vercel 執行環境因為 import 語法崩潰
const { createClient } = require('redis');

module.exports = async (req, res) => {
  // 🚀 修正：在 Node.js 中，query 參數與 headers 的標準安全抓取方式
  const secret = req.query ? req.query.secret : null;
  const cron = req.query ? req.query.cron : null;
  const authHeader = req.headers ? req.headers['authorization'] : null;

  // 建立 Redis 連線
  const redis = createClient({
    url: process.env.REDIS_URL
  });

  redis.on('error', err => console.error('Redis Client Error', err));
  await redis.connect();

  // 安全檢查：驗證暗號 (判斷是否為後端排程觸發的更新請求)
  const isAuthorized = (cron === 'true' && secret === 'mySecret123') || 
                       (authHeader && authHeader === `Bearer ${process.env.CRON_SECRET}`);

  if (isAuthorized) {
    try {
      console.log("暗號正確，開始執行後端數據更新與比對...");

      // 🚀 新增：建立一個 4 秒超時的斷尾控制器
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000); // 4000 毫秒 = 4 秒

      // 備援匯率資料
      const fallbackRates = {
        USD: 1, TWD: 32.2, EUR: 0.92, JPY: 155, GBP: 0.79, AUD: 1.52, CAD: 1.37, CHF: 0.91
      };

      // 1. 呼叫外部 API（通通加上 signal 控制器）
      const [resExchange, resFinnhub, resFrankfurter] = await Promise.allSettled([
        fetch(`https://v6.exchangerate-api.com/v6/${process.env.EXCHANGE_KEY}/latest/USD`, { signal: controller.signal }).then(r => r.json()),
        fetch(`https://finnhub.io/api/v1/news?category=general&token=${process.env.FINNHUB_KEY}`, { signal: controller.signal }).then(r => r.json()),
        fetch("https://api.frankfurter.app/latest?from=USD", { signal: controller.signal }).then(r => r.json())
      ]);

      // 🚀 新增：API 順利回應了就清除計時器
      clearTimeout(timeoutId);

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

      // 3. 寫入快取，保存 15 分鐘 (900秒)
      await redis.set('fx_market_data', JSON.stringify(marketOutput), { EX: 900 });
      await redis.disconnect();

      // 回傳成功 JSON (只給觸發排程的機器看)
      return res.status(200).json({ success: true, message: "數據更新並成功寫入快取！" });

    } catch (err) {
      console.error("內部運作錯誤:", err);
      if (redis.isOpen) await redis.disconnect();
      return res.status(500).json({ error: "Internal Server Error", details: err.message });
    }
  } else {
    // 沒有暗號，代表是一般使用者的瀏覽器前端請求 (app.js 發出的)
    try {
      const dataStr = await redis.get('fx_market_data');
      await redis.disconnect();

      if (dataStr) {
        const marketData = JSON.parse(dataStr);
        // 從快取讀出資料，格式要對應前端 app.js 的預期
        return res.status(200).json({ 
            success: true, 
            liveRates: marketData.rates, 
            news: marketData.news 
        });
      } else {
        return res.status(404).json({ success: false, error: "快取中尚未有數據，請稍後再試。" });
      }
    } catch (err) {
      console.error("讀取快取錯誤:", err);
      if (redis.isOpen) await redis.disconnect();
      return res.status(500).json({ success: false, error: "無法連線至資料庫" });
    }
  }
};
