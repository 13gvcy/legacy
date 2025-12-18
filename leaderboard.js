// Leaderboard Page Logic
document.addEventListener('DOMContentLoaded', () => {
    const leaderboardContent = document.getElementById('leaderboard-content');
    const searchInput = document.getElementById('search-input');
    const sortSelect = document.getElementById('sort-by');
    const sortDirectionBtn = document.getElementById('sort-direction');
    const periodBtns = document.querySelectorAll('.period-btn');
    const connectBtn = document.getElementById('connect-wallet');

    let walletAddress = null;
    let connection = null;
    let allLeaderboardData = [];
    let filteredData = [];
    let currentSort = 'rank';
    let currentDirection = 'desc';
    let currentPeriod = 'all';

    // Initialize Solana Connection
    if (window.solanaWeb3) {
        connection = new solanaWeb3.Connection(solanaWeb3.clusterApiUrl('devnet'), 'confirmed');
    }

    // Wallet connection logic
    const connectWallet = async () => {
        try {
            const { solana } = window;
            if (solana && solana.isPhantom) {
                const response = await solana.connect();
                walletAddress = response.publicKey.toString();
                updateWalletUI(walletAddress);
                sessionStorage.setItem('walletAddress', walletAddress);
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

    const checkConnection = async () => {
        if (sessionStorage.getItem('walletAddress')) {
            const { solana } = window;
            if (solana && solana.isPhantom) {
                try {
                    const response = await solana.connect({ onlyIfTrusted: true });
                    walletAddress = response.publicKey.toString();
                    updateWalletUI(walletAddress);
                } catch (err) {
                    sessionStorage.removeItem('walletAddress');
                }
            }
        }
    };

    if (connectBtn) {
        connectBtn.addEventListener('click', connectWallet);
        window.addEventListener('load', checkConnection);
    }

    // Decode market function
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

    // Load leaderboard data
    const loadLeaderboard = async () => {
        if (!connection) {
            leaderboardContent.innerHTML = '<div class="error">Failed to connect to Solana network.</div>';
            return;
        }

        try {
            leaderboardContent.innerHTML = '<div class="loading-spinner">Loading Leaderboard Data...</div>';

            const PROGRAM_ID = "6d5P8J92SyZFc1Cz3EHJzjySTkjzxaJDwizfQQUzXNev";
            const accounts = await connection.getProgramAccounts(new solanaWeb3.PublicKey(PROGRAM_ID));

            // Group markets by creator
            const userStats = {};

            const now = Math.floor(Date.now() / 1000);
            const oneWeekAgo = now - (7 * 24 * 60 * 60);
            const oneMonthAgo = now - (30 * 24 * 60 * 60);

            for (const { pubkey, account } of accounts) {
                const market = decodeMarket(account.data);
                if (!market || !market.question) continue;

                const creator = market.creator;
                if (!userStats[creator]) {
                    userStats[creator] = {
                        address: creator,
                        marketsCreated: 0,
                        totalVolume: 0,
                        resolvedMarkets: 0,
                        winningMarkets: 0,
                        markets: [],
                        marketsThisWeek: 0,
                        marketsThisMonth: 0,
                        volumeThisWeek: 0,
                        volumeThisMonth: 0
                    };
                }

                const yesPool = market.yesPoolAmount.toNumber() / 1e9;
                const noPool = market.noPoolAmount.toNumber() / 1e9;
                const volume = yesPool + noPool;

                userStats[creator].marketsCreated++;
                userStats[creator].totalVolume += volume;
                userStats[creator].markets.push({
                    volume,
                    status: market.status,
                    createdAt: market.createdAt
                });

                if (market.status !== 0) {
                    userStats[creator].resolvedMarkets++;
                    // Simple win logic: market with more volume in winning side
                    const isWin = (market.status === 1 && yesPool > noPool) || 
                                  (market.status === 2 && noPool > yesPool);
                    if (isWin) {
                        userStats[creator].winningMarkets++;
                    }
                }

                // Time period calculations
                if (market.createdAt >= oneWeekAgo) {
                    userStats[creator].marketsThisWeek++;
                    userStats[creator].volumeThisWeek += volume;
                }
                if (market.createdAt >= oneMonthAgo) {
                    userStats[creator].marketsThisMonth++;
                    userStats[creator].volumeThisMonth += volume;
                }
            }

            // Convert to array and calculate additional stats
            allLeaderboardData = Object.values(userStats).map(user => {
                const winRate = user.resolvedMarkets > 0 
                    ? ((user.winningMarkets / user.resolvedMarkets) * 100).toFixed(1)
                    : 0;
                
                // Estimated PnL (simplified calculation)
                const estimatedPnL = user.totalVolume * 0.1 * (parseFloat(winRate) / 100);

                return {
                    ...user,
                    winRate: parseFloat(winRate),
                    estimatedPnL
                };
            });

            // Initial sort and render
            applyFiltersAndSort();

        } catch (err) {
            console.error("Error loading leaderboard:", err);
            leaderboardContent.innerHTML = `<div class="error">Failed to load leaderboard: ${err.message}</div>`;
        }
    };

    // Apply filters and sorting
    const applyFiltersAndSort = () => {
        // Filter by time period
        let data = [...allLeaderboardData];
        
        if (currentPeriod === 'week') {
            data = data.map(user => ({
                ...user,
                marketsCreated: user.marketsThisWeek,
                totalVolume: user.volumeThisWeek
            })).filter(user => user.marketsCreated > 0);
        } else if (currentPeriod === 'month') {
            data = data.map(user => ({
                ...user,
                marketsCreated: user.marketsThisMonth,
                totalVolume: user.volumeThisMonth
            })).filter(user => user.marketsCreated > 0);
        }

        // Filter by search
        if (searchInput && searchInput.value.trim()) {
            const searchTerm = searchInput.value.trim().toLowerCase();
            data = data.filter(user => 
                user.address.toLowerCase().includes(searchTerm)
            );
        }

        // Sort
        data.sort((a, b) => {
            let comparison = 0;
            
            switch (currentSort) {
                case 'volume':
                    comparison = a.totalVolume - b.totalVolume;
                    break;
                case 'markets':
                    comparison = a.marketsCreated - b.marketsCreated;
                    break;
                case 'winrate':
                    comparison = a.winRate - b.winRate;
                    break;
                case 'pnl':
                    comparison = a.estimatedPnL - b.estimatedPnL;
                    break;
                case 'rank':
                default:
                    // Rank by total volume as default
                    comparison = a.totalVolume - b.totalVolume;
                    break;
            }

            return currentDirection === 'desc' ? -comparison : comparison;
        });

        // Add rank
        data = data.map((user, index) => ({
            ...user,
            rank: index + 1
        }));

        filteredData = data;
        renderLeaderboard();
    };

    // Render leaderboard
    const renderLeaderboard = () => {
        if (filteredData.length === 0) {
            leaderboardContent.innerHTML = `
                <div class="empty-state">
                    <p>No users found matching your criteria.</p>
                </div>
            `;
            return;
        }

        const topThree = filteredData.slice(0, 3);
        const rest = filteredData.slice(3);

        let html = '';

        // Top 3 podium
        if (topThree.length > 0) {
            html += '<div class="podium-container">';
            
            // 2nd place
            if (topThree[1]) {
                html += `
                    <div class="podium-item second">
                        <div class="podium-rank">2</div>
                        <div class="podium-avatar">${getAvatar(topThree[1].address)}</div>
                        <div class="podium-info">
                            <div class="podium-address">${formatAddress(topThree[1].address)}</div>
                            <div class="podium-stats">
                                <div>${topThree[1].totalVolume.toFixed(2)} USDC</div>
                                <div>${topThree[1].marketsCreated} markets</div>
                            </div>
                        </div>
                    </div>
                `;
            }

            // 1st place
            if (topThree[0]) {
                html += `
                    <div class="podium-item first">
                        <div class="podium-crown">👑</div>
                        <div class="podium-rank">1</div>
                        <div class="podium-avatar">${getAvatar(topThree[0].address)}</div>
                        <div class="podium-info">
                            <div class="podium-address">${formatAddress(topThree[0].address)}</div>
                            <div class="podium-stats">
                                <div>${topThree[0].totalVolume.toFixed(2)} USDC</div>
                                <div>${topThree[0].marketsCreated} markets</div>
                            </div>
                        </div>
                    </div>
                `;
            }

            // 3rd place
            if (topThree[2]) {
                html += `
                    <div class="podium-item third">
                        <div class="podium-rank">3</div>
                        <div class="podium-avatar">${getAvatar(topThree[2].address)}</div>
                        <div class="podium-info">
                            <div class="podium-address">${formatAddress(topThree[2].address)}</div>
                            <div class="podium-stats">
                                <div>${topThree[2].totalVolume.toFixed(2)} USDC</div>
                                <div>${topThree[2].marketsCreated} markets</div>
                            </div>
                        </div>
                    </div>
                `;
            }

            html += '</div>';
        }

        // Rest of the leaderboard
        if (rest.length > 0) {
            html += '<div class="leaderboard-table">';
            html += '<div class="table-header">';
            html += '<div class="table-cell rank-col">RANK</div>';
            html += '<div class="table-cell address-col">ADDRESS</div>';
            html += '<div class="table-cell stat-col" data-label="Markets">MARKETS</div>';
            html += '<div class="table-cell stat-col" data-label="Volume">VOLUME</div>';
            html += '<div class="table-cell stat-col" data-label="Win Rate">WIN RATE</div>';
            html += '<div class="table-cell stat-col" data-label="Est. PnL">EST. PnL</div>';
            html += '</div>';

            rest.forEach((user, index) => {
                const isCurrentUser = walletAddress && user.address === walletAddress;
                const rank = user.rank;
                
                html += `
                    <div class="table-row ${isCurrentUser ? 'current-user' : ''}" data-rank="${rank}">
                        <div class="table-cell rank-col">
                            <span class="rank-number">${rank}</span>
                        </div>
                        <div class="table-cell address-col">
                            <div class="user-info">
                                <span class="user-avatar">${getAvatar(user.address)}</span>
                                <span class="user-address">${formatAddress(user.address)}</span>
                                ${isCurrentUser ? '<span class="you-badge">YOU</span>' : ''}
                            </div>
                        </div>
                        <div class="table-cell stat-col" data-label="Markets">${user.marketsCreated}</div>
                        <div class="table-cell stat-col" data-label="Volume">${user.totalVolume.toFixed(2)} USDC</div>
                        <div class="table-cell stat-col ${user.winRate >= 50 ? 'positive' : user.winRate > 0 ? 'negative' : ''}" data-label="Win Rate">
                            ${user.winRate > 0 ? user.winRate + '%' : 'N/A'}
                        </div>
                        <div class="table-cell stat-col ${user.estimatedPnL >= 0 ? 'positive' : 'negative'}" data-label="Est. PnL">
                            ${user.estimatedPnL >= 0 ? '+' : ''}${user.estimatedPnL.toFixed(2)} USDC
                        </div>
                    </div>
                `;
            });

            html += '</div>';
        }

        leaderboardContent.innerHTML = html;
    };

    // Helper functions
    const formatAddress = (address) => {
        return address.slice(0, 4) + '...' + address.slice(-4);
    };

    const getAvatar = (address) => {
        // Generate a simple avatar based on address
        const colors = ['🟢', '🔵', '🟣', '🟡', '🟠', '🔴'];
        const index = parseInt(address.slice(0, 2), 16) % colors.length;
        return colors[index];
    };

    // Event listeners
    if (searchInput) {
        searchInput.addEventListener('input', applyFiltersAndSort);
    }

    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            currentSort = e.target.value;
            applyFiltersAndSort();
        });
    }

    if (sortDirectionBtn) {
        sortDirectionBtn.addEventListener('click', () => {
            currentDirection = currentDirection === 'desc' ? 'asc' : 'desc';
            sortDirectionBtn.setAttribute('data-direction', currentDirection);
            sortDirectionBtn.querySelector('span').textContent = currentDirection === 'desc' ? '↓' : '↑';
            applyFiltersAndSort();
        });
    }

    periodBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            periodBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentPeriod = btn.getAttribute('data-period');
            applyFiltersAndSort();
        });
    });

    // Initial load
    loadLeaderboard();
});

