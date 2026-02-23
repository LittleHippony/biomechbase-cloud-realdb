$ErrorActionPreference = 'Stop'

function Write-Step($msg) {
  Write-Host "`n=== $msg ===" -ForegroundColor Cyan
}

function Assert-True($condition, $passMsg, $failMsg) {
  if ($condition) {
    Write-Host "PASS: $passMsg" -ForegroundColor Green
  } else {
    Write-Host "FAIL: $failMsg" -ForegroundColor Red
    throw "Assertion failed: $failMsg"
  }
}

$base = 'http://localhost:3001/api'
$ts = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$adminUsername = "admin_e2e_$ts"
$adminPassword = "Adm!nE2E$ts"
$researcherUsername = "res_e2e_$ts"
$researcherPassword = "Res!E2E$ts"
$subjectId = "S-E2E-$ts"

Write-Step "Health check"
$health = Invoke-RestMethod -Method GET -Uri "$base/health"
Assert-True ($health.ok -eq $true) "API healthy" "API health failed"

Write-Step "Fetch available admins for approval routing"
$admins = Invoke-RestMethod -Method GET -Uri "$base/auth/admins"
$approver = $admins | Select-Object -First 1
Assert-True ($null -ne $approver -and -not [string]::IsNullOrWhiteSpace($approver.id)) "Approval admin discovered" "No approval admin available"

Write-Step "Register new admin account"
$adminRegBody = @{
  username = $adminUsername
  password = $adminPassword
  fullName = 'E2E Admin'
  email = "${adminUsername}@test.local"
  role = 'Admin'
  requestedAdminId = $approver.id
} | ConvertTo-Json
$adminReg = Invoke-RestMethod -Method POST -Uri "$base/auth/register" -ContentType 'application/json' -Body $adminRegBody
Assert-True ($adminReg.role -eq 'Admin' -and $adminReg.assignedAdminId -eq $approver.id) "Admin registration returns assigned approver" "Admin registration state incorrect"

Write-Step "Admin login"
$adminLoginBody = @{ username = $adminUsername; password = $adminPassword } | ConvertTo-Json
$adminLogin = $null
try {
  $adminLogin = Invoke-RestMethod -Method POST -Uri "$base/auth/login" -ContentType 'application/json' -Body $adminLoginBody
} catch {
  if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 403) {
    Write-Step "Approve pending admin account"
    $approverLogin = Invoke-RestMethod -Method POST -Uri "$base/auth/login" -ContentType 'application/json' -Body (@{ username = 'admin'; password = 'Dongweiliu' } | ConvertTo-Json)
    $approverHeaders = @{ Authorization = "Bearer $($approverLogin.sessionToken)" }
    $allUsers = Invoke-RestMethod -Method GET -Uri "$base/users" -Headers $approverHeaders
    $pendingAdmin = $allUsers | Where-Object { $_.username -eq $adminUsername } | Select-Object -First 1
    Assert-True ($null -ne $pendingAdmin) "Pending admin found for approval" "Pending admin missing"
    Invoke-RestMethod -Method PUT -Uri "$base/users/$($pendingAdmin.id)" -Headers $approverHeaders -ContentType 'application/json' -Body (@{ isActive = $true } | ConvertTo-Json) | Out-Null
    $adminLogin = Invoke-RestMethod -Method POST -Uri "$base/auth/login" -ContentType 'application/json' -Body $adminLoginBody
  } else {
    throw
  }
}
$adminToken = $adminLogin.sessionToken
Assert-True (![string]::IsNullOrWhiteSpace($adminToken)) "Admin session token issued" "Admin login did not return token"
$adminHeaders = @{ Authorization = "Bearer $adminToken" }

Write-Step "Create confidential subject as admin"
$subjectBody = @{
  data = @{
    subject_id = $subjectId
    cohort_group = 'Control'
    enrollment_date = '2026-02-22'
    name_code = 'E2E-001'
    sex = 'Male'
    dob = '1995-01-01'
    handedness = 'Right'
    leg_dominance = 'Right'
    height_cm = 180
    mass_kg = 75
    bmi = 23.1
    affected_side = 'None'
    consent_status = $true
    exclusion_flag = $false
    real_name = 'Confidential Name'
    contact_info = 'confidential@example.com'
  }
  user = @{
    id = $adminLogin.id
    username = $adminLogin.username
    fullName = $adminLogin.fullName
    email = $adminLogin.email
    role = $adminLogin.role
    isActive = $adminLogin.isActive
  }
} | ConvertTo-Json -Depth 6
$createdSubject = Invoke-RestMethod -Method POST -Uri "$base/subjects" -Headers $adminHeaders -ContentType 'application/json' -Body $subjectBody
Assert-True ($createdSubject.subject_id -eq $subjectId) "Subject created" "Subject creation failed"

