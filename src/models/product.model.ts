import mongoose, { Schema, Types } from "mongoose";

/** Todos los montos en centavos. */
export interface IProduct {
  name: string;
  slug: string;
  sku: string;
  category: Types.ObjectId | null;
  shortDescription: string;
  description: string;
  features: string[];
  specs: { label: string; value: string }[];
  images: string[];
  prices: { card: number; transfer: number; cod: number };
  compareAtPrice: number | null;
  distributorPrice: number | null;
  // unitPrice referido al precio con tarjeta; los otros métodos suman su diferencia.
  volumeTiers: { minQty: number; unitPrice: number }[];
  stock: number;
  isPublished: boolean;
  isFeatured: boolean;
  order: number;
  createdAt?: Date;
  updatedAt?: Date;
}

const productSchema = new Schema<IProduct>(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    sku: { type: String, default: "", trim: true },
    category: { type: Schema.Types.ObjectId, ref: "Category", default: null, index: true },
    shortDescription: { type: String, default: "" },
    description: { type: String, default: "" },
    features: { type: [String], default: [] },
    specs: {
      type: [
        { label: { type: String, default: "" }, value: { type: String, default: "" }, _id: false },
      ],
      default: [],
    },
    images: { type: [String], default: [] },
    prices: {
      card: { type: Number, required: true, min: 0 },
      transfer: { type: Number, required: true, min: 0 },
      cod: { type: Number, required: true, min: 0 },
    },
    compareAtPrice: { type: Number, default: null },
    distributorPrice: { type: Number, default: null },
    volumeTiers: {
      type: [
        {
          minQty: { type: Number, required: true },
          unitPrice: { type: Number, required: true },
          _id: false,
        },
      ],
      default: [],
    },
    stock: { type: Number, default: 0, min: 0 },
    isPublished: { type: Boolean, default: true },
    isFeatured: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
);

productSchema.index({ isPublished: 1, order: 1, createdAt: -1 });

export const Product =
  mongoose.models.Product || mongoose.model<IProduct>("Product", productSchema);
