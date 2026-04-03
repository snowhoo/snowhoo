# force UTF-8 so Chinese chars display correctly
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# 单例锁：检查同名进程，排除自身
$lockName = "HexoEmailBot_SingleInstance"
$existing = Get-Process -Name "powershell" -ErrorAction SilentlyContinue | Where-Object {
    $_.Id -ne $PID -and $_.CommandLine -like "*email-cron.ps1*"
}
if ($existing) {
    Write-Host "[$lockName] 已有实例在运行 (PID=$($existing.Id))，退出"
    exit 0
}

Add-Type -Name W -Namespace Win32 -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
[DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();
'@

while ($true) {
    Write-Host "=== HexoEmailBot === [Running...]"

    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = "node"
    $psi.Arguments = "D:\hexo\hexo-bot\email-to-hexo.js"
    $psi.WorkingDirectory = "D:\hexo\hexo-bot"
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true

    $proc = [System.Diagnostics.Process]::Start($psi)
    $stdout = $proc.StandardOutput.ReadToEnd()
    $proc.WaitForExit()

    # show only our log lines, skip imapflow JSON noise
    $lines = $stdout -split "`n" | Where-Object { $_ -match '\[(recv|post|skip|error|email|debug|deploy|done|暂无|发现)\]' }
    foreach ($l in $lines) { Write-Host $l }

    $wait = Get-Random -Minimum 600 -Maximum 1801
    $end = (Get-Date).AddSeconds($wait)
    $waitMin = [int]($wait / 60)

    Write-Host ""
    Write-Host "=== HexoEmailBot ==="
    Write-Host "Wait: $wait sec ($waitMin min)"
    Write-Host "Run at: $($end.ToString('HH:mm:ss'))"

    $barLen = 40
    while ($true) {
        $now = Get-Date
        $rem = ($end - $now).TotalSeconds
        if ($rem -le 0) { break }
        $mins = [int]($rem / 60)
        $secs = [int]($rem % 60)
        $filled = [int](($wait - $rem) / $wait * $barLen)
        $bar = ("=" * $filled) + ("-" * ($barLen - $filled))
        $pct = [int](($wait - $rem) / $wait * 100)
        Write-Host -NoNewline ("`r  [$mins m $secs s] [$bar] $pct%   ")
        Start-Sleep -Seconds 1
    }
    Write-Host ""
}
