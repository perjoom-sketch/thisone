param(
  [string]$msg = "update: auto sync"
)

Set-Location $PSScriptRoot

git add -A
git commit -m $msg
git push origin main
