$rule = Get-NetFirewallRule -DisplayName "TTS-Proxy-3001"
$portFilter = Get-NetFirewallPortFilter -AssociatedNetFirewallRule $rule
Write-Output "Port: $($portFilter.LocalPort)"
Write-Output "Protocol: $($portFilter.Protocol)"
Write-Output "In: $($portFilter.IN_Enabled)"
Write-Output "Out: $($portFilter.OUT_Enabled)"
Write-Output "Rule enabled: $($rule.Enabled)"
Write-Output "Direction: $($rule.Direction)"
Write-Output "Action: $($rule.Action)"
Write-Output ""
Write-Output "Testing port 3001 listener:"
$tcp = Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue
if ($tcp) {
    $tcp | Format-Table LocalAddress, LocalPort, State
} else {
    Write-Output "No listener on 3001"
}
