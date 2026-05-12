<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>聚合播放器 - 静态数据版</title>
    <style>
        /* 你的原有样式可以保留，这里只给核心逻辑 */
        body { font-family: system-ui; background: #0a0a12; color: #eee; padding: 1rem; }
        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px,1fr)); gap: 1rem; }
        .card { background: #1e1e2a; border-radius: 0.8rem; overflow: hidden; cursor: pointer; }
        .card img { width: 100%; aspect-ratio: 2/3; object-fit: cover; }
        .info { padding: 0.5rem; }
        .source-tag { font-size: 0.7rem; color: #e6b422; }
    </style>
</head>
<body>
    <h1>电影广场</h1>
    <div class="controls">
        <input type="text" id="search" placeholder="搜索影片..." />
        <select id="sourceFilter"><option value="all">所有来源</option></select>
    </div>
    <div id="moviesGrid" class="grid">加载中...</div>

    <div id="modal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:black; justify-content:center; align-items:center;">
        <video id="videoPlayer" controls style="max-width:90%; max-height:90%;"></video>
        <button onclick="closeModal()" style="position:absolute; top:20px; right:20px;">关闭</button>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
    <script>
        let allMovies = [];
        let currentFilter = 'all';

        async function loadData() {
            try {
                const res = await fetch('/data/all_movies.json');
                const data = await res.json();
                allMovies = data.movies || [];
                populateSourceFilter();
                renderMovies();
            } catch(e) {
                document.getElementById('moviesGrid').innerHTML = '数据加载失败: ' + e.message;
            }
        }

        function populateSourceFilter() {
            const sources = [...new Set(allMovies.map(m => m.source))];
            const select = document.getElementById('sourceFilter');
            select.innerHTML = '<option value="all">所有来源</option>';
            sources.forEach(src => {
                const opt = document.createElement('option');
                opt.value = src;
                opt.textContent = src;
                select.appendChild(opt);
            });
            select.onchange = () => {
                currentFilter = select.value;
                renderMovies();
            };
        }

        function renderMovies() {
            let filtered = allMovies;
            if (currentFilter !== 'all') {
                filtered = filtered.filter(m => m.source === currentFilter);
            }
            const keyword = document.getElementById('search').value.toLowerCase();
            if (keyword) filtered = filtered.filter(m => m.title.toLowerCase().includes(keyword));

            const grid = document.getElementById('moviesGrid');
            if (!filtered.length) {
                grid.innerHTML = '<div>没有找到影片</div>';
                return;
            }
            grid.innerHTML = filtered.map(m => `
                <div class="card" onclick="playVideo('${escapeHtml(m.videoUrl)}', '${escapeHtml(m.title)}')">
                    <img src="${m.cover || 'https://placehold.co/300x450/2a2a36/e6b422?text=No+Cover'}" onerror="this.src='https://placehold.co/300x450/2a2a36/e6b422?text=📷'">
                    <div class="info">
                        <div>${escapeHtml(m.title)}</div>
                        <div class="source-tag">${escapeHtml(m.source)}</div>
                    </div>
                </div>
            `).join('');
        }

        function escapeHtml(str) {
            if(!str) return '';
            return str.replace(/[&<>]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[m]));
        }

        let hls = null;
        function playVideo(url, title) {
            const modal = document.getElementById('modal');
            const video = document.getElementById('videoPlayer');
            if (hls) hls.destroy();
            modal.style.display = 'flex';
            if (url.includes('.m3u8') && Hls.isSupported()) {
                hls = new Hls();
                hls.loadSource(url);
                hls.attachMedia(video);
                hls.on(Hls.Events.MANIFEST_PARSED, () => video.play());
            } else {
                video.src = url;
                video.play();
            }
        }

        window.closeModal = () => {
            const modal = document.getElementById('modal');
            const video = document.getElementById('videoPlayer');
            modal.style.display = 'none';
            video.pause();
            video.src = '';
            if (hls) { hls.destroy(); hls = null; }
        };

        document.getElementById('search').addEventListener('input', renderMovies);
        loadData();
    </script>
</body>
</html>