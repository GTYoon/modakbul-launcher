/**
 * Core UI functions are initialized in this file. This prevents
 * unexpected errors from breaking the core features. Specifically,
 * actions in this file should not require the usage of any internal
 * modules, excluding dependencies.
 */
// Requirements
const $                              = require('jquery')
const {ipcRenderer, shell, webFrame} = require('electron')
const remote                         = require('@electron/remote')
const isDev                          = require('./assets/js/isdev')
const { LoggerUtil }                 = require('helios-core')
const Lang                           = require('./assets/js/langloader')
const CoreGameFileUpdater            = require('./assets/js/gamefileupdater')

const loggerUICore             = LoggerUtil.getLogger('UICore')
const loggerAutoUpdater        = LoggerUtil.getLogger('AutoUpdater')

// Log deprecation and process warnings.
process.traceProcessWarnings = true
process.traceDeprecation = true

// Disable eval function.
window.eval = global.eval = function () {
    throw new Error('Sorry, this app does not support window.eval().')
}

// Display warning when devtools window is opened.
remote.getCurrentWebContents().on('devtools-opened', () => {
    console.log('%cThe console is dark and full of terrors.', 'color: white; -webkit-text-stroke: 4px #a02d2a; font-size: 60px; font-weight: bold')
    console.log('%cIf you\'ve been told to paste something here, you\'re being scammed.', 'font-size: 16px')
    console.log('%cUnless you know exactly what you\'re doing, close this window.', 'font-size: 16px')
})

// Disable zoom, needed for darwin.
webFrame.setZoomLevel(0)
webFrame.setVisualZoomLevelLimits(1, 1)

// Initialize auto updates in production environments.
let updateCheckListener
const STARTUP_LAUNCHER_UPDATE_TIMEOUT = 30000
const pendingUpdates = {
    launcher: null,
    gameFiles: null
}
let startupLauncherUpdatePromise = Promise.resolve({ success: true, skipped: true })
let startupLauncherUpdateResolve = null
let startupLauncherUpdateTimer = null
let startupLauncherAutoInstall = false
let startupLauncherInstallRequested = false

function finishStartupLauncherUpdate(result){
    if(startupLauncherUpdateResolve == null){
        return
    }

    clearTimeout(startupLauncherUpdateTimer)
    startupLauncherUpdateTimer = null
    startupLauncherAutoInstall = false
    const resolve = startupLauncherUpdateResolve
    startupLauncherUpdateResolve = null
    resolve(result)
}

function beginStartupLauncherUpdateCheck(){
    if(startupLauncherUpdateResolve != null){
        return startupLauncherUpdatePromise
    }

    startupLauncherAutoInstall = process.platform !== 'darwin'
    startupLauncherUpdatePromise = new Promise(resolve => {
        startupLauncherUpdateResolve = resolve
    })
    startupLauncherUpdateTimer = setTimeout(() => {
        loggerAutoUpdater.warn('Startup launcher update check timed out; continuing without forced installation.')
        finishStartupLauncherUpdate({ success: false, timedOut: true })
    }, STARTUP_LAUNCHER_UPDATE_TIMEOUT)
    ipcRenderer.send('autoUpdateAction', 'checkForUpdate', { startup: true })
    return startupLauncherUpdatePromise
}

function waitForStartupLauncherUpdateCheck(){
    return startupLauncherUpdatePromise
}

async function installDownloadedStartupLauncherUpdate(info){
    if(startupLauncherInstallRequested){
        return
    }
    startupLauncherInstallRequested = true

    try {
        // Never terminate the renderer while the client pack worker is writing
        // mods/configs. The next launcher is installed only after that repair
        // has completed (successfully or with a handled failure).
        if(typeof waitForAutomaticGameFilesUpdate === 'function'){
            await waitForAutomaticGameFilesUpdate()
        }
    } catch(err) {
        loggerAutoUpdater.warn('Game file update wait failed before launcher installation.', err)
    }

    if(!startupLauncherAutoInstall){
        startupLauncherInstallRequested = false
        settingsUpdateButtonStatus(Lang.queryJS('uicore.autoUpdate.installNowButton'), false, () => {
            requestLauncherInstallation()
        })
        showUpdateUI(info)
        return
    }

    await requestLauncherInstallation({
        silent: true,
        forceRunAfter: true
    })
}

