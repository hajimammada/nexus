# Robust Session Reconnect & Console Unlock Script (with Auto-Initialization for Fresh Boot)
try {
    function Get-UserSessionId {
        $lines = query session 2>$null
        $found = $null
        foreach ($line in $lines) {
            if ($line -match '(\S+)\s+(\S+)?\s+(\d+)\s+(Active|Disc)') {
                $sessName = $matches[1]
                $userName = $matches[2]
                $id = $matches[3]
                $state = $matches[4]
                if ($id -ne '0' -and $id -ne '65536') {
                    $found = $id
                    if ($userName -match 'aliye' -or $sessName -match 'console') {
                        return $id
                    }
                }
            }
        }
        return $found
    }

    $targetId = Get-UserSessionId

    # If no session initialized yet on fresh boot, force session initialization
    if (-not $targetId) {
        Write-Host "No active session found (Fresh Boot). Initializing session handshake..."
        & tsdiscon.exe 1 2>$null
        & tsdiscon.exe 2 2>$null
        & rundll32.exe user32.dll,LockWorkStation 2>$null
        Start-Sleep -Milliseconds 400
        $targetId = Get-UserSessionId
    }

    # Fallback to session 2 / 1
    if (-not $targetId) {
        $targetId = 2
    }

    Write-Host "Connecting Session ID: $targetId to console..."
    & tscon.exe $targetId /dest:console 2>$null
    if ($LASTEXITCODE -ne 0 -and $targetId -ne 1) {
        & tscon.exe 1 /dest:console 2>$null
    }

    try {
        Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue
        [System.Windows.Forms.SendKeys]::SendWait("{ESC}")
    } catch {}

    Write-Host "Unlock sequence completed successfully."
} catch {
    Write-Host "Unlock Exception: $_"
}
