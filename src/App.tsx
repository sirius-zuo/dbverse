export function App() {
  return (
    <main className="app-shell">
      <aside className="app-sidebar">
        <h1>dbverse</h1>
        <p>Connection manager will appear here.</p>
      </aside>
      <section className="app-workspace">
        <h2>Welcome to dbverse</h2>
        <p>Open a SQLite, PostgreSQL, or LanceDB connection to start exploring.</p>
      </section>
    </main>
  );
}
