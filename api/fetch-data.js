export default async function handler(req, res) {
    // 從環境變數讀取 API Keys (需要在 Vercel 儀表板設定)
    const EXCHANGE_RATE_API_KEY = process.env.EXCHANGE_RATE_API_KEY;
    const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;

    if (!EXCHANGE_RATE_API_KEY || !FINNHUB_API_KEY) {
        return res.status(500).json({ error: "環境變數未設定 API Keys" });
    }

    try {
        console.log("後端啟動：正在並行取得所有外部 API 資料...");
        
        // 並行取得匯率與新聞
        const [resExchange, resFinnhub, resFrankfurter, resNews] = await Promise.allSettled([
            fetch(`https://v6.exchangerate-api.com/v6/${EXCHANGE_RATE_API_KEY}/latest/USD`).then(r => r.json()),
            fetch(`https://finnhub.io/api/v1/forex/rates?base=USD&token=${FINNHUB_API_KEY}`).then(r => r.json()),
            fetch("https://api.frankfurter.app/latest?from=USD").then(r => r.json()),
            fetch(`https://finnhub.io/api/v1/news?category=general&token=${FINNHUB_API_KEY}`).then(r => r.json())
        ]);

        // --- 匯率交叉驗證邏輯 ---
        let primaryRates = {};
        let benchmarkRates = {};

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

        let liveRates = { USD: 1 };
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
                        finalRate = benchmarkRate; // 差異過大採納 Frankfurter 基準
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
        }

        // --- 新聞處理邏輯 ---
        let news = [];
        if (resNews.status === "fulfilled" && Array.isArray(resNews.value) && resNews.value.length > 0) {
            // 擷取前 8 筆並回傳需要的格式，交給前端處理 fallback
            news = resNews.value.slice(0, 8).map(item => {
                return {
                    datetime: item.datetime,
                    title: item.headline || "全球財經要聞",
                    image: item.image || "",
                    summary: item.summary || "點擊查看完整新聞報導內容。",
                    source: item.source || "Market News",
                    url: item.url || "#"
                };
            });
        }

        // 將乾淨、驗證過的資料傳回前端
        res.status(200).json({
            success: true,
            liveRates,
            news
        });

    } catch (error) {
        console.error("後端抓取錯誤：", error);
        res.status(500).json({ success: false, error: "無法處理外部 API 資料" });
    }
}
