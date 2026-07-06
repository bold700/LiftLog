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

/** Zoek producten op naam via Open Food Facts. */
export async function searchFoods(term: string): Promise<FoodProduct[]> {
  const q = term.trim();
  if (!q) return [];
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
  // Producten zonder enige voedingswaarde onderaan
  return out.sort((a, b) => (b.per100g.kcal > 0 ? 1 : 0) - (a.per100g.kcal > 0 ? 1 : 0));
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
