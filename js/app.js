// --- 資料狀態 ---
let liveRates = {};
let currencies = [];
let mockNews = [];

// API 無法連線時使用的備援匯率資料。
const fallbackRates = {
    USD: 1, TWD: 32.2, EUR: 0.92, JPY: 155, GBP: 0.79, AUD: 1.52, CAD: 1.37, CHF: 0.91
};

// 備援新聞
const fallbackNews = [
    { time: "今日", title: "美元走勢受利率預期牽動", image: "", summary: "市場持續關注主要央行利率政策，美元與主要貨幣對短線波動加大。", source: "市場快訊", url: "#" },
    { time: "今日", title: "日圓匯價關注央行政策訊號", image: "", summary: "投資人留意日本央行政策方向與美債殖利率變化，日圓交投區間仍可能擴大。", source: "外匯觀察", url: "#" },
    { time: "今日", title: "歐元區數據影響歐元短線表現", image: "", summary: "歐元區經濟數據與通膨趨勢仍是市場評估歐元走勢的重要依據。", source: "金融焦點", url: "#" },
    { time: "今日", title: "台幣匯率隨國際美元變化調整", image: "", summary: "新台幣走勢受國際美元、資金流向與出口商拋匯需求共同影響。", source: "匯市整理", url: "#" }
];

const chartDataMock = {
    labels: ["1 天", "2 天", "3 天", "1 週", "2 週", "3 週", "6 週"],
    data: [31.8, 31.9, 32.0, 32.1, 31.95, 32.15, 32.2]
};

// --- 初始化 ---
document.addEventListener("DOMContentLoaded", async () => {
    updateClock();
    setInterval(updateClock, 1000);
    initNavigation();

    // 先取得資料，再渲染畫面。
    await fetchBackendData();

    initTicker();
    renderRatesBoard();
    renderNews();
    initQuickConvert();
    renderMarketTable();
    initChartModal();
    initCalculators();
});

// --- API 資料取得 ---
async function fetchBackendData() {
    liveRates = { ...fallbackRates };
    mockNews = [...fallbackNews];

    try {
        console.log("正在向後端 API 請求整合資料...");
        // 請求我們自己建立的 Vercel 後端 API
        const res = await fetch("/api/fetch-data");
        const data = await res.json();

        if (data.success) {
            // 處理匯率
            if (data.liveRates && Object.keys(data.liveRates).length > 0) {
                liveRates = data.liveRates;
            }

            // 處理新聞並自動補齊 8 則
            if (Array.isArray(data.news) && data.news.length > 0) {
                if (data.news.length < 8) {
                    const paddingCount = 8 - data.news.length;
                    mockNews = [...data.news, ...fallbackNews.slice(0, paddingCount)];
                } else {
                    mockNews = data.news.slice(0, 8);
                }
            }
        } else {
            console.warn("後端 API 回傳失敗，使用備援資料。");
        }
    } catch (error) {
        console.error("無法連線至後端 API，已改用備援資料：", error);
    }

    const pairsToGenerate = ["USD/TWD", "EUR/USD", "JPY/TWD", "GBP/USD", "AUD/USD", "USD/CAD", "USD/CHF", "EUR/TWD"];

    currencies = pairsToGenerate.map(pair => {
        const [base, quote] = pair.split("/");
        let rate = 1;
        if (base === "USD") {
            rate = liveRates[quote] || 1;
        } else if (quote === "USD") {
            rate = 1 / (liveRates[base] || 1);
        } else {
            rate = (liveRates[quote] || 1) / (liveRates[base] || 1);
        }

        const bid = rate * 0.9995;
        const ask = rate * 1.0005;
        const isUp = Math.random() > 0.5;
        const trend = isUp ? "up" : "down";
        const change = (rate * 0.0015 * (isUp ? 1 : -1)).toFixed(4);
        return { pair, bid, ask, change: `${isUp ? '+' : ''}${change}`, trend };
    });
}

// --- 時鐘 ---
function updateClock() {
    const clockEl = document.getElementById("clock");
    const now = new Date();
    clockEl.innerText = now.toLocaleTimeString("zh-Hant-TW", { hour12: false });
}

// --- 導覽切換 ---
function initNavigation() {
    const navBtns = document.querySelectorAll(".nav-btn");
    const sections = document.querySelectorAll(".view-section");
    const pageTitle = document.getElementById("page-title");

    const titles = { home: "總覽", market: "市場行情", tools: "換匯工具", about: "關於本站" };

    navBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            navBtns.forEach(b => b.classList.remove("active"));
            sections.forEach(s => s.classList.remove("active"));

            btn.classList.add("active");
            const targetId = btn.getAttribute("data-target");
            document.getElementById(targetId).classList.add("active");
            pageTitle.innerText = titles[targetId];
        });
    });
}

