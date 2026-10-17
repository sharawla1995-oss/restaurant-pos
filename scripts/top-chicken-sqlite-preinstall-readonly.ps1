# Top Chicken SH-0008 operator pre-install diagnostic — READ ONLY.
# Never launches POS, copies/renames/writes SQLite, unpauses sync, or changes cloud state.
# Run manually in Windows PowerShell on the Top Chicken PC with POS closed.
param(
  [string]$DataDirectory = (Join-Path $env:APPDATA 'sharawla-pos-windows\data'),
  [string]$RescueDirectory = 'D:\TopChicken-Rescue-20261017-041937'
)
$ErrorActionPreference = 'Stop'
$data = $DataDirectory
$main = Join-Path $data 'topburger-pos.sqlite'
$last = Join-Path $data 'topburger-pos.lastgood.sqlite'
$rescue = $RescueDirectory
$candidate = Join-Path $rescue 'data\topburger-pos.sqlite.tmp-6612-1792195243919-6d90fd5a'

if (Get-Process -Name 'Sharawla POS' -ErrorAction SilentlyContinue) {
  throw 'STOP: POS STILL RUNNING - DO NOT INSPECT WHILE WRITING'
}
foreach ($path in @($main,$last,$candidate)) {
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    throw "STOP: PRESERVED FILE MISSING: $path"
  }
}
if (-not ('TCReadOnlyPreInstall' -as [type])) {
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public sealed class TCReadOnlyPreInstall {
 [DllImport("winsqlite3.dll", CharSet=CharSet.Ansi, CallingConvention=CallingConvention.Cdecl)]
 private static extern int sqlite3_open_v2(string path, out IntPtr db, int flags, IntPtr vfs);
 [DllImport("winsqlite3.dll", CharSet=CharSet.Ansi, CallingConvention=CallingConvention.Cdecl)]
 private static extern int sqlite3_prepare_v2(IntPtr db, string sql, int length, out IntPtr stmt, IntPtr tail);
 [DllImport("winsqlite3.dll", CallingConvention=CallingConvention.Cdecl)]
 private static extern int sqlite3_step(IntPtr stmt);
 [DllImport("winsqlite3.dll", CallingConvention=CallingConvention.Cdecl)]
 private static extern IntPtr sqlite3_column_text(IntPtr stmt, int column);
 [DllImport("winsqlite3.dll", CallingConvention=CallingConvention.Cdecl)]
 private static extern long sqlite3_column_int64(IntPtr stmt, int column);
 [DllImport("winsqlite3.dll", CallingConvention=CallingConvention.Cdecl)]
 private static extern int sqlite3_finalize(IntPtr stmt);
 [DllImport("winsqlite3.dll", CallingConvention=CallingConvention.Cdecl)]
 private static extern int sqlite3_close(IntPtr db);

 private static long Scalar(IntPtr db, string sql) {
   IntPtr stmt=IntPtr.Zero;
   try {
     int rc=sqlite3_prepare_v2(db,sql,-1,out stmt,IntPtr.Zero);
     if(rc!=0)throw new Exception("SQLITE_PREPARE_"+rc);
     rc=sqlite3_step(stmt);
     if(rc!=100)throw new Exception("SQLITE_STEP_"+rc);
     return sqlite3_column_int64(stmt,0);
   }finally{if(stmt!=IntPtr.Zero)sqlite3_finalize(stmt);}
 }
 public static string Inspect(string file){
   IntPtr db=IntPtr.Zero,stmt=IntPtr.Zero;
   try{
     int rc=sqlite3_open_v2(file,out db,1,IntPtr.Zero); // SQLITE_OPEN_READONLY
     if(rc!=0)throw new Exception("SQLITE_OPEN_"+rc);
     rc=sqlite3_prepare_v2(db,"PRAGMA integrity_check;",-1,out stmt,IntPtr.Zero);
     if(rc!=0)throw new Exception("SQLITE_INTEGRITY_PREPARE_"+rc);
     rc=sqlite3_step(stmt);
     if(rc!=100 || Marshal.PtrToStringAnsi(sqlite3_column_text(stmt,0))!="ok")
       throw new Exception("SQLITE_INTEGRITY_NOT_OK");
     if(sqlite3_step(stmt)!=101)throw new Exception("SQLITE_INTEGRITY_EXTRA_RESULT");
     sqlite3_finalize(stmt);stmt=IntPtr.Zero;
     long total=Scalar(db,"select count(*) from local_operations;");
     long pending=Scalar(db,"select count(*) from local_operations where status='pending';");
     return "ok | local_operations="+total+" | pending="+pending;
   }finally{
     if(stmt!=IntPtr.Zero)sqlite3_finalize(stmt);
     if(db!=IntPtr.Zero)sqlite3_close(db);
   }
 }
}
'@
}

Write-Host 'TC_SH0008_PREINSTALL_READ_ONLY' -ForegroundColor Cyan
foreach ($name in @('current_main','current_lastgood','verified_restore_source')) {
  $file = switch ($name) {
    'current_main' { $main }
    'current_lastgood' { $last }
    default { $candidate }
  }
  $info=[TCReadOnlyPreInstall]::Inspect($file)
  $stream=[System.IO.File]::OpenRead($file)
  $algorithm=[System.Security.Cryptography.SHA256]::Create()
  try {
    $hash=[System.BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-','')
  } finally {
    $stream.Dispose()
    $algorithm.Dispose()
  }
  $length=(Get-Item -LiteralPath $file).Length
  Write-Host "$name | $info | bytes=$length | SHA256=$hash"
}
Get-PSDrive -Name C,D | Select-Object Name,@{N='FreeGB';E={[math]::Round($_.Free/1GB,2)}} | Format-Table -AutoSize
Write-Host 'PREINSTALL_READ_ONLY_COMPLETE - NO FILES MODIFIED' -ForegroundColor Green
Write-Host 'STOP: Do not install, resume sync or accept live orders before operator review.' -ForegroundColor Yellow
