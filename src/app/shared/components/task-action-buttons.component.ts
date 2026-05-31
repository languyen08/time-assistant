import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-task-action-buttons',
  standalone: true,
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
        <button type="button" class="secondary-button" (click)="addTime.emit()">
          +{{ extensionMinutes() }}m
        </button>
      }
      <button type="button" class="primary-button" (click)="complete.emit()">
        {{ sticky() ? 'Done' : 'Complete task' }}
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
