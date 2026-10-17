# Top Chicken RC10 post-upgrade readonly diagnosis: column-level KV changes only.
# No KV keys/values, secrets or customer records are printed. No writes to either DB.
param(
  [string]$Before = 'D:\TopChicken-Before-RC10-20261017-052005-76ef79cc\Data\topburger-pos.sqlite',
  [string]$After = (Join-Path $env:APPDATA 'sharawla-pos-windows\data\topburger-pos.sqlite'),
  [string]$ExpectedBeforeSHA256 = '720365C808C54E95D275B97262290429AF47DF6A44C72D24DD920FB028350B36',
  [string]$ExpectedAfterSHA256 = '30B90C9C630CD03EAD4013BF086B9248BCE8AF4A8D3777AFD183C87B75B16C95'
)
$ErrorActionPreference='Stop'
if(Get-Process -Name 'Sharawla POS' -ErrorAction SilentlyContinue){throw 'STOP: POS MUST BE CLOSED'}
foreach($file in @($Before,$After)){
 if(!(Test-Path -LiteralPath $file -PathType Leaf)){throw 'STOP: EXPECTED SQLITE FILE NOT FOUND'}
}
function ShaOf([string]$p){
 $sha=[Security.Cryptography.SHA256]::Create()
 $stream=[IO.File]::Open($p,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
 try{return [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-','')}
 finally{$stream.Dispose();$sha.Dispose()}
}
if((ShaOf $Before) -ine $ExpectedBeforeSHA256){throw 'STOP: PRE-UPGRADE VERIFIED SNAPSHOT CHANGED'}
if((ShaOf $After) -ine $ExpectedAfterSHA256){throw 'STOP: POST-UPGRADE SQLITE CHANGED AFTER PRIOR VERIFIED READONLY CHECK'}
if(!('TCKvColumnReadOnly' -as [type])){
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using System.Security.Cryptography;

public sealed class TCKvColumnReadOnly {
 [DllImport("winsqlite3.dll",CharSet=CharSet.Ansi,CallingConvention=CallingConvention.Cdecl)]
 static extern int sqlite3_open_v2(string path,out IntPtr db,int flags,IntPtr vfs);
 [DllImport("winsqlite3.dll",CallingConvention=CallingConvention.Cdecl)]
 static extern int sqlite3_close(IntPtr db);
 [DllImport("winsqlite3.dll",CharSet=CharSet.Ansi,CallingConvention=CallingConvention.Cdecl)]
 static extern int sqlite3_prepare_v2(IntPtr db,string sql,int n,out IntPtr stmt,IntPtr tail);
 [DllImport("winsqlite3.dll",CallingConvention=CallingConvention.Cdecl)]
 static extern int sqlite3_step(IntPtr stmt);
 [DllImport("winsqlite3.dll",CallingConvention=CallingConvention.Cdecl)]
 static extern int sqlite3_finalize(IntPtr stmt);
 [DllImport("winsqlite3.dll",CallingConvention=CallingConvention.Cdecl)]
 static extern IntPtr sqlite3_column_text(IntPtr stmt,int col);
 [DllImport("winsqlite3.dll",CallingConvention=CallingConvention.Cdecl)]
 static extern int sqlite3_column_bytes(IntPtr stmt,int col);
 static string Col(IntPtr stmt,int idx){
   IntPtr ptr=sqlite3_column_text(stmt,idx);
   int len=sqlite3_column_bytes(stmt,idx);
   if(len<0)throw new Exception("SQLITE_INVALID_COLUMN");
   if(ptr==IntPtr.Zero)return null;
   if(len==0)return "";
   byte[] b=new byte[len];Marshal.Copy(ptr,b,0,len);return Encoding.UTF8.GetString(b);
 }
 static IntPtr Open(string path){
   IntPtr db;int rc=sqlite3_open_v2(path,out db,1,IntPtr.Zero); // SQLITE_OPEN_READONLY
   if(rc!=0){if(db!=IntPtr.Zero)sqlite3_close(db);throw new Exception("SQLITE_READONLY_OPEN_"+rc);}
   return db;
 }
 static IntPtr Prepare(IntPtr db,string sql){
   IntPtr s;int rc=sqlite3_prepare_v2(db,sql,-1,out s,IntPtr.Zero);
   if(rc!=0)throw new Exception("SQLITE_READONLY_PREPARE_"+rc);
   return s;
 }
 static void Integrity(IntPtr db){
   IntPtr s=Prepare(db,"PRAGMA integrity_check;");
   try{
     if(sqlite3_step(s)!=100 || Col(s,0)!="ok" || sqlite3_step(s)!=101)throw new Exception("SQLITE_INTEGRITY_FAIL");
   }finally{sqlite3_finalize(s);}
 }
 static Dictionary<string,string[]> Read(IntPtr db){
   var d=new Dictionary<string,string[]>(StringComparer.Ordinal);
   IntPtr s=Prepare(db,"select key,value,updated_at from kv order by key;");
   try{
     int rc;
     while((rc=sqlite3_step(s))==100){
       string key=Col(s,0);
       if(key==null || d.ContainsKey(key))throw new Exception("KV_KEY_INVALID");
       d.Add(key,new string[]{Col(s,1),Col(s,2)});
     }
     if(rc!=101)throw new Exception("KV_READ_FAIL_"+rc);
   }finally{sqlite3_finalize(s);}
   return d;
 }
 static string KeyRef(string key){
   using(var h=SHA256.Create()){
     byte[] b=h.ComputeHash(Encoding.UTF8.GetBytes(key));
     return BitConverter.ToString(b).Replace("-","").Substring(0,12);
   }
 }
 public static string Compare(string before,string after){
   IntPtr a=IntPtr.Zero,b=IntPtr.Zero;
   try{
    a=Open(before);b=Open(after);
    Integrity(a);Integrity(b);
    var old=Read(a);var now=Read(b);
    var keys=new SortedSet<string>(old.Keys,StringComparer.Ordinal);
    keys.UnionWith(now.Keys);
    var outp=new List<string>();
    int same=0,changedValue=0,changedTimestampOnly=0,added=0,removed=0;
    foreach(string key in keys){
      string id=KeyRef(key);
      if(!old.ContainsKey(key)){added++;outp.Add("KV_ADDED key_hash12="+id);continue;}
      if(!now.ContainsKey(key)){removed++;outp.Add("KV_REMOVED key_hash12="+id);continue;}
      var x=old[key];var y=now[key];
      bool v=!String.Equals(x[0],y[0],StringComparison.Ordinal);
      bool t=!String.Equals(x[1],y[1],StringComparison.Ordinal);
      if(!v&&!t){same++;continue;}
      if(v){changedValue++;outp.Add("KV_VALUE_CHANGED key_hash12="+id+" updated_at_changed="+t);}
      else{changedTimestampOnly++;outp.Add("KV_TIMESTAMP_ONLY key_hash12="+id);}
    }
    outp.Add("KV_SUMMARY before="+old.Count+" after="+now.Count+" unchanged="+same+
      " timestamp_only="+changedTimestampOnly+" value_changed="+changedValue+
      " added="+added+" removed="+removed);
    if(changedValue==0 && added==0 && removed==0)outp.Add("KV_VALUES_AND_KEYS_PRESERVED");
    else outp.Add("STOP: KV CONTENT CHANGED; NO SYNC OR RESTORE");
    return String.Join("\n",outp.ToArray());
   }finally{
     if(b!=IntPtr.Zero)sqlite3_close(b);
     if(a!=IntPtr.Zero)sqlite3_close(a);
   }
 }
}
'@
}
Write-Host 'TC_RC10_KV_CHANGE_DIAGNOSTIC_READ_ONLY'
Write-Host ([TCKvColumnReadOnly]::Compare($Before,$After))
Write-Host 'NO KEYS OR VALUES SHOWN - NO FILES MODIFIED'
