import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

function App() {
  const [count, setCount] = useState(2);
  const [profile, setProfile] = useState<{ name: string; role: string }>();
  const shadowHost = useRef<HTMLDivElement>(null);
  const route = location.pathname.includes("next") ? "Next route" : "Home";

  useEffect(() => {
    void fetch("/api/profile")
      .then((response) => response.json())
      .then(setProfile);

    const host = shadowHost.current;
    if (host && !host.shadowRoot) {
      const root = host.attachShadow({ mode: "open" });
      root.innerHTML = `
        <style>
          :host { display:block; padding:12px; border:1px solid #d6d3cc; border-radius:8px; }
          strong { color:#137f73; }
        </style>
        <strong>Shadow DOM</strong>
        <span> captured as a declarative template</span>
      `;
    }
  }, []);

  return (
    <main className="page" data-route={route}>
      <header className="site-header">
        <a className="brand" href="/">PrprprWarp Fixture</a>
        <nav>
          <a href="/">Home</a>
          <a href="/next.html">Next</a>
        </nav>
      </header>
      <section className="hero">
        <div>
          <span className="eyebrow">{route}</span>
          <h1>Offline interaction, kept intact.</h1>
          <p>
            This fixture exercises React state, API fetches, CSS backgrounds,
            shadow roots, images, and route navigation.
          </p>
          <div className="actions">
            <button type="button" onClick={() => setCount((value) => value + 1)}>
              Counter {count}
            </button>
            <a className="secondary" href="/next.html">Open next route</a>
          </div>
        </div>
        <img src="/hero.svg" alt="Abstract warp preview" />
      </section>
      <section className="panels">
        <article>
          <h2>API state</h2>
          <p>{profile ? `${profile.name} / ${profile.role}` : "Loading profile..."}</p>
        </article>
        <article>
          <h2>Open shadow root</h2>
          <div ref={shadowHost} />
        </article>
      </section>
    </main>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Missing fixture root.");
createRoot(root).render(<App />);
