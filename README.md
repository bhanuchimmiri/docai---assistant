# DocAI — Ask Questions About Any Document

I got tired of scrolling through long PDFs trying to find one specific thing. So I built this.

You upload a document, ask it a question in plain English, and it tells you the answer — pulled directly from what's actually in the file. No hallucinations, no made-up answers. If it's not in the document, it says so.

---

## What it does

- Upload any PDF or text file
- Ask natural language questions about it
- Get answers grounded in the document content, with source references shown
- Works entirely in the browser — no backend server needed

---

## Why I built this

I was going through the **Generative AI for Everyone** course on DeepLearning.AI and kept hearing about RAG (Retrieval-Augmented Generation) as the go-to pattern for building reliable AI applications. The idea is simple: instead of trusting the LLM to "remember" things, you feed it only the relevant context it needs to answer a specific question. That way it can't make stuff up.

I wanted to actually implement that pattern from scratch rather than just read about it — so this is my take on it.

---

## How it works (the non-buzzword version)

When you upload a document, a few things happen:

**1. Chunking**
The document gets split into small overlapping segments (~600 characters each). This is important because LLMs have a context window limit — you can't just dump a 50-page PDF into a prompt.

**2. Retrieval**
When you ask a question, the app finds the chunks most likely to contain the answer. Right now it uses keyword overlap scoring (think: which chunks share the most words with your question). A production version would use vector embeddings for this, but keyword matching works surprisingly well for most documents.

**3. Prompting**
The top matching chunks get passed to Claude (via the Anthropic API) along with your question. The system prompt explicitly tells the model to answer only from the provided context and to say "I don't know" if the answer isn't there. This is the core of RAG — grounding the LLM response in real source material.

**4. Response**
The answer comes back with a source tag showing which document it pulled from, so you can verify it yourself.

---

## Tech stack

- **Frontend:** Vanilla HTML/CSS/JavaScript (no framework needed for this scope)
- **AI:** Claude Sonnet via Anthropic Messages API
- **PDF parsing:** PDF.js (Mozilla's open-source PDF renderer)
- **Architecture pattern:** Retrieval-Augmented Generation (RAG)

---

## Running it locally

Clone the repo and open `index.html` in a browser. That's it — there's no build step.

```bash
git clone https://github.com/yourusername/docai-assistant
cd docai-assistant
open index.html
```

You'll need an Anthropic API key. The app calls the API directly from the browser (fine for personal use / demos — for production you'd want a backend to keep the key secret).

---

## What I'd improve with more time

A few things I'd tackle if I were turning this into a real product:

- **Proper vector embeddings** — swap the keyword scoring for semantic search using something like OpenAI embeddings or a local model. This would handle synonyms and paraphrasing way better.
- **Conversation memory** — right now each question is independent. A proper chat history would let you ask follow-ups like "can you expand on that last point?"
- **Backend API layer** — move the Anthropic API calls to a Node/Spring Boot backend so the API key isn't exposed client-side.
- **Support more file types** — Word docs, CSVs, web pages via URL.
- **Chunk overlap** — currently chunks don't overlap, which can cut sentences in half at boundaries. Adding 10-15% overlap would improve retrieval accuracy.

---

## What I learned

The most interesting thing was seeing how much prompt design matters. My first version gave the model too much freedom and it would occasionally blend its own knowledge with the document context. Adding a strict system prompt ("answer ONLY from the provided context, nothing else") fixed that almost entirely.

Also — chunking strategy matters more than I expected. Chunks that are too small lose context, too large and you waste the context window on irrelevant content. 500-700 characters ended up being the sweet spot for the documents I tested.

---

## Certification

Built as a hands-on project after completing [Generative AI for Everyone](https://www.deeplearning.ai/courses/generative-ai-for-everyone/) by Andrew Ng on DeepLearning.AI.

---

## License

MIT — do whatever you want with it.
