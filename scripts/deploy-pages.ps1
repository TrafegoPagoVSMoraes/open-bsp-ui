<#
.SYNOPSIS
    Deploy OpenBSP UI to Cloudflare Pages with Supabase environment variables.

.DESCRIPTION
    This script builds the Vite/React application with production Supabase credentials
    and deploys to Cloudflare Pages. It securely prompts for the anon key using
    Read-Host -AsSecureString and cleans up environment variables after execution.

.NOTES
    - Requires: Node.js, npm, npx, wrangler (authenticated)
    - Project: open-bsp (Direct Upload)
    - Branch: main
    - Supabase Project: wiqzhkxjraarkesqlwzl
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [ValidateNotNullOrEmpty()]
    [string]$SupabaseUrl = "https://wiqzhkxjraarkesqlwzl.supabase.co",

    [Parameter(Mandatory = $false)]
    [string]$ProjectName = "open-bsp",

    [Parameter(Mandatory = $false)]
    [string]$Branch = "main",

    [Parameter(Mandatory = $false)]
    [string]$DistPath = "dist"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Initialize variables before try block
$secureKey = $null
$anonKey = $null
$locationPushed = $false

# Determine repo root automatically using $PSScriptRoot
$repoRoot = Split-Path -Parent $PSScriptRoot

