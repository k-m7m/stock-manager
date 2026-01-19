// 株価データ取得API
class StockDataAPI {
    constructor() {
        // Yahoo Finance APIのベースURL
        this.apiBase = 'https://query1.finance.yahoo.com/v8/finance/chart/';
        // CORSプロキシ（ブラウザからの直接アクセス用）
        this.corsProxy = 'https://api.allorigins.win/raw?url=';
    }

    // 日本株の株コードをYahoo Finance形式に変換（例: 7203 -> 7203.T）
    formatStockCode(code) {
        return `${code}.T`;
    }

    // 株価データを取得
    async fetchStockData(stockCode) {
        try {
            const symbol = this.formatStockCode(stockCode);
            const targetUrl = `${this.apiBase}${symbol}`;
            // CORSプロキシを経由してアクセス
            const url = `${this.corsProxy}${encodeURIComponent(targetUrl)}`;

            const response = await fetch(url);
            if (!response.ok) {
                throw new Error('株価データの取得に失敗しました');
            }

            const data = await response.json();

            if (!data.chart || !data.chart.result || data.chart.result.length === 0) {
                throw new Error('株価データが見つかりません');
            }

            const result = data.chart.result[0];
            const meta = result.meta;
            const quote = result.indicators.quote[0];

            // 現在株価（最新の終値）
            const currentPrice = meta.regularMarketPrice || meta.previousClose;

            // 銘柄名（日本語が取得できない場合は株コードを使用）
            const stockName = meta.longName || meta.shortName || stockCode;

            // 配当利回り（Yahoo Financeから直接取得できないため、別途取得が必要）
            // ここでは簡易的に0を設定（後で手動更新可能）
            const dividendYield = 0;

            return {
                code: stockCode,
                name: stockName,
                currentPrice: currentPrice,
                dividendYield: dividendYield,
                success: true
            };

        } catch (error) {
            console.error('Stock data fetch error:', error);

            let errorMessage = '株価データの取得に失敗しました';

            if (error.message.includes('Failed to fetch')) {
                errorMessage = 'ネットワークエラー: インターネット接続を確認してください';
            } else if (error.message.includes('not found') || error.message.includes('見つかりません')) {
                errorMessage = '指定された証券コードが見つかりません';
            }

            return {
                success: false,
                error: errorMessage
            };
        }
    }

