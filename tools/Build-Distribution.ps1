[CmdletBinding()]
param(
    [string]$Version = '1.0.0',
    [string]$ServerAddress = '116.126.112.66:25565',
    [string]$FilesBaseUrl = 'https://raw.githubusercontent.com/GTYoon/modakbul-client/main',
    [string]$ServerIconUrl = 'https://raw.githubusercontent.com/GTYoon/modakbul-client/main/server-icon.png',
    [string]$NewsRssUrl = 'https://github.com/GTYoon/modakbul-launcher/releases.atom',
    [string]$ReferenceClientRoot = 'D:\___ ___',
    [string]$UpdateRepositoryRoot,
    [string]$FabricProfilePath,
    [string]$OutputPath
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$clientLauncherRoot = Split-Path -Parent $projectRoot
$workspaceRoot = Split-Path -Parent $clientLauncherRoot

if ([string]::IsNullOrWhiteSpace($UpdateRepositoryRoot)) {
    $UpdateRepositoryRoot = Join-Path $workspaceRoot 'client-build\release\update-repository'
}
if ([string]::IsNullOrWhiteSpace($FabricProfilePath)) {
    $FabricProfilePath = Join-Path $clientLauncherRoot 'distribution-repository\reference\fabric-profile-1.21.1-0.19.3.json'
}
if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $OutputPath = Join-Path $UpdateRepositoryRoot 'distribution.template.json'
}

$UpdateRepositoryRoot = [IO.Path]::GetFullPath($UpdateRepositoryRoot)
$ReferenceClientRoot = [IO.Path]::GetFullPath($ReferenceClientRoot)
$FabricProfilePath = [IO.Path]::GetFullPath($FabricProfilePath)
$OutputPath = [IO.Path]::GetFullPath($OutputPath)

$updateManifestPath = Join-Path $UpdateRepositoryRoot 'manifest.json'
$repositoryFilesRoot = Join-Path $UpdateRepositoryRoot 'files'

function Read-Utf8Json {
    param([Parameter(Mandatory)][string]$Path)
    [IO.File]::ReadAllText($Path, [Text.Encoding]::UTF8) | ConvertFrom-Json
}

function Write-Utf8NoBom {
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][string]$Content
    )
    $parent = Split-Path -Parent $Path
    if (-not [string]::IsNullOrWhiteSpace($parent)) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }
    [IO.File]::WriteAllText($Path, $Content, [Text.UTF8Encoding]::new($false))
}

function Get-LowerHash {
    param(
        [Parameter(Mandatory)][string]$Path,
        [Parameter(Mandatory)][ValidateSet('MD5', 'SHA256')][string]$Algorithm
    )
    (Get-FileHash -LiteralPath $Path -Algorithm $Algorithm).Hash.ToLowerInvariant()
}

