'use strict'

const fs = require('fs')
const path = require('path')
const { rcedit } = require('rcedit')

module.exports = async context => {
    if (context.electronPlatformName !== 'win32') {
        return
    }

    const appInfo = context.packager.appInfo
    const executable = path.join(context.appOutDir, `${appInfo.productFilename}.exe`)
    const icon = await context.packager.getIconPath()

    for (const requiredPath of [executable, icon]) {
        if (!requiredPath || !fs.existsSync(requiredPath)) {
            throw new Error(`Windows resource input is missing: ${requiredPath}`)
        }
    }

    await rcedit(executable, {
        icon,
        'file-version': appInfo.version,
        'product-version': appInfo.version,
        'version-string': {
            ProductName: appInfo.productName,
            FileDescription: appInfo.productName,
            CompanyName: '모닥불 Season 1 운영팀',
            LegalCopyright: appInfo.copyright,
            OriginalFilename: path.basename(executable)
        }
    })
}
