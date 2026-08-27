# Robust Session Reconnect & Console Unlock Script
try {
    $lines = query session
    $targetId = $null
    
    foreach ($line in $lines) {
        # Check for user session
        if ($line -match 'aliye\s+(\d+)\s+' -or $line -match 'console\s+(\d+)\s+') {
            $targetId = $matches[1]
            break
        }
        if ($line -match '\s+(\d+)\s+(Active|Disc)') {
            $targetId = $matches[1]
        }
    }
    
    if (-not $targetId) {
        $targetId = 2
    }
    
    Write-Host "Unlocking Console Session ID: $targetId"
    & tscon.exe $targetId /dest:console
} catch {
    Write-Host "Unlock Exception: $_"
}
