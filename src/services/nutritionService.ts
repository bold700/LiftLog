/**
 * Voeding-tracking (prototype).
 * - Zoeken via /api/food-search (Open Food Facts), met eigen basisproducten bovenaan.
 * - Loggen per account in Firestore `nutritionLogs` (zoals training-logs), zodat de
 *   trainer straks per klant de dagtotalen ziet.
 */
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../firebase/config';
import { requireOrgId } from './orgContext';
import { apiUrl } from '../utils/apiOrigin';
import { authHeaders } from '../utils/authHeaders';

export interface FoodProduct {
  code: string;
  name: string;
  brand: string;
  imageUrl: string | null;
  /** Voedingswaarden per 100 g. */
  per100g: { kcal: number; protein: number; carbs: number; fat: number };
  /** Portiegrootte in gram indien bekend (bv. "30 g"). */
  servingGrams: number | null;
  /** Verkocht in Nederland volgens Open Food Facts. Zulke producten staan hoger in de lijst. */
  nl?: boolean;
  /** Inhoud van de verpakking in gram ("450 g"), voor de portie "hele verpakking". */
  packageGrams?: number | null;
  /** Grotere foto voor het productscherm; `imageUrl` is de kleine voor in de lijst. */
  imageLargeUrl?: string | null;
  nutriscore?: 'a' | 'b' | 'c' | 'd' | 'e' | null;
  /** Wat het etiket verder zegt, per 100 g. Null als er niets van bekend is. */
  details?: { sugars: number | null; fiber: number | null; saturatedFat: number | null; salt: number | null } | null;
}

/** Bij welk moment van de dag iets is gegeten. */
export type MealMoment = 'ontbijt' | 'lunch' | 'diner' | 'tussendoor';
export const MEAL_ORDER: MealMoment[] = ['ontbijt', 'lunch', 'diner', 'tussendoor'];
export const MEAL_LABELS: Record<MealMoment, string> = { ontbijt: 'Ontbijt', lunch: 'Lunch', diner: 'Diner', tussendoor: 'Tussendoor' };

/** Vaste kleur per macro, overal in de voeding-schermen (los van de studiohuisstijl). */
export const MACRO_COLORS = { protein: '#4E8AC7', carbs: '#D96C6C', fat: '#E39A3B' } as const;

/** Het eetmoment dat bij dit uur van de dag hoort — een goede eerste gok, geen wet. */
export function defaultMealForNow(now: Date = new Date()): MealMoment {
  const h = now.getHours() + now.getMinutes() / 60;
  if (h < 10.5) return 'ontbijt';
  if (h >= 11.5 && h < 14) return 'lunch';
  if (h >= 17 && h < 20.5) return 'diner';
  return 'tussendoor';
}

export interface NutritionLog {
  /** Studio waar dit document bij hoort (multi-tenant). */
  orgId?: string;
  id: string;
  userId: string;
  loggedBy: string;
  trainerId: string | null;
  date: string; // YYYY-MM-DD
  productName: string;
  brand: string;
  grams: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  /** Ontbijt, lunch, diner of tussendoor. Oudere logs hebben dit niet. */
  meal?: MealMoment | null;
  /** Hoe het is ingevoerd: "2× Bakje". Alleen ter weergave; `grams` blijft de waarheid. */
  portionLabel?: string | null;
  quantity?: number | null;
  createdAt: string;
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : v != null && v !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
}

function parseServingGrams(s: unknown): number | null {
  if (typeof s !== 'string') return null;
  // g moet een eenheid zijn, geen begin van een ander woord: "1 glas" is geen 1 gram.
  const m = s.match(/([\d.,]+)\s*g(?:ram)?(?![a-z])/i);
  if (!m) return null;
  const g = Number(m[1].replace(',', '.'));
  return Number.isFinite(g) && g > 0 ? g : null;
}

/**
 * Curated basisproducten (vers/onbewerkt) met betrouwbare waarden per 100 g.
 * Verschijnen bovenaan, want zulke items zijn in Open Food Facts lastig te vinden.
 */
