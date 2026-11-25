#requires -Version 5.1
<#
Yatin Portfolio - Backend Verification Runner
Single-file PowerShell orchestrator.

SAFE DEFAULTS:
- Does not provision databases, run migrations, create/delete accounts, send OTPs,
  change passwords, consume recovery codes, revoke sessions, or mutate portfolio data.
- Does not print secret values.
- Database-backed tests are disabled unless explicitly enabled with a dedicated
  test database URL whose database name contains "test".
- Existing app.test.ts tests are run only after the isolated test DB guard passes,
  because the current npm test script loads the root .env file.
- Missing integration coverage is reported as BLOCKED / NOT IMPLEMENTED, not PASS.

Run from the repository root:
  .\backend-verification.ps1

Optional:
  .\backend-verification.ps1 -BaseUrl http://localhost:3000 -TrustedOrigin http://localhost:5173
  $env:PORTFOLIO_TEST_DATABASE_URL = "postgresql://.../portfolio_test?sslmode=require"
  .\backend-verification.ps1 -EnableDatabaseTests
  .\backend-verification.ps1 -RunDependencyAudit

The test database URL is read from the environment and is never printed.
#>

[CmdletBinding()]
param(
    [string]$ProjectRoot = (Get-Location).Path,
    [string]$BaseUrl = "http://localhost:3000",
    [string]$TrustedOrigin = "http://localhost:5173",
    [switch]$EnableDatabaseTests,
    [switch]$RunDependencyAudit,
    [switch]$SkipHttpChecks,
    [switch]$SkipBuildChecks
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$script:Results = New-Object System.Collections.Generic.List[object]
$script:StartedAt = Get-Date
$script:OriginalDatabaseUrl = $env:DATABASE_URL
$script:OriginalNodeEnv = $env:NODE_ENV
$script:TestDatabaseWasSet = $false

function Add-Result {
    param(
        [string]$Phase,
        [string]$Check,
        [ValidateSet("PASS","FAIL","BLOCKED","INFO","SKIP")]
        [string]$Status,
        [string]$Details = ""
    )
    $script:Results.Add([pscustomobject]@{
        Phase = $Phase
        Check = $Check
        Status = $Status
        Details = $Details
        Timestamp = (Get-Date).ToString("s")
    }) | Out-Null

    $color = switch ($Status) {
        "PASS"    { "Green" }
        "FAIL"    { "Red" }
        "BLOCKED" { "Yellow" }
        "SKIP"    { "DarkGray" }
        default   { "Cyan" }
    }
    Write-Host ("[{0}] [{1}] {2} - {3}" -f $Status, $Phase, $Check, $Details) -ForegroundColor $color
}

function Invoke-CheckedCommand {
    param(
        [string]$Phase,
        [string]$Name,
        [string]$FilePath,
        [string[]]$Arguments,
        [string]$WorkingDirectory
    )
    Write-Host "`n> $FilePath $($Arguments -join ' ')" -ForegroundColor DarkCyan
    Push-Location $WorkingDirectory
    try {
        & $FilePath @Arguments
        $exitCode = $LASTEXITCODE
        if ($exitCode -eq 0) {
            Add-Result $Phase $Name "PASS" "Command completed successfully."
        }
        else {
            Add-Result $Phase $Name "FAIL" "Command exited with code $exitCode."
        }
        return ($exitCode -eq 0)
    }
    catch {
        Add-Result $Phase $Name "FAIL" $_.Exception.Message
        return $false
    }
    finally {
        Pop-Location
    }
}

function Test-HttpEndpoint {
    param(
        [string]$Name,
        [string]$Method,
        [string]$Path,
        [int[]]$ExpectedStatus,
        [hashtable]$Body = $null,
        [hashtable]$Headers = $null
    )
    $uri = $BaseUrl.TrimEnd("/") + $Path
    try {
        $params = @{
            Uri = $uri
            Method = $Method
            TimeoutSec = 12
            ErrorAction = "Stop"
        }
        if ($Headers) { $params.Headers = $Headers }
        if ($Body) {
            $params.ContentType = "application/json"
            $params.Body = ($Body | ConvertTo-Json -Depth 8 -Compress)
        }

        try {
            $response = Invoke-WebRequest @params
            $status = [int]$response.StatusCode
        }
        catch {
            $status = $null
            if ($_.Exception.Response) {
                try { $status = [int]$_.Exception.Response.StatusCode } catch {}
            }
            if ($null -eq $status) { throw }
        }

        if ($ExpectedStatus -contains $status) {
            Add-Result "HTTP" $Name "PASS" "$Method $Path returned $status."
        }
        else {
            Add-Result "HTTP" $Name "FAIL" "$Method $Path returned $status; expected $($ExpectedStatus -join ',')."
        }
    }
    catch {
        Add-Result "HTTP" $Name "BLOCKED" "Could not verify endpoint: $($_.Exception.Message)"
    }
}

try {
    Write-Host "`nYATIN PORTFOLIO - BACKEND VERIFICATION RUNNER" -ForegroundColor Cyan
    Write-Host "Project root: $ProjectRoot"
    Write-Host "API: $BaseUrl"
    Write-Host "Trusted origin: $TrustedOrigin"
    Write-Host "SAFE MODE: no account mutations, no OTP email, no migrations, no provisioning." -ForegroundColor Yellow

    # -------------------------------------------------------------------------
    # Phase 0: repository and runtime preflight
    # -------------------------------------------------------------------------
    $phase = "Preflight"
    if (-not (Test-Path -LiteralPath $ProjectRoot -PathType Container)) {
        throw "Project root does not exist: $ProjectRoot"
    }
    $ProjectRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
    $rootPackage = Join-Path $ProjectRoot "package.json"
    $apiPackage = Join-Path $ProjectRoot "apps\api\package.json"
    $databasePackage = Join-Path $ProjectRoot "packages\database\package.json"
    $envFile = Join-Path $ProjectRoot ".env"
    $apiTests = Join-Path $ProjectRoot "apps\api\src\tests"
    $healthScript = Join-Path $ProjectRoot "apps\api\src\tests\security-final-tests.ps1"

    foreach ($file in @($rootPackage, $apiPackage, $databasePackage)) {
        if (Test-Path -LiteralPath $file -PathType Leaf) {
            Add-Result $phase ("Found " + (Split-Path $file -Leaf)) "PASS" "Required project file exists."
        }
        else {
            Add-Result $phase ("Found " + (Split-Path $file -Leaf)) "FAIL" "Required project file is missing."
        }
    }

    if (Get-Command node -ErrorAction SilentlyContinue) {
        Add-Result $phase "Node.js runtime" "PASS" ((node --version 2>$null) -join "")
    } else {
        Add-Result $phase "Node.js runtime" "FAIL" "node was not found on PATH."
    }
    if (Get-Command npm -ErrorAction SilentlyContinue) {
        Add-Result $phase "npm runtime" "PASS" ((npm --version 2>$null) -join "")
    } else {
        Add-Result $phase "npm runtime" "FAIL" "npm was not found on PATH."
    }

    if (-not (Test-Path $rootPackage) -or -not (Test-Path $apiPackage) -or -not (Test-Path $databasePackage)) {
        throw "Required package manifests are missing. Fix the repository root or project structure."
    }

    $rootPkgObj = Get-Content $rootPackage -Raw | ConvertFrom-Json
    $apiPkgObj = Get-Content $apiPackage -Raw | ConvertFrom-Json
    $dbPkgObj = Get-Content $databasePackage -Raw | ConvertFrom-Json

    $apiTestFiles = @()
    if (Test-Path $apiTests) {
        $apiTestFiles = @(Get-ChildItem $apiTests -File -Filter "*.test.ts" -ErrorAction SilentlyContinue)
    }
    Add-Result $phase "Existing API test files" "INFO" ("Found {0} TypeScript test file(s)." -f $apiTestFiles.Count)

    if ($apiPkgObj.scripts.typecheck) {
        Add-Result $phase "API typecheck script" "PASS" "Defined in apps/api/package.json."
    } else {
        Add-Result $phase "API typecheck script" "BLOCKED" "No API typecheck script is defined."
    }
    if ($apiPkgObj.scripts.build) {
        Add-Result $phase "API build script" "PASS" "Defined in apps/api/package.json."
    } else {
        Add-Result $phase "API build script" "BLOCKED" "No API build script is defined."
    }
    if ($apiPkgObj.scripts.test) {
        Add-Result $phase "API test script" "PASS" "Defined in apps/api/package.json."
    } else {
        Add-Result $phase "API test script" "BLOCKED" "No API test script is defined."
    }

    # Read .env key names only. Never print values.
    if (Test-Path $envFile) {
        $envKeys = @(
            Get-Content $envFile | ForEach-Object {
                if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=') { $Matches[1] }
            } | Sort-Object -Unique
        )
        Add-Result $phase "Root .env presence" "PASS" "Found .env; values were not read into output."
        foreach ($key in @("DATABASE_URL","BACKUP_EMAIL_ENCRYPTION_KEY","OTP_HMAC_SECRET")) {
            if ($envKeys -contains $key) {
                Add-Result $phase ("Environment key " + $key) "PASS" "Key name exists; value concealed."
            } else {
                Add-Result $phase ("Environment key " + $key) "BLOCKED" "Required key name not found in .env; process environment may still supply it."
            }
        }
    } else {
        Add-Result $phase "Root .env presence" "BLOCKED" "No root .env file found; process environment may still supply configuration."
    }

    # -------------------------------------------------------------------------
    # Phase 1: test isolation gate
    # -------------------------------------------------------------------------
    $phase = "TestIsolation"
    if ($EnableDatabaseTests) {
        $testDbUrl = $env:PORTFOLIO_TEST_DATABASE_URL
        if ([string]::IsNullOrWhiteSpace($testDbUrl)) {
            Add-Result $phase "Dedicated test database URL" "FAIL" "Set PORTFOLIO_TEST_DATABASE_URL in this PowerShell process."
        }
        else {
            try {
                $parsed = [System.Uri]$testDbUrl
                $databaseName = [System.Uri]::UnescapeDataString($parsed.AbsolutePath.Trim("/"))
                if ($databaseName -notmatch '(?i)test') {
                    Add-Result $phase "Production database protection" "FAIL" "Database name must contain 'test'. No database tests were run."
                }
                elseif ($parsed.Scheme -notin @("postgres","postgresql")) {
                    Add-Result $phase "Test database URL format" "FAIL" "Expected a PostgreSQL connection URL."
                }
                else {
                    $env:DATABASE_URL = $testDbUrl
                    $env:NODE_ENV = "test"
                    $script:TestDatabaseWasSet = $true
                    Add-Result $phase "Dedicated test database URL" "PASS" "PostgreSQL database name contains 'test'; URL value concealed."
                    Add-Result $phase "Test environment override" "PASS" "DATABASE_URL and NODE_ENV overridden for this script process only."
                }
            }
            catch {
                Add-Result $phase "Test database URL validation" "FAIL" "URL could not be parsed. Value concealed."
            }
        }
    }
    else {
        Add-Result $phase "Database-backed test gate" "BLOCKED" "Not enabled. Set PORTFOLIO_TEST_DATABASE_URL and pass -EnableDatabaseTests."
    }

    # -------------------------------------------------------------------------
    # Phase 2: build and static validation
    # -------------------------------------------------------------------------
    $phase = "Build"
    if (-not $SkipBuildChecks) {
        $npm = (Get-Command npm).Source
        $null = Invoke-CheckedCommand $phase "Workspace typecheck" $npm @("run","typecheck") $ProjectRoot
        $null = Invoke-CheckedCommand $phase "Workspace build" $npm @("run","build") $ProjectRoot
        $null = Invoke-CheckedCommand $phase "Git diff whitespace check" "git" @("diff","--check") $ProjectRoot
    } else {
        Add-Result $phase "Build and typecheck" "SKIP" "Skipped by parameter."
    }

    # -------------------------------------------------------------------------
    # Phase 3: existing automated API tests, isolated DB only
    # -------------------------------------------------------------------------
    $phase = "AutomatedTests"
    if ($EnableDatabaseTests -and $script:TestDatabaseWasSet) {
        $npm = (Get-Command npm).Source
        $null = Invoke-CheckedCommand $phase "Existing API node:test suite" $npm @("run","test","--workspace","@yatin-portfolio/api") $ProjectRoot
    }
    else {
        Add-Result $phase "Existing API node:test suite" "BLOCKED" "Not run because a dedicated test database was not positively configured."
    }

    # -------------------------------------------------------------------------
    # Phase 4: live HTTP regression checks (non-mutating / negative cases)
    # -------------------------------------------------------------------------
    $phase = "HttpSmoke"
    if (-not $SkipHttpChecks) {
        Test-HttpEndpoint "Health endpoint" "GET" "/health" @(200)

        # These requests are intentionally anonymous. They do not create accounts
        # or change server state. The trusted origin is supplied for origin checks.
        $originHeaders = @{ Origin = $TrustedOrigin }
        $protectedGetPaths = @(
            @{ Name = "Admin identity requires authentication"; Path = "/api/admin/auth/me" },
            @{ Name = "Admin emails require authentication"; Path = "/api/admin/emails" },
            @{ Name = "Backup email requires authentication"; Path = "/api/admin/backup-email" },
            @{ Name = "Recovery codes require authentication"; Path = "/api/admin/recovery-codes" },
            @{ Name = "Security settings require authentication"; Path = "/api/admin/security-settings" },
            @{ Name = "Sessions require authentication"; Path = "/api/admin/sessions" },
            @{ Name = "Admin audit requires authentication"; Path = "/api/admin/audit" },
            @{ Name = "Admin media requires authentication"; Path = "/api/admin/media" }
        )
        foreach ($item in $protectedGetPaths) {
            Test-HttpEndpoint $item.Name "GET" $item.Path @(401,403) $null $originHeaders
        }

        Test-HttpEndpoint "Forgot password generic response" "POST" "/api/admin/auth/forgot-password" @(202) @{
            email = "security-regression-nonexistent@example.invalid"
        } $originHeaders

        Test-HttpEndpoint "Malformed recovery credential rejected" "POST" "/api/admin/auth/recover" @(400,422) @{
            email = "invalid"
            recoveryCode = "not-a-valid-recovery-code"
        } $originHeaders

        Test-HttpEndpoint "Malformed reset token rejected" "POST" "/api/admin/auth/reset-password" @(400,422) @{
            token = "invalid"
            newPassword = "not-a-valid-password"
        } $originHeaders

        if (Test-Path $healthScript) {
            Add-Result $phase "Previous security-final-tests.ps1" "INFO" "Found. The dedicated runner is not invoked automatically to avoid duplicate requests."
        } else {
            Add-Result $phase "Previous security-final-tests.ps1" "INFO" "Not found; built-in anonymous HTTP checks are used."
        }
    }
    else {
        Add-Result $phase "Live HTTP checks" "SKIP" "Skipped by parameter."
    }

    # -------------------------------------------------------------------------
    # Phase 5: feature-level integration coverage inventory
    # These are explicitly blocked until test fixtures, mail capture and exact
    # endpoint/schema contracts are added to the repository.
    # -------------------------------------------------------------------------
    $coverage = @(
        @("Authentication","Successful login and invalid-password rejection"),
        @("Sessions","Cookie attributes, expiry, logout, individual and bulk revocation"),
        @("Sessions","Expired/revoked session rejection and concurrent session behavior"),
        @("OTPEmail","OTP delivery through a test mail sink"),
        @("OTPEmail","Five-minute expiry, five-attempt lockout, wrong-code and replay rejection"),
        @("OTPEmail","Primary/backup email verification and purpose binding"),
        @("PasswordRecovery","Password change, dual verification and password reset lifecycle"),
        @("PasswordRecovery","Reset-token expiry, single-use, session invalidation"),
        @("PasswordRecovery","Recovery-code authentication, single-use and regeneration"),
        @("ApplicationAPI","CRUD: profile, projects, skills, experience, education"),
        @("ApplicationAPI","CRUD: certifications, achievements, social links, pages and settings"),
        @("ApplicationAPI","Contact validation, rate limits and admin message handling"),
        @("Media","Upload signature, deletion authorization, ownership and mapping consistency"),
        @("DatabaseSecurity","Rollback, foreign keys, constraints and concurrent primary-email assignment"),
        @("DatabaseSecurity","Password-reset concurrency and transaction consistency"),
        @("SecurityControls","Authorization/ownership, malformed payloads, CORS and trusted origin"),
        @("SecurityControls","Rate limits, security headers, sensitive-data leakage and audit correctness"),
        @("ProductionReadiness","SMTP delivery, Cloudinary size policy, monitoring and log redaction"),
        @("ProductionReadiness","Graceful shutdown, backup/restore drill and deployment smoke test")
    )
    foreach ($entry in $coverage) {
        Add-Result $entry[0] $entry[1] "BLOCKED" "Not safely automatable from current evidence alone; requires explicit fixtures/contracts and isolated test services."
    }

    # -------------------------------------------------------------------------
    # Phase 6: optional dependency audit
    # -------------------------------------------------------------------------
    $phase = "Dependencies"
    if ($RunDependencyAudit) {
        $npm = (Get-Command npm).Source
        $null = Invoke-CheckedCommand $phase "npm audit (production dependencies)" $npm @("audit","--omit=dev") $ProjectRoot
    } else {
        Add-Result $phase "npm audit" "SKIP" "Pass -RunDependencyAudit to run the network-dependent audit."
    }

    # -------------------------------------------------------------------------
    # Summary and report
    # -------------------------------------------------------------------------
    $passed = @($script:Results | Where-Object Status -eq "PASS").Count
    $failed = @($script:Results | Where-Object Status -eq "FAIL").Count
    $blocked = @($script:Results | Where-Object Status -eq "BLOCKED").Count
    $skipped = @($script:Results | Where-Object Status -eq "SKIP").Count
    $info = @($script:Results | Where-Object Status -eq "INFO").Count

    $reportPath = Join-Path $ProjectRoot ("backend-verification-{0}.csv" -f (Get-Date -Format "yyyyMMdd-HHmmss"))
    $script:Results | Export-Csv -NoTypeInformation -Encoding UTF8 -Path $reportPath

    Write-Host "`n========== BACKEND VERIFICATION SUMMARY ==========" -ForegroundColor Cyan
    $script:Results | Group-Object Phase, Status | Sort-Object Name | Format-Table Name, Count -AutoSize
    Write-Host ("PASS: {0} | FAIL: {1} | BLOCKED: {2} | SKIP: {3} | INFO: {4}" -f $passed,$failed,$blocked,$skipped,$info)
    Write-Host "CSV report: $reportPath" -ForegroundColor DarkCyan

    if ($failed -gt 0) {
        Write-Host "RESULT: FAIL - resolve failures before sign-off." -ForegroundColor Red
        exit 1
    }
    elseif ($blocked -gt 0) {
        Write-Host "RESULT: INCOMPLETE - no recorded failures, but required coverage remains blocked." -ForegroundColor Yellow
        exit 2
    }
    else {
        Write-Host "RESULT: CHECKS PASSED - review scope before production sign-off." -ForegroundColor Green
        exit 0
    }
}
catch {
    Write-Host "`nFATAL: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
finally {
    # Restore process environment even if a test command fails.
    if ($script:TestDatabaseWasSet) {
        $env:DATABASE_URL = $script:OriginalDatabaseUrl
        $env:NODE_ENV = $script:OriginalNodeEnv
    }
}
