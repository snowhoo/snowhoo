/**
 * Hexo 自动评论发布器 - 每日调度器
 *
 * 在 Windows 计划任务中创建/更新每日 02:00 的调度任务，
 * 任务执行时：
 *   1. 随机选取 3 篇文章
 *   2. 生成 3 个随机时间（06:00-23:00，精确到秒）
 *   3. 写入 daily-comment-schedule.json
 *   4. 创建 3 个一次性计划任务，到点调用 comment-executor.js 发布评论
 *
 * 用法（一次性创建/更新每日 02:00 调度）：
 *   node setup-daily-trigger.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const AUTO_POSTER_SCRIPT = path.join(__dirname, 'auto-poster.js');
const TASK_FOLDER = 'Hexo-Bot';
const DAILY_TASK_NAME = 'AutoPost_Daily';   // 每日 02:00 调度任务

// ============== PowerShell 脚本：创建/更新每日 02:00 任务 ==============
function setupDailyTask() {
  const nodeExe = 'C:\\Program Files\\nodejs\\node.exe';

  // 每天 02:00 触发
  const psContent = [
    '$ErrorActionPreference = "Stop"',
    'try {',
    '  Unregister-ScheduledTask -TaskName "' + DAILY_TASK_NAME + '" -TaskPath "\\' + TASK_FOLDER + '\\" -Confirm:$false -ErrorAction SilentlyContinue',
    '  $act = New-ScheduledTaskAction -Execute "' + nodeExe + '" -Argument "\\"' + AUTO_POSTER_SCRIPT + '\\""',
    '  $trig = New-ScheduledTaskTrigger -Daily -At "02:00"',
    '  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries',
    '  Register-ScheduledTask -TaskName "' + DAILY_TASK_NAME + '" -TaskPath "\\' + TASK_FOLDER + '\\" -Action $act -Trigger $trig -Settings $settings -Description "Hexo AutoPost 每日调度器（02:00 生成计划）" | Out-Null',
    '  Write-Output "OK"',
    '} catch {',
    '  Write-Output ("ERR: " + $_.Exception.Message)',
    '  exit 1',
    '}',
    'exit 0'
  ].join('\n');

  const psFile = path.join(__dirname, '_setup_daily.ps1');
  fs.writeFileSync(psFile, '\ufeff' + psContent, 'utf8');

  try {
    const output = execSync('powershell -ExecutionPolicy Bypass -NoProfile -File "' + psFile + '"', {
      encoding: 'utf8',
      windowsHide: true,
      timeout: 15000
    });
    const outStr = (output || '').toString();
    if (outStr.includes('OK')) {
      console.log('[Setup] 每日调度任务创建成功: ' + TASK_FOLDER + '\\' + DAILY_TASK_NAME + '（每天 02:00 执行）');
      return true;
    }
    console.error('[Setup] 任务创建失败: ' + outStr.trim());
    return false;
  } catch (e) {
    const errMsg = ((e.stderr || e.stdout || e.message || '').toString() || '').trim();
    console.error('[Setup] 任务创建失败: ' + (errMsg || '未知错误'));
    return false;
  } finally {
    try { fs.unlinkSync(psFile); } catch (e) {}
  }
}

// ============== 入口 ==============
if (require.main === module) {
  console.log('[Setup] ========== Hexo AutoPost 每日调度器安装 ==========');
  console.log('[Setup] 脚本路径: ' + AUTO_POSTER_SCRIPT);
  console.log('[Setup] 任务名称: ' + TASK_FOLDER + '\\' + DAILY_TASK_NAME);
  console.log('');

  const ok = setupDailyTask();

  if (ok) {
    console.log('');
    console.log('[Setup] 安装完成！');
    console.log('[Setup] 每天 02:00 会自动：');
    console.log('[Setup]   1. 随机选 3 篇文章');
    console.log('[Setup]   2. 生成 3 个随机时间（06:00-23:00，精确到秒）');
    console.log('[Setup]   3. 创建 3 个一次性计划任务发布评论');
    console.log('');
    console.log('[Setup] 查看计划任务：');
    console.log('[Setup]   Get-ScheduledTask | Where-Object {$_.TaskPath -like "*Hexo*"}');
    console.log('[Setup] ');
    console.log('[Setup] 查看任务下次运行时间：');
    console.log('[Setup]   Get-ScheduledTaskInfo -TaskName "' + DAILY_TASK_NAME + '" -TaskPath "\\' + TASK_FOLDER + '\\"');
  } else {
    process.exit(1);
  }
}
