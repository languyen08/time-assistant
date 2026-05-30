import { Injectable } from '@angular/core';
import { ChartConfiguration } from 'chart.js';
import { HistoryEvent } from '../models/history-event';
import { Task } from '../models/task';

@Injectable({ providedIn: 'root' })
export class ChartSummaryService {
  readonly chartOptions: ChartConfiguration<'bar'>['options'] = {
    responsive: true,
    maintainAspectRatio: true,
    aspectRatio: 1.8,
    scales: {
      y: {
        beginAtZero: true,
        ticks: { precision: 0 },
      },
    },
    plugins: {
      legend: { display: false },
    },
  };

  completedTasksPerDay(tasks: Task[]): ChartConfiguration<'bar'>['data'] {
    const counts = new Map<string, number>();
    for (const task of tasks) {
      if (task.status === 'completed' && task.completedAt) {
        const day = this.dayKey(task.completedAt);
        counts.set(day, (counts.get(day) ?? 0) + 1);
      }
    }

    return this.barData(counts, 'Completed tasks', '#526f62');
  }

  focusMinutesPerDay(tasks: Task[]): ChartConfiguration<'bar'>['data'] {
    const minutes = new Map<string, number>();
    for (const task of tasks) {
      if (task.status !== 'completed' || !task.activeStartedAt || !task.completedAt) {
        continue;
      }

      const elapsedSeconds = Math.max(
        0,
        Math.floor(
          (new Date(task.completedAt).getTime() - new Date(task.activeStartedAt).getTime()) / 1000,
        ) - (task.totalPausedSeconds ?? 0),
      );
      const day = this.dayKey(task.completedAt);
      minutes.set(day, (minutes.get(day) ?? 0) + Math.round(elapsedSeconds / 60));
    }

    return this.barData(minutes, 'Focus minutes', '#9b3f19');
  }

  focusMinutesByCategory(tasks: Task[]): ChartConfiguration<'bar'>['data'] {
    const minutes = new Map<string, number>();
    for (const task of tasks) {
      if (task.status !== 'completed' || !task.activeStartedAt || !task.completedAt) {
        continue;
      }

      const category = task.category || 'Unsorted';
      const elapsedSeconds = Math.max(
        0,
        Math.floor(
          (new Date(task.completedAt).getTime() - new Date(task.activeStartedAt).getTime()) / 1000,
        ) - (task.totalPausedSeconds ?? 0),
      );
      minutes.set(category, (minutes.get(category) ?? 0) + Math.round(elapsedSeconds / 60));
    }

    return this.barData(minutes, 'Focus minutes', '#d87536');
  }

  reminderSummary(events: HistoryEvent[]): ChartConfiguration<'bar'>['data'] {
    const counts = new Map<string, number>([
      ['Reminders', 0],
      ['Extensions', 0],
    ]);
    for (const event of events) {
      if (event.type === 'reminder_shown') {
        counts.set('Reminders', (counts.get('Reminders') ?? 0) + 1);
      }

      if (event.type === 'extra_time_added') {
        counts.set('Extensions', (counts.get('Extensions') ?? 0) + 1);
      }
    }

    return this.barData(counts, 'Count', '#6f5a32');
  }

  private barData(
    values: Map<string, number>,
    label: string,
    color: string,
  ): ChartConfiguration<'bar'>['data'] {
    const entries = [...values.entries()].sort(([first], [second]) => first.localeCompare(second));
    return {
      labels: entries.map(([key]) => key),
      datasets: [
        {
          label,
          data: entries.map(([, value]) => value),
          backgroundColor: color,
          borderColor: color,
          borderWidth: 1,
          borderRadius: 6,
        },
      ],
    };
  }

  private dayKey(isoDate: string): string {
    return new Date(isoDate).toISOString().slice(0, 10);
  }
}
