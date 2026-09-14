import { Link, Route, Routes } from "react-router-dom";
import { Home } from "./routes/Home";
import { Interview } from "./routes/Interview";
import { NewEntry } from "./routes/NewEntry";
import { Dictionary } from "./routes/Dictionary";
import { EntryDetail } from "./routes/EntryDetail";
import { EmptyState } from "./components/states/EmptyState";

// Mobile-first shell: a slim header and a single centered content column.
export function App() {
  return (
    <div className="app">
      <header className="app__header">
        <div className="app__header-inner">
          <Link to="/" className="app__brand">
            <span aria-hidden="true">📖</span>
            Grandma's Dictionary
          </Link>
        </div>
      </header>
      <main className="app__main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/interview" element={<Interview />} />
          <Route path="/new" element={<NewEntry />} />
          <Route path="/dictionary" element={<Dictionary />} />
          <Route path="/entry/:id" element={<EntryDetail />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </div>
  );
}

function NotFound() {
  return (
    <EmptyState
      icon="📖"
      title="This page is not here"
      body="Go back to the start to record or open your dictionary."
      action={
        <Link to="/" className="btn btn--primary">
          Go to the start
        </Link>
      }
    />
  );
}
