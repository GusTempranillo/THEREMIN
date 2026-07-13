// AudioWorklet: fuente aditiva monofónica, band-limited y determinista.
class ThereminSourceProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "frequency", defaultValue: 220, minValue: 16, maxValue: 5000, automationRate: "a-rate" },
      { name: "detune", defaultValue: 0, minValue: -100, maxValue: 100, automationRate: "a-rate" },
      { name: "timbreAmplitude", defaultValue: 0, minValue: 0, maxValue: 1, automationRate: "k-rate" },
    ];
  }

  constructor() {
    super();
    this.phase = 0;
    this.fifthPhase = 0;
    this.octavePhase = 0;
    this.profile = "rca";
    this.previousProfile = "rca";
    this.fade = 1;
    this.creativeMorph = 0;
    this.port.onmessage = ({ data }) => {
      if (data.type === "profile" && data.profile !== this.profile) {
        this.previousProfile = this.profile;
        this.profile = data.profile;
        this.fade = 0;
      } else if (data.type === "creativeMorph") {
        this.creativeMorph = Math.min(1, Math.max(0, Number(data.value) || 0));
      }
    };
  }

  _pulse(phase, frequency, duty, richness, maxHarmonics = 24) {
    let value = Math.sin(phase);
    const safeNyquist = sampleRate * 0.46;
    for (let n = 2; n <= maxHarmonics; n++) {
      // Un armónico no aparece/desaparece de golpe al cruzar Nyquist: se
      // desvanece en una banda del 18 %, evitando pequeños clics tímbricos.
      const margin = safeNyquist / (frequency * n);
      if (margin <= 1) break;
      const x = Math.min(1, Math.max(0, (margin - 1) / 0.18));
      const antiAlias = x * x * (3 - 2 * x);
      const coefficient = Math.sin(Math.PI * n * duty) / (n * Math.sin(Math.PI * duty));
      value += Math.sin(n * phase) * coefficient * richness
        * Math.exp(-Math.pow(n / 18, 1.4)) * antiAlias;
    }
    return value * 0.58;
  }

  _sample(profile, phase, frequency, amplitude) {
    const octave = Math.max(0, Math.log2(frequency / 65.41));
    if (profile === "rca" || profile === "rockmore") {
      const base = profile === "rockmore" ? 0.82 : 1;
      const richness = Math.max(0.04, base * (1 - octave / 5.4)) * (0.72 + amplitude * 0.28);
      const duty = profile === "rockmore" ? 0.36 : 0.29 + Math.min(0.18, octave * 0.035);
      return this._pulse(phase, frequency, duty, richness);
    }
    if (profile === "scifi") return this._pulse(phase, frequency, 0.31, 0.92, 32);
    if (profile === "experimental") {
      let value = Math.sin(phase)
        + 0.10 * Math.sin(2 * phase)
        - 0.04 * Math.sin(3 * phase)
        + 0.24 * Math.sin(4 * phase)
        + 0.16 * Math.sin(7 * phase)
        + 0.11 * Math.sin(11 * phase);
      value += 0.14 * Math.sin(this.fifthPhase) + 0.08 * Math.sin(this.octavePhase);
      return value * 0.56;
    }
    return Math.sin(phase);
  }

  process(_inputs, outputs, parameters) {
    const output = outputs[0][0];
    const frequencyValues = parameters.frequency;
    const detuneValues = parameters.detune;
    const amplitude = parameters.timbreAmplitude[0];
    for (let i = 0; i < output.length; i++) {
      const baseFrequency = frequencyValues.length > 1 ? frequencyValues[i] : frequencyValues[0];
      const detune = detuneValues.length > 1 ? detuneValues[i] : detuneValues[0];
      const frequency = Math.min(5000, baseFrequency * Math.pow(2, detune / 1200));
      const increment = 2 * Math.PI * frequency / sampleRate;
      this.phase = (this.phase + increment) % (2 * Math.PI);
      this.fifthPhase = (this.fifthPhase + increment * 1.5) % (2 * Math.PI);
      this.octavePhase = (this.octavePhase + increment * 2.006) % (2 * Math.PI);

      const current = this._sample(this.profile, this.phase, frequency, amplitude);
      const previous = this.fade < 1
        ? this._sample(this.previousProfile, this.phase, frequency, amplitude)
        : current;
      const profileSample = previous * (1 - this.fade) + current * this.fade;
      const experimental = this.creativeMorph > 0
        ? this._sample("experimental", this.phase, frequency, amplitude)
        : profileSample;
      output[i] = profileSample * (1 - this.creativeMorph) + experimental * this.creativeMorph;
      this.fade = Math.min(1, this.fade + 1 / (sampleRate * 0.05));
    }
    return true;
  }
}

registerProcessor("theremin-source", ThereminSourceProcessor);
