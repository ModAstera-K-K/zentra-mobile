// Reexport the native module. On web, it will be resolved to ZentraNativeSignalsModule.web.ts
// and on native platforms to ZentraNativeSignalsModule.ts
export { default } from './src/ZentraNativeSignalsModule';
export { default as ZentraNativeSignalsView } from './src/ZentraNativeSignalsView';
export * from  './src/ZentraNativeSignals.types';
