# Tests for install.ps1, run the way users run it (the script's text through
# Invoke-Expression) in a fresh shell against a fake home: stub agent CLIs
# (scripts/install-stub.ps1) on a PATH that holds nothing else, fake
# USERPROFILE, APPDATA, and LOCALAPPDATA trees, and a fake spawnpoint server
# for /healthz and the team trade. Runs on Windows PowerShell 5.1 and on
# PowerShell 7 (Windows, macOS, Linux); the shell it runs in is the shell
# the installer runs in:
#
#   pwsh -NoProfile -File scripts/test-install-ps1.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/test-install-ps1.ps1
#
# On Windows the PATH agents are .cmd files, as npm's shims are, and the
# desktop app's runtime is a real .exe (compiled here with Add-Type). Nothing
# here talks to a real agent or the real server.
$ErrorActionPreference = 'Stop'
$OnWindows = ($env:OS -eq 'Windows_NT')
$Repo = Split-Path -Parent $PSScriptRoot
$Installer = Join-Path $Repo 'install.ps1'
$StubScript = Join-Path $PSScriptRoot 'install-stub.ps1'
$Shell = (Get-Process -Id $PID).Path
$Root = Join-Path ([IO.Path]::GetTempPath()) ("sp-install-test-" + [guid]::NewGuid().ToString('n').Substring(0, 8))
$Failures = New-Object System.Collections.ArrayList
$Utf8 = New-Object System.Text.UTF8Encoding $false

function Check([bool]$cond, [string]$msg) {
  if ($cond) { Write-Host "  ok   $msg" -ForegroundColor Green }
  else { Write-Host "  FAIL $msg" -ForegroundColor Red; [void]$Failures.Add("$($script:Case): $msg") }
}
function P { $parts = @(); foreach ($a in $args) { $parts += @($a) }; [IO.Path]::Combine([string[]]$parts) }
function Mk([string]$p) { [void](New-Item -ItemType Directory -Force -Path $p) }
function Put-File([string]$p, [string]$text) { Mk (Split-Path -Parent $p); [IO.File]::WriteAllText($p, $text, $Utf8) }
function Json([string]$p) { Get-Content -Raw -LiteralPath $p | ConvertFrom-Json }
function Servers([string]$agent) {
  $f = P $State "$agent.json"
  if (-not (Test-Path -LiteralPath $f)) { return @{} }
  $h = @{}
  foreach ($p in (Json $f).servers.PSObject.Properties) { $h[$p.Name] = [string]$p.Value }
  return $h
}
function Count([string]$text, [string]$needle) { ([regex]::Matches($text, [regex]::Escape($needle))).Count }

# ---- stubs -----------------------------------------------------------------
$ExeStub = $null
if ($OnWindows) {
  # A console .exe that hands its arguments to install-stub.ps1, for the
  # places where only an .exe will do (the Claude app's runtime). Add-Type
  # builds executables only on Windows PowerShell, so that compiles it.
  $cs = @'
using System; using System.Diagnostics; using System.IO;
class Stub { static int Main(string[] a) {
  string self = Process.GetCurrentProcess().MainModule.FileName;
  string q = "";
  foreach (string x in a) q += " \"" + x.Replace("\"", "\\\"") + "\"";
  ProcessStartInfo psi = new ProcessStartInfo(Environment.GetEnvironmentVariable("STUB_SHELL"),
    "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File \"" + Environment.GetEnvironmentVariable("STUB_SCRIPT") + "\" " +
    Path.GetFileNameWithoutExtension(self) + q);
  psi.UseShellExecute = false;
  psi.EnvironmentVariables["STUB_ID"] = self;
  Process p = Process.Start(psi); p.WaitForExit(); return p.ExitCode;
} }
'@
  Mk $Root
  $csFile = P $Root 'stub.cs'
  $ExeStub = P $Root 'stub.exe'
  [IO.File]::WriteAllText($csFile, $cs)
  & "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -Command "Add-Type -TypeDefinition (Get-Content -Raw '$csFile') -OutputAssembly '$ExeStub' -OutputType ConsoleApplication"
  if (-not (Test-Path $ExeStub)) { throw 'could not build the .exe stub' }
}

