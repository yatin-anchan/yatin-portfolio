[CmdletBinding()]
param(
    [Parameter()]
    [string]$BaseUrl = "http://localhost:3000",

    [Parameter()]
    [string]$TrustedOrigin = "http://localhost:5173",

    [Parameter()]
    [switch]$SkipAuthenticatedChecks,

    [Parameter()]
    [switch]$AllowTestAccountLogin
)

$ErrorActionPreference = "Stop"
$BaseUrl = $BaseUrl.TrimEnd("/")
$TrustedOrigin = $TrustedOrigin.TrimEnd("/")

$Results = [System.Collections.Generic.List[object]]::new()
$Session = [Microsoft.PowerShell.Commands.WebRequestSession]::new()
$script:AdminPassword = $null

function Add-Result {
    param(
        [string]$Name,
        [string]$Method,
        [string]$Path,
        [string]$Expected,
        [Nullable[int]]$Actual,
        [bool]$Passed,
        [string]$Details = ""
    )

    $Results.Add([pscustomobject]@{
        Test     = $Name
        Method   = $Method
        Endpoint = $Path
        Expected = $Expected
        Actual   = if ($null -eq $Actual) { "" } else { [string]$Actual }
        Result   = if ($Passed) { "PASS" } else { "FAIL" }
        Details  = $Details
    })

    $status = if ($Passed) { "PASS" } else { "FAIL" }
    $color = if ($Passed) { "Green" } else { "Red" }
    $actualText = if ($null -eq $Actual) { "NO RESPONSE" } else { [string]$Actual }
    Write-Host ("[{0}] {1} ({2} {3} -> {4})" -f $status, $Name, $Method, $Path, $actualText) -ForegroundColor $color
}

function Invoke-ApiCheck {
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][ValidateSet("GET","POST","PATCH","PUT","DELETE")][string]$Method,
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][int[]]$Expected,
        [object]$Body = $null,
        [switch]$Authenticated
    )

    $headers = @{
        Accept = "application/json"
        Origin = $TrustedOrigin
    }

    $request = @{
        Uri             = "$BaseUrl$Path"
        Method          = $Method
        WebSession      = $Session
        Headers         = $headers
        TimeoutSec      = 20
        UseBasicParsing = $true
        ErrorAction     = "Stop"
    }

    if ($null -ne $Body) {
        $request.ContentType = "application/json"
        $request.Body = ConvertTo-Json -InputObject $Body -Depth 20 -Compress
    }

    $status = $null
    $responseText = ""

    try {
        $response = Invoke-WebRequest @request
        $status = [int]$response.StatusCode
        $responseText = [string]$response.Content
    }
    catch {
        $response = $_.Exception.Response
        if ($null -ne $response) {
            try { $status = [int]$response.StatusCode } catch {}
            try {
                $stream = $response.GetResponseStream()
                if ($null -ne $stream) {
                    $reader = [System.IO.StreamReader]::new($stream)
                    try { $responseText = $reader.ReadToEnd() }
                    finally { $reader.Dispose() }
                }
            } catch {}
        }
        if ($null -eq $status) {
            $responseText = $_.Exception.Message
        }
    }

    $passed = ($null -ne $status) -and ($Expected -contains $status)
    $details = ""
    if (-not $passed -and $responseText) {
        # Avoid printing response bodies that could contain tokens or personal data.
        try {
            $parsed = $responseText | ConvertFrom-Json -ErrorAction Stop
            if ($parsed.error.code) {
                $details = "API error code: $($parsed.error.code)"
            } elseif ($parsed.error.message) {
                $details = "API error: $($parsed.error.message)"
            } else {
                $details = "Response body captured (redacted)."
            }
        } catch {
            $details = "Response body captured (redacted)."
        }
    }

    Add-Result -Name $Name -Method $Method -Path $Path `
        -Expected ($Expected -join ",") -Actual $status -Passed $passed -Details $details

    return $status
}

Write-Host "`nYATIN PORTFOLIO — FINAL SECURITY REGRESSION RUNNER" -ForegroundColor Cyan
Write-Host "API: $BaseUrl"
Write-Host "Trusted origin: $TrustedOrigin" -ForegroundColor DarkCyan
Write-Host ""
Write-Host "SAFETY MODE: READ-ONLY / NEGATIVE-CASE CHECKS ONLY" -ForegroundColor Yellow
Write-Host "This script does NOT reset passwords, create/delete emails, consume recovery codes," -ForegroundColor Yellow
Write-Host "change security settings, revoke sessions, or send OTP/reset emails." -ForegroundColor Yellow
Write-Host ""

