import mongoose, { Schema } from "mongoose";

export interface IBankAccount {
  bank: string;
  type: string;
  number: string;
  holder: string;
  documentId: string;
}

/** Documento único (key "main"). Montos en centavos. */
export interface ISettings {
  key: string;
  shippingCost: number;
  // 0 = el envío nunca es gratis.
  freeShippingFrom: number;
  pickupAddress: string;
  bankAccounts: IBankAccount[];
  whatsapp: string;
  announcement: string;
  codEnabled: boolean;
  transferEnabled: boolean;
}

// Sub-schema explícito: el campo "type" (ahorros/corriente) chocaría con la
// palabra reservada de Mongoose si se declarara en línea.
const bankAccountSchema = new Schema<IBankAccount>(
  {
    bank: { type: String, default: "" },
    type: { type: String, default: "" },
    number: { type: String, default: "" },
    holder: { type: String, default: "" },
    documentId: { type: String, default: "" },
  },
  { _id: false },
);

const settingsSchema = new Schema<ISettings>(
  {
    key: { type: String, default: "main", unique: true },
    // Valor provisional: el cliente lo ajusta desde el panel.
    shippingCost: { type: Number, default: 500 },
    freeShippingFrom: { type: Number, default: 0 },
    pickupAddress: { type: String, default: "Urdesa, Guayaquil" },
    bankAccounts: { type: [bankAccountSchema], default: [] },
    whatsapp: { type: String, default: "593983784840" },
    announcement: { type: String, default: "" },
    codEnabled: { type: Boolean, default: true },
    transferEnabled: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export const Settings =
  mongoose.models.Settings || mongoose.model<ISettings>("Settings", settingsSchema);