async function requestLauncherInstallation(options = {}){
    try {
        await CoreGameFileUpdater.prepareForLauncherInstallation()
        ipcRenderer.send('autoUpdateAction', 'installUpdateNow', options)
    } catch(err) {
        CoreGameFileUpdater.cancelLauncherInstallation()
        startupLauncherInstallRequested = false
        loggerAutoUpdater.error('Unable to prepare the launcher update installation.', err)
        settingsUpdateButtonStatus(Lang.queryJS('uicore.autoUpdate.installNowButton'), false, () => {
            requestLauncherInstallation(options)
        })
    }
}

if(!isDev){
    ipcRenderer.on('autoUpdateNotification', (event, arg, info) => {
        switch(arg){
            case 'checking-for-update':
                loggerAutoUpdater.info('Checking for update..')
                settingsUpdateButtonStatus(Lang.queryJS('uicore.autoUpdate.checkingForUpdateButton'), true)
                break
            case 'update-available':
                loggerAutoUpdater.info('New update available', info.version)
                
                if(process.platform === 'darwin'){
                    info.darwindownload = `https://github.com/GTYoon/modakbul-launcher/releases/download/v${info.version}/Modakbul-Season-1-setup-${info.version}${process.arch === 'arm64' ? '-arm64' : '-x64'}.dmg`
                }
                showUpdateUI(info)
                populateSettingsUpdateInformation(info)
                if(process.platform === 'darwin'){
                    finishStartupLauncherUpdate({ success: true, updateAvailable: true, manualInstall: true })
                }
                break
            case 'update-downloaded':
                loggerAutoUpdater.info('Update ' + info.version + ' ready to be installed.')
                if(startupLauncherAutoInstall){
                    settingsUpdateButtonStatus(Lang.queryJS('uicore.autoUpdate.installingAutomaticallyButton'), true)
                    showUpdateUI(info)
                    installDownloadedStartupLauncherUpdate(info)
                    break
                }
                settingsUpdateButtonStatus(Lang.queryJS('uicore.autoUpdate.installNowButton'), false, () => {
                    if(!isDev){
                        requestLauncherInstallation()
                    }
                })
                showUpdateUI(info)
                break
            case 'update-not-available':
                loggerAutoUpdater.info('No new update found.')
                settingsUpdateButtonStatus(Lang.queryJS('uicore.autoUpdate.checkForUpdatesButton'))
                finishStartupLauncherUpdate({ success: true, updateAvailable: false })
                break
            case 'ready':
                updateCheckListener = setInterval(() => {
                    ipcRenderer.send('autoUpdateAction', 'checkForUpdate')
                }, 1800000)
                beginStartupLauncherUpdateCheck()
                break
            case 'realerror':
                CoreGameFileUpdater.cancelLauncherInstallation()
                startupLauncherInstallRequested = false
                if(info != null && info.code != null){
                    if(info.code === 'ERR_UPDATER_INVALID_RELEASE_FEED'){
                        loggerAutoUpdater.info('No suitable releases found.')
                    } else if(info.code === 'ERR_XML_MISSED_ELEMENT'){
                        loggerAutoUpdater.info('No releases found.')
                    } else {
                        loggerAutoUpdater.error('Error during update check..', info)
                        loggerAutoUpdater.debug('Error Code:', info.code)
                    }
                }
                finishStartupLauncherUpdate({ success: false, error: info })
                break
            default:
                loggerAutoUpdater.info('Unknown argument', arg)
                break
        }
    })
}

/**
 * Send a notification to the main process changing the value of
 * allowPrerelease. If we are running a prerelease version, then
 * this will always be set to true, regardless of the current value
 * of val.
 * 
 * @param {boolean} val The new allow prerelease value.
 */
function changeAllowPrerelease(val){
    ipcRenderer.send('autoUpdateAction', 'allowPrereleaseChange', val)
}