# Stub NAME in DIR: a CLI on PATH (FILE defaults to NAME, or NAME.cmd on
# Windows) that runs install-stub.ps1 as agent NAME.
function Stub([string]$dir, [string]$name) {
  Mk $dir
  if ($OnWindows) {
    $f = P $dir "$name.cmd"
    Put-File $f ("@echo off`r`nset STUB_ID=%~f0`r`n`"$Shell`" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$StubScript`" $name %*`r`nexit /b %ERRORLEVEL%`r`n")
  } else {
    $f = P $dir $name
    Put-File $f "#!/bin/sh`nSTUB_ID=`"`$0`" exec `"$Shell`" -NoProfile -NonInteractive -File `"$StubScript`" $name `"`$@`"`n"
    & chmod 755 $f
  }
}

# An .exe at PATH that runs as the agent its file name says (claude.exe: claude).
function ExeStub([string]$path) {
  Mk (Split-Path -Parent $path)
  if ($OnWindows) { Copy-Item $ExeStub $path }
  else {
    $name = [IO.Path]::GetFileNameWithoutExtension($path)
    Put-File $path "#!/bin/sh`nSTUB_ID=`"`$0`" exec `"$Shell`" -NoProfile -NonInteractive -File `"$StubScript`" $name `"`$@`"`n"
    & chmod 755 $path
  }
}

# ---- the fake server -------------------------------------------------------
$Team = @{
  team = 'Acme Corp'
  servers = @(@{ name = 'notes-mcp'; fallback_name = 'acme-corp-notes-mcp'; url = 'http://notes.s.test/mcp' })
  skills = @(
    @{ name = 'weekly-report'; version = 2; files = @(
      @{ path = 'SKILL.md'; content = "---`nname: weekly-report`ndescription: Write the weekly report.`n---`nSteps, caf$([char]0xe9)." },
      @{ path = 'scripts/pull.sh'; content = "#!/bin/sh`necho pull`n" }) },
    @{ name = 'mine'; version = 1; files = @(@{ path = 'SKILL.md'; content = 'theirs' }) },
    @{ name = 'escape'; version = 1; files = @(@{ path = '../outside.md'; content = 'no' }) },
    @{ name = 'trail'; version = 1; files = @(@{ path = 'SKILL.md'; content = 'x' }, @{ path = '.. /.. /settings.json'; content = 'replaced' }) }
  )
} | ConvertTo-Json -Depth 6
$listener = New-Object System.Net.Sockets.TcpListener ([System.Net.IPAddress]::Loopback), 0
$listener.Start()
$Port = $listener.LocalEndpoint.Port
$server = [powershell]::Create()
[void]$server.AddScript({
  param($l, $team)
  $enc = New-Object System.Text.UTF8Encoding $false
  while ($true) {
    try { $c = $l.AcceptTcpClient() } catch { break }
    # One connection at a time, so a client that sends nothing (a local
    # port watcher probing new ports does) must not hold up the next one.
    $c.ReceiveTimeout = 1000
    try {
      $s = $c.GetStream()
      $r = New-Object System.IO.StreamReader($s)
      $line = $r.ReadLine()
      while ($true) { $h = $r.ReadLine(); if (-not $h) { break } }
      $path = ($line -split ' ')[1]
      $status = '404 Not Found'; $body = '{"error":"not found"}'
      if ($path -eq '/healthz') { $status = '200 OK'; $body = 'ok' }
      elseif ($path -eq '/api/install/team?code=spi_good') { $status = '200 OK'; $body = $team }
      elseif ($path -like '/api/install/team*') { $body = '{"error":"this install line has expired or was already used: copy a new one"}' }
      $b = $enc.GetBytes($body)
      $head = $enc.GetBytes("HTTP/1.1 $status`r`nContent-Type: application/json`r`nContent-Length: $($b.Length)`r`nConnection: close`r`n`r`n")
      $s.Write($head, 0, $head.Length); $s.Write($b, 0, $b.Length); $s.Flush()
    } catch { } finally { $c.Close() }
  }
}).AddArgument($listener).AddArgument($Team)
$serverRun = $server.BeginInvoke()
$URL = "http://127.0.0.1:$Port"

