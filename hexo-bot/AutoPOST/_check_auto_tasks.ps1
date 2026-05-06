Get-ScheduledTask -TaskPath '\Hexo-Bot\' -ErrorAction SilentlyContinue | Where-Object { $_.TaskName -like 'AutoPost*' } | ForEach-Object {
  $info = Get-ScheduledTaskInfo -TaskName $_.TaskName -TaskPath $_.TaskPath -ErrorAction SilentlyContinue
  $acts = if ($info -and $info.Actions) { $info.Actions } else { @() }
  $act = if ($acts.Count -gt 0) { $acts[0] } else { $null }
  [PSCustomObject]@{
    Name = $_.TaskName
    State = $_.State
    LastResult = if ($info) { $info.LastTaskResult } else { 'N/A' }
    NextRun = if ($info) { $info.NextRunTime } else { 'N/A' }
    Execute = if ($act) { $act.Execute } else { 'N/A' }
    Arguments = if ($act) { $act.Arguments } else { 'N/A' }
  }
} | Format-List