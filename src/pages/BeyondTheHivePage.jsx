import { useEffect, useState } from 'react';
import { beyondTheHiveStories, storyUrl } from '../data/beyondTheHiveStories';
import './BeyondTheHivePage.css';

const SITE = 'https://nectar-fusions.com';

function setMeta(kind, key, value) {
  let element = document.head.querySelector('meta[' + kind + '="' + key + '"]');
  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(kind, key);
    document.head.appendChild(element);
  }
  element.setAttribute('content', value);
}

function PageHead({ story }) {
  useEffect(() => {
    const title = story
      ? story.title + ' | Beyond the Hive | NectarFusions'
      : 'Beyond the Hive | Stories from NectarFusions';
    const description = story
      ? story.excerpt
      : 'Real stories from NectarFusions about bees, life, fear, growth, and the things that make us stop and think.';
    const url = SITE + (story ? storyUrl(story.slug) : '/stories');
    document.title = title;
    setMeta('name', 'description', description);
    setMeta('property', 'og:title', title);
    setMeta('property', 'og:description', description);
    setMeta('property', 'og:url', url);
    setMeta('property', 'og:type', story ? 'article' : 'website');
    setMeta('name', 'twitter:title', title);
    setMeta('name', 'twitter:description', description);
    let canonical = document.head.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = url;
    const schemaId = 'nf-beyond-hive-schema';
    document.getElementById(schemaId)?.remove();
    const schema = document.createElement('script');
    schema.id = schemaId;
    schema.type = 'application/ld+json';
    schema.textContent = JSON.stringify(story ? {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: story.title,
      description: story.excerpt,
      datePublished: story.isoDate,
      author: { '@type': 'Person', name: 'Megan Partlo' },
      publisher: { '@type': 'Organization', name: 'NectarFusions', logo: { '@type': 'ImageObject', url: SITE + '/logo.png' } },
      mainEntityOfPage: url
    } : {
      '@context': 'https://schema.org',
      '@type': 'Blog',
      name: 'Beyond the Hive',
      description,
      url
    });
    document.head.appendChild(schema);
    return () => schema.remove();
  }, [story]);
  return null;
}

function SignupForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState('');
  const [state, setState] = useState('idle');
  const [message, setMessage] = useState('');

  async function subscribe(event) {
    event.preventDefault();
    if (!consent || state === 'sending') return;
    setState('sending');
    setMessage('');
    try {
      const response = await fetch('/.netlify/functions/newsletter-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, consent, website })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) {
        throw new Error(result.error || 'We could not complete your signup. Please try again.');
      }
      setState('success');
      setName('');
      setEmail('');
      setConsent(false);
      setMessage(result.message || 'Thanks for joining Beyond the Hive. 🐝');
    } catch (error) {
      setState('error');
      setMessage(error.message || 'We could not complete your signup. Please try again.');
    }
  }

  return (
    <section id="subscribe" className="bth-signup" aria-labelledby="bth-signup-title">
      <p className="bth-eyebrow">A little more from the hive</p>
      <h2 id="bth-signup-title">Come along for the stories.</h2>
      <p>Bees, life, the thoughts that catch me off guard, and whatever I learn along the way. Straight to your inbox when there's something worth sharing.</p>
      <form onSubmit={subscribe} className="bth-signup-form">
        <div className="bth-fields">
          <label>
            <span>Your name</span>
            <input type="text" name="name" autoComplete="name" maxLength={150} required placeholder="First name is perfect" value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            <span>Email address</span>
            <input type="email" name="email" autoComplete="email" maxLength={254} required placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
        </div>
        <div className="bth-honeypot" aria-hidden="true">
          <label>Website<input type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} /></label>
        </div>
        <label className="bth-consent">
          <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} required />
          <span>Yes, I'd like Beyond the Hive stories and occasional NectarFusions updates by email. I can unsubscribe anytime.</span>
        </label>
        <button className="bth-button" type="submit" disabled={state === 'sending'}>{state === 'sending' ? 'Joining...' : 'Count me in 🐝'}</button>
        {message && <p className={state === 'error' ? 'bth-status bth-error' : 'bth-status bth-success'} role="status">{message}</p>}
      </form>
      <p className="bth-small">Just your name and email. No account, no password, no daily sales pitches.</p>
    </section>
  );
}

