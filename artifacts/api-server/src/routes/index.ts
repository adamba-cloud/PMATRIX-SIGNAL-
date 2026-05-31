import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import signalsRouter from "./signals";
import subscriptionsRouter from "./subscriptions";
import paymentsRouter from "./payments";
import mpesaRouter from "./mpesa";
import configRouter from "./config";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(usersRouter);
router.use(signalsRouter);
router.use(subscriptionsRouter);
router.use(mpesaRouter);
router.use(paymentsRouter);
router.use(configRouter);
router.use(dashboardRouter);

export default router;
