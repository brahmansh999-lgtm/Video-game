/** Button prompt glyphs for keyboard, Xbox-style and PlayStation-style controllers. */

export type DeviceKind = 'keyboard' | 'xbox' | 'playstation';

const XBOX = [
  'A',
  'B',
  'X',
  'Y',
  'LB',
  'RB',
  'LT',
  'RT',
  'View',
  'Menu',
  'LS',
  'RS',
  '↑',
  '↓',
  '←',
  '→',
  'Home',
];
const PS = [
  '✕',
  '○',
  '□',
  '△',
  'L1',
  'R1',
  'L2',
  'R2',
  'Share',
  'Options',
  'L3',
  'R3',
  '↑',
  '↓',
  '←',
  '→',
  'PS',
];
const XBOX_CLASS = ['g-a', 'g-b', 'g-x', 'g-y'];
const PS_CLASS = ['g-cross', 'g-circle', 'g-square', 'g-triangle'];

export function detectFamily(id: string): DeviceKind {
  const s = id.toLowerCase();
  if (s.includes('054c') || s.includes('dualsense') || s.includes('dualshock') || s.includes('playstation')) {
    return 'playstation';
  }
  return 'xbox';
}

export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  const map: Record<string, string> = {
    Space: 'Space',
    ShiftLeft: 'Shift',
    ShiftRight: 'R-Shift',
    ControlLeft: 'Ctrl',
    Escape: 'Esc',
    Enter: 'Enter',
    Tab: 'Tab',
    Backspace: 'Bksp',
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    Mouse0: 'LMB',
    Mouse2: 'RMB',
    Equal: '+',
    Minus: '-',
    NumpadAdd: 'Num+',
    NumpadSubtract: 'Num-',
  };
  return map[code] ?? code;
}

export function padLabel(index: number, family: DeviceKind): string {
  const table = family === 'playstation' ? PS : XBOX;
  return table[index] ?? `B${index}`;
}

/** Returns an HTML snippet for a single glyph. */
export function glyphHtml(device: DeviceKind, key: string | undefined, pad: number | undefined): string {
  if (device === 'keyboard') {
    return `<span class="glyph g-key">${key ? keyLabel(key) : '—'}</span>`;
  }
  if (pad === undefined) return '<span class="glyph g-key">—</span>';
  const cls = (device === 'playstation' ? PS_CLASS : XBOX_CLASS)[pad] ?? 'g-pad';
  return `<span class="glyph ${cls}">${padLabel(pad, device)}</span>`;
}
