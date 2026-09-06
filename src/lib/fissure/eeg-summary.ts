/** Derives an EEG-only summary from a completed EEG signal analysis. */
import type { AnalysisResult } from "@/lib/eeg/pipeline";
import type { EegSummary } from "./types";

function band(a: AnalysisResult, name: string): number {
  const b = a.bandPowers.find((x) => x.band.toLowerCase().startsWith(name));
  return b ? b.absolute : 0;
}

export function toEegSummary(a: AnalysisResult): EegSummary {
  const artifacts = a.channelReports?.length
    ? a.channelReports.reduce((s, c) => s + c.artifactPercent, 0) / a.channelReports.length
    : null;
  return {
    fileName: a.fileName,
    source: a.source,
    eegChannels: a.analysedChannels ?? a.channelNames,
    timeColumn: a.timeColumn ?? null,
    samplingFrequency: a.samplingRate,
    recordingDuration: a.durationSec,
    signalQuality: a.qualityStatus,
    artifactPercent: artifacts,
    deltaPower: band(a, "delta"),
    thetaPower: band(a, "theta"),
    alphaPower: band(a, "alpha"),
    betaPower: band(a, "beta"),
    gammaPower: band(a, "gamma"),
    meanAmplitude: a.features.meanAmplitude ?? 0,
    rmsAmplitude: a.features.rms ?? 0,
    peakToPeak: a.features.p2p ?? 0,
    peakFrequency: a.features.dominantFreq ?? 0,
    totalSpectralPower: a.features.totalPower ?? 0,
  };
}
