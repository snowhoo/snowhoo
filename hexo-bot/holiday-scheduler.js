/**
 * holiday-scheduler.js
 * 节日文章自动调度脚本
 * 每天0点执行，检查今天是否为节日日，是则自动生成并发布文章
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// 配置
const HEXO_BOT_PATH = 'D:/hexo/hexo-bot';
const HOLIDAYS_FILE = path.join(HEXO_BOT_PATH, 'holiday-publish', 'holidays.json');
const LOCK_FILE = path.join(HEXO_BOT_PATH, 'holiday-publish', 'holiday.lock');

// 获取今天的日期 (YYYY-MM-DD)
function getTodayDate() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// 检查锁文件，防止同一天重复执行
function checkLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const lockData = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf-8'));
      const today = getTodayDate();
      if (lockData.date === today) {
        console.log(`[holiday] 今日(${today})已执行，跳过`);
        return false;
      }
    }
  } catch (e) {
    // 锁文件无效，继续执行
  }
  return true;
}

// 更新锁文件
function updateLock() {
  try {
    fs.writeFileSync(LOCK_FILE, JSON.stringify({ date: getTodayDate() }, null, 2), 'utf-8');
  } catch (e) {
    console.error('[holiday] 更新锁文件失败:', e.message);
  }
}

// 获取node路径
const NODE_PATH = 'C:/Program Files/nodejs/node.exe';

// 运行node脚本
function runNodeScript(scriptPath, args = []) {
  return new Promise((resolve, reject) => {
    const proc = spawn(NODE_PATH, [scriptPath, ...args], {
      cwd: HEXO_BOT_PATH,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', d => { stdout += d; });
    proc.stderr.on('data', d => { stderr += d; });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`Exit code ${code}: ${stderr || stdout}`));
      }
    });

    proc.on('error', reject);
  });
}

// 主函数
async function main() {
  console.log('[holiday] 节日调度开始...');

  // 检查锁
  if (!checkLock()) {
    return;
  }

  // 读取节日数据
  let holidays;
  try {
    holidays = JSON.parse(fs.readFileSync(HOLIDAYS_FILE, 'utf-8'));
  } catch (e) {
    console.error('[holiday] 读取节日数据失败:', e.message);
    return;
  }

  const today = getTodayDate();
  const todayHoliday = holidays.holidays.find(h => h.date === today);

  if (todayHoliday) {
    console.log(`[holiday] 发现今日节日: ${todayHoliday.name}`);

    try {
      const scriptPath = path.join(HEXO_BOT_PATH, 'holiday-publish', 'create-holiday-post.js');
      await runNodeScript(scriptPath, [todayHoliday.name]);
      console.log(`[holiday] 节日文章生成成功: ${todayHoliday.name}`);
      updateLock();
    } catch (e) {
      console.error('[holiday] 生成节日文章失败:', e.message);
    }
  } else {
    console.log(`[holiday] 今日(${today})无节日，跳过`);
    updateLock(); // 也更新锁，避免重复检查
  }

  console.log('[holiday] 节日调度完成');
}

main().catch(e => {
  console.error('[holiday] 调度异常:', e.message);
  process.exit(1);
});
