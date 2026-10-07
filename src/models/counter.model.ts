import mongoose, { Schema } from "mongoose";

/** Secuencias correlativas (número de pedido). _id es el nombre de la secuencia. */
export interface ICounter {
  _id: string;
  seq: number;
}

const counterSchema = new Schema<ICounter>({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

export const Counter =
  mongoose.models.Counter || mongoose.model<ICounter>("Counter", counterSchema);