# Convert SecureString to plain text (only in memory, never logged)
function ConvertFrom-SecureStringToPlainText {
    param([System.Security.SecureString]$SecureString)
    $ptr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureString)
    try {
        return [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
    }
    finally {
        [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
    }
}

# Validate the anon key format and role without exposing the key
function Validate-AnonKey {
    param([string]$Key)

    if ($Key -match '^sb_secret_') {
        Write-Error "Key validation FAILED: sb_secret_ keys are not allowed (service role)."
        return $false
    }

    if ($Key -match '^sb_publishable_') {
        # Modern publishable key format - accept
        return $true
    }

    # Legacy JWT format - decode payload in memory
    try {
        $parts = $Key.Split('.')
        if ($parts.Count -ne 3) {
            Write-Error "Key validation FAILED: Invalid JWT format (expected 3 parts)."
            return $false
        }

        $payloadB64 = $parts[1]
        # Add padding if needed
        $padLength = 4 - ($payloadB64.Length % 4)
        if ($padLength -lt 4) {
            $payloadB64 += '=' * $padLength
        }
        $payloadBytes = [Convert]::FromBase64String($payloadB64)
        $payloadJson = [Text.Encoding]::UTF8.GetString($payloadBytes)
        $payload = $payloadJson | ConvertFrom-Json

        if ($payload.role -eq 'service_role') {
            Write-Error "Key validation FAILED: service_role detected in JWT payload."
            return $false
        }

        if ($payload.role -ne 'anon') {
            Write-Error "Key validation FAILED: Expected role 'anon', found '$($payload.role)'."
            return $false
        }

        return $true
    }
    catch {
        Write-Error "Key validation FAILED: Could not decode JWT payload."
        return $false
    }
}

# Validate all JS bundles for expected content
function Validate-Bundle {
    param([string]$DistPath, [string]$AnonKey)

    $jsFiles = Get-ChildItem -Path "$DistPath\assets" -Filter "*.js" -File
    if (-not $jsFiles) {
        Write-Error "No JS bundles found in $DistPath\assets"
        return $false
    }

    $urlFound = $false
    $keyFound = $false
    $secretKeyFound = $false
    $serviceRoleFound = $false

    foreach ($file in $jsFiles) {
        $content = Get-Content -Path $file.FullName -Raw

        if ($content -match "wiqzhkxjraarkesqlwzl\.supabase\.co") {
            $urlFound = $true
        }

        # Check if the provided anon key (or its first segment) appears in bundle
        # Use first 20 chars of key as fingerprint (safe, not the full key)
        if ($AnonKey.Length -ge 20) {
            $fingerprint = $AnonKey.Substring(0, 20)
            if ($content -match [Regex]::Escape($fingerprint)) {
                $keyFound = $true
            }
        }

        if ($content -match "sb_secret_") {
            $secretKeyFound = $true
        }

        if ($content -match '"role"\s*:\s*"service_role"') {
            $serviceRoleFound = $true
        }
    }

    if (-not $urlFound) {
        Write-Error "Bundle validation FAILED: wiqzhkxjraarkesqlwzl.supabase.co NOT found in any bundle."
        return $false
    }

    if (-not $keyFound) {
        Write-Warning "Bundle validation: Provided anon key fingerprint NOT found in bundles. This may be expected if key is not inlined."
    }

    if ($secretKeyFound) {
        Write-Error "Bundle validation FAILED: sb_secret_ pattern found in bundles."
        return $false
    }

    if ($serviceRoleFound) {
        Write-Error "Bundle validation FAILED: service_role pattern found in bundles."
        return $false
    }

    # localhost:9999 is library dead code - warning only, not failure
    $anyLocalhost = $false
    foreach ($file in $jsFiles) {
        $content = Get-Content -Path $file.FullName -Raw
        if ($content -match "localhost:9999") {
            $anyLocalhost = $true
            break
        }
    }
    if ($anyLocalhost) {
        Write-Warning "Bundle contains 'localhost:9999' (supabase-js default fallback). This is expected dead code when real URL is present."
    }

    Write-Host "Bundle validation PASSED: Supabase production URL confirmed, no secret keys detected."
    return $true
}

# Main deployment logic
try {
    Push-Location $repoRoot
    $locationPushed = $true

    Write-Host "=== OpenBSP UI - Cloudflare Pages Deploy ===" -ForegroundColor Cyan
    Write-Host "Supabase URL: $SupabaseUrl"
    Write-Host "Project: $ProjectName"
    Write-Host "Branch: $Branch"
    Write-Host "Repo root: $repoRoot"
    Write-Host ""

    # Prompt for anon key securely
    Write-Host "Enter VITE_SUPABASE_ANON_KEY (input hidden):" -NoNewline
    $secureKey = Read-Host -AsSecureString

    if (-not $secureKey -or $secureKey.Length -eq 0) {
        Write-Error "No key provided. Aborting."
        throw "No key provided"
    }

    $anonKey = ConvertFrom-SecureStringToPlainText -SecureString $secureKey
    $secureKey.Dispose()
    $secureKey = $null

    # Validate key before using
    if (-not (Validate-AnonKey -Key $anonKey)) {
        throw "Key validation failed"
    }

    # Set environment variables for this process only
    $env:VITE_SUPABASE_URL = $SupabaseUrl
    $env:VITE_SUPABASE_ANON_KEY = $anonKey

    Write-Host "Environment variables set for build process."
    Write-Host ""

    # Build
    Write-Host "Running: npm run build" -ForegroundColor Yellow
    npm run build
    $buildExitCode = $LASTEXITCODE
    if ($buildExitCode -ne 0) {
        Write-Error "Build failed (exit code: $buildExitCode). Aborting deploy."
        throw "Build failed with exit code $buildExitCode"
    }

    Write-Host "Build completed successfully." -ForegroundColor Green
    Write-Host ""

    # Validate bundle
    if (-not (Validate-Bundle -DistPath $DistPath -AnonKey $anonKey)) {
        Write-Error "Bundle validation failed. Aborting deploy."
        throw "Bundle validation failed"
    }

    Write-Host ""

    # Explicit confirmation before deploy
    Write-Host "Deploy ready. Type DEPLOY to publish to project '$ProjectName' (branch: $Branch):" -ForegroundColor Yellow
    $confirm = Read-Host
    if ($confirm -ne 'DEPLOY') {
        Write-Host "Deploy cancelled by user." -ForegroundColor Gray
        throw "Deploy cancelled"
    }

    # Deploy
    Write-Host "Running: npx wrangler pages deploy $DistPath --project-name=$ProjectName --branch=$Branch" -ForegroundColor Yellow
    npx wrangler pages deploy $DistPath --project-name=$ProjectName --branch=$Branch
    $deployExitCode = $LASTEXITCODE
    if ($deployExitCode -ne 0) {
        Write-Error "Deploy failed (exit code: $deployExitCode)."
        throw "Deploy failed with exit code $deployExitCode"
    }

    Write-Host ""
    Write-Host "=== Deploy completed successfully ===" -ForegroundColor Green
}
catch {
    # Re-throw to ensure finally runs, but don't exit the session
    Write-Error "Script terminated: $_"
}
finally {
    # Cleanup: remove environment variables from process
    if (Test-Path Env:VITE_SUPABASE_URL) {
        Remove-Item Env:VITE_SUPABASE_URL -ErrorAction SilentlyContinue
    }
    if (Test-Path Env:VITE_SUPABASE_ANON_KEY) {
        Remove-Item Env:VITE_SUPABASE_ANON_KEY -ErrorAction SilentlyContinue
    }

    # Dispose SecureString if still exists
    if ($secureKey) {
        try { $secureKey.Dispose() } catch { }
        $secureKey = $null
    }

    # Clear the anon key variable
    if ($anonKey) {
        $anonKey = $null
    }

    # Best effort garbage collection
    try {
        [System.GC]::Collect()
        [System.GC]::WaitForPendingFinalizers()
    }
    catch { }

    # Restore original location if Push-Location succeeded
    if ($locationPushed) {
        try {
            Pop-Location
        }
        catch {
            Write-Warning "Não foi possível restaurar o diretório anterior."
        }
    }

    Write-Host "Cleanup completed (best effort)." -ForegroundColor Gray
}