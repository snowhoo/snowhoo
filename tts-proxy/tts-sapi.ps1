Add-Type -AssemblyName System.Speech
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$s.SetOutputToWaveFile("D:\temp_cn.wav")
$s.SelectVoice("Microsoft Huihui Desktop")
$s.Speak("床前明月光，疑是地上霜。举头望明月，低头思故乡。")
$s.Dispose()
Write-Output "done"
