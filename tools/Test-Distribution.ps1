[CmdletBinding()]
param(
    [string]$DistributionPath
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$clientLauncherRoot = Split-Path -Parent $projectRoot
$workspaceRoot = Split-Path -Parent $clientLauncherRoot

if ([string]::IsNullOrWhiteSpace($DistributionPath)) {
    $DistributionPath = Join-Path $workspaceRoot 'client-build\release\update-repository\distribution.template.json'
}

$DistributionPath = [IO.Path]::GetFullPath($DistributionPath)
if (-not (Test-Path -LiteralPath $DistributionPath -PathType Leaf)) {
    throw "배포 매니페스트가 없습니다: $DistributionPath"
}

$distribution = [IO.File]::ReadAllText($DistributionPath, [Text.Encoding]::UTF8) |
    ConvertFrom-Json
$failures = [Collections.Generic.List[string]]::new()

if ($distribution.servers.Count -ne 1) {
    $failures.Add("서버 항목 수가 1이 아닙니다: $($distribution.servers.Count)")
}

$server = $distribution.servers[0]
if ($server.address -ne '116.126.112.66:25565') {
    $failures.Add("공인 서버 주소가 다릅니다: $($server.address)")
}
if ($server.minecraftVersion -ne '1.21.1') {
    $failures.Add("Minecraft 버전이 다릅니다: $($server.minecraftVersion)")
}
if ($server.javaOptions.supported -ne '>=21 <22') {
    $failures.Add("Java 지원 범위가 21 전용이 아닙니다: $($server.javaOptions.supported)")
}
if ([int]$server.javaOptions.suggestedMajor -ne 21) {
    $failures.Add("권장 Java 주 버전이 21이 아닙니다: $($server.javaOptions.suggestedMajor)")
}
if ($server.javaOptions.distribution -ne 'TEMURIN') {
    $failures.Add("Java 배포판이 TEMURIN이 아닙니다: $($server.javaOptions.distribution)")
}

$modules = @($server.modules)
$fabricModules = @($modules | Where-Object type -eq 'Fabric')
$fabricMods = @($modules | Where-Object type -eq 'FabricMod')
$files = @($modules | Where-Object type -eq 'File')

if ($fabricModules.Count -ne 1) {
    $failures.Add("Fabric 로더 모듈 수가 1이 아닙니다: $($fabricModules.Count)")
}
if ($fabricMods.Count -lt 146) {
    $failures.Add("클라이언트 모드 수가 기준보다 적습니다: $($fabricMods.Count)")
}
if ($files.Count -lt 1829) {
    $failures.Add("일반 관리 파일 수가 기준보다 적습니다: $($files.Count)")
}

$ids = @($modules | ForEach-Object { [string]$_.id })
$duplicateIds = @($ids | Group-Object | Where-Object Count -gt 1)
if ($duplicateIds.Count -gt 0) {
    $failures.Add("중복 모듈 ID가 있습니다: $($duplicateIds.Count)")
}

$limitedLegends = @(
    $fabricMods |
        Where-Object {
            $_.name -match 'LimitedLegends' -or
            $_.artifact.path -match 'LimitedLegends' -or
            $_.artifact.url -match 'LimitedLegends'
        }
)
if ($limitedLegends.Count -ne 1) {
    $failures.Add("LimitedLegends 모드 수가 1이 아닙니다: $($limitedLegends.Count)")
}

$clientLocalization = @(
    $fabricMods |
        Where-Object {
            $_.name -match 'gcm-client-localization' -or
            $_.artifact.path -match 'gcm-client-localization' -or
            $_.artifact.url -match 'gcm-client-localization'
        }
)
if ($clientLocalization.Count -ne 1) {
    $failures.Add("클라이언트 전용 한글화 패치 수가 1이 아닙니다: $($clientLocalization.Count)")
}

$pastureLoot = @(
    $modules |
        Where-Object {
            $_.name -match 'PastureLoot' -or
            $_.artifact.path -match 'pastureLoot|pasture-loot' -or
            $_.artifact.url -match 'pastureLoot|pasture-loot'
        }
)
if ($pastureLoot.Count -gt 0) {
    $failures.Add("제거 대상 PastureLoot가 포함되었습니다: $($pastureLoot.Count)")
}

$noHunger = @(
    $modules |
        Where-Object {
            $_.name -match 'No Hunger' -or
            $_.artifact.path -match 'No.?Hunger' -or
            $_.artifact.url -match 'No.?Hunger'
        }
)
if ($noHunger.Count -gt 0) {
    $failures.Add("제거 대상 No Hunger 데이터팩이 포함되었습니다: $($noHunger.Count)")
}

foreach ($module in $modules) {
    if ([long]$module.artifact.size -le 0) {
        $failures.Add("크기가 잘못된 모듈: $($module.id)")
    }
    if ([string]$module.artifact.MD5 -notmatch '^[0-9a-f]{32}$') {
        $failures.Add("MD5가 잘못된 모듈: $($module.id)")
    }
    if (
        [string]$module.artifact.url -notmatch '^https://' -and
        [string]$module.artifact.url -notmatch '^__CLIENT_FILES_BASE_URL__/'
    ) {
        $failures.Add("HTTPS가 아닌 모듈 URL: $($module.id)")
    }
}

if ($failures.Count -gt 0) {
    Write-Host '배포 매니페스트 검증 실패:' -ForegroundColor Red
    $failures | Select-Object -First 50 | ForEach-Object {
        Write-Host " - $_" -ForegroundColor Red
    }
    if ($failures.Count -gt 50) {
        Write-Host " - 나머지 오류: $($failures.Count - 50)개" -ForegroundColor Red
    }
    exit 1
}

[pscustomobject]@{
    distribution = $DistributionPath
    serverAddress = $server.address
    minecraft = $server.minecraftVersion
    javaSupported = $server.javaOptions.supported
    javaSuggestedMajor = $server.javaOptions.suggestedMajor
    javaDistribution = $server.javaOptions.distribution
    totalModules = $modules.Count
    fabricMods = $fabricMods.Count
    files = $files.Count
    limitedLegends = $limitedLegends.Count
    clientLocalization = $clientLocalization.Count
    pastureLoot = $pastureLoot.Count
    noHunger = $noHunger.Count
    duplicateIds = $duplicateIds.Count
}
