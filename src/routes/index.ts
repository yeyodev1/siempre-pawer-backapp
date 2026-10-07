import express, { Application } from "express";
import authRoutes from "./auth.routes";
import healthRoutes from "./health.routes";
import settingsRoutes from "./settings.routes";
import categoryRoutes from "./category.routes";
import productRoutes from "./product.routes";
import couponRoutes from "./coupon.routes";
import orderRoutes from "./order.routes";
import adminRoutes from "./admin.routes";

function routerApi(app: Application) {
  const router = express.Router();
  app.use("/api", router);

  router.use("/health", healthRoutes);
  router.use("/auth", authRoutes);
  router.use("/settings", settingsRoutes);
  router.use("/categories", categoryRoutes);
  router.use("/products", productRoutes);
  router.use("/coupons", couponRoutes);
  router.use("/orders", orderRoutes);
  router.use("/admin", adminRoutes);
}

export default routerApi;
