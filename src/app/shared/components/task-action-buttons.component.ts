import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-task-action-buttons',
  standalone: true,
  host: {
    class: 'task-action-buttons-host',
  },
  styles: `
    :host {
      display: block;
      width: 100%;
      pointer-events: auto;
      -webkit-app-region: no-drag;
    }

    :host * {
      -webkit-app-region: no-drag;
    }

    .button-row {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    button {
      min-height: 40px;
      padding: 9px 13px;
      border: 1px solid rgba(91, 70, 42, 0.2);
      border-radius: 8px;
      cursor: pointer;
      color: inherit;
      font: inherit;
      font-weight: 800;
      transition:
        transform 120ms ease,
        box-shadow 120ms ease,
        background 120ms ease,
        color 120ms ease;
    }

    button:disabled {
      cursor: not-allowed;
      opacity: 0.45;
    }

    button:focus-visible {
      outline: 3px solid color-mix(in srgb, var(--primary, #9b3f19) 42%, transparent);
      outline-offset: 2px;
    }

    .primary-button {
      border-color: color-mix(in srgb, var(--primary, #9b3f19) 70%, black);
      background: linear-gradient(#d87536, var(--primary, #9b3f19));
      color: #fffaf2;
      box-shadow:
        0 4px 10px rgba(111, 44, 16, 0.24),
        inset 0 1px 0 rgba(255, 255, 255, 0.35);
    }

    .secondary-button {
      background: linear-gradient(
        var(--surface-raised, rgba(255, 255, 255, 0.92)),
        var(--surface-muted, rgba(239, 227, 207, 0.92))
      );
      color: var(--text, #211c18);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.45);
    }

    .sticky-action-row {
      flex-wrap: nowrap;
      align-items: center;
      gap: 8px;
    }

    .sticky-action-row > button {
      flex: 1 1 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 0;
      min-height: 38px;
      padding: 8px 10px;
      border-radius: 12px;
      border-color: var(--note-line, rgba(78, 67, 36, 0.18));
      font-size: 0.88rem;
      font-weight: 700;
      letter-spacing: 0.01em;
      line-height: 1.1;
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.34),
        0 5px 12px rgba(30, 28, 22, 0.08);
    }

    .sticky-action-row > .sticky-time-button {
      flex: 0.82 1 0;
    }

    .sticky-action-row > .sticky-complete-button {
      flex: 1.18 1 0;
      gap: 6px;
      justify-content: center;
      font-size: 0.78rem;
      flex-wrap: nowrap;
      white-space: nowrap;
    }

    .sticky-action-row > .secondary-button {
      background: linear-gradient(
        180deg,
        rgba(255, 255, 255, 0.42),
        rgba(255, 255, 255, 0.2)
      );
      color: var(--note-text, #2f2818);
    }

    .sticky-action-row > .primary-button {
      border-color: rgba(204, 125, 57, 0.86);
      background: linear-gradient(180deg, #e59a4d, #cf7d36);
      color: #fffdf9;
      box-shadow:
        0 12px 22px rgba(162, 94, 34, 0.18),
        inset 0 1px 0 rgba(255, 255, 255, 0.22);
    }

    .sticky-complete-button-icon {
      width: 20px;
      height: 20px;
      border-radius: 999px;
      display: grid;
      place-items: center;
      flex: 0 0 auto;
      background: rgba(255, 255, 255, 0.96);
      color: #cf7d36;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 1);
    }

    .sticky-complete-button-icon svg {
      display: block;
    }

    .sticky-complete-button > span:last-child {
      white-space: nowrap;
    }

    .sticky-action-row > button:hover:not(:disabled),
    .sticky-action-row > button:focus-visible:not(:disabled) {
      transform: translateY(-1px);
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.4),
        0 8px 16px rgba(30, 28, 22, 0.12);
    }

    .sticky-action-row > button:active:not(:disabled) {
      transform: translateY(0);
      box-shadow:
        inset 0 2px 5px rgba(30, 28, 22, 0.14),
        0 2px 6px rgba(30, 28, 22, 0.08);
    }
  `,
  template: `
    <div class="button-row" [class.sticky-action-row]="sticky()">
      @if (paused()) {
        <button type="button" class="primary-button" (click)="resume.emit()">
          {{ sticky() ? 'Resume' : 'Resume task' }}
        </button>
      } @else {
        <button type="button" class="secondary-button" (click)="pause.emit()">
          {{ sticky() ? 'Pause' : 'Pause task' }}
        </button>
      }
      @if (sticky()) {
        <button type="button" class="secondary-button sticky-time-button" (click)="addTime.emit()">
          +{{ extensionMinutes() }}m
        </button>
      }
      <button
        type="button"
        class="primary-button"
        [class.sticky-complete-button]="sticky()"
        (click)="complete.emit()"
      >
        @if (sticky()) {
          <span class="sticky-complete-button-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none">
              <path
                d="m6.8 12.5 3.2 3.2 7-7"
                stroke="currentColor"
                stroke-width="2.4"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </span>
        }
        <span>Complete task</span>
      </button>
    </div>
  `,
})
export class TaskActionButtonsComponent {
  readonly paused = input.required<boolean>();
  readonly sticky = input(false);
  readonly extensionMinutes = input(10);

  readonly pause = output<void>();
  readonly resume = output<void>();
  readonly addTime = output<void>();
  readonly complete = output<void>();
}
