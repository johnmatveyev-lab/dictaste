# Dictaste Windows — clone monorepo and run
$repo = if ($env:DICTASTE_REPO) { $env:DICTASTE_REPO } else { "https://github.com/johnmatveyev-lab/dictaste.git" }
$dir = if ($args[0]) { $args[0] } else { "dictaste" }
git clone $repo $dir
Set-Location "$dir/windows"
npm install
npm start
