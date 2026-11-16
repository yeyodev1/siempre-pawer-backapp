import mongoose, { Schema } from "mongoose";

/** Solicitud de "Cotiza para tu colegio": lista armada en la web y/o archivo adjunto. */
export interface ISchoolQuote {
  name: string;
  institution: string;
  email: string;
  phone: string;
  city: string;
  notes: string;
  items: { product: string; name: string; qty: number }[];
  fileUrl: string;
  status: "new" | "answered";
  createdAt?: Date;
}

const schoolQuoteSchema = new Schema<ISchoolQuote>(
  {
    name: { type: String, required: true, trim: true },
    institution: { type: String, default: "", trim: true },
    email: { type: String, default: "", lowercase: true, trim: true },
    phone: { type: String, default: "", trim: true },
    city: { type: String, default: "", trim: true },
    notes: { type: String, default: "" },
    items: {
      type: [{ product: String, name: String, qty: Number, _id: false }],
      default: [],
    },
    fileUrl: { type: String, default: "" },
    status: { type: String, enum: ["new", "answered"], default: "new", index: true },
  },
  { timestamps: true },
);

schoolQuoteSchema.index({ createdAt: -1 });

export const SchoolQuote =
  mongoose.models.SchoolQuote || mongoose.model<ISchoolQuote>("SchoolQuote", schoolQuoteSchema);
