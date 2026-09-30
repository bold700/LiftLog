/**
 * Support van BOLD700: een account op @bold700.com. Is beheerder in een studio om te helpen, maar
 * nooit eigenaar en tekent nooit namens de studio. Zelfde regel als api/_lib/studioOwner.mjs; de
 * server controleert op het adres uit Firebase Auth, de app gebruikt dit alleen voor het label.
 */
export const SUPPORT_DOMAIN = 'bold700.com';

export const isSupportEmail = (email: string | null | undefined): boolean =>
  String(email ?? '').trim().toLowerCase().endsWith(`@${SUPPORT_DOMAIN}`);
