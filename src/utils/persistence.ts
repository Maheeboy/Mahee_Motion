export interface RecoveryCandidate {
  id: string;
  updatedAt: string;
}

export function shouldOfferRecovery(recoveryUpdatedAt: string, lastManualSaveAt?: string): boolean {
  if (!lastManualSaveAt) return true;
  return Number(recoveryUpdatedAt) > Date.parse(lastManualSaveAt);
}

export function sortRecoveryCandidates<T extends RecoveryCandidate>(recoveries: T[]): T[] {
  return [...recoveries].sort((left, right) => Number(right.updatedAt) - Number(left.updatedAt));
}
