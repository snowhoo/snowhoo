
    // ========== 五子棋核心 (完整 AI 逻辑，无视觉泄露) ==========
    const BOARD_SIZE = 15;
    let currentPlayer = 1;      // 1黑(玩家) 2白(AI)
    let board = Array(BOARD_SIZE).fill().map(() => Array(BOARD_SIZE).fill(0));
    let gameOver = false;
    let aiLevel = 5;
    let history = [];
    let isThinking = false;
    let winLineInfo = null;
    let lastMovePos = null;
    let currentTheme = "classic";

    const canvas = document.getElementById('gomokuCanvas');
    const ctx = canvas.getContext('2d');
    const levelSelect = document.getElementById('levelSelect');
    const levelStars = document.getElementById('levelStars');
    const playerBlackDiv = document.getElementById('playerBlack');
    const playerWhiteDiv = document.getElementById('playerWhite');
    const restartBtn = document.getElementById('restartBtn');
    const undoBtn = document.getElementById('undoBtn');
    const statusTextDiv = document.getElementById('5_statusText');
    const modalOverlay = document.getElementById('modalOverlay');
    const modalIcon = document.getElementById('modalIcon');
    const modalTitle = document.getElementById('modalTitle');
    const modalMessage = document.getElementById('modalMessage');
    const modalBtn = document.getElementById('modalBtn');
    const themeSelect = document.getElementById('themeSelect');

    let cellSize = 0, padding = 0, boardWidth = 0, boardHeight = 0;
    let previewRow = -1, previewCol = -1;

    const LEVEL_NAMES = {1:'初学',2:'入门',3:'初级',4:'业余',5:'中级',6:'进阶',7:'高手',8:'高段',9:'强手',10:'大师'};

    const themes = {
        classic: { bgColor: "#FCF3E0", gridColor: "#BD8A5A", starOuter: "#DB9A60", starInner: "#F5C28E" },
        jade: { bgColor: "#E6F0E3", gridColor: "#5F8B6F", starOuter: "#8BBF8F", starInner: "#C5E0B4" },
        ink: { bgColor: "#F2EFE9", gridColor: "#6E5C4B", starOuter: "#B7A17A", starInner: "#E1CFB0" }
    };

    function updateLevelStars() {
        let starsHtml = '';
        for (let i = 1; i <= 10; i++) {
            starsHtml += `<svg class="star ${i <= aiLevel ? 'filled' : ''}" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;
        }
        levelStars.innerHTML = starsHtml;
    }

    function resizeCanvasAndDraw() {
        const container = canvas.parentElement;
        let maxSize = Math.min(container.clientWidth - 10, window.innerWidth * 0.85, 660);
        maxSize = Math.max(360, maxSize);
        canvas.width = maxSize;
        canvas.height = maxSize;
        boardWidth = canvas.width;
        boardHeight = canvas.height;
        cellSize = boardWidth / BOARD_SIZE;
        padding = cellSize / 2;
        drawFullBoard();
    }

    function drawGridAndStars() {
        const theme = themes[currentTheme];
        ctx.save();
        ctx.strokeStyle = theme.gridColor;
        ctx.lineWidth = 1.8;
        for (let i = 0; i < BOARD_SIZE; i++) {
            ctx.beginPath();
            ctx.moveTo(padding, padding + i * cellSize);
            ctx.lineTo(boardWidth - padding, padding + i * cellSize);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(padding + i * cellSize, padding);
            ctx.lineTo(padding + i * cellSize, boardHeight - padding);
            ctx.stroke();
        }
        const stars = [[3,3],[3,11],[7,7],[11,3],[11,11]];
        stars.forEach(([x,y]) => {
            ctx.beginPath();
            ctx.arc(padding + x * cellSize, padding + y * cellSize, cellSize * 0.11, 0, 2*Math.PI);
            ctx.fillStyle = theme.starOuter;
            ctx.fill();
            ctx.beginPath();
            ctx.arc(padding + x * cellSize, padding + y * cellSize, cellSize * 0.07, 0, 2*Math.PI);
            ctx.fillStyle = theme.starInner;
            ctx.fill();
        });
        ctx.restore();
    }

    function drawPiece(row, col, player, alpha = 1.0) {
        const cx = padding + col * cellSize;
        const cy = padding + row * cellSize;
        const radius = cellSize * 0.4;
        ctx.save();
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, 2*Math.PI);
        if (player === 1) {
            const grad = ctx.createRadialGradient(cx - radius*0.2, cy - radius*0.2, radius*0.2, cx, cy, radius);
            grad.addColorStop(0, '#4a4a4a');
            grad.addColorStop(0.7, '#111');
            grad.addColorStop(1, '#000');
            ctx.fillStyle = grad;
        } else {
            const grad = ctx.createRadialGradient(cx - radius*0.2, cy - radius*0.2, radius*0.2, cx, cy, radius);
            grad.addColorStop(0, '#ffffff');
            grad.addColorStop(0.5, '#f0f3fc');
            grad.addColorStop(1, '#d8dfef');
            ctx.fillStyle = grad;
        }
        ctx.globalAlpha = alpha;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(cx - radius*0.18, cy - radius*0.18, radius*0.18, 0, 2*Math.PI);
        ctx.fillStyle = player === 1 ? '#a5a5a5' : '#ffffffcc';
        ctx.fill();
        if (lastMovePos && lastMovePos.row === row && lastMovePos.col === col && !winLineInfo) {
            ctx.beginPath();
            ctx.arc(cx, cy, radius * 0.28, 0, 2*Math.PI);
            ctx.fillStyle = '#E05A3A';
            ctx.fill();
        }
        ctx.restore();
    }

    function drawAllPieces() {
        for (let i = 0; i < BOARD_SIZE; i++)
            for (let j = 0; j < BOARD_SIZE; j++)
                if (board[i][j] !== 0) drawPiece(i, j, board[i][j], 1);
    }

    function drawWinLine(start, end) {
        const startX = padding + start.col * cellSize;
        const startY = padding + start.row * cellSize;
        const endX = padding + end.col * cellSize;
        const endY = padding + end.row * cellSize;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.strokeStyle = '#E63946';
        ctx.lineWidth = Math.max(3, cellSize * 0.12);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.strokeStyle = '#FFD966';
        ctx.lineWidth = Math.max(1.8, cellSize * 0.06);
        ctx.stroke();
        ctx.restore();
    }

    function drawFullBoard() {
        if (!ctx) return;
        ctx.clearRect(0, 0, boardWidth, boardHeight);
        const theme = themes[currentTheme];
        ctx.fillStyle = theme.bgColor;
        ctx.fillRect(0, 0, boardWidth, boardHeight);
        drawGridAndStars();
        drawAllPieces();
        if (winLineInfo) drawWinLine(winLineInfo.start, winLineInfo.end);
        if (previewRow >= 0 && previewCol >= 0 && !gameOver && currentPlayer === 1 && board[previewRow][previewCol] === 0) {
            drawPiece(previewRow, previewCol, currentPlayer, 0.45);
        }
    }

    function checkWinPosition(row, col, playerVal) {
        const dirs = [[0,1],[1,0],[1,1],[1,-1]];
        for (let [dr, dc] of dirs) {
            let count = 1;
            let start = { row, col };
            let end = { row, col };
            for (let step = 1; step <= 5; step++) {
                const nr = row + dr*step, nc = col + dc*step;
                if (nr<0 || nr>=BOARD_SIZE || nc<0 || nc>=BOARD_SIZE || board[nr][nc] !== playerVal) break;
                count++; end = { row: nr, col: nc };
            }
            for (let step = 1; step <= 5; step++) {
                const nr = row - dr*step, nc = col - dc*step;
                if (nr<0 || nr>=BOARD_SIZE || nc<0 || nc>=BOARD_SIZE || board[nr][nc] !== playerVal) break;
                count++; start = { row: nr, col: nc };
            }
            if (count >= 5) return { start, end };
        }
        return null;
    }

    function placePiece(row, col, player) {
        if (gameOver || board[row][col] !== 0) return false;
        board[row][col] = player;
        history.push({ row, col, player });
        lastMovePos = { row, col };
        drawFullBoard();
        const win = checkWinPosition(row, col, player);
        if (win) {
            gameOver = true;
            winLineInfo = win;
            drawFullBoard();
            setTimeout(() => showResult(player), 380);
            return true;
        }
        let full = true;
        for(let i=0;i<BOARD_SIZE && full;i++) for(let j=0;j<BOARD_SIZE;j++) if(board[i][j]===0){ full=false; break;}
        if (full) {
            gameOver = true;
            setTimeout(() => showResult(0), 280);
            return true;
        }
        currentPlayer = (player === 1 ? 2 : 1);
        updateUI();
        drawFullBoard();
        undoBtn.disabled = history.length === 0;
        return true;
    }

    function showResult(winner) {
        modalOverlay.classList.add('show');
        if (winner === 0) {
            modalIcon.textContent = '🤝'; modalTitle.textContent = '平局'; modalTitle.className = 'modal-title';
            modalMessage.textContent = '势均力敌！';
        } else if (winner === 1) {
            modalIcon.textContent = '🏆'; modalTitle.textContent = '胜利！'; modalTitle.className = 'modal-title win';
            modalMessage.textContent = `击败 ${LEVEL_NAMES[aiLevel]} 级 AI，棋力非凡！`;
        } else {
            modalIcon.textContent = '🧠'; modalTitle.textContent = '惜败'; modalTitle.className = 'modal-title lose';
            modalMessage.textContent = `AI (${LEVEL_NAMES[aiLevel]}) 获胜，再接再厉！`;
        }
    }

    // AI 智能评分 (保留完整逻辑)
    function findWinningMove(player) { /* 完全保留 */ 
        for(let i=0;i<BOARD_SIZE;i++) for(let j=0;j<BOARD_SIZE;j++) if(board[i][j]===0) {
            board[i][j]=player;
            let win = checkWinPosition(i,j,player);
            board[i][j]=0;
            if(win) return {row:i,col:j};
        }
        return null;
    }
    function hasNeighbor(r,c) {
        for(let dr=-2;dr<=2;dr++) for(let dc=-2;dc<=2;dc++) {
            let nr=r+dr,nc=c+dc;
            if(nr>=0 && nr<BOARD_SIZE && nc>=0 && nc<BOARD_SIZE && board[nr][nc]!==0) return true;
        }
        return false;
    }
    function getEmptyNearby() {
        let arr=[];
        for(let i=0;i<BOARD_SIZE;i++) for(let j=0;j<BOARD_SIZE;j++) if(board[i][j]===0 && hasNeighbor(i,j)) arr.push({row:i,col:j});
        if(arr.length===0) for(let i=0;i<BOARD_SIZE;i++) for(let j=0;j<BOARD_SIZE;j++) if(board[i][j]===0) arr.push({row:i,col:j});
        return arr;
    }
    function evaluateDir(row,col,player) {
        let score=0;
        const dirs=[[0,1],[1,0],[1,1],[1,-1]];
        for(let [dr,dc] of dirs){
            let cnt=1, free=0;
            for(let step=1;step<=4;step++){ let nr=row+dr*step,nc=col+dc*step; if(nr<0||nr>=BOARD_SIZE||nc<0||nc>=BOARD_SIZE) break; if(board[nr][nc]===player) cnt++; else if(board[nr][nc]===0){ free++; break; } else break; }
            for(let step=1;step<=4;step++){ let nr=row-dr*step,nc=col-dc*step; if(nr<0||nr>=BOARD_SIZE||nc<0||nc>=BOARD_SIZE) break; if(board[nr][nc]===player) cnt++; else if(board[nr][nc]===0){ free++; break; } else break; }
            if(cnt>=5) score+=120000;
            else if(cnt===4 && free>=1) score+=30000;
            else if(cnt===3 && free===2) score+=4000;
            else if(cnt===3 && free>=1) score+=800;
            else if(cnt===2 && free>=1) score+=60;
        }
        return score;
    }
    function getBestHeuristic() {
        let best=null,bestScore=-1;
        let candidates=getEmptyNearby();
        for(let mv of candidates){
            let aiS=evaluateDir(mv.row,mv.col,2);
            let defS=evaluateDir(mv.row,mv.col,1);
            let score= aiS*0.7 + defS*0.3 + Math.random()*0.08;
            if(score>bestScore){ bestScore=score; best=mv;}
        }
        return best;
    }
    async function aiMove() {
        if(gameOver || currentPlayer!==2 || isThinking) return;
        isThinking=true;
        updateUI();
        await new Promise(r=>setTimeout(r,70));
        let move=null;
        let win=findWinningMove(2);
        if(win) move=win;
        else { let block=findWinningMove(1); if(block) move=block; }
        if(!move){
            if(aiLevel<=2){
                let arr=getEmptyNearby();
                if(arr.length) move=arr[Math.floor(Math.random()*arr.length)];
            } else if(aiLevel<=4){
                move=getBestHeuristic();
            } else {
                let candidates=getEmptyNearby();
                let best=null,bestVal=-Infinity;
                for(let mv of candidates){
                    let score= evaluateDir(mv.row,mv.col,2)*0.65 + evaluateDir(mv.row,mv.col,1)*0.35;
                    score += (Math.random() * (aiLevel/30));
                    if(score>bestVal){ bestVal=score; best=mv;}
                }
                move=best;
            }
        }
        if(move && board[move.row][move.col]===0) placePiece(move.row,move.col,2);
        isThinking=false;
        updateUI();
        drawFullBoard();
    }

    function undoMove() {
        if(isThinking || gameOver) return;
        if(history.length>=2 && currentPlayer===1){
            for(let i=0;i<2;i++){ let last=history.pop(); if(last) board[last.row][last.col]=0; }
            currentPlayer=1; gameOver=false; winLineInfo=null; lastMovePos=history.length?history[history.length-1]:null;
            drawFullBoard(); updateUI();
        } else if(history.length>=1 && currentPlayer===2){
            let last=history.pop(); if(last) board[last.row][last.col]=0;
            currentPlayer=1; gameOver=false; winLineInfo=null; lastMovePos=history.length?history[history.length-1]:null;
            drawFullBoard(); updateUI();
        }
        undoBtn.disabled=history.length===0;
    }

    function resetGame() {
        board = Array(BOARD_SIZE).fill().map(()=>Array(BOARD_SIZE).fill(0));
        currentPlayer = 1; gameOver = false; history = []; isThinking = false; winLineInfo = null; lastMovePos = null;
        previewRow = previewCol = -1;
        updateUI(); drawFullBoard(); modalOverlay.classList.remove('show');
        if(currentPlayer===2 && !gameOver) setTimeout(()=>aiMove(),100);
    }

    function updateUI() {
        playerBlackDiv.classList.toggle('active', currentPlayer===1 && !gameOver);
        playerWhiteDiv.classList.toggle('active', currentPlayer===2 && !gameOver);
        if(gameOver) statusTextDiv.innerHTML = '🏁 终局';
        else if(currentPlayer===1) statusTextDiv.innerHTML = '⚫ 轮到你落子';
        else statusTextDiv.innerHTML = '<span class="thinking">🤖 AI 思考中<span class="thinking-dots"></span></span>';
        undoBtn.disabled = history.length===0 || isThinking || gameOver;
    }

    function setTheme(themeKey) { currentTheme = themeKey; drawFullBoard(); }

    function getGridFromXY(clientX, clientY) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width, scaleY = canvas.height / rect.height;
        let cx = (clientX - rect.left) * scaleX, cy = (clientY - rect.top) * scaleY;
        if(cx<0 || cx>boardWidth || cy<0 || cy>boardHeight) return null;
        const col = Math.round((cx - padding) / cellSize), row = Math.round((cy - padding) / cellSize);
        if(row>=0 && row<BOARD_SIZE && col>=0 && col<BOARD_SIZE) return {row,col};
        return null;
    }
    function onCanvasClick(e) {
        if(gameOver || isThinking || currentPlayer!==1) return;
        const coord = getGridFromXY(e.clientX, e.clientY);
        if(coord && board[coord.row][coord.col]===0){
            placePiece(coord.row, coord.col, 1);
            if(!gameOver && currentPlayer===2) setTimeout(()=>aiMove(), 120);
        }
    }
    function onCanvasMove(e) {
        if(gameOver || isThinking || currentPlayer!==1) { if(previewRow!==-1){ previewRow=-1; drawFullBoard(); } return; }
        const coord = getGridFromXY(e.clientX, e.clientY);
        if(coord && board[coord.row][coord.col]===0 && (previewRow!==coord.row || previewCol!==coord.col)){
            previewRow=coord.row; previewCol=coord.col; drawFullBoard();
        } else if(!coord && previewRow!==-1){ previewRow=-1; drawFullBoard(); }
    }
    function onCanvasLeave() { if(previewRow!==-1){ previewRow=-1; drawFullBoard(); } }

    window.addEventListener('resize', ()=>{ resizeCanvasAndDraw(); });
    restartBtn.addEventListener('click', ()=>{ resetGame(); if(currentPlayer===2 && !gameOver) setTimeout(()=>aiMove(), 100); });
    undoBtn.addEventListener('click', undoMove);
    levelSelect.addEventListener('change', (e)=>{ aiLevel = parseInt(e.target.value); updateLevelStars(); });
    themeSelect.addEventListener('change', (e)=>{ setTheme(e.target.value); });
    modalBtn.addEventListener('click', ()=>{ modalOverlay.classList.remove('show'); resetGame(); if(currentPlayer===2 && !gameOver) setTimeout(()=>aiMove(), 100); });

    canvas.addEventListener('click', onCanvasClick);
    canvas.addEventListener('mousemove', onCanvasMove);
    canvas.addEventListener('mouseleave', onCanvasLeave);
    canvas.addEventListener('touchstart', (e)=>{ e.preventDefault(); const t=e.touches[0]; onCanvasClick(t); });
    canvas.addEventListener('touchmove', (e)=>{ e.preventDefault(); const t=e.touches[0]; onCanvasMove(t); });
    canvas.addEventListener('touchend', ()=>{ previewRow=-1; drawFullBoard(); });

    resizeCanvasAndDraw();
    updateLevelStars();
    resetGame();
// 通知 sevencolor.js 数据已加载（嵌入模式缓存）
if (typeof onDataLoaded !== 'undefined' && onDataLoaded) {
  onDataLoaded([]);
}
