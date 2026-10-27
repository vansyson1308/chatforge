let audio: AudioContext | undefined;
let muted = true,
  last = 0;
export function toggleAudio(): boolean {
  muted = !muted;
  if (!muted) {
    audio ??= new AudioContext();
    void audio.resume();
  }
  return muted;
}
export function cue(name: string): void {
  if (
    muted ||
    !audio ||
    audio.state !== "running" ||
    performance.now() - last < 120
  )
    return;
  last = performance.now();
  const osc = audio.createOscillator(),
    gain = audio.createGain(),
    start = audio.currentTime;
  osc.type =
    name === "anvil" ? "triangle" : name === "thunder" ? "sawtooth" : "sine";
  osc.frequency.setValueAtTime(
    name === "anvil" ? 880 : name === "thunder" ? 100 : 440,
    start,
  );
  osc.frequency.exponentialRampToValueAtTime(
    name === "cheer" ? 880 : 70,
    start + 0.3,
  );
  gain.gain.setValueAtTime(0.07, start);
  gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35);
  osc.connect(gain);
  gain.connect(audio.destination);
  osc.start(start);
  osc.stop(start + 0.36);
}
