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
    $bodyObj = $null
    try { $status = [int]$_.Exception.Response.StatusCode } catch {}
    try { $bodyText = $_.ErrorDetails.Message } catch {}
    if ($bodyText) {
      try { $bodyObj = $bodyText | ConvertFrom-Json } catch {}
    }
    if (-not $AllowError) {
      throw "HTTP error $status for $Method $Url :: $bodyText"
    }
    return @{ ok = $false; status = $status; bodyText = $bodyText; body = $bodyObj }
  }
}

$base = 'http://localhost:3001/api'
$stamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()

# 1) Health
$health = Invoke-Json -Method GET -Url "$base/health"
Check ($health.body.ok -eq $true) 'miniapp backend health endpoint'

# 2) Admin login (miniapp login flow)
$login = Invoke-Json -Method POST -Url "$base/auth/login" -Body @{ username='admin'; password='Dongweiliu' }
$adminToken = $login.body.sessionToken
Check ([string]::IsNullOrWhiteSpace($adminToken) -eq $false) 'miniapp admin login returns token'
$adminHeaders = @{ Authorization = "Bearer $adminToken" }

# 3) Register + approve researcher (miniapp read-only protocol role)
$resUser = "mini_res_$stamp"
Invoke-Json -Method POST -Url "$base/auth/register" -Body @{
  username = $resUser
  password = 'MiniResPass123!'
  fullName = 'Mini Researcher'
  email = "${resUser}@mail.local"
  role = 'Researcher'
  requestedAdminId = 'usr_admin'
} | Out-Null

$users = Invoke-Json -Method GET -Url "$base/users" -Headers $adminHeaders
$resUserRow = $users.body | Where-Object { $_.username -eq $resUser } | Select-Object -First 1
Check ($null -ne $resUserRow) 'miniapp researcher appears in user list'
Invoke-Json -Method PUT -Url "$base/users/$($resUserRow.id)" -Headers $adminHeaders -Body @{ isActive = $true } | Out-Null

$resLogin = Invoke-Json -Method POST -Url "$base/auth/login" -Body @{ username=$resUser; password='MiniResPass123!' }
$resToken = $resLogin.body.sessionToken
Check ([string]::IsNullOrWhiteSpace($resToken) -eq $false) 'miniapp researcher login returns token'
$resHeaders = @{ Authorization = "Bearer $resToken" }

# 4) Subjects list with deleted flag filters (miniapp toggle)
$subjectsActive = Invoke-Json -Method GET -Url "$base/subjects?deleted=false" -Headers $adminHeaders
Check (($subjectsActive.body | Measure-Object).Count -ge 0) 'miniapp subjects active list works'
$subjectsDeleted = Invoke-Json -Method GET -Url "$base/subjects?deleted=true" -Headers $adminHeaders
Check (($subjectsDeleted.body | Measure-Object).Count -ge 0) 'miniapp subjects recycle list works'

# 5) Subject create/edit/conflict/delete/restore (miniapp CRUD + versioning)
$subjectCreate = Invoke-Json -Method POST -Url "$base/subjects" -Headers $adminHeaders -Body @{ data = @{
  subject_id = "MINI-S-$stamp"
  cohort_group = 'Control'
  enrollment_date = '2026-02-22'
  name_code = 'MINI-01'
  sex = 'Male'
  dob = '1999-01-01'
  handedness = 'Right'
  leg_dominance = 'Right'
  height_cm = 171
  mass_kg = 72
  bmi = 24.6
  affected_side = 'None'
  consent_status = $true
  exclusion_flag = $false
  diagnosis = 'Mini Baseline'
  notes = 'Mini Note A'
} }
$subject = $subjectCreate.body
Check ($subject.version -eq 1) 'miniapp subject create version 1'

$subjectV2 = Invoke-Json -Method PUT -Url "$base/subjects/$($subject.id)" -Headers $adminHeaders -Body @{ updates = @{ version = 1; notes = 'Mini Note B' } }
Check ($subjectV2.body.version -eq 2) 'miniapp subject edit increments version'

