/**
 * 有声小说API模块 - 支持多源切换
 */

const AudiobookAPI = {
    // 当前使用的API源
    currentSource: 'lanren',

    // API源配置
    sources: {
        lanren: {
            name: '懒人听书',
            baseUrl: 'https://api-library.lrts.me',
            // 由于懒人听书API可能有跨域限制，使用代理或直接CORS
            // 这里使用开放接口，实际使用中可能需要配置代理
            searchUrl: '/search',
            bookDetailUrl: '/book',
            chapterUrl: '/chapter',
            recommendUrl: '/recommend',
            categoryUrl: '/category'
        },
        ximalaya: {
            name: '喜马拉雅',
            baseUrl: 'https://www.ximalaya.com',
            // 喜马拉雅接口暂未配置
            searchUrl: '',
            bookDetailUrl: '',
            chapterUrl: '',
            recommendUrl: '',
            categoryUrl: ''
        }
    },

    /**
     * 切换API源
     */
    setSource(source) {
        if (this.sources[source]) {
            this.currentSource = source;
            console.log(`已切换到: ${this.sources[source].name}`);
        }
    },

    /**
     * 获取头部信息
     */
    getHeaders() {
        return {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };
    },

    /**
     * 通用请求方法
     */
    async request(url, options = {}) {
        try {
            const response = await fetch(url, {
                ...options,
                headers: {
                    ...this.getHeaders(),
                    ...options.headers
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('API请求失败:', error);
            throw error;
        }
    },

    /**
     * 搜索书籍
     * @param {string} keyword - 搜索关键词
     * @param {number} page - 页码
     * @param {number} size - 每页数量
     */
    async searchBooks(keyword, page = 1, size = 20) {
        // 使用懒人听书开放平台的搜索接口
        // 注意：实际使用中可能需要通过后端代理来调用
        const url = `https://open.lrts.me/open/book/search?keyword=${encodeURIComponent(keyword)}&page=${page}&size=${size}`;

        try {
            const data = await this.request(url);
            return this.formatSearchResult(data);
        } catch (error) {
            // 如果懒人接口失败，返回模拟数据用于演示
            console.log('使用模拟搜索数据');
            return this.getMockSearchResult(keyword);
        }
    },

    /**
     * 获取分类下的书籍
     * @param {number} typeId - 分类ID (0=全部)
     * @param {number} page - 页码
     * @param {number} size - 每页数量
     */
    async getBooksByCategory(typeId = 0, page = 1, size = 20) {
        const url = `https://open.lrts.me/open/book/list?typeId=${typeId}&page=${page}&size=${size}&feeType=0`;

        try {
            const data = await this.request(url);
            return this.formatBookList(data);
        } catch (error) {
            console.log('使用模拟分类数据');
            return this.getMockBookList(typeId);
        }
    },

    /**
     * 获取书籍详情
     * @param {number|string} bookId - 书籍ID
     */
    async getBookDetail(bookId) {
        const url = `https://open.lrts.me/open/book/${bookId}`;

        try {
            const data = await this.request(url);
            return this.formatBookDetail(data);
        } catch (error) {
            console.log('使用模拟书籍详情');
            return this.getMockBookDetail(bookId);
        }
    },

    /**
     * 获取书籍章节列表
     * @param {number|string} bookId - 书籍ID
     */
    async getBookChapters(bookId) {
        const url = `https://open.lrts.me/open/book/${bookId}/chapters`;

        try {
            const data = await this.request(url);
            return this.formatChapterList(data);
        } catch (error) {
            console.log('使用模拟章节数据');
            return this.getMockChapters(bookId);
        }
    },

    /**
     * 获取章节音频URL
     * @param {number|string} chapterId - 章节ID
     */
    async getChapterAudio(chapterId) {
        const url = `https://open.lrts.me/open/chapter/${chapterId}/play`;

        try {
            const data = await this.request(url);
            return data.playUrl || data.url || '';
        } catch (error) {
            console.log('使用模拟音频');
            return this.getMockAudioUrl(chapterId);
        }
    },

    /**
     * 获取热门推荐
     */
    async getHotRecommend() {
        try {
            const data = await this.getBooksByCategory(0, 1, 12);
            return data;
        } catch (error) {
            return this.getMockBookList(0);
        }
    },

    /**
     * 获取最新上架
     */
    async getNewBooks() {
        try {
            const data = await this.getBooksByCategory(0, 1, 12);
            return data;
        } catch (error) {
            return this.getMockBookList(0);
        }
    },

    // ==================== 数据格式化 ====================

    /**
     * 格式化搜索结果
     */
    formatSearchResult(data) {
        if (!data || !data.data) return [];

        return data.data.map(item => ({
            id: item.bookId || item.id,
            title: item.bookName || item.title,
            author: item.author || '未知',
            cover: item.coverUrl || item.cover || this.generateCover(item.bookId),
            description: item.description || item.intro || '',
            category: item.categoryName || item.category || '其他',
            tag: item.tag || '',
            isFinished: item.isFinished === 1 || item.isFinished === '1',
            playCount: item.playCount || 0
        }));
    },

    /**
     * 格式化书籍列表
     */
    formatBookList(data) {
        if (!data || !data.data) return [];

        return data.data.map(item => ({
            id: item.bookId || item.id,
            title: item.bookName || item.title,
            author: item.author || '未知',
            cover: item.coverUrl || item.cover || this.generateCover(item.bookId),
            category: item.categoryName || item.category || '其他',
            isFinished: item.isFinished === 1 || item.isFinished === '1',
            playCount: item.playCount || 0
        }));
    },

    /**
     * 格式化书籍详情
     */
    formatBookDetail(data) {
        return {
            id: data.bookId || data.id,
            title: data.bookName || data.title,
            author: data.author || '未知',
            cover: data.coverUrl || data.cover || this.generateCover(data.bookId),
            description: data.description || data.intro || '',
            category: data.categoryName || data.category || '其他',
            tags: data.tags || [],
            isFinished: data.isFinished === 1,
            playCount: data.playCount || 0,
            updateTime: data.updateTime || '',
            chapterCount: data.chapterCount || 0,
            score: data.score || 0
        };
    },

    /**
     * 格式化章节列表
     */
    formatChapterList(data) {
        if (!data || !data.data) return [];

        return data.data.map((item, index) => ({
            id: item.chapterId || item.id,
            title: item.chapterName || item.title,
            index: index + 1,
            duration: item.duration || 0,
            size: item.size || 0,
            isVip: item.isVip === 1 || item.isVip === '1'
        }));
    },

    /**
     * 生成封面URL
     */
    generateCover(id) {
        // 使用placeholder图片服务生成封面
        const colors = ['667eea', '764ba2', 'f093fb', 'f5576c', '4facfe', '00f2fe', '43e97b', '38f9d7'];
        const color = colors[(id || Math.random() * 1000) % colors.length];
        return `https://via.placeholder.com/300x400/${color}/ffffff?text=听书`;
    },

    // ==================== 模拟数据 ====================

    /**
     * 获取模拟搜索结果
     */
    getMockSearchResult(keyword) {
        const books = this.getMockBooks();
        return books.filter(book =>
            book.title.includes(keyword) ||
            book.author.includes(keyword)
        );
    },

    /**
     * 获取模拟书籍列表
     */
    getMockBookList(typeId) {
        const books = this.getMockBooks();
        if (typeId === 0) return books;
        return books.filter(book => book.categoryId === typeId);
    },

    /**
     * 获取模拟书籍详情
     */
    getMockBookDetail(bookId) {
        const books = this.getMockBooks();
        const book = books.find(b => b.id == bookId) || books[0];

        return {
            ...book,
            description: `${book.title}是一部精彩的${book.category}有声小说，由著名主播演播。故事跌宕起伏，人物刻画入微，深受听众喜爱。整部作品节奏明快，声音制作精良，是您通勤路上、休闲时光的理想陪伴选择。`,
            tags: [book.category, '精品', '推荐'],
            chapterCount: Math.floor(Math.random() * 200) + 50,
            score: (Math.random() * 2 + 8).toFixed(1),
            updateTime: '2024-01-15'
        };
    },

    /**
     * 获取模拟章节列表
     */
    getMockChapters(bookId) {
        const chapters = [];
        const count = Math.floor(Math.random() * 100) + 20;

        for (let i = 1; i <= count; i++) {
            chapters.push({
                id: `${bookId}_${i}`,
                title: `第${i}章`,
                index: i,
                duration: Math.floor(Math.random() * 600) + 180,
                size: Math.floor(Math.random() * 5000) + 1000,
                isVip: i > 10 && Math.random() > 0.7
            });
        }

        return chapters;
    },

    /**
     * 获取模拟音频URL
     * 这里返回示例音频，实际使用时替换为真实URL
     */
    getMockAudioUrl(chapterId) {
        // 返回示例音频（百度TTS或其他免费音频）
        return 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';
    },

    /**
     * 获取模拟书籍数据
     */
    getMockBooks() {
        const categories = ['玄幻奇幻', '武侠仙侠', '都市言情', '穿越架空', '悬疑推理'];
        const titles = [
            '元尊', '伏天氏', '全职法师', '万族之劫', '大奉打更人',
            '一剑独尊', '剑来', '雪中悍刀行', '凡人修仙传', '仙逆',
            '最强弃少', '都市奇门医圣', '美女总裁的最强高手', '特种兵在都市',
            '庆余年', '明朝败家子', '赘婿', '神级龙卫', '乡村神医',
            '总裁爹地超给力', '霸道总裁宠上天', '娇妻太甜吻安薄总'
        ];

        const authors = [
            '天蚕土豆', '我吃西红柿', '辰东', '耳根', '忘语',
            '烽火戏诸侯', '梦入神机', '鹅是老周', '横行霸道', '覆手',
            '乘风破浪', '善良蜜蜂', '梁七少', 'MSEM', '争斤论两花花帽'
        ];

        const books = [];
        for (let i = 1; i <= 24; i++) {
            books.push({
                id: i,
                title: titles[(i - 1) % titles.length],
                author: authors[(i - 1) % authors.length],
                cover: `https://picsum.photos/seed/book${i}/300/400`,
                category: categories[(i - 1) % categories.length],
                categoryId: (i - 1) % 5 + 1,
                isFinished: Math.random() > 0.3,
                playCount: Math.floor(Math.random() * 10000000)
            });
        }

        return books;
    }
};

// 导出API模块
window.AudiobookAPI = AudiobookAPI;
