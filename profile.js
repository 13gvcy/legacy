// Profile Page Logic
document.addEventListener('DOMContentLoaded', () => {
    const profileContent = document.getElementById('profile-content');
    const connectBtn = document.getElementById('connect-wallet');
    let walletAddress = null;
    let connection = null;

    // Initialize Solana Connection
    if (window.solanaWeb3) {
        connection = new solanaWeb3.Connection(solanaWeb3.clusterApiUrl('devnet'), 'confirmed');
    }

    // Check for existing wallet connection
    const checkConnection = async () => {
        if (sessionStorage.getItem('walletAddress')) {
            const { solana } = window;
            if (solana && solana.isPhantom) {
                try {
                    const response = await solana.connect({ onlyIfTrusted: true });
                    walletAddress = response.publicKey.toString();
                    updateWalletUI(walletAddress);
                    loadProfileData();
                } catch (err) {
                    sessionStorage.removeItem('walletAddress');
                    showConnectPrompt();
                }
            }
        } else {
            showConnectPrompt();
        }
    };

    const connectWallet = async () => {
        try {
            const { solana } = window;
            if (solana && solana.isPhantom) {
                const response = await solana.connect();
                walletAddress = response.publicKey.toString();
                updateWalletUI(walletAddress);
                sessionStorage.setItem('walletAddress', walletAddress);
                loadProfileData();
            } else {
                alert("Phantom wallet not found! Please install it.");
                window.open("https://phantom.app/", "_blank");
            }
        } catch (err) {
            console.error(err);
        }
    };

    const updateWalletUI = (pubKey) => {
        if (connectBtn) {
            connectBtn.innerText = pubKey.slice(0, 4) + '...' + pubKey.slice(-4);
            connectBtn.style.borderColor = "var(--color-primary)";
            connectBtn.style.boxShadow = "0 0 15px rgba(0, 255, 65, 0.3)";
        }
    };

    if (connectBtn) {
        connectBtn.addEventListener('click', connectWallet);
        window.addEventListener('load', checkConnection);
    }

    const showConnectPrompt = () => {
        profileContent.innerHTML = `
            <div class="empty-state">
                <h2 style="margin-bottom: 1rem; color: var(--color-text);">CONNECT YOUR WALLET</h2>
                <p style="margin-bottom: 2rem;">Connect your wallet to view your profile, PnL, and trading history.</p>
                <button class="btn btn-primary" onclick="document.getElementById('connect-wallet').click();">
                    CONNECT WALLET
                </button>
            </div>
        `;
    };

    const loadProfileData = async () => {
        if (!walletAddress || !connection) {
            showConnectPrompt();
            return;
        }

        try {
            profileContent.innerHTML = '<div class="loading-spinner">Loading Profile Data...</div>';

            // Get wallet balance
            const balance = await connection.getBalance(new solanaWeb3.PublicKey(walletAddress));
            const solBalance = (balance / 1e9).toFixed(4);

            // Fetch all markets to calculate stats
            const PROGRAM_ID = "6d5P8J92SyZFc1Cz3EHJzjySTkjzxaJDwizfQQUzXNev";
            const accounts = await connection.getProgramAccounts(new solanaWeb3.PublicKey(PROGRAM_ID));

            // Decode markets (reuse decodeMarket from script.js if available)
            const decodeMarket = (data) => {
                try {
                    let offset = 8;
                    const creator = new solanaWeb3.PublicKey(data.slice(offset, offset + 32));
                    offset += 32;
                    const questionLen = new DataView(data.buffer, data.byteOffset + offset).getUint32(0, true);
                    offset += 4;
                    const questionBytes = data.slice(offset, offset + questionLen);
                    const question = new TextDecoder().decode(questionBytes);
                    offset += questionLen;
                    const baseMint = new solanaWeb3.PublicKey(data.slice(offset, offset + 32));
                    offset += 32;
                    const yesPoolAmount = new BN(data.slice(offset, offset + 8), 'le');
                    offset += 8;
                    const noPoolAmount = new BN(data.slice(offset, offset + 8), 'le');
                    offset += 8;
                    const totalYesShares = new BN(data.slice(offset, offset + 8), 'le');
                    offset += 8;
                    const totalNoShares = new BN(data.slice(offset, offset + 8), 'le');
                    offset += 8;
                    const status = data[offset];
                    offset += 1;
                    const createdAt = new BN(data.slice(offset, offset + 8), 'le');
                    offset += 8;
                    const resolveAt = new BN(data.slice(offset, offset + 8), 'le');
                    offset += 8;
                    const resolver = new solanaWeb3.PublicKey(data.slice(offset, offset + 32));
                    offset += 32;
                    const feePaid = data[offset] === 1;

                    return {
                        creator: creator.toString(),
                        question,
                        baseMint: baseMint.toString(),
                        yesPoolAmount,
                        noPoolAmount,
                        totalYesShares,
                        totalNoShares,
                        status,
                        createdAt: createdAt.toNumber(),
                        resolveAt,
                        resolver: resolver.toString(),
                        feePaid
                    };
                } catch (e) {
                    console.error("Failed to decode market:", e);
                    return null;
                }
            };

            const userMarkets = [];
            const userTrades = [];

            for (const { pubkey, account } of accounts) {
                const market = decodeMarket(account.data);
                if (market && market.question) {
                    // Markets created by user
                    if (market.creator === walletAddress) {
                        userMarkets.push({
                            id: pubkey.toString(),
                            question: market.question,
                            status: market.status,
                            createdAt: market.createdAt,
                            yesPool: market.yesPoolAmount.toNumber() / 1e9,
                            noPool: market.noPoolAmount.toNumber() / 1e9
                        });
                    }

                    // Simulated trades (in real implementation, you'd fetch from on-chain data)
                    // For now, we'll show markets the user created as "trades"
                    if (market.status !== 0 && market.creator === walletAddress) {
                        const totalPool = (market.yesPoolAmount.toNumber() + market.noPoolAmount.toNumber()) / 1e9;
                        const isWin = (market.status === 1 && market.yesPoolAmount.toNumber() > market.noPoolAmount.toNumber()) ||
                                     (market.status === 2 && market.noPoolAmount.toNumber() > market.yesPoolAmount.toNumber());
                        
                        userTrades.push({
                            question: market.question,
                            outcome: market.status === 1 ? 'YES' : 'NO',
                            status: market.status === 0 ? 'pending' : (isWin ? 'win' : 'loss'),
                            amount: totalPool.toFixed(2),
                            date: new Date(market.createdAt * 1000).toLocaleDateString()
                        });
                    }
                }
            }

            // Calculate stats
            const totalMarkets = userMarkets.length;
            const resolvedMarkets = userMarkets.filter(m => m.status !== 0).length;
            const totalVolume = userMarkets.reduce((sum, m) => sum + m.yesPool + m.noPool, 0);
            const winningTrades = userTrades.filter(t => t.status === 'win').length;
            const totalTrades = userTrades.length;
            const winRate = totalTrades > 0 ? ((winningTrades / totalTrades) * 100).toFixed(1) : 0;

            // Calculate PnL (simplified - in real implementation, track actual positions)
            const estimatedPnL = totalVolume * 0.1; // Placeholder calculation

            renderProfile({
                walletAddress,
                solBalance,
                totalMarkets,
                resolvedMarkets,
                totalVolume,
                winningTrades,
                totalTrades,
                winRate,
                estimatedPnL,
                userTrades
            });

        } catch (err) {
            console.error("Error loading profile:", err);
            profileContent.innerHTML = `<div class="error">Failed to load profile data: ${err.message}</div>`;
        }
    };

    const renderProfile = (data) => {
        const pnlClass = data.estimatedPnL >= 0 ? 'positive' : 'negative';
        const pnlSign = data.estimatedPnL >= 0 ? '+' : '';

        profileContent.innerHTML = `
            <div class="wallet-info">
                <div class="stat-label">WALLET ADDRESS</div>
                <div class="wallet-address">${data.walletAddress}</div>
            </div>

            <div class="profile-section">
                <div class="section-header">
                    <h2>OVERVIEW</h2>
                    <div class="line-decoration"></div>
                </div>
                <div class="profile-stats-grid">
                    <div class="profile-stat-card">
                        <div class="stat-label">Balance</div>
                        <div class="stat-value">${data.solBalance} SOL</div>
                        <div class="stat-change">Available balance</div>
                    </div>
                    <div class="profile-stat-card">
                        <div class="stat-label">Total PnL</div>
                        <div class="stat-value ${pnlClass}">${pnlSign}${data.estimatedPnL.toFixed(2)} USDC</div>
                        <div class="stat-change">Estimated profit/loss</div>
                    </div>
                    <div class="profile-stat-card">
                        <div class="stat-label">Win Rate</div>
                        <div class="stat-value ${data.winRate > 50 ? 'positive' : data.winRate < 50 ? 'negative' : ''}">${data.winRate}%</div>
                        <div class="stat-change">${data.winningTrades} wins / ${data.totalTrades} trades</div>
                    </div>
                    <div class="profile-stat-card">
                        <div class="stat-label">Markets Created</div>
                        <div class="stat-value">${data.totalMarkets}</div>
                        <div class="stat-change">${data.resolvedMarkets} resolved</div>
                    </div>
                    <div class="profile-stat-card">
                        <div class="stat-label">Total Volume</div>
                        <div class="stat-value">${data.totalVolume.toFixed(2)} USDC</div>
                        <div class="stat-change">Across all markets</div>
                    </div>
                    <div class="profile-stat-card">
                        <div class="stat-label">Active Positions</div>
                        <div class="stat-value">${data.totalTrades - data.winningTrades}</div>
                        <div class="stat-change">Pending resolution</div>
                    </div>
                </div>
            </div>

            <div class="profile-section">
                <div class="section-header">
                    <h2>TRADING HISTORY</h2>
                    <div class="line-decoration"></div>
                </div>
                ${data.userTrades.length > 0 ? `
                    <div class="trades-list">
                        ${data.userTrades.map(trade => `
                            <div class="trade-item">
                                <div class="trade-question">${trade.question}</div>
                                <div>
                                    <span class="trade-outcome ${trade.status}">
                                        ${trade.status === 'win' ? '✓ WIN' : trade.status === 'loss' ? '✗ LOSS' : '● PENDING'}
                                    </span>
                                </div>
                                <div class="trade-amount ${trade.status === 'win' ? 'positive' : trade.status === 'loss' ? 'negative' : ''}">
                                    ${trade.status === 'win' ? '+' : trade.status === 'loss' ? '-' : ''}${trade.amount} USDC
                                </div>
                                <div class="trade-date">${trade.date}</div>
                            </div>
                        `).join('')}
                    </div>
                ` : `
                    <div class="empty-state">
                        <p>No trading history yet. <a href="index.html">Start trading</a> to see your performance here.</p>
                    </div>
                `}
            </div>
        `;
    };

    // Initial load
    checkConnection();
});

