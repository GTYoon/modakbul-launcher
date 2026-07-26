const { DistributionAPI } = require('helios-core/common')

const ConfigManager = require('./configmanager')

exports.REMOTE_DISTRO_URL = 'https://raw.githubusercontent.com/GTYoon/modakbul-client/main/distribution.json'

const api = new DistributionAPI(
    ConfigManager.getLauncherDirectory(),
    null, // Injected forcefully by the preloader.
    null, // Injected forcefully by the preloader.
    `${exports.REMOTE_DISTRO_URL}?launcherStart=${Date.now()}`,
    false
)

// raw.githubusercontent.com responses may be cached for several minutes.
// Give every distribution request a unique URL so a newly published game pack
// is visible immediately instead of after the CDN cache expires.
const pullRemote = api.pullRemote.bind(api)
api.pullRemote = function(){
    api.remoteUrl = `${exports.REMOTE_DISTRO_URL}?refresh=${Date.now()}`
    return pullRemote()
}

exports.DistroAPI = api
