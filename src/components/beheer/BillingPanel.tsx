/**
 * Beheer → Facturatie, naar het ontwerp "Billing": tegels (open, betaald deze maand, achterstallig,
 * maandelijks terugkerend), links de posten (lid, omschrijving, vervaldatum, bedrag, status),
 * rechts de details met "Markeer betaald" en "Afschrijven". Op de telefoon drie tegels, de lijst
 * en een dialoog. Betalen gebeurt buiten de app; dit is het overzicht en de afvinklijst.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography, useMediaQuery, useTheme } from '@mui/material';
import { useI18n } from '../../context/I18nContext';
import { useNotify } from '../../context/NotifyContext';
import { chargesToCsv, downloadInvoicePdf, getChargesForOrg, getInvoiceLink, getMailStatus, isOverdue, markChargePaid, reopenCharge, saveChargeNote, sendInvoiceEmail, vatSplit, writeOffCharge } from '../../services/chargeService';
import { copyText, whatsappUrl } from '../../utils/share';
import { designTokens } from '../../theme/designTokens';
import type { Charge, Membership, Plan, Profile } from '../../types';

interface BillingPanelProps {
  profiles: Profile[];
  memberships: Record<string, Membership>;
  plans: Plan[];
  selfId: string;
  /** Telt op bij elke klik op "Exporteer CSV" in de kop. */
  exportSignal: number;
}

type Filter = 'open' | 'paid' | 'all';

const euro = (n: number) => `€ ${new Intl.NumberFormat('nl-NL', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n)}`;
const euro2 = (n: number) => `€ ${new Intl.NumberFormat('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`;

