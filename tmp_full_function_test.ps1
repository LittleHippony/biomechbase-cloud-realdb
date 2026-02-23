$ErrorActionPreference = 'Stop'

function Pass($msg) { Write-Host "PASS: $msg" -ForegroundColor Green }
function Fail($msg) { Write-Host "FAIL: $msg" -ForegroundColor Red; throw $msg }
function Check($cond, $msg) { if ($cond) { Pass $msg } else { Fail $msg } }

function Invoke-Json {
  param(
    [string]$Method,
    [string]$Url,
    [object]$Body = $null,
    [hashtable]$Headers = $null,
    [switch]$AllowError
  )

  try {
    if ($null -ne $Body) {
      $json = $Body | ConvertTo-Json -Depth 12
      $resp = Invoke-RestMethod -Method $Method -Uri $Url -ContentType 'application/json' -Headers $Headers -Body $json
    } else {
      $resp = Invoke-RestMethod -Method $Method -Uri $Url -Headers $Headers
    }
    return @{ ok = $true; status = 200; body = $resp }
  } catch {
    $status = 0
    $bodyText = ''
    try { $status = [int]$_.Exception.Response.StatusCode } catch {}
    try { $bodyText = $_.ErrorDetails.Message } catch {}
    if (-not $AllowError) {
      throw "HTTP error $status for $Method $Url :: $bodyText"
    }
    return @{ ok = $false; status = $status; bodyText = $bodyText }
  }
}

$base = 'http://localhost:3001/api'

# 1) Health
$health = Invoke-Json -Method GET -Url "$base/health"
Check ($health.body.ok -eq $true) 'health endpoint'

# 2) Admin login
$login = Invoke-Json -Method POST -Url "$base/auth/login" -Body @{ username='admin'; password='Dongweiliu' }
$token = $login.body.sessionToken
Check ([string]::IsNullOrWhiteSpace($token) -eq $false) 'admin login returns sessionToken'
$auth = @{ Authorization = "Bearer $token" }

# 3) Auth admins list
$admins = Invoke-Json -Method GET -Url "$base/auth/admins"
Check (($admins.body | Measure-Object).Count -ge 1) 'public admins list'

# 4) Register researcher
$stamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$regUser = "res_auto_$stamp"
$reg = Invoke-Json -Method POST -Url "$base/auth/register" -Body @{
  username = $regUser
  password = 'TempPass123!'
  fullName = 'Auto Researcher'
  email = "${regUser}@mail.local"
  role = 'Researcher'
  requestedAdminId = 'usr_admin'
}
Check ($reg.body.username -eq $regUser) 'register researcher request'

# 5) Users list + approve researcher + reset password
$users = Invoke-Json -Method GET -Url "$base/users" -Headers $auth
$target = $users.body | Where-Object { $_.username -eq $regUser } | Select-Object -First 1
Check ($null -ne $target) 'users list contains newly registered researcher'

$approve = Invoke-Json -Method PUT -Url "$base/users/$($target.id)" -Headers $auth -Body @{ isActive = $true }
Check ($approve.body.isActive -eq $true) 'approve pending researcher'

$reset = Invoke-Json -Method POST -Url "$base/users/$($target.id)/reset-password" -Headers $auth -Body @{ password = 'ResetPass123!' }
Check ($reset.body.username -eq $regUser) 'reset researcher password'

# 6) Login as researcher + cannot create study protocol
$resLogin = Invoke-Json -Method POST -Url "$base/auth/login" -Body @{ username=$regUser; password='ResetPass123!' }
$resToken = $resLogin.body.sessionToken
Check ([string]::IsNullOrWhiteSpace($resToken) -eq $false) 'researcher login'
$resAuth = @{ Authorization = "Bearer $resToken" }

$resProtocolCreate = Invoke-Json -Method POST -Url "$base/study-protocols" -Headers $resAuth -Body @{ data = @{ projectName='Forbidden'; projectId="F-$stamp"; executionTime='2026'; notes='no' } } -AllowError
Check ($resProtocolCreate.status -eq 403) 'researcher cannot create study protocol'

# 7) Subject create + update + merge non-overlap + conflict overlap + soft-delete/restore conflict
$subjectId = "S-AUTO-$stamp"
$subCreate = Invoke-Json -Method POST -Url "$base/subjects" -Headers $auth -Body @{ data = @{
  subject_id = $subjectId
  cohort_group = 'Control'
  enrollment_date = '2026-02-22'
  name_code = 'AUTO-01'
  sex = 'Male'
  dob = '1999-01-01'
  handedness = 'Right'
  leg_dominance = 'Right'
  height_cm = 170
  mass_kg = 70
  bmi = 24.2
  affected_side = 'None'
  consent_status = $true
  exclusion_flag = $false
  diagnosis = 'BaselineDx'
  notes = 'BaselineNote'
} }
$subject = $subCreate.body
Check ($subject.version -eq 1) 'subject create version=1'

