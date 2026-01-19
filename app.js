// アプリケーション状態管理
class StockPortfolioApp {
    constructor() {
        this.stocks = [];
        this.editingId = null;
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

        form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleSubmit();
        });

        cancelBtn.addEventListener('click', () => {
            this.cancelEdit();
        });
    }

    // フォーム送信処理
    handleSubmit() {
        const stockName = document.getElementById('stockName').value.trim();
        const shares = parseInt(document.getElementById('shares').value);
        const currentPrice = parseFloat(document.getElementById('currentPrice').value);
        const dividendYield = parseFloat(document.getElementById('dividendYield').value);

        if (this.editingId !== null) {
            // 編集モード
            this.updateStock(this.editingId, {
                name: stockName,
                shares: shares,
                currentPrice: currentPrice,
                dividendYield: dividendYield
            });
            this.cancelEdit();
        } else {
            // 新規追加モード
            this.addStock({
                id: Date.now(),
                name: stockName,
                shares: shares,
                currentPrice: currentPrice,
                dividendYield: dividendYield
            });
        }

        this.clearForm();
        this.saveToStorage();
        this.renderPortfolio();
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

    // 編集モード開始
    startEdit(id) {
        const stock = this.stocks.find(s => s.id === id);
        if (!stock) return;

        this.editingId = id;
        document.getElementById('stockName').value = stock.name;
        document.getElementById('shares').value = stock.shares;
        document.getElementById('currentPrice').value = stock.currentPrice;
        document.getElementById('dividendYield').value = stock.dividendYield;

        document.getElementById('submitBtn').textContent = '更新';
        document.getElementById('cancelBtn').style.display = 'inline-block';

        // フォームまでスクロール
        document.querySelector('.add-stock-section').scrollIntoView({ behavior: 'smooth' });
    }

    // 編集モードキャンセル
    cancelEdit() {
        this.editingId = null;
        this.clearForm();
        document.getElementById('submitBtn').textContent = '追加';
        document.getElementById('cancelBtn').style.display = 'none';
    }

    // フォームクリア
    clearForm() {
        document.getElementById('stockForm').reset();
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
        const footer = document.getElementById('portfolioFooter');

        if (this.stocks.length === 0) {
            tbody.innerHTML = '';
            emptyState.style.display = 'block';
            footer.style.display = 'none';
            return;
        }

        emptyState.style.display = 'none';
        footer.style.display = 'table-footer-group';

        tbody.innerHTML = this.stocks.map(stock => {
            const value = this.calculateValue(stock);
            const annualDividendPerShare = this.calculateAnnualDividendPerShare(stock);
            const annualDividendTotal = this.calculateAnnualDividendTotal(stock);

            return `
                <tr>
                    <td>${this.escapeHtml(stock.name)}</td>
                    <td>${this.formatNumber(stock.shares)}</td>
                    <td>${this.formatNumber(stock.currentPrice)}</td>
                    <td>${this.formatNumber(value)}</td>
                    <td>${this.formatDecimal(stock.dividendYield)}</td>
                    <td>${this.formatDecimal(annualDividendPerShare)}</td>
                    <td>${this.formatNumber(annualDividendTotal)}</td>
                    <td>
                        <div class="action-buttons">
                            <button class="btn btn-edit" onclick="app.startEdit(${stock.id})">編集</button>
                            <button class="btn btn-delete" onclick="app.deleteStock(${stock.id})">削除</button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        // 合計を更新
        document.getElementById('totalValue').textContent = this.formatNumber(this.calculateTotalValue());
        document.getElementById('totalDividend').textContent = this.formatNumber(this.calculateTotalDividend());
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
