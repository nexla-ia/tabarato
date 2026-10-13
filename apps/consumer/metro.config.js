const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')
const fs = require('fs')

const projectRoot = __dirname
// Em dev local rodamos dentro do monorepo (../..). Em builds STANDALONE (EAS
// sobe só a pasta do app), o monorepo não existe — então caímos no próprio projeto.
let monorepoRoot = path.resolve(projectRoot, '../..')
const isMonorepo = fs.existsSync(path.join(monorepoRoot, 'package.json'))
if (!isMonorepo) monorepoRoot = projectRoot

const config = getDefaultConfig(projectRoot)

config.watchFolders = isMonorepo ? [monorepoRoot] : [projectRoot]

// serverRoot: só fixamos na PASTA DO APP quando estamos EXPORTANDO/gerando o bundle
// nativo (gradle export:embed passa "--entry-file index.js" relativo ao app). No
// DEV (expo start), deixamos o padrão (raiz do workspace) — é assim que o manifest
// do Expo Go resolve "apps/consumer/index". Fixar no dev quebrava o Expo Go (404).
const isBundling = process.argv.some((a) => /\bexport\b|bundle/i.test(String(a)))
if (isBundling) {
  config.server = { ...(config.server ?? {}), unstable_serverRoot: projectRoot }
}

config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
]

// Force all 'react' imports (including react-native internals) to use
// consumer's react@19.1.0, which matches react-native-renderer@19.1.0
const consumerModules = path.resolve(projectRoot, 'node_modules')
const reactMain = require.resolve('react', { paths: [consumerModules] })
const reactJsxRuntime = require.resolve('react/jsx-runtime', { paths: [consumerModules] })
const reactJsxDevRuntime = require.resolve('react/jsx-dev-runtime', { paths: [consumerModules] })

const reactMap = {
  'react': reactMain,
  'react/jsx-runtime': reactJsxRuntime,
  'react/jsx-dev-runtime': reactJsxDevRuntime,
}

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (reactMap[moduleName]) {
    return { filePath: reactMap[moduleName], type: 'sourceFile' }
  }
  return context.resolveRequest(context, moduleName, platform)
}

module.exports = config
