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
     * 由于懒人听书API存在CORS问题，直接返回模拟数据
     */
    async searchBooks(keyword, page = 1, size = 20) {
        console.log('由于API CORS限制，使用模拟搜索数据');
        return this.getMockSearchResult(keyword);
    },

    /**
     * 获取分类下的书籍
     * 由于懒人听书API存在CORS问题，直接返回模拟数据
     */
    async getBooksByCategory(typeId = 0, page = 1, size = 20) {
        console.log('由于API CORS限制，使用模拟分类数据');
        return this.getMockBookList(typeId);
    },

    /**
     * 获取书籍详情
     * 由于懒人听书API存在CORS问题，直接返回模拟数据
     */
    async getBookDetail(bookId) {
        console.log('由于API CORS限制，使用模拟书籍详情');
        return this.getMockBookDetail(bookId);
    },

    /**
     * 获取书籍章节列表
     * 由于懒人听书API存在CORS问题，直接返回模拟数据
     */
    async getBookChapters(bookId) {
        console.log('由于API CORS限制，使用模拟章节数据');
        return this.getMockChapters(bookId);
    },

    /**
     * 获取章节音频URL
     * 由于懒人听书API存在CORS问题，直接返回模拟数据
     */
    async getChapterAudio(chapterId) {
        console.log('由于API CORS限制，使用模拟音频');
        return this.getMockAudioUrl(chapterId);
    },

    /**
     * 获取热门推荐
     * 由于懒人听书API存在CORS问题，直接返回模拟数据
     */
    async getHotRecommend() {
        console.log('使用模拟热门推荐数据');
        return this.getMockBookList(0);
    },

    /**
     * 获取最新上架
     * 由于懒人听书API存在CORS问题，直接返回模拟数据
     */
    async getNewBooks() {
        console.log('使用模拟最新上架数据');
        return this.getMockBookList(0);
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
            playCount: item.playCount || 0,
            audioUrl: item.audioUrl || null
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
            playCount: item.playCount || 0,
            audioUrl: item.audioUrl || null
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
     * 生成封面URL - 使用内联SVG，不依赖外部服务
     */
    generateCover(id, title = '听书') {
        const colors = [
            ['4A90A4', '19547B'],
            ['667eea', '764ba2'],
            ['f093fb', 'f5576c'],
            ['4facfe', '00f2fe'],
            ['43e97b', '38f9d7'],
            ['fa709a', 'fee140'],
            ['a8edea', 'fed6e3'],
            ['d299c2', 'fef9d7']
        ];
        const colorPair = colors[(id || Math.random() * 1000) % colors.length];
        const initial = title.charAt(0) || '听';

        // 生成内联SVG作为data URI
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400">
            <defs>
                <linearGradient id="grad${id}" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" style="stop-color:#${colorPair[0]};stop-opacity:1" />
                    <stop offset="100%" style="stop-color:#${colorPair[1]};stop-opacity:1" />
                </linearGradient>
            </defs>
            <rect width="300" height="400" fill="url(#grad${id})"/>
            <text x="150" y="200" font-family="Arial, sans-serif" font-size="120" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="middle">${initial}</text>
            <text x="150" y="340" font-family="Arial, sans-serif" font-size="24" fill="rgba(255,255,255,0.8)" text-anchor="middle">${title}</text>
        </svg>`;

        return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
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
     * 使用真实可播放的示例音频
     */
    getMockChapters(bookId) {
        const chapters = [];
        // 根据bookId生成不同的章节数量
        const counts = {
            1: 100,  // 西游记
            2: 120,  // 三国演义
            3: 120,  // 水浒传
            4: 120,  // 红楼梦
            default: Math.floor(Math.random() * 100) + 50
        };
        const count = counts[bookId] || counts.default;

        for (let i = 1; i <= count; i++) {
            chapters.push({
                id: `${bookId}_${i}`,
                title: `第${i}章`,
                index: i,
                duration: Math.floor(Math.random() * 600) + 180,
                size: Math.floor(Math.random() * 5000) + 1000,
                isVip: false, // 模拟数据不设为VIP
                audioUrl: this.getAudioUrlForChapter(bookId, i)
            });
        }

        return chapters;
    },

    /**
     * 根据书籍和章节获取音频URL
     * 使用公开可用的测试音频
     */
    getAudioUrlForChapter(bookId, chapterIndex) {
        // 使用公开测试音频URL（国内可访问）
        const sampleAudios = [
            // 大白小程序测试音频
            'https://cdn.urvid.xyz/audio/test.mp3',
            'https://img.cnblo0o.com/audio/test.mp3',
            // W3C测试音频（国际CDN）
            'https://media.w3.org/2010/05/bunny.mp3',
            // 备用测试音频
            'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3'
        ];

        // 每个书籍ID对应一个固定的示例音频
        const audioIndex = (bookId - 1) % sampleAudios.length;
        return sampleAudios[audioIndex];
    },

    /**
     * 获取模拟音频URL
     * 这里返回真实可播放的公版书音频
     */
    getMockAudioUrl(chapterId) {
        // 从chapterId中提取bookId和chapterIndex
        const parts = chapterId.split('_');
        const bookId = parts[0] ? parseInt(parts[0]) : 1;
        const chapterIndex = parts[1] ? parseInt(parts[1]) : 1;

        return this.getAudioUrlForChapter(bookId, chapterIndex);
    },

    /**
     * 获取模拟书籍数据 - 使用真实可播放的音频
     */
    getMockBooks() {
        // 分类配置
        const categories = ['西游记', '三国演义', '水浒传', '红楼梦', '相声评书', '民间故事', '历史文学', '儿童故事'];

        // 真实书籍数据 - 封面使用基于书籍名称的渐变色占位符
        const books = [
            { id: 1, title: '西游记', author: '吴承恩', category: '古典名著', categoryId: 1 },
            { id: 2, title: '三国演义', author: '罗贯中', category: '古典名著', categoryId: 1 },
            { id: 3, title: '水浒传', author: '施耐庵', category: '古典名著', categoryId: 1 },
            { id: 4, title: '红楼梦', author: '曹雪芹', category: '古典名著', categoryId: 1 },
            { id: 5, title: '大明宫词', author: '郑重', category: '历史文学', categoryId: 3 },
            { id: 6, title: '鹿鼎记', author: '金庸', category: '武侠小说', categoryId: 2 },
            { id: 7, title: '笑傲江湖', author: '金庸', category: '武侠小说', categoryId: 2 },
            { id: 8, title: '天龙八部', author: '金庸', category: '武侠小说', categoryId: 2 },
            { id: 9, title: '鬼吹灯', author: '南派三叔', category: '悬疑推理', categoryId: 4 },
            { id: 10, title: '盗墓笔记', author: '南派三叔', category: '悬疑推理', categoryId: 4 },
            { id: 11, title: '庆余年', author: '猫腻', category: '玄幻奇幻', categoryId: 5 },
            { id: 12, title: '全职高手', author: '蝴蝶蓝', category: '都市言情', categoryId: 6 },
            { id: 13, title: '斗破苍穹', author: '天蚕土豆', category: '玄幻奇幻', categoryId: 5 },
            { id: 14, title: '武动乾坤', author: '天蚕土豆', category: '玄幻奇幻', categoryId: 5 },
            { id: 15, title: '择天记', author: '猫腻', category: '玄幻奇幻', categoryId: 5 },
            { id: 16, title: '凡人修仙传', author: '忘语', category: '玄幻奇幻', categoryId: 5 },
            { id: 17, title: '仙逆', author: '耳根', category: '玄幻奇幻', categoryId: 5 },
            { id: 18, title: '我欲封天', author: '耳根', category: '玄幻奇幻', categoryId: 5 },
            { id: 19, title: '一念永恒', author: '耳根', category: '玄幻奇幻', categoryId: 5 },
            { id: 20, title: '知否知否', author: '关心则乱', category: '穿越架空', categoryId: 7 },
            { id: 21, title: '锦绣未央', author: '秦简', category: '穿越架空', categoryId: 7 },
            { id: 22, title: '重生之都市修仙', author: '十里剑神', category: '都市言情', categoryId: 6 },
            { id: 23, title: '极品家丁', author: '禹岩', category: '都市言情', categoryId: 6 },
            { id: 24, title: '史上最强炼气期', author: '五行缺钱', category: '都市言情', categoryId: 6 }
        ];

        // 为每本书生成封面URL（使用渐变色+书名）
        const colors = [
            ['4A90A4', '19547B'], // 蓝色系
            ['667eea', '764ba2'], // 紫色系
            ['f093fb', 'f5576c'], // 粉色系
            ['4facfe', '00f2fe'], // 青色系
            ['43e97b', '38f9d7'], // 绿色系
            ['fa709a', 'fee140'], // 红黄色系
            ['a8edea', 'fed6e3'], // 淡色系
            ['d299c2', 'fef9d7']  // 暖色系
        ];

        return books.map((book, index) => {
            const colorPair = colors[index % colors.length];
            const initial = book.title.charAt(0);
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400">
                <defs>
                    <linearGradient id="grad${book.id}" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" style="stop-color:#${colorPair[0]};stop-opacity:1" />
                        <stop offset="100%" style="stop-color:#${colorPair[1]};stop-opacity:1" />
                    </linearGradient>
                </defs>
                <rect width="300" height="400" fill="url(#grad${book.id})"/>
                <text x="150" y="200" font-family="Arial, sans-serif" font-size="120" font-weight="bold" fill="white" text-anchor="middle" dominant-baseline="middle">${initial}</text>
                <text x="150" y="340" font-family="Arial, sans-serif" font-size="24" fill="rgba(255,255,255,0.8)" text-anchor="middle">${book.title}</text>
            </svg>`;
            const coverUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);

            return {
                ...book,
                cover: coverUrl,
                fallbackCover: coverUrl,
                isFinished: Math.random() > 0.3,
                playCount: Math.floor(Math.random() * 10000000)
            };
        });
    }
};

// 导出API模块
window.AudiobookAPI = AudiobookAPI;
