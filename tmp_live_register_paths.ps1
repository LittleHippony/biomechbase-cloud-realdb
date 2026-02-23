$ErrorActionPreference = 'Stop'

function Assert-True($condition, $message) {
  if (-not $condition) { throw "FAIL: $message" }
  Write-Host "PASS: $message" -ForegroundColor Green
}

$base = 'http://localhost:3001/api'
$ts = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()

$adminCandidateUser = "self_admin_$ts"
$adminCandidatePass = "SelfAdmin$ts"
$resUser = "self_res_$ts"
$resPass = "SelfRes$ts"

# Use seeded Tier-1 admin as approver for the live check
$admins = Invoke-RestMethod -Method GET -Uri "$base/auth/admins"
$tierOne = $admins | Where-Object { $_.adminTier -eq 1 } | Select-Object -First 1
Assert-True ($null -ne $tierOne) 'Tier-1 admin is available for approval routing'

Write-Host "Using Tier-1 approver: $($tierOne.fullName) ($($tierOne.username))" -ForegroundColor Cyan

# Path 1: self-register as Admin (Tier-2 request)
$adminRegBody = @{
  username = $adminCandidateUser
  password = $adminCandidatePass
  fullName = 'Live Check Admin Request'
  email = "$adminCandidateUser@test.local"
  role = 'Admin'
  requestedAdminId = $tierOne.id
} | ConvertTo-Json

$adminReg = Invoke-RestMethod -Method POST -Uri "$base/auth/register" -ContentType 'application/json' -Body $adminRegBody
Assert-True ($adminReg.role -eq 'Admin') 'Admin path creates admin-role account'
Assert-True ($adminReg.adminTier -eq 2) 'Admin path creates Tier-2 admin only'
Assert-True ($adminReg.isActive -eq $false) 'Admin path account is pending approval'
Assert-True ($adminReg.assignedAdminId -eq $tierOne.id) 'Admin path stores selected Tier-1 approver'

# Path 2: self-register as Researcher
$resRegBody = @{
  username = $resUser
  password = $resPass
  fullName = 'Live Check Researcher Request'
  email = "$resUser@test.local"
  role = 'Researcher'
  requestedAdminId = $tierOne.id
} | ConvertTo-Json

$resReg = Invoke-RestMethod -Method POST -Uri "$base/auth/register" -ContentType 'application/json' -Body $resRegBody
Assert-True ($resReg.role -eq 'Researcher') 'Researcher path creates researcher-role account'
Assert-True ($resReg.isActive -eq $false) 'Researcher path account is pending approval'
Assert-True ($resReg.assignedAdminId -eq $tierOne.id) 'Researcher path stores selected approver'

Write-Host "`nLIVE CHECK RESULT: BOTH REGISTRATION PATHS PASS" -ForegroundColor Green
