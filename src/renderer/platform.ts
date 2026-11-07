/** Renderer platform differences live here; native process selection stays in main. */
export const isWindows = (): boolean => navigator.userAgent.includes('Windows')

export const primaryModifier = (event: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey'>): boolean =>
  isWindows() ? event.ctrlKey : event.metaKey
