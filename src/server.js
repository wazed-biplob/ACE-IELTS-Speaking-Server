// import mongoose from "mongoose";
// import { app } from "./app.js";

// async function main() {
//   try {
//     await mongoose.connect(process.env.DB_URL);
//     server = app.listen(process.env.PORT, () => {
//       console.log(`Example app listening on port ${process.env.PORT}`);
//     });
//   } catch (err) {
//     console.log(err);
//   }
// }

// main();

// async function connectDb() {
//   await client.connect();
//   db = client.db("ace_ielts");
//   console.log("Connected to MongoDB");
// }
// connectDb();

// process.on("unhandledRejection", () => {
//   console.log(`unhandled rejection detected, shutting down the server...`);
//   if (server) {
//     server.close(() => {
//       process.exit(1);
//     });
//   }
//   process.exit(1);
// });

// process.on("uncaughtException", () => {
//   console.log(`uncaught exception detected, shutting down the server...`);

//   process.exit(1);
// });
