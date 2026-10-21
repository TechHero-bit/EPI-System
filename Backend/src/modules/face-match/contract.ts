export interface FaceMatchProvider {
  readonly mode: "ONE_TO_ONE";
  readonly supportsLiveness: true;
  enroll(input: {
    employeeId: string;
    consentReference: string;
    captureSessionId: string;
  }): Promise<{ providerReference: string; expiresAt: string }>;
  verify(input: {
    providerReference: string;
    livenessSessionId: string;
  }): Promise<{
    matched: boolean;
    livenessPassed: boolean;
    transactionId: string;
  }>;
  revoke(providerReference: string): Promise<void>;
}
// Não há implementação fictícia que aprove identidades. O endpoint retorna 503.
