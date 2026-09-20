param(
    [ValidateSet('Start', 'Stop')][string]$Action = 'Start',
    [ValidateRange(1024, 65535)][int]$Port = 4444,
    [ValidateRange(1024, 65535)][int]$BackendPort = 4096,
    [ValidateRange(10, 1800)][int]$ReadyTimeout = 120,
    [switch]$NoBrowser
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$logs = Join-Path $root 'logs\launcher'
$stateFile = Join-Path $logs 'processes.json'
$owned = @()
$lock = $null

function Get-Owned($record) {
    $process = Get-Process -Id $record.id -ErrorAction SilentlyContinue
    if (!$process) { return $null }
    if ($process.StartTime.ToUniversalTime().Ticks.ToString() -ne $record.started) { return $null }
    if ($process.Path -ne $record.executable) { return $null }
    $info = Get-CimInstance Win32_Process -Filter "ProcessId = $($record.id)"
    if (!$info.CommandLine.Contains($record.marker)) { return $null }
    return $process
}

function Stop-Owned($records) {
    foreach ($record in @($records)) {
        $process = Get-Owned $record
        if (!$process) { continue }
        Write-Host "Stopping launcher-owned $($record.name) (PID $($record.id))"
        & taskkill.exe /PID $record.id /T /F
        if ($LASTEXITCODE -ne 0 -and (Get-Owned $record)) { throw "Could not stop PID $($record.id)." }
    }
}

function Save-State {
    @{ root = $root; processes = @($script:owned); port = $Port; backendPort = $BackendPort } |
        ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $stateFile -Encoding UTF8
}

function Start-Owned([string]$name, [string[]]$arguments, [string]$marker) {
    $process = Start-Process -FilePath $script:bun -ArgumentList $arguments -WorkingDirectory $root -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $logs "$name.log") -RedirectStandardError (Join-Path $logs "$name.error.log")
    $record = @{ id = $process.Id; started = $process.StartTime.ToUniversalTime().Ticks.ToString(); executable = $script:bun; marker = $marker; name = $name }
    $script:owned += $record
    Save-State
    return $record
}

function Wait-Ready([string]$url, $record, [hashtable]$headers = @{}) {
    $deadline = (Get-Date).AddSeconds($ReadyTimeout)
    while ((Get-Date) -lt $deadline) {
        if (!(Get-Owned $record)) { throw "$($record.name) exited. Read $logs\$($record.name).error.log" }
        try {
            $response = Invoke-RestMethod -Uri $url -Headers $headers -TimeoutSec 3 -UseBasicParsing
            if ($response.healthy -eq $true -or ($response.launcher -eq 'opencodefork' -and $response.pid -eq $record.id)) { return }
        } catch { }
        Start-Sleep -Milliseconds 500
    }
    throw "Timed out waiting for $url. See $logs; increase -ReadyTimeout if this machine needs longer."
}

function Get-FreePort([int]$preferred) {
    for ($candidate = $preferred; $candidate -le [Math]::Min(65535, $preferred + 100); $candidate++) {
        $listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $candidate)
        try {
            $listener.Start()
            if ($candidate -ne $preferred) { Write-Host "Port $preferred is occupied; using $candidate. Existing processes are untouched." }
            return $candidate
        } catch { } finally { $listener.Stop() }
    }
    throw "No free localhost port near $preferred. Run quickstart.bat -Port 4450 -BackendPort 4100."
}

function Open-App([int]$webPort) {
    $directory = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($root)).TrimEnd('=').Replace('+', '-').Replace('/', '_')
    $url = "http://127.0.0.1:$webPort/$directory/session"
    if ($env:OPENCODE_SERVER_PASSWORD) {
        $username = if ($env:OPENCODE_SERVER_USERNAME) { $env:OPENCODE_SERVER_USERNAME } else { 'opencode' }
        $token = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("${username}:$env:OPENCODE_SERVER_PASSWORD"))
        $url += '?auth_token=' + [Uri]::EscapeDataString($token)
    }
    Write-Host "OpenCode Fork v1.01 ready at http://127.0.0.1:$webPort"
    Write-Host 'Existing user/project configuration is preserved. Use stop.bat to stop only this launcher.'
    if (!$NoBrowser) { Start-Process $url }
}

