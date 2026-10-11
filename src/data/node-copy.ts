import type { DepthText } from './copy.ts'
import type { ServiceKey } from './portfolio.ts'

/**
 * What each schematic part says when a visitor opens it, at each depth, keyed by service and part id
 * (the ids in schematics.ts). Written from the résumé bullets and the spec's depth copy; no number or
 * claim here that is not in portfolio.ts or the spec.
 *
 * Kept in its own module because nothing needs it until a part is clicked: the Schematic dialog loads
 * it with `loadNodeCopy`, so ~16 KB of prose stays out of the initial JavaScript.
 */
export const NODE_COPY: Record<ServiceKey, Record<string, DepthText>> = {
  "retrieval": {
    "ingest": {
      "30s": "This is where documents come in. Everything after this works on short pieces of text, not whole files.",
      "engineer": "Corpora of up to 100K tokens enter here and are handed to the chunker.",
      "peer": "Entry point for the 100K-token corpora. The chunker takes it from here."
    },
    "chunk": {
      "30s": "Long documents are cut into overlapping pieces so a fact is never lost at the edge of a piece.",
      "engineer": "Adaptive 512-token sliding-window chunking: the windows slide across the text. It cut manual document analysis time by 70%.",
      "peer": "Sliding windows overlap, so a table row or a clause is less likely to be split across two chunks; this is the chunking behind the 70% cut in manual analysis time. This port uses 256-wordpiece windows with 64 overlap because its encoder only sees 256."
    },
    "pgvector": {
      "30s": "A database index that finds the pieces of text closest in meaning to a question, quickly.",
      "engineer": "PostgreSQL with pgvector, using HNSW indexing for the nearest-neighbour pass.",
      "peer": "HNSW over exact search so the nearest-neighbour pass can stay inside the p95 budget as the corpus grows."
    },
    "agents": {
      "30s": "Several small AI helpers split a question into parts and look each part up.",
      "engineer": "A multi-agent pipeline on LangChain and GPT-4 breaks a question into retrieval sub-goals.",
      "peer": "Agents split a question into retrieval sub-goals; each sub-goal queries pgvector (HNSW) and reranks by cosine before synthesis."
    },
    "rerank": {
      "30s": "The best matches are sorted again with a stricter test, so the most relevant piece comes first.",
      "engineer": "Cosine-similarity reranking tightens the nearest-neighbour results before synthesis.",
      "peer": "Cosine reranking sits between the HNSW pass and synthesis, ordering the candidates the index returned."
    },
    "citations": {
      "30s": "Every answer points back to the exact passage it came from, so you can check it.",
      "engineer": "Structured citation metadata keeps every answer grounded in its source chunk.",
      "peer": "Citation metadata travels through the pipeline as structure, not parsed back out of the answer, so every answer can be checked against its chunk."
    }
  },
  "vision": {
    "camera": {
      "30s": "Frames come in from a live camera.",
      "engineer": "Capture produces frames for the detector; in this port the camera is your phone or laptop.",
      "peer": "Capture is the producer: it hands frames to a bounded queue and never blocks on inference."
    },
    "queue": {
      "30s": "A short waiting line for frames. If the detector falls behind, the oldest frames are dropped so the picture stays current.",
      "engineer": "An asyncio producer–consumer queue between capture and inference reduced latency variance by 40%.",
      "peer": "A bounded buffer keeps the consumer fed without letting latency pile up; the asyncio queue is what cut latency variance by 40%. This port uses a drop-oldest ring buffer with a capacity of 4 to show the same idea."
    },
    "yolo": {
      "30s": "The AI model that finds objects in each frame and draws a box around them.",
      "engineer": "YOLOv8 fine-tuned on a 5K-image custom dataset: under 30 ms per frame at 94% mAP@0.5.",
      "peer": "In production a fine-tuned YOLOv8 ran at <30 ms. The port's detector is YOLOv8n int8 at 320 px in WebAssembly, which loads only when its model file is published on this site; the queue and the gauges are real either way, and your numbers are your device's numbers."
    },
    "websocket": {
      "30s": "A live connection that streams the results to the screen as they are produced.",
      "engineer": "Bounding-box telemetry is streamed over WebSockets.",
      "peer": "Telemetry leaves the process as WebSocket frames."
    },
    "react": {
      "30s": "A dashboard that turns detections into per-class counts, kept current at about thirty frames a second.",
      "engineer": "Per-class analytics rendered in React.js at a sustained 30 FPS.",
      "peer": "Per-class analytics in React.js at a sustained 30 FPS. In this port your device's own FPS is shown beside that number, never instead of it."
    },
    "prometheus": {
      "30s": "A monitoring system that keeps score and raises an alarm if the service gets slow.",
      "engineer": "Inference p95, detection rate and queue depth are instrumented in Prometheus with SLO alerts.",
      "peer": "Three SLOs (inference p95, detection rate, queue depth) alert in Prometheus, so a regression shows up as a page, not a feeling."
    }
  },
  "policy": {
    "jwt": {
      "30s": "A signed pass that says who you are and which company you belong to.",
      "engineer": "JWT authentication; the token carries the tenant claim.",
      "peer": "Tenant isolation is enforced twice; the first layer is the tenant claim carried in the JWT."
    },
    "api": {
      "30s": "The server that receives each request and asks the policy rules whether it is allowed.",
      "engineer": "A Node.js API behind JWT authentication, with role-based access control.",
      "peer": "Connection-pool reuse was tuned to keep latency stable during burst traffic."
    },
    "evaluator": {
      "30s": "The rulebook. For every request it says allow or deny, and writes down why.",
      "engineer": "Role-based access control: role, resource and action decide each request, and every evaluation produces an audit line.",
      "peer": "The port's evaluator is pure and deterministic: the same inputs always give the same decision and the same audit line."
    },
    "rls": {
      "30s": "A second lock inside the database: rows that belong to another company are refused even if the application code makes a mistake.",
      "engineer": "Row-level PostgreSQL policies refuse rows from any other tenant.",
      "peer": "Row-level policies refuse rows from any other tenant even if application code gets it wrong. They add a predicate to every query, which the tenant-scoped indexes keep cheap."
    },
    "audit": {
      "30s": "A written record of every decision, kept per company.",
      "engineer": "Per-tenant audit logging.",
      "peer": "Every evaluation writes an audit line keyed by tenant."
    },
    "indexes": {
      "30s": "Database indexes organised by company, so each query only looks at one company's data.",
      "engineer": "Composite indexes that lead with tenant_id. With the N+1 patterns removed, they took query latency from 340 ms to 120 ms.",
      "peer": "Composite indexes that lead with tenant_id keep the planner inside one tenant's slice; collapsing N+1 query fans into joins did the rest of the 340→120 ms."
    }
  },
  "review": {
    "diff": {
      "30s": "A pull request is a proposed code change. The diff is the list of lines it changes.",
      "engineer": "Every pull request diff is evaluated.",
      "peer": "The diff is the unit of work: findings attach to lines of the change, so they can be posted inline."
    },
    "actions": {
      "30s": "The automation that starts the review by itself every time someone opens a pull request.",
      "engineer": "A GitHub Actions workflow evaluates every pull request diff and posts inline feedback.",
      "peer": "The workflow is the trigger and the poster: it runs the Docker stage on each pull request and posts the merged findings inline."
    },
    "docker": {
      "30s": "A sealed box the checks run in, so every review runs the same way.",
      "engineer": "ESLint, Semgrep and the structured LLM review run inside a Dockerized stage.",
      "peer": "Docker makes the stage reproducible, and the whole stage runs in under three minutes."
    },
    "eslint": {
      "30s": "A tool that spots style problems and common mistakes in JavaScript.",
      "engineer": "ESLint output is one of the three inputs merged into the tiered findings.",
      "peer": "ESLint is deterministic: its findings can be merged with the structured findings from the other tools instead of being reported twice."
    },
    "semgrep": {
      "30s": "A tool that searches code for known risky patterns, such as security mistakes.",
      "engineer": "Semgrep covers pattern-based findings alongside ESLint and the LLM stage.",
      "peer": "Semgrep's deterministic findings merge with ESLint's and the LLM's into one tiered list. In this port, Semgrep-style pattern rules run in your browser instead."
    },
    "llm": {
      "30s": "An AI reviewer reads the change and reports what it finds in a fixed, machine-readable format.",
      "engineer": "Structured LLM review, combined with ESLint and Semgrep.",
      "peer": "The LLM stage emits structured findings, not prose, so they merge with ESLint and Semgrep output into one tiered list. This port has no LLM stage."
    },
    "tier": {
      "30s": "Findings are sorted into five levels of seriousness, from critical down to informational.",
      "engineer": "Findings are classified across OWASP Top-10, logic bugs, performance, style and maintainability into five severity tiers.",
      "peer": "Five severity tiers separate what is urgent from what is advisory."
    },
    "comments": {
      "30s": "The findings appear as comments right next to the lines they are about.",
      "engineer": "The pipeline posts inline feedback on the pull request.",
      "peer": "One set of inline comments for all three sources; 80% of routine review overhead across a 12-engineer repository was automated."
    }
  }
}
