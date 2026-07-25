'use strict'

const path = require('path')
const asar = require('@electron/asar')

const archivePath = path.resolve(process.argv[2] || 'dist/win-unpacked/resources/app.asar')
const archiveEntries = asar.listPackage(archivePath).map(entry => entry.replace(/\\/g, '/').replace(/^\/+/, ''))
const resolveArchiveFile = file => archiveEntries
    .filter(entry => entry.endsWith(file))
    .sort((left, right) => left.length - right.length)[0]
    .replace(/\//g, path.sep)
const readArchiveFile = file => asar.extractFile(archivePath, resolveArchiveFile(file)).toString('utf8')

const packageJson = JSON.parse(readArchiveFile('package.json'))
const settingsScript = readArchiveFile('app/assets/js/scripts/settings.js')
const koreanLanguage = readArchiveFile('app/assets/lang/ko_KR.toml')

const result = {
    archive: archivePath,
    version: packageJson.version,
    gameUpdater: settingsScript.includes('checkGameFilesAndLauncher'),
    fullRepair: settingsScript.includes('SettingsFullRepair'),
    koreanHeader: koreanLanguage.includes('게임 및 런처 업데이트'),
    koreanProgress: koreanLanguage.includes('게임 파일 검사 중')
}

console.log(JSON.stringify(result, null, 2))

if(
    result.version !== '1.0.3' ||
    !result.gameUpdater ||
    !result.fullRepair ||
    !result.koreanHeader ||
    !result.koreanProgress
){
    process.exitCode = 1
}
