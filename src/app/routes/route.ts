import { Router } from "express";

const router = Router();

const moduleRoutes = [
  {
    path: "/users",
    route: "examp-papaer",
  },
];

moduleRoutes.forEach((route) => router.use(route.path, route.route));
export default router;
