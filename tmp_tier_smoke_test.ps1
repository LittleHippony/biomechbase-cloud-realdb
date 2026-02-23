$ErrorActionPreference = 'Stop'

function Assert-True($condition, $message) {
  if (-not $condition) { throw "FAIL: $message" }
  Write-Host "PASS: $message" -ForegroundColor Green
}

$base = 'http://localhost:3001/api'
$ts = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$admin1User = 'admin'
$admin1Pass = 'Dongweiliu'
$admin2User = "tier2_$ts"
$admin2Pass = "Tier2Pass$ts"
$resUser = "res_$ts"
$resPass = "ResPass$ts"
$subjectId = "S-TIER-$ts"

$login1 = Invoke-RestMethod -Method POST -Uri "$base/auth/login" -ContentType 'application/json' -Body (@{username=$admin1User;password=$admin1Pass} | ConvertTo-Json)
$h1 = @{ Authorization = "Bearer $($login1.sessionToken)" }
Assert-True ($login1.role -eq 'Admin' -and $login1.adminTier -eq 1) 'Default admin is Tier-1 admin'

$createAdmin2 = Invoke-RestMethod -Method POST -Uri "$base/users" -Headers $h1 -ContentType 'application/json' -Body (@{
  username = $admin2User
  fullName = 'Tier Two Admin'
  email = "$admin2User@test.local"
  role = 'Admin'
  isActive = $false
  password = $admin2Pass
} | ConvertTo-Json)
Assert-True ($createAdmin2.role -eq 'Admin' -and $createAdmin2.adminTier -eq 2 -and $createAdmin2.isActive -eq $false) 'Tier-1 can create pending Tier-2 admin'

$createRes = Invoke-RestMethod -Method POST -Uri "$base/users" -Headers $h1 -ContentType 'application/json' -Body (@{
  username = $resUser
  fullName = 'Tier Researcher'
  email = "$resUser@test.local"
  role = 'Researcher'
  isActive = $true
  password = $resPass
} | ConvertTo-Json)
Assert-True ($createRes.role -eq 'Researcher' -and $createRes.assignedAdminId -eq $login1.id) 'Tier-1 can create researcher with assignment'

$resLogin = Invoke-RestMethod -Method POST -Uri "$base/auth/login" -ContentType 'application/json' -Body (@{username=$resUser;password=$resPass} | ConvertTo-Json)
$hr = @{ Authorization = "Bearer $($resLogin.sessionToken)" }
Assert-True ($resLogin.confidentialAccess -eq $false) 'Researcher login does not get confidential access'

$createSub = Invoke-RestMethod -Method POST -Uri "$base/subjects" -Headers $hr -ContentType 'application/json' -Body (@{data=@{
  subject_id = $subjectId; cohort_group='Control'; enrollment_date='2026-02-22'; name_code='TST-01'; sex='Male'; dob='2000-01-01'; handedness='Right'; leg_dominance='Right'; height_cm=170; mass_kg=70; bmi=24.2; affected_side='None'; consent_status=$true; exclusion_flag=$false; real_name='Hidden Name'; contact_info='hidden@test.local'
}; user=@{id=$resLogin.id;username=$resLogin.username;fullName=$resLogin.fullName;email=$resLogin.email;role=$resLogin.role;isActive=$resLogin.isActive}} | ConvertTo-Json -Depth 6)
Assert-True ($createSub.subject_id -eq $subjectId) 'Researcher can enter full subject data on create'

$listRes = Invoke-RestMethod -Method GET -Uri "$base/subjects" -Headers $hr
$item = $listRes | Where-Object { $_.subject_id -eq $subjectId } | Select-Object -First 1
Assert-True ([string]::IsNullOrEmpty($item.real_name) -and [string]::IsNullOrEmpty($item.contact_info)) 'Researcher cannot access confidential fields after save'

$adminList = Invoke-RestMethod -Method GET -Uri "$base/subjects" -Headers $h1
$adminItem = $adminList | Where-Object { $_.subject_id -eq $subjectId } | Select-Object -First 1
Assert-True ($adminItem.real_name -eq 'Hidden Name') 'Admin can access confidential fields'

$firstUpdate = Invoke-RestMethod -Method PUT -Uri "$base/subjects/$($createSub.id)" -Headers $h1 -ContentType 'application/json' -Body (@{updates=@{version=$createSub.version; notes='v2 note'}; user=@{username=$login1.username}} | ConvertTo-Json -Depth 5)
Assert-True ($firstUpdate.version -eq ($createSub.version + 1)) 'Update increments subject version'

$conflictHit = $false
try {
  Invoke-RestMethod -Method PUT -Uri "$base/subjects/$($createSub.id)" -Headers $h1 -ContentType 'application/json' -Body (@{updates=@{version=$createSub.version; notes='stale update'}; user=@{username=$login1.username}} | ConvertTo-Json -Depth 5) | Out-Null
} catch {
  if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 409) { $conflictHit = $true }
}
Assert-True $conflictHit 'Optimistic version conflict returns HTTP 409'

Write-Host "`nALL NEW-RULE CHECKS PASSED" -ForegroundColor Cyan