$subjectConflict = Invoke-Json -Method PUT -Url "$base/subjects/$($subject.id)" -Headers $adminHeaders -Body @{ updates = @{ version = 1; notes = 'Mini stale overlap' }; baseState = $subject } -AllowError
Check ($subjectConflict.status -eq 409) 'miniapp subject stale overlap returns 409'
$subjectConflictFields = @()
if ($subjectConflict.body -and $subjectConflict.body.conflictFields) { $subjectConflictFields = @($subjectConflict.body.conflictFields) }
Check ($subjectConflictFields -contains 'notes') 'miniapp subject 409 includes conflict field list'

Invoke-Json -Method POST -Url "$base/subjects/$($subject.id)/soft-delete" -Headers $adminHeaders -Body @{ expectedVersion = $subjectV2.body.version } | Out-Null
$deletedLookup = Invoke-Json -Method GET -Url "$base/subjects?deleted=true" -Headers $adminHeaders
$deletedSubject = $deletedLookup.body | Where-Object { $_.id -eq $subject.id } | Select-Object -First 1
Check ($null -ne $deletedSubject) 'miniapp subject appears in recycle list after delete'
Invoke-Json -Method POST -Url "$base/subjects/$($subject.id)/restore" -Headers $adminHeaders -Body @{ expectedVersion = $deletedSubject.version } | Out-Null
$activeLookup2 = Invoke-Json -Method GET -Url "$base/subjects?deleted=false" -Headers $adminHeaders
$restoredSubject = $activeLookup2.body | Where-Object { $_.id -eq $subject.id } | Select-Object -First 1
Check ($null -ne $restoredSubject) 'miniapp subject restore returns to active list'

# 6) Protocol list + admin-only create/edit/delete/restore + ethical file payload
$protocolsActive = Invoke-Json -Method GET -Url "$base/study-protocols?deleted=false" -Headers $adminHeaders
Check (($protocolsActive.body | Measure-Object).Count -ge 0) 'miniapp protocols active list works'

$ethicsDataUrl = 'data:application/pdf;base64,JVBERi0xLjQK' # "%PDF-1.4\n" signature sample
$protocolCreate = Invoke-Json -Method POST -Url "$base/study-protocols" -Headers $adminHeaders -Body @{ data = @{
  projectName = 'Mini Protocol'
  projectId = "MINI-P-$stamp"
  executionTime = '2026-Q1'
  notes = 'Mini Protocol Note A'
  ethicalApproval = @{
    fileName = 'mini-ethics.pdf'
    mimeType = 'application/pdf'
    dataUrl = $ethicsDataUrl
  }
} }
$protocol = $protocolCreate.body
Check ($protocol.version -eq 1) 'miniapp protocol create version 1'
Check ($protocol.ethicalApproval.fileName -eq 'mini-ethics.pdf') 'miniapp protocol stores ethical file metadata'

$protocolV2 = Invoke-Json -Method PUT -Url "$base/study-protocols/$($protocol.id)" -Headers $adminHeaders -Body @{ updates = @{ version = 1; notes = 'Mini Protocol Note B' } }
Check ($protocolV2.body.version -eq 2) 'miniapp protocol edit increments version'

$protocolConflict = Invoke-Json -Method PUT -Url "$base/study-protocols/$($protocol.id)" -Headers $adminHeaders -Body @{ updates = @{ version = 1; notes = 'Mini stale overlap' }; baseState = $protocol } -AllowError
Check ($protocolConflict.status -eq 409) 'miniapp protocol stale overlap returns 409'
$protocolConflictFields = @()
if ($protocolConflict.body -and $protocolConflict.body.conflictFields) { $protocolConflictFields = @($protocolConflict.body.conflictFields) }
Check ($protocolConflictFields -contains 'notes') 'miniapp protocol 409 includes conflict field list'

