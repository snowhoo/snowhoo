$keep = @('img-001.jpg','img-002.jpg','img-003.jpg','img-004.jpg','img-005.jpg')
Get-ChildItem 'D:\hexo\source\images\ai-lobster-review\*.jpg' | Where-Object { $_.Name -notin $keep } | ForEach-Object {
  Remove-Item $_.FullName -Force
  Write-Host "removed: $($_.Name)"
}
