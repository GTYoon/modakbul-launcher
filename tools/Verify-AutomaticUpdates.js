'use strict'

const fs = require('fs')
const path = require('path')

const projectRoot = path.resolve(__dirname, '..')

function read(relativePath) {
    return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8')
}

const indexScript = read('index.js')
const uiCoreScript = read('app/assets/js/scripts/uicore.js')
const uiBinderScript = read('app/assets/js/scripts/uibinder.js')
const settingsScript = read('app/assets/js/scripts/settings.js')
const landingScript = read('app/assets/js/scripts/landing.js')
const gameFileUpdaterScript = read('app/assets/js/gamefileupdater.js')
const koreanLanguage = read('app/assets/lang/ko_KR.toml')
const englishLanguage = read('app/assets/lang/en_US.toml')

const checks = {
    executableAutoDownload: indexScript.includes("autoUpdater.autoDownload = process.platform !== 'darwin'"),
    executableSilentInstall: indexScript.includes("data?.silent === true")
        && indexScript.includes("data?.forceRunAfter !== false"),
    startupLauncherCheck: uiCoreScript.includes('beginStartupLauncherUpdateCheck()')
        && uiCoreScript.includes('waitForStartupLauncherUpdateCheck()'),
    startupLauncherAutoInstall: uiCoreScript.includes('if(startupLauncherAutoInstall)')
        && uiCoreScript.includes("'installUpdateNow'")
        && uiCoreScript.includes('forceRunAfter: true'),
    launcherInstallWaitsForGameRepair: uiCoreScript.includes('installDownloadedStartupLauncherUpdate')
        && uiCoreScript.includes('await waitForAutomaticGameFilesUpdate()')
        && uiCoreScript.includes('await CoreGameFileUpdater.prepareForLauncherInstallation()'),
    launcherInstallBlocksNewRepair: gameFileUpdaterScript.includes('launcherInstallationPending')
        && gameFileUpdaterScript.includes('prepareForLauncherInstallation')
        && gameFileUpdaterScript.includes('cancelLauncherInstallation'),
    boundedLauncherCheck: uiCoreScript.includes('STARTUP_LAUNCHER_UPDATE_TIMEOUT = 30000'),
    delayedChecksStayManual: uiCoreScript.includes("ipcRenderer.send('autoUpdateAction', 'checkForUpdate')")
        && uiCoreScript.includes('setInterval'),
    startupGameUpdate: uiBinderScript.includes('startAutomaticGameFilesUpdate()'),
    gameUpdateStartsBeforeLauncherUpdater: uiBinderScript.indexOf('startAutomaticGameFilesUpdate()')
        < uiBinderScript.indexOf("'initAutoUpdater'"),
    versionGate: settingsScript.includes('automatic && installedVersion === remoteVersion'),
    startupGamePromise: settingsScript.includes('automaticGameUpdatePromise')
        && settingsScript.includes('waitForAutomaticGameFilesUpdate()'),
    sharedRepairModule: settingsScript.includes("require('./assets/js/gamefileupdater')")
        && landingScript.includes("require('./assets/js/gamefileupdater')"),
    singleFlightRepair: gameFileUpdaterScript.includes('let activeRepair = null')
        && gameFileUpdaterScript.includes('return activeRepair.promise'),
    playWaitsForBothUpdates: landingScript.includes('waitForStartupLauncherUpdateCheck()')
        && landingScript.includes('waitForAutomaticGameFilesUpdate()')
        && landingScript.includes('await Promise.all(['),
    noIndependentLandingRepair: !landingScript.includes('new FullRepair('),
    koreanStatus: koreanLanguage.includes('waitingForAutomaticUpdates')
        && koreanLanguage.includes('installingAutomaticallyButton'),
    englishStatus: englishLanguage.includes('waitingForAutomaticUpdates')
        && englishLanguage.includes('installingAutomaticallyButton')
}

console.log(JSON.stringify(checks, null, 2))

const failedChecks = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name)

if(failedChecks.length > 0) {
    throw new Error(`Automatic update verification failed: ${failedChecks.join(', ')}`)
}
