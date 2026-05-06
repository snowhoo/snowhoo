$ErrorActionPreference = 'Stop'
$TASK_FOLDER = 'Hexo-Bot'
$NODE_EXE = 'C:\Program Files\nodejs\node.exe'
$SCRIPT = 'D:\hexo\hexo-bot\AutoPOST\auto-poster.js'
$DAILY_SCRIPT = 'D:\hexo\hexo-bot\AutoPOST\setup-daily-trigger.js'

Write-Output "=== Cleaning up old AutoPost_1/2/3 tasks ==="
foreach ($n in 1..3) {
    Unregister-ScheduledTask -TaskName "AutoPost_$n" -TaskPath "\$TASK_FOLDER\" -Confirm:$false -ErrorAction SilentlyContinue
    Write-Output "  Removed AutoPost_$n"
}

Write-Output ""
Write-Output "=== Rebuilding AutoPost_Daily ==="
# AutoPost_Daily: runs setup-daily-trigger.js at 02:00 daily
Unregister-ScheduledTask -TaskName 'AutoPost_Daily' -TaskPath "\$TASK_FOLDER\" -Confirm:$false -ErrorAction SilentlyContinue

$action = New-ScheduledTaskAction -Execute $NODE_EXE -Argument """$DAILY_SCRIPT"""
$trigger = New-ScheduledTaskTrigger -Daily -At '02:00'
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries

Register-ScheduledTask -TaskName 'AutoPost_Daily' -TaskPath "\$TASK_FOLDER\" -Action $action -Trigger $trigger -Settings $settings -Description "Hexo AutoPost 每日02:00生成随机评论时间计划任务" | Out-Null

$a = (Get-ScheduledTask -TaskName 'AutoPost_Daily' -TaskPath "\$TASK_FOLDER\").Actions[0]
Write-Output "  Execute: $($a.Execute)"
Write-Output "  Arguments: $($a.Arguments)"
Write-Output "  WorkingDirectory: $($a.WorkingDirectory)"
Write-Output ""
Write-Output "=== Done ==="
Remove-Item "$PSScriptRoot\_check_daily.ps1" -Force -ErrorAction SilentlyContinue
