'use strict'

const { FullRepair } = require('helios-core/dl')

const DEFAULT_INACTIVITY_TIMEOUT = 180000

let activeRepair = null
let launcherInstallationPending = false

function invokeProgress(callback, ...args) {
    if(typeof callback === 'function') {
        callback(...args)
    }
}

function withInactivityTimeout(operation, timeoutMs, timeoutMessage) {
    return new Promise((resolve, reject) => {
        let timeout

        const refreshTimeout = () => {
            clearTimeout(timeout)
            timeout = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs)
        }

        refreshTimeout()
        Promise.resolve()
            .then(() => operation(refreshTimeout))
            .then(value => {
                clearTimeout(timeout)
                resolve(value)
            })
            .catch(err => {
                clearTimeout(timeout)
                reject(err)
            })
    })
}

async function executeRepair(options) {
    const {
        commonDirectory,
        instanceDirectory,
        launcherDirectory,
        serverId,
        devMode,
        inactivityTimeout = DEFAULT_INACTIVITY_TIMEOUT,
        timeoutMessage = 'The game file update worker stopped responding.',
        onValidationProgress,
        onDownloadStart,
        onDownloadProgress,
        onNoDownload
    } = options

    const fullRepairModule = new FullRepair(
        commonDirectory,
        instanceDirectory,
        launcherDirectory,
        serverId,
        devMode
    )

    fullRepairModule.spawnReceiver()
    const repairProcess = fullRepairModule.childProcess
    let repairComplete = false
    let stage = 'validation'
    let rejectReceiverFailure

    const receiverFailure = new Promise((_, reject) => {
        rejectReceiverFailure = reject
    })
    const onReceiverError = err => rejectReceiverFailure(err)
    const onReceiverClose = code => {
        if(!repairComplete) {
            const err = new Error(`The game file update worker exited unexpectedly (${code}).`)
            err.code = code
            rejectReceiverFailure(err)
        }
    }

    repairProcess.once('error', onReceiverError)
    repairProcess.once('close', onReceiverClose)

    try {
        const invalidFileCount = await Promise.race([
            withInactivityTimeout(refreshTimeout => fullRepairModule.verifyFiles(percent => {
                refreshTimeout()
                invokeProgress(onValidationProgress, percent)
            }), inactivityTimeout, timeoutMessage),
            receiverFailure
        ])

        if(invalidFileCount > 0) {
            stage = 'download'
            invokeProgress(onDownloadStart, invalidFileCount)
            await Promise.race([
                withInactivityTimeout(refreshTimeout => fullRepairModule.download(percent => {
                    refreshTimeout()
                    invokeProgress(onDownloadProgress, percent)
                }), inactivityTimeout, timeoutMessage),
                receiverFailure
            ])
        } else {
            invokeProgress(onNoDownload)
        }

        repairComplete = true
        return {
            serverId,
            invalidFileCount,
            downloaded: invalidFileCount > 0
        }
    } catch(err) {
        if(err != null && typeof err === 'object') {
            err.gameFileRepairStage = stage
        }
        throw err
    } finally {
        repairProcess.removeListener('error', onReceiverError)
        repairProcess.removeListener('close', onReceiverClose)
        if(repairProcess.connected) {
            try {
                fullRepairModule.destroyReceiver()
            } catch(err) {
                // The worker may disconnect itself after reporting an error.
            }
        }
    }
}

/**
 * Run one managed-file repair at a time for the entire renderer process.
 * Settings, automatic startup updates, and PLAY all use this singleton module,
 * so two repair workers never write to the same instance concurrently.
 */
function repairGameFiles(options) {
    if(launcherInstallationPending) {
        return Promise.reject(new Error('A launcher update is ready to install; no new game-file repair can start.'))
    }

    if(activeRepair != null) {
        if(activeRepair.serverId === options.serverId) {
            return activeRepair.promise
        }

        return activeRepair.promise
            .catch(() => null)
            .then(() => repairGameFiles(options))
    }

    const promise = executeRepair(options)
    activeRepair = {
        serverId: options.serverId,
        promise
    }

    const clearActiveRepair = () => {
        if(activeRepair?.promise === promise) {
            activeRepair = null
        }
    }
    promise.then(clearActiveRepair, clearActiveRepair)

    return promise
}

/**
 * Stop new repair workers from starting and wait for the current one to leave
 * the managed instance idle before Electron replaces/restarts the launcher.
 */
async function prepareForLauncherInstallation() {
    launcherInstallationPending = true
    const repair = activeRepair?.promise
    if(repair != null) {
        try {
            await repair
        } catch(err) {
            // Installation may continue after a handled repair failure. The
            // restarted launcher will retry the managed-file update.
        }
    }
}

function cancelLauncherInstallation() {
    launcherInstallationPending = false
}

function getActiveRepairPromise() {
    return activeRepair?.promise ?? null
}

function isRepairRunning() {
    return activeRepair != null
}

module.exports = {
    repairGameFiles,
    getActiveRepairPromise,
    isRepairRunning,
    prepareForLauncherInstallation,
    cancelLauncherInstallation
}
