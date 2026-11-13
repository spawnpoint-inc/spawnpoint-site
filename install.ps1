# spawnpoint installer for Windows: wires spawnpoint into every coding agent
# on this machine (Claude Code or the Claude app, Codex (CLI or the ChatGPT
# app), Cursor, opencode, GitHub Copilot CLI, VS Code Copilot, jcode,
# DeepSeek Harness, Antigravity). In PowerShell:
#
#   irm https://getspawnpoint.com/install.ps1 | iex
#
# The same as https://getspawnpoint.com/install (bash, for macOS and Linux),
# and safe to re-run: it wires each agent it finds and skips the ones it
# doesn't. Restrict to specific agents with SPAWNPOINT_AGENT
# (comma-separated):
#
#   $env:SPAWNPOINT_AGENT = 'codex'; irm https://getspawnpoint.com/install.ps1 | iex
#
# Points agents at the hosted spawnpoint (https://app.getspawnpoint.com) by
# default; override with SPAWNPOINT_URL for a dev instance:
#
#   $env:SPAWNPOINT_URL = 'http://localhost:8080'; irm https://getspawnpoint.com/install.ps1 | iex
#
# A team's install code (SPAWNPOINT_TEAM, from the team page in the
# console: it works once, for 15 minutes) is traded for the team's MCP
# servers and skills, which go into Claude Code and Codex.
#
# Runs on Windows PowerShell 5.1 and PowerShell 7. This file stays ASCII:
# Windows PowerShell decodes a download with no charset as Latin-1, so a
# non-ASCII character here would reach iex garbled. The check marks below
# are built from code points for that reason.