# 7) Researcher protocol write blocked, read allowed
$resProtocolCreate = Invoke-Json -Method POST -Url "$base/study-protocols" -Headers $resHeaders -Body @{ data = @{ projectName='NoWrite'; projectId="NO-$stamp"; executionTime='2026'; notes='x' } } -AllowError
Check ($resProtocolCreate.status -eq 403) 'miniapp researcher cannot create protocol'
$resProtocolRead = Invoke-Json -Method GET -Url "$base/study-protocols?deleted=false" -Headers $resHeaders
Check (($resProtocolRead.body | Measure-Object).Count -ge 0) 'miniapp researcher can read protocols'

# 8) Miniapp admin tools parity: user management + backup export/import
$miniUser = "mini_usr_$stamp"
$createMiniUser = Invoke-Json -Method POST -Url "$base/users" -Headers $adminHeaders -Body @{
  username = $miniUser
  fullName = 'Mini Managed User'
  email = "${miniUser}@mail.local"
  role = 'Researcher'
  isActive = $true
  password = 'MiniUserPass123!'
}
Check ($createMiniUser.body.username -eq $miniUser) 'miniapp admin can create user'

$toggleMiniUser = Invoke-Json -Method PUT -Url "$base/users/$($createMiniUser.body.id)" -Headers $adminHeaders -Body @{ isActive = $false }
Check ($toggleMiniUser.body.isActive -eq $false) 'miniapp admin can deactivate user'

$resetMiniUser = Invoke-Json -Method POST -Url "$base/users/$($createMiniUser.body.id)/reset-password" -Headers $adminHeaders -Body @{ password = 'MiniReset123!' }
Check ($resetMiniUser.body.username -eq $miniUser) 'miniapp admin can reset user password'

$backup = Invoke-Json -Method GET -Url "$base/backup/export" -Headers $adminHeaders
Check ($null -ne $backup.body.data.subjects) 'miniapp admin backup export returns subjects'
Invoke-Json -Method POST -Url "$base/backup/import" -Headers $adminHeaders -Body $backup.body | Out-Null
Pass 'miniapp admin backup import accepted'

$deleteMiniUser = Invoke-Json -Method DELETE -Url "$base/users/$($createMiniUser.body.id)" -Headers $adminHeaders
$deletedViaPayload = ($deleteMiniUser.body -and $deleteMiniUser.body.username -eq $miniUser)
$deletedVia204 = ($deleteMiniUser.status -eq 200 -and $null -eq $deleteMiniUser.body)
$deletedViaEmptyString = ($deleteMiniUser.status -eq 200 -and $deleteMiniUser.body -eq '')
Check ($deletedViaPayload -or $deletedVia204 -or $deletedViaEmptyString) 'miniapp admin can delete user'

# 9) Protocol recycle bin flow
Invoke-Json -Method POST -Url "$base/study-protocols/$($protocol.id)/soft-delete" -Headers $adminHeaders -Body @{ expectedVersion = $protocolV2.body.version } | Out-Null
$protocolsDeleted = Invoke-Json -Method GET -Url "$base/study-protocols?deleted=true" -Headers $adminHeaders
$deletedProtocol = $protocolsDeleted.body | Where-Object { $_.id -eq $protocol.id } | Select-Object -First 1
Check ($null -ne $deletedProtocol) 'miniapp protocol appears in recycle list after delete'
Invoke-Json -Method POST -Url "$base/study-protocols/$($protocol.id)/restore" -Headers $adminHeaders -Body @{ expectedVersion = $deletedProtocol.version } | Out-Null
$protocolsActive2 = Invoke-Json -Method GET -Url "$base/study-protocols?deleted=false" -Headers $adminHeaders
$restoredProtocol = $protocolsActive2.body | Where-Object { $_.id -eq $protocol.id } | Select-Object -First 1
Check ($null -ne $restoredProtocol) 'miniapp protocol restore returns to active list'

# 10) Logout/token invalidation (miniapp logout)
Invoke-Json -Method POST -Url "$base/auth/logout" -Headers $adminHeaders | Out-Null
$afterLogout = Invoke-Json -Method GET -Url "$base/subjects" -Headers $adminHeaders -AllowError
Check ($afterLogout.status -eq 401) 'miniapp token invalid after logout'

Write-Host "`nMINIAPP FUNCTION TESTS: PASS" -ForegroundColor Cyan
