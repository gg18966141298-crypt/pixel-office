import type { EngineInterface, Register, ThemeSetArgs } from 'claude-code'

import { makeColors } from './make-colors.js'
import { SCENE } from './scene'

const DARK = '@media (prefers-color-scheme:dark){'

// Pixel office: sunny pink-white wall by day, lamp-lit slate blue by night.
// The scene picks day or night itself from prefers-color-scheme.
const DEF = {
  label: 'Pixel Office',
  roles: { accent: '#d9663a', danger: '#c0392b', success: '#4f8f3a', warning: '#b7791f', pro: '#7a5aa6' },
  light: {
    gray: {
      anchors: {
        'surface-0': '#ece5e4',
        'surface-1': '#f4efee',
        'surface-2': '#faf7f6',
        'surface-3': '#faf7f6',
        'text-primary': '#2b2523',
        'text-secondary': '#564b47',
        'text-muted': '#6d615c',
      },
    },
  },
  dark: {
    gray: {
      anchors: {
        'surface-0': '#24263a',
        'surface-1': '#282b40',
        'surface-2': '#2c2f45',
        'surface-3': '#30334a',
        'text-primary': '#efecf4',
        'text-secondary': '#cbc7d8',
        'text-muted': '#a8a4ba',
      },
    },
  },
} as const

type Mode = 'auto' | 'day' | 'night'

const MODES: Record<Mode, { look: ThemeSetArgs; problems: string[]; source: string }> = {
  auto: build(makeColors(DEF), 'auto', SCENE),
  day: build(makeColors({ ...DEF, only: 'light' }), 'day', SCENE.replace(DARK, '@media not all{'), 'light'),
  night: build(makeColors({ ...DEF, only: 'dark' }), 'night', SCENE.replace(DARK, '@media all{'), 'dark'),
}

function build(
  made: ReturnType<typeof makeColors>,
  mode: Mode,
  source: string,
  scheme?: 'light' | 'dark',
): { look: ThemeSetArgs; problems: string[]; source: string } {
  const look: ThemeSetArgs = {
    colors: made.theme,
    backdrop: { scene: `pixel-office-${mode}`, glass: { blur: 10, opacity: 0.55 } },
  }
  if (scheme !== undefined) {
    look.overrideColorScheme = scheme
  }
  return { look, problems: made.problems, source }
}

// Follows the app's light/dark setting; /office night or /office day pins one.
let mode: Mode = 'auto'

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'office',
      description: 'Pixel Office: night, day, or auto (follow the app)',
    })
    await apply($)

    return next(e)
  })

  on('command.run', { command: 'office' }, async ($, e) => {
    const want = e.args.trim().toLowerCase()
    const next: Mode | undefined =
      want === 'night' || want === '夜' || want === '夜间' ? 'night'
      : want === 'day' || want === '日' || want === '白天' ? 'day'
      : want === 'auto' || want === '自动' ? 'auto'
      : undefined
    if (next === undefined) {
      return { text: `Pixel Office is on ${mode}. Use /office night, /office day or /office auto.` }
    }
    mode = next
    await apply($)

    return { text: `Pixel Office: ${mode}.` }
  })

  on('ui.render', { component: 'Backdrop' }, ($, e, next) => {
    const which = e.props.scene.replace('pixel-office-', '')
    if ((e.surface !== 'desktop' && e.surface !== 'mobile') || !(which in MODES)) {
      return next(e)
    }
    const { Svg } = $.ui.resolve(e)

    return <Svg source={MODES[which as Mode].source} alt="像素风办公室：阳光白天 / 台灯夜晚" isInteractive />
  })
}

async function apply($: EngineInterface): Promise<void> {
  const chosen = MODES[mode]
  const unpainted = chosen.problems.find(line => line.startsWith("Desktop won't paint"))
  if (unpainted !== undefined) {
    $.ui.toast(unpainted)
  }
  const set = await $.theme.set(chosen.look)
  if (!set.isDrawn) {
    $.ui.status(set.reason)
  }
}
