'use strict'

const path = require('path')
const asar = require('@electron/asar')

const archivePath = path.resolve(process.argv[2] || 'dist/win-unpacked/resources/app.asar')
const archiveEntries = asar.listPackage(archivePath).map(entry => entry.replace(/\\/g, '/').replace(/^\/+/, ''))

function requireArchiveEntry(file) {
    if(!archiveEntries.includes(file)) {
        throw new Error(`Missing exact ASAR entry: ${file}`)
    }
    return file.replace(/\//g, path.sep)
}

function readArchiveFile(file) {
    const data = asar.extractFile(archivePath, requireArchiveEntry(file))
    if(data.length === 0) {
        throw new Error(`Empty ASAR entry: ${file}`)
    }
    return data.toString('utf8')
}

const packageJsonText = readArchiveFile('package.json')
const packageJson = JSON.parse(packageJsonText)
const sourcePackageJson = require(path.resolve(__dirname, '..', 'package.json'))
const indexScript = readArchiveFile('index.js')
const settingsScript = readArchiveFile('app/assets/js/scripts/settings.js')
const uiCoreScript = readArchiveFile('app/assets/js/scripts/uicore.js')
const uiBinderScript = readArchiveFile('app/assets/js/scripts/uibinder.js')
const landingScript = readArchiveFile('app/assets/js/scripts/landing.js')
const gameFileUpdaterScript = readArchiveFile('app/assets/js/gamefileupdater.js')
const koreanLanguage = readArchiveFile('app/assets/lang/ko_KR.toml')

// Reading these files is intentional.  Presence-only checks do not detect an
// ASAR header whose offsets point into neighbouring payloads.
readArchiveFile('node_modules/@electron/remote/main/index.js')
readArchiveFile('node_modules/@electron/remote/renderer/index.js')
readArchiveFile('node_modules/helios-core/dist/index.js')
readArchiveFile('node_modules/electron-updater/out/main.js')

const result = {
    archive: archivePath,
    version: packageJson.version,
    sourceVersion: sourcePackageJson.version,
    packageName: packageJson.name,
    mainEntry: packageJson.main,
    noPrivateBackups: !archiveEntries.some(entry => entry.startsWith('.codex-backups/')),
    mainReadable: indexScript.includes('require(\'@electron/remote/main\')'),
    remoteMain: archiveEntries.includes('node_modules/@electron/remote/main/index.js'),
    remoteRenderer: archiveEntries.includes('node_modules/@electron/remote/renderer/index.js'),
    heliosCore: archiveEntries.includes('node_modules/helios-core/dist/index.js'),
    updater: archiveEntries.includes('node_modules/electron-updater/out/main.js'),
    gameUpdater: settingsScript.includes('checkGameFilesAndLauncher'),
    fullRepair: gameFileUpdaterScript.includes("require('helios-core/dl')"),
    updateNavigation: uiCoreScript.includes('showGameFilesUpdateUI'),
    automaticGameUpdate: uiBinderScript.includes('startAutomaticGameFilesUpdate()'),
    gameUpdateStartsBeforeLauncherUpdater: uiBinderScript.indexOf('startAutomaticGameFilesUpdate()')
        < uiBinderScript.indexOf("'initAutoUpdater'"),
    singleFlightRepair: gameFileUpdaterScript.includes('activeRepair')
        && gameFileUpdaterScript.includes('return activeRepair.promise'),
    playWaitsForStartupUpdates: landingScript.includes('waitForStartupLauncherUpdateCheck()')
        && landingScript.includes('waitForAutomaticGameFilesUpdate()'),
    automaticLauncherInstall: uiCoreScript.includes('startupLauncherAutoInstall')
        && uiCoreScript.includes("'installUpdateNow'"),
    launcherInstallWaitsForGameRepair: uiCoreScript.includes('installDownloadedStartupLauncherUpdate')
        && uiCoreScript.includes('await waitForAutomaticGameFilesUpdate()')
        && uiCoreScript.includes('await CoreGameFileUpdater.prepareForLauncherInstallation()'),
    launcherInstallBlocksNewRepair: gameFileUpdaterScript.includes('launcherInstallationPending')
        && gameFileUpdaterScript.includes('prepareForLauncherInstallation'),
    boundedLauncherCheck: uiCoreScript.includes('STARTUP_LAUNCHER_UPDATE_TIMEOUT = 30000'),
    koreanHeader: koreanLanguage.includes('게임 및 런처 업데이트'),
    koreanProgress: koreanLanguage.includes('게임 파일 검사 중'),
    koreanAutomaticInstall: koreanLanguage.includes('런처 업데이트를 적용하고 다시 시작합니다')
}

console.log(JSON.stringify(result, null, 2))

if(
    result.version !== result.sourceVersion ||
    result.packageName !== 'modakbul-season1-launcher' ||
    result.mainEntry !== 'index.js' ||
    !result.noPrivateBackups ||
    !result.mainReadable ||
    !result.remoteMain ||
    !result.remoteRenderer ||
    !result.heliosCore ||
    !result.updater ||
    !result.gameUpdater ||
    !result.fullRepair ||
    !result.updateNavigation ||
    !result.automaticGameUpdate ||
    !result.gameUpdateStartsBeforeLauncherUpdater ||
    !result.singleFlightRepair ||
    !result.playWaitsForStartupUpdates ||
    !result.automaticLauncherInstall ||
    !result.launcherInstallWaitsForGameRepair ||
    !result.launcherInstallBlocksNewRepair ||
    !result.boundedLauncherCheck ||
    !result.koreanHeader ||
    !result.koreanProgress ||
    !result.koreanAutomaticInstall
){
    process.exitCode = 1
}