    // 配当利回りを取得（Yahoo Finance Statistics API）
    async fetchDividendYield(stockCode) {
        try {
            const symbol = this.formatStockCode(stockCode);
            // Yahoo Finance APIv10を使用（配当情報）
            const targetUrl = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${symbol}?modules=summaryDetail`;
            // CORSプロキシを経由してアクセス
            const url = `${this.corsProxy}${encodeURIComponent(targetUrl)}`;

            const response = await fetch(url);
            if (!response.ok) {
                return 0;
            }

            const data = await response.json();
            const summaryDetail = data.quoteSummary?.result?.[0]?.summaryDetail;

            if (summaryDetail && summaryDetail.dividendYield) {
                // パーセンテージに変換（Yahoo Financeは小数で返す）
                return (summaryDetail.dividendYield.raw * 100).toFixed(2);
            }

            return 0;

        } catch (error) {
            console.error('Dividend yield fetch error:', error);
            return 0;
        }
    }

    // 完全な株式情報を取得（株価 + 配当）
    async getCompleteStockData(stockCode) {
        const stockData = await this.fetchStockData(stockCode);

        if (!stockData.success) {
            return stockData;
        }

        // 配当利回りを別途取得
        const dividendYield = await this.fetchDividendYield(stockCode);
        stockData.dividendYield = parseFloat(dividendYield);

        return stockData;
    }
}

// アプリケーション状態管理
class StockPortfolioApp {
    constructor() {
        this.stocks = [];
        this.editingId = null;
        this.api = new StockDataAPI();
        this.init();
    }

    // 初期化
    init() {
        this.loadFromStorage();
        this.setupEventListeners();
        this.renderPortfolio();
    }

    // イベントリスナーの設定
    setupEventListeners() {
        const form = document.getElementById('stockForm');
        const cancelBtn = document.getElementById('cancelBtn');
        const refreshAllBtn = document.getElementById('refreshAllBtn');

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleSubmit();
        });

        cancelBtn.addEventListener('click', () => {
            this.cancelEdit();
        });

        refreshAllBtn.addEventListener('click', () => {
            this.refreshAllStocks();
        });
    }

    // フォーム送信処理
    async handleSubmit() {
        const stockCode = document.getElementById('stockCode').value.trim();
        const shares = parseInt(document.getElementById('shares').value);

        // ローディング状態にする
        this.setLoadingState(true);
        this.hideError();

        try {
            if (this.editingId !== null) {
                // 編集モード：株数のみ更新
                this.updateStock(this.editingId, { shares: shares });
                this.cancelEdit();
            } else {
                // 新規追加モード：株価データを取得
                const stockData = await this.api.getCompleteStockData(stockCode);

                if (!stockData.success) {
                    this.showError(stockData.error || '株式情報の取得に失敗しました。証券コードを確認してください。');
                    this.setLoadingState(false);
                    return;
                }

                // 既に同じ株コードが登録されているか確認
                const existingStock = this.stocks.find(s => s.code === stockCode);
                if (existingStock) {
                    this.showError('この証券コードは既に登録されています。');
                    this.setLoadingState(false);
                    return;
                }

                this.addStock({
                    id: Date.now(),
                    code: stockData.code,
                    name: stockData.name,
                    shares: shares,
                    currentPrice: stockData.currentPrice,
                    dividendYield: stockData.dividendYield
                });
            }

            this.clearForm();
            this.saveToStorage();
            this.renderPortfolio();

        } catch (error) {
            console.error('Submit error:', error);
            this.showError('予期しないエラーが発生しました。');
        } finally {
            this.setLoadingState(false);
        }
    }

    // 全銘柄の株価を更新
    async refreshAllStocks() {
        if (this.stocks.length === 0) {
            return;
        }

        const refreshBtn = document.getElementById('refreshAllBtn');
        const btnText = refreshBtn.querySelector('.btn-text');
        const btnLoading = refreshBtn.querySelector('.btn-loading');

        refreshBtn.disabled = true;
        btnText.style.display = 'none';
        btnLoading.style.display = 'inline-block';

        try {
            for (let stock of this.stocks) {
                const stockData = await this.api.getCompleteStockData(stock.code);

                if (stockData.success) {
                    stock.currentPrice = stockData.currentPrice;
                    stock.dividendYield = stockData.dividendYield;
                    stock.name = stockData.name;
                }
            }

            this.saveToStorage();
            this.renderPortfolio();

        } catch (error) {
            console.error('Refresh error:', error);
            alert('一部の銘柄の更新に失敗しました。');
        } finally {
            refreshBtn.disabled = false;
            btnText.style.display = 'inline-block';
            btnLoading.style.display = 'none';
        }
    }

    // ローディング状態の設定
    setLoadingState(isLoading) {
        const submitBtn = document.getElementById('submitBtn');
        const btnText = submitBtn.querySelector('.btn-text');
        const btnLoading = submitBtn.querySelector('.btn-loading');

        submitBtn.disabled = isLoading;

        if (isLoading) {
            btnText.style.display = 'none';
            btnLoading.style.display = 'inline-block';
        } else {
            btnText.style.display = 'inline-block';
            btnLoading.style.display = 'none';
        }
    }

    // エラーメッセージを表示
    showError(message) {
        const errorDiv = document.getElementById('errorMessage');
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
    }

    // エラーメッセージを非表示
    hideError() {
        const errorDiv = document.getElementById('errorMessage');
        errorDiv.style.display = 'none';
    }

    // 銘柄追加
    addStock(stock) {
        this.stocks.push(stock);
    }

    // 銘柄更新
    updateStock(id, updatedData) {
        const index = this.stocks.findIndex(stock => stock.id === id);
        if (index !== -1) {
            this.stocks[index] = { ...this.stocks[index], ...updatedData };
        }
    }

    // 銘柄削除
    deleteStock(id) {
        if (confirm('この銘柄を削除してもよろしいですか?')) {
            this.stocks = this.stocks.filter(stock => stock.id !== id);
            this.saveToStorage();
            this.renderPortfolio();
        }
    }

    // 編集モード開始（株数のみ編集可能）
    startEdit(id) {
        const stock = this.stocks.find(s => s.id === id);
        if (!stock) return;

        this.editingId = id;
        document.getElementById('stockCode').value = stock.code;
        document.getElementById('stockCode').disabled = true; // 証券コードは編集不可
        document.getElementById('shares').value = stock.shares;

        document.getElementById('submitBtn').querySelector('.btn-text').textContent = '更新';
        document.getElementById('cancelBtn').style.display = 'inline-block';

        // フォームまでスクロール
        document.querySelector('.add-stock-section').scrollIntoView({ behavior: 'smooth' });
    }

    // 編集モードキャンセル
    cancelEdit() {
        this.editingId = null;
        this.clearForm();
        document.getElementById('stockCode').disabled = false;
        document.getElementById('submitBtn').querySelector('.btn-text').textContent = '追加';
        document.getElementById('cancelBtn').style.display = 'none';
    }

    // フォームクリア
    clearForm() {
        document.getElementById('stockForm').reset();
        this.hideError();
    }

    // 計算メソッド
    calculateValue(stock) {
        return stock.currentPrice * stock.shares;
    }

    calculateAnnualDividendPerShare(stock) {
        return (stock.currentPrice * stock.dividendYield) / 100;
    }

    calculateAnnualDividendTotal(stock) {
        return this.calculateAnnualDividendPerShare(stock) * stock.shares;
    }

    calculateTotalValue() {
        return this.stocks.reduce((sum, stock) => sum + this.calculateValue(stock), 0);
    }

    calculateTotalDividend() {
        return this.stocks.reduce((sum, stock) => sum + this.calculateAnnualDividendTotal(stock), 0);
    }

    // 数値フォーマット
    formatNumber(num) {
        return new Intl.NumberFormat('ja-JP').format(Math.round(num));
    }

    formatDecimal(num, decimals = 2) {
        return new Intl.NumberFormat('ja-JP', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
        }).format(num);
    }

    // ポートフォリオ表示
    renderPortfolio() {
        const tbody = document.getElementById('portfolioBody');
        const emptyState = document.getElementById('emptyState');
        const portfolioSummary = document.getElementById('portfolioSummary');

        if (this.stocks.length === 0) {
            tbody.innerHTML = '';
            emptyState.style.display = 'block';
            portfolioSummary.style.display = 'none';
            return;
        }

        emptyState.style.display = 'none';
        portfolioSummary.style.display = 'grid';

        tbody.innerHTML = this.stocks.map(stock => {
            const value = this.calculateValue(stock);
            const annualDividendPerShare = this.calculateAnnualDividendPerShare(stock);

            return `
                <tr>
                    <td>${this.escapeHtml(stock.code)}</td>
                    <td>${this.escapeHtml(stock.name)}</td>
                    <td>${this.formatNumber(stock.shares)}</td>
                    <td>${this.formatNumber(stock.currentPrice)}</td>
                    <td>${this.formatNumber(value)}</td>
                    <td>${this.formatDecimal(stock.dividendYield)}</td>
                    <td>${this.formatDecimal(annualDividendPerShare)}</td>
                    <td>
                        <div class="action-buttons">
                            <button class="btn btn-edit" onclick="app.startEdit(${stock.id})">編集</button>
                            <button class="btn btn-delete" onclick="app.deleteStock(${stock.id})">削除</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        // サマリーを更新
        const totalValue = this.calculateTotalValue();
        const totalDividend = this.calculateTotalDividend();

        document.getElementById('summaryTotalValue').textContent = '¥' + this.formatNumber(totalValue);
        document.getElementById('summaryTotalDividend').textContent = '¥' + this.formatNumber(totalDividend);
    }

    // HTMLエスケープ
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ローカルストレージに保存
    saveToStorage() {
        try {
            localStorage.setItem('stockPortfolio', JSON.stringify(this.stocks));
        } catch (error) {
            console.error('データの保存に失敗しました:', error);
            alert('データの保存に失敗しました。ストレージの容量を確認してください。');
        }
    }

    // ローカルストレージから読み込み
    loadFromStorage() {
        try {
            const data = localStorage.getItem('stockPortfolio');
            if (data) {
                this.stocks = JSON.parse(data);
            }
        } catch (error) {
            console.error('データの読み込みに失敗しました:', error);
            alert('データの読み込みに失敗しました。');
            this.stocks = [];
        }
    }
}

// アプリケーション起動
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new StockPortfolioApp();
});
