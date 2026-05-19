# 刷新博客「历史上的今天」localStorage 缓存
# 每天 00:01 运行，只请求专用缓存刷新页面（极轻量）
$url = "https://snowhoo.net/refresh-history-cache.html"
$wait = 90

try {
    $ie = New-Object -ComObject InternetExplorer.Application
    $ie.Visible = $false
    $ie.Silent = $true
    $ie.Navigate($url)

    while ($ie.Busy -or $ie.ReadyState -ne 4) {
        Start-Sleep -Milliseconds 500
    }

    Start-Sleep -Seconds $wait

    $ie.Quit()
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($ie) | Out-Null
    Write-Host "OK at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
} catch {
    Write-Host "ERROR: $_"
    try { if ($ie) { $ie.Quit() } } catch {}
}
