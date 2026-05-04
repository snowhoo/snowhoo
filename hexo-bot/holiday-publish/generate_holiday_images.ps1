param(
    [string]$HolidayName = "",
    [string]$ApiKey = "sk-xktugxweaiuplmvzkcvgyfrqzjuhzgyitzekngixbakclgrr",
    [switch]$All
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$holidaysFile = Join-Path $PSScriptRoot "holidays.json"
$holidays = Get-Content $holidaysFile -Raw -Encoding UTF8 | ConvertFrom-Json

$apiUrl = "https://api.siliconflow.cn/v1/images/generations"
$headers = @{
    "Authorization" = "Bearer $ApiKey"
    "Content-Type" = "application/json"
}

$IMAGE_MODEL = "Kwai-Kolors/Kolors"
$coverDir = "D:\hexo\source\images\holidays"
$illustrationDir = "D:\hexo\source\images\holidays\illustrations"

if (-not (Test-Path $coverDir)) { New-Item -ItemType Directory -Path $coverDir -Force | Out-Null }
if (-not (Test-Path $illustrationDir)) { New-Item -ItemType Directory -Path $illustrationDir -Force | Out-Null }

function Call-ImageAPI {
    param($prompt, $outFile, $label)
    $body = @{
        model = $IMAGE_MODEL
        prompt = $prompt
        image_size = "1024x1024"
        num_inference_steps = 30
    } | ConvertTo-Json -Depth 10

    $maxRetries = 3
    $retry = 0
    while ($retry -le $maxRetries) {
        try {
            $resp = Invoke-RestMethod -Uri $apiUrl -Headers $headers -Method Post -Body $body
            if ($resp.data[0].url) {
                Invoke-WebRequest -Uri $resp.data[0].url -OutFile $outFile
                Write-Host " OK" -ForegroundColor Green
                return $true
            }
        } catch {
            if ($_.Exception.Response.StatusCode -eq 429) {
                $retry++
                if ($retry -le $maxRetries) {
                    Write-Host " 限流，等待10秒后重试 ($retry/$maxRetries)..." -ForegroundColor Yellow
                    Start-Sleep -Seconds 10
                } else {
                    Write-Host " 失败: 超出重试次数" -ForegroundColor Red
                    return $false
                }
            } else {
                Write-Host " 失败: $($_.Exception.Message)" -ForegroundColor Red
                return $false
            }
        }
    }
}

function Generate-HolidayImages {
    param($holiday)

    $name = $holiday.name
    $pinyin = $holiday.pinyin
    $coverPrompt = $holiday.cover_prompt
    $illustrationPrompt = $holiday.illustration_prompt

    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "正在生成: $name ($pinyin)" -ForegroundColor Green

    $coverFile = Join-Path $coverDir "holiday-$pinyin-cover.png"
    Write-Host "  生成封面图..." -NoNewline
    Start-Sleep -Seconds 5
    Call-ImageAPI -prompt $coverPrompt -outFile $coverFile -label "封面"

    $illustrationFile = Join-Path $illustrationDir "holiday-$pinyin-01.png"
    Write-Host "  生成配图..." -NoNewline
    Start-Sleep -Seconds 10
    Call-ImageAPI -prompt $illustrationPrompt -outFile $illustrationFile -label "配图"

    Write-Host ""
}

if ($All) {
    foreach ($h in $holidays.holidays) {
        Generate-HolidayImages -holiday $h
    }
} elseif ($HolidayName) {
    $target = $holidays.holidays | Where-Object { $_.name -eq $HolidayName -or $_.pinyin -eq $HolidayName }
    if ($target) {
        Generate-HolidayImages -holiday $target
    } else {
        Write-Host "未找到节假日: $HolidayName" -ForegroundColor Red
    }
} else {
    Write-Host "用法: .\generate_holiday_images.ps1 -All" -ForegroundColor Yellow
    Write-Host "      .\generate_holiday_images.ps1 -HolidayName ""春节""" -ForegroundColor Yellow
}
