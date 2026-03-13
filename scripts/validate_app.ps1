param(
    [switch]$NoBuild
)

$ErrorActionPreference = "Stop"

$composeArgs = @("compose", "run", "--rm")
if ($NoBuild) {
    $composeArgs += "--no-build"
}
$composeArgs += "validator"

Write-Host "Ejecutando validacion completa con Docker Compose..."
docker @composeArgs
