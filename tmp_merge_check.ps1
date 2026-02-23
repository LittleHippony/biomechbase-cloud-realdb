$ErrorActionPreference = 'Stop'

function Assert-True($condition, $message) {
  if (-not $condition) { throw "FAIL: $message" }
  Write-Host "PASS: $message" -ForegroundColor Green
}

$base = 'http://localhost:3001/api'
$ts = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$subjectId = "S-MERGE-$ts"

$login = Invoke-RestMethod -Method POST -Uri "$base/auth/login" -ContentType 'application/json' -Body (@{ username='admin'; password='Dongweiliu' } | ConvertTo-Json)
$headers = @{ Authorization = "Bearer $($login.sessionToken)" }

$created = Invoke-RestMethod -Method POST -Uri "$base/subjects" -Headers $headers -ContentType 'application/json' -Body (@{
  data = @{
    subject_id = $subjectId
    cohort_group = 'Control'
    enrollment_date = '2026-02-22'
    name_code = 'MRG-01'
    sex = 'Male'
    dob = '1998-01-01'
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
  }
  user = @{ username = $login.username }
} | ConvertTo-Json -Depth 6)

Assert-True ($created.version -eq 1) 'Subject created at version 1'
$baseState = $created

$update1 = Invoke-RestMethod -Method PUT -Uri "$base/subjects/$($created.id)" -Headers $headers -ContentType 'application/json' -Body (@{
  updates = @{ version = 1; notes = 'ServerChangedNote' }
  user = @{ username = $login.username }
} | ConvertTo-Json -Depth 6)
Assert-True ($update1.version -eq 2) 'First update advanced to version 2'

# stale client update from base version 1, changing DIFFERENT field -> should auto-merge
$merged = Invoke-RestMethod -Method PUT -Uri "$base/subjects/$($created.id)" -Headers $headers -ContentType 'application/json' -Body (@{
  updates = @{ version = 1; diagnosis = 'ClientChangedDiagnosis' }
  baseState = $baseState
  user = @{ username = $login.username }
} | ConvertTo-Json -Depth 20)
Assert-True ($merged.version -eq 3) 'Stale update merged and advanced to version 3'
Assert-True ($merged.mergeApplied -eq $true) 'Server reports mergeApplied=true on auto-merge'
Assert-True ($merged.notes -eq 'ServerChangedNote' -and $merged.diagnosis -eq 'ClientChangedDiagnosis') 'Merged result preserves both non-overlapping edits'

# stale client update from same base changing SAME field as server -> should conflict 409
$conflictHit = $false
try {
  Invoke-RestMethod -Method PUT -Uri "$base/subjects/$($created.id)" -Headers $headers -ContentType 'application/json' -Body (@{
    updates = @{ version = 1; notes = 'ClientOverwriteNote' }
    baseState = $baseState
    user = @{ username = $login.username }
  } | ConvertTo-Json -Depth 20) | Out-Null
} catch {
  if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 409) { $conflictHit = $true }
}
Assert-True $conflictHit 'Overlapping stale edit returns HTTP 409 conflict'

Write-Host "`nMERGE CHECK RESULT: PASS" -ForegroundColor Cyan