interface CuratedFood {
  name: string;
  aliases: string[];
  per100g: FoodProduct['per100g'];
  servingGrams?: number | null;
}
const CURATED_FOODS: CuratedFood[] = [
  { name: 'Banaan', aliases: ['banaan', 'banana'], per100g: { kcal: 89, protein: 1.1, carbs: 23, fat: 0.3 }, servingGrams: 120 },
  { name: 'Appel', aliases: ['appel', 'apple'], per100g: { kcal: 52, protein: 0.3, carbs: 14, fat: 0.2 }, servingGrams: 150 },
  { name: 'Sinaasappel', aliases: ['sinaasappel', 'orange'], per100g: { kcal: 47, protein: 0.9, carbs: 12, fat: 0.1 }, servingGrams: 130 },
  { name: 'Ei (gekookt)', aliases: ['ei', 'egg', 'eieren'], per100g: { kcal: 143, protein: 13, carbs: 0.7, fat: 10 }, servingGrams: 55 },
  { name: 'Kipfilet (rauw)', aliases: ['kip', 'kipfilet', 'chicken breast', 'chicken'], per100g: { kcal: 120, protein: 22.5, carbs: 0, fat: 2.6 }, servingGrams: 120 },
  { name: 'Magere kwark', aliases: ['kwark', 'magere kwark', 'quark'], per100g: { kcal: 57, protein: 10, carbs: 3.4, fat: 0.2 }, servingGrams: 250 },
  { name: 'Havermout', aliases: ['havermout', 'oats', 'oatmeal'], per100g: { kcal: 379, protein: 13, carbs: 67, fat: 7 }, servingGrams: 40 },
  { name: 'Witte rijst (gekookt)', aliases: ['rijst', 'rice', 'witte rijst'], per100g: { kcal: 130, protein: 2.7, carbs: 28, fat: 0.3 }, servingGrams: 150 },
  { name: 'Volkorenbrood', aliases: ['brood', 'volkorenbrood', 'bread', 'volkoren'], per100g: { kcal: 247, protein: 9, carbs: 41, fat: 3.4 }, servingGrams: 35 },
  { name: 'Aardappel (gekookt)', aliases: ['aardappel', 'aardappelen', 'potato'], per100g: { kcal: 87, protein: 2, carbs: 20, fat: 0.1 }, servingGrams: 150 },
  { name: 'Broccoli', aliases: ['broccoli'], per100g: { kcal: 34, protein: 2.8, carbs: 7, fat: 0.4 }, servingGrams: 100 },
  { name: 'Amandelen', aliases: ['amandelen', 'almonds'], per100g: { kcal: 579, protein: 21, carbs: 22, fat: 50 }, servingGrams: 30 },
  { name: 'Pindakaas', aliases: ['pindakaas', 'peanut butter'], per100g: { kcal: 588, protein: 25, carbs: 20, fat: 50 }, servingGrams: 15 },
  { name: 'Halfvolle melk', aliases: ['melk', 'milk', 'halfvolle melk'], per100g: { kcal: 47, protein: 3.5, carbs: 4.8, fat: 1.5 }, servingGrams: 200 },
  { name: 'Rundergehakt (rauw)', aliases: ['gehakt', 'rundergehakt', 'beef'], per100g: { kcal: 250, protein: 18, carbs: 0, fat: 20 }, servingGrams: 100 },
  { name: 'Zalm (rauw)', aliases: ['zalm', 'salmon'], per100g: { kcal: 208, protein: 20, carbs: 0, fat: 13 }, servingGrams: 125 },
  { name: 'Tonijn in water', aliases: ['tonijn', 'tuna'], per100g: { kcal: 116, protein: 26, carbs: 0, fat: 1 }, servingGrams: 100 },
  { name: 'Volkoren pasta (gekookt)', aliases: ['pasta', 'volkoren pasta', 'spaghetti'], per100g: { kcal: 124, protein: 5, carbs: 25, fat: 1.1 }, servingGrams: 150 },
  { name: 'Avocado', aliases: ['avocado'], per100g: { kcal: 160, protein: 2, carbs: 9, fat: 15 }, servingGrams: 100 },
  { name: 'Griekse yoghurt', aliases: ['yoghurt', 'griekse yoghurt', 'yogurt'], per100g: { kcal: 97, protein: 9, carbs: 4, fat: 5 }, servingGrams: 150 },
];

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').trim();
}

function curatedMatches(term: string): FoodProduct[] {
  const q = norm(term);
  return CURATED_FOODS.filter((f) => f.aliases.some((a) => norm(a).includes(q) || q.includes(norm(a)))).map((f) => ({
    code: `common:${f.name}`,
    name: f.name,
    brand: 'Vers',
    imageUrl: null,
    per100g: f.per100g,
    servingGrams: f.servingGrams ?? null,
  }));
}

