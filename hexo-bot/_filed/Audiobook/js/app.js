/**
 * 有声小说应用主逻辑
 */

const AudiobookApp = {
    // 当前视图
    currentView: 'home',

    // 当前数据
    data: {
        hotBooks: [],
        newBooks: [],
        searchResults: [],
        currentBook: null,
        currentChapters: []
    },

    // 分页
    page: {
        search: 1,
        category: 1
    },

    // 初始化
    init() {
        console.log('开始初始化有声小说应用...');

        // 等待DOM加载完成
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.start());
        } else {
            this.start();
        }
    },

    // 启动应用
    async start() {
        // 初始化播放器
        AudiobookPlayer.init();

        // 绑定事件
        this.bindEvents();

        // 加载初始数据
        await this.loadInitialData();

        console.log('有声小说应用初始化完成');
    },

    // 绑定事件
    bindEvents() {
        // 搜索
        const searchInput = document.getElementById('searchInput');
        const searchBtn = document.getElementById('searchBtn');

        if (searchInput) {
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.handleSearch();
            });
        }

        if (searchBtn) {
            searchBtn.addEventListener('click', () => this.handleSearch());
        }

        // 分类切换
        const categoryList = document.getElementById('categoryList');
        if (categoryList) {
            categoryList.addEventListener('click', (e) => {
                const li = e.target.closest('li');
                if (li) {
                    const typeId = li.dataset.type;
                    this.handleCategoryChange(typeId, li);
                }
            });
        }

        // 导航按钮
        const toHomeBtn = document.getElementById('toHomeBtn');
        const historyBtn = document.getElementById('historyBtn');

        if (toHomeBtn) toHomeBtn.addEventListener('click', () => this.showView('home'));
        if (historyBtn) historyBtn.addEventListener('click', () => this.showView('history'));

        // 播放器控制
        this.bindPlayerControls();

        // 章节列表
        this.bindChapterEvents();

        // 进度条点击
        this.bindProgressBar();

        // 音量控制
        this.bindVolumeControl();

        // 倍速控制
        this.bindSpeedControl();

        // 播放历史点击
        this.bindRecentList();

        // 源切换
        const sourceSelect = document.getElementById('sourceSelect');
        if (sourceSelect) {
            sourceSelect.addEventListener('change', (e) => {
                AudiobookAPI.setSource(e.target.value);
                AudiobookPlayer.showToast(`已切换到${AudiobookAPI.sources[e.target.value].name}`, 'success');
            });
        }
    },

    // 绑定播放器控制事件
    bindPlayerControls() {
        const playBtn = document.getElementById('playBtn');
        const prevBtn = document.getElementById('prevBtn');
        const nextBtn = document.getElementById('nextBtn');
        const favoriteBtn = document.getElementById('favoriteBtn');

        if (playBtn) playBtn.addEventListener('click', () => AudiobookPlayer.togglePlay());
        if (prevBtn) prevBtn.addEventListener('click', () => AudiobookPlayer.playPrev());
        if (nextBtn) nextBtn.addEventListener('click', () => AudiobookPlayer.playNext());
        if (favoriteBtn) favoriteBtn.addEventListener('click', () => AudiobookPlayer.toggleFavorite());
    },

    // 绑定章节相关事件
    bindChapterEvents() {
        const listBtn = document.getElementById('listBtn');
        const closeChapterBtn = document.getElementById('closeChapterBtn');
        const chapterPopup = document.getElementById('chapterPopup');

        if (listBtn) {
            listBtn.addEventListener('click', () => {
                chapterPopup.classList.toggle('show');
            });
        }

        if (closeChapterBtn) {
            closeChapterBtn.addEventListener('click', () => {
                chapterPopup.classList.remove('show');
            });
        }

        // 点击外部关闭
        document.addEventListener('click', (e) => {
            if (chapterPopup && !chapterPopup.contains(e.target) && e.target !== listBtn) {
                chapterPopup.classList.remove('show');
            }
        });

        // 章节列表点击
        const chapterList = document.getElementById('chapterList');
        if (chapterList) {
            chapterList.addEventListener('click', (e) => {
                const li = e.target.closest('li');
                if (li) {
                    const index = parseInt(li.dataset.index);
                    this.playChapter(index);
                    chapterPopup.classList.remove('show');
                }
            });
        }
    },

    // 绑定进度条事件
    bindProgressBar() {
        const progressBar = document.getElementById('progressBar');
        if (progressBar) {
            progressBar.addEventListener('click', (e) => {
                const rect = progressBar.getBoundingClientRect();
                const percent = (e.clientX - rect.left) / rect.width;
                AudiobookPlayer.seekToPercent(percent);
            });
        }
    },

    // 绑定音量控制
    bindVolumeControl() {
        const volumeBtn = document.getElementById('volumeBtn');
        const volumeBar = document.getElementById('volumeBar');

        if (volumeBtn) {
            volumeBtn.addEventListener('click', () => AudiobookPlayer.toggleMute());
        }

        if (volumeBar) {
            volumeBar.addEventListener('click', (e) => {
                const rect = volumeBar.getBoundingClientRect();
                const volume = (e.clientX - rect.left) / rect.width;
                AudiobookPlayer.setVolume(volume);
            });
        }
    },

    // 绑定倍速控制
    bindSpeedControl() {
        const speedBtn = document.getElementById('speedBtn');
        const speedMenu = document.getElementById('speedMenu');

        if (speedBtn && speedMenu) {
            speedBtn.addEventListener('click', () => {
                speedMenu.classList.toggle('show');
            });

            speedMenu.addEventListener('click', (e) => {
                const span = e.target.closest('span');
                if (span) {
                    const speed = parseFloat(span.dataset.speed);
                    AudiobookPlayer.setPlaybackRate(speed);
                    speedMenu.classList.remove('show');
                }
            });

            // 外部点击关闭
            document.addEventListener('click', (e) => {
                if (!speedBtn.contains(e.target) && !speedMenu.contains(e.target)) {
                    speedMenu.classList.remove('show');
                }
            });
        }
    },

    // 绑定最近播放列表
    bindRecentList() {
        const recentList = document.getElementById('recentList');
        if (recentList) {
            recentList.addEventListener('click', async (e) => {
                const li = e.target.closest('li');
                if (li && li.dataset.bookId) {
                    const bookId = li.dataset.bookId;
                    await this.loadAndPlayBook(bookId);
                }
            });
        }
    },

    // ==================== 数据加载 ====================

    // 加载初始数据
    async loadInitialData() {
        try {
            // 并行加载热门和最新书籍
            await Promise.all([
                this.loadHotBooks(),
                this.loadNewBooks()
            ]);
        } catch (error) {
            console.error('加载初始数据失败:', error);
            this.showError('数据加载失败，请刷新重试');
        }
    },

    // 加载热门书籍
    async loadHotBooks() {
        const container = document.getElementById('hotBooks');
        if (!container) return;

        try {
            const books = await AudiobookAPI.getHotRecommend();
            this.data.hotBooks = books;
            this.renderBookGrid(container, books);
        } catch (error) {
            container.innerHTML = '<div class="empty-tip"><i class="fas fa-exclamation-triangle"></i> 加载失败</div>';
        }
    },

    // 加载最新书籍
    async loadNewBooks() {
        const container = document.getElementById('newBooks');
        if (!container) return;

        try {
            const books = await AudiobookAPI.getNewBooks();
            this.data.newBooks = books;
            this.renderBookGrid(container, books);
        } catch (error) {
            container.innerHTML = '<div class="empty-tip"><i class="fas fa-exclamation-triangle"></i> 加载失败</div>';
        }
    },

    // 加载书籍详情
    async loadBookDetail(bookId) {
        try {
            const [book, chapters] = await Promise.all([
                AudiobookAPI.getBookDetail(bookId),
                AudiobookAPI.getBookChapters(bookId)
            ]);

            this.data.currentBook = book;
            this.data.currentChapters = chapters;

            this.renderBookDetail(book, chapters);
            this.showView('bookDetail');
        } catch (error) {
            console.error('加载书籍详情失败:', error);
            AudiobookPlayer.showToast('加载失败，请重试', 'error');
        }
    },

    // 加载并播放书籍
    async loadAndPlayBook(bookId) {
        try {
            const [book, chapters] = await Promise.all([
                AudiobookAPI.getBookDetail(bookId),
                AudiobookAPI.getBookChapters(bookId)
            ]);

            this.data.currentBook = book;
            this.data.currentChapters = chapters;

            // 设置章节列表到播放器
            AudiobookPlayer.setChapterList(chapters);

            // 如果有历史记录，从历史记录的章节开始播放
            const history = AudiobookPlayer.history.find(h => h.bookId == bookId);
            if (history) {
                const chapter = chapters.find(c => c.index === history.chapterIndex);
                if (chapter) {
                    await AudiobookPlayer.play(chapter, book);
                    return;
                }
            }

            // 否则从第一章开始
            if (chapters.length > 0) {
                await AudiobookPlayer.play(chapters[0], book);
            }
        } catch (error) {
            console.error('加载播放失败:', error);
            AudiobookPlayer.showToast('加载失败，请重试', 'error');
        }
    },

    // ==================== 视图切换 ====================

    // 显示指定视图
    showView(viewName) {
        // 隐藏所有视图
        document.querySelectorAll('.view').forEach(view => {
            view.style.display = 'none';
        });

        // 显示目标视图
        const targetView = document.getElementById(`${viewName}View`);
        if (targetView) {
            targetView.style.display = 'block';
        }

        this.currentView = viewName;

        // 更新按钮状态
        document.querySelectorAll('.btn-link').forEach(btn => {
            btn.classList.remove('active');
        });

        // 根据视图更新内容
        if (viewName === 'history') {
            this.renderHistoryView();
        }
    },

    // ==================== 渲染方法 ====================

    // 渲染书籍网格
    renderBookGrid(container, books) {
        if (!books || books.length === 0) {
            container.innerHTML = '<div class="empty-tip"><i class="fas fa-book"></i> 暂无数据</div>';
            return;
        }

        const html = books.map(book => `
            <div class="book-card" data-book-id="${book.id}">
                <img class="book-cover" src="${book.cover}" alt="${book.title}"
                     onerror="this.src='${book.fallbackCover || AudiobookAPI.generateCover(book.id, book.title)}'">
                <div class="book-info">
                    <div class="book-title" title="${book.title}">${book.title}</div>
                    <div class="book-author" title="${book.author}">${book.author}</div>
                    <div class="book-tags">
                        <span class="book-tag">${book.category}</span>
                        ${book.isFinished ? '<span class="book-tag" style="color: #48bb78;">已完结</span>' : ''}
                    </div>
                </div>
            </div>
        `).join('');

        container.innerHTML = html;

        // 绑定点击事件
        container.querySelectorAll('.book-card').forEach(card => {
            card.addEventListener('click', () => {
                const bookId = card.dataset.bookId;
                this.loadBookDetail(bookId);
            });
        });
    },

    // 渲染书籍详情
    renderBookDetail(book, chapters) {
        const container = document.getElementById('bookDetail');
        if (!container) return;

        const fallbackCover = book.fallbackCover || AudiobookAPI.generateCover(book.id, book.title);

        const html = `
            <div class="book-detail-header">
                <img class="book-detail-cover" src="${book.cover}" alt="${book.title}"
                     onerror="this.src='${fallbackCover}'">
                <div class="book-detail-info">
                    <h1 class="book-detail-title">${book.title}</h1>
                    <div class="book-detail-meta">
                        <span><i class="fas fa-user"></i> ${book.author}</span>
                        <span><i class="fas fa-folder"></i> ${book.category}</span>
                        <span><i class="fas fa-headphones"></i> ${this.formatPlayCount(book.playCount)}</span>
                        ${book.score ? `<span><i class="fas fa-star"></i> ${book.score}</span>` : ''}
                    </div>
                    <div class="book-detail-tags">
                        ${(book.tags || []).map(tag => `<span class="book-tag">${tag}</span>`).join('')}
                        ${book.isFinished ? '<span class="book-tag" style="color: #48bb78;">已完结</span>' : '<span class="book-tag" style="color: #f6ad55;">连载中</span>'}
                    </div>
                    <p class="book-detail-desc">${book.description || '暂无简介'}</p>
                    <div class="book-detail-actions">
                        <button class="btn-primary" id="playAllBtn">
                            <i class="fas fa-play"></i> 播放全部
                        </button>
                        <button class="btn-secondary" id="addToFavBtn">
                            <i class="fas fa-heart"></i> 收藏
                        </button>
                    </div>
                </div>
            </div>
            <div class="book-chapters">
                <h3><i class="fas fa-list"></i> 全部章节 (${chapters.length}章)</h3>
                <div class="chapter-grid">
                    ${chapters.map(ch => `
                        <div class="chapter-item" data-index="${ch.index}">
                            <i class="fas fa-play"></i>
                            <span>${ch.title}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        container.innerHTML = html;

        // 绑定播放全部按钮
        const playAllBtn = document.getElementById('playAllBtn');
        if (playAllBtn) {
            playAllBtn.addEventListener('click', () => this.playChapter(1));
        }

        // 绑定收藏按钮
        const addToFavBtn = document.getElementById('addToFavBtn');
        if (addToFavBtn) {
            addToFavBtn.addEventListener('click', () => {
                // 直接添加到收藏
                const exists = AudiobookPlayer.favorites.some(f => f.bookId == book.id);
                if (exists) {
                    AudiobookPlayer.showToast('已在收藏夹中', 'info');
                } else {
                    AudiobookPlayer.favorites.push({
                        bookId: book.id,
                        bookTitle: book.title,
                        bookAuthor: book.author,
                        cover: book.cover,
                        fallbackCover: book.fallbackCover,
                        addTime: Date.now()
                    });
                    AudiobookPlayer.saveLocalData();
                    AudiobookPlayer.showToast('已添加收藏', 'success');
                    addToFavBtn.innerHTML = '<i class="fas fa-check"></i> 已收藏';
                }
            });
        }

        // 绑定章节点击
        container.querySelectorAll('.chapter-item').forEach(item => {
            item.addEventListener('click', () => {
                const index = parseInt(item.dataset.index);
                this.playChapter(index);
            });
        });
    },

    // 渲染历史记录视图
    renderHistoryView() {
        const container = document.getElementById('historyBooks');
        const history = AudiobookPlayer.history;

        if (!container) return;

        if (history.length === 0) {
            container.innerHTML = '<div class="empty-tip"><i class="fas fa-inbox"></i> 暂无播放记录</div>';
            return;
        }

        // 按书籍分组
        const booksMap = new Map();
        history.forEach(record => {
            if (!booksMap.has(record.bookId)) {
                booksMap.set(record.bookId, {
                    id: record.bookId,
                    title: record.bookTitle,
                    author: record.bookAuthor,
                    cover: record.cover,
                    lastChapter: record.chapterTitle,
                    lastPlayTime: record.playTime
                });
            }
        });

        const books = Array.from(booksMap.values());
        this.renderBookGrid(container, books);
    },

    // ==================== 事件处理 ====================

    // 处理搜索
    async handleSearch() {
        const searchInput = document.getElementById('searchInput');
        const keyword = searchInput.value.trim();

        if (!keyword) {
            AudiobookPlayer.showToast('请输入搜索关键词', 'error');
            return;
        }

        const container = document.getElementById('searchResults');
        const countEl = document.getElementById('searchCount');
        container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> 搜索中...</div>';

        try {
            const results = await AudiobookAPI.searchBooks(keyword);
            this.data.searchResults = results;

            if (countEl) {
                countEl.textContent = `找到 ${results.length} 个结果`;
            }

            if (results.length === 0) {
                container.innerHTML = '<div class="empty-tip"><i class="fas fa-search"></i> 未找到相关书籍</div>';
            } else {
                this.renderBookGrid(container, results);
            }

            this.showView('search');
        } catch (error) {
            console.error('搜索失败:', error);
            container.innerHTML = '<div class="empty-tip"><i class="fas fa-exclamation-triangle"></i> 搜索失败，请重试</div>';
        }
    },

    // 处理分类切换
    async handleCategoryChange(typeId, element) {
        // 更新选中状态
        document.querySelectorAll('#categoryList li').forEach(li => {
            li.classList.remove('active');
        });
        element.classList.add('active');

        // 加载分类数据
        const container = document.getElementById('hotBooks');
        if (container) {
            container.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> 加载中...</div>';

            try {
                const books = await AudiobookAPI.getBooksByCategory(parseInt(typeId));
                this.renderBookGrid(container, books);
            } catch (error) {
                container.innerHTML = '<div class="empty-tip"><i class="fas fa-exclamation-triangle"></i> 加载失败</div>';
            }
        }
    },

    // 播放指定章节
    async playChapter(index) {
        if (!this.data.currentBook || !this.data.currentChapters.length) {
            AudiobookPlayer.showToast('请先选择书籍', 'error');
            return;
        }

        const chapter = this.data.currentChapters.find(c => c.index === index);
        if (chapter) {
            await AudiobookPlayer.play(chapter, this.data.currentBook);
        }
    },

    // ==================== 工具方法 ====================

    // 格式化播放次数
    formatPlayCount(count) {
        if (!count) return '0';
        if (count >= 100000000) {
            return (count / 100000000).toFixed(1) + '亿';
        }
        if (count >= 10000) {
            return (count / 10000).toFixed(1) + '万';
        }
        return count.toString();
    },

    // 显示错误
    showError(message) {
        const containers = ['hotBooks', 'newBooks'];
        containers.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.innerHTML = `<div class="empty-tip"><i class="fas fa-exclamation-triangle"></i> ${message}</div>`;
            }
        });
    }
};

// 启动应用
AudiobookApp.init();
