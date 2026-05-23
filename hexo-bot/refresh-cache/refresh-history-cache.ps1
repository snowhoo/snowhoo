# Refresh history-today cache - call asilu API and write to local JSON
# Scheduled task runs daily at 3:00 AM

$apiUrl = "https://api.asilu.com/today"
$jsonFile = "D:\hexo\source\js\sevencolor\history-cache.json"

try {
    $resp = Invoke-WebRequest -Uri $apiUrl -UseBasicParsing -TimeoutSec 30
    $json = $resp.Content | ConvertFrom-Json

    if ($json.code -ne 200) {
        Write-Host "[ERR] API returned code $($json.code)"
        exit 1
    }

    $today = Get-Date
    $dateStr = "$($today.Year)年$($today.Month)月$($today.Day)日"

    # Map API response — keep full fields including link for "百科了解事件"
    $events = $json.data | ForEach-Object {
        @{ year = $_.year; text = $_.title; link = $_.link; type = $_.type }
    }

    $cacheData = @{
        date   = $dateStr
        events = $events
    }

    $cacheJson = $cacheData | ConvertTo-Json -Compress -Depth 3
    # Write JSON without BOM (UTF-8 is safe for JSON files)
    [System.IO.File]::WriteAllText($jsonFile, $cacheJson, [System.Text.UTF8Encoding]::new($false))

    Write-Host "[OK] $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') - cached $($events.Count) events"

    # Git push to trigger GitHub Actions
    Set-Location 'D:\hexo'
    git add 'source/js/sevencolor/history-cache.json'
    git commit -m "[Bot] Auto refresh history-cache $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    git push origin HEAD

    exit 0

} catch {
    Write-Host "[ERR] $_"
    exit 1
}
