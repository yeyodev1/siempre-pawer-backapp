import mongoose, { Schema } from "mongoose";

export interface ICoupon {
  code: string;
  influencerName: string;
  influencerEmail: string;
  influencerInstagram: string;
  discountPct: number;
  commissionPct: number;
  isActive: boolean;
  // Métricas: solo las mueve coupon.service.syncCouponMetrics.
  uses: number;
  salesTotal: number;
  commissionTotal: number;
  notes: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const couponSchema = new Schema<ICoupon>(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    influencerName: { type: String, default: "" },
    influencerEmail: { type: String, default: "", lowercase: true, trim: true },
    influencerInstagram: { type: String, default: "" },
    discountPct: { type: Number, default: 0, min: 0, max: 100 },
    commissionPct: { type: Number, default: 0, min: 0, max: 100 },
    isActive: { type: Boolean, default: true },
    uses: { type: Number, default: 0 },
    salesTotal: { type: Number, default: 0 },
    commissionTotal: { type: Number, default: 0 },
    notes: { type: String, default: "" },
  },
  { timestamps: true },
);

export const Coupon = mongoose.models.Coupon || mongoose.model<ICoupon>("Coupon", couponSchema);
