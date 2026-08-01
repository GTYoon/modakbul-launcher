'use strict'

const assert = require('assert')
const EventEmitter = require('events')
const Module = require('module')

let finishVerification
let destroyCount = 0

class FakeFullRepair {
    spawnReceiver() {
        this.childProcess = new EventEmitter()
        this.childProcess.connected = true
    }

    verifyFiles(progress) {
        progress(100)
        return new Promise(resolve => {
            finishVerification = resolve
        })
    }

    download() {
        throw new Error('download should not run in this test')
    }

    destroyReceiver() {
        destroyCount++
        this.childProcess.connected = false
    }
}

const originalLoad = Module._load
Module._load = function(request, parent, isMain) {
    if(request === 'helios-core/dl') {
        return { FullRepair: FakeFullRepair }
    }
    return originalLoad.call(this, request, parent, isMain)
}

const updater = require('../app/assets/js/gamefileupdater')
Module._load = originalLoad

async function main() {
    const options = {
        commonDirectory: 'common',
        instanceDirectory: 'instance',
        launcherDirectory: 'launcher',
        serverId: 'server',
        devMode: false
    }

    const firstRepair = updater.repairGameFiles(options)
    const sharedRepair = updater.repairGameFiles(options)
    assert.strictEqual(sharedRepair, firstRepair, 'same-server repair must be single-flight')

    let installPrepared = false
    const installWait = updater.prepareForLauncherInstallation().then(() => {
        installPrepared = true
    })
    await Promise.resolve()
    assert.strictEqual(installPrepared, false, 'installation must wait for the active repair')

    await assert.rejects(
        updater.repairGameFiles(options),
        /launcher update is ready to install/,
        'new repair must be blocked while installation is pending'
    )

    finishVerification(0)
    await firstRepair
    await installWait
    assert.strictEqual(installPrepared, true)
    assert.strictEqual(destroyCount, 1, 'repair worker must be destroyed exactly once')

    updater.cancelLauncherInstallation()
    const nextRepair = updater.repairGameFiles(options)
    await Promise.resolve()
    finishVerification(0)
    await nextRepair
    assert.strictEqual(destroyCount, 2, 'repair should run again after a failed installation is cancelled')

    console.log('Game file updater concurrency tests passed.')
}

main().catch(err => {
    console.error(err)
    process.exitCode = 1
})
