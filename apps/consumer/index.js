// Entry local do app.
//
// Por que existe: num monorepo, o `expo-router/entry` fica hoisted em
// ../../node_modules, e o Gradle passa esse caminho pro Metro como
// "../../node_modules/expo-router/entry.js" — um entry FORA da pasta do app.
// Isso faz o Expo CLI eleger a raiz do monorepo como projectRoot e o bundle
// quebra ("Unable to resolve module ... from C:\tabarato").
//
// Com um entry local, o caminho passado vira só "index.js" (dentro do projeto),
// o Metro roda com a raiz certa e o bundle resolve normalmente.
import 'expo-router/entry'
