# 刷新博客「历史上的今天」localStorage 缓存
# 每天 00:01 运行，为当天所有访客预填缓存
$url = "https://snowhoo.net/"
$wait = 8

try {
    $ie = New-Object -ComObject InternetExplorer.Application
    $ie.Visible = $false
    $ie.Silent = $true
    $ie.Navigate($url)

    # 等待页面加载
    while ($ie.Busy -or $ie.ReadyState -ne 4) {
        Start-Sleep -Milliseconds 500
    }

    # 等待 JS 执行完毕（localStorage 写入）
    Start-Sleep -Seconds $wait

    $ie.Quit()
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($ie) | Out-Null
    Write-Host "OK at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
} catch {
    Write-Host "ERROR: $_"
    try { if ($ie) { $ie.Quit() } } catch {}
}
