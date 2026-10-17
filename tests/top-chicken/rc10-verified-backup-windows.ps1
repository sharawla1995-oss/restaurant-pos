$ErrorActionPreference = 'Stop'
$fixture = Join-Path $env:RUNNER_TEMP ('TC-BACKUP-CI-' + [guid]::NewGuid().ToString('N'))
$d = Join-Path $fixture 'data'
$b = Join-Path $fixture 'backups'
$a = Join-Path $fixture 'app'
$r = Join-Path $fixture 'rescue'
$dest = Join-Path $fixture 'out'
foreach ($p in @($d,$b,$a,$r,$dest)) { New-Item -ItemType Directory -Path $p -Force | Out-Null }
[IO.File]::WriteAllBytes((Join-Path $d 'topburger-pos.sqlite'),[byte[]](0..255))
[IO.File]::WriteAllBytes((Join-Path $d 'topburger-pos.lastgood.sqlite'),[byte[]](255..0))
[IO.File]::WriteAllText((Join-Path $d 'license.json'),'synthetic data')
[IO.File]::WriteAllText((Join-Path $b 'old.sqlite'),'synthetic backup')
[IO.File]::WriteAllText((Join-Path $a 'Sharawla POS.exe'),'synthetic exe')
[IO.File]::WriteAllText((Join-Path $r 'preserved.txt'),'untouched')
$original = @{}
foreach ($base in @($d,$b,$a,$r)) { Get-ChildItem -LiteralPath $base -File -Recurse | ForEach-Object { $original[$_.FullName] = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash } }
$script = Join-Path (Get-Location) 'scripts\top-chicken-rc10-verified-preinstall-backup.ps1'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $script -DataSource $d -BackupsSource $b -InstallSource $a -RescueSource $r -DestinationRoot $dest
if ($LASTEXITCODE -ne 0) { throw 'BACKUP CLI FAILED' }
$output = @(Get-ChildItem -LiteralPath $dest -Directory)
if ($output.Count -ne 1) { throw 'BACKUP DEST FOLDER COUNT NOT ONE' }
$manifest = @(Import-Csv -LiteralPath (Join-Path $output[0].FullName 'SHA256-VERIFIED-MANIFEST.csv'))
if ($manifest.Count -ne 5) { throw 'BACKUP MANIFEST FILE COUNT NOT FIVE' }
foreach ($row in $manifest) { $file = Join-Path (Join-Path $output[0].FullName $row.Bucket) $row.RelativePath; if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ne $row.SHA256) { throw 'DEST SHA256 BAD' } }
foreach ($file in $original.Keys) { if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ne $original[$file]) { throw 'SOURCE MUTATED' } }
Write-Host 'PASS TC VERIFIED PREINSTALL BACKUP WINDOWS: ALL 5 COPIES VERIFIED, SOURCES AND RESCUE UNCHANGED'
