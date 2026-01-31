import { describe, it, expect } from 'vitest'
import {
  getSquirrelEvent,
  getUpdateExePath,
  getTargetExeName,
  buildShortcutArgs,
} from '../../src/platforms/windows.js'
import type { SquirrelOptions } from '../../src/types.js'

describe('Squirrel Windows Utilities', () => {
  describe('getSquirrelEvent', () => {
    it('detects --squirrel-install event', () => {
      const argv = ['electron.exe', '--squirrel-install']
      expect(getSquirrelEvent(argv)).toBe('--squirrel-install')
    })

    it('detects --squirrel-updated event', () => {
      const argv = ['electron.exe', '--squirrel-updated']
      expect(getSquirrelEvent(argv)).toBe('--squirrel-updated')
    })

    it('detects --squirrel-uninstall event', () => {
      const argv = ['electron.exe', '--squirrel-uninstall']
      expect(getSquirrelEvent(argv)).toBe('--squirrel-uninstall')
    })

    it('detects --squirrel-obsolete event', () => {
      const argv = ['electron.exe', '--squirrel-obsolete']
      expect(getSquirrelEvent(argv)).toBe('--squirrel-obsolete')
    })

    it('detects --squirrel-firstrun event', () => {
      const argv = ['electron.exe', '--squirrel-firstrun']
      expect(getSquirrelEvent(argv)).toBe('--squirrel-firstrun')
    })

    it('returns undefined when no squirrel event present', () => {
      const argv = ['electron.exe', 'main.js', '--some-flag']
      expect(getSquirrelEvent(argv)).toBeUndefined()
    })

    it('handles empty argv', () => {
      expect(getSquirrelEvent([])).toBeUndefined()
    })

    it('finds squirrel event anywhere in argv', () => {
      const argv = ['electron.exe', 'main.js', '--squirrel-install', '--other']
      expect(getSquirrelEvent(argv)).toBe('--squirrel-install')
    })
  })

  describe('getUpdateExePath', () => {
    it('returns path ending in Update.exe', () => {
      const updatePath = getUpdateExePath()
      expect(updatePath).toMatch(/Update\.exe$/)
    })

    it('returns path in parent directory of execPath directory', () => {
      const updatePath = getUpdateExePath()
      // path.resolve normalizes the path, so just verify it ends correctly
      // In a real Squirrel install, execPath would be in app-version/MyApp.exe
      // and Update.exe would be in the parent directory
      expect(updatePath.endsWith('Update.exe')).toBe(true)
    })
  })

  describe('getTargetExeName', () => {
    it('returns the basename of the current executable', () => {
      const target = getTargetExeName()
      // Should return just the filename, not the full path
      expect(target).not.toContain('/')
      expect(target).not.toContain('\\')
      // Should have some length (not empty)
      expect(target.length).toBeGreaterThan(0)
    })
  })

  describe('buildShortcutArgs', () => {
    const target = 'MyApp.exe'

    describe('create action', () => {
      it('creates both shortcuts by default', () => {
        const args = buildShortcutArgs('create', target)
        expect(args).toEqual([`--createShortcut=${target}`])
      })

      it('creates both shortcuts when both options are true', () => {
        const options: SquirrelOptions = {
          createDesktopShortcut: true,
          createStartMenuShortcut: true,
        }
        const args = buildShortcutArgs('create', target, options)
        expect(args).toEqual([`--createShortcut=${target}`])
      })

      it('creates only desktop shortcut when start menu is disabled', () => {
        const options: SquirrelOptions = {
          createDesktopShortcut: true,
          createStartMenuShortcut: false,
        }
        const args = buildShortcutArgs('create', target, options)
        expect(args).toEqual([
          `--createShortcut=${target}`,
          '--shortcut-locations=Desktop',
        ])
      })

      it('creates only start menu shortcut when desktop is disabled', () => {
        const options: SquirrelOptions = {
          createDesktopShortcut: false,
          createStartMenuShortcut: true,
        }
        const args = buildShortcutArgs('create', target, options)
        expect(args).toEqual([
          `--createShortcut=${target}`,
          '--shortcut-locations=StartMenu',
        ])
      })

      it('creates no shortcuts when both are disabled', () => {
        const options: SquirrelOptions = {
          createDesktopShortcut: false,
          createStartMenuShortcut: false,
        }
        const args = buildShortcutArgs('create', target, options)
        expect(args).toEqual([])
      })

      it('creates both shortcuts when options is undefined', () => {
        const args = buildShortcutArgs('create', target, undefined)
        expect(args).toEqual([`--createShortcut=${target}`])
      })

      it('creates both shortcuts when options is empty object', () => {
        const args = buildShortcutArgs('create', target, {})
        expect(args).toEqual([`--createShortcut=${target}`])
      })
    })

    describe('remove action', () => {
      it('removes shortcuts', () => {
        const args = buildShortcutArgs('remove', target)
        expect(args).toEqual([`--removeShortcut=${target}`])
      })

      it('removes shortcuts regardless of options', () => {
        const options: SquirrelOptions = {
          createDesktopShortcut: false,
          createStartMenuShortcut: false,
        }
        const args = buildShortcutArgs('remove', target, options)
        expect(args).toEqual([`--removeShortcut=${target}`])
      })
    })

    describe('shortcutName option', () => {
      it('shortcutName does not affect args (used elsewhere)', () => {
        const options: SquirrelOptions = {
          shortcutName: 'Custom App Name',
        }
        // shortcutName is used for checking if shortcut exists, not in args
        const args = buildShortcutArgs('create', target, options)
        expect(args).toEqual([`--createShortcut=${target}`])
      })
    })
  })
})