// --- 頂部行情跑馬燈 ---
function initTicker() {
    const tickerContent = document.getElementById("ticker-content");
    let html = "";
    const items = [...currencies, ...currencies];

    items.forEach(c => {
        const colorClass = c.trend === "up" ? "text-up" : "text-down";
        const trendLabel = c.trend === "up" ? "▲" : "▼";
        html += `<div class="ticker-item">
            <span>${c.pair}</span>
            <span class="${colorClass}">${c.ask.toFixed(4)} ${trendLabel}</span>
        </div>`;
    });
    tickerContent.innerHTML = html;
}

// --- 首頁 ---
function renderRatesBoard() {
    const grid = document.getElementById("popular-rates");
    const topRates = currencies.slice(0, 6);

    let html = "";
    topRates.forEach(c => {
        const colorClass = c.trend === "up" ? "text-up" : "text-down";
        html += `
        <div class="rate-card">
            <div class="rate-pair">${c.pair}</div>
            <div class="rate-value ${colorClass}">${c.bid.toFixed(4)}</div>
            <div class="rate-change ${colorClass}">
                <i data-lucide="${c.trend === "up" ? "trending-up" : "trending-down"}" style="width: 14px; height: 14px;"></i>
                ${c.change}
            </div>
        </div>`;
    });
    grid.innerHTML = html;
    if (window.lucide) window.lucide.createIcons();
}

function renderNews() {
    const list = document.getElementById("latest-news");
    if (!list) return;
    
    let html = "";
    mockNews.forEach(n => {
        // 🚀 修正：如果新聞沒有提供圖片（空字串），就不渲染 <img> 標籤，避免撐壞 DOM 結構或造成瀏覽器加載錯誤
        const imgHtml = n.image ? `<img src="${n.image}" alt="${n.title}" class="news-image" loading="lazy">` : "";
        
        html += `
        <a href="${n.url}" target="_blank" rel="noopener noreferrer" class="news-item">
            ${imgHtml}
            <div class="news-content">
                <div class="news-meta">
                    <span class="news-source">${n.source}</span>
                    <span class="news-time">${n.time}</span>
                </div>
                <h3 class="news-title">${n.title}</h3>
                <p class="news-summary">${n.summary}</p>
            </div>
        </a>`;
    });
    list.innerHTML = html;
}

