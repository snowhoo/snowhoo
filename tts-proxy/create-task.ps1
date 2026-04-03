$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument '/c start "" /b node D:\hexo\tts-proxy\server.js'
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
Register-ScheduledTask -TaskName "HexoTTS" -Action $action -Trigger $trigger -Settings $settings -Force
Write-Output "Task registered"