# ---- one machine per case --------------------------------------------------
function New-Machine {
  $script:Home_ = P $Root ([guid]::NewGuid().ToString('n').Substring(0, 8))
  $script:State = P $Home_ 'stub-state'
  $script:Bin = P $Home_ 'bin'
  $script:WinApps = P $Home_ 'WindowsApps'
  $script:AppData = P $Home_ 'AppData' 'Roaming'
  $script:LocalAppData = P $Home_ 'AppData' 'Local'
  foreach ($d in @($State, $Bin, $AppData, $LocalAppData)) { Mk $d }
  $script:Appx = ''   # package folders Get-AppxPackage reports: a PowerShell list, quoted
  $script:Pre = ''    # the caller's session settings, run ahead of the installer
  # The Claude app's launcher, which a claude on PATH under WindowsApps is.
  Stub $WinApps 'claude'
}

function Install([hashtable]$extra) {
  $vars = @{
    USERPROFILE = $Home_; HOME = $Home_; APPDATA = $AppData; LOCALAPPDATA = $LocalAppData
    STUB_STATE = $State; STUB_SHELL = $Shell; STUB_SCRIPT = $StubScript; NO_COLOR = '1'
    SPAWNPOINT_URL = $URL; SPAWNPOINT_AGENT = $null; SPAWNPOINT_TEAM = $null; STUB_FAIL = $null
    CLAUDE_CONFIG_DIR = $null; CODEX_HOME = $null; DSH_HOME = $null
    VSCODE_PORTABLE = $null; VSCODE_APPDATA = $null
  }
  if ($OnWindows) { $vars.PATH = "$WinApps;$Bin;$env:SystemRoot\System32;$env:SystemRoot" }
  else { $vars.PATH = "$WinApps`:$Bin`:/usr/bin:/bin" }
  if ($extra) { foreach ($k in $extra.Keys) { $vars[$k] = $extra[$k] } }
  $saved = @{}
  foreach ($k in $vars.Keys) {
    $saved[$k] = [Environment]::GetEnvironmentVariable($k)
    [Environment]::SetEnvironmentVariable($k, $vars[$k])
  }
  try {
    # Get-AppxPackage is the one lookup a fake home cannot hide: a function
    # of that name wins over the cmdlet, so the installer sees only $Appx.
    $cmd = $Pre + "function Get-AppxPackage { foreach (`$l in @($Appx)) { [pscustomobject]@{ InstallLocation = `$l } } }; " +
      "Get-Content -Raw -LiteralPath '$Installer' | Invoke-Expression; exit `$LASTEXITCODE"
    $out = & $Shell -NoProfile -NonInteractive -Command $cmd 2>&1 | Out-String
    $script:Code = $LASTEXITCODE
  } finally {
    foreach ($k in $saved.Keys) { [Environment]::SetEnvironmentVariable($k, $saved[$k]) }
  }
  $script:Out = $out
  return $out
}

function Case([string]$name) { $script:Case = $name; Write-Host "`n$name" }
function Calls { $f = P $State 'calls.log'; if (Test-Path $f) { return (Get-Content -Raw $f) } else { return '' } }