function initQuickConvert() {
    const amtInput = document.getElementById("qc-amount");
    const fromSel = document.getElementById("qc-from");
    const toSel = document.getElementById("qc-to");
    const resultSpan = document.getElementById("qc-result");
    const swapBtn = document.getElementById("swap-btn");

    const calculate = () => {
        const amt = parseFloat(amtInput.value) || 0;
        const from = fromSel.value;
        const to = toSel.value;

        const rateFrom = liveRates[from] || 1;
        const rateTo = liveRates[to] || 1;

        const inUSD = amt / rateFrom;
        const final = inUSD * rateTo;

        resultSpan.innerText = final.toLocaleString("zh-Hant-TW", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        document.querySelector(".result-currency").innerText = to;
    };

    amtInput.addEventListener("input", calculate);
    fromSel.addEventListener("change", calculate);
    toSel.addEventListener("change", calculate);

    swapBtn.addEventListener("click", () => {
        const temp = fromSel.value;
        fromSel.value = toSel.value;
        toSel.value = temp;
        calculate();
    });

    calculate();
}

// --- 市場行情 ---
function renderMarketTable() {
    const tbody = document.getElementById("market-table-body");
    const searchInput = document.getElementById("market-search");

    const render = (filter = "") => {
        let html = "";
        currencies.forEach(c => {
            if (c.pair.toLowerCase().includes(filter.toLowerCase())) {
                const colorClass = c.trend === "up" ? "text-up" : "text-down";
                html += `
                <tr data-pair="${c.pair}">
                    <td style="font-weight: 500;">${c.pair}</td>
                    <td>${c.bid.toFixed(4)}</td>
                    <td>${c.ask.toFixed(4)}</td>
                    <td class="${colorClass}">${c.change}</td>
                    <td class="${colorClass}"><i data-lucide="${c.trend === "up" ? "trending-up" : "trending-down"}" style="width: 16px; height: 16px;"></i></td>
                </tr>`;
            }
        });
        tbody.innerHTML = html;
        if (window.lucide) window.lucide.createIcons();

        document.querySelectorAll("#market-table-body tr").forEach(tr => {
            tr.addEventListener("click", () => openChart(tr.getAttribute("data-pair")));
        });
    };

    render();
    searchInput.addEventListener("input", e => render(e.target.value));
}

let trendChartInstance = null;

function initChartModal() {
    document.getElementById("close-chart").addEventListener("click", () => {
        document.getElementById("chart-modal").classList.remove("active");
    });
}

function openChart(pair) {
    const modal = document.getElementById("chart-modal");
    document.getElementById("chart-title").innerText = `${pair} 匯率走勢`;
    modal.classList.add("active");

    const ctx = document.getElementById("trendChart").getContext("2d");

    if (trendChartInstance) {
        trendChartInstance.destroy();
    }

    const randomMultiplier = () => 0.95 + Math.random() * 0.1;
    const newData = chartDataMock.data.map(val => val * randomMultiplier());
    const isUp = newData[newData.length - 1] > newData[0];
    const color = isUp ? "#00E676" : "#FF5252";

    trendChartInstance = new Chart(ctx, {
        type: "line",
        data: {
            labels: chartDataMock.labels,
            datasets: [{
                label: pair,
                data: newData,
                borderColor: color,
                backgroundColor: isUp ? "rgba(0, 230, 118, 0.1)" : "rgba(255, 82, 82, 0.1)",
                borderWidth: 2,
                fill: true,
                tension: 0.4,
                pointRadius: 0,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    mode: "index", intersect: false, backgroundColor: "rgba(11, 15, 25, 0.9)",
                    titleColor: "#A0AEC0", bodyColor: "#FFFFFF", borderColor: "rgba(255,255,255,0.1)", borderWidth: 1
                }
            },
            scales: {
                x: { grid: { color: "rgba(255, 255, 255, 0.05)" }, ticks: { color: "#A0AEC0" } },
                y: { grid: { color: "rgba(255, 255, 255, 0.05)" }, ticks: { color: "#A0AEC0" } }
            },
            interaction: { mode: "nearest", axis: "x", intersect: false }
        }
    });
}

// --- 換匯工具計算器 ---
function initCalculators() {
    initMultiConvert();
    initTimeDeposit();
    initAverageCost();
}

function initMultiConvert() {
    const baseAmtInput = document.getElementById("multi-amount");
    const baseSel = document.getElementById("multi-base");
    const resultsContainer = document.getElementById("multi-results");
    const currenciesToConvert = ["USD", "EUR", "TWD", "JPY", "GBP", "AUD"];

    const updateMulti = () => {
        const amt = parseFloat(baseAmtInput.value) || 0;
        const base = baseSel.value;
        const baseRate = liveRates[base] || 1;
        const inUSD = amt / baseRate;

        let html = "";
        currenciesToConvert.forEach(currency => {
            if (currency !== base) {
                const targetRate = liveRates[currency] || 1;
                const final = inUSD * targetRate;
                html += `
                <div class="multi-result-item">
                    <span class="text-muted">${currency}</span>
                    <span style="font-weight: 500; color: white;">${final.toLocaleString("zh-Hant-TW", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>`;
            }
        });
        resultsContainer.innerHTML = html;
    };

    baseAmtInput.addEventListener("input", updateMulti);
    baseSel.addEventListener("change", updateMulti);
    updateMulti();
}

function initTimeDeposit() {
    const principalInput = document.getElementById("td-principal");
    const rateInput = document.getElementById("td-rate");
    const termInput = document.getElementById("td-term");
    const btn = document.getElementById("calc-td-btn");
    const resultSpan = document.getElementById("td-result");

    btn.addEventListener("click", () => {
        const principal = parseFloat(principalInput.value) || 0;
        const annualRate = parseFloat(rateInput.value) || 0;
        const months = parseInt(termInput.value, 10) || 0;

        const rate = annualRate / 100;
        const compoundingPeriods = 12;
        const years = months / 12;
        const amount = principal * Math.pow(1 + rate / compoundingPeriods, compoundingPeriods * years);

        resultSpan.innerText = amount.toLocaleString("zh-Hant-TW", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        resultSpan.style.transform = "scale(1.05)";
        setTimeout(() => { resultSpan.style.transform = "scale(1)"; }, 150);
    });
}

function initAverageCost() {
    const addBtn = document.getElementById("add-batch-btn");
    const calcBtn = document.getElementById("calc-avg-btn");
    const inputsContainer = document.getElementById("batch-inputs");
    const resultSpan = document.getElementById("avg-result");
    const totalSpan = document.getElementById("total-amount-result");

    addBtn.addEventListener("click", () => {
        const row = document.createElement("div");
        row.className = "batch-row";
        row.innerHTML = `
            <input type="number" class="batch-rate" placeholder="匯率">
            <input type="number" class="batch-amount" placeholder="金額">
        `;
        inputsContainer.appendChild(row);
    });

    calcBtn.addEventListener("click", () => {
        const rates = document.querySelectorAll(".batch-rate");
        const amounts = document.querySelectorAll(".batch-amount");
        let totalCost = 0;
        let totalAmount = 0;

        for (let i = 0; i < rates.length; i++) {
            const rate = parseFloat(rates[i].value) || 0;
            const amount = parseFloat(amounts[i].value) || 0;
            if (rate > 0 && amount > 0) {
                totalCost += rate * amount;
                totalAmount += amount;
            }
        }

        if (totalAmount > 0) {
            const average = totalCost / totalAmount;
            resultSpan.innerText = average.toFixed(4);
            totalSpan.innerText = `總金額：${totalAmount.toLocaleString("zh-Hant-TW")}`;
        } else {
            resultSpan.innerText = "0.00";
            totalSpan.innerText = "總金額：0";
        }
        resultSpan.style.transform = "scale(1.05)";
        setTimeout(() => { resultSpan.style.transform = "scale(1)"; }, 150);
    });
}
