import express from "express";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";
import cors from "cors";
import multer from "multer";
import fs from "fs";
import { MongoClient } from "mongodb";

dotenv.config();

export const app = express();

app.use(express.json());
app.use(cors());

const uri = process.env.DB_URL; // replace with your MongoDB URI
const client = new MongoClient(uri);

let db;

async function connectDB() {
  try {
    await client.connect();
    console.log("✅ Connected to MongoDB");
    db = client.db("ace_ielts"); // your database name
  } catch (err) {
    console.error("❌ Failed to connect to MongoDB", err);
  }
}

connectDB();

const upload = multer({ dest: "uploads/" });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
// const client = new OpenAI({
//   apiKey: process.env.OPENAI_API_KEY,
// });
// Step 1: Get exam question for a given part
app.post("/exam/question", async (req, res) => {
  const { part } = req.body;

  const prompts = {
    1: "You are an IELTS examiner. Ask 12 personal introduction questions for IELTS Speaking Part 1",
    2: "You are an IELTS examiner. Give ONE cue card for IELTS Speaking Part 2.",
    3: "You are an IELTS examiner. Ask 5 advanced discussion questions related to Part 2 topic for IELTS Speaking Part 3.",
  };

  const result = await model.generateContent(prompts[part]);
  res.json({ question: result.response.text() });
});

// app.post("/transcribe", upload.single("file"), async (req, res) => {
//   try {
//     const filePath = req.file.path;

//     console.log("Received file:", req.file); // <--- Add this
//     console.log("File path exists?", fs.existsSync(req.file.path));

//     // Prepare form-data
//     const formData = new FormData();
//     formData.append("file", fs.createReadStream(filePath));

//     // Call Deepgram API
//     const response = await fetch("https://api.deepgram.com/v1/listen", {
//       method: "POST",
//       headers: {
//         Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`, // 👈 Secure key
//       },
//       body: formData,
//     });

//     const data = await response.json();

//     // Extract transcript safely
//     const transcript =
//       data.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";

//     res.json({ text: transcript });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ error: "Transcription failed" });
//   } finally {
//     // Optional: delete uploaded file after processing
//     fs.unlink(req.file.path, () => {});
//   }
// });

// Step 2: Evaluate candidate’s answer
app.post("/exam/evaluate", async (req, res) => {
  const { answer } = req.body;

  const result = await model.generateContent(`
    You are an IELTS examiner. Evaluate the following answer:
    "${answer}"

    Give feedback with:
    - Band score (0–9)
    - Grammar feedback
    - Vocabulary feedback
    - Pronunciation suggestion
    - Fluency & coherence feedback
    Reply in JSON format:
    { "band": number, "grammar": string, "vocab": string, "pronunciation": string, "fluency": string }
  `);

  try {
    const parsed = JSON.parse(result.response.text());
    res.json(parsed);
  } catch (err) {
    res.json({
      error: "Failed to parse response",
      raw: result.response.text(),
    });
  }
});

app.listen(process.env.PORT, () =>
  console.log(`🚀 IELTS server running at http://localhost:${process.env.PORT}`)
);

import { createClient } from "@deepgram/sdk";
// import router from "./app/routes/route";

const deepgram = createClient(process.env.DEEPGRAM_API_KEY);
// app.use("/api/v1", router);
// POST /transcribe-file
app.post("/transcribe-file", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const filePath = req.file.path;

    // Read file contents
    const fileBuffer = fs.readFileSync(filePath);

    // Transcribe using Deepgram SDK
    const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
      fileBuffer,
      {
        model: "nova-3",
        smart_format: true,
      }
    );

    // Delete temp file
    fs.unlink(filePath, () => {});

    if (error) return res.status(500).json({ error });

    res.json({ result });

    const question = req.body.question || "No question provided";

    const answer = result.results.channels[0].alternatives[0].transcript;

    await db.collection("papers").updateOne(
      {},
      {
        $push: {
          part1: { question: question, answer: answer },
        },
      },
      { upsert: true }
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// app.listen(5000, () => console.log("Server running on http://localhost:5000"));
