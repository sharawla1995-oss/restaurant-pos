# Top Chicken SH-0008: operator-initiated FINAL backup before any RC10 installation.
# No SQLite writes, deletes, restores, device changes, sync, or cloud access.
# Writes new, SHA256-verified copies ONLY to a unique folder on D:.
param(
  [string]$DataSource = (Join-Path $env:APPDATA 'sharawla-pos-windows\data'),
  [string]$BackupsSource = (Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'TopBurgerPOS\Backups'),
  [string]$InstallSource = 'D:\New folder (3)\Sharawla POS',
  [string]$RescueSource = 'D:\TopChicken-Rescue-20261017-041937',
  [string]$DestinationRoot = 'D:\'
)
$ErrorActionPreference = 'Stop'

function Check-PosStopped {
  if (Get-Process -Name 'Sharawla POS' -ErrorAction SilentlyContinue) {
    throw 'STOP: SHARAWLA POS IS STILL RUNNING - NO BACKUP STARTED'
  }
}
function Sha256-OfFile([string]$filename) {
  $sha = [Security.Cryptography.SHA256]::Create()
  $stream = [System.IO.File]::Open($filename,
    [System.IO.FileMode]::Open,
    [System.IO.FileAccess]::Read,
    [System.IO.FileShare]::Read)
  try {
    return [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '')
  } finally {
    $stream.Dispose()
    $sha.Dispose()
  }
}
function RequiredFolder([string]$filename) {
  if (!(Test-Path -LiteralPath $filename -PathType Container)) {
    throw "STOP: REQUIRED FOLDER NOT FOUND: $filename"
  }
  $dir = Get-Item -LiteralPath $filename -Force
  if (($dir.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw "STOP: SOURCE FOLDER IS A LINK: $filename"
  }
  return $dir.FullName
}

Check-PosStopped
$data = RequiredFolder $DataSource
$backups = RequiredFolder $BackupsSource
$install = RequiredFolder $InstallSource
$rescue = RequiredFolder $RescueSource
$destBase = RequiredFolder $DestinationRoot

if (![IO.File]::Exists((Join-Path $install 'Sharawla POS.exe'))) {
  throw 'STOP: EXPECTED SHARAWLA POS EXE NOT FOUND AT INSTALL PATH'
}
foreach ($filename in @('topburger-pos.sqlite','topburger-pos.lastgood.sqlite')) {
  if (![IO.File]::Exists((Join-Path $data $filename))) {
    throw "STOP: REQUIRED DATABASE FILE MISSING: $filename"
  }
}
if (!([IO.Path]::GetPathRoot($destBase) -ieq 'D:\')) {
  throw 'STOP: BACKUP DESTINATION MUST BE ON D DRIVE'
}

$roots = @(
  [pscustomobject]@{Label='Data'; Path=$data},
  [pscustomobject]@{Label='Auto-Backups'; Path=$backups},
  [pscustomobject]@{Label='Installed-App'; Path=$install}
)
# No destination inside a source folder; all three sources must be distinct.
foreach ($root in $roots) {
  if ($destBase -ieq $root.Path -or $destBase.StartsWith($root.Path + '\',[StringComparison]::OrdinalIgnoreCase)) {
    throw "STOP: DESTINATION IS INSIDE SOURCE: $($root.Path)"
  }
}
$catalog = New-Object 'System.Collections.Generic.List[object]'
$perGroup = @{}
[long]$totalBytes = 0
foreach ($root in $roots) {
  $contents = @(Get-ChildItem -LiteralPath $root.Path -Recurse -Force -ErrorAction Stop)
  foreach ($entry in $contents) {
    if (($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw "STOP: LINK FOUND IN SOURCE: $($entry.FullName)"
    }
  }
  $files = @($contents | Where-Object { -not $_.PSIsContainer })
  if ($files.Count -eq 0) {
    throw "STOP: SOURCE FOLDER HAS NO FILES: $($root.Path)"
  }
  $perGroup[$root.Label] = $files.Count
  foreach ($file in $files) {
    $relative = $file.FullName.Substring($root.Path.Length).TrimStart('\')
    if (!$relative -or [IO.Path]::IsPathRooted($relative)) {
      throw "STOP: BAD SOURCE RELATIVE PATH: $($file.FullName)"
    }
    [long]$totalBytes += $file.Length
    $catalog.Add([pscustomobject]@{
      Bucket=$root.Label; Source=$file.FullName; RelativePath=$relative; SizeBytes=[long]$file.Length
    })
  }
}
$drive = New-Object IO.DriveInfo('D')
[long]$minimumFree = [long]([math]::Ceiling(($totalBytes * 1.25) + 536870912))
if ($drive.AvailableFreeSpace -lt $minimumFree) {
  throw "STOP: NOT ENOUGH D DRIVE SPACE FOR VERIFIED BACKUP"
}
Check-PosStopped

$tag = (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0,8)
$destination = Join-Path $destBase ('TopChicken-Before-RC10-' + $tag)
if (Test-Path -LiteralPath $destination) {
  throw 'STOP: UNIQUE DESTINATION ALREADY EXISTS'
}
New-Item -ItemType Directory -Path $destination -ErrorAction Stop | Out-Null
Write-Host 'BACKUP_STARTED' -ForegroundColor Cyan
Write-Host "DESTINATION: $destination"

$manifest = New-Object 'System.Collections.Generic.List[object]'
foreach ($item in $catalog) {
  Check-PosStopped
  $target = Join-Path (Join-Path $destination $item.Bucket) $item.RelativePath
  $targetFolder = Split-Path -Parent $target
  [IO.Directory]::CreateDirectory($targetFolder) | Out-Null
  if (Test-Path -LiteralPath $target) { throw "STOP: DESTINATION FILE ALREADY EXISTS: $target" }
  $srcHashBefore = Sha256-OfFile $item.Source
  $fileNow = Get-Item -LiteralPath $item.Source -Force
  if ($fileNow.Length -ne $item.SizeBytes) {
    throw "STOP: SOURCE SIZE CHANGED: $($item.RelativePath)"
  }
  [IO.File]::Copy($item.Source,$target,$false)
  $destHash = Sha256-OfFile $target
  $srcHashAfter = Sha256-OfFile $item.Source
  if ($srcHashBefore -cne $destHash -or $srcHashAfter -cne $destHash) {
    throw "STOP: SHA256 FAILED: $($item.RelativePath)"
  }
  $manifest.Add([pscustomobject]@{
    Bucket=$item.Bucket; RelativePath=$item.RelativePath;
    SizeBytes=$item.SizeBytes; SHA256=$destHash
  })
}
Check-PosStopped
foreach ($root in $roots) {
  $afterFiles = @(Get-ChildItem -LiteralPath $root.Path -Recurse -Force -File)
  if ($afterFiles.Count -ne $perGroup[$root.Label]) {
    throw "STOP: SOURCE FILE COUNT CHANGED: $($root.Label)"
  }
}
$manifestPath = Join-Path $destination 'SHA256-VERIFIED-MANIFEST.csv'
$manifest | Export-Csv -LiteralPath $manifestPath -NoTypeInformation -Encoding UTF8 -ErrorAction Stop
$checks = @{
  'Data' = (Join-Path $destination 'Data\topburger-pos.sqlite')
  'Lastgood' = (Join-Path $destination 'Data\topburger-pos.lastgood.sqlite')
  'Installed EXE' = (Join-Path $destination 'Installed-App\Sharawla POS.exe')
}
foreach ($key in $checks.Keys) {
  if (!(Test-Path -LiteralPath $checks[$key] -PathType Leaf)) {
    throw "STOP: MANDATORY VERIFIED COPY MISSING: $key"
  }
}
Write-Host "DATA_VERIFIED: $($perGroup['Data']) files" -ForegroundColor Green
Write-Host "AUTO_BACKUPS_VERIFIED: $($perGroup['Auto-Backups']) files" -ForegroundColor Green
Write-Host "INSTALLED_APP_VERIFIED: $($perGroup['Installed-App']) files" -ForegroundColor Green
Write-Host "FILES_VERIFIED_TOTAL: $($manifest.Count)" -ForegroundColor Green
Write-Host "SIZE_GB: $([math]::Round($totalBytes/1GB,3))"
Write-Host "MANIFEST: $manifestPath"
Write-Host "BACKUP_VERIFIED_ON_D: $destination" -ForegroundColor Green
Write-Host 'NO SOURCE FILES MODIFIED - DO NOT INSTALL OR SYNC YET' -ForegroundColor Yellow
