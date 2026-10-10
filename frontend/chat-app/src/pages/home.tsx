import React, { useState } from "react";
import { Link } from "wouter";
import { useAuth } from "../contexts/AuthContext";
import { NovaBrand } from "@/components/ui/nova-brand";
import { useSEO } from "@/hooks/use-seo";
import "./home-landing.css";

export default function Home() {
  const { user } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // SEO configuration
  useSEO({
    title: "NOVA Business AI — An AI assistant that actually helps your business",
    description: "Connect your website, and NOVA answers customer questions using your own information. Then it can help with everyday tasks too, always with your permission.",
    canonicalPath: "/",
  });

  const authTarget = user ? "/projects" : "/sign-in";

  return (
    <div className="nl-page">
      {/* ── 1. Navigation ── */}
      <nav aria-label="Main Navigation">
        <div className="w">
          <Link href="/" className="logo" aria-label="NOVA Business AI Home">
            <NovaBrand variant="mark" height={28} theme="auto" />
            <span>NOVA</span>
          </Link>

          <div className="links">
            <a href="#how">How it works</a>
            <a href="#features">Features</a>
            <a href="#who">Who it's for</a>
            <a href="#faq">Questions</a>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Link
              href={authTarget}
              className="btn p"
              style={{ padding: "10px 18px" }}
              aria-label={user ? "Go to Dashboard" : "Get started with NOVA"}
            >
              {user ? "Dashboard" : "Get started"}
            </Link>

            {/* Mobile menu trigger */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="btn"
              style={{ padding: "8px 12px", display: "none" }}
              id="mobile-nav-toggle"
              aria-expanded={mobileMenuOpen}
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? "✕" : "☰"}
            </button>
          </div>
        </div>

        {/* Mobile dropdown drawer if opened */}
        {mobileMenuOpen && (
          <div
            style={{
              padding: "16px 22px",
              borderTop: "1px solid var(--line)",
              background: "var(--card)",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}
          >
            <a href="#how" onClick={() => setMobileMenuOpen(false)} style={{ color: "var(--tx)", textDecoration: "none" }}>
              How it works
            </a>
            <a href="#features" onClick={() => setMobileMenuOpen(false)} style={{ color: "var(--tx)", textDecoration: "none" }}>
              Features
            </a>
            <a href="#who" onClick={() => setMobileMenuOpen(false)} style={{ color: "var(--tx)", textDecoration: "none" }}>
              Who it's for
            </a>
            <a href="#faq" onClick={() => setMobileMenuOpen(false)} style={{ color: "var(--tx)", textDecoration: "none" }}>
              Questions
            </a>
            <Link
              href={authTarget}
              onClick={() => setMobileMenuOpen(false)}
              style={{ color: "var(--ac)", fontWeight: 600, textDecoration: "none" }}
            >
              {user ? "Go to Dashboard →" : "Sign In / Register →"}
            </Link>
          </div>
        )}
      </nav>

      {/* ── 2. Hero Section ── */}
      <header className="hero">
        <div className="w hg">
          <div>
            <span className="hand">Hi, meet NOVA 👋</span>
            <h1>
              An AI assistant that learns your business and <mark>gets real work done.</mark>
            </h1>
            <p className="lead">
              Connect your website, and NOVA answers customer questions using your own information. Then it can help with everyday tasks too, always with your permission.
            </p>
            <div className="row">
              <Link href={authTarget} className="btn p">
                {user ? "Go to Projects" : "Try NOVA free"}
              </Link>
              <a href="#how" className="btn">
                See how it works
              </a>
            </div>
            <p className="small">No technical skills needed. You stay in control.</p>
          </div>

          <div className="mock" role="region" aria-label="Product Conversation Preview">
            <div className="note">answers in seconds!</div>
            <div className="mh">
              <NovaBrand variant="mark" height={22} theme="auto" />
              <span>NOVA Assistant</span>
              <span className="online-status">● Online</span>
            </div>
            <div className="b us">Do you deliver to Coimbatore? How long does it take?</div>
            <div className="b ai">
              Yes! We deliver to Coimbatore in 1–2 days. Orders placed before 2 PM ship the same day. 📦
            </div>
            <div className="b us">Great, can you book a callback for tomorrow?</div>
            <div className="b ai">Sure. I've prepared a callback for tomorrow at 11 AM.</div>
            <span className="chip">✓ Waiting for your team's OK</span>
          </div>
        </div>
      </header>

      {/* ── 3. How It Works Section ── */}
      <section id="how" className="alt">
        <div className="w">
          <div className="head">
            <span className="hand">Simple as 1-2-3</span>
            <h2>Up and running in three easy steps</h2>
            <p>You don't need a developer. Set it up once, and NOVA keeps working for you.</p>
          </div>
          <div className="steps">
            <div className="st">
              <span className="n">1</span>
              <h3>Connect your website</h3>
              <p>Paste your website link. NOVA reads what's on it, like your products, prices, policies and FAQs.</p>
            </div>
            <div className="st">
              <span className="n">2</span>
              <h3>Add what you know</h3>
              <p>Upload extra details so NOVA knows your business as well as your best team member does.</p>
            </div>
            <div className="st">
              <span className="n">3</span>
              <h3>Go live</h3>
              <p>Put the chat on your site. Customers get helpful answers, and you decide what NOVA is allowed to do.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 4. Product Features Section ── */}
      <section id="features">
        <div className="w">
          <div className="head">
            <span className="hand">What's inside</span>
            <h2>Everything in one place, in plain words</h2>
            <p>No juggling lots of tools. Here's what NOVA gives you.</p>
          </div>
          <div className="grid">
            <div className="c">
              <span className="e" role="img" aria-label="Chat">💬</span>
              <h3>Chat with customers</h3>
              <p>Friendly AI chat that answers questions using your real business information, not guesses.</p>
            </div>
            <div className="c">
              <span className="e" role="img" aria-label="Globe">🌐</span>
              <h3>Understands your website</h3>
              <p>Connect your site and NOVA finds the useful information on it, so answers fit your business.</p>
            </div>
            <div className="c">
              <span className="e" role="img" aria-label="Books">📚</span>
              <h3>Keeps your knowledge organised</h3>
              <p>All your business info lives together, so the AI always finds the right detail fast.</p>
            </div>
            <div className="c">
              <span className="e" role="img" aria-label="Tasks">⚡</span>
              <h3>Helps with tasks</h3>
              <p>Go beyond answers. NOVA can help with set workflows, with permissions and safeguards you control.</p>
            </div>
            <div className="c">
              <span className="e" role="img" aria-label="Tools">🔌</span>
              <h3>Works with your tools</h3>
              <p>Connect supported services so more of your daily work happens in one place.</p>
            </div>
            <div className="c">
              <span className="e" role="img" aria-label="Projects">🗂️</span>
              <h3>One project per business</h3>
              <p>Keep each website, its knowledge and its settings neatly in its own workspace.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── 5. Business Use Cases Section ── */}
      <section id="who" className="alt">
        <div className="w">
          <div className="head">
            <span className="hand">Made for real businesses</span>
            <h2>How could NOVA help you?</h2>
            <p>Every business is different. Here are a few ways teams can use it.</p>
          </div>
          <div className="use">
            <div className="u">
              <b>🛍️ Online shops</b>
              <q>"Where is my order? Do you have this in size M?"</q>
              <span>NOVA answers common questions so your team can focus on selling.</span>
            </div>
            <div className="u">
              <b>🏥 Clinics and services</b>
              <q>"What are your timings? How do I book?"</q>
              <span>Patients and clients get instant answers, any time of day.</span>
            </div>
            <div className="u">
              <b>🎓 Schools and training</b>
              <q>"What courses do you offer and what are the fees?"</q>
              <span>Share course details once, and NOVA explains them clearly.</span>
            </div>
            <div className="u">
              <b>🏢 Agencies and companies</b>
              <q>"Can you tell me more about your services?"</q>
              <span>Turn website visitors into conversations, even after hours.</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── 6. Trust / Promise Section ── */}
      <section>
        <div className="w">
          <div className="head">
            <span className="hand">Our promise</span>
            <h2>Useful AI, with you in charge</h2>
            <p>We built NOVA around five simple ideas.</p>
          </div>
          <div className="why">
            <div>
              <b>Useful</b>
              Solves real business problems, not just chats.
            </div>
            <div>
              <b>Connected</b>
              Brings your website, knowledge and tools together.
            </div>
            <div>
              <b>Controlled</b>
              You decide who can access and do what.
            </div>
            <div>
              <b>Reliable</b>
              Built with testing and security in mind.
            </div>
            <div>
              <b>Flexible</b>
              Set it up your way, project by project.
            </div>
          </div>
        </div>
      </section>

      {/* ── 7. FAQ Section ── */}
      <section id="faq" className="alt">
        <div className="w faq">
          <div className="head">
            <span className="hand">Good to know</span>
            <h2>Common questions</h2>
          </div>
          <details>
            <summary>Do I need to be technical?</summary>
            <p>No. If you can share your website link and type your business details, you can set up NOVA. It's designed to be easy.</p>
          </details>
          <details>
            <summary>Will the AI make things up?</summary>
            <p>NOVA is built to answer using your own business information, so replies stay relevant to your website and knowledge.</p>
          </details>
          <details>
            <summary>Can NOVA do things, or only chat?</summary>
            <p>Both. Besides answering questions, NOVA can support controlled workflows with the permissions and safeguards you set.</p>
          </details>
          <details>
            <summary>Can I use it for more than one website?</summary>
            <p>Yes. Each website or business gets its own project, with separate knowledge and settings.</p>
          </details>
        </div>
      </section>

      {/* ── 8. Final Conversion CTA Section ── */}
      <section id="start" style={{ paddingBottom: 0 }}>
        <div className="w">
          <div className="fin">
            <span className="hand">Let's build smarter</span>
            <h2>Ready to make your business a little easier to run?</h2>
            <p>
              Your business has its own goals and ideas. NOVA helps turn them into practical, AI-powered help for you and your customers.
            </p>
            <Link href={authTarget} className="btn">
              {user ? "Go to Dashboard" : "Launch NOVA"}
            </Link>
          </div>
        </div>
      </section>

      {/* ── 9. Footer ── */}
      <footer>
        <div className="w">
          <div>NOVA Business AI · From Conversations to Business Actions</div>
          <div className="footer-links">
            <Link href={authTarget}>{user ? "My Projects" : "Sign In"}</Link>
            <Link href="/projects/demo">Interactive Demo</Link>
            <a href="#how">How it works</a>
            <a href="#features">Features</a>
            <a href="#who">Who it's for</a>
            <a href="#faq">Questions</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
