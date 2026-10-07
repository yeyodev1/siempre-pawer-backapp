import bcrypt from "bcryptjs";
import mongoose, { Schema } from "mongoose";

// Sin cuentas de cliente: se compra como invitado. Solo admin y distribuidores inician sesión.
export const ACCOUNT_TYPES = ["admin", "distributor"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export interface IUser {
  email: string;
  password: string;
  name: string;
  phone: string;
  accountType: AccountType;
  company: string;
  ruc: string;
  city: string;
  isActive: boolean;
  lastLoginAt: Date | null;
  resetPasswordToken: string | null;
  resetPasswordExpires: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

const userSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
    // select: false — nunca viaja en un find() por descuido.
    password: { type: String, required: true, select: false },
    name: { type: String, default: "" },
    phone: { type: String, default: "" },
    accountType: { type: String, enum: ACCOUNT_TYPES, default: "distributor" },
    company: { type: String, default: "" },
    ruc: { type: String, default: "" },
    city: { type: String, default: "" },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date, default: null },
    resetPasswordToken: { type: String, default: null },
    resetPasswordExpires: { type: Date, default: null },
  },
  { timestamps: true },
);

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) {
    next();
    return;
  }
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

export const User = mongoose.models.User || mongoose.model<IUser>("User", userSchema);