/** Naam-relevantie t.o.v. de zoekterm (hoger = beter). */
function nameScore(name: string, q: string): number {
  const n = norm(name);
  if (n === q) return 100;
  const words = n.split(/\s+/);
  if (words.includes(q)) return 60;
  if (n.startsWith(q)) return 40;
  if (n.includes(q)) return 20;
  return 0;
}

export interface FoodSearchResult {
  products: FoodProduct[];
  /**
   * True als Open Food Facts niet bereikbaar was. De eigen basisproducten staan er dan nog wel,
   * zodat een storing bij hen niet het hele zoeken onbruikbaar maakt.
   */
  remoteFailed: boolean;
}

/** Zoek producten: eerst eigen basisproducten, daarna Open Food Facts (op relevantie). */
export async function searchFoods(term: string): Promise<FoodSearchResult> {
  const q = term.trim();
  if (!q) return { products: [], remoteFailed: false };
  const curated = curatedMatches(q);

  let remote: FoodProduct[] = [];
  let remoteFailed = false;
  try {
    const res = await fetch(apiUrl(`/api/food-search?q=${encodeURIComponent(q)}`));
    const data = (await res.json().catch(() => null)) as { products?: unknown } | null;
    if (!res.ok || !Array.isArray(data?.products)) throw new Error('Zoeken mislukt');
    remote = data.products as FoodProduct[];
  } catch {
    remoteFailed = true;
  }

  const nq = norm(q);
  const score = (p: FoodProduct) =>
    (p.per100g.kcal > 0 ? 30 : 0) + nameScore(p.name, nq) + (p.nl ? 15 : 0) + (p.imageUrl ? 5 : 0);
  remote.sort((a, b) => score(b) - score(a));
  // Eigen basisproducten bovenaan. Dubbel is dezelfde naam bij hetzelfde merk: "Magere kwark" van
  // Melkan, Optimel en Jumbo zijn drie producten, niet één — dat waren ze eerst wel.
  const keyOf = (p: FoodProduct) => `${norm(p.name)}|${norm(p.brand)}`;
  const seen = new Set(curated.map(keyOf));
  const products = [...curated];
  for (const p of remote) {
    const key = keyOf(p);
    if (seen.has(key)) continue;
    seen.add(key);
    products.push(p);
  }
  return { products, remoteFailed };
}