try {
    if (!(Test-Path -LiteralPath $root)) { throw 'Project directory is missing.' }
    New-Item -ItemType Directory -Path $logs -Force | Out-Null
    try { $lock = [IO.File]::Open((Join-Path $logs 'launcher.lock'), 'OpenOrCreate', 'ReadWrite', 'None') }
    catch { throw 'Another launcher is busy. Wait for it to finish before starting or stopping.' }
    $previous = if (Test-Path -LiteralPath $stateFile) { Get-Content -LiteralPath $stateFile -Raw | ConvertFrom-Json } else { $null }
    if ($previous -and $previous.root -ne $root) { throw "Launcher state belongs to another folder. Inspect $stateFile." }
    if ($Action -eq 'Stop') {
        if ($previous) {
            Stop-Owned $previous.processes
            Remove-Item -LiteralPath $stateFile -Force
        }
        Write-Host 'Launcher services stopped. Other applications were not touched.'
        exit 0
    }
    $headers = @{}
    if ($env:OPENCODE_SERVER_PASSWORD) {
        $username = if ($env:OPENCODE_SERVER_USERNAME) { $env:OPENCODE_SERVER_USERNAME } else { 'opencode' }
        $headers.Authorization = 'Basic ' + [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("${username}:$env:OPENCODE_SERVER_PASSWORD"))
    }
    if ($previous) {
        $alive = @($previous.processes | Where-Object { Get-Owned $_ })
        if ($alive.Count -eq 2) {
            Wait-Ready "http://127.0.0.1:$($previous.backendPort)/global/health" ($alive | Where-Object name -eq 'backend') $headers
            Wait-Ready "http://127.0.0.1:$($previous.port)/__launcher/health" ($alive | Where-Object name -eq 'frontend')
            Open-App $previous.port
            exit 0
        }
        if ($alive.Count -gt 0) { throw 'A previous launcher is only partly running. Run stop.bat, then quickstart.bat.' }
        Remove-Item -LiteralPath $stateFile -Force
    }
    Write-Host '[1/4] Checking Bun and dependencies...'
    $command = Get-Command bun.exe -ErrorAction SilentlyContinue
    if (!$command) { throw 'Bun is required. Install Bun, reopen this launcher, and retry. No desktop prerequisites are needed.' }
    $script:bun = $command.Source
    $env:ELECTRON_SKIP_BINARY_DOWNLOAD = '1'
    if (!(Test-Path -LiteralPath (Join-Path $root 'packages\app\node_modules\vite\bin\vite.js')) -or !(Test-Path -LiteralPath (Join-Path $root 'packages\opencode\node_modules\effect\package.json'))) {
        Write-Host 'Installing locked workspace dependencies (without the Electron download)...'
        & $bun install --frozen-lockfile --cwd $root
        if ($LASTEXITCODE -ne 0) { throw 'Dependency install failed. Retry: bun install --frozen-lockfile' }
    }
    if (!(Test-Path -LiteralPath (Join-Path $root '.opencode\node_modules\@tarquinen\opencode-dcp\dist\index.js'))) {
        Write-Host 'Installing existing project plugin dependencies...'
        & npm.cmd ci --prefix (Join-Path $root '.opencode') --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { throw 'Project plugin install failed. Retry: npm ci --prefix .opencode' }
    }
    $BackendPort = Get-FreePort $BackendPort
    $Port = Get-FreePort $Port
    if ($Port -eq $BackendPort) { $Port = Get-FreePort ($Port + 1) }
    Write-Host '[2/4] Building current local browser UI (never the hosted upstream app)...'
    $env:SENTRY_AUTH_TOKEN = ''
    $env:VITE_SENTRY_DSN = ''
    $build = Start-Process -FilePath $bun -ArgumentList @('run', 'build') -WorkingDirectory (Join-Path $root 'packages\app') -NoNewWindow -Wait -PassThru `
        -RedirectStandardOutput (Join-Path $logs 'build.log') -RedirectStandardError (Join-Path $logs 'build.error.log')
    if ($build.ExitCode -ne 0) { throw "Browser build failed. Read $logs\build.error.log" }
    Write-Host '[3/4] Starting localhost fork backend...'
    $entry = Join-Path $root 'packages\opencode\src\index.ts'
    $backend = Start-Owned 'backend' @('run', ('"' + $entry + '"'), 'serve', '--hostname', '127.0.0.1', '--port', "$BackendPort", '--mdns=false') $entry
    Wait-Ready "http://127.0.0.1:$BackendPort/global/health" $backend $headers
    Write-Host '[4/4] Starting local production frontend...'
    $web = Join-Path $PSScriptRoot 'launcher-web.ts'
    $frontend = Start-Owned 'frontend' @('run', ('"' + $web + '"'), ('"' + (Join-Path $root 'packages\app\dist') + '"'), "http://127.0.0.1:$BackendPort", "$Port") $web
    Wait-Ready "http://127.0.0.1:$Port/__launcher/health" $frontend
    Wait-Ready "http://127.0.0.1:$Port/global/health" $frontend $headers
    Open-App $Port
} catch {
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    if ($owned.Count -gt 0) {
        try { Stop-Owned $owned; Remove-Item -LiteralPath $stateFile -Force -ErrorAction SilentlyContinue }
        catch { Write-Host "Cleanup needs attention: $($_.Exception.Message). Run stop.bat." }
    }
    exit 1
} finally {
    if ($lock) { $lock.Dispose() }
}
