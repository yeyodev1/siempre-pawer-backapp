import mongoose, { Schema, Types } from "mongoose";

export const ORDER_STATUSES = [
  "pending_payment",
  "paid",
  "preparing",
  "shipped",
  "delivered",
  "cancelled",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const PAYMENT_METHODS = ["card", "transfer", "cod"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const SHIPPING_METHODS = ["delivery", "pickup"] as const;
export type ShippingMethod = (typeof SHIPPING_METHODS)[number];

/** Montos en centavos. */
export interface IOrder {
  number: string;
  customer: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    documentId: string;
  };
  shipping: {
    method: ShippingMethod;
    receiverName: string;
    receiverPhone: string;
    province: string;
    city: string;
    address: string;
    reference: string;
  };
  invoice: {
    required: boolean;
    name: string;
    documentId: string;
    email: string;
    address: string;
  };
  items: {
    product: Types.ObjectId;
    name: string;
    slug: string;
    image: string;
    qty: number;
    unitPrice: number;
    lineTotal: number;
  }[];
  paymentMethod: PaymentMethod;
  subtotal: number;
  discount: number;
  couponCode: string;
  shippingCost: number;
  total: number;
  status: OrderStatus;
  trackingNumber: string;
  trackingUrl: string;
  transferReceiptUrl: string;
  payphone: {
    clientTransactionId: string;
    transactionId: string;
    statusCode: number | null;
    response: unknown;
  };
  isDistributor: boolean;
  distributor: Types.ObjectId | null;
  history: { status: string; note: string; at: Date }[];
  notes: string;
  // Interno: lo que este pedido sumó a las métricas del cupón, para revertir exacto.
  couponMetrics: { counted: boolean; sale: number; commission: number };
  createdAt?: Date;
  updatedAt?: Date;
}

const orderSchema = new Schema<IOrder>(
  {
    number: { type: String, required: true, unique: true },
    customer: {
      firstName: { type: String, default: "" },
      lastName: { type: String, default: "" },
      email: { type: String, default: "", lowercase: true, trim: true, index: true },
      phone: { type: String, default: "" },
      documentId: { type: String, default: "" },
    },
    shipping: {
      method: { type: String, enum: SHIPPING_METHODS, default: "delivery" },
      receiverName: { type: String, default: "" },
      receiverPhone: { type: String, default: "" },
      province: { type: String, default: "" },
      city: { type: String, default: "" },
      address: { type: String, default: "" },
      reference: { type: String, default: "" },
    },
    invoice: {
      required: { type: Boolean, default: false },
      name: { type: String, default: "" },
      documentId: { type: String, default: "" },
      email: { type: String, default: "" },
      address: { type: String, default: "" },
    },
    items: [
      {
        product: { type: Schema.Types.ObjectId, ref: "Product", required: true },
        name: { type: String, required: true },
        slug: { type: String, default: "" },
        image: { type: String, default: "" },
        qty: { type: Number, required: true, min: 1 },
        unitPrice: { type: Number, required: true },
        lineTotal: { type: Number, required: true },
        _id: false,
      },
    ],
    paymentMethod: { type: String, enum: PAYMENT_METHODS, required: true },
    subtotal: { type: Number, required: true },
    discount: { type: Number, default: 0 },
    couponCode: { type: String, default: "" },
    shippingCost: { type: Number, default: 0 },
    total: { type: Number, required: true },
    status: { type: String, enum: ORDER_STATUSES, required: true, index: true },
    trackingNumber: { type: String, default: "" },
    trackingUrl: { type: String, default: "" },
    transferReceiptUrl: { type: String, default: "" },
    payphone: {
      clientTransactionId: { type: String, default: "", index: true },
      transactionId: { type: String, default: "" },
      statusCode: { type: Number, default: null },
      response: { type: Schema.Types.Mixed, default: null },
    },
    isDistributor: { type: Boolean, default: false },
    distributor: { type: Schema.Types.ObjectId, ref: "User", default: null },
    history: [
      {
        status: { type: String, required: true },
        note: { type: String, default: "" },
        at: { type: Date, default: Date.now },
        _id: false,
      },
    ],
    notes: { type: String, default: "" },
    couponMetrics: {
      counted: { type: Boolean, default: false },
      sale: { type: Number, default: 0 },
      commission: { type: Number, default: 0 },
    },
  },
  { timestamps: true },
);

orderSchema.index({ createdAt: -1 });

export const Order = mongoose.models.Order || mongoose.model<IOrder>("Order", orderSchema);