function Get-PathToken {
    param([Parameter(Mandatory)][string]$Value)
    $sha1 = [Security.Cryptography.SHA1]::Create()
    try {
        $bytes = [Text.Encoding]::UTF8.GetBytes($Value)
        $hash = ([BitConverter]::ToString($sha1.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant()
        $hash.Substring(0, 16)
    }
    finally {
        $sha1.Dispose()
    }
}

function ConvertTo-UrlPath {
    param([Parameter(Mandatory)][string]$RelativePath)
    (($RelativePath -replace '\\', '/') -split '/' |
        ForEach-Object { [Uri]::EscapeDataString($_) }) -join '/'
}

function Join-Url {
    param(
        [Parameter(Mandatory)][string]$BaseUrl,
        [Parameter(Mandatory)][string]$RelativePath
    )
    $BaseUrl.TrimEnd('/') + '/' + (ConvertTo-UrlPath $RelativePath)
}

function Resolve-ManagedSource {
    param([Parameter(Mandatory)]$Entry)

    $relative = [string]$Entry.path
    if (
        [IO.Path]::IsPathRooted($relative) -or
        $relative -match '(^|[\\/])\.\.([\\/]|$)'
    ) {
        throw "허용되지 않은 관리 경로: $relative"
    }

    $localPath = Join-Path $repositoryFilesRoot ($relative -replace '/', '\')
    if (Test-Path -LiteralPath $localPath -PathType Leaf) {
        return $localPath
    }

    $referencePath = Join-Path $ReferenceClientRoot ($relative -replace '/', '\')
    if (Test-Path -LiteralPath $referencePath -PathType Leaf) {
        return $referencePath
    }

    throw "관리 파일 원본을 찾을 수 없습니다: $relative"
}

function Convert-MavenCoordinateToPath {
    param([Parameter(Mandatory)][string]$Coordinate)
    $parts = $Coordinate.Split(':')
    if ($parts.Count -ne 3) {
        throw "지원하지 않는 Maven 좌표: $Coordinate"
    }
    $groupPath = $parts[0].Replace('.', '/')
    "$groupPath/$($parts[1])/$($parts[2])/$($parts[1])-$($parts[2]).jar"
}

foreach ($requiredPath in @(
    $updateManifestPath,
    $repositoryFilesRoot,
    $FabricProfilePath,
    $ReferenceClientRoot
)) {
    if (-not (Test-Path -LiteralPath $requiredPath)) {
        throw "필수 입력이 없습니다: $requiredPath"
    }
}

$updateManifest = Read-Utf8Json -Path $updateManifestPath
$fabricProfile = Read-Utf8Json -Path $FabricProfilePath

if ($updateManifest.minecraft -ne '1.21.1') {
    throw "예상하지 못한 Minecraft 버전: $($updateManifest.minecraft)"
}
if ($updateManifest.fabricLoader -ne '0.19.3') {
    throw "예상하지 못한 Fabric Loader 버전: $($updateManifest.fabricLoader)"
}
if ($fabricProfile.inheritsFrom -ne '1.21.1') {
    throw "Fabric 프로필의 Minecraft 버전이 다릅니다: $($fabricProfile.inheritsFrom)"
}

$fabricProfileRelativePath = 'fabric/fabric-profile-1.21.1-0.19.3.json'
$fabricProfileDestination = Join-Path $UpdateRepositoryRoot ($fabricProfileRelativePath -replace '/', '\')
Write-Utf8NoBom -Path $fabricProfileDestination -Content (
    $fabricProfile | ConvertTo-Json -Depth 30
)

$loaderReference = Join-Path $clientLauncherRoot 'distribution-repository\reference\fabric-loader-0.19.3.jar'
$intermediaryReference = Join-Path $clientLauncherRoot 'distribution-repository\reference\intermediary-1.21.1.jar'
foreach ($requiredReference in @($loaderReference, $intermediaryReference)) {
    if (-not (Test-Path -LiteralPath $requiredReference -PathType Leaf)) {
        throw "Fabric 기준 파일이 없습니다: $requiredReference"
    }
}

$fabricSubModules = [System.Collections.ArrayList]::new()
$null = $fabricSubModules.Add([ordered]@{
    id = [string]$fabricProfile.id
    name = 'Fabric 1.21.1 (version.json)'
    type = 'VersionManifest'
    artifact = [ordered]@{
        size = (Get-Item -LiteralPath $fabricProfileDestination).Length
        MD5 = Get-LowerHash -Path $fabricProfileDestination -Algorithm MD5
        url = Join-Url -BaseUrl $FilesBaseUrl -RelativePath $fabricProfileRelativePath
    }
})

foreach ($library in $fabricProfile.libraries) {
    $coordinate = [string]$library.name
    if ($coordinate -eq 'net.fabricmc:fabric-loader:0.19.3') {
        continue
    }

    $mavenPath = Convert-MavenCoordinateToPath -Coordinate $coordinate
    $artifactSize = $library.size
    $artifactMd5 = $library.md5

    if ($coordinate -eq 'net.fabricmc:intermediary:1.21.1') {
        $artifactSize = (Get-Item -LiteralPath $intermediaryReference).Length
        $artifactMd5 = Get-LowerHash -Path $intermediaryReference -Algorithm MD5
    }

    if ($null -eq $artifactSize -or [string]::IsNullOrWhiteSpace([string]$artifactMd5)) {
        throw "Fabric 라이브러리 무결성 정보가 없습니다: $coordinate"
    }

    $null = $fabricSubModules.Add([ordered]@{
        id = $coordinate
        name = $coordinate
        type = 'Library'
        artifact = [ordered]@{
            size = [long]$artifactSize
            MD5 = ([string]$artifactMd5).ToLowerInvariant()
            url = ([string]$library.url).TrimEnd('/') + '/' + $mavenPath
        }
    })
}

$modules = [System.Collections.ArrayList]::new()
$null = $modules.Add([ordered]@{
    id = 'net.fabricmc:fabric-loader:0.19.3'
    name = 'Fabric Loader 0.19.3'
    type = 'Fabric'
    artifact = [ordered]@{
        size = (Get-Item -LiteralPath $loaderReference).Length
        MD5 = Get-LowerHash -Path $loaderReference -Algorithm MD5
        url = 'https://maven.fabricmc.net/net/fabricmc/fabric-loader/0.19.3/fabric-loader-0.19.3.jar'
    }
    subModules = @($fabricSubModules)
})

$seenPaths = [Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
$processed = 0

foreach ($entry in @($updateManifest.files | Sort-Object path)) {
    $relativePath = ([string]$entry.path).Replace('\', '/')
    if (-not $seenPaths.Add($relativePath)) {
        throw "중복 관리 경로: $relativePath"
    }

    $sourcePath = Resolve-ManagedSource -Entry $entry
    $actualSize = (Get-Item -LiteralPath $sourcePath).Length
    $actualSha256 = Get-LowerHash -Path $sourcePath -Algorithm SHA256

    if ($actualSize -ne [long]$entry.size) {
        throw "크기 불일치: $relativePath"
    }
    if ($actualSha256 -ne ([string]$entry.sha256).ToLowerInvariant()) {
        throw "SHA-256 불일치: $relativePath"
    }

    $url = if (-not [string]::IsNullOrWhiteSpace([string]$entry.url)) {
        [string]$entry.url
    }
    else {
        Join-Url -BaseUrl $FilesBaseUrl -RelativePath "files/$relativePath"
    }

    $isFabricMod = $relativePath.StartsWith('mods/', [StringComparison]::OrdinalIgnoreCase)
    $token = Get-PathToken -Value $relativePath
    $module = [ordered]@{
        id = if ($isFabricMod) {
            "generated.fabricmod:mod-$token`:$Version@jar"
        }
        else {
            "generated.file:file-$token`:$Version"
        }
        name = [IO.Path]::GetFileName($relativePath)
        type = if ($isFabricMod) { 'FabricMod' } else { 'File' }
        artifact = [ordered]@{
            size = [long]$actualSize
            MD5 = Get-LowerHash -Path $sourcePath -Algorithm MD5
            url = $url
            path = if ($isFabricMod) {
                [IO.Path]::GetFileName($relativePath)
            }
            else {
                $relativePath
            }
        }
    }
    $null = $modules.Add($module)

    $processed++
    if (($processed % 250) -eq 0) {
        Write-Host "관리 파일 검증 중: $processed / $($updateManifest.files.Count)"
    }
}

$distribution = [ordered]@{
    version = $Version
    rss = $NewsRssUrl
    servers = @(
        [ordered]@{
            id = 'modakbul-season1-1.21.1'
            name = '모닥불 Season 1'
            description = 'Cobblemon 모닥불 Season 1 · Minecraft 1.21.1 · Fabric 0.19.3'
            icon = $ServerIconUrl
            version = $Version
            address = $ServerAddress
            minecraftVersion = '1.21.1'
            javaOptions = [ordered]@{
                supported = '>=21 <22'
                suggestedMajor = 21
                distribution = 'TEMURIN'
            }
            mainServer = $true
            autoconnect = $true
            modules = @($modules)
        }
    )
}

Write-Utf8NoBom -Path $OutputPath -Content (
    $distribution | ConvertTo-Json -Depth 30
)

[pscustomobject]@{
    output = $OutputPath
    version = $Version
    serverAddress = $ServerAddress
    modules = $modules.Count
    fabricMods = @($modules | Where-Object type -eq 'FabricMod').Count
    files = @($modules | Where-Object type -eq 'File').Count
    fabricSubModules = $fabricSubModules.Count
    sourceFilesValidated = $processed
}
