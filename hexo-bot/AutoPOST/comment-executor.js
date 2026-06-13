/**
 * Hexo 评论执行器
 * 职责极简：读取 schedule 中预生成的数据，直接发往 Waline
 * 所有逻辑（sitemap 抓取、文章选择、URL 解析、评论生成）已在 auto-poster.js 中完成
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SCHEDULE_FILE = path.join(__dirname, 'daily-comment-schedule.json');

// ============== 评论发布 ==============
function postComment(comment, nickname, url) {
  return new Promise((resolve, reject) => {
    const https = require('https');
    const postData = JSON.stringify({ comment, nick: nickname, url });
    const options = {
      hostname: 'waline.snowhoo.net',
      port: 443,
      path: '/api/comment',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.errno === 0 || json.code === 0 || json.code === 200) {
            resolve(json);
          } else {
            reject(new Error('Waline error: ' + (json.errmsg || JSON.stringify(json))));
          }
        } catch (e) {
          if (res.statusCode === 200 || res.statusCode === 201) {
            resolve({ success: true, statusCode: res.statusCode });
          } else {
            reject(new Error('Failed to parse response: ' + data));
          }
        }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// ============== 删除 Windows 计划任务 ==============
function deleteScheduledTask(taskIndex) {
  const taskName = 'AutoPost_Task_' + taskIndex;
  const taskPath = '\\Hexo-Bot\\';
  const cmd = 'schtasks /Delete /TN "' + taskPath + taskName + '" /F';
  try {
    execSync(cmd, {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 10000
    });
    console.log('[CommentExecutor] 已清理计划任务: ' + taskPath + taskName);
  } catch (e) {
    // 任务可能已自动删除，忽略错误
  }
}

// ============== 主流程 ==============
async function runExecutor() {
  console.log('[CommentExecutor] 开始执行评论发布...');
  console.log('[CommentExecutor] 执行时间: ' + new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }));

  if (!fs.existsSync(SCHEDULE_FILE)) {
    console.log('[CommentExecutor] 未找到计划文件，跳过执行');
    return;
  }

  const scheduleData = JSON.parse(fs.readFileSync(SCHEDULE_FILE, 'utf-8'));
  const today = new Date().toISOString().split('T')[0];

  if (scheduleData.date !== today) {
    console.log('[CommentExecutor] 计划已过期(' + scheduleData.date + ')，跳过执行');
    return;
  }

  const tasks = scheduleData.schedule;
  console.log('[CommentExecutor] 今日计划共 ' + tasks.length + ' 条评论');

  // 解析 --taskIndex 参数
  const args = process.argv.slice(2);
  let taskIndex = null;
  for (const arg of args) {
    if (arg.startsWith('--taskIndex=')) {
      taskIndex = parseInt(arg.split('=')[1], 10);
    }
  }

  const tasksToRun = taskIndex !== null
    ? tasks.filter(t => t.index === taskIndex)
    : tasks;

  if (tasksToRun.length === 0) {
    if (taskIndex !== null) {
      console.log('[CommentExecutor] 未找到序号为 ' + taskIndex + ' 的计划，跳过');
    }
    return;
  }

  // 执行每条预生成的评论
  for (const task of tasksToRun) {
    console.log('[CommentExecutor] [' + task.index + '/' + tasks.length + ']');
    console.log('[CommentExecutor] URL: ' + task.url);
    console.log('[CommentExecutor] 昵称: ' + task.nick + ' | 评论: ' + task.comment);

    try {
      const result = await postComment(task.comment, task.nick, task.url);
      const commentId = result.data ? result.data.objectId : 'N/A';
      console.log('[CommentExecutor] 成功 (ID: ' + commentId + ')');
      deleteScheduledTask(task.index);
    } catch (err) {
      console.log('[CommentExecutor] 失败: ' + err.message);
    }
  }

  console.log('[CommentExecutor] 执行完成');
}

// ============== 入口 ==============
if (require.main === module) {
  runExecutor()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[CommentExecutor] 异常: ' + err.message);
      process.exit(1);
    });
}

module.exports = { runExecutor };
