/**
 * Naar de bovenkant van de pagina. Op de telefoon scrolt niet het document maar het scrollende
 * deel van de schil (.mobile-scroll in AppShell); op desktop het venster.
 */
export function scrollPageToTop(): void {
  const shell = document.querySelector<HTMLElement>('.mobile-scroll');
  if (shell) shell.scrollTo({ top: 0, behavior: 'smooth' });
  else window.scrollTo({ top: 0, behavior: 'smooth' });
}