async function openUpdateTab(){
    const showTab = () => settingsNavItemListener(document.getElementById('settingsNavUpdate'), false)
    if(getCurrentView() === VIEWS.settings){
        showTab()
        return
    }
    await prepareSettings()
    switchView(getCurrentView(), VIEWS.settings, 500, 500, showTab)
}

function refreshUpdateNavigation(){
    const update = pendingUpdates.launcher ?? pendingUpdates.gameFiles
    const seal = document.getElementById('image_seal_container')
    const button = document.getElementById('landingUpdateButton')
    const title = document.getElementById('landingUpdateButtonTitle')

    if(update == null){
        seal.removeAttribute('update')
        seal.onclick = null
        button.style.display = 'none'
        return
    }

    seal.setAttribute('update', true)
    seal.onclick = openUpdateTab
    button.style.display = 'block'
    button.onclick = openUpdateTab
    title.textContent = update.type === 'launcher'
        ? Lang.queryJS('landing.launcherUpdateAvailable', { version: update.version })
        : Lang.queryJS('landing.gameFilesUpdateAvailable', { version: update.version })
}

function showUpdateUI(info){
    pendingUpdates.launcher = { type: 'launcher', version: info.version }
    refreshUpdateNavigation()
}

function showGameFilesUpdateUI(info){
    pendingUpdates.gameFiles = { type: 'gameFiles', version: info.version }
    refreshUpdateNavigation()
}

function clearGameFilesUpdateUI(){
    pendingUpdates.gameFiles = null
    refreshUpdateNavigation()
}

/* jQuery Example
$(function(){
    loggerUICore.info('UICore Initialized');
})*/

document.addEventListener('readystatechange', function () {
    if (document.readyState === 'interactive'){
        loggerUICore.info('UICore Initializing..')

        // Bind close button.
        Array.from(document.getElementsByClassName('fCb')).map((val) => {
            val.addEventListener('click', e => {
                const window = remote.getCurrentWindow()
                window.close()
            })
        })

        // Bind restore down button.
        Array.from(document.getElementsByClassName('fRb')).map((val) => {
            val.addEventListener('click', e => {
                const window = remote.getCurrentWindow()
                if(window.isMaximized()){
                    window.unmaximize()
                } else {
                    window.maximize()
                }
                document.activeElement.blur()
            })
        })

        // Bind minimize button.
        Array.from(document.getElementsByClassName('fMb')).map((val) => {
            val.addEventListener('click', e => {
                const window = remote.getCurrentWindow()
                window.minimize()
                document.activeElement.blur()
            })
        })

        // Remove focus from social media buttons once they're clicked.
        Array.from(document.getElementsByClassName('mediaURL')).map(val => {
            val.addEventListener('click', e => {
                document.activeElement.blur()
            })
        })

    } else if(document.readyState === 'complete'){

        //266.01
        //170.8
        //53.21
        // Bind progress bar length to length of bot wrapper
        //const targetWidth = document.getElementById("launch_content").getBoundingClientRect().width
        //const targetWidth2 = document.getElementById("server_selection").getBoundingClientRect().width
        //const targetWidth3 = document.getElementById("launch_button").getBoundingClientRect().width

        document.getElementById('launch_details').style.maxWidth = 266.01
        document.getElementById('launch_progress').style.width = 170.8
        document.getElementById('launch_details_right').style.maxWidth = 170.8
        document.getElementById('launch_progress_label').style.width = 53.21
        
    }

}, false)

/**
 * Open web links in the user's default browser.
 */
$(document).on('click', 'a[href^="http"]', function(event) {
    event.preventDefault()
    shell.openExternal(this.href)
})

/**
 * Opens DevTools window if you hold (ctrl + shift + i).
 * This will crash the program if you are using multiple
 * DevTools, for example the chrome debugger in VS Code. 
 */
document.addEventListener('keydown', function (e) {
    if((e.key === 'I' || e.key === 'i') && e.ctrlKey && e.shiftKey){
        let window = remote.getCurrentWindow()
        window.toggleDevTools()
    }
})
