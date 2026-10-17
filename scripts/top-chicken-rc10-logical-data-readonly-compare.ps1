# Top Chicken post RC10: compare ALL SQLite table row values against fixed before-upgrade snapshot.
# ONLY SQLITE_OPEN_READONLY, no db writes, no network, no POS launch, no recovery.
param(
  [string]$Before = 'D:\TopChicken-Before-RC10-20261017-052005-76ef79cc\Data\topburger-pos.sqlite',
  [string]$After = (Join-Path $env:APPDATA 'sharawla-pos-windows\data\topburger-pos.sqlite'),
  [string]$ExpectedBeforeSHA256 = '720365C808C54E95D275B97262290429AF47DF6A44C72D24DD920FB028350B36',
  [string]$ExpectedAfterSHA256 = '30B90C9C630CD03EAD4013BF086B9248BCE8AF4A8D3777AFD183C87B75B16C95'
)
$ErrorActionPreference='Stop'
if (Get-Process -Name 'Sharawla POS' -ErrorAction SilentlyContinue) {throw 'STOP: CLOSE POS BEFORE READ ONLY COMPARISON'}
foreach($p in @($Before,$After)){
  if (!(Test-Path -LiteralPath $p -PathType Leaf)) {throw "STOP: DB FILE MISSING: $p"}
}
function HashFile([string]$p){
 $sha=[Security.Cryptography.SHA256]::Create()
 $f=[IO.File]::Open($p,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
 try{return [BitConverter]::ToString($sha.ComputeHash($f)).Replace('-','')}
 finally{$f.Dispose();$sha.Dispose()}
}
$gotBefore=HashFile $Before
$gotAfter=HashFile $After
if($gotBefore -ine $ExpectedBeforeSHA256){throw 'STOP: BEFORE SNAPSHOT HASH CHANGED'}
if($gotAfter -ine $ExpectedAfterSHA256){throw 'STOP: CURRENT SQLITE CHANGED SINCE LAST CHECK'}
if(!('TCPostRC10LogicalCompare' -as [type])){
Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Security.Cryptography;

public sealed class TCPostRC10LogicalCompare {
 [DllImport("winsqlite3.dll",CharSet=CharSet.Ansi,CallingConvention=CallingConvention.Cdecl)]
 private static extern int sqlite3_open_v2(string path,out IntPtr db,int flags,IntPtr vfs);
 [DllImport("winsqlite3.dll",CharSet=CharSet.Ansi,CallingConvention=CallingConvention.Cdecl)]
 private static extern int sqlite3_prepare_v2(IntPtr db,string sql,int length,out IntPtr stmt,IntPtr tail);
 [DllImport("winsqlite3.dll",CallingConvention=CallingConvention.Cdecl)]
 private static extern int sqlite3_step(IntPtr stmt);
 [DllImport("winsqlite3.dll",CallingConvention=CallingConvention.Cdecl)]
 private static extern int sqlite3_column_count(IntPtr stmt);
 [DllImport("winsqlite3.dll",CallingConvention=CallingConvention.Cdecl)]
 private static extern int sqlite3_column_type(IntPtr stmt,int col);
 [DllImport("winsqlite3.dll",CallingConvention=CallingConvention.Cdecl)]
 private static extern IntPtr sqlite3_column_text(IntPtr stmt,int col);
 [DllImport("winsqlite3.dll",CallingConvention=CallingConvention.Cdecl)]
 private static extern IntPtr sqlite3_column_blob(IntPtr stmt,int col);
 [DllImport("winsqlite3.dll",CallingConvention=CallingConvention.Cdecl)]
 private static extern int sqlite3_column_bytes(IntPtr stmt,int col);
 [DllImport("winsqlite3.dll",CallingConvention=CallingConvention.Cdecl)]
 private static extern long sqlite3_column_int64(IntPtr stmt,int col);
 [DllImport("winsqlite3.dll",CallingConvention=CallingConvention.Cdecl)]
 private static extern double sqlite3_column_double(IntPtr stmt,int col);
 [DllImport("winsqlite3.dll",CallingConvention=CallingConvention.Cdecl)]
 private static extern int sqlite3_finalize(IntPtr stmt);
 [DllImport("winsqlite3.dll",CallingConvention=CallingConvention.Cdecl)]
 private static extern int sqlite3_close(IntPtr db);

 private static IntPtr Open(string path){
   IntPtr db;
   int rc=sqlite3_open_v2(path,out db,1,IntPtr.Zero); // SQLITE_OPEN_READONLY
   if(rc!=0){if(db!=IntPtr.Zero)sqlite3_close(db);throw new Exception("READONLY_OPEN_"+rc);}
   return db;
 }
 private static IntPtr Prepare(IntPtr db,string sql){
   IntPtr stmt;int rc=sqlite3_prepare_v2(db,sql,-1,out stmt,IntPtr.Zero);
   if(rc!=0)throw new Exception("READONLY_PREPARE_"+rc);
   return stmt;
 }
 private static string TextCol(IntPtr s,int idx){
   IntPtr ptr=sqlite3_column_text(s,idx);
   int len=sqlite3_column_bytes(s,idx);
   if(len==0)return "";
   byte[] bytes=new byte[len];
   Marshal.Copy(ptr,bytes,0,len);
   return System.Text.Encoding.UTF8.GetString(bytes);
 }
 private static void Integrity(IntPtr db){
   IntPtr stmt=Prepare(db,"PRAGMA integrity_check;");
   try{
     if(sqlite3_step(stmt)!=100 || TextCol(stmt,0)!="ok" || sqlite3_step(stmt)!=101){
       throw new Exception("READONLY_INTEGRITY_NOT_OK");
     }
   }finally{sqlite3_finalize(stmt);}
 }
 private static List<string> TableList(IntPtr db){
   var tables=new List<string>();
   IntPtr stmt=Prepare(db,"SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;");
   try{
     int rc;
     while((rc=sqlite3_step(stmt))==100){tables.Add(TextCol(stmt,0));}
     if(rc!=101)throw new Exception("READONLY_SCHEMA_LIST_"+rc);
   }finally{sqlite3_finalize(stmt);}
   return tables;
 }
 private static string HashRow(IntPtr stmt){
   using(var ms=new MemoryStream()){
    using(var bw=new BinaryWriter(ms)){
     int count=sqlite3_column_count(stmt);
     bw.Write(count);
     for(int c=0;c<count;c++){
      int t=sqlite3_column_type(stmt,c);
      bw.Write((byte)t);
      if(t==1)bw.Write(sqlite3_column_int64(stmt,c));
      else if(t==2)bw.Write(BitConverter.DoubleToInt64Bits(sqlite3_column_double(stmt,c)));
      else if(t==3 || t==4){
       IntPtr ptr=(t==3)?sqlite3_column_text(stmt,c):sqlite3_column_blob(stmt,c);
       int len=sqlite3_column_bytes(stmt,c);
       bw.Write(len);
       if(len>0){byte[] bytes=new byte[len];Marshal.Copy(ptr,bytes,0,len);bw.Write(bytes);}
      }else if(t!=5)throw new Exception("UNKNOWN_SQLITE_TYPE_"+t);
     }
     bw.Flush();
     using(var sha=SHA256.Create()){return BitConverter.ToString(sha.ComputeHash(ms.ToArray())).Replace("-","");}
    }
   }
 }
 private static Dictionary<string,int> Rows(IntPtr db,string table,out int count){
   var hist=new Dictionary<string,int>(StringComparer.Ordinal);
   count=0;
   string escaped=table.Replace("\"","\"\"");
   IntPtr stmt=Prepare(db,"SELECT * FROM \""+escaped+"\";");
   try{
     int rc;
     while((rc=sqlite3_step(stmt))==100){
       string row=HashRow(stmt);
       int n;hist.TryGetValue(row,out n);hist[row]=n+1;count++;
     }
     if(rc!=101)throw new Exception("READONLY_ROW_SCAN_"+rc+"_"+table);
   }finally{sqlite3_finalize(stmt);}
   return hist;
 }
 private static bool EqualsHist(Dictionary<string,int> a,Dictionary<string,int> b){
   if(a.Count!=b.Count)return false;
   foreach(var x in a){int n;if(!b.TryGetValue(x.Key,out n)||n!=x.Value)return false;}
   return true;
 }
 public static string Compare(string a,string b){
   IntPtr dbA=IntPtr.Zero,dbB=IntPtr.Zero;
   try{
     dbA=Open(a);dbB=Open(b);
     Integrity(dbA);Integrity(dbB);
     var tA=TableList(dbA);var tB=TableList(dbB);
     if(tA.Count!=tB.Count)return "DIFFERENT_TABLE_SET count_before="+tA.Count+" count_after="+tB.Count;
     for(int i=0;i<tA.Count;i++)if(tA[i]!=tB[i])return "DIFFERENT_TABLE_SET";
     int total=0;
     foreach(string name in tA){
       int na,nb;
       var ha=Rows(dbA,name,out na);
       var hb=Rows(dbB,name,out nb);
       if(na!=nb || !EqualsHist(ha,hb)){
         return "DIFFERENT_TABLE="+name+" before_rows="+na+" after_rows="+nb;
       }
       total+=na;
     }
     return "ALL_TABLE_ROWS_IDENTICAL tables="+tA.Count+" rows="+total;
   }finally{
     if(dbB!=IntPtr.Zero)sqlite3_close(dbB);
     if(dbA!=IntPtr.Zero)sqlite3_close(dbA);
   }
 }
}
'@
}
Write-Host 'RC10_LOGICAL_COMPARE_READ_ONLY'
$result=[TCPostRC10LogicalCompare]::Compare($Before,$After)
Write-Host $result
if($result -notlike 'ALL_TABLE_ROWS_IDENTICAL*'){
  Write-Host 'STOP: REVIEW TABLE DIFFERENCES BEFORE RESUMING OPERATIONS' -ForegroundColor Yellow
}else{
  Write-Host 'LOGICAL_DATA_MATCH_PASS - NO FILES MODIFIED' -ForegroundColor Green
}
