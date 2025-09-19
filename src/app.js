import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import multer from "multer";

import { MongoClient, ObjectId } from "mongodb";
import OpenAI from "openai";
import { createClient } from "@deepgram/sdk";

dotenv.config();

export const app = express();

app.use(express.json());
app.use(cors());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

const uri = process.env.DB_URL;

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

const storage = multer.memoryStorage();

const upload = multer({ storage });

app.get("/", (req, res) => res.send("ACE IELTS Server is Running OK!"));

app.get("/exam/question", async (req, res) => {
  const answer = await db?.collection("questions").findOne({});
  res.send({ answer });
});

app.get("/evaluate-speaking", async (req, res) => {
  try {
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

app.get("/report", (req, res) => res.json(report));
app.listen(process.env.PORT, (req, res) => console.log("server ok"));

export default app;

const report = {
  part1: {
    "F&C": "7",
    LR: "7",
    GRA: "7",
    feedback:
      "The candidate demonstrates good fluency and coherence, providing clear and relevant answers to the questions. The lexical resource is adequate, with a variety of vocabulary used appropriately. Grammatical range and accuracy are generally strong, though there are minor errors. Overall, the candidate communicates effectively but could enhance their responses with more complex structures and varied vocabulary.",
    sentence_feedback: [
      {
        sentence:
          "My full name is Arif Hossain, but you can just call me Arif.",
        issue: "",
        suggestion: "",
      },
      {
        sentence:
          "I’m currently a university student majoring in computer science, and I also do some part-time tutoring.",
        issue: "",
        suggestion: "",
      },
      {
        sentence: "I’m from Dhaka, the capital city of Bangladesh.",
        issue: "",
        suggestion: "",
      },
      {
        sentence: "It’s a very lively place, though sometimes a bit crowded.",
        issue: "",
        suggestion: "",
      },
      {
        sentence:
          "In my free time, I enjoy reading novels, watching technology videos on YouTube, and occasionally playing football with friends.",
        issue: "",
        suggestion: "",
      },
      {
        sentence: "Yes, I do.",
        issue: "",
        suggestion: "",
      },
      {
        sentence: "Reading helps me relax and also broadens my knowledge.",
        issue: "",
        suggestion: "",
      },
      {
        sentence: "I especially enjoy books on history and self-improvement.",
        issue: "",
        suggestion: "",
      },
    ],
    vocabulary_improvements: [
      {
        word: "lively",
        suggestion: "vibrant",
      },
      {
        word: "crowded",
        suggestion: "congested",
      },
      {
        word: "enjoy",
        suggestion: "delight in",
      },
    ],
    idiom_suggestions: [
      {
        sentence: "I enjoy reading novels.",
        idiom: "I have a penchant for reading novels.",
        suggestion: "",
      },
    ],
    linking_words_tips: [
      {
        sentence: "It’s a very lively place, though sometimes a bit crowded.",
        tip: "Consider using 'although' instead of 'though' for a more formal tone.",
      },
    ],
    speaking_tips: [
      {
        sentence:
          "I’m currently a university student majoring in computer science, and I also do some part-time tutoring.",
        tip: "Try to pause slightly after 'computer science' to enhance clarity.",
      },
    ],
  },
  part2: {
    "F&C": "8",
    LR: "8",
    GRA: "7",
    feedback:
      "The candidate provides a well-structured and detailed response, demonstrating good fluency and coherence. The lexical resource is strong, with varied vocabulary and phrases. There are minor grammatical errors, but they do not impede understanding. The candidate effectively communicates their thoughts and feelings about the topic, making the response engaging.",
    sentence_feedback: [
      {
        sentence:
          "A place I would really like to visit in the future is Japan, particularly the city of Kyoto.",
        issue: "",
        suggestion: "",
      },
      {
        sentence:
          "Kyoto is famous for its traditional temples, beautiful gardens, and historical sites.",
        issue: "",
        suggestion: "",
      },
      {
        sentence:
          "I’ve always been fascinated by Japanese culture, especially the way they combine modern technology with centuries-old traditions.",
        issue: "",
        suggestion: "",
      },
      {
        sentence:
          "I would love to go there with one of my close friends, who also has a strong interest in Japanese culture.",
        issue: "",
        suggestion: "",
      },
      {
        sentence:
          "If I got the chance, I would visit the ancient shrines, try authentic Japanese food like ramen and sushi, and maybe even take part in a tea ceremony.",
        issue: "",
        suggestion: "",
      },
      {
        sentence:
          "After visiting, I think I would feel very inspired and enriched, because it would be both an educational and memorable experience.",
        issue: "",
        suggestion: "",
      },
    ],
    vocabulary_improvements: [
      {
        word: "fascinated",
        suggestion: "captivated",
      },
      {
        word: "authentic",
        suggestion: "genuine",
      },
      {
        word: "enriched",
        suggestion: "enlightened",
      },
    ],
    idiom_suggestions: [
      {
        sentence: "I would love to go there with one of my close friends.",
        idiom: "I would love to go there with a buddy of mine.",
        suggestion: "",
      },
    ],
    linking_words_tips: [
      {
        sentence:
          "If I got the chance, I would visit the ancient shrines, try authentic Japanese food like ramen and sushi, and maybe even take part in a tea ceremony.",
        tip: "Consider using 'in addition' before 'try authentic Japanese food' for better flow.",
      },
    ],
    speaking_tips: [
      {
        sentence:
          "After visiting, I think I would feel very inspired and enriched.",
        tip: "Use intonation to emphasize 'inspired' and 'enriched' for a more engaging delivery.",
      },
    ],
  },
  part3: {
    "F&C": "8",
    LR: "8",
    GRA: "7",
    feedback:
      "The candidate shows strong fluency and coherence in their responses, articulating thoughts clearly and logically. The lexical resource is varied and appropriate, enhancing the quality of the answers. There are minor grammatical inaccuracies, but they do not detract from the overall clarity. The candidate effectively engages with the questions, providing insightful answers.",
    sentence_feedback: [
      {
        sentence:
          "People enjoy traveling to new places because it gives them a chance to explore different cultures, try new foods, and escape from their daily routines.",
        issue: "",
        suggestion: "",
      },
      {
        sentence: "It also helps them create unforgettable memories.",
        issue: "",
        suggestion: "",
      },
      {
        sentence: "Yes, definitely.",
        issue: "",
        suggestion: "",
      },
      {
        sentence:
          "Experiencing a culture first-hand is much more effective than reading about it.",
        issue: "",
        suggestion: "",
      },
      {
        sentence:
          "For example, when you live among local people, you understand their traditions, lifestyle, and values much better.",
        issue: "",
        suggestion: "",
      },
      {
        sentence:
          "Tourism has changed a lot due to technology and globalization.",
        issue: "",
        suggestion: "",
      },
      {
        sentence:
          "In the past, people traveled less frequently, but now it’s easier and cheaper to book flights, hotels, and plan trips online.",
        issue: "",
        suggestion: "",
      },
      {
        sentence:
          "Also, social media has influenced tourism, because people often travel to places they see online.",
        issue: "",
        suggestion: "",
      },
      {
        sentence: "Tourism can harm the environment if it’s not managed well.",
        issue: "",
        suggestion: "",
      },
      {
        sentence:
          "For example, too many tourists can damage natural sites, cause pollution, and increase waste.",
        issue: "",
        suggestion: "",
      },
      {
        sentence: "However, sustainable tourism can minimize these effects.",
        issue: "",
        suggestion: "",
      },
      {
        sentence:
          "I think people will travel more in the future because of rising incomes and easier access to transportation.",
        issue: "",
        suggestion: "",
      },
      {
        sentence:
          "At the same time, people are becoming more aware of eco-friendly travel, so the way they travel might change.",
        issue: "",
        suggestion: "",
      },
    ],
    vocabulary_improvements: [
      {
        word: "unforgettable",
        suggestion: "indelible",
      },
      {
        word: "frequently",
        suggestion: "regularly",
      },
      {
        word: "influenced",
        suggestion: "shaped",
      },
    ],
    idiom_suggestions: [
      {
        sentence: "People enjoy traveling to new places.",
        idiom: "People have a thirst for adventure.",
        suggestion: "",
      },
    ],
    linking_words_tips: [
      {
        sentence:
          "Tourism has changed a lot due to technology and globalization.",
        tip: "Consider adding 'for instance' before 'due to technology' to provide an example.",
      },
    ],
    speaking_tips: [
      {
        sentence:
          "I think people will travel more in the future because of rising incomes and easier access to transportation.",
        tip: "Use a slight pause after 'future' to emphasize the point.",
      },
    ],
  },
  overall:
    "The candidate demonstrates a solid command of English with good fluency, coherence, and a varied vocabulary. Minor grammatical errors are present but do not hinder communication. To improve further, the candidate should focus on using more complex sentence structures and enhancing their vocabulary with richer alternatives.",
};
