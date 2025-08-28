import express from "express";
import dotenv from "dotenv";
// import { GoogleGenerativeAI } from "@google/generative-ai";
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
// const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

app.get("/", (req, res) => res.send("ACE IELTS Server is Running OK!"));

app.post("/exam/question", async (req, res) => {
  const { part } = req.body;
  console.log("part", part);

  // const prompts = {
  //   1: "You are an IELTS examiner. Ask 2 personal introduction questions for IELTS Speaking Part 1",
  //   2: "You are an IELTS examiner. Give ONE cue card for IELTS Speaking Part 2.",
  //   3: "You are an IELTS examiner. Ask 5 advanced discussion questions related to Part 2 topic for IELTS Speaking Part 3.",
  // };

  if (part === 1) {
    res.json({
      question:
        "Alright, hello! I'm your examiner today. We're going to start with a few questions to get to know you a little better.\n\n**Question 1:** Can you tell me your full name, please?\n\n**Question 2:** And what do you do, do you work or are you a student?",
    });
  } else if (part === 2) {
    // const result = await model.generateContent(
    //   "You are an IELTS examiner. Give ONE cue card for IELTS Speaking Part 2."
    // );
    res.json({
      question:
        "Here is your cue card:\n\n---\n\n**Describe a challenging experience you had when learning something new.**\n\nYou should say:\n\n*   what you were trying to learn\n*   what made it challenging for you\n*   how you eventually overcame the difficulties\n\nand explain how this experience changed your perspective on learning.\n\n---\nYou will have one minute to prepare your answer, and then you will speak for one to two minutes.",
    });
  } else if (part === 3) {
    // const result = await model.generateContent(
    //   "Ask 5 simple discussion questions related to Part 2 topic for IELTS Speaking Part 3. Part 2 Topic was : Describe a challenging Experience."
    // );
    res.json({
      question:
        'Here are 5 simple discussion questions suitable for IELTS Speaking Part 3, related to the Part 2 topic "Describe a challenging experience":\n\n1.  **What are the main benefits people gain from overcoming difficult experiences?** (Focuses on personal growth and learning)\n2.  **Do you think society encourages people to face challenges, or to avoid them?** (Asks about societal attitudes and values)\n3.  **How do challenges faced by young people today compare to those faced by previous generations?** (Invites comparison and discussion of changing times)\n4.  **What kind of support systems do people typically rely on when going through a difficult period?** (Explores resources and community support)\n5.  **Do you think it\'s better to avoid difficult situations if possible, or to actively seek them out for personal growth?** (Presents a philosophical dilemma requiring justification)',
    });
  }
});

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

    const fileBuffer = fs.readFileSync(filePath);

    const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
      fileBuffer,
      {
        model: "nova-3",
        smart_format: true,
      }
    );

    fs.unlink(filePath, (err) => {
      if (err) {
        console.error("Failed to delete file:", err);
        return res.status(500).json({ error: "Could not delete file" });
      }
      console.log("File deleted successfully");
    });

    if (error) return res.status(500).json({ error });

    const phase = req.body.phase;
    const question = req.body.question || "No question provided";

    const answer = result?.results?.channels[0]?.alternatives[0]?.transcript;
    res.json({ transcript: answer });

    console.log(phase, question, filePath, answer);

    await db.collection("papers").updateOne(
      {}, // filter
      {
        $push: {
          [phase]: { question, answer }, // dynamic key
        },
      },
      { upsert: true }
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});
