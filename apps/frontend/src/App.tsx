import { useState, useEffect } from "react";
import "./index.css";
import Welcome from "./Welcome";
import { InterviewPage } from "./InterviewPage";

export function App() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname);

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  const navigate = (path: string) => {
    window.history.pushState({}, "", path);
    setCurrentPath(path);
  };

  return (
    <>
      {currentPath.startsWith("/interview") ? (
        <InterviewPage onExit={() => navigate("/")} />
      ) : (
        <Welcome onStart={(id) => navigate(`/interview?id=${id}`)} />
      )}
    </>
  );
}

export default App;