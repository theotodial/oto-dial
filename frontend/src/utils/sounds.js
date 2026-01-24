/**
 * Sound Manager for OTO DIAL
 * Creates WhatsApp-style ringtones and call sounds using Web Audio API
 */

class SoundManager {
  constructor() {
    this.audioContext = null;
    this.ringtoneOscillators = [];
    this.ringbackOscillators = [];
    this.isPlayingRingtone = false;
    this.isPlayingRingback = false;
    this.ringtoneInterval = null;
    this.ringbackInterval = null;
  }

  getContext() {
    if (!this.audioContext || this.audioContext.state === 'closed') {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    // Resume if suspended (browser autoplay policy)
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
    return this.audioContext;
  }

  // WhatsApp-style incoming ringtone pattern
  // Plays a pleasant ascending melody that repeats
  playRingtoneNote(frequency, startTime, duration, volume = 0.4) {
    const ctx = this.getContext();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, startTime);
    
    // Smooth envelope
    gainNode.gain.setValueAtTime(0, startTime);
    gainNode.gain.linearRampToValueAtTime(volume, startTime + 0.02);
    gainNode.gain.setValueAtTime(volume, startTime + duration - 0.05);
    gainNode.gain.linearRampToValueAtTime(0, startTime + duration);
    
    oscillator.start(startTime);
    oscillator.stop(startTime + duration);
    
    this.ringtoneOscillators.push(oscillator);
    
    oscillator.onended = () => {
      const idx = this.ringtoneOscillators.indexOf(oscillator);
      if (idx > -1) this.ringtoneOscillators.splice(idx, 1);
    };
  }

  // WhatsApp incoming call melody
  playRingtonePattern() {
    const ctx = this.getContext();
    const now = ctx.currentTime;
    
    // WhatsApp-style melody: ascending notes with rhythm
    // Notes: E5, G5, A5, B5, C6 pattern
    const melody = [
      { freq: 659, time: 0, dur: 0.15 },      // E5
      { freq: 784, time: 0.18, dur: 0.15 },   // G5
      { freq: 880, time: 0.36, dur: 0.15 },   // A5
      { freq: 988, time: 0.54, dur: 0.2 },    // B5
      { freq: 1047, time: 0.8, dur: 0.25 },   // C6
      // Second phrase - slightly different
      { freq: 988, time: 1.2, dur: 0.15 },    // B5
      { freq: 880, time: 1.38, dur: 0.15 },   // A5
      { freq: 784, time: 1.56, dur: 0.2 },    // G5
      { freq: 880, time: 1.82, dur: 0.3 },    // A5
    ];

    melody.forEach(note => {
      this.playRingtoneNote(note.freq, now + note.time, note.dur);
    });
  }

  startRingtone() {
    if (this.isPlayingRingtone) return;
    this.isPlayingRingtone = true;
    
    // Play immediately
    this.playRingtonePattern();
    
    // Repeat every 2.5 seconds
    this.ringtoneInterval = setInterval(() => {
      if (this.isPlayingRingtone) {
        this.playRingtonePattern();
      }
    }, 2500);
  }

  stopRingtone() {
    this.isPlayingRingtone = false;
    
    if (this.ringtoneInterval) {
      clearInterval(this.ringtoneInterval);
      this.ringtoneInterval = null;
    }
    
    // Stop all active oscillators
    this.ringtoneOscillators.forEach(osc => {
      try { osc.stop(); } catch (e) {}
    });
    this.ringtoneOscillators = [];
  }

  // Ringback tone (what caller hears while waiting)
  // Standard US ringback: dual tone 440Hz + 480Hz
  playRingbackTone() {
    const ctx = this.getContext();
    const now = ctx.currentTime;
    const duration = 2; // 2 seconds on
    
    [440, 480].forEach(freq => {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(freq, now);
      
      gainNode.gain.setValueAtTime(0.15, now);
      gainNode.gain.setValueAtTime(0.15, now + duration - 0.05);
      gainNode.gain.linearRampToValueAtTime(0, now + duration);
      
      oscillator.start(now);
      oscillator.stop(now + duration);
      
      this.ringbackOscillators.push(oscillator);
      
      oscillator.onended = () => {
        const idx = this.ringbackOscillators.indexOf(oscillator);
        if (idx > -1) this.ringbackOscillators.splice(idx, 1);
      };
    });
  }

  startRingback() {
    if (this.isPlayingRingback) return;
    this.isPlayingRingback = true;
    
    // Play immediately
    this.playRingbackTone();
    
    // US ringback pattern: 2s on, 4s off
    this.ringbackInterval = setInterval(() => {
      if (this.isPlayingRingback) {
        this.playRingbackTone();
      }
    }, 6000);
  }

  stopRingback() {
    this.isPlayingRingback = false;
    
    if (this.ringbackInterval) {
      clearInterval(this.ringbackInterval);
      this.ringbackInterval = null;
    }
    
    this.ringbackOscillators.forEach(osc => {
      try { osc.stop(); } catch (e) {}
    });
    this.ringbackOscillators = [];
  }

  // Call connected sound - pleasant double beep
  playConnected() {
    const ctx = this.getContext();
    const now = ctx.currentTime;
    
    [0, 0.12].forEach((offset, i) => {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(i === 0 ? 1200 : 1500, now + offset);
      
      gainNode.gain.setValueAtTime(0, now + offset);
      gainNode.gain.linearRampToValueAtTime(0.3, now + offset + 0.02);
      gainNode.gain.linearRampToValueAtTime(0, now + offset + 0.1);
      
      oscillator.start(now + offset);
      oscillator.stop(now + offset + 0.1);
    });
  }

  // Call ended sound - descending tone
  playEnded() {
    const ctx = this.getContext();
    const now = ctx.currentTime;
    
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(600, now);
    oscillator.frequency.linearRampToValueAtTime(300, now + 0.4);
    
    gainNode.gain.setValueAtTime(0.25, now);
    gainNode.gain.linearRampToValueAtTime(0, now + 0.4);
    
    oscillator.start(now);
    oscillator.stop(now + 0.4);
  }

  // Dialpad DTMF tones
  playDTMF(digit) {
    const dtmfFrequencies = {
      '1': [697, 1209], '2': [697, 1336], '3': [697, 1477],
      '4': [770, 1209], '5': [770, 1336], '6': [770, 1477],
      '7': [852, 1209], '8': [852, 1336], '9': [852, 1477],
      '*': [941, 1209], '0': [941, 1336], '#': [941, 1477]
    };

    const freqs = dtmfFrequencies[digit];
    if (!freqs) return;

    const ctx = this.getContext();
    const now = ctx.currentTime;
    const duration = 0.15;

    freqs.forEach(freq => {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(freq, now);
      
      gainNode.gain.setValueAtTime(0.2, now);
      gainNode.gain.linearRampToValueAtTime(0, now + duration);
      
      oscillator.start(now);
      oscillator.stop(now + duration);
    });
  }

  // Stop all sounds
  stopAll() {
    this.stopRingtone();
    this.stopRingback();
  }
}

// Singleton instance
export const soundManager = new SoundManager();
export default soundManager;
