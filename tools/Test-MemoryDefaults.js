'use strict'

const assert = require('assert')
const MemoryUtil = require('../app/assets/js/memoryutil')

const GiB = MemoryUtil.GIB

assert.strictEqual(MemoryUtil.getUsableMaxRamGiB(2 * GiB), 2)
assert.strictEqual(MemoryUtil.getUsableMaxRamGiB(8 * GiB), 6)
assert.strictEqual(MemoryUtil.getUsableMaxRamGiB(16 * GiB), 12)
assert.strictEqual(MemoryUtil.getUsableMaxRamGiB(32 * GiB), 26)
assert.strictEqual(MemoryUtil.getUsableMaxRamGiB(64 * GiB), 54)
assert.strictEqual(MemoryUtil.formatUsableMaxRam(64 * GiB), '54G')
assert.strictEqual(MemoryUtil.getUsableMaxRamGiB(Number.NaN), 2)

console.log('Memory default tests passed.')
