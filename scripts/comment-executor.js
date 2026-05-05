/**
 * 每日评论执行器
 * 读取计划文件中的评论任务并执行发布
 * 支持 --taskIndex 参数：只执行指定序号的评论
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const SCHEDULE_FILE = path.join(__dirname, 'daily-comment-schedule.json');

// ============== 解析命令行参数 ==============
const args = process.argv.slice(2);
let taskIndex = null;
for (const arg of args) {
  if (arg.startsWith('--taskIndex=')) {
    taskIndex = parseInt(arg.split('=')[1], 10);
  }
}

// ============== 评论发布 ==============
function postComment(comment, nickname, url) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      comment: comment,
      nick: nickname,
      url: url
    });

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

// ============== 主流程 ==============
async function runExecutor() {
  console.log('[CommentExecutor] 开始执行评论发布...');
  console.log('[CommentExecutor] 执行时间: ' + new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }));

  // 读取计划文件
  if (!fs.existsSync(SCHEDULE_FILE)) {
    console.log('[CommentExecutor] 未找到计划文件，跳过执行');
    return;
  }

  const scheduleData = JSON.parse(fs.readFileSync(SCHEDULE_FILE, 'utf-8'));
  const today = new Date().toISOString().split('T')[0];

  // 检查计划是否是今天的
  if (scheduleData.date !== today) {
    console.log('[CommentExecutor] 计划已过期(' + scheduleData.date + ')，跳过执行');
    return;
  }

  const tasks = scheduleData.schedule;
  console.log('[CommentExecutor] 今日计划共 ' + tasks.length + ' 条评论');

  // 如果指定了taskIndex，只执行那一条
  const tasksToRun = taskIndex !== null
    ? tasks.filter(t => t.index === taskIndex)
    : tasks;

  if (tasksToRun.length === 0) {
    if (taskIndex !== null) {
      console.log('[CommentExecutor] 未找到序号为 ' + taskIndex + ' 的计划，跳过');
    }
    return;
  }

  for (const task of tasksToRun) {
    console.log('[CommentExecutor] [' + task.index + '/' + tasks.length + '] 发布评论: 《' + task.article.title + '》');
    console.log('[CommentExecutor] 时间: ' + task.scheduledTime + ' | 昵称: ' + task.nickname + ' | 评论: ' + task.comment);

    try {
      const result = await postComment(task.comment, task.nickname, task.article.path);
      console.log('[CommentExecutor] ✓ 成功 (ID: ' + (result.data ? result.data.objectId : 'N/A') + ')');
    } catch (err) {
      console.log('[CommentExecutor] ✗ 失败: ' + err.message);
    }
  }

  console.log('[CommentExecutor] 执行完成');
}

// ============== 只在直接运行时执行（不被 hexo 自动加载时执行）==============
if (require.main === module) {
  runExecutor()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