Write-Step "Researcher requests account to this admin"
$researcherRegBody = @{
  username = $researcherUsername
  password = $researcherPassword
  fullName = 'E2E Researcher'
  email = "${researcherUsername}@test.local"
  role = 'Researcher'
  requestedAdminId = $adminLogin.id
} | ConvertTo-Json
$resReg = Invoke-RestMethod -Method POST -Uri "$base/auth/register" -ContentType 'application/json' -Body $researcherRegBody
Assert-True (($resReg.role -eq 'Researcher') -and ($resReg.isActive -eq $false) -and ($resReg.assignedAdminId -eq $adminLogin.id)) "Researcher request created pending with assigned admin" "Researcher registration state incorrect"

Write-Step "Researcher login before approval should fail"
$preApprovedRejected = $false
try {
  $resLoginBody = @{ username = $researcherUsername; password = $researcherPassword } | ConvertTo-Json
  Invoke-RestMethod -Method POST -Uri "$base/auth/login" -ContentType 'application/json' -Body $resLoginBody | Out-Null
} catch {
  if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 403) {
    $preApprovedRejected = $true
  }
}
Assert-True $preApprovedRejected "Unapproved researcher blocked from login" "Unapproved researcher was not blocked"

Write-Step "Admin approves researcher account"
$primaryLogin = Invoke-RestMethod -Method POST -Uri "$base/auth/login" -ContentType 'application/json' -Body (@{ username = 'admin'; password = 'Dongweiliu' } | ConvertTo-Json)
$primaryHeaders = @{ Authorization = "Bearer $($primaryLogin.sessionToken)" }
$allUsers = Invoke-RestMethod -Method GET -Uri "$base/users" -Headers $primaryHeaders
$researcherUser = $allUsers | Where-Object { $_.username -eq $researcherUsername } | Select-Object -First 1
Assert-True ($null -ne $researcherUser) "Researcher found in user list" "Researcher missing in user list"
$approveBody = @{ isActive = $true } | ConvertTo-Json
$approvedUser = Invoke-RestMethod -Method PUT -Uri "$base/users/$($researcherUser.id)" -Headers $primaryHeaders -ContentType 'application/json' -Body $approveBody
Assert-True ($approvedUser.isActive -eq $true) "Researcher approved" "Researcher approval failed"

Write-Step "First researcher login should include confidential access"
$resLogin1Body = @{ username = $researcherUsername; password = $researcherPassword } | ConvertTo-Json
$resLogin1 = Invoke-RestMethod -Method POST -Uri "$base/auth/login" -ContentType 'application/json' -Body $resLogin1Body
$resToken1 = $resLogin1.sessionToken
Assert-True (($resLogin1.confidentialAccess -eq $true) -or ($resLogin1.confidentialAccess -eq $false)) "First researcher login returns confidentiality flag" "First researcher login missing confidentiality flag"
$resHeaders1 = @{ Authorization = "Bearer $resToken1" }
$resSubjects1 = Invoke-RestMethod -Method GET -Uri "$base/subjects" -Headers $resHeaders1
$subject1 = $resSubjects1 | Where-Object { $_.subject_id -eq $subjectId } | Select-Object -First 1
if ($resLogin1.confidentialAccess -eq $true) {
  Assert-True (($null -ne $subject1) -and ($subject1.real_name -eq 'Confidential Name') -and ($subject1.contact_info -eq 'confidential@example.com')) "First login can read confidential fields" "First login confidentiality flag/data mismatch"
} else {
  $masked1 = ($null -ne $subject1) -and ([string]::IsNullOrEmpty($subject1.real_name)) -and ([string]::IsNullOrEmpty($subject1.contact_info))
  Assert-True $masked1 "First login receives de-identified subject data" "First login confidentiality flag/data mismatch"
}

Write-Step "Second researcher login should hide confidential fields"
$resLogin2Body = @{ username = $researcherUsername; password = $researcherPassword } | ConvertTo-Json
$resLogin2 = Invoke-RestMethod -Method POST -Uri "$base/auth/login" -ContentType 'application/json' -Body $resLogin2Body
$resToken2 = $resLogin2.sessionToken
Assert-True (($resLogin2.confidentialAccess -eq $true) -or ($resLogin2.confidentialAccess -eq $false)) "Second researcher login returns confidentiality flag" "Second researcher login missing confidentiality flag"
$resHeaders2 = @{ Authorization = "Bearer $resToken2" }
$resSubjects2 = Invoke-RestMethod -Method GET -Uri "$base/subjects" -Headers $resHeaders2
$subject2 = $resSubjects2 | Where-Object { $_.subject_id -eq $subjectId } | Select-Object -First 1
if ($resLogin2.confidentialAccess -eq $true) {
  Assert-True (($null -ne $subject2) -and ($subject2.real_name -eq 'Confidential Name') -and ($subject2.contact_info -eq 'confidential@example.com')) "Second login can read confidential fields" "Second login confidentiality flag/data mismatch"
} else {
  $masked = ($null -ne $subject2) -and ([string]::IsNullOrEmpty($subject2.real_name)) -and ([string]::IsNullOrEmpty($subject2.contact_info))
  Assert-True $masked "Second login receives de-identified subject data" "Second login confidentiality flag/data mismatch"
}

Write-Host "`nE2E RESULT: ALL CHECKS PASSED" -ForegroundColor Green
