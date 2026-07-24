[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$failures = [System.Collections.Generic.List[string]]::new()

$requiredFiles = @(
    'package.json'
    'electron-builder.yml'
    'app\assets\js\distromanager.js'
    'app\assets\js\ipcconstants.js'
    'app\assets\lang\ko_KR.toml'
    'app\assets\images\SealCircle.png'
    'app\assets\images\LoadingSeal.png'
    'app\assets\images\backgrounds\modakbul.png'
    'build\icon.png'
)

foreach ($relativePath in $requiredFiles) {
    $path = Join-Path $projectRoot $relativePath
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        $failures.Add("필수 파일 없음: $relativePath")
    }
}

$scanExtensions = @('.js', '.json', '.md', '.toml', '.yml', '.yaml')
$sourceFiles = Get-ChildItem -LiteralPath $projectRoot -Recurse -File |
    Where-Object {
        $_.Extension -in $scanExtensions -and
        $_.FullName -notmatch '[\\/](node_modules|dist)[\\/]'
    }

foreach ($file in $sourceFiles) {
    $content = [System.IO.File]::ReadAllText($file.FullName)
    if ($content -match '__(GITHUB_OWNER|AZURE_CLIENT_ID|DISTRIBUTION_URL)__') {
        $relative = $file.FullName.Substring($projectRoot.Length + 1)
        $failures.Add("설정되지 않은 자리표시자: $relative")
    }
}

$packagePath = Join-Path $projectRoot 'package.json'
if (Test-Path -LiteralPath $packagePath) {
    try {
        $package = [IO.File]::ReadAllText($packagePath, [Text.Encoding]::UTF8) |
            ConvertFrom-Json
        if ($package.name -ne 'modakbul-season1-launcher') {
            $failures.Add('package.json의 name이 예상값과 다릅니다.')
        }
        if ($package.productName -ne '모닥불 Season 1') {
            $failures.Add('package.json의 productName이 예상값과 다릅니다.')
        }
    }
    catch {
        $failures.Add("package.json 파싱 실패: $($_.Exception.Message)")
    }
}

$distroPath = Join-Path $projectRoot 'app\assets\js\distromanager.js'
if (Test-Path -LiteralPath $distroPath) {
    $distroContent = [IO.File]::ReadAllText($distroPath, [Text.Encoding]::UTF8)
    if ($distroContent -notmatch "REMOTE_DISTRO_URL\s*=\s*'https://") {
        $failures.Add('distribution.json 주소는 공개 HTTPS 주소여야 합니다.')
    }
}

$languageLoaderPath = Join-Path $projectRoot 'app\assets\js\langloader.js'
if (Test-Path -LiteralPath $languageLoaderPath) {
    $languageLoaderContent = [IO.File]::ReadAllText(
        $languageLoaderPath,
        [Text.Encoding]::UTF8
    )
    if ($languageLoaderContent -notmatch "loadLanguage\('ko_KR'\)") {
        $failures.Add('런처 기본 한국어 언어팩이 활성화되지 않았습니다.')
    }
}

$uiBinderPath = Join-Path $projectRoot 'app\assets\js\scripts\uibinder.js'
if (Test-Path -LiteralPath $uiBinderPath) {
    $uiBinderContent = [IO.File]::ReadAllText($uiBinderPath, [Text.Encoding]::UTF8)
    if ($uiBinderContent -notmatch 'backgrounds/modakbul\.png') {
        $failures.Add('모닥불 전용 런처 배경이 활성화되지 않았습니다.')
    }
}

if ($failures.Count -gt 0) {
    Write-Host '런처 설정 검증 실패:' -ForegroundColor Red
    $failures | ForEach-Object { Write-Host " - $_" -ForegroundColor Red }
    exit 1
}

Write-Host '런처 설정 검증 완료: 프로덕션 빌드에 필요한 값이 모두 연결되었습니다.' -ForegroundColor Green
