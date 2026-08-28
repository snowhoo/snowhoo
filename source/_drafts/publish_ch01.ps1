Copy-Item "D:\hexo\source\_drafts\mlgm01.md" "D:\hexo\source\_posts\mlgm01.md" -Force
Unregister-ScheduledTask -TaskName "AutoNovel_Ch1" -Confirm:$false
