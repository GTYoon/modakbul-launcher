'use strict'

const assert = require('assert')
const Module = require('module')
const path = require('path')

const SUCCESS = 'SUCCESS'
const ERROR = 'ERROR'

function deferred(){
    let resolve
    let reject
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise
        reject = rejectPromise
    })
    return {
        promise,
        resolve,
        reject
    }
}

function createAccount(suffix){
    return {
        type: 'microsoft',
        uuid: 'test-account',
        accessToken: `mc-${suffix}`,
        expiresAt: 0,
        microsoft: {
            access_token: `ms-${suffix}`,
            refresh_token: `refresh-${suffix}`,
            expires_at: 0
        }
    }
}

let selectedAccount = createAccount('old')
let tokenRequest = deferred()
let tokenRequestCount = 0
let updateCount = 0

const configManager = {
    getSelectedAccount: () => selectedAccount,
    updateMicrosoftAuthAccount: (uuid, accessToken, msAccessToken, msRefreshToken, msExpires, mcExpires) => {
        assert.strictEqual(uuid, selectedAccount.uuid)
        updateCount++
        selectedAccount.accessToken = accessToken
        selectedAccount.expiresAt = mcExpires
        selectedAccount.microsoft.access_token = msAccessToken
        selectedAccount.microsoft.refresh_token = msRefreshToken
        selectedAccount.microsoft.expires_at = msExpires
    },
    save: () => {},
    getClientToken: () => 'client-token'
}

const microsoftAuth = {
    getAccessToken: async () => {
        tokenRequestCount++
        return await tokenRequest.promise
    },
    getXBLToken: async () => ({
        responseStatus: SUCCESS,
        data: {
            Token: 'xbl-token'
        }
    }),
    getXSTSToken: async () => ({
        responseStatus: SUCCESS,
        data: {
            Token: 'xsts-token',
            DisplayClaims: {
                xui: [{
                    uhs: 'user-hash'
                }]
            }
        }
    }),
    getMCAccessToken: async () => ({
        responseStatus: SUCCESS,
        data: {
            access_token: 'fresh-mc-token',
            expires_in: 3600
        }
    }),
    getMCProfile: async () => ({
        responseStatus: SUCCESS,
        data: {
            id: 'test-account',
            name: 'TestPlayer'
        }
    })
}

const originalLoad = Module._load
Module._load = function(request, parent, isMain){
    if(request === './configmanager'){
        return configManager
    }
    if(request === 'helios-core'){
        return {
            LoggerUtil: {
                getLogger: () => ({
                    error: () => {},
                    info: () => {}
                })
            }
        }
    }
    if(request === 'helios-core/common'){
        return {
            RestResponseStatus: {
                SUCCESS,
                ERROR
            }
        }
    }
    if(request === 'helios-core/mojang'){
        return {
            MojangRestAPI: {},
            MojangErrorCode: {}
        }
    }
    if(request === 'helios-core/microsoft'){
        return {
            MicrosoftAuth: microsoftAuth,
            MicrosoftErrorCode: {
                UNKNOWN: 'UNKNOWN'
            }
        }
    }
    if(request === './ipcconstants'){
        return {
            AZURE_CLIENT_ID: 'test-client'
        }
    }
    if(request === './langloader'){
        return {
            queryJS: key => key
        }
    }
    return originalLoad(request, parent, isMain)
}

const authManagerPath = path.resolve(__dirname, '..', 'app', 'assets', 'js', 'authmanager.js')
const AuthManager = require(authManagerPath)
Module._load = originalLoad

async function resolveTokenRequest(){
    tokenRequest.resolve({
        responseStatus: SUCCESS,
        data: {
            access_token: 'fresh-ms-token',
            refresh_token: 'fresh-refresh-token',
            expires_in: 3600
        }
    })
}

async function main(){
    const staleValidationOne = AuthManager.validateSelected()
    const staleValidationTwo = AuthManager.validateSelected()
    assert.strictEqual(tokenRequestCount, 1, 'Concurrent checks must share one token refresh request.')

    selectedAccount = createAccount('new-login')
    await resolveTokenRequest()
    assert.deepStrictEqual(
        await Promise.all([staleValidationOne, staleValidationTwo]),
        [false, false],
        'A stale refresh must not validate a newly logged-in account.'
    )
    assert.strictEqual(updateCount, 0, 'A stale refresh must not overwrite new login tokens.')

    selectedAccount = createAccount('second')
    tokenRequest = deferred()
    tokenRequestCount = 0
    const currentValidationOne = AuthManager.validateSelected()
    const currentValidationTwo = AuthManager.validateSelected()
    assert.strictEqual(tokenRequestCount, 1, 'The current account must still use a single refresh request.')
    await resolveTokenRequest()
    assert.deepStrictEqual(
        await Promise.all([currentValidationOne, currentValidationTwo]),
        [true, true],
        'A current refresh should validate both callers.'
    )
    assert.strictEqual(updateCount, 1, 'A shared current refresh must save tokens exactly once.')

    console.log('Auth validation race tests passed.')
}

main().catch(err => {
    console.error(err)
    process.exitCode = 1
})
