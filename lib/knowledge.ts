import { readFile } from 'node:fs/promises'
import path from 'node:path'

type Topic = {
  pattern: RegExp
  files: KnowledgeFile[]
}

// Literal paths let Next.js trace only the methodology files needed at runtime.
const fileReaders = {
  'SKILL.md': () => readFile(path.join(process.cwd(), 'SKILL.md'), 'utf8'),
  'router/intent-router.md': () => readFile(path.join(process.cwd(), 'router/intent-router.md'), 'utf8'),
  'references/pr-judgement.md': () => readFile(path.join(process.cwd(), 'references/pr-judgement.md'), 'utf8'),
  'references/reputation-monitoring.md': () => readFile(path.join(process.cwd(), 'references/reputation-monitoring.md'), 'utf8'),
  'references/measurement.md': () => readFile(path.join(process.cwd(), 'references/measurement.md'), 'utf8'),
  'references/social-media-intelligence.md': () => readFile(path.join(process.cwd(), 'references/social-media-intelligence.md'), 'utf8'),
  'references/communication-intelligence.md': () => readFile(path.join(process.cwd(), 'references/communication-intelligence.md'), 'utf8'),
  'references/communication-psychology.md': () => readFile(path.join(process.cwd(), 'references/communication-psychology.md'), 'utf8'),
  'references/ai-search-brand-visibility.md': () => readFile(path.join(process.cwd(), 'references/ai-search-brand-visibility.md'), 'utf8'),
  'commands/crisis-response.md': () => readFile(path.join(process.cwd(), 'commands/crisis-response.md'), 'utf8'),
  'commands/pr-plan.md': () => readFile(path.join(process.cwd(), 'commands/pr-plan.md'), 'utf8'),
  'commands/news-score.md': () => readFile(path.join(process.cwd(), 'commands/news-score.md'), 'utf8'),
  'commands/media-pitch.md': () => readFile(path.join(process.cwd(), 'commands/media-pitch.md'), 'utf8'),
  'commands/press-release.md': () => readFile(path.join(process.cwd(), 'commands/press-release.md'), 'utf8'),
  'commands/social-insight.md': () => readFile(path.join(process.cwd(), 'commands/social-insight.md'), 'utf8'),
  'commands/communication-coach.md': () => readFile(path.join(process.cwd(), 'commands/communication-coach.md'), 'utf8'),
  'commands/executive-brief.md': () => readFile(path.join(process.cwd(), 'commands/executive-brief.md'), 'utf8'),
  'workflows/crisis-management.md': () => readFile(path.join(process.cwd(), 'workflows/crisis-management.md'), 'utf8'),
  'workflows/launch-campaign.md': () => readFile(path.join(process.cwd(), 'workflows/launch-campaign.md'), 'utf8')
} as const

type KnowledgeFile = keyof typeof fileReaders
const coreFiles: KnowledgeFile[] = ['SKILL.md', 'router/intent-router.md', 'references/pr-judgement.md']

// Only repository-owned, allowlisted files are ever loaded into the model context.
const topics: Topic[] = [
  {
    pattern: /危机|舆情|公关事件|投诉|道歉|crisis|reputation/i,
    files: ['commands/crisis-response.md', 'workflows/crisis-management.md', 'references/reputation-monitoring.md']
  },
  {
    pattern: /传播方案|公关策略|品牌策略|campaign|上市|发布会|新品|strategy/i,
    files: ['commands/pr-plan.md', 'workflows/launch-campaign.md', 'references/measurement.md']
  },
  {
    pattern: /新闻价值|媒体|记者|稿件|新闻稿|pitch|press|news/i,
    files: ['commands/news-score.md', 'commands/media-pitch.md', 'commands/press-release.md']
  },
  {
    pattern: /社交|小红书|抖音|微博|声量|评论|social/i,
    files: ['commands/social-insight.md', 'references/social-media-intelligence.md']
  },
  {
    pattern: /汇报|沟通|表达|说服|领导|利益相关方|communication/i,
    files: ['commands/communication-coach.md', 'references/communication-intelligence.md', 'references/communication-psychology.md']
  },
  {
    pattern: /高管|CEO|采访|演讲|executive/i,
    files: ['commands/executive-brief.md']
  },
  {
    pattern: /AI 搜索|搜索可见性|品牌信息资产|GEO/i,
    files: ['references/ai-search-brand-visibility.md']
  }
]

export function selectKnowledgeFiles(question: string) {
  const matched = topics.filter((topic) => topic.pattern.test(question)).flatMap((topic) => topic.files)
  return [...new Set([...coreFiles, ...matched])].slice(0, 12)
}

export async function loadKnowledge(question: string) {
  const files = selectKnowledgeFiles(question)
  const excerpts = await Promise.all(files.map(async (file) => {
    const content = await fileReaders[file]()
    return `### ${file}\n${content}`
  }))
  return excerpts.join('\n\n')
}
