import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import multer from "multer";

import { MongoClient } from "mongodb";
import OpenAI from "openai";
import { createClient } from "@deepgram/sdk";

dotenv.config();

export const app = express();

app.use(express.json());
app.use(cors());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

const uri = process.env.DB_URL;

let cachedClient = null;
let cachedDb = null;

async function connectDB() {
  if (cachedDb) return cachedDb;

  if (!cachedClient) {
    cachedClient = new MongoClient(uri);
    await cachedClient.connect();
    console.log("✅ Connected to MongoDB");
  }

  cachedDb = cachedClient.db("ace_ielts");
  return cachedDb;
}

const storage = multer.memoryStorage();

const upload = multer({ storage });

app.get("/", (req, res) => res.send("ACE IELTS Server is Running OK!"));

app.get("/exam/question", async (req, res) => {
  try {
    const db = await connectDB();
    const question = await db.collection("questions").findOne();

    if (!question) {
      return res.status(404).json({ message: "No question found" });
    }

    res.json({ question });
  } catch (err) {
    console.error("Error fetching question:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});
app.get("/evaluate-speaking", async (req, res) => {
  try {
    const db = await connectDB();
    const candidate = await db
      .collection("papers")
      .findOne({}, { projection: { _id: 0 } });

    console.log(candidate);
    if (!candidate) {
      return res.status(400).json({ error: "Candidate data missing" });
    }

    // Construct the system prompt
    const systemPrompt = `
  You are an IELTS examiner and English tutor. Evaluate a candidate's IELTS speaking answers in three parts: part1, part2, and part3. Do NOT consider pronunciation.

  Instructions:

  1. For each part:
     - Provide band scores for:
       - Fluency & Coherence (F&C)
       - Lexical Resource (LR)
       - Grammatical Range & Accuracy (GRA)
     - Provide a general feedback paragraph summarizing strengths and weaknesses.

  2. Provide **sentence-level feedback**:
     - Break each answer into sentences.
     - For each sentence, identify:
       - Grammar mistakes
       - Word choice or vocabulary issues
       - Sentence structure/coherence
     - Suggest a corrected/improved version of the sentence.

  3. Provide **vocabulary improvements / synonyms** for words or phrases that can be replaced with richer or more precise alternatives.

  4. Provide **idiom / natural phrasing suggestions** for sentences that could use idiomatic or advanced expressions.

  5. Provide **linking words / coherence tips** for sentences where transition words can improve flow.

  6. Provide **speaking tips** (optional) to improve fluency, natural speech, or pauses.

  7. Structure the output strictly in this JSON format:

  {
    "part1": {
      "F&C": "",
      "LR": "",
      "GRA": "",
      "feedback": "",
      "sentence_feedback": [ { "sentence": "", "issue": "", "suggestion": "" } ],
      "vocabulary_improvements": [ { "word": "", "suggestion": "" } ],
      "idiom_suggestions": [ { "sentence": "", "idiom": "", "suggestion": "" } ],
      "linking_words_tips": [ { "sentence": "", "tip": "" } ],
      "speaking_tips": [ { "sentence": "", "tip": "" } ]
    },
    "part2": {
      "F&C": "",
      "LR": "",
      "GRA": "",
      "feedback": "",
      "sentence_feedback": [ { "sentence": "", "issue": "", "suggestion": "" } ],
      "vocabulary_improvements": [ { "word": "", "suggestion": "" } ],
      "idiom_suggestions": [ { "sentence": "", "idiom": "", "suggestion": "" } ],
      "linking_words_tips": [ { "sentence": "", "tip": "" } ],
      "speaking_tips": [ { "sentence": "", "tip": "" } ]
    },
    "part3": {
      "F&C": "",
      "LR": "",
      "GRA": "",
      "feedback": "",
      "sentence_feedback": [ { "sentence": "", "issue": "", "suggestion": "" } ],
      "vocabulary_improvements": [ { "word": "", "suggestion": "" } ],
      "idiom_suggestions": [ { "sentence": "", "idiom": "", "suggestion": "" } ],
      "linking_words_tips": [ { "sentence": "", "tip": "" } ],
      "speaking_tips": [ { "sentence": "", "tip": "" } ]
    },
    "overall": ""
  }

  Make sure all candidate sentences are included in the sentence_feedback array and the JSON is valid.

  `;

    // Construct user message with answers
    const userPrompt = `
  Here is the candidate's IELTS speaking exam data, including questions and answers in JSON format:

  ${JSON.stringify(candidate)}
  `;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0,
    });

    // The assistant’s output
    const result = response.choices[0].message.content;

    // Parse JSON if the model returned valid JSON
    let parsed;
    try {
      parsed = JSON.parse(result);
    } catch (err) {
      parsed = { error: "Failed to parse model output", raw: result };
    }

    res.json(parsed);
    console.log(parsed);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/transcribe-file", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // Access file directly from memory
    const fileBuffer = req.file.buffer;

    // Send file buffer to Deepgram (or any other transcription API)
    const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
      fileBuffer,
      {
        model: "nova-3",
        smart_format: true,
      }
    );

    if (error) return res.status(500).json({ error });

    const phase = req.body.phase;
    const question = JSON.parse(req.body.question) || "No question provided";
    const n = req.body.q;

    const answer = result?.results?.channels[0]?.alternatives[0]?.transcript;

    // Send response to client
    res.json({ transcript: answer });

    console.log(phase, n, question, answer);
    const qField = `part${phase}.q${n}`;
    const aField = `part${phase}.a${n}`;
    // Save transcript to database
    const db = await connectDB();
    await db.collection("papers").updateOne(
      {}, // filter (you might want to customize this)
      {
        $set: {
          [qField]: question,
          [aField]: answer,
        },
      },
      { upsert: true }
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(process.env.PORT, (req, res) => console.log("server ok"));

export default app;
