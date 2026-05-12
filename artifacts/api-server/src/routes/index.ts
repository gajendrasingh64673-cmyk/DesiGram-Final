import { Router, type IRouter } from "express";
import instagramRouter from "./instagram";

const router: IRouter = Router();

router.use(instagramRouter);

export default router;