function SiteHeader() {
  return (
    <header className="bth-header">
      <div className="bth-container bth-header-inner">
        <a className="bth-brand" href="/" aria-label="NectarFusions home">
          <img src="/logo.png" alt="" width="46" height="46" />
          <span><strong>NectarFusions</strong><small>Nature's Happiness | Honey Infused</small></span>
        </a>
        <nav aria-label="Main navigation" className="bth-nav">
          <a href="/">Shop Honey</a>
          <a href="/stories" aria-current="page">Stories</a>
          <a href="/honey-club">Honey Club</a>
          <a href="/about">About</a>
        </nav>
      </div>
    </header>
  );
}

function StoryIndex() {
  return (
    <>
      <section className="bth-intro bth-container">
        <p className="bth-eyebrow">NectarFusions presents</p>
        <h1>Beyond <em>the Hive.</em></h1>
        <p className="bth-lead">I love my bees. But sometimes the most interesting part of being around them is what they end up teaching me about everything else.</p>
        <p>Thoughts on life, emotional awareness, growing through the unexpected, and the occasional bee doing something ridiculous.</p>
      </section>
      <main className="bth-container bth-index-grid">
        <section aria-labelledby="bth-latest-title" className="bth-latest">
          <div className="bth-section-label" id="bth-latest-title">The latest story</div>
          {beyondTheHiveStories.map((story) => (
            <article className="bth-story-card" key={story.slug}>
              <div className="bth-story-symbol" aria-hidden="true">🐝</div>
              <div className="bth-story-card-inner">
                <div className="bth-meta">{story.date} <span aria-hidden="true">·</span> {story.readingTime}</div>
                <h2><a href={storyUrl(story.slug)}>{story.title}</a></h2>
                <p>{story.excerpt}</p>
                <a className="bth-text-link" href={storyUrl(story.slug)}>Read the story <span aria-hidden="true">→</span></a>
              </div>
            </article>
          ))}
        </section>
        <SignupForm />
      </main>
    </>
  );
}

function StoryArticle({ story }) {
  return (
    <main className="bth-container bth-article-layout">
      <a href="/stories" className="bth-back">← All stories</a>
      <article className="bth-article">
        <div className="bth-meta">{story.category} <span aria-hidden="true">·</span> {story.date} <span aria-hidden="true">·</span> {story.readingTime}</div>
        <h1>{story.title}</h1>
        <p className="bth-article-byline">By Megan, founder of NectarFusions</p>
        <div className="bth-article-rule" />
        <div className="bth-article-body">
          {story.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
        </div>
        <div className="bth-article-end">Thanks for reading. 💛</div>
      </article>
      <SignupForm />
    </main>
  );
}

export default function BeyondTheHivePage() {
  useEffect(() => {
    if (window.location.hash === '#subscribe') {
      window.requestAnimationFrame(() => document.getElementById('subscribe')?.scrollIntoView({ block: 'start' }));
    }
  }, []);
  const path = window.location.pathname.replace(/\/+$/, '') || '/stories';
  const slug = path === '/stories' ? null : path.slice('/stories/'.length);
  const story = slug ? beyondTheHiveStories.find((item) => item.slug === slug) : null;
  const missing = Boolean(slug && !story);
  return (
    <div className="bth-page">
      <PageHead story={story} />
      <SiteHeader />
      {missing ? (
        <main className="bth-container bth-notfound">
          <p className="bth-eyebrow">This story wandered off</p>
          <h1>We couldn't find that one.</h1>
          <a className="bth-text-link" href="/stories">Explore the stories →</a>
        </main>
      ) : story ? <StoryArticle story={story} /> : <StoryIndex />}
      <footer className="bth-footer"><div className="bth-container"><span>© NectarFusions · Made with a little honey and a lot of curiosity.</span><span><a href="/">Shop</a> <a href="/stories">Stories</a> <a href="https://www.instagram.com/nectarfusions_honey/" target="_blank" rel="noopener noreferrer">Instagram</a></span></div></footer>
    </div>
  );
}
