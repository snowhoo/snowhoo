$now = Get-Date
$email = Get-Date '2026-05-07 15:50:00'
Write-Host ("当前: " + $now.ToString("yyyy-MM-dd HH:mm:ss"))
Write-Host ("邮件: " + $email.ToString("yyyy-MM-dd HH:mm:ss"))
Write-Host ("间隔: " + ($now - $email).TotalMinutes + " 分钟")