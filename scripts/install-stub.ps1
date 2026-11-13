# A fake agent CLI for the installer tests (scripts/test-install-ps1.ps1 and
# scripts/test-install.sh). Called as: install-stub.ps1 AGENT ARGS...
# It speaks just enough of each CLI's mcp and plugin subcommands for the
# installers, keeps its servers in $env:STUB_STATE\AGENT.json, and logs every
# call (with $env:STUB_ID, which says which copy of the agent ran) to
# $env:STUB_STATE\calls.log.
$agent = $args[0]
$rest = @()
if ($args.Count -gt 1) { $rest = @($args[1..($args.Count - 1)]) }
$dir = $env:STUB_STATE
$id = if ($env:STUB_ID) { $env:STUB_ID } else { $agent }
Add-Content -LiteralPath (Join-Path $dir 'calls.log') -Value "$id $($rest -join ' ')"
if ($env:STUB_FAIL -and (",$($env:STUB_FAIL)," -like "*,$agent,*")) { exit 3 }

$file = Join-Path $dir "$agent.json"
$st = @{ servers = @{}; plugins = @() }
if (Test-Path -LiteralPath $file) {
  $j = Get-Content -Raw -LiteralPath $file | ConvertFrom-Json
  foreach ($p in $j.servers.PSObject.Properties) { $st.servers[$p.Name] = [string]$p.Value }
  $st.plugins = @($j.plugins | Where-Object { $_ })
}
function Save { [IO.File]::WriteAllText($file, (ConvertTo-Json -InputObject $st -Depth 5)) }

$cmd = ($rest | Select-Object -First 2) -join ' '
switch ($cmd) {
  'plugin marketplace' { exit 0 }
  'plugin list' { $st.plugins | ForEach-Object { Write-Output "  $_" }; exit 0 }
  'plugin install' { $st.plugins = @($st.plugins) + $rest[2]; Save; exit 0 }
  'plugin update' { exit 0 }
  'mcp get' {
    $n = $rest[2]
    if ($st.servers.ContainsKey($n)) { Write-Output "${n}:"; Write-Output "  Type: http"; Write-Output "  URL: $($st.servers[$n])"; exit 0 }
    [Console]::Error.WriteLine("No MCP server named $n"); exit 1
  }
  'mcp list' { foreach ($k in $st.servers.Keys) { Write-Output "${k}: $($st.servers[$k]) (HTTP)" }; exit 0 }
  'mcp remove' { $st.servers.Remove($rest[2]); Save; exit 0 }
  'mcp add' {
    # Positional NAME and URL, or NAME and --url URL, flags with values skipped.
    $pos = @(); $url = $null
    for ($i = 2; $i -lt $rest.Count; $i++) {
      switch ($rest[$i]) {
        '--url' { $i++; $url = $rest[$i] }
        { $_ -in '--transport', '--scope', '-s', '-t' } { $i++ }
        default { $pos += $rest[$i] }
      }
    }
    if (-not $url) { $url = $pos[1] }
    $st.servers[$pos[0]] = $url; Save; exit 0
  }
  default { exit 0 }
}