# Public/server behaviour.
Invoke-ApiCheck -Name "Health endpoint" -Method GET -Path "/health" -Expected @(200) | Out-Null
Invoke-ApiCheck -Name "Unknown route returns 404" -Method GET -Path "/__security_test_missing_route__" -Expected @(404) | Out-Null

# Anonymous read access must be denied for protected resources.
$anonymousGets = @(
    @{ Name = "Admin identity requires authentication"; Path = "/api/admin/auth/me" },
    @{ Name = "Admin email list requires authentication"; Path = "/api/admin/emails" },
    @{ Name = "Backup email requires authentication"; Path = "/api/admin/backup-email" },
    @{ Name = "Password-change route requires authentication"; Path = "/api/admin/password/change" },
    @{ Name = "Recovery-code status requires authentication"; Path = "/api/admin/recovery-codes" },
    @{ Name = "Security settings require authentication"; Path = "/api/admin/security-settings" },
    @{ Name = "Admin sessions require authentication"; Path = "/api/admin/sessions" },
    @{ Name = "Admin audit requires authentication"; Path = "/api/admin/audit" },
    @{ Name = "Admin portfolio projects require authentication"; Path = "/api/admin/portfolio/projects" },
    @{ Name = "Admin media route requires authentication"; Path = "/api/admin/media" },
    @{ Name = "Admin media mappings require authentication"; Path = "/api/admin/media-mappings" }
)

foreach ($item in $anonymousGets) {
    Invoke-ApiCheck -Name $item.Name -Method GET -Path $item.Path -Expected @(401, 403) | Out-Null
}

# Anonymous mutation requests must be denied before reaching controller logic.
$anonymousPosts = @(
    @{ Name = "Login-email addition requires authentication"; Path = "/api/admin/emails"; Body = @{ email = "security-test-invalid@example.invalid"; password = "NotARealPassword!123"; currentPassword = "NotARealPassword!123"; trustedCode = "000000" } },
    @{ Name = "Backup-email addition requires authentication"; Path = "/api/admin/backup-email"; Body = @{ email = "security-test-invalid@example.invalid"; currentPassword = "NotARealPassword!123" } },
    @{ Name = "Recovery-code regeneration requires authentication"; Path = "/api/admin/recovery-codes/regenerate"; Body = @{ currentPassword = "NotARealPassword!123" } },
    @{ Name = "Security-settings update requires authentication"; Path = "/api/admin/security-settings"; Body = @{ currentPassword = "NotARealPassword!123"; verificationCode = "000000"; requireDualVerification = $true } },
    @{ Name = "Session revocation requires authentication"; Path = "/api/admin/sessions/revoke-others"; Body = @{} },
    @{ Name = "Portfolio creation requires authentication"; Path = "/api/admin/portfolio/projects"; Body = @{} },
    @{ Name = "Media upload signature requires authentication"; Path = "/api/admin/media/upload-signature"; Body = @{ category = "projects"; resourceType = "image" } }
)

foreach ($item in $anonymousPosts) {
    Invoke-ApiCheck -Name $item.Name -Method POST -Path $item.Path -Expected @(401, 403) -Body $item.Body | Out-Null
}

# Public password-reset response must be generic and not reveal account existence.
$resetKnownShape = Invoke-ApiCheck -Name "Password-reset request returns generic accepted response" `
    -Method POST -Path "/api/admin/auth/forgot-password" -Expected @(202) `
    -Body @{ email = "security-test-nonexistent@example.invalid" }

# Recovery endpoint must reject malformed codes without issuing a session.
Invoke-ApiCheck -Name "Malformed recovery code is rejected by validation" `
    -Method POST -Path "/api/admin/auth/recover" -Expected @(400, 422) `
    -Body @{ email = "security-test-nonexistent@example.invalid"; recoveryCode = "not-a-code" } | Out-Null

# Reset endpoint must reject malformed token shape before password-reset service execution.
Invoke-ApiCheck -Name "Malformed password-reset token is rejected by validation" `
    -Method POST -Path "/api/admin/auth/reset-password" -Expected @(400, 422) `
    -Body @{ token = "invalid"; newPassword = "NotAValidTestPassword!123" } | Out-Null

