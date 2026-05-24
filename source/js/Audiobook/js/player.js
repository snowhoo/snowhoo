/**
 * 有声小说播放器模块
 */

const AudiobookPlayer = {
    // 音频元素
    audio: null,

    // 当前播放状态
    state: {
        isPlaying: false,
        currentTime: 0,
        duration: 0,
        volume: 0.7,
        playbackRate: 1.0,
        isMuted: false
    },

    // 当前播放信息
    current: {
        bookId: null,
        bookTitle: '',
        bookAuthor: '',
        cover: '',
        chapterId: null,
        chapterTitle: '',
        chapterIndex: 0,
        chapterList: []
    },

    // 播放历史
    history: [],
    MAX_HISTORY: 20,

    // 收藏
    favorites: [],

    // 初始化
    init() {
        this.audio = document.getElementById('audioPlayer');
        if (!this.audio) {
            console.error('音频播放器元素未找到');
            return;
        }

        // 设置音量
        this.audio.volume = this.state.volume;

        // 绑定事件
        this.bindEvents();

        // 加载本地存储
        this.loadLocalData();

        console.log('播放器初始化完成');
    },

    // 绑定音频事件
    bindEvents() {
        // 播放/暂停事件
        this.audio.addEventListener('play', () => {
            this.state.isPlaying = true;
            this.updatePlayButton(true);
            this.showPlayer();
        });

        this.audio.addEventListener('pause', () => {
            this.state.isPlaying = false;
            this.updatePlayButton(false);
        });

        // 时间更新
        this.audio.addEventListener('timeupdate', () => {
            this.state.currentTime = this.audio.currentTime;
            this.state.duration = this.audio.duration || 0;
            this.updateProgress();
        });

        // 音频加载完成
        this.audio.addEventListener('loadedmetadata', () => {
            this.state.duration = this.audio.duration;
            this.updateDuration();
        });

        // 播放结束
        this.audio.addEventListener('ended', () => {
            this.playNext();
        });

        // 播放出错
        this.audio.addEventListener('error', (e) => {
            console.error('音频播放错误:', e);
            this.showToast('音频加载失败，请尝试切换章节', 'error');
        });

        // 等待数据
        this.audio.addEventListener('waiting', () => {
            // 显示缓冲状态
        });

        // 进度缓冲
        this.audio.addEventListener('progress', () => {
            this.updateBuffered();
        });
    },

    // 播放音频
    async play(chapter, bookInfo) {
        if (!chapter) {
            this.showToast('请选择要播放的章节', 'error');
            return;
        }

        // 更新当前播放信息
        this.current.bookId = bookInfo.id;
        this.current.bookTitle = bookInfo.title;
        this.current.bookAuthor = bookInfo.author;
        this.current.cover = bookInfo.cover;
        this.current.chapterId = chapter.id;
        this.current.chapterTitle = chapter.title;
        this.current.chapterIndex = chapter.index;

        // 获取音频URL
        let audioUrl;
        try {
            audioUrl = await AudiobookAPI.getChapterAudio(chapter.id);
        } catch (error) {
            audioUrl = AudiobookAPI.getMockAudioUrl(chapter.id);
        }

        // 更新UI
        this.updatePlayerUI();
        this.updateChapterListUI();

        // 添加到历史记录
        this.addToHistory(bookInfo, chapter);

        // 开始播放
        this.audio.src = audioUrl;
        this.audio.playbackRate = this.state.playbackRate;

        try {
            await this.audio.play();
            this.showPlayer();
        } catch (error) {
            console.error('播放失败:', error);
            this.showToast('播放失败，请检查网络', 'error');
        }
    },

    // 播放/暂停
    togglePlay() {
        if (this.audio.paused) {
            this.audio.play();
        } else {
            this.audio.pause();
        }
    },

    // 暂停
    pause() {
        this.audio.pause();
    },

    // 播放
    play() {
        if (this.audio.src) {
            this.audio.play();
        }
    },

    // 上一章
    playPrev() {
        if (!this.current.chapterList || this.current.chapterList.length === 0) return;

        const currentIndex = this.current.chapterIndex - 1;
        if (currentIndex > 0) {
            const prevChapter = this.current.chapterList[currentIndex - 2];
            const bookInfo = {
                id: this.current.bookId,
                title: this.current.bookTitle,
                author: this.current.bookAuthor,
                cover: this.current.cover
            };
            this.play(prevChapter, bookInfo);
        } else {
            this.showToast('已经是第一章了', 'info');
        }
    },

    // 下一章
    playNext() {
        if (!this.current.chapterList || this.current.chapterList.length === 0) return;

        const currentIndex = this.current.chapterIndex;
        if (currentIndex < this.current.chapterList.length) {
            const nextChapter = this.current.chapterList[currentIndex];
            const bookInfo = {
                id: this.current.bookId,
                title: this.current.bookTitle,
                author: this.current.bookAuthor,
                cover: this.current.cover
            };
            this.play(nextChapter, bookInfo);
        } else {
            this.showToast('已经是最后一章了', 'info');
        }
    },

    // 跳转播放
    seekTo(time) {
        if (this.audio.duration) {
            this.audio.currentTime = Math.max(0, Math.min(time, this.audio.duration));
        }
    },

    // 跳转百分比
    seekToPercent(percent) {
        if (this.audio.duration) {
            this.audio.currentTime = this.audio.duration * percent;
        }
    },

    // 设置音量
    setVolume(volume) {
        this.state.volume = Math.max(0, Math.min(1, volume));
        this.audio.volume = this.state.volume;
        this.state.isMuted = this.state.volume === 0;
        this.updateVolumeUI();
        this.saveLocalData();
    },

    // 静音切换
    toggleMute() {
        this.state.isMuted = !this.state.isMuted;
        this.audio.muted = this.state.isMuted;
        this.updateVolumeUI();
    },

    // 设置播放倍速
    setPlaybackRate(rate) {
        this.state.playbackRate = rate;
        this.audio.playbackRate = rate;
        this.updateSpeedUI();
        this.saveLocalData();
    },

    // 设置章节列表
    setChapterList(chapters) {
        this.current.chapterList = chapters;
        this.updateChapterListUI();
    },

    // 添加到历史记录
    addToHistory(bookInfo, chapter) {
        const record = {
            bookId: bookInfo.id,
            bookTitle: bookInfo.title,
            bookAuthor: bookInfo.author,
            cover: bookInfo.cover,
            chapterId: chapter.id,
            chapterTitle: chapter.title,
            chapterIndex: chapter.index,
            playTime: Date.now()
        };

        // 移除重复记录
        this.history = this.history.filter(h =>
            !(h.bookId === record.bookId && h.chapterId === record.chapterId)
        );

        // 添加到开头
        this.history.unshift(record);

        // 限制数量
        if (this.history.length > this.MAX_HISTORY) {
            this.history = this.history.slice(0, this.MAX_HISTORY);
        }

        this.saveLocalData();
        this.updateRecentUI();
    },

    // 切换收藏
    toggleFavorite() {
        if (!this.current.bookId) return;

        const bookId = this.current.bookId;
        const index = this.favorites.findIndex(f => f.bookId === bookId);

        if (index > -1) {
            this.favorites.splice(index, 1);
            this.showToast('已取消收藏', 'info');
        } else {
            this.favorites.push({
                bookId: this.current.bookId,
                bookTitle: this.current.bookTitle,
                bookAuthor: this.current.bookAuthor,
                cover: this.current.cover,
                addTime: Date.now()
            });
            this.showToast('已添加收藏', 'success');
        }

        this.updateFavoriteUI();
        this.saveLocalData();
    },

    // 检查是否已收藏
    isFavorited() {
        if (!this.current.bookId) return false;
        return this.favorites.some(f => f.bookId === this.current.bookId);
    },

    // ==================== UI更新方法 ====================

    // 显示播放器
    showPlayer() {
        const player = document.getElementById('player');
        if (player) {
            player.classList.add('show');
        }
    },

    // 更新播放按钮
    updatePlayButton(isPlaying) {
        const playBtn = document.getElementById('playBtn');
        if (playBtn) {
            playBtn.innerHTML = isPlaying
                ? '<i class="fas fa-pause"></i>'
                : '<i class="fas fa-play"></i>';
        }
    },

    // 更新播放器UI
    updatePlayerUI() {
        // 封面
        const coverImg = document.querySelector('#playerCover img');
        if (coverImg) {
            coverImg.src = this.current.cover || 'https://via.placeholder.com/60/667eea/ffffff?text=听';
        }

        // 标题
        const titleEl = document.getElementById('playerTitle');
        if (titleEl) {
            titleEl.textContent = this.current.chapterTitle || '未播放';
        }

        // 作者
        const authorEl = document.getElementById('playerAuthor');
        if (authorEl) {
            authorEl.textContent = `${this.current.bookTitle} - ${this.current.bookAuthor}`;
        }

        // 更新收藏按钮
        this.updateFavoriteUI();
    },

    // 更新进度条
    updateProgress() {
        const currentTimeEl = document.getElementById('currentTime');
        const progressCurrentEl = document.getElementById('progressCurrent');
        const progressHandleEl = document.getElementById('progressHandle');

        if (currentTimeEl) {
            currentTimeEl.textContent = this.formatTime(this.state.currentTime);
        }

        if (progressCurrentEl && this.state.duration) {
            const percent = (this.state.currentTime / this.state.duration) * 100;
            progressCurrentEl.style.width = `${percent}%`;

            if (progressHandleEl) {
                progressHandleEl.style.left = `${percent}%`;
            }
        }
    },

    // 更新缓冲进度
    updateBuffered() {
        const progressLoadedEl = document.getElementById('progressLoaded');
        if (progressLoadedEl && this.audio.buffered.length > 0) {
            const bufferedEnd = this.audio.buffered.end(this.audio.buffered.length - 1);
            const percent = (bufferedEnd / this.audio.duration) * 100;
            progressLoadedEl.style.width = `${percent}%`;
        }
    },

    // 更新时长显示
    updateDuration() {
        const totalTimeEl = document.getElementById('totalTime');
        if (totalTimeEl) {
            totalTimeEl.textContent = this.formatTime(this.state.duration);
        }
    },

    // 更新音量UI
    updateVolumeUI() {
        const volumeCurrentEl = document.getElementById('volumeCurrent');
        const volumeBtn = document.getElementById('volumeBtn');

        if (volumeCurrentEl) {
            volumeCurrentEl.style.width = `${this.state.isMuted ? 0 : this.state.volume * 100}%`;
        }

        if (volumeBtn) {
            const icon = this.state.isMuted || this.state.volume === 0
                ? 'fa-volume-mute'
                : this.state.volume < 0.5
                    ? 'fa-volume-down'
                    : 'fa-volume-up';
            volumeBtn.innerHTML = `<i class="fas ${icon}"></i>`;
        }
    },

    // 更新倍速UI
    updateSpeedUI() {
        const speedBtn = document.getElementById('speedBtn');
        const speedMenu = document.getElementById('speedMenu');

        if (speedBtn) {
            speedBtn.textContent = `${this.state.playbackRate}x`;
        }

        if (speedMenu) {
            speedMenu.querySelectorAll('span').forEach(span => {
                span.classList.toggle('active', parseFloat(span.dataset.speed) === this.state.playbackRate);
            });
        }
    },

    // 更新章节列表UI
    updateChapterListUI() {
        const chapterListEl = document.getElementById('chapterList');
        const popupListEl = document.querySelector('.chapter-popup .chapter-list');

        const html = this.current.chapterList.map(chapter => `
            <li class="chapter-item ${chapter.index === this.current.chapterIndex ? 'playing' : ''}"
                data-index="${chapter.index}">
                <i class="fas fa-play"></i>
                <span>${chapter.title}</span>
            </li>
        `).join('');

        if (chapterListEl) chapterListEl.innerHTML = html;
        if (popupListEl) popupListEl.innerHTML = html;
    },

    // 更新收藏按钮
    updateFavoriteUI() {
        const favoriteBtn = document.getElementById('favoriteBtn');
        if (favoriteBtn) {
            const isFav = this.isFavorited();
            favoriteBtn.innerHTML = `<i class="fas fa-heart ${isFav ? 'active' : ''}"></i>`;
            if (isFav) {
                favoriteBtn.classList.add('favorited');
            } else {
                favoriteBtn.classList.remove('favorited');
            }
        }
    },

    // 更新最近播放UI
    updateRecentUI() {
        const recentListEl = document.getElementById('recentList');

        if (!recentListEl) return;

        if (this.history.length === 0) {
            recentListEl.innerHTML = '<li class="empty-tip"><i class="fas fa-inbox"></i> 暂无播放记录</li>';
            return;
        }

        const html = this.history.slice(0, 10).map(record => `
            <li class="recent-item" data-book-id="${record.bookId}" data-chapter-id="${record.chapterId}">
                <img class="recent-cover" src="${record.cover}" alt="${record.bookTitle}">
                <div class="recent-info">
                    <div class="recent-title">${record.bookTitle}</div>
                    <div class="recent-chapter">${record.chapterTitle}</div>
                </div>
            </li>
        `).join('');

        recentListEl.innerHTML = html;
    },

    // ==================== 工具方法 ====================

    // 格式化时间
    formatTime(seconds) {
        if (!seconds || isNaN(seconds)) return '00:00';

        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);

        if (hours > 0) {
            return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        }
        return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    },

    // 显示提示消息
    showToast(message, type = 'info') {
        const toast = document.getElementById('toast');
        const toastMessage = document.getElementById('toastMessage');

        if (!toast || !toastMessage) return;

        toastMessage.textContent = message;
        toast.className = `toast ${type} show`;

        setTimeout(() => {
            toast.classList.remove('show');
        }, 2500);
    },

    // ==================== 本地存储 ====================

    // 保存数据到本地
    saveLocalData() {
        try {
            localStorage.setItem('audiobook_history', JSON.stringify(this.history));
            localStorage.setItem('audiobook_favorites', JSON.stringify(this.favorites));
            localStorage.setItem('audiobook_volume', this.state.volume);
            localStorage.setItem('audiobook_speed', this.state.playbackRate);
        } catch (e) {
            console.error('保存数据失败:', e);
        }
    },

    // 加载本地数据
    loadLocalData() {
        try {
            const history = localStorage.getItem('audiobook_history');
            const favorites = localStorage.getItem('audiobook_favorites');
            const volume = localStorage.getItem('audiobook_volume');
            const speed = localStorage.getItem('audiobook_speed');

            if (history) this.history = JSON.parse(history);
            if (favorites) this.favorites = JSON.parse(favorites);
            if (volume !== null) this.state.volume = parseFloat(volume);
            if (speed !== null) this.state.playbackRate = parseFloat(speed);

            this.updateRecentUI();
            this.updateVolumeUI();
            this.updateSpeedUI();
        } catch (e) {
            console.error('加载数据失败:', e);
        }
    }
};

// 导出播放器模块
window.AudiobookPlayer = AudiobookPlayer;
