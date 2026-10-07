import { Settings, ISettings, IBankAccount } from "../models/settings.model";
import { isPayphoneEnabled } from "./payphone.service";
import { text } from "../utils/query";

/** Devuelve el documento único; lo crea con los defaults la primera vez. */
export async function getSettings(): Promise<ISettings> {
  const settings = await Settings.findOneAndUpdate(
    { key: "main" },
    { $setOnInsert: { key: "main" } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean<ISettings>();
  return settings as ISettings;
}

export async function getPublicSettings() {
  const s = await getSettings();
  return {
    shippingCost: s.shippingCost,
    freeShippingFrom: s.freeShippingFrom,
    pickupAddress: s.pickupAddress,
    bankAccounts: s.bankAccounts,
    whatsapp: s.whatsapp,
    announcement: s.announcement,
    codEnabled: s.codEnabled,
    transferEnabled: s.transferEnabled,
    payphoneEnabled: isPayphoneEnabled(),
  };
}

function nonNegativeInt(value: unknown): number {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export async function updateSettings(body: any): Promise<ISettings> {
  await getSettings();
  const set: Partial<ISettings> = {};
  if (body?.shippingCost !== undefined) set.shippingCost = nonNegativeInt(body.shippingCost);
  if (body?.freeShippingFrom !== undefined)
    set.freeShippingFrom = nonNegativeInt(body.freeShippingFrom);
  if (body?.pickupAddress !== undefined) set.pickupAddress = text(body.pickupAddress);
  if (body?.whatsapp !== undefined) set.whatsapp = text(body.whatsapp).replace(/\D/g, "");
  if (body?.announcement !== undefined) set.announcement = text(body.announcement);
  if (body?.codEnabled !== undefined) set.codEnabled = Boolean(body.codEnabled);
  if (body?.transferEnabled !== undefined) set.transferEnabled = Boolean(body.transferEnabled);
  if (Array.isArray(body?.bankAccounts)) {
    set.bankAccounts = body.bankAccounts.map((a: any): IBankAccount => ({
      bank: text(a?.bank),
      type: text(a?.type),
      number: text(a?.number),
      holder: text(a?.holder),
      documentId: text(a?.documentId),
    }));
  }
  const updated = await Settings.findOneAndUpdate(
    { key: "main" },
    { $set: set },
    { new: true },
  ).lean<ISettings>();
  return updated as ISettings;
}
