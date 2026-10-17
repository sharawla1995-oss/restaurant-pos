# Top Chicken post RC10: exhaustive per-table comparison of SQLite row values. ONLY counts, NEVER content or keys.
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
if(!('TCPostRC10AllTablesReadOnly' -as [type])){
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
 private static int CommonRows(Dictionary<string,int> a,Dictionary<string,int> b){
   int matched=0;
   foreach(var x in a){
     int n;
     if(b.TryGetValue(x.Key,out n))matched+=Math.Min(x.Value,n);
   }
   return matched;
 }
 public static string CompareAll(string a,string b){
   IntPtr dbA=IntPtr.Zero,dbB=IntPtr.Zero;
   try{
     dbA=Open(a);dbB=Open(b);
     Integrity(dbA);Integrity(dbB);
     var tA=TableList(dbA);var tB=TableList(dbB);
     var messages=new List<string>();
     var inB=new HashSet<string>(tB,StringComparer.Ordinal);
     var inA=new HashSet<string>(tA,StringComparer.Ordinal);
     var all=new SortedSet<string>(tA,StringComparer.Ordinal);
     all.UnionWith(tB);
     int same=0,diff=0,totalBefore=0,totalAfter=0;
     messages.Add("TABLE_COUNTS before="+tA.Count+" after="+tB.Count);
     foreach(string name in all){
       if(!inB.Contains(name)){messages.Add("TABLE_MISSING_AFTER="+name);diff++;continue;}
       if(!inA.Contains(name)){messages.Add("TABLE_ADDED_AFTER="+name);diff++;continue;}
       int na,nb;
       var ha=Rows(dbA,name,out na);
       var hb=Rows(dbB,name,out nb);
       totalBefore+=na;totalAfter+=nb;
       int matched=CommonRows(ha,hb);
       if(na==nb && matched==na){same++;}
       else{
         diff++;
         messages.Add("TABLE_DIFFERENCE="+name+" before_rows="+na+" after_rows="+nb+
           " unchanged_rows="+matched+" missing_or_modified_before="+(na-matched)+
           " added_or_modified_after="+(nb-matched));
       }
     }
     messages.Add("TABLES_IDENTICAL="+same+" TABLES_DIFFERENT="+diff+
       " ROWS_IN_SHARED_TABLES_BEFORE="+totalBefore+" ROWS_IN_SHARED_TABLES_AFTER="+totalAfter);
     if(diff==0)messages.Add("ALL_TABLE_ROWS_IDENTICAL");
     else messages.Add("STOP: REVIEW DIFFERENCES; NO RESTORE OR SYNC");
     return String.Join("\n",messages.ToArray());
   }finally{
     if(dbB!=IntPtr.Zero)sqlite3_close(dbB);
     if(dbA!=IntPtr.Zero)sqlite3_close(dbA);
   }
 }
}
'@
}
Write-Host 'RC10_ALL_TABLES_READ_ONLY_COMPARE'
$result=[TCPostRC10LogicalCompare]::Compare($Before,$After)
Write-Host $result
if($result -notmatch '(?m)^ALL_TABLE_ROWS_IDENTICAL
  Write-Host 'NO CUSTOMER OR SETTINGS VALUES EXPOSED - NO FILES MODIFIED' -ForegroundColor Yellow
}else{
  Write-Host 'ALL_TABLES_MATCH_PASS - NO FILES MODIFIED' -ForegroundColor Green
}
){
  Write-Host 'STOP: REVIEW TABLE DIFFERENCES BEFORE RESUMING OPERATIONS' -ForegroundColor Yellow
}else{
  Write-Host 'LOGICAL_DATA_MATCH_PASS - NO FILES MODIFIED' -ForegroundColor Green
}
