export interface RecordingResult {
  buffer: AudioBuffer;
  sampleRate: number;
}

export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private audioCtx: AudioContext;

  constructor() {
    this.audioCtx = new AudioContext();
  }

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { sampleRate: 44100, channelCount: 1, echoCancellation: true },
    });
    this.chunks = [];
    this.mediaRecorder = new MediaRecorder(this.stream);
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.mediaRecorder.start(100);
  }

  stop(): Promise<RecordingResult> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder) return reject(new Error('Not recording'));
      this.mediaRecorder.onstop = async () => {
        try {
          const blob = new Blob(this.chunks, { type: 'audio/webm' });
          const arrayBuffer = await blob.arrayBuffer();
          const buffer = await this.audioCtx.decodeAudioData(arrayBuffer);
          this.stream?.getTracks().forEach((t) => t.stop());
          resolve({ buffer, sampleRate: buffer.sampleRate });
        } catch (err) {
          reject(err);
        }
      };
      this.mediaRecorder.stop();
    });
  }

  getAudioContext(): AudioContext {
    return this.audioCtx;
  }

  /** Decode an ArrayBuffer (e.g. from fetch) into an AudioBuffer */
  async decodeArrayBuffer(arrayBuffer: ArrayBuffer): Promise<RecordingResult> {
    const buffer = await this.audioCtx.decodeAudioData(arrayBuffer);
    return { buffer, sampleRate: buffer.sampleRate };
  }
}
