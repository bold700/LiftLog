/**
 * Verwerkersovereenkomst met BOLD700 (Beheer → Instellingen): lezen, tekenen en als PDF downloaden.
 * De tekst en de ondertekening staan op de server (api/_lib/processorAgreement.mjs); de app laat ze
 * zien en stuurt het akkoord. Alleen een beheerder van de studio (server controleert).
 */
import type { User } from 'firebase/auth';
import { apiUrl } from '../utils/apiOrigin';
import { getCurrentOrgId } from './orgContext';

export interface AgreementSection {
  title: string;
  paragraphs?: string[];
  items?: string[];
}

export interface AgreementParty {
  legalName: string;
  street: string;
  postcode: string;
  city: string;
  kvk: string;
}

export interface SignedAgreement {
  version: number;
  textHash: string;
  signedAt: string;
  controller: AgreementParty;
  signer: { name: string; role: string; email: string; uid: string };
}

export interface AgreementInfo {
  version: number;
  title: string;
  processor: AgreementParty & { email: string };
  sections: AgreementSection[];
  signed: SignedAgreement | null;
  prefill: AgreementParty & { name: string };
  /** Eigenaar van de studio; alleen die tekent. Null: nog niet aangewezen. */
  owner?: { uid: string; name: string } | null;
  /** Mag de ingelogde beheerder tekenen (is hij de eigenaar)? */
  canSign?: boolean;
}

export interface SignAgreementInput {
  controller: AgreementParty;
  signer: { name: string; role: string };
}

export interface SignAgreementResult {
  signed: SignedAgreement;
  drive: 'uploaded' | 'failed' | 'not-configured';
  emailed: boolean;
}

async function call<T>(caller: User, action: string, extra: Record<string, unknown> = {}): Promise<T> {
  const token = await caller.getIdToken();
  const res = await fetch(apiUrl('/api/admin-account'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ actingOrgId: getCurrentOrgId(), action, ...extra }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string })?.error || 'Er ging iets mis. Probeer het opnieuw.');
  return data as T;
}

export const getProcessorAgreement = (caller: User) => call<AgreementInfo>(caller, 'processorAgreement');

export const signProcessorAgreement = (caller: User, version: number, input: SignAgreementInput) =>
  call<SignAgreementResult>(caller, 'signProcessorAgreement', { version, agree: true, ...input });

/** Is de getekende versie de huidige? Anders moet er opnieuw getekend worden. */
export const isAgreementCurrent = (info: Pick<AgreementInfo, 'version' | 'signed'>) => info.signed?.version === info.version;

/** De getekende overeenkomst als PDF-download. */
export async function downloadProcessorAgreementPdf(caller: User): Promise<void> {
  const { filename, pdf } = await call<{ filename: string; pdf: string }>(caller, 'processorAgreementPdf');
  const bytes = Uint8Array.from(atob(pdf), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
