import Link from 'next/link'

const expertise = [
  { number: '01', title: '传播策略', detail: '从业务事实出发，梳理受众、定位、核心信息与传播节奏。' },
  { number: '02', title: '媒体与内容', detail: '判断新闻价值，形成媒体角度、采访准备与内容提纲。' },
  { number: '03', title: '声誉与危机', detail: '先核实事实和影响，再制定行动、回应和持续监测方案。' },
]

export default function HomePage() {
  return (
    <main className="landing">
      <header className="site-header shell">
        <Link className="brand-mark" href="/" aria-label="Brand PR Agent 首页">
          <span className="brand-glyph" aria-hidden="true">B<span>.</span></span>
          <span>Brand PR Agent</span>
        </Link>
        <nav className="site-nav" aria-label="主导航">
          <a href="#approach">工作方式</a>
          <a href="#expertise">咨询能力</a>
          <Link href="/login">登录</Link>
          <Link href="/signup" className="button button-small button-dark">开始咨询 <span aria-hidden="true">↗</span></Link>
        </nav>
      </header>

      <section className="hero shell">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-dot" /> 为品牌决策而设计的 AI 顾问</div>
          <h1>让每一次传播，<br /><em>都有判断依据。</em></h1>
          <p>向 Brand PR Agent 提问，获得基于成熟公关方法论的策略建议。从品牌定位、媒体沟通到危机应对，把问题讲清楚，再找到下一步。</p>
          <div className="hero-actions">
            <Link href="/signup" className="button button-accent">开启一次咨询 <span aria-hidden="true">↗</span></Link>
            <a href="#approach" className="text-link">了解工作方式 <span aria-hidden="true">↓</span></a>
          </div>
          <div className="hero-footnote"><span className="small-star" aria-hidden="true">✳</span> 面向品牌、公关与传播团队</div>
        </div>

        <div className="hero-visual" aria-label="公关咨询问答示例">
          <div className="visual-grid" aria-hidden="true" />
          <div className="visual-topline"><span>STRATEGY / 001</span><span>清晰 · 审慎 · 可执行</span></div>
          <div className="sample-question"><span className="sample-label">你的问题</span><p>新品发布只有两周，如何找到真正值得媒体报道的角度？</p></div>
          <div className="sample-answer">
            <div className="sample-answer-heading"><span className="avatar-monogram">B</span><span>顾问的思考路径</span></div>
            <ol>
              <li><strong>先确认事实</strong><span>产品创新、用户变化和可验证证据。</span></li>
              <li><strong>再判断价值</strong><span>为什么现在值得公众与媒体关注。</span></li>
              <li><strong>形成角度</strong><span>将业务事实转化为有意义的报道主张。</span></li>
            </ol>
          </div>
          <div className="visual-caption">A clearer way to think about PR.</div>
        </div>
      </section>

      <section id="approach" className="approach-band">
        <div className="shell approach-layout">
          <div><span className="section-kicker">THE METHOD</span><h2>有方法的建议，<br />才能真正落地。</h2></div>
          <div className="approach-copy"><p>Brand PR Agent 继承原有框架中的公关工作流：理解业务事实、判断新闻价值、设计传播策略、组织内容与媒体行动，并持续关注声誉和效果。</p><div className="method-chain"><span>事实</span><b>→</b><span>判断</span><b>→</b><span>策略</span><b>→</b><span>行动</span></div></div>
        </div>
      </section>

      <section id="expertise" className="expertise shell">
        <div className="section-heading"><div><span className="section-kicker">WHERE WE HELP</span><h2>从第一个问题，到下一步行动。</h2></div><p>适合需要快速梳理局面、验证想法或准备沟通方案的团队。</p></div>
        <div className="expertise-grid">{expertise.map((item) => <article className="expertise-card" key={item.number}><span>{item.number}</span><h3>{item.title}</h3><p>{item.detail}</p><span className="card-arrow" aria-hidden="true">↗</span></article>)}</div>
      </section>

      <section className="closing shell"><div><span className="section-kicker">START WITH A QUESTION</span><h2>你的下一个公关难题，<br />从这里开始梳理。</h2></div><Link href="/signup" className="button button-light">创建账号，开始咨询 <span aria-hidden="true">↗</span></Link></section>
      <footer className="site-footer shell"><span>© {new Date().getFullYear()} Brand PR Agent</span><span>专业判断，来自可靠事实。</span></footer>
    </main>
  )
}