/** Zoek een product op barcode (EAN) via Open Food Facts. Null als niet gevonden. */
export async function getProductByBarcode(code: string): Promise<FoodProduct | null> {
  const c = code.trim();
  if (!c) return null;
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(c)}.json?fields=code,product_name,brands,nutriments,serving_size,quantity,image_small_url,image_url,nutriscore_grade`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  const p = data?.product;
  if (!data || data.status !== 1 || !p) return null;
  const name = String(p.product_name ?? '').trim();
  if (!name) return null;
  const n = p.nutriments ?? {};
  let kcal = num(n['energy-kcal_100g']);
  if (!kcal && n['energy_100g']) kcal = Math.round(num(n['energy_100g']) / 4.184);
  return {
    code: String(p.code ?? c),
    name,
    brand: String(p.brands ?? '').split(',')[0].trim(),
    imageUrl: typeof p.image_small_url === 'string' ? p.image_small_url : null,
    per100g: {
      kcal: Math.round(kcal),
      protein: Math.round(num(n['proteins_100g']) * 10) / 10,
      carbs: Math.round(num(n['carbohydrates_100g']) * 10) / 10,
      fat: Math.round(num(n['fat_100g']) * 10) / 10,
    },
    servingGrams: parseServingGrams(p.serving_size),
    packageGrams: parseServingGrams(p.quantity),
    imageLargeUrl: typeof p.image_url === 'string' ? p.image_url : null,
    nutriscore: /^[a-e]$/.test(String(p.nutriscore_grade ?? '')) ? (String(p.nutriscore_grade) as FoodProduct['nutriscore']) : null,
    details: detailsFromNutriments(n),
  };
}

function detailsFromNutriments(n: Record<string, unknown>): FoodProduct['details'] {
  const opt = (k: string) => {
    const v = n[k];
    const x = typeof v === 'number' ? v : typeof v === 'string' && v !== '' ? Number(v) : NaN;
    return Number.isFinite(x) ? Math.round(x * 10) / 10 : null;
  };
  const d = { sugars: opt('sugars_100g'), fiber: opt('fiber_100g'), saturatedFat: opt('saturated-fat_100g'), salt: opt('salt_100g') };
  return Object.values(d).some((v) => v != null) ? d : null;
}

export interface RecognizedFood {
  name: string;
  grams: number;
  per100g: FoodProduct['per100g'];
}

/** Herken voeding op een foto (data-URL) via het vision-endpoint. */
export async function recognizeFoodPhoto(image: string): Promise<RecognizedFood[]> {
  const res = await fetch(apiUrl('/api/food-photo'), {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ image }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || 'Fotoherkenning mislukt');
  return Array.isArray(data?.items) ? data.items : [];
}

/** Bereken de macro's voor een hoeveelheid gram op basis van per-100g-waarden. */
export function macrosForGrams(per100g: FoodProduct['per100g'], grams: number) {
  const f = grams / 100;
  return {
    kcal: Math.round(per100g.kcal * f),
    protein: Math.round(per100g.protein * f * 10) / 10,
    carbs: Math.round(per100g.carbs * f * 10) / 10,
    fat: Math.round(per100g.fat * f * 10) / 10,
  };
}

const COLLECTION = 'nutritionLogs';

function newId(): string {
  return `food_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function saveNutritionLog(
  logInput: Omit<NutritionLog, 'id' | 'createdAt'> & { id?: string; createdAt?: string }
): Promise<NutritionLog> {
  if (!isFirebaseConfigured() || !db) throw new Error('Firebase niet geconfigureerd');
  const id = logInput.id ?? newId();
  const full: NutritionLog = {
    ...logInput,
    id,
    orgId: logInput.orgId || requireOrgId(),
    createdAt: logInput.createdAt ?? new Date().toISOString(),
  };
  // Firestore weigert `undefined`; optionele velden die niet gezet zijn laten we gewoon weg.
  const clean: Record<string, unknown> = { updatedAt: serverTimestamp() };
  for (const [k, v] of Object.entries(full)) if (v !== undefined) clean[k] = v;
  await setDoc(doc(db, COLLECTION, id), clean, { merge: true });
  return full;
}

export async function deleteNutritionLog(id: string): Promise<void> {
  if (!isFirebaseConfigured() || !db) return;
  await deleteDoc(doc(db, COLLECTION, id));
}

function toLog(data: Record<string, unknown>, id: string): NutritionLog {
  return {
    id,
    userId: String(data.userId ?? ''),
    loggedBy: String(data.loggedBy ?? ''),
    trainerId: data.trainerId != null ? String(data.trainerId) : null,
    orgId: typeof data.orgId === 'string' ? data.orgId : undefined,
    date: String(data.date ?? ''),
    productName: String(data.productName ?? ''),
    brand: String(data.brand ?? ''),
    grams: num(data.grams),
    kcal: num(data.kcal),
    protein: num(data.protein),
    carbs: num(data.carbs),
    fat: num(data.fat),
    meal: MEAL_ORDER.includes(data.meal as MealMoment) ? (data.meal as MealMoment) : null,
    portionLabel: typeof data.portionLabel === 'string' && data.portionLabel ? data.portionLabel : null,
    quantity: typeof data.quantity === 'number' && data.quantity > 0 ? data.quantity : null,
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : new Date().toISOString(),
  };
}

/** Voedingslogs van een persoon op een dag (nieuwste eerst). */
export async function getNutritionLogsForDay(userId: string, date: string): Promise<NutritionLog[]> {
  if (!isFirebaseConfigured() || !db) return [];
  const q = query(collection(db, COLLECTION), where('userId', '==', userId), where('date', '==', date));
  const snap = await getDocs(q);
  return snap.docs.map((d) => toLog(d.data(), d.id)).sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
}

/** Alle voedingslogs van een persoon (voor dag/week/maand-inzicht). */
export async function getNutritionLogsForUser(userId: string): Promise<NutritionLog[]> {
  if (!isFirebaseConfigured() || !db) return [];
  const q = query(collection(db, COLLECTION), where('userId', '==', userId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => toLog(d.data(), d.id));
}
