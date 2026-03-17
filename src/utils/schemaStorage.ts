import { Schema } from '../types';

const STORAGE_KEY = 'liftlog_schemas';

export const getSchemas = (): Schema[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

export const getSchemaById = (id: string): Schema | null => {
  const schemas = getSchemas();
  return schemas.find((s) => s.id === id) ?? null;
};

export const saveSchema = (schema: Schema): void => {
  const schemas = getSchemas();
  const index = schemas.findIndex((s) => s.id === schema.id);
  const toStore = { ...schema };
  if (toStore.startDate === undefined) toStore.startDate = null;
  if (toStore.endDate === undefined) toStore.endDate = null;
  if (index >= 0) {
    schemas[index] = { ...schemas[index], ...toStore };
  } else {
    schemas.push(toStore);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(schemas));
};

export const deleteSchema = (id: string): void => {
  const schemas = getSchemas().filter((s) => s.id !== id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(schemas));
};

/** Maakt een nieuw leeg schema aan met unieke id en createdAt. */
export const createEmptySchema = (name: string, trainerId: string): Schema => {
  return {
    id: `schema_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    name,
    trainerId,
    clientId: null,
    createdAt: new Date().toISOString(),
    days: [],
  };
};
