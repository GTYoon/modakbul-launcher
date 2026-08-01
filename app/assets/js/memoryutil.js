'use strict'

const GIB = 1024 * 1024 * 1024
const MEMORY_DEFAULTS_VERSION = 1

/**
 * Return the largest practical Minecraft heap while keeping Windows and the
 * launcher responsive. This is also the upper bound shown by the RAM slider.
 */
function getUsableMaxRamGiB(totalBytes) {
    if(!Number.isFinite(totalBytes) || totalBytes <= 0) {
        return 2
    }

    const above16GiB = totalBytes - (16 * GIB)
    const reservedBytes = above16GiB > 0
        ? Math.trunc(above16GiB / 8) + (4 * GIB)
        : totalBytes / 4
    // Minecraft's legacy minimum is 2 GiB; never generate Xmx below Xms.
    return Math.max(2, Math.floor((totalBytes - reservedBytes) / GIB))
}

function formatUsableMaxRam(totalBytes) {
    return `${getUsableMaxRamGiB(totalBytes)}G`
}

module.exports = {
    GIB,
    MEMORY_DEFAULTS_VERSION,
    getUsableMaxRamGiB,
    formatUsableMaxRam
}
