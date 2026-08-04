Set-Location 'c:\vscode\New folder (11)'
$logPath = Join-Path $PWD 'build.log'
& npm run build *> $logPath
$exitCode = $LASTEXITCODE
Write-Output "EXIT:$exitCode"
Get-Content $logPath
exit $exitCode
