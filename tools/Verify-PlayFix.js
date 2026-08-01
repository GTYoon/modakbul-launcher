'use strict'

const path = require('path')
const asar = require('@electron/asar')

const archivePath = path.resolve(process.argv[2] || 'dist/win-unpacked/resources/app.asar')
const archiveEntries = asar.listPackage(archivePath)
    .map(entry => entry.replace(/\\/g, '/').replace(/^\/+/, ''))

function readArchiveFile(file){
    const archiveEntry = archiveEntries
        .filter(entry => entry.endsWith(file))
        .sort((left, right) => left.length - right.length)[0]
    if(archiveEntry == null){
        throw new Error(`Missing ${file} in ${archivePath}`)
    }
    return asar.extractFile(archivePath, archiveEntry.replace(/\//g, path.sep)).toString('utf8')
}

const indexScript = readArchiveFile('index.js')
const authManagerScript = readArchiveFile('app/assets/js/authmanager.js')
const landingScript = readArchiveFile('app/assets/js/scripts/landing.js')
const gameFileUpdaterScript = readArchiveFile('app/assets/js/gamefileupdater.js')
const processBuilderScript = readArchiveFile('app/assets/js/processbuilder.js')

const checks = {
    noRuntimeShortcutWriter: !indexScript.includes('writeShortcutLink')
        && !indexScript.includes('repairWindowsDesktopShortcut'),
    accountValidationTimeout: landingScript.includes('accountValidationTimeout')
        && landingScript.includes('withTimeout('),
    accountValidationSingleFlight: authManagerScript.includes('activeAccountValidations')
        && authManagerScript.includes('selectedAccountMatchesSnapshot'),
    readinessChecksBothStreams: landingScript.includes('inspectLaunchOutput(\'stdout\'')
        && landingScript.includes('inspectLaunchOutput(\'stderr\''),
    noFiveSecondSpawnSuccess: !landingScript.includes('onLoadComplete(\'60-second')
        && !landingScript.includes('setTimeout(onLoadComplete'),
    startupTimeoutStopsProcess: landingScript.includes('launchedProcess.kill()'),
    repairWorkerCleanup: gameFileUpdaterScript.includes('receiverFailure')
        && gameFileUpdaterScript.includes('destroyReceiver()'),
    repairWorkerWatchdog: gameFileUpdaterScript.includes('withInactivityTimeout(')
        && gameFileUpdaterScript.includes('timeoutMessage')
        && landingScript.includes('repairWorkerTimeout'),
    repeatLaunchArgumentsAreCloned: processBuilderScript.includes('vanillaManifest.arguments.jvm || []')
        && processBuilderScript.includes('vanillaManifest.arguments.game || []')
}

console.log(JSON.stringify({
    archive: archivePath,
    checks
}, null, 2))

const failedChecks = Object.entries(checks)
    .filter(([, passed]) => !passed)
    .map(([name]) => name)
if(failedChecks.length > 0){
    throw new Error(`PLAY regression checks failed: ${failedChecks.join(', ')}`)
}
