import { useState, useEffect } from "react";
import "./index.css";
import Welcome from "./Welcome";
import { InterviewPage } from "./InterviewPage";

export function App() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  const [currentSearch, setCurrentSearch] = useState(window.location.search);

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
      setCurrentSearch(window.location.search);
    };
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  const navigate = (path: string) => {
    window.history.pushState({}, "", path);
    setCurrentPath(window.location.pathname);
    setCurrentSearch(window.location.search);
  };

  const handleStart = (interviewId: string, persona: string) => {
    navigate(`/interview?id=${interviewId}&persona=${persona}`);
  };

  return (
    <>
      {currentPath.startsWith("/interview") ? (
        <InterviewPage onExit={() => navigate("/")} />
      ) : (
        <Welcome onStart={handleStart} />
      )}
    </>
  );
}

export default App;