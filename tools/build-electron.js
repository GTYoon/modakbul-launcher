'use strict'

const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const projectRoot = path.resolve(__dirname, '..')

// The portable build host uses Electron as its Node runtime.  Its default
// ASAR-aware fs wrapper treats the output app.asar like a directory while
// electron-builder is calculating archive integrity, so turn that wrapper off
// for the build process only.
if(process.versions.electron) {
    process.noAsar = true
}

/**
 * electron-builder's dependency collector can return an empty set when this
 * project is built from a portable Node runtime.  Build an explicit, flattened
 * production-only dependency tree for the configured FileSet so packaged
 * launchers always contain their runtime `node_modules`.
 */
function prepareRuntimeDependencies() {
    if(process.platform !== 'win32') return

    const appBuilder = path.join(projectRoot, 'node_modules', 'app-builder-bin', 'win', 'x64', 'app-builder.exe')
    const sourceModules = path.join(projectRoot, 'node_modules')
    const runtimeModules = path.join(projectRoot, 'runtime_node_modules')
    const dependencyResult = spawnSync(appBuilder, ['node-dep-tree', '--dir', projectRoot, '--flatten'], {
        encoding: 'utf8',
        windowsHide: true
    })

    if(dependencyResult.error) throw dependencyResult.error
    if(dependencyResult.status !== 0) {
        throw new Error(`Unable to resolve production dependencies: ${dependencyResult.stderr || dependencyResult.stdout}`)
    }

    const dependencies = JSON.parse(dependencyResult.stdout)
    if(!dependencies.some(dependency => dependency.name === '@electron/remote')) {
        throw new Error('Required production dependency @electron/remote was not resolved.')
    }

    fs.rmSync(runtimeModules, { recursive: true, force: true })
    fs.mkdirSync(runtimeModules, { recursive: true })

    for(const dependency of dependencies) {
        const relativePath = path.relative(sourceModules, dependency.dir)
        if(!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
            throw new Error(`Unsafe production dependency path: ${dependency.dir}`)
        }
        fs.cpSync(dependency.dir, path.join(runtimeModules, relativePath), { recursive: true, force: true })
    }
}

// electron-builder asks npm to inspect production dependencies through cmd.exe
// on Windows. Ensure that standard Windows executables remain discoverable when
// the build is launched from a portable Node runtime or CI shell with a trimmed
// PATH; otherwise electron-builder silently packages no runtime node_modules.
if(process.platform === 'win32') {
    const systemDirectory = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32')
    const existingPath = process.env.Path || process.env.PATH || ''
    const containsSystemDirectory = existingPath
        .split(path.delimiter)
        .some(entry => entry.toLowerCase() === systemDirectory.toLowerCase())

    if(!containsSystemDirectory) {
        process.env.Path = `${systemDirectory}${path.delimiter}${existingPath}`
        process.env.PATH = process.env.Path
    }
}

prepareRuntimeDependencies()

const executable = process.execPath
const builderCli = path.resolve(projectRoot, 'node_modules', 'electron-builder', 'out', 'cli', 'cli.js')
// electron-builder's CLI already defaults to `build`; passing a literal
// `build` after the script path makes v26 treat it as an unknown argument.
const builderArguments = process.argv.slice(2)

// Electron can also act as the portable Node runtime used on this build host.
// In that mode spawning Electron with a script path makes the CLI receive the
// path as an extra argument, so load it in-process with a normal Node argv.
if(process.versions.electron) {
    // yargs treats Electron argv differently and removes only its first
    // entry.  Present the builder script as that entry so the script path is
    // not parsed as an unknown command-line argument.
    process.argv = [builderCli, ...builderArguments]
    require(builderCli)
} else {
    const result = spawnSync(executable, [builderCli, ...builderArguments], {
        env: process.env,
        stdio: 'inherit'
    })

    if(result.error) {
        throw result.error
    }

    process.exitCode = result.status === null ? 1 : result.status
}