$subV2 = Invoke-Json -Method PUT -Url "$base/subjects/$($subject.id)" -Headers $auth -Body @{ updates = @{ version = $subject.version; notes = 'ServerChangedNote' } }
Check ($subV2.body.version -eq 2) 'subject update increments version'

$subMerge = Invoke-Json -Method PUT -Url "$base/subjects/$($subject.id)" -Headers $auth -Body @{ updates = @{ version = 1; diagnosis = 'ClientChangedDiagnosis' }; baseState = $subject }
Check ($subMerge.body.mergeApplied -eq $true) 'subject non-overlap stale update auto-merged'

$subConflict = Invoke-Json -Method PUT -Url "$base/subjects/$($subject.id)" -Headers $auth -Body @{ updates = @{ version = 1; notes = 'ClientOverlap' }; baseState = $subject } -AllowError
Check ($subConflict.status -eq 409) 'subject overlap stale update conflict'

Invoke-Json -Method POST -Url "$base/subjects/$($subject.id)/soft-delete" -Headers $auth -Body @{ expectedVersion = $subMerge.body.version } | Out-Null
$subRestoreConflict = Invoke-Json -Method POST -Url "$base/subjects/$($subject.id)/restore" -Headers $auth -Body @{ expectedVersion = $subMerge.body.version } -AllowError
Check ($subRestoreConflict.status -eq 409) 'subject restore stale expectedVersion conflict'

# 8) Study protocol create + update + merge + conflict + soft-delete conflict
$projId = "P-AUTO-$stamp"
$protoCreate = Invoke-Json -Method POST -Url "$base/study-protocols" -Headers $auth -Body @{ data = @{ projectName='ProtocolA'; projectId=$projId; executionTime='2026-Q1'; notes='v1' } }
$proto = $protoCreate.body
Check ($proto.version -eq 1) 'protocol create version=1'

$protoV2 = Invoke-Json -Method PUT -Url "$base/study-protocols/$($proto.id)" -Headers $auth -Body @{ updates = @{ version = $proto.version; notes = 'ServerChanged' } }
Check ($protoV2.body.version -eq 2) 'protocol update increments version'

$protoMerge = Invoke-Json -Method PUT -Url "$base/study-protocols/$($proto.id)" -Headers $auth -Body @{ updates = @{ version = 1; executionTime = '2026-Q2' }; baseState = $proto }
Check ($protoMerge.body.mergeApplied -eq $true) 'protocol non-overlap stale update auto-merged'

$protoConflict = Invoke-Json -Method PUT -Url "$base/study-protocols/$($proto.id)" -Headers $auth -Body @{ updates = @{ version = 1; notes = 'Overlap' }; baseState = $proto } -AllowError
Check ($protoConflict.status -eq 409) 'protocol overlap stale update conflict'

Invoke-Json -Method POST -Url "$base/study-protocols/$($proto.id)/soft-delete" -Headers $auth -Body @{ expectedVersion = $protoMerge.body.version } | Out-Null
$protoDeleteConflict = Invoke-Json -Method POST -Url "$base/study-protocols/$($proto.id)/soft-delete" -Headers $auth -Body @{ expectedVersion = $protoMerge.body.version } -AllowError
Check ($protoDeleteConflict.status -eq 404 -or $protoDeleteConflict.status -eq 409) 'protocol repeat delete blocked'

# 9) Backup export/import smoke
$backup = Invoke-Json -Method GET -Url "$base/backup/export" -Headers $auth
Check ($null -ne $backup.body.data.subjects) 'backup export subjects present'
Check ($null -ne $backup.body.data.studyProtocols) 'backup export studyProtocols present'

$importPayload = $backup.body
Invoke-Json -Method POST -Url "$base/backup/import" -Headers $auth -Body $importPayload | Out-Null
Pass 'backup import accepted'

# 10) Logout + token invalidation
Invoke-Json -Method POST -Url "$base/auth/logout" -Headers $auth | Out-Null
$afterLogout = Invoke-Json -Method GET -Url "$base/subjects" -Headers $auth -AllowError
Check ($afterLogout.status -eq 401) 'token invalid after logout'

Write-Host "`nALL FUNCTION TESTS: PASS" -ForegroundColor Cyan
