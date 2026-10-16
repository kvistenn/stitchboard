// Visningsindstillinger – hvordan lærredet tegnes. Huskes i browseren (pr. enhed), ikke i projektet.

export const DISPLAY_DEFAULTS = {
  cellStyle: 'pixel', // 'pixel' = firkantede felter | 'stitch' = felterne tegnes som masker (V)
  gridWidth: 1, // gitterlinjernes tykkelse i px (0 = intet gitter)
  edgeWidth: 0, // skabelonkantens tykkelse i px (0 = automatisk efter zoom)
  knitHideOutside: false, // strik-tilstand: ingen gitterlinjer eller løse kanter udenfor skabelonen
}

const KEY = 'stitchboard.display'

export function loadDisplay() {
  try {
    return { ...DISPLAY_DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }
  } catch {
    return { ...DISPLAY_DEFAULTS }
  }
}

export function saveDisplay(display) {
  try {
    localStorage.setItem(KEY, JSON.stringify(display))
  } catch {
    // privat vindue o.l. – indstillingen gælder bare indtil siden lukkes
  }
}

/** Skabelonkantens tykkelse ved feltstørrelsen cs */
export function edgeLineWidth(display, cs) {
  return display.edgeWidth > 0 ? display.edgeWidth : Math.max(2.5, Math.min(4, cs * 0.18))
}