& {
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'   # Windows PowerShell's progress bar slows every request

$OnWindows = ($env:OS -eq 'Windows_NT')
$UserHome = if ($env:USERPROFILE) { $env:USERPROFILE } else { $HOME }
$URL = if ($env:SPAWNPOINT_URL) { $env:SPAWNPOINT_URL.TrimEnd('/') } else { 'https://app.getspawnpoint.com' }
$MCP = "$URL/mcp"
$Agents = if ($env:SPAWNPOINT_AGENT) { $env:SPAWNPOINT_AGENT } else { '' }
$TeamCode = if ($env:SPAWNPOINT_TEAM) { $env:SPAWNPOINT_TEAM } else { '' }
$Color = -not $env:NO_COLOR
$Check = [string][char]0x2713
# Everything the functions below change lives in this one table: iex runs
# the script in the caller's session, so a $script: variable would land there.
$SP = @{
  Wired = New-Object System.Collections.ArrayList
  Steps = New-Object System.Collections.ArrayList
  Team = $null       # the team's servers and skills, fetched once (the code works once)
  TeamAdded = New-Object System.Collections.ArrayList
}

# ---- pretty ----------------------------------------------------------------
function Put([string]$text, [string]$fg, [string]$bg) {
  if ($Color -and $fg -and $bg) { Write-Host $text -NoNewline -ForegroundColor $fg -BackgroundColor $bg }
  elseif ($Color -and $fg) { Write-Host $text -NoNewline -ForegroundColor $fg }
  else { Write-Host $text -NoNewline }
}
function Step([string]$t) { Put '==>' 'Red'; Put " $t`n" 'White' }
function Ok([string]$t) { Put "  $Check" 'Green'; Write-Host " $t" }
function Note([string]$t) { Put "  $t`n" 'DarkGray' }
function Warn([string]$t) { Put "  ! $t`n" 'Red' }
function Die([string]$t) { Put "  x $t`n" 'Red'; throw 'spawnpoint-stop' }
function AddStep([string]$t) { [void]$SP.Steps.Add($t) }
function Tilde([string]$p) {
  if ($UserHome -and $p.StartsWith($UserHome)) { return '~' + $p.Substring($UserHome.Length) }
  return $p
}
# How to type PROGRAM (found at PATH) in the step lines: npm's shims are
# NAME.cmd and NAME.ps1, and PowerShell picks the .ps1, which the default
# execution policy refuses, so a .cmd is named in full.
function Typed([string]$path, [string]$name) {
  if ($path -match '\.(cmd|bat)$') { return $name + $Matches[0] }
  return $name
}

function J {  # J a b c: a path from its parts (an array argument counts as its parts)
  $parts = New-Object System.Collections.ArrayList
  foreach ($x in $args) { foreach ($y in @($x)) { [void]$parts.Add([string]$y) } }
  return [IO.Path]::Combine([string[]]$parts.ToArray())
}

# ---- helpers ---------------------------------------------------------------
function Wants([string]$a) {  # is this agent requested (or is everything requested)?
  if (-not $Agents) { return $true }
  return (",$Agents," -replace '\s', '').Contains(",$a,")
}

# The first program called NAME on PATH (an .exe or an npm .cmd shim, never
# an npm .ps1 shim: the default execution policy refuses those). SKIP is a
# pattern for paths to pass over.
function Find-Program([string]$name, [string]$skip) {
  foreach ($c in @(Get-Command $name -CommandType Application -All -ErrorAction SilentlyContinue)) {
    if ($skip -and $c.Source -match $skip) { continue }
    return $c.Source
  }
  return $null
}

# Run EXE with ARGS; true when it exits 0. Its output is discarded.
function Run([string]$exe, [string[]]$a) {
  $global:LASTEXITCODE = 0
  try { & $exe @a *> $null } catch { return $false }
  return ($LASTEXITCODE -eq 0)
}

# EXE's whole output, read before anything matches it (the bash installer's
# `has` explains why); empty when it fails to start.
function OutOf([string]$exe, [string[]]$a) {
  try { return [string](& $exe @a 2>$null | Out-String) } catch { return '' }
}
function Has([string]$text, [string]$exe, [string[]]$a) {
  return (OutOf $exe $a).Contains($text)
}

$Utf8 = New-Object System.Text.UTF8Encoding $false   # no BOM: Node's JSON.parse refuses one

# PowerShell 6 to 7.4 turn a string that looks like a date into a date, which
# would go back out in another format (another server's settings rewritten);
# 7.5 and later can be told not to. On the others, Read-Json puts this mark at
# the front of every string value, so none looks like a date, and Write-Json
# takes the marks out again.
$Mark = [string][char]0xE000
$HasDateKind = (Get-Command ConvertFrom-Json).Parameters.ContainsKey('DateKind')

# JSON from a file that may be JSONC (VS Code's and Cursor's allow comments
# and trailing commas): trailing commas are dropped; a comment is a throw,
# since writing the file back would lose it. With MARK, every string value
# (not a key) gets $Mark after its opening quote.
function Clean-Json([string]$text, [bool]$mark) {
  $out = New-Object System.Text.StringBuilder
  $i = 0; $n = $text.Length
  while ($i -lt $n) {
    $c = $text[$i]
    if ($c -eq '"') {
      $j = $i + 1
      while ($j -lt $n -and $text[$j] -ne '"') { if ($text[$j] -eq '\') { $j++ }; $j++ }
      $k = $j + 1
      while ($k -lt $n -and [char]::IsWhiteSpace($text[$k])) { $k++ }
      $isKey = ($k -lt $n -and $text[$k] -eq ':')
      [void]$out.Append('"')
      if ($mark -and -not $isKey) { [void]$out.Append($Mark) }
      [void]$out.Append($text.Substring($i + 1, [Math]::Min($j + 1, $n) - $i - 1))
      $i = $j + 1
      continue
    }
    if ($c -eq '/' -and $i + 1 -lt $n -and ($text[$i + 1] -eq '/' -or $text[$i + 1] -eq '*')) {
      throw 'the file has comments, which writing it back would lose'
    }
    if ($c -eq ',') {
      $k = $i + 1
      while ($k -lt $n -and [char]::IsWhiteSpace($text[$k])) { $k++ }
      if ($k -lt $n -and ($text[$k] -eq '}' -or $text[$k] -eq ']')) { $i++; continue }
    }
    [void]$out.Append($c)
    $i++
  }
  return $out.ToString()
}

function Read-Json([string]$p) {  # an object, or a throw when the file is not one
  if (-not (Test-Path -LiteralPath $p -PathType Leaf)) { return New-Object PSObject }
  $text = [IO.File]::ReadAllText($p)
  if ([string]::IsNullOrWhiteSpace($text)) { return New-Object PSObject }
  if ($HasDateKind) {
    $o = ConvertFrom-Json -InputObject (Clean-Json $text $false) -DateKind String -ErrorAction Stop
  } else {
    $o = ConvertFrom-Json -InputObject (Clean-Json $text $true) -ErrorAction Stop
  }
  if ($o -isnot [System.Management.Automation.PSCustomObject]) { throw "$p is not a JSON object" }
  return $o
}

function Write-Text([string]$p, [string]$text) {  # whole file, replaced in one step
  $dir = Split-Path -Parent $p
  if ($dir -and -not (Test-Path -LiteralPath $dir)) { [void](New-Item -ItemType Directory -Force -Path $dir -ErrorAction Stop) }
  $tmp = "$p.spawnpoint-tmp"
  [IO.File]::WriteAllText($tmp, $text, $Utf8)
  # File.Replace swaps the new file in in one step; Move-Item -Force deletes
  # the old file first, so a failed move would lose it.
  if ([IO.File]::Exists($p)) { [IO.File]::Replace($tmp, $p, [NullString]::Value) }
  else { [IO.File]::Move($tmp, $p) }
}

function Write-Json([string]$p, $obj) {
  Write-Text $p ((ConvertTo-Json -InputObject $obj -Depth 64).Replace($Mark, '') + "`n")
}

function Set-Prop($obj, [string]$name, $value) {
  if ($obj.PSObject.Properties[$name]) { $obj.$name = $value }
  else { $obj | Add-Member -NotePropertyName $name -NotePropertyValue $value }
}

function Child($obj, [string]$name) {  # obj.name as an object, made when missing
  $v = $obj.PSObject.Properties[$name]
  if (-not $v -or $null -eq $v.Value) {
    $c = New-Object PSObject
    Set-Prop $obj $name $c
    return $c
  }
  if ($v.Value -isnot [System.Management.Automation.PSCustomObject]) { throw "$name is not a JSON object" }
  return $v.Value
}

# mcpServers.spawnpoint = ENTRY in the JSON file P (Cursor, jcode, Antigravity).
function Set-McpServer([string]$p, [string]$key, $entry) {
  try {
    $cfg = Read-Json $p
    Set-Prop (Child $cfg $key) 'spawnpoint' $entry
    Write-Json $p $cfg
    return $true
  } catch { return $false }
}

# The mcp-remote bridge for agents that speak stdio-only MCP. On Windows npx
# is a .cmd shim, which an agent that starts a program directly cannot run,
# so the bridge goes through cmd /c there.
function Bridge-Command { if ($OnWindows) { return 'cmd' } else { return 'npx' } }
function Bridge-Args {
  if ($OnWindows) { return @('/c', 'npx', '-y', 'mcp-remote', $MCP) }
  return @('-y', 'mcp-remote', $MCP)
}

# ---- Claude Code: plugin (skills) + MCP ------------------------------------
# The Claude desktop app bundles its own Claude Code runtime that reads the
# same user-scope config (~\.claude.json, ~\.claude\plugins) as the CLI, so a
# machine with only the app still gets wired. Find-Claude prefers the CLI on
# PATH, then the native installer's ~\.local\bin\claude.exe (its PATH entry
# is not always written), then the newest runtime the app keeps under its
# data folder: %APPDATA%\Claude\claude-code\<version>[\<build-id>]\claude.exe,
# or the same under the Store package's LocalCache\Roaming, where Windows
# moves an MSIX app's AppData writes. A `claude` under WindowsApps is the
# app's own launcher, not Claude Code, so it is passed over.
function Find-Claude {
  $p = Find-Program 'claude' '[\\/]WindowsApps[\\/]'
  if ($p) { return @{ Path = $p; Kind = 'path' } }
  $native = J $UserHome '.local' 'bin' 'claude.exe'
  if (Test-Path -LiteralPath $native -PathType Leaf) { return @{ Path = $native; Kind = 'cli' } }
  $roots = @()
  if ($env:APPDATA) { $roots += (J $env:APPDATA 'Claude' 'claude-code') }
  if ($env:LOCALAPPDATA) { $roots += (J $env:LOCALAPPDATA 'Packages' 'Claude_pzs8sxrjxfjjc' 'LocalCache' 'Roaming' 'Claude' 'claude-code') }
  $found = @()
  foreach ($root in $roots) {
    foreach ($v in @(Get-ChildItem -LiteralPath $root -Directory -ErrorAction SilentlyContinue)) {
      $ver = [version]'0.0'
      [void][version]::TryParse(($v.Name -replace '[^0-9.].*$', ''), [ref]$ver)
      $bins = @(J $v.FullName 'claude.exe')
      foreach ($b in @(Get-ChildItem -LiteralPath $v.FullName -Directory -ErrorAction SilentlyContinue)) {
        $bins += (J $b.FullName 'claude.exe')
      }
      foreach ($bin in $bins) {
        $f = Get-Item -LiteralPath $bin -ErrorAction SilentlyContinue
        if ($f -and -not $f.PSIsContainer) { $found += [pscustomobject]@{ Ver = $ver; Time = $f.LastWriteTimeUtc; Path = $f.FullName } }
      }
    }
  }
  $best = $found | Sort-Object -Property @{ Expression = 'Ver'; Descending = $true }, @{ Expression = 'Time'; Descending = $true } | Select-Object -First 1
  if ($best) { return @{ Path = $best.Path; Kind = 'app' } }
  return $null
}

# Claude Code leaves a third-party marketplace on manual updates, so the
# installer sets autoUpdate on spawnpoint's entry in the user's settings.json
# (see the bash installer for the whole story) and leaves the rest of the
# file as it was; a file that isn't plain JSON is left alone.
function Claude-AutoUpdate {
  $manual = 'to get plugin updates by themselves: in Claude Code, /plugin, Marketplaces, spawnpoint, Enable auto-update'
  $dir = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { J $UserHome '.claude' }
  $p = J $dir 'settings.json'
  try {
    $cfg = Read-Json $p
    $markets = Child $cfg 'extraKnownMarketplaces'
    if (-not $markets.PSObject.Properties['spawnpoint']) {
      Set-Prop $markets 'spawnpoint' ([pscustomobject]@{ source = [pscustomobject]@{ source = 'github'; repo = 'spawnpoint-inc/spawnpoint-plugin' } })
    }
    $entry = $markets.spawnpoint
    if ($entry -isnot [System.Management.Automation.PSCustomObject]) { throw 'not an object' }
    if ($entry.PSObject.Properties['autoUpdate'] -and $entry.autoUpdate -eq $true) {
      Ok 'plugin updates already on'
      return
    }
    Set-Prop $entry 'autoUpdate' $true
    Write-Json $p $cfg
    Ok 'plugin updates turned on: new versions install by themselves'
  } catch {
    Note $manual
  }
}

function Wire-Claude {
  Step 'Claude Code'
  $c = Find-Claude
  if (-not $c) { Note 'not found, skipping'; return $false }
  $exe = $c.Path
  if ($c.Kind -eq 'app') { Note "CLI not on PATH; using the desktop app's bundled runtime" }
  elseif ($c.Kind -eq 'cli') { Note "CLI not on PATH; using $(Tilde $exe)" }
  if (Run $exe @('plugin', 'marketplace', 'add', 'spawnpoint-inc/spawnpoint-plugin')) {
    Ok 'marketplace added (spawnpoint-inc/spawnpoint-plugin)'
  } elseif (Run $exe @('plugin', 'marketplace', 'update', 'spawnpoint')) {
    Ok 'marketplace already present, refreshed'
  } else {
    Warn 'could not add the marketplace; try: claude plugin marketplace add spawnpoint-inc/spawnpoint-plugin'
    return $false
  }
  if (Has 'spawnpoint@spawnpoint' $exe @('plugin', 'list')) {
    Ok 'plugin already installed, updating'
    [void](Run $exe @('plugin', 'update', 'spawnpoint@spawnpoint'))
  } elseif (Run $exe @('plugin', 'install', 'spawnpoint@spawnpoint')) {
    Ok "plugin installed (spawnpoint's skills)"
  } else {
    Warn 'plugin install failed; try: claude plugin install spawnpoint@spawnpoint'
    return $false
  }
  Claude-AutoUpdate
  if (Has $MCP $exe @('mcp', 'get', 'spawnpoint')) {
    Ok 'MCP server already registered'
  } else {
    if ((OutOf $exe @('mcp', 'list')) -match '(?m)^spawnpoint:') {
      Note 'registered at a stale URL, re-pointing'
      [void](Run $exe @('mcp', 'remove', 'spawnpoint', '-s', 'user'))
    }
    if (Run $exe @('mcp', 'add', '--transport', 'http', '--scope', 'user', 'spawnpoint', $MCP)) {
      Ok "MCP server registered ($MCP)"
    } else {
      Warn "could not register; try: claude mcp add --transport http --scope user spawnpoint $MCP"
      return $false
    }
  }
  if ($c.Kind -eq 'app') {
    AddStep '  Claude app:   restart it, open the Code tab, run /mcp, pick spawnpoint, Authenticate.'
  } else {
    AddStep '  Claude Code:  restart it, run /mcp, pick spawnpoint, choose Authenticate.'
  }
  return $true
}

# ---- Codex: MCP over streamable HTTP ---------------------------------------
# Codex ships as a CLI (npm's codex.cmd, or the standalone codex.exe) and
# inside the ChatGPT desktop app. All of them read ~\.codex, so wiring through
# any one configures them all. The app's own codex.exe sits in its Store
# package, where Windows can refuse to run it from outside the app, so the
# copy the app stages under %LOCALAPPDATA%\OpenAI\Codex\bin comes first.
function Find-Codex {
  $p = Find-Program 'codex' ''
  if ($p) { return @{ Path = $p; Kind = 'path' } }
  if ($env:LOCALAPPDATA) {
    $cli = J $env:LOCALAPPDATA 'Programs' 'OpenAI' 'Codex' 'bin' 'codex.exe'
    if (Test-Path -LiteralPath $cli -PathType Leaf) { return @{ Path = $cli; Kind = 'cli' } }
    $staged = J $env:LOCALAPPDATA 'OpenAI' 'Codex' 'bin' 'codex.exe'
    if (Test-Path -LiteralPath $staged -PathType Leaf) { return @{ Path = $staged; Kind = 'app' } }
  }
  if (Get-Command Get-AppxPackage -ErrorAction SilentlyContinue) {
    try {
      foreach ($pkg in @(Get-AppxPackage -Name 'OpenAI.*' -ErrorAction SilentlyContinue)) {
        $bin = J $pkg.InstallLocation 'app' 'resources' 'codex.exe'
        if (Test-Path -LiteralPath $bin -PathType Leaf) { return @{ Path = $bin; Kind = 'app' } }
      }
    } catch { }
  }
  return $null
}

function Wire-Codex {
  Step 'Codex'
  $c = Find-Codex
  if (-not $c) { Note 'not found, skipping'; return $false }
  $exe = $c.Path
  if ($c.Kind -eq 'app') { Note "CLI not on PATH; using the ChatGPT app's bundled Codex" }
  elseif ($c.Kind -eq 'cli') { Note "CLI not on PATH; using $(Tilde $exe)" }
  if (Has $MCP $exe @('mcp', 'get', 'spawnpoint')) {
    Ok 'MCP server already registered'
  } else {
    if (Run $exe @('mcp', 'get', 'spawnpoint')) {
      Note 'registered at a stale URL, re-pointing'
      [void](Run $exe @('mcp', 'remove', 'spawnpoint'))
    }
    if (Run $exe @('mcp', 'add', 'spawnpoint', '--url', $MCP)) {
      Ok "MCP server registered ($MCP)"
    } else {
      Warn "could not register; try: codex mcp add spawnpoint --url $MCP"
      return $false
    }
  }
  switch ($c.Kind) {
    'path' { AddStep "  Codex:        run: $(Typed $exe 'codex') mcp login spawnpoint   (approve in the browser)" }
    'cli' { AddStep "  Codex:        run: & `"$exe`" mcp login spawnpoint   (approve in the browser)" }
    default { AddStep '  Codex:        in the ChatGPT app, open Codex and approve spawnpoint (sign-in opens in the browser)' }
  }
  return $true
}

# ---- Cursor (IDE + cursor-agent share ~\.cursor\mcp.json) ------------------
function Wire-Cursor {
  Step 'Cursor'
  $p = J $UserHome '.cursor' 'mcp.json'
  if (-not (Set-McpServer $p 'mcpServers' ([pscustomobject]@{ url = $MCP }))) {
    Warn "could not update $(Tilde $p) (it must be valid JSON); add spawnpoint by hand"
    return $false
  }
  Ok "registered in $(Tilde $p) ($MCP)"
  $agent = Find-Program 'cursor-agent' ''
  if ($agent) {
    AddStep "  Cursor:       run: $(Typed $agent 'cursor-agent') mcp login spawnpoint   (or approve in the IDE's MCP settings)"
  } else {
    AddStep "  Cursor:       open the IDE's MCP settings and approve spawnpoint (sign-in happens in the browser)."
  }
  return $true
}

# ---- opencode: remote MCP over streamable HTTP -----------------------------
function Wire-Opencode {
  Step 'opencode'
  $exe = Find-Program 'opencode' ''
  if (Has $MCP $exe @('mcp', 'list')) {
    Ok 'MCP server already registered'
  } elseif (Run $exe @('mcp', 'add', 'spawnpoint', '--url', $MCP)) {
    Ok "MCP server registered ($MCP)"
  } else {
    Warn "could not register; try: opencode mcp add spawnpoint --url $MCP"
    return $false
  }
  AddStep "  opencode:     run: $(Typed $exe 'opencode') mcp auth spawnpoint   (approve in the browser)"
  return $true
}

# ---- GitHub Copilot CLI: remote MCP over streamable HTTP -------------------
function Wire-Copilot {
  Step 'GitHub Copilot CLI'
  $exe = Find-Program 'copilot' ''
  if (Has $MCP $exe @('mcp', 'get', 'spawnpoint')) {
    Ok 'MCP server already registered'
  } else {
    if (Run $exe @('mcp', 'get', 'spawnpoint')) {
      Note 'registered at a stale URL, re-pointing'
      [void](Run $exe @('mcp', 'remove', 'spawnpoint'))
    }
    if (Run $exe @('mcp', 'add', 'spawnpoint', $MCP)) {
      Ok "MCP server registered ($MCP)"
    } else {
      Warn "could not register; try: copilot mcp add spawnpoint $MCP"
      return $false
    }
  }
  AddStep '  Copilot CLI:  run copilot and use a spawnpoint tool; approve the browser sign-in when prompted'
  return $true
}

# ---- VS Code (Copilot Chat / agent mode) -----------------------------------
# `code --add-mcp` takes the server as JSON, and on Windows `code` is a .cmd
# shim that loses the JSON's quotes on the way through cmd.exe, so the
# installer writes the entry it would have written: servers.spawnpoint in the
# user profile's mcp.json.
function VSCode-Profile {
  if ($env:APPDATA) { return (J $env:APPDATA 'Code' 'User') }
  return $null
}

function Wire-Vscode {
  Step 'VS Code Copilot'
  $dir = VSCode-Profile
  if (-not $dir) { Warn "could not find the VS Code profile; in VS Code run `"MCP: Add Server`" and point it at $MCP"; return $false }
  $p = J $dir 'mcp.json'
  if (-not (Set-McpServer $p 'servers' ([pscustomobject]@{ type = 'http'; url = $MCP }))) {
    Warn "could not register; in VS Code run `"MCP: Add Server`" and point it at $MCP"
    return $false
  }
  Ok "MCP server registered in the user profile ($MCP)"
  AddStep '  VS Code:      open Copilot Chat (agent mode) and start the spawnpoint server; sign in from the browser prompt'
  return $true
}

# ---- jcode: stdio-only MCP, bridged through mcp-remote ---------------------
# As in the bash installer: sign-in happens once, ahead of jcode, and the
# entry carries timeout_secs 330 so watch_deploy's longest wait fits.
function Wire-Jcode {
  Step 'jcode'
  if (-not (Find-Program 'npx' '')) {
    Warn 'npx not found; jcode speaks stdio-only MCP, so spawnpoint needs the mcp-remote bridge. Install Node.js, then re-run.'
    return $false
  }
  $p = J $UserHome '.jcode' 'mcp.json'
  $entry = [pscustomobject]@{ command = (Bridge-Command); args = @(Bridge-Args); timeout_secs = 330 }
  if (-not (Set-McpServer $p 'mcpServers' $entry)) {
    Warn "could not update $(Tilde $p)"
    return $false
  }
  Ok "registered in $(Tilde $p) (mcp-remote bridge to $MCP)"
  AddStep "  jcode:        sign in once with: $(Typed (Find-Program 'npx' '') 'npx') -y mcp-remote $MCP (approve in the browser, then Ctrl-C)"
  return $true
}

# ---- DeepSeek Harness (dsh): MCP without OAuth, bridged through mcp-remote --
# The entry goes in the home patch layer, $DSH_HOME\cordis.patch.yml, and the
# installer owns only the block between its two marker lines (the bash
# installer has the whole story).
function Dsh-Home {
  if ($env:DSH_HOME) { return $env:DSH_HOME }
  return (J $UserHome '.dsh')
}

function Wire-Dsh {
  Step 'DeepSeek Harness'
  if (-not (Find-Program 'npx' '')) {
    Warn 'npx not found; DeepSeek Harness reaches spawnpoint through the mcp-remote bridge. Install Node.js, then re-run.'
    return $false
  }
  $p = J (Dsh-Home) 'cordis.patch.yml'
  $argList = (@(Bridge-Args) | ForEach-Object { "'$_'" }) -join ', '
  $block = "# >>> spawnpoint (written by https://getspawnpoint.com/install; re-run it to update)`n" +
    "- insert:`n" +
    "    - id: spawnpoint-mcp`n" +
    "      name: '@deepseek-ai/dsh-mcp-client'`n" +
    "      config:`n" +
    "        serverName: spawnpoint`n" +
    "        transport: stdio`n" +
    "        command: $(Bridge-Command)`n" +
    "        args: [$argList]`n" +
    "# <<< spawnpoint`n"
  $text = ''
  if (Test-Path -LiteralPath $p -PathType Leaf) { $text = [IO.File]::ReadAllText($p) -replace "`r`n", "`n" }
  $ours = New-Object System.Text.RegularExpressions.Regex '(?ms)^# >>> spawnpoint.*?^# <<< spawnpoint[^\n]*\n?'
  $content = @($text -split "`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ -and -not $_.StartsWith('#') })
  if ($ours.IsMatch($text)) {
    $text = $ours.Replace($text, $block.Replace('$', '$$'), 1)
  } elseif ($text.Contains('serverName: spawnpoint')) {
    Note "a spawnpoint entry in $(Tilde $p) was not written by the installer; leaving it"
    AddStep "  DeepSeek Harness: sign in once with: $(Typed (Find-Program 'npx' '') 'npx') -y mcp-remote $MCP (approve in the browser, then Ctrl-C)"
    return $true
  } elseif ($content.Count -eq 0) {
    if ($text.Trim()) { $head = $text.TrimEnd("`n") + "`n`n" }
    else {
      $head = "# Home patch layer for every dsh profile: a top-level YAML array of`n" +
        "# loader patches, applied after each profile's own cordis.patch.yml.`n`n"
    }
    $text = $head + $block
  } elseif ($content.Count -eq 1 -and $content[0] -eq '[]') {
    $text = ([regex]'(?m)^[ \t]*\[\][ \t]*$').Replace($text, $block.TrimEnd("`n").Replace('$', '$$'), 1)
  } elseif ($content[0].StartsWith('-')) {
    $text = $text.TrimEnd("`n") + "`n`n" + $block
  } else {
    Warn "could not update $(Tilde $p): it is not a top-level YAML list"
    return $false
  }
  try { Write-Text $p $text } catch { Warn "could not update $(Tilde $p)"; return $false }
  Ok "registered in $(Tilde $p) (mcp-remote bridge to $MCP)"
  AddStep "  DeepSeek Harness: sign in once with: $(Typed (Find-Program 'npx' '') 'npx') -y mcp-remote $MCP (approve in the browser, then Ctrl-C)"
  return $true
}

# ---- Antigravity (Google): the agy CLI and the IDE share one MCP config ----
# Both read ~\.gemini\config\mcp_config.json (key serverUrl, not url). `agy
# mcp add` writes the entry when the CLI is present; otherwise the installer
# writes the same JSON. A short rule between marker lines in ~\.gemini\GEMINI.md
# points the model at the tools (the bash installer says why).
function Find-Agy {
  $p = Find-Program 'agy' ''
  if ($p) { return $p }
  foreach ($c in @((J $UserHome '.local' 'bin' 'agy.exe'), (J $UserHome '.local' 'bin' 'agy'))) {
    if (Test-Path -LiteralPath $c -PathType Leaf) { return $c }
  }
  return $null
}

function Wire-Antigravity {
  Step 'Antigravity'
  $cfg = J $UserHome '.gemini' 'config' 'mcp_config.json'
  $agy = Find-Agy
  if ($agy -and (Run $agy @('mcp', 'add', 'spawnpoint', $MCP))) {
    Ok "registered in $(Tilde $cfg) ($MCP)"
  } elseif (Set-McpServer $cfg 'mcpServers' ([pscustomobject]@{ disabled = $false; serverUrl = $MCP })) {
    Ok "registered in $(Tilde $cfg) ($MCP)"
  } else {
    Warn "could not update $(Tilde $cfg)"
    return $false
  }
  $rules = J $UserHome '.gemini' 'GEMINI.md'
  $block = "<!-- >>> spawnpoint (written by https://getspawnpoint.com/install; re-run it to update) -->`n" +
    "## spawnpoint`n" +
    "To put an app online, or to get a public link for one, call the spawnpoint MCP tools:`n" +
    "deploy_project, then watch_deploy, and give the user the url it returns. There is no`n" +
    "spawnpoint command line, package, or API key to install, so do not look for one, and do`n" +
    "not deploy to another host instead.`n" +
    "<!-- <<< spawnpoint -->`n"
  try {
    $text = ''
    if (Test-Path -LiteralPath $rules -PathType Leaf) { $text = [IO.File]::ReadAllText($rules) }
    $ours = New-Object System.Text.RegularExpressions.Regex '(?s)<!-- >>> spawnpoint.*?<!-- <<< spawnpoint -->\r?\n?'
    if ($ours.IsMatch($text)) { $text = $ours.Replace($text, $block.Replace('$', '$$'), 1) }
    elseif ($text.Trim()) { $text = $text.TrimEnd("`r", "`n") + "`n`n" + $block }
    else { $text = $block }
    Write-Text $rules $text
    Ok "deploy rule added to $(Tilde $rules)"
  } catch {
    Note "could not update $(Tilde $rules); the tools still work without the rule"
  }
  AddStep '  Antigravity:  CLI: run agy, type /mcp, choose spawnpoint, Authenticate.'
  AddStep '                IDE: quit and reopen it if it was open, then Customizations > Installed > MCP Servers > Authenticate.'
  return $true
}

# ---- the team: MCP servers and skills (SPAWNPOINT_TEAM) --------------------
# The same rules as the bash installer: the code is traded before any agent
# is touched; Claude Code and Codex get the servers and the skills, the other
# agents get each server's address to add by hand; a server is named after
# its app, or <team>-<app> when the agent already has another server by that
# name; every skill folder the installer writes carries a .spawnpoint-team
# file, and a re-run replaces only those.
function Fetch-Team {
  $u = "$URL/api/install/team?code=" + [uri]::EscapeDataString($TeamCode)
  try {
    $r = Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 60 -ErrorAction Stop
    # The raw bytes, read as UTF-8: Windows PowerShell decodes a body with no
    # charset as Latin-1, which would garble a skill's text.
    $body = $Utf8.GetString($r.RawContentStream.ToArray())
  } catch {
    $resp = $_.Exception.Response
    if (-not $resp) { Die "could not reach $URL for the team setup" }
    $msg = ''
    try { $msg = (ConvertFrom-Json -InputObject $_.ErrorDetails.Message).error } catch { }
    if (-not $msg) { $msg = "the team setup failed (HTTP $([int]$resp.StatusCode))" }
    Die $msg
  }
  try { $SP.Team = ConvertFrom-Json -InputObject $body -ErrorAction Stop } catch { Die 'the team setup sent something this installer cannot read' }
}

function Team-Servers {  # each checked: @{Name; Fallback; Url}
  $out = @()
  foreach ($s in @($SP.Team.servers)) {
    if ($null -eq $s) { continue }
    $n = [string]$s.name; $f = [string]$s.fallback_name; $u = [string]$s.url
    if ($n -cmatch '^[a-z0-9][a-z0-9_-]{0,99}$' -and $f -cmatch '^[a-z0-9][a-z0-9_-]{0,99}$' -and $u -cmatch '^https?://[A-Za-z0-9.:-]+/mcp$') {
      $out += @{ Name = $n; Fallback = $f; Url = $u }
    }
  }
  return $out
}

# 0 when the agent has NAME at URL, 1 when NAME is free, 2 when NAME is another server.
function Server-State([string]$exe, [string]$name, [string]$url) {
  $global:LASTEXITCODE = 0
  try { $out = [string](& $exe mcp get $name 2>$null | Out-String) } catch { return 1 }
  if ($LASTEXITCODE -ne 0) { return 1 }
  if ($out.Contains($url)) { return 0 }
  return 2
}

function Team-ServersInto([string]$agent, [string]$exe) {
  $SP.TeamAdded.Clear()
  foreach ($s in @(Team-Servers)) {
    $pick = ''
    foreach ($cand in @($s.Name, $s.Fallback)) {
      $rc = Server-State $exe $cand $s.Url
      if ($rc -eq 0) { Ok "MCP server $cand already added"; $pick = '-'; break }
      if ($rc -eq 1) { $pick = $cand; break }
    }
    if ($pick -eq '-') { continue }
    if (-not $pick) { Warn "$($s.Name) and $($s.Fallback) are both other servers here; add $($s.Url) by hand"; continue }
    if ($agent -eq 'claude') { $added = Run $exe @('mcp', 'add', '--transport', 'http', '--scope', 'user', $pick, $s.Url) }
    else { $added = Run $exe @('mcp', 'add', $pick, '--url', $s.Url) }
    if ($added) {
      if ($pick -eq $s.Name) { Ok "MCP server $pick ($($s.Url))" }
      else { Ok "MCP server $pick ($($s.Url)): $($s.Name) is another server here" }
      [void]$SP.TeamAdded.Add($pick)
    } else {
      Warn "could not add MCP server $pick ($($s.Url))"
    }
  }
}

function Team-SkillsInto([string]$root) {  # writes every team skill under ROOT and reports it
  foreach ($k in @($SP.Team.skills)) {
    if ($null -eq $k) { continue }
    $name = [string]$k.name
    if ($name.Length -gt 64 -or $name -cnotmatch '^[a-z0-9]+(-[a-z0-9]+)*$') { continue }
    $files = @()
    $bad = $false
    $tmp = J $root ".$name.spawnpoint-tmp"
    $base = [IO.Path]::GetFullPath($tmp).TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
    foreach ($f in @($k.files)) {
      if ($null -eq $f) { continue }
      $rel = [string]$f.path
      $parts = @($rel -split '/' | Where-Object { $_ -ne '' -and $_ -ne '.' })
      # Windows drops a trailing dot or space from a path part, so `.. ` is
      # `..` there; a part like that, or one Windows cannot name, is refused,
      # and the full path must still land inside the skill's folder.
      $odd = @($parts | Where-Object { $_ -match '[\s.]$' -or $_ -match '[<>:"|?*\x00-\x1f]' })
      if (-not $rel -or $rel.StartsWith('/') -or $rel.Contains('\') -or
          $parts.Count -eq 0 -or $odd.Count -or $parts[0] -eq '.spawnpoint-team') { $bad = $true; break }
      $full = [IO.Path]::GetFullPath((J $tmp @($parts)))
      if (-not $full.StartsWith($base, [StringComparison]::OrdinalIgnoreCase)) { $bad = $true; break }
      $files += @{ Parts = $parts; Content = [string]$f.content }
    }
    if ($bad -or $files.Count -eq 0) { Warn "skill $name has a file path outside its folder; skipped"; continue }
    $dest = J $root $name
    if ((Test-Path -LiteralPath $dest) -and -not (Test-Path -LiteralPath (J $dest '.spawnpoint-team'))) {
      Note "skill ${name}: $(Tilde $dest) is a skill of yours, so it was left as it is"
      continue
    }
    try {
      if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Recurse -Force }
      foreach ($f in $files) {
        $out = J $tmp @($f.Parts)
        $dir = Split-Path -Parent $out
        if (-not (Test-Path -LiteralPath $dir)) { [void](New-Item -ItemType Directory -Force -Path $dir) }
        [IO.File]::WriteAllText($out, $f.Content, $Utf8)
        if (-not $OnWindows -and $f.Content.StartsWith('#!')) { & chmod 755 $out }
      }
      [IO.File]::WriteAllText((J $tmp '.spawnpoint-team'), "$($SP.Team.team)`nversion $($k.version)`n", $Utf8)
      if (Test-Path -LiteralPath $dest) { Remove-Item -LiteralPath $dest -Recurse -Force }
      Move-Item -LiteralPath $tmp -Destination $dest
      Ok "skill $name (version $($k.version))"
    } catch {
      Warn "could not write skill $name into $(Tilde $root)"
    }
  }
}

function Wire-Team {
  $servers = @(Team-Servers)
  Step "Team: $($SP.Team.team)"
  $c = $null; $x = $null
  if ($SP.Wired -contains 'claude') { $c = Find-Claude }
  if ($c) {
    Note 'Claude Code'
    Team-ServersInto 'claude' $c.Path
    if ($SP.TeamAdded.Count) { AddStep "  Claude Code:  the team's servers sign in the same way, in /mcp: $($SP.TeamAdded -join ', ')." }
    $dir = if ($env:CLAUDE_CONFIG_DIR) { $env:CLAUDE_CONFIG_DIR } else { J $UserHome '.claude' }
    Team-SkillsInto (J $dir 'skills')
  }
  if ($SP.Wired -contains 'codex') { $x = Find-Codex }
  if ($x) {
    Note 'Codex'
    Team-ServersInto 'codex' $x.Path
    $login = if ($x.Kind -eq 'path') { Typed $x.Path 'codex' } else { "& `"$($x.Path)`"" }
    foreach ($n in $SP.TeamAdded) { AddStep "  Codex:        run: $login mcp login $n" }
    $dir = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { J $UserHome '.codex' }
    Team-SkillsInto (J $dir 'skills')
  }
  $others = @($SP.Wired | Where-Object { $_ -ne 'claude' -and $_ -ne 'codex' })
  if ($others.Count -and $servers.Count) {
    Note "Add the team's MCP servers to $($others -join ' ') by hand for now:"
    foreach ($s in $servers) { Note "  $($s.Name)  $($s.Url)" }
  }
  if (-not $c -and -not $x) {
    Note "the team's skills go into Claude Code and Codex, and neither is set up here"
  }
}

# ---- detect + wire ---------------------------------------------------------
function Exists([string]$p) { return ($p -and (Test-Path -LiteralPath $p)) }
function LocalApp([string[]]$parts) {
  if (-not $env:LOCALAPPDATA) { return $null }
  return (J $env:LOCALAPPDATA @($parts))
}

function Main {
  Put "`n  "
  Put ' sp ' 'White' 'DarkRed'
  Put ' '
  Put "spawnpoint`n" 'White'
  Put "       the launchpad for your AI-enabled business`n`n" 'DarkGray'

  $found = New-Object System.Collections.ArrayList
  if (Find-Claude) { [void]$found.Add('claude') }
  if (Find-Codex) { [void]$found.Add('codex') }
  if ((Find-Program 'cursor-agent' '') -or (Find-Program 'cursor' '') -or (Exists (J $UserHome '.cursor')) -or
      (Exists (LocalApp 'Programs', 'cursor', 'Cursor.exe'))) { [void]$found.Add('cursor') }
  if (Find-Program 'opencode' '') { [void]$found.Add('opencode') }
  if (Find-Program 'copilot' '') { [void]$found.Add('copilot') }
  if ((Find-Program 'code' '') -or (Exists (VSCode-Profile)) -or
      (Exists (LocalApp 'Programs', 'Microsoft VS Code', 'Code.exe'))) { [void]$found.Add('vscode') }
  if ((Find-Program 'jcode' '') -or (Exists (J $UserHome '.jcode'))) { [void]$found.Add('jcode') }
  if ((Find-Program 'dsh' '') -or (Exists (Dsh-Home))) { [void]$found.Add('dsh') }
  if ((Find-Agy) -or (Exists (J $UserHome '.gemini' 'config')) -or (Find-Program 'antigravity' '') -or
      (Exists (LocalApp 'Programs', 'Antigravity', 'Antigravity.exe'))) { [void]$found.Add('antigravity') }

  if ($found.Count -eq 0) {
    Die 'no supported agent found. Install Claude Code, Codex CLI, Cursor, opencode, GitHub Copilot, jcode, DeepSeek Harness, or Antigravity first.'
  }

  if ($TeamCode) { Fetch-Team }

  $wire = @{
    claude = { Wire-Claude }; codex = { Wire-Codex }; cursor = { Wire-Cursor }; opencode = { Wire-Opencode }
    copilot = { Wire-Copilot }; vscode = { Wire-Vscode }; jcode = { Wire-Jcode }; dsh = { Wire-Dsh }
    antigravity = { Wire-Antigravity }
  }
  foreach ($a in $found) {
    if (-not (Wants $a)) { continue }
    $ok = $false
    try { $ok = [bool](@(& $wire[$a])[-1]) } catch { Warn "stopped: $($_.Exception.Message)" }
    if ($ok) { [void]$SP.Wired.Add($a) }
  }
  if ($SP.Wired.Count -eq 0) {
    $req = if ($Agents) { $Agents } else { 'all' }
    Die "nothing was wired. Requested: $req; found: $($found -join ' ')."
  }
  if ($SP.Team) { Wire-Team }

  # ---- health --------------------------------------------------------------
  try {
    [void](Invoke-WebRequest -Uri "$URL/healthz" -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop)
    Ok "spawnpoint is up at $URL"
  } catch {
    Note "spawnpoint is not answering at $URL yet; start it before you authenticate"
  }

  # ---- done ----------------------------------------------------------------
  Put "`n  "
  Put 'All set' 'Green'
  Write-Host " (wired: $($SP.Wired -join ' ')). One sign-in step per agent, in the browser:"
  Write-Host ''
  foreach ($line in $SP.Steps) { Write-Host $line }
  Write-Host ''
  Put "  Then: `"deploy`" gets you a link. Docs: https://getspawnpoint.com`n`n" 'DarkGray'
}

# Windows PowerShell talks to the console in its OEM code page, which has no
# check mark and garbles the agents' UTF-8 output; UTF-8 for this run only.
$oldEncoding = $null
if ($OnWindows) {
  try { $oldEncoding = [Console]::OutputEncoding; [Console]::OutputEncoding = $Utf8 } catch { }
  # Windows PowerShell 5.1 can still default to TLS 1.0, which the server refuses.
  try { [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12 } catch { }
}
try {
  Main
  $global:LASTEXITCODE = 0
} catch {
  if ([string]$_.Exception.Message -ne 'spawnpoint-stop') {
    Put "  x the installer stopped: $($_.Exception.Message)`n" 'Red'
  }
  $global:LASTEXITCODE = 1
} finally {
  if ($null -ne $oldEncoding) { try { [Console]::OutputEncoding = $oldEncoding } catch { } }
}
}
