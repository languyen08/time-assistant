# Windows taskbar icon verification

The white document icon was reproduced on the actual Windows taskbar, even
though the executable's embedded icon, packaged ICO, window icon handles, and
relaunch properties were valid. Correcting property order alone did not resolve
the visible problem.

Controlled visual checks showed:

| Configuration                                      | Taskbar result                |
| -------------------------------------------------- | ----------------------------- |
| Original window AppUserModelID                     | White document                |
| Original ID with the scheduler branded             | White document                |
| Original ID with the taskbar button re-registered  | White document                |
| Original ID with the scheduler in a separate group | White document                |
| Fresh window ID using the same executable icon     | Correct blue icon, repeatedly |

The failing shell resolution is associated with the original taskbar identity.
The fix uses a stable window-level identity,
`local.assistant-time.time-assistant.Desktop`, for Main, Sticky Note, and Guide.
The process identity remains `local.assistant-time.time-assistant`, matching
Electron Builder and preserving notification and Windows-login identity. This
window override is intentional; it is not a mismatch in the packaging config.
Windows permits a window-level AppUserModelID to override the process identity:
[Microsoft's AppUserModelID documentation](https://learn.microsoft.com/en-us/windows/win32/shell/appids).

The visible windows receive their icons and relaunch properties before the
window AppUserModelID is set and before they are shown. Relaunch targets the
original portable launcher from `PORTABLE_EXECUTABLE_FILE`, or `process.execPath`
in an unpacked build. All visible windows use the same desktop identity, so they
remain grouped. The hidden scheduler still skips the taskbar.

Packaging remains Electron Builder's portable target with ASAR enabled. Icon
assets, Angular behavior, dependencies, user-data paths, and startup settings are
unchanged. The diagnostic Start Menu shortcut was removed; the fix creates no
shortcuts or system-wide cache changes.

## Validation

- All 50 project Electron tests pass, including startup/login and window lifecycle.
- Main-process syntax and formatting pass.
- The packaged main process is checked against the source.
- Native checks verify all three visible windows' icons, desktop identity,
  relaunch properties, and initialization order; the process identity is checked
  separately to ensure it stays unchanged.
- Actual taskbar screenshots distinguish visual correctness from valid native
  handles or property-store values. The rebuilt unpacked application and two
  launches of `release/Time Assistant.exe` visibly showed the correct blue icon
  on the desktop taskbars. All three visible windows shared the desktop identity.
- The user confirmed the rebuilt portable application displays the correct icon.

## Manual checks

1. Quit the previous application through its tray menu and launch the rebuilt
   `release/Time Assistant.exe` from a stable folder.
2. Check the blue taskbar icon for Sticky Note, Main, and Guide, including their
   combined taskbar group.
3. Pin the running application, quit it, and launch from the pin. The pin should
   target the portable launcher, not a deleted extraction directory.
4. Recreate any pin made with the old taskbar identity. Moving the portable
   executable also requires updating its pin.
5. Check display scaling at 100%, 150%, and 200% when available. The scheduler
   should never add a taskbar button.
