try {
    # Stop any running node processes first
    Stop-Process -Name 'node' -Force -ErrorAction SilentlyContinue

    $agentDir = Join-Path $PSScriptRoot "agent"
    $serverJs = Join-Path $agentDir "server.js"
    $logPath = Join-Path $PSScriptRoot "task_install.log"

    $action = New-ScheduledTaskAction -Execute "node.exe" -Argument "`"$serverJs`"" -WorkingDirectory "$agentDir"
    $trigger = New-ScheduledTaskTrigger -AtStartup
    $principal = New-ScheduledTaskPrincipal -UserId "NT AUTHORITY\SYSTEM" -LogonType ServiceAccount -RunLevel Highest
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Days 365)
    Register-ScheduledTask -TaskName "NexusPCAgent" -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description "Nexus PC Companion Agent Boot Service" -Force
    Start-ScheduledTask -TaskName "NexusPCAgent"
    Set-Content -Path $logPath -Value "SUCCESS"
} catch {
    $logPath = Join-Path $PSScriptRoot "task_install.log"
    Set-Content -Path $logPath -Value $_.Exception.Message
}
