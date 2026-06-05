# 批量为 Hexo 文章添加 cover 字段（提取正文第一张图片）

$postsDir = "d:\hexo\source\_posts"
$logFile = "d:\hexo\scripts\cover-update-log.txt"
$processedCount = 0
$skippedCount = 0
$errorCount = 0

# 清空日志
"批量添加 cover 字段执行日志 - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" | Out-File -FilePath $logFile -Encoding UTF8
"=" * 60 | Out-File -FilePath $logFile -Append -Encoding UTF8

Get-ChildItem -Path $postsDir -Filter "*.md" | ForEach-Object {
    $filePath = $_.FullName
    $fileName = $_.Name
    $content = Get-Content -Path $filePath -Raw -Encoding UTF8
    
    # 检查是否已有 cover 字段
    $hasCover = $content -match '^cover:\s*.+$'
    if ($hasCover) {
        $skippedCount++
        "[$(Get-Date -Format 'HH:mm:ss')] 跳过 (已有 cover): $fileName" | Out-File -FilePath $logFile -Append -Encoding UTF8
        return
    }
    
    # 提取 front-matter 结束标记
    $frontMatterEnd = $content.IndexOf("---", 3)
    if ($frontMatterEnd -eq -1) {
        $errorCount++
        "[$(Get-Date -Format 'HH:mm:ss')] 错误 (无 front-matter): $fileName" | Out-File -FilePath $logFile -Append -Encoding UTF8
        return
    }
    
    # 提取正文第一张图片 ![alt](src)
    $bodyContent = $content.Substring($frontMatterEnd + 3)
    $imagePattern = '!\[([^\]]*)\]\(([^)]+)\)'
    $match = [regex]::Match($bodyContent, $imagePattern)
    
    if ($match.Success) {
        $imagePath = $match.Groups[2].Value
        
        # 在 front-matter 末尾添加 cover 字段
        $newFrontMatterEnd = $content.IndexOf("---", 3)
        $insertPos = $content.LastIndexOf("`n", $newFrontMatterEnd) + 1
        if ($insertPos -le 0) {
            $insertPos = $newFrontMatterEnd + 3
        }
        
        $newContent = $content.Insert($insertPos, "cover: $imagePath`n")
        
        # 保存文件
        $newContent | Out-File -FilePath $filePath -Encoding UTF8 -NoNewline
        $processedCount++
        "[$(Get-Date -Format 'HH:mm:ss')] 已处理：$fileName -> cover: $imagePath" | Out-File -FilePath $logFile -Append -Encoding UTF8
    } else {
        $skippedCount++
        "[$(Get-Date -Format 'HH:mm:ss')] 跳过 (无图片): $fileName" | Out-File -FilePath $logFile -Append -Encoding UTF8
    }
}

"=" * 60 | Out-File -FilePath $logFile -Append -Encoding UTF8
"执行完成 - $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" | Out-File -FilePath $logFile -Append -Encoding UTF8
"处理成功：$processedCount 篇 | 跳过：$skippedCount 篇 | 错误：$errorCount 篇" | Out-File -FilePath $logFile -Append -Encoding UTF8

Write-Host "Execution completed!"
Write-Host "Processed: $processedCount articles"
Write-Host "Skipped: $skippedCount articles"
Write-Host "Errors: $errorCount articles"
Write-Host "Log file: $logFile"
