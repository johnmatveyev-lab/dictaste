# Clone Windows source and start Dictaste (developers)
$ErrorActionPreference = "Stop"
$Dir = if ($args[0]) { $args[0] } else { "$HOME\src\dictaste-windows" }
Write-Host "→ Cloning into $Dir"
if (-not (Test-Path "$Dir\.git")) {
  git clone https://github.com/johnmatveyev-lab/dictaste-windows.git $Dir
}
Set-Location $Dir
npm install
Write-Host "→ Starting Dictaste… Get license: https://dictaste.vercel.app/developers/setup"
npm start
