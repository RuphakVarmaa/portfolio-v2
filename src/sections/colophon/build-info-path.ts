/**
 * Where the build writes its trace. A module of its own so the Colophon (which is in the initial JavaScript)
 * can name the file without pulling the parser and the view model (`trace-model.ts`) into the entry chunk:
 * those load with the build-trace panel, on demand.
 */
export const BUILD_INFO_PATH = '/build-info.json'
