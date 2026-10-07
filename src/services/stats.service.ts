import { Order } from "../models/order.model";
import { Product } from "../models/product.model";

const LOW_STOCK = 5;
const SOLD_STATUSES = ["paid", "preparing", "shipped", "delivered"];
// Ecuador continental: UTC-5 todo el año.
const OFFSET_MS = 5 * 60 * 60 * 1000;

function ecuadorStartOfDay(now: Date): Date {
  const local = new Date(now.getTime() - OFFSET_MS);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() + OFFSET_MS);
}

function ecuadorStartOfMonth(now: Date): Date {
  const local = new Date(now.getTime() - OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1) + OFFSET_MS);
}

export async function getStats() {
  const now = new Date();
  const [ordersToday, salesAgg, pendingOrders, lowStock, topProducts, recentOrders] =
    await Promise.all([
      Order.countDocuments({
        createdAt: { $gte: ecuadorStartOfDay(now) },
        status: { $ne: "cancelled" },
      }),
      Order.aggregate([
        {
          $match: { createdAt: { $gte: ecuadorStartOfMonth(now) }, status: { $in: SOLD_STATUSES } },
        },
        { $group: { _id: null, total: { $sum: "$total" } } },
      ]),
      Order.countDocuments({ status: { $in: ["pending_payment", "paid", "preparing"] } }),
      Product.find({ stock: { $lte: LOW_STOCK } })
        .select("name slug sku stock images isPublished")
        .sort({ stock: 1, name: 1 })
        .limit(10)
        .lean(),
      Order.aggregate([
        { $match: { status: { $ne: "cancelled" } } },
        { $unwind: "$items" },
        {
          $group: {
            _id: "$items.product",
            name: { $first: "$items.name" },
            qty: { $sum: "$items.qty" },
          },
        },
        { $sort: { qty: -1 } },
        { $limit: 5 },
        { $project: { _id: 0, name: 1, qty: 1 } },
      ]),
      Order.find().select("-payphone.response").sort({ createdAt: -1 }).limit(8).lean(),
    ]);

  return {
    ordersToday,
    salesMonth: salesAgg[0]?.total ?? 0,
    pendingOrders,
    lowStock,
    topProducts,
    recentOrders,
  };
}
