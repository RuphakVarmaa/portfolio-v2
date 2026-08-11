export type Project = {
  id: string
  title: string
  shortTitle: string
  summary: string
  stack: string[]
  metrics: Array<{ value: string; label: string }>
  details: string[]
  art: 'rag' | 'vision' | 'rbac' | 'review'
}

export type Experience = {
  role: string
  organization: string
  period: string
  description: string
  proof?: string
}

export const projects: Project[] = [
  {
    id: 'agentic-rag',
    title: 'Agentic RAG Document Intelligence',
    shortTitle: 'Document intelligence',
    summary:
      'A multi-agent retrieval system for verifiable question answering across large document collections.',
    stack: ['Python', 'LangChain', 'FastAPI', 'PostgreSQL', 'pgvector', 'AWS EC2'],
    metrics: [
      { value: '87%', label: 'retrieval precision' },
      { value: '100K', label: 'token corpora' },
      { value: '<2s', label: 'p95 latency' },
    ],
    details: [
      'Engineered a multi-agent RAG pipeline using LangChain and GPT-4 for question answering over 100K-token corpora.',
      'Applied pgvector HNSW indexing, cosine-similarity reranking, and structured citation metadata for grounded answers.',
      'Deployed a horizontally scaled FastAPI service on AWS EC2 behind an ALB for more than 50 concurrent sessions.',
      'Reduced manual document analysis time by 70 percent with adaptive 512-token sliding-window chunking.',
    ],
    art: 'rag',
  },
  {
    id: 'vision-pipeline',
    title: 'Real-Time Vision Analytics',
    shortTitle: 'Vision at the edge',
    summary:
      'A low-latency detection pipeline that turns live frames into observable, streaming analytics.',
    stack: ['Python', 'YOLOv8', 'OpenCV', 'React.js', 'Prometheus', 'WebSockets'],
    metrics: [
      { value: '<30ms', label: 'inference' },
      { value: '94%', label: 'mAP@0.5' },
      { value: '30', label: 'sustained FPS' },
    ],
    details: [
      'Fine-tuned YOLOv8 on a 5K-image custom dataset and streamed bounding-box telemetry over WebSockets.',
      'Rendered per-class analytics in React.js at a sustained 30 frames per second.',
      'Designed an asyncio producer-consumer queue that reduced latency variance by 40 percent.',
      'Instrumented inference p95, detection rate, and queue depth with Prometheus SLO alerts.',
    ],
    art: 'vision',
  },
  {
    id: 'multi-tenant-rbac',
    title: 'Multi-Tenant RBAC Platform',
    shortTitle: 'Tenant-safe SaaS',
    summary:
      'A task platform designed around isolation, auditability, and predictable performance under burst traffic.',
    stack: ['React.js', 'Node.js', 'PostgreSQL', 'JWT', 'Azure App Service', 'Docker'],
    metrics: [
      { value: '200+', label: 'concurrent users' },
      { value: '120ms', label: 'query latency' },
      { value: '0', label: 'cross-tenant leaks' },
    ],
    details: [
      'Architected role-based access control, JWT authentication, row-level PostgreSQL policies, and per-tenant audit logging.',
      'Load-tested more than 200 concurrent users with zero cross-tenant leakage across 10K+ policy evaluations per session.',
      'Reduced query latency from 340ms to 120ms by removing N+1 patterns and adding tenant-scoped composite indexes.',
      'Tuned connection-pool reuse to keep latency stable during burst traffic.',
    ],
    art: 'rbac',
  },
  {
    id: 'code-review-agent',
    title: 'Automated Code Review Pipeline',
    shortTitle: 'Review intelligence',
    summary:
      'An LLM-assisted CI pipeline that turns every pull request into structured, actionable review feedback.',
    stack: ['Python', 'LLM APIs', 'GitHub Actions', 'Docker', 'ESLint', 'Semgrep'],
    metrics: [
      { value: '80%', label: 'routine review automated' },
      { value: '-45%', label: 'median PR cycle' },
      { value: '<3m', label: 'pipeline time' },
    ],
    details: [
      'Built a GitHub Actions workflow that evaluates every pull request diff and posts inline feedback.',
      'Classified OWASP Top-10 issues, logic bugs, performance concerns, style, and maintainability across five severity tiers.',
      'Combined structured LLM review with ESLint and Semgrep inside a Dockerized stage.',
      'Automated 80 percent of routine review overhead across a 12-engineer repository.',
    ],
    art: 'review',
  },
]

export const experience: Experience[] = [
  {
    role: 'AWS Student Builder Campus Leader',
    organization: 'Amazon Web Services',
    period: 'Jun 2026 - Jul 2026',
    description:
      'Selected to lead Builder Center adoption on campus. Designed structured onboarding across EC2, S3, and Lambda while collaborating with AWS program managers on cloud education.',
  },
  {
    role: 'Google Student Ambassador',
    organization: 'Google',
    period: 'Sep 2025 - Feb 2026',
    description:
      'Designed and delivered cloud computing and machine learning workshops. Reached more than 300 students through live, project-based demonstrations of Firebase, TensorFlow, and Google Cloud.',
    proof: '300+ students reached',
  },
  {
    role: 'Chief Development Officer, Co-Founder',
    organization: 'Neural Inverse',
    period: 'Sep 2022 - Sep 2024',
    description:
      'Architected an automated image-tagging pipeline with Azure Cognitive Services and Azure SQL. Led backend and system architecture decisions across client-facing products.',
    proof: '10,000+ records managed',
  },
]

export const skillGroups = [
  {
    label: 'Languages',
    items: ['Java', 'Python', 'C++', 'JavaScript', 'TypeScript', 'SQL'],
  },
  {
    label: 'Frameworks and libraries',
    items: ['React.js', 'Node.js', 'FastAPI', 'LangChain', 'OpenCV', 'REST APIs', 'WebSockets'],
  },
  {
    label: 'Cloud and DevOps',
    items: ['AWS EC2', 'AWS S3', 'AWS Lambda', 'AWS ALB', 'Microsoft Azure', 'Docker', 'GitHub Actions', 'CI/CD'],
  },
  {
    label: 'AI and ML',
    items: ['Machine Learning', 'Generative AI', 'Agentic AI', 'RAG Pipelines', 'LLM Applications', 'Computer Vision'],
  },
  {
    label: 'Data and tools',
    items: ['PostgreSQL', 'MySQL', 'Azure SQL', 'Redis', 'pgvector', 'Prometheus', 'Git', 'Postman', 'Linux'],
  },
]

export const profile = {
  name: 'Ruphak Varmaa S',
  shortName: 'Ruphak Varmaa',
  email: 'ruphakv@gmail.com',
  phone: '+91 7708358305',
  linkedin: 'https://linkedin.com/in/ruphakvarmaa',
  github: 'https://github.com/RuphakVarmaa',
  website: 'https://ruphak.me',
  degree: 'B.E. Computer Science and Engineering',
  institution: 'KPR Institute of Engineering and Technology, Coimbatore',
  educationPeriod: '2024 - 2028',
  cgpa: '8.5/10',
}

export const highlights = [
  { value: '400+', label: 'LeetCode problems solved' },
  { value: '1850', label: 'LeetCode rating' },
  { value: 'AZ-900', label: 'Microsoft Azure, 2024' },
  { value: 'DP-700', label: 'Microsoft Fabric, 2026' },
]
