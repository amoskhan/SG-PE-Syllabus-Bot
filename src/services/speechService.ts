/**
 * Speech Synthesis Helper for Classroom Audio Guidance
 * Supports younger or clueless students with friendly, clear spoken cues.
 */

class SpeechPromptService {
  private isEnabled: boolean = true;
  private voice: SpeechSynthesisVoice | null = null;

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = () => {
        const voices = window.speechSynthesis.getVoices();
        // Prefer natural English voices (Singapore or UK/US clear child-friendly voices)
        this.voice =
          voices.find(v => v.lang === 'en-SG') ||
          voices.find(v => v.name.includes('Samantha') || v.name.includes('Karen') || v.name.includes('Daniel')) ||
          voices.find(v => v.lang.startsWith('en')) ||
          null;
      };
    }
  }

  public setEnabled(enabled: boolean) {
    this.isEnabled = enabled;
    if (!enabled && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  public speak(text: string, rate: number = 0.95, pitch: number = 1.05) {
    if (!this.isEnabled || typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return;
    }

    try {
      window.speechSynthesis.cancel(); // Stop any pending utterance
      const utterance = new SpeechSynthesisUtterance(text);
      if (this.voice) {
        utterance.voice = this.voice;
      }
      utterance.rate = rate; // Slightly slower for clarity
      utterance.pitch = pitch; // Friendly slightly higher pitch for young students
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('Speech synthesis error:', e);
    }
  }
}

export const speechService = new SpeechPromptService();