if (-not $SkipAuthenticatedChecks -and $AllowTestAccountLogin) {
    Write-Host "`nAuthenticated negative-case checks" -ForegroundColor Yellow
    Write-Host "Use ONLY a dedicated test admin on an isolated test database." -ForegroundColor Yellow
    $adminEmail = Read-Host "Dedicated TEST admin email (Enter to skip)"
    if (-not [string]::IsNullOrWhiteSpace($adminEmail)) {
        $secure = Read-Host "Dedicated TEST admin password" -AsSecureString
        $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
        try { $script:AdminPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
        finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }

        $loginStatus = Invoke-ApiCheck -Name "Dedicated test admin login" `
            -Method POST -Path "/api/admin/auth/login" -Expected @(200) `
            -Body @{ email = $adminEmail; password = $script:AdminPassword }

        if ($loginStatus -eq 200) {
            Invoke-ApiCheck -Name "Authenticated admin profile" -Method GET `
                -Path "/api/admin/auth/me" -Expected @(200) | Out-Null
            Invoke-ApiCheck -Name "Authenticated email listing" -Method GET `
                -Path "/api/admin/emails" -Expected @(200) | Out-Null
            Invoke-ApiCheck -Name "Authenticated backup-email status" -Method GET `
                -Path "/api/admin/backup-email" -Expected @(200) | Out-Null
            Invoke-ApiCheck -Name "Authenticated recovery-code status" -Method GET `
                -Path "/api/admin/recovery-codes" -Expected @(200) | Out-Null
            Invoke-ApiCheck -Name "Authenticated security settings" -Method GET `
                -Path "/api/admin/security-settings" -Expected @(200) | Out-Null
            Invoke-ApiCheck -Name "Authenticated sessions listing" -Method GET `
                -Path "/api/admin/sessions" -Expected @(200) | Out-Null

            # Deliberately wrong password: must fail reauthentication without changing account state.
            Invoke-ApiCheck -Name "Wrong password cannot add login email" `
                -Method POST -Path "/api/admin/emails" -Expected @(401) `
                -Body @{
                    email = "security-test-invalid@example.invalid"
                    password = "AnotherInvalidPassword!123"
                    currentPassword = "DefinitelyWrongPassword!123"
                    trustedCode = "000000"
                } | Out-Null

            # No OTP supplied: when dual verification is required, password change must not succeed.
            # The deliberately incorrect current password also ensures no password mutation can occur.
            Invoke-ApiCheck -Name "Password change rejects wrong current password / missing trusted proof" `
                -Method POST -Path "/api/admin/password/change" -Expected @(400, 401) `
                -Body @{
                    currentPassword = "DefinitelyWrongPassword!123"
                    newPassword = "DifferentTestPassword!123"
                } | Out-Null

            # A random UUID cannot reveal or revoke another user's session.
            $randomSessionId = [guid]::NewGuid().ToString()
            Invoke-ApiCheck -Name "Unknown session ID cannot be revoked" `
                -Method DELETE -Path "/api/admin/sessions/$randomSessionId" -Expected @(404) `
                -Body @{} | Out-Null

            # Invalid recovery code must not create a session.
            Invoke-ApiCheck -Name "Invalid recovery code cannot authenticate" `
                -Method POST -Path "/api/admin/auth/recover" -Expected @(401) `
                -Body @{
                    email = $adminEmail
                    recoveryCode = "AAAAAAAA-AAAAAAAA"
                } | Out-Null

            # End the test session created by this script.
            Invoke-ApiCheck -Name "Test admin logout" -Method POST `
                -Path "/api/admin/auth/logout" -Expected @(200) | Out-Null
            Invoke-ApiCheck -Name "Logged-out test session is rejected" -Method GET `
                -Path "/api/admin/auth/me" -Expected @(401) | Out-Null
        }
        $script:AdminPassword = $null
        $secure = $null
    }
 }
elseif (-not $SkipAuthenticatedChecks -and -not $AllowTestAccountLogin) {
    Write-Host "`nAuthenticated checks skipped." -ForegroundColor Yellow
    Write-Host "To enable them, rerun with -AllowTestAccountLogin and use a dedicated test admin/database." -ForegroundColor Yellow
}

Write-Host "`n========== FINAL SECURITY REGRESSION SUMMARY ==========" -ForegroundColor Cyan
$Results | Format-Table -AutoSize -Wrap

$passed = @($Results | Where-Object Result -eq "PASS").Count
$failed = @($Results | Where-Object Result -eq "FAIL").Count
Write-Host "`nPassed: $passed | Failed: $failed" -ForegroundColor $(if ($failed -eq 0) { "Green" } else { "Red" })

$reportPath = Join-Path (Get-Location) (
    "security-final-results-{0}.csv" -f (Get-Date -Format "yyyyMMdd-HHmmss")
)

$Results | Export-Csv -NoTypeInformation -Encoding UTF8 -Path $reportPath

Write-Host ("CSV report: {0}" -f $reportPath) -ForegroundColor DarkCyan

if ($failed -gt 0) {
    exit 1
}
else {
    exit 0
}