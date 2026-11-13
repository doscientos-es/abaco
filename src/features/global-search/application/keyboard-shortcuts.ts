/** Do not intercept typing, IME composition, browser shortcuts or keys in another dialog. */
export function shortcutCommand(
  event: Pick<
    KeyboardEvent,
    | 'key'
    | 'ctrlKey'
    | 'metaKey'
    | 'altKey'
    | 'shiftKey'
    | 'isComposing'
    | 'repeat'
    | 'defaultPrevented'
  >,
  editing: boolean,
  inDialog: boolean,
): string | null {
  if (event.defaultPrevented || event.isComposing || event.repeat) return null
  const key = event.key.toLowerCase()
  if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && key === 'k')
    return 'search'
  if (editing || inDialog || event.ctrlKey || event.metaKey || event.altKey) return null
  if (key === '?') return 'help'
  if (key === '/') return 'filter'
  if (key === 'g') return 'prefix'
  return key.length === 1 ? key : null
}
