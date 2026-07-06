/**
 * Voeding-tracking (prototype).
 * - Zoeken via Open Food Facts (open product-DB, gratis, geen key).
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
import { apiUrl } from '../utils/apiOrigin';

export interface FoodProduct {
  code: string;
  name: string;
  brand: string;
  imageUrl: string | null;
  /** Voedingswaarden per 100 g. */
  per100g: { kcal: number; protein: number; carbs: number; fat: number };
  /** Portiegrootte in gram indien bekend (bv. "30 g"). */
  servingGrams: number | null;
}

export interface NutritionLog {
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
  createdAt: string;
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : v != null && v !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : 0;
}

function parseServingGrams(s: unknown): number | null {
  if (typeof s !== 'string') return null;
  const m = s.match(/([\d.,]+)\s*g/i);
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

/** Zoek producten: eerst curated basisproducten, daarna Open Food Facts (op relevantie). */
export async function searchFoods(term: string): Promise<FoodProduct[]> {
  const q = term.trim();
  if (!q) return [];
  const curated = curatedMatches(q);
  const url =
    'https://world.openfoodfacts.org/cgi/search.pl?' +
    new URLSearchParams({
      search_terms: q,
      search_simple: '1',
      action: 'process',
      json: '1',
      page_size: '24',
      fields: 'code,product_name,brands,nutriments,serving_size,image_small_url',
    }).toString();

  const res = await fetch(url);
  if (!res.ok) throw new Error('Zoeken mislukt');
  const data = await res.json();
  const products = Array.isArray(data?.products) ? data.products : [];
  const out: FoodProduct[] = [];
  for (const p of products) {
    const name = String(p?.product_name ?? '').trim();
    if (!name) continue;
    const n = p?.nutriments ?? {};
    let kcal = num(n['energy-kcal_100g']);
    if (!kcal && n['energy_100g']) kcal = Math.round(num(n['energy_100g']) / 4.184);
    out.push({
      code: String(p?.code ?? ''),
      name,
      brand: String(p?.brands ?? '').split(',')[0].trim(),
      imageUrl: typeof p?.image_small_url === 'string' ? p.image_small_url : null,
      per100g: {
        kcal: Math.round(kcal),
        protein: Math.round(num(n['proteins_100g']) * 10) / 10,
        carbs: Math.round(num(n['carbohydrates_100g']) * 10) / 10,
        fat: Math.round(num(n['fat_100g']) * 10) / 10,
      },
      servingGrams: parseServingGrams(p?.serving_size),
    });
  }
  const nq = norm(q);
  out.sort((a, b) => {
    const sb = (b.per100g.kcal > 0 ? 30 : 0) + nameScore(b.name, nq);
    const sa = (a.per100g.kcal > 0 ? 30 : 0) + nameScore(a.name, nq);
    return sb - sa;
  });
  // Curated basisproducten bovenaan; dedup op naam (curated wint)
  const seen = new Set(curated.map((c) => norm(c.name)));
  const merged = [...curated];
  for (const p of out) {
    if (seen.has(norm(p.name))) continue;
    seen.add(norm(p.name));
    merged.push(p);
  }
  return merged;
}

/** Zoek een product op barcode (EAN) via Open Food Facts. Null als niet gevonden. */
export async function getProductByBarcode(code: string): Promise<FoodProduct | null> {
  const c = code.trim();
  if (!c) return null;
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(c)}.json?fields=code,product_name,brands,nutriments,serving_size,image_small_url`;
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
  };
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
    headers: { 'Content-Type': 'application/json' },
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
  const full: NutritionLog = { ...logInput, id, createdAt: logInput.createdAt ?? new Date().toISOString() };
  await setDoc(doc(db, COLLECTION, id), { ...full, updatedAt: serverTimestamp() }, { merge: true });
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
    date: String(data.date ?? ''),
    productName: String(data.productName ?? ''),
    brand: String(data.brand ?? ''),
    grams: num(data.grams),
    kcal: num(data.kcal),
    protein: num(data.protein),
    carbs: num(data.carbs),
    fat: num(data.fat),
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
