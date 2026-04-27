$action = New-ScheduledTaskAction -Execute 'node' -Argument 'D:\hexo\hexo-bot\email-bot\email-to-hexo.js'
$bootTrigger = New-ScheduledTaskTrigger -AtStartup
$hourTrigger = New-ScheduledTaskTrigger -Once -At '2026-04-27 12:00:00' -RepetitionInterval (New-TimeSpan -Hours 1)
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType S4U -RunLevel Highest
Register-ScheduledTask -TaskName 'HexoEmailBot' -Action $action -Trigger $bootTrigger,$hourTrigger -Settings $settings -Principal $principal -Force
Write-Host "Done - S4U mode (no window)"