export function BillingPanel({ profiles, memberships, plans, selfId, exportSignal }: BillingPanelProps) {
  const { t, lang } = useI18n();
  const notify = useNotify();
  const theme = useTheme();
  const wide = useMediaQuery(theme.breakpoints.up('md'));

  const [charges, setCharges] = useState<Charge[]>([]);
  const [loading, setLoading] = useState(true);
  /** Ophalen mislukt: dan géén "nog geen posten", want die zijn er misschien wel. */
  const [loadFailed, setLoadFailed] = useState(false);
  const [filter, setFilter] = useState<Filter>('open');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [sending, setSending] = useState(false);
  const [mailReady, setMailReady] = useState(false);
  const [link, setLink] = useState<{ chargeId: string; url: string; text: string } | null>(null);

  useEffect(() => {
    void getMailStatus()
      .then((r) => setMailReady(r.configured))
      .catch(() => setMailReady(false));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setCharges(await getChargesForOrg());
      setLoadFailed(false);
    } catch (e) {
      setLoadFailed(true);
      notify.error(t('billing.failed'), e);
    } finally {
      setLoading(false);
    }
  }, [notify, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const nameOf = useCallback(
    (userId: string) => {
      const p = profiles.find((x) => x.userId === userId);
      return p ? p.displayName?.trim() || p.email || userId : userId;
    },
    [profiles]
  );

  const fmt = (iso: string, long = false) =>
    new Date(iso).toLocaleDateString(lang === 'en' ? 'en-GB' : 'nl-NL', long ? { day: 'numeric', month: 'long', year: 'numeric' } : { day: 'numeric', month: 'short' });

  // Exporteren vanuit de kop-knop.
  useEffect(() => {
    if (exportSignal === 0 || charges.length === 0) return;
    const csv = chargesToCsv(charges, nameOf);
    const blob = new Blob([String.fromCharCode(0xfeff) + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `facturatie-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exportSignal]);

  const stats = useMemo(() => {
    const now = new Date();
    const thisMonth = now.toISOString().slice(0, 7);
    const open = charges.filter((c) => c.status === 'open').reduce((s, c) => s + c.amount, 0);
    const paidMonth = charges.filter((c) => c.status === 'paid' && (c.paidAt ?? '').slice(0, 7) === thisMonth).reduce((s, c) => s + c.amount, 0);
    const overdue = charges.filter((c) => isOverdue(c)).length;
    const planById = new Map(plans.map((p) => [p.id, p]));
    const monthly = Object.values(memberships).reduce((s, m) => {
      const p = planById.get(m.planId);
      return p && p.period === 'month' ? s + p.price : s;
    }, 0);
    return { open, paidMonth, overdue, monthly };
  }, [charges, memberships, plans]);

  const visible = useMemo(() => charges.filter((c) => (filter === 'all' ? true : filter === 'open' ? c.status === 'open' : c.status === 'paid')), [charges, filter]);
  const selected = useMemo(() => charges.find((c) => c.id === selectedId) ?? null, [charges, selectedId]);

  useEffect(() => {
    setNote(selected?.note ?? '');
  }, [selected]);

  // Openbare link alvast ophalen zodra een post open staat, zodat de WhatsApp-knop een gewone link is
  // (Safari blokkeert een venster dat pas na een wachttijd opengaat).
  useEffect(() => {
    if (!selectedId) return;
    let alive = true;
    setLink(null);
    void getInvoiceLink(selectedId)
      .then((r) => {
        if (alive) setLink({ chargeId: selectedId, url: r.url, text: r.text });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [selectedId]);

  const act = async (fn: () => Promise<void>, done: string) => {
    if (!selected) return;
    setBusy(true);
    try {
      await fn();
      notify.success(done);
      await load();
      if (!wide) setSelectedId(null);
    } catch (e) {
      notify.error(t('billing.failed'), e);
    } finally {
      setBusy(false);
    }
  };

  const statusLabel = (c: Charge) => t(`billing.${c.status}`);
  const midLine = (c: Charge) => (c.status === 'paid' && c.paidAt ? t('billing.paidOn', { date: fmt(c.paidAt) }) : t('billing.dueOn', { date: fmt(c.dueAt) }));

  const tile = (value: string, label: string) => (
    <Box key={label} sx={{ flex: 1, minWidth: 0, p: 2, borderRadius: `${designTokens.cardRadius}px`, bgcolor: designTokens.cardBackground }}>
      <Typography variant="h5" sx={{ fontWeight: 600, lineHeight: 1.2 }} noWrap>
        {value}
      </Typography>
      <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
        {label}
      </Typography>
    </Box>
  );

  const tiles = (
    <Box sx={{ display: 'flex', gap: 1.5, mb: 2 }}>
      {tile(euro(stats.open), t('billing.kpi.open'))}
      {tile(euro(stats.paidMonth), wide ? t('billing.kpi.paidMonth') : t('billing.kpi.paidShort'))}
      {tile(String(stats.overdue), t('billing.kpi.overdue'))}
      {wide && tile(euro(stats.monthly), t('billing.kpi.monthly'))}
    </Box>
  );

  const filters = (
    <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
      {(['open', 'paid', 'all'] as Filter[]).map((f) => (
        <Chip
          key={f}
          label={t(`billing.filter.${f}`)}
          onClick={() => setFilter(f)}
          sx={{
            bgcolor: filter === f ? designTokens.secondaryContainer : designTokens.cardBackground,
            color: filter === f ? designTokens.onSecondaryContainer : 'text.primary',
            fontWeight: filter === f ? 600 : 400,
          }}
        />
      ))}
    </Box>
  );

  const list = (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1, minWidth: 0 }}>
      {!loading && loadFailed && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => void load()}>
              {t('common.retry')}
            </Button>
          }
        >
          {t('billing.loadFailed')}
        </Alert>
      )}
      {!loading && !loadFailed && visible.length === 0 && (
        <Box sx={{ p: 3, borderRadius: `${designTokens.cardRadius}px`, bgcolor: designTokens.cardBackground }}>
          <Typography color="text.secondary">{t('billing.empty')}</Typography>
        </Box>
      )}
      {visible.map((c) => {
        const active = selectedId === c.id;
        const overdue = isOverdue(c);
        return (
          <Box
            key={c.id}
            role="button"
            tabIndex={0}
            onClick={() => setSelectedId(c.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') setSelectedId(c.id);
            }}
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              p: 2,
              borderRadius: `${designTokens.cardRadius}px`,
              bgcolor: active ? designTokens.cardBackgroundHigh : designTokens.cardBackground,
              cursor: 'pointer',
              '&:hover': { bgcolor: designTokens.cardBackgroundHigh },
            }}
          >
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography variant="body1" fontWeight={600} noWrap>
                  {nameOf(c.userId)}
                </Typography>
                {overdue && <Chip size="small" label={t('billing.overdue')} sx={{ height: 20, fontSize: 11, bgcolor: designTokens.cardBackgroundHigh }} />}
              </Box>
              <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block' }}>
                {c.description}
              </Typography>
            </Box>
            <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
              {midLine(c)}
            </Typography>
            <Box sx={{ textAlign: 'right', flexShrink: 0, minWidth: 56 }}>
              <Typography variant="body1" fontWeight={600}>
                {euro(c.amount)}
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                {statusLabel(c)}
              </Typography>
            </Box>
          </Box>
        );
      })}
    </Box>
  );

  const field = (label: string, value: string) => (
    <TextField key={label} label={label} size="small" fullWidth value={value} InputProps={{ readOnly: true }} />
  );

  const download = async () => {
    if (!selected) return;
    setDownloading(true);
    try {
      const r = await downloadInvoicePdf(selected.id);
      notify.success(t('billing.downloaded', { number: r.invoiceNumber }));
      if (!selected.invoiceNumber) await load();
    } catch (e) {
      notify.error(t('billing.failed'), e);
    } finally {
      setDownloading(false);
    }
  };

  const send = async () => {
    if (!selected) return;
    const to = profiles.find((p) => p.userId === selected.userId)?.email?.trim();
    if (!to) {
      notify.error(t('billing.noEmail'));
      return;
    }
    setSending(true);
    try {
      const r = await sendInvoiceEmail(selected.id);
      notify.success(t('billing.sendDone', { number: r.invoiceNumber, email: r.sentTo }));
      await load();
    } catch (e) {
      notify.error(t('billing.failed'), e);
    } finally {
      setSending(false);
    }
  };

  const copyLink = async () => {
    if (!link) return;
    if (await copyText(link.url)) notify.success(t('billing.linkCopied'));
    else notify.error(t('billing.linkFailed'));
  };

  const vat = selected ? vatSplit(selected.amount, selected.vatRate) : null;

  const detail = selected && vat && (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {field(t('billing.member'), nameOf(selected.userId))}
      {field(t('billing.description'), selected.description)}
      {field(t('billing.amount'), `${euro(selected.amount)} · ${t('billing.vatLine', { rate: vat.rate, vat: euro2(vat.vat) })}`)}
      {field(t('billing.due'), fmt(selected.dueAt, true))}
      {field(t('billing.status'), selected.status === 'paid' && selected.paidAt ? `${t('billing.paid')} · ${fmt(selected.paidAt, true)}` : statusLabel(selected))}
      <TextField label={t('billing.note')} size="small" fullWidth multiline minRows={2} value={note} onChange={(e) => setNote(e.target.value)} />

      {/* Factuur: nummer, PDF, later ook versturen per mail (ontwerp "Invoice"). */}
      <Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
          {selected.invoiceNumber ? t('billing.invoiceNumber', { number: selected.invoiceNumber }) : t('billing.noInvoiceNumber')}
        </Typography>
        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
          <Button variant="outlined" disabled={downloading} onClick={() => void download()}>
            {downloading ? t('common.saving') : t('billing.downloadPdf')}
          </Button>
          <Button variant="outlined" component="a" href={link ? whatsappUrl(link.text) : undefined} target="_blank" rel="noopener noreferrer" disabled={!link || link.chargeId !== selected.id}>
            {t('billing.share')}
          </Button>
          <Button variant="outlined" disabled={!link || link.chargeId !== selected.id} onClick={() => void copyLink()}>
            {t('billing.copyLink')}
          </Button>
          <Button variant="contained" disableElevation disabled={!mailReady || sending || downloading} title={mailReady ? undefined : t('billing.emailSoon')} onClick={() => void send()}>
            {sending ? t('common.saving') : selected.invoiceSentAt ? t('billing.resend') : t('billing.sendEmail')}
          </Button>
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75, wordBreak: 'break-all' }}>
          {link && link.chargeId === selected.id ? t('billing.linkLine', { url: link.url.replace(/^https?:\/\//, '') }) : ''}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25 }}>
          {!mailReady ? t('billing.emailSoon') : selected.invoiceSentAt ? t('billing.sent', { date: fmt(selected.invoiceSentAt), email: selected.invoiceSentTo ?? '' }) : t('billing.notSent')}
        </Typography>
      </Box>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, pt: 0.5 }}>
        {selected.status === 'open' ? (
          <>
            <Button variant="contained" disableElevation disabled={busy} onClick={() => void act(() => markChargePaid(selected.id, selfId, note), t('billing.markedPaid'))}>
              {t('billing.markPaid')}
            </Button>
            <Button disabled={busy} onClick={() => void act(() => writeOffCharge(selected.id, selfId, note), t('billing.writtenOff'))}>
              {t('billing.writeOff')}
            </Button>
          </>
        ) : (
          <Button disabled={busy} onClick={() => void act(() => reopenCharge(selected.id, selfId), t('billing.reopened'))}>
            {t('billing.reopen')}
          </Button>
        )}
        {note !== (selected.note ?? '') && (
          <Button disabled={busy} onClick={() => void act(() => saveChargeNote(selected.id, note), t('common.save'))}>
            {t('billing.saveNote')}
          </Button>
        )}
      </Box>
    </Box>
  );

  if (!wide) {
    return (
      <>
        {tiles}
        {filters}
        {list}
        <Dialog open={!!selected} onClose={() => setSelectedId(null)} fullScreen>
          <DialogTitle>{selected ? nameOf(selected.userId) : ''}</DialogTitle>
          <DialogContent>
            <Box sx={{ pt: 1.5 }}>{detail}</Box>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setSelectedId(null)}>{t('common.cancel')}</Button>
          </DialogActions>
        </Dialog>
      </>
    );
  }

  return (
    <>
      {tiles}
      {filters}
      <Box sx={{ display: 'flex', gap: 2.5, alignItems: 'flex-start' }}>
        {list}
        <Box sx={{ width: 400, flexShrink: 0, p: 3, borderRadius: `${designTokens.cardRadius}px`, bgcolor: designTokens.cardBackground, position: 'sticky', top: 24 }}>
          {selected ? (
            <>
              <Typography variant="h6" sx={{ fontWeight: 600, mb: 2 }}>
                {nameOf(selected.userId)}
              </Typography>
              {detail}
            </>
          ) : (
            <Typography color="text.secondary">{t('billing.pickToView')}</Typography>
          )}
        </Box>
      </Box>
    </>
  );
}
