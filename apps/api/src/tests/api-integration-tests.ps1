[CmdletBinding()]
param(
    [string]$BaseUrl = "http://localhost:4000",
    [switch]$SkipLogin
)
$ErrorActionPreference = "Stop"
$BaseUrl = $BaseUrl.TrimEnd("/")
$Results = [System.Collections.Generic.List[object]]::new()
$WebSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession

function Test-Api {
    param(
        [string]$Name,
        [ValidateSet("GET","POST","PATCH","PUT","DELETE")][string]$Method,
        [string]$Path,
        [int[]]$Expected = @(200),
        [object]$Body = $null
    )
    $p = @{
        Uri = "$BaseUrl$Path"; Method = $Method; WebSession = $WebSession
        TimeoutSec = 20; UseBasicParsing = $true; ErrorAction = "Stop"
        Headers = @{
    Accept = "application/json"
    Origin = "http://localhost:5173"
}
    }
    if ($null -ne $Body) {
        $p.ContentType = "application/json"
        $p.Body = ConvertTo-Json -InputObject $Body -Depth 20 -Compress
    }
    $actual = $null; $details = ""
    try {
        $r = Invoke-WebRequest @p
        $actual = [int]$r.StatusCode
    } catch {
        if ($_.Exception.Response) {
            try { $actual = [int]$_.Exception.Response.StatusCode } catch {}
        }
        if ($null -eq $actual) { $details = $_.Exception.Message }
    }
    $ok = $Expected -contains $actual
    $Results.Add([pscustomobject]@{
        Test = $Name; Method = $Method; Endpoint = $Path
        Expected = ($Expected -join ","); Actual = $actual
        Result = if ($ok) { "PASS" } else { "FAIL" }; Details = $details
    })
    Write-Host ("[{0}] {1} ({2} {3} -> {4})" -f $(if($ok){"PASS"}else{"FAIL"}),$Name,$Method,$Path,$actual) -ForegroundColor $(if($ok){"Green"}else{"Red"})
    return $actual
}

Write-Host "`nYATIN PORTFOLIO API TEST RUNNER" -ForegroundColor Cyan
Write-Host "Target: $BaseUrl`n" -ForegroundColor DarkCyan

# Basic HTTP/server behaviour
Test-Api "Health endpoint" GET "/health" @(200) | Out-Null
Test-Api "Unknown endpoint returns 404" GET "/__api_test_missing_route__" @(404) | Out-Null

# Anonymous access-control checks
Test-Api "Admin me requires authentication" GET "/api/admin/auth/me" @(401) | Out-Null
Test-Api "Admin sessions requires authentication" GET "/api/admin/sessions" @(401) | Out-Null
Test-Api "Recovery codes requires authentication" GET "/api/admin/recovery-codes" @(401) | Out-Null

# Invalid login must not create a session.
$badLogin = @{ email = "api-test-invalid@example.invalid"; password = "NotARealPassword!123" }
Test-Api "Invalid credentials are rejected" POST "/api/admin/auth/login" @(400,401,422) $badLogin | Out-Null

if (-not $SkipLogin) {
    Write-Host "`nOptional authenticated read-only checks" -ForegroundColor Yellow
    $email = Read-Host "Admin email (Enter to skip)"
    if (-not [string]::IsNullOrWhiteSpace($email)) {
        $secure = Read-Host "Admin password" -AsSecureString
        $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
        try { $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
        finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }

        $loginBody = @{ email = $email; password = $plain }
        $loginStatus = Test-Api "Admin login" POST "/api/admin/auth/login" @(200) $loginBody
        $plain = $null; $loginBody = $null; $secure = $null

        if ($loginStatus -eq 200) {
            Test-Api "Authenticated admin profile" GET "/api/admin/auth/me" @(200) | Out-Null
            Test-Api "Read admin sessions" GET "/api/admin/sessions" @(200) | Out-Null
            Test-Api "Read recovery-code status" GET "/api/admin/recovery-codes" @(200) | Out-Null
            Test-Api "Admin logout" POST "/api/admin/auth/logout" @(200) | Out-Null
            Test-Api "Logged-out session is rejected" GET "/api/admin/auth/me" @(401) | Out-Null
        }
    }
}

Write-Host "`n========== SUMMARY ==========" -ForegroundColor Cyan
$Results | Format-Table -AutoSize -Wrap
$passed = @($Results | Where-Object Result -eq "PASS").Count
$failed = @($Results | Where-Object Result -eq "FAIL").Count
Write-Host "Passed: $passed | Failed: $failed"
$csv = Join-Path (Get-Location) ("api-test-results-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".csv")
$Results | Export-Csv -NoTypeInformation -Encoding UTF8 -Path $csv
Write-Host "CSV report saved to: $csv" -ForegroundColor DarkCyan
if ($failed -gt 0) { exit 1 } else { exit 0 }