$MCP = "$URL/mcp"
try {
  # ------------------------------------------------------------------------
  Case 'every agent, fresh machine'
  New-Machine
  foreach ($a in 'claude', 'codex', 'opencode', 'copilot', 'npx', 'agy') { Stub $Bin $a }
  Mk (P $Home_ '.cursor'); Mk (P $AppData 'Code' 'User'); Mk (P $Home_ '.jcode'); Mk (P $Home_ '.dsh')
  $o = Install
  Check ($Code -eq 0) "exits 0 (got $Code)"
  Check ($o.Contains('All set (wired: claude codex cursor opencode copilot vscode jcode dsh antigravity)')) 'wires all nine agents'
  Check ((Servers 'claude')['spawnpoint'] -eq $MCP) 'Claude Code has spawnpoint at the URL'
  Check ((Json (P $State 'claude.json')).plugins -contains 'spawnpoint@spawnpoint') 'the plugin is installed'
  $set = Json (P $Home_ '.claude' 'settings.json')
  Check ($set.extraKnownMarketplaces.spawnpoint.autoUpdate -eq $true -and $set.extraKnownMarketplaces.spawnpoint.source.repo -eq 'spawnpoint-inc/spawnpoint-plugin') 'plugin auto-update is on'
  Check (-not (Calls).Contains('WindowsApps')) 'the WindowsApps claude (the app launcher) is never run'
  Check ((Servers 'codex')['spawnpoint'] -eq $MCP) 'Codex has spawnpoint'
  Check ((Servers 'opencode')['spawnpoint'] -eq $MCP) 'opencode has spawnpoint'
  Check ((Servers 'copilot')['spawnpoint'] -eq $MCP) 'Copilot CLI has spawnpoint (over --transport http)'
  Check ((Servers 'agy')['spawnpoint'] -eq $MCP) 'Antigravity got it through agy mcp add'
  Check ((Json (P $Home_ '.cursor' 'mcp.json')).mcpServers.spawnpoint.url -eq $MCP) 'Cursor mcp.json'
  $vs = Json (P $AppData 'Code' 'User' 'mcp.json')
  Check ($vs.servers.spawnpoint.type -eq 'http' -and $vs.servers.spawnpoint.url -eq $MCP) 'VS Code user mcp.json'
  $raw = [IO.File]::ReadAllBytes((P $AppData 'Code' 'User' 'mcp.json'))
  Check ($raw[0] -eq [byte][char]'{') 'JSON is written without a BOM'
  $jc = (Json (P $Home_ '.jcode' 'mcp.json')).mcpServers.spawnpoint
  if ($OnWindows) { Check ($jc.command -eq 'cmd' -and ($jc.args -join ' ') -eq "/c npx -y mcp-remote $MCP") 'jcode bridges through cmd /c npx' }
  else { Check ($jc.command -eq 'npx' -and ($jc.args -join ' ') -eq "-y mcp-remote $MCP") 'jcode bridges through npx' }
  Check ($jc.timeout_secs -eq 330) 'jcode entry has timeout_secs 330'
  $dsh = Get-Content -Raw (P $Home_ '.dsh' 'cordis.patch.yml')
  Check ((Count $dsh '# >>> spawnpoint') -eq 1 -and $dsh.Contains("'mcp-remote', '$MCP'")) 'dsh patch block written'
  Check ((Count (Get-Content -Raw (P $Home_ '.gemini' 'GEMINI.md')) '<!-- >>> spawnpoint') -eq 1) 'Antigravity rule written'
  Check ($o.Contains("spawnpoint is up at $URL")) 'health check reaches the server'
  Check ($o.Contains('Claude Code:  restart it, run /mcp')) 'Claude Code sign-in step'
  $codexCmd = if ($OnWindows) { 'codex.cmd' } else { 'codex' }
  $npxCmd = if ($OnWindows) { 'npx.cmd' } else { 'npx' }
  Check ($o.Contains("Codex:        run: $codexCmd mcp login spawnpoint")) "Codex sign-in step names $codexCmd (never npm's .ps1 shim)"
  Check ($o.Contains("jcode:        sign in once with: $npxCmd -y mcp-remote $MCP")) "jcode sign-in step names $npxCmd"

  # ------------------------------------------------------------------------
  Case 're-run changes nothing twice'
  $before = Get-Content -Raw (P $Home_ '.dsh' 'cordis.patch.yml')
  $o = Install
  Check ($Code -eq 0) "exits 0 (got $Code)"
  Check ((Count $o 'MCP server already registered') -ge 3) 'Claude Code, Codex, Copilot report already registered'
  Check ($o.Contains('plugin already installed, updating') -and $o.Contains('plugin updates already on')) 'plugin left as it was'
  Check ((Get-Content -Raw (P $Home_ '.dsh' 'cordis.patch.yml')) -eq $before) 'dsh block replaced in place'
  Check ((Count (Get-Content -Raw (P $Home_ '.gemini' 'GEMINI.md')) '<!-- >>> spawnpoint') -eq 1) 'one Antigravity rule'

  # ------------------------------------------------------------------------
  Case 'a stale URL is re-pointed'
  $st = Json (P $State 'claude.json'); $st.servers.spawnpoint = 'https://old.example/mcp'
  [IO.File]::WriteAllText((P $State 'claude.json'), ($st | ConvertTo-Json -Depth 5))
  $st = Json (P $State 'codex.json'); $st.servers.spawnpoint = 'https://old.example/mcp'
  [IO.File]::WriteAllText((P $State 'codex.json'), ($st | ConvertTo-Json -Depth 5))
  $o = Install @{ SPAWNPOINT_AGENT = 'claude,codex' }
  Check ((Count $o 'registered at a stale URL, re-pointing') -eq 2) 'both say they re-point'
  Check ((Servers 'claude')['spawnpoint'] -eq $MCP -and (Servers 'codex')['spawnpoint'] -eq $MCP) 'both point at the URL again'
  Check ($o.Contains('(wired: claude codex)')) 'SPAWNPOINT_AGENT limits the run'

  # ------------------------------------------------------------------------
  Case 'the team line'
  Mk (P $Home_ '.claude' 'skills' 'mine'); Put-File (P $Home_ '.claude' 'skills' 'mine' 'SKILL.md') 'my own'
  $o = Install @{ SPAWNPOINT_AGENT = 'claude,codex,cursor'; SPAWNPOINT_TEAM = 'spi_good' }
  Check ($Code -eq 0) "exits 0 (got $Code)"
  Check ($o.Contains('Team: Acme Corp')) 'names the team'
  Check ((Servers 'claude')['notes-mcp'] -eq 'http://notes.s.test/mcp' -and (Servers 'codex')['notes-mcp'] -eq 'http://notes.s.test/mcp') 'team server added to Claude Code and Codex'
  $sk = P $Home_ '.claude' 'skills' 'weekly-report'
  Check ((Test-Path (P $sk 'scripts' 'pull.sh')) -and (Test-Path (P $sk '.spawnpoint-team'))) 'skill written with its marker'
  Check ([IO.File]::ReadAllText((P $sk 'SKILL.md')).EndsWith("caf$([char]0xe9).")) 'skill text keeps its UTF-8'
  Check (Test-Path (P $Home_ '.codex' 'skills' 'weekly-report' 'SKILL.md')) 'skill written for Codex'
  Check ((Get-Content -Raw (P $Home_ '.claude' 'skills' 'mine' 'SKILL.md')) -eq 'my own') "a skill of the member's own is kept"
  Check ($o.Contains('a skill of yours, so it was left as it is')) 'says so'
  Check ($o.Contains('skill escape has a file path outside its folder; skipped') -and -not (Test-Path (P $Home_ '.claude' 'outside.md'))) 'a path out of its folder is refused'
  Check ($o.Contains('skill trail has a file path outside its folder; skipped')) 'a path that is .. on Windows (`.. `) is refused'
  Check ((Json (P $Home_ '.claude' 'settings.json')).extraKnownMarketplaces.spawnpoint.autoUpdate -eq $true) 'settings.json is not overwritten by a skill'
  Check ($o.Contains("Add the team's MCP servers to cursor by hand for now:")) 'other agents get the address'
  $o = Install @{ SPAWNPOINT_AGENT = 'claude,codex'; SPAWNPOINT_TEAM = 'spi_good' }
  Check ($o.Contains('MCP server notes-mcp already added') -and $o.Contains('skill weekly-report (version 2)')) 're-run: server kept, skill rewritten'

  # ------------------------------------------------------------------------
  Case 'a used team code stops before any agent is touched'
  New-Machine
  Stub $Bin 'claude'
  $o = Install @{ SPAWNPOINT_TEAM = 'spi_used' }
  Check ($Code -eq 1) "exits 1 (got $Code)"
  Check ($o.Contains('this install line has expired or was already used')) "shows the server's message"
  Check ((Servers 'claude').Count -eq 0 -and -not (Calls).Contains('mcp add')) 'nothing was wired'

  # ------------------------------------------------------------------------
  Case 'the Claude app only: its bundled runtime'
  New-Machine
  $cc = P $AppData 'Claude' 'claude-code'
  ExeStub (P $cc '2.1.9' 'claude.exe')
  ExeStub (P $cc '2.1.10' 'a1b2c3d4e5f6' 'claude.exe')
  $o = Install
  Check ($Code -eq 0) "exits 0 (got $Code)"
  Check ($o.Contains("using the desktop app's bundled runtime")) 'says it uses the app runtime'
  Check ((Calls).Contains('a1b2c3d4e5f6') -and -not (Calls).Contains('2.1.9')) 'picks 2.1.10 over 2.1.9 (versions, not text)'
  Check ((Servers 'claude')['spawnpoint'] -eq $MCP) 'registered through it'
  Check ($o.Contains('Claude app:   restart it, open the Code tab')) 'the app sign-in step'

  Case 'the Claude app from the Store: LocalCache runtime'
  New-Machine
  ExeStub (P $LocalAppData 'Packages' 'Claude_pzs8sxrjxfjjc' 'LocalCache' 'Roaming' 'Claude' 'claude-code' '2.1.300' 'ffffffffffff' 'claude.exe')
  $o = Install
  Check ($Code -eq 0 -and (Servers 'claude')['spawnpoint'] -eq $MCP) 'registered through the packaged runtime'

  Case 'the Claude app 3.1623 and later: Claude-Data runtime'
  New-Machine
  ExeStub (P $LocalAppData 'Claude-Data' 'claude_pzs8sxrjxfjjc' 'claude-code' '2.1.304' 'claude.exe')
  $o = Install
  Check ($Code -eq 0 -and (Servers 'claude')['spawnpoint'] -eq $MCP) 'registered through the Claude-Data runtime'

  Case 'the native installer off PATH'
  New-Machine
  ExeStub (P $Home_ '.local' 'bin' 'claude.exe')
  $o = Install
  Check ($Code -eq 0 -and (Servers 'claude')['spawnpoint'] -eq $MCP) 'uses ~\.local\bin\claude.exe'
  Check ($o.Contains('Claude Code:  restart it')) 'the CLI sign-in step'

  Case 'the ChatGPT app only: its staged Codex'
  New-Machine
  ExeStub (P $LocalAppData 'OpenAI' 'Codex' 'bin' 'codex.exe')
  $o = Install
  Check ($Code -eq 0 -and (Servers 'codex')['spawnpoint'] -eq $MCP) 'registered through the app copy'
  Check ($o.Contains('in the ChatGPT app, open Codex and approve spawnpoint')) 'the app sign-in step'

  Case 'the ChatGPT app only: its staged Codex in a build folder'
  New-Machine
  ExeStub (P $LocalAppData 'OpenAI' 'Codex' 'bin' '3135b80b111fd431' 'codex.exe')
  $o = Install
  Check ($Code -eq 0 -and (Servers 'codex')['spawnpoint'] -eq $MCP) 'registered through the staged build'
  Check ((Calls).Contains('3135b80b111fd431')) 'ran the staged build'

  Case 'a portable VS Code: its own data folder'
  New-Machine
  Mk (P $Home_ 'data')
  Stub $Bin 'code'
  $o = Install
  $pm = P $Home_ 'data' 'user-data' 'User' 'mcp.json'
  Check ($Code -eq 0 -and (Test-Path $pm) -and (Json $pm).servers.spawnpoint.url -eq $MCP) 'written to data\user-data\User\mcp.json'
  Check (-not (Test-Path (P $AppData 'Code' 'User' 'mcp.json'))) 'nothing written under APPDATA'

  Case 'the ChatGPT app from the Store: its packaged Codex'
  New-Machine
  $pkg = P $Home_ 'WindowsAppsPkg' 'OpenAI.Codex_26.1.0.0_x64__2p2nqsd0c76g0'
  ExeStub (P $pkg 'app' 'resources' 'codex.exe')
  $script:Appx = "'$pkg'"
  $o = Install
  Check ($Code -eq 0 -and (Servers 'codex')['spawnpoint'] -eq $MCP) 'registered through the package copy'
  Check ((Calls).Contains('OpenAI.Codex_26.1.0.0')) 'ran the package copy'

  # ------------------------------------------------------------------------
  Case 'a config file that is not JSON is left alone'
  New-Machine
  Put-File (P $Home_ '.cursor' 'mcp.json') '{ not json'
  Stub $Bin 'copilot'
  $o = Install
  Check ((Get-Content -Raw (P $Home_ '.cursor' 'mcp.json')) -eq '{ not json') 'mcp.json untouched'
  Check ($o.Contains('(wired: copilot)')) 'Cursor not counted as wired'

  Case 'JSONC: a trailing comma is fine, a comment is left alone, dates stay strings'
  New-Machine
  $when = '2026-11-13T10:00:00+02:00'
  Put-File (P $Home_ '.cursor' 'mcp.json') "{`n  `"mcpServers`": {`n    `"other`": { `"url`": `"http://o.test/mcp`", `"env`": { `"WHEN`": `"$when`", `"Q`": `"a \`"b\`" c`", `"PU`": `"\ue000x`" } },`n  },`n}`n"
  $vsc = "// my servers`n{ `"servers`": {} }`n"
  Put-File (P $AppData 'Code' 'User' 'mcp.json') $vsc
  $o = Install
  $cur = Get-Content -Raw (P $Home_ '.cursor' 'mcp.json')
  Check ((Json (P $Home_ '.cursor' 'mcp.json')).mcpServers.spawnpoint.url -eq $MCP) 'Cursor wired despite trailing commas'
  Check ($cur.Contains("`"$when`"")) "another server's date string is written back as it was"
  Check ((Json (P $Home_ '.cursor' 'mcp.json')).mcpServers.other.env.Q -eq 'a "b" c') 'escaped quotes survive'
  Check ((Json (P $Home_ '.cursor' 'mcp.json')).mcpServers.other.url -eq 'http://o.test/mcp') "another server's URL is unchanged"
  Check ((Json (P $Home_ '.cursor' 'mcp.json')).mcpServers.other.env.PU -eq ([string][char]0xE000 + 'x')) "a private-use character of the user's survives"
  Check (-not $cur.Contains([string][char]0xE001)) 'no mark left in the file'
  Check ((Get-Content -Raw (P $AppData 'Code' 'User' 'mcp.json')) -eq $vsc) 'VS Code mcp.json with a comment is untouched'
  Check ($o.Contains('(wired: cursor)')) 'VS Code not counted as wired'

  Case "a user's own server whose name differs only in case is kept"
  New-Machine
  $mine = '{"mcpServers":{"SpawnPoint":{"command":"mine"}}}'
  Put-File (P $Home_ '.cursor' 'mcp.json') $mine
  Stub $Bin 'copilot'
  $o = Install
  Check ((Get-Content -Raw (P $Home_ '.cursor' 'mcp.json')) -eq $mine) 'mcp.json untouched'
  Check ($o.Contains('(wired: copilot)')) 'Cursor not counted as wired'

  Case 'VS Code with VSCODE_APPDATA set'
  New-Machine
  Stub $Bin 'code'
  $va = P $Home_ 'Profiles'
  $o = Install @{ VSCODE_APPDATA = $va }
  Check ($Code -eq 0 -and (Json (P $va 'Code' 'User' 'mcp.json')).servers.spawnpoint.url -eq $MCP) 'written under VSCODE_APPDATA'

  Case 'VS Code with VSCODE_PORTABLE set'
  New-Machine
  Stub $Bin 'code'
  $vp = P $Home_ 'CodeData'
  $o = Install @{ VSCODE_PORTABLE = $vp }
  Check ($Code -eq 0 -and (Json (P $vp 'user-data' 'User' 'mcp.json')).servers.spawnpoint.url -eq $MCP) 'written under VSCODE_PORTABLE'

  Case 'a SPAWNPOINT_URL cmd.exe would misread stops the run'
  New-Machine
  Stub $Bin 'claude'
  $o = Install @{ SPAWNPOINT_URL = 'http://localhost:1/x&calc' }
  Check ($Code -eq 1 -and $o.Contains('SPAWNPOINT_URL must be a plain http(s) URL')) 'stops with the reason'
  Check (-not (Calls).Contains('mcp add')) 'nothing was wired'

  # iex runs the installer in the caller's session, so a caller's strict mode
  # reaches every line of it.
  Case 'a caller in strict mode'
  New-Machine
  $script:Pre = 'Set-StrictMode -Version Latest; '
  foreach ($a in 'claude', 'codex', 'opencode', 'copilot', 'npx', 'agy') { Stub $Bin $a }
  Mk (P $Home_ '.cursor'); Mk (P $AppData 'Code' 'User'); Mk (P $Home_ '.jcode'); Mk (P $Home_ '.dsh')
  $o = Install
  Check ($Code -eq 0) "exits 0 (got $Code)"
  Check ($o.Contains('All set (wired: claude codex cursor opencode copilot vscode jcode dsh antigravity)')) 'wires all nine agents'
  Check (-not $o.Contains('cannot be found') -and -not $o.Contains('has not been set')) 'no strict-mode error'

  Case 'an agent that fails is reported and skipped'
  New-Machine
  Stub $Bin 'codex'; Stub $Bin 'copilot'
  $o = Install @{ STUB_FAIL = 'codex' }
  Check ($o.Contains('could not register; try: codex mcp add spawnpoint') -and $o.Contains('(wired: copilot)')) 'Codex warns, Copilot still wired'

  Case 'no agent at all'
  New-Machine
  $o = Install
  Check ($Code -eq 1) "exits 1 (got $Code)"
  Check ($o.Contains('no supported agent found')) 'says so'

  Case 'nothing requested is present'
  New-Machine
  Stub $Bin 'copilot'
  $o = Install @{ SPAWNPOINT_AGENT = 'codex' }
  Check ($Code -eq 1 -and $o.Contains('nothing was wired. Requested: codex; found: copilot.')) 'stops with what it found'

  Case 'the server is down'
  New-Machine
  Stub $Bin 'copilot'
  $o = Install @{ SPAWNPOINT_URL = 'http://127.0.0.1:9' }
  Check ($Code -eq 0 -and $o.Contains('spawnpoint is not answering at http://127.0.0.1:9 yet')) 'wires anyway and says the server is not up'
} finally {
  $listener.Stop()
  [void]$server.EndInvoke($serverRun)
  $server.Dispose()
  Remove-Item -Recurse -Force $Root -ErrorAction SilentlyContinue
}

Write-Host ''
if ($Failures.Count) {
  Write-Host "$($Failures.Count) failed ($($PSVersionTable.PSVersion), $Shell):" -ForegroundColor Red
  $Failures | ForEach-Object { Write-Host "  $_" }
  exit 1
}
Write-Host "all passed ($($PSVersionTable.PSVersion), $Shell)" -ForegroundColor Green
