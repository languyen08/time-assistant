import { Injectable, inject } from '@angular/core';
import { ActiveReminder } from '../models/reminder';
import { AppSettings } from '../models/app-settings';
import { ElectronBridgeService } from './electron-bridge.service';

const FRIENDLY_MESSAGES = [
  'A gentle check-in for your current task.',
  'Still with this one? You can keep going or wrap it up.',
  'Time for a calm decision: continue, pause, or complete.',
  'Your reminder is here. Choose the next step that fits.',
];

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly electron = inject(ElectronBridgeService);
  private audioContext: AudioContext | undefined;

  messageFor(reminder: ActiveReminder): string {
    return reminder.message;
  }

  randomFriendlyMessage(): string {
    return FRIENDLY_MESSAGES[Math.floor(Math.random() * FRIENDLY_MESSAGES.length)];
  }

  async showReminder(reminder: ActiveReminder, settings: AppSettings): Promise<void> {
    const body = this.messageFor(reminder);
    await this.electron.notify(reminder.taskName, body);

    if (settings.notificationSoundEnabled) {
      this.playSoftSound();
    }
  }

  async showBreakComplete(settings: AppSettings): Promise<void> {
    await this.electron.notify(
      'Break complete',
      'Ready when you are. You can start the next task or take a moment.',
    );
    if (settings.notificationSoundEnabled) {
      this.playSoftSound();
    }
  }

  private playSoftSound(): void {
    try {
      this.audioContext ??= new AudioContext();
      const oscillator = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(660, this.audioContext.currentTime);
      gain.gain.setValueAtTime(0.001, this.audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.08, this.audioContext.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.45);
      oscillator.connect(gain);
      gain.connect(this.audioContext.destination);
      oscillator.start();
      oscillator.stop(this.audioContext.currentTime + 0.48);
    } catch {
      // Sound is a nice-to-have reminder cue; failures should not block the reminder.
    }
  }
}